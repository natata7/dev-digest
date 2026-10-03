import {
  Intent,
  PrBrief,
  PrBriefDraft,
  type BlastRadius,
  type PrBrief as PrBriefT,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { classifyLlmError } from '../_shared/llm-errors.js';
import { BlastService } from '../blast/service.js';
import { approxTokens } from '../context/helpers.js';
import { effectiveContextPaths } from '../context/effective.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { LLM_MAX_RETRIES, LLM_MAX_TOKENS, LLM_TIMEOUT_MS } from './constants.js';
import {
  blastUsable,
  buildAllowlist,
  buildFactsMessage,
  groundDraft,
  missingInputs,
  orderSpecPaths,
  toDiffFacts,
} from './helpers.js';
import { BriefRepository } from './repository.js';

/** Minimal pino-compatible logger. */
export type Logger = { info: (obj: unknown, msg?: string) => void };

/** Best-effort loaders return a value or null — never throw. */
export async function loadIntent(container: Container, prId: string): Promise<Intent | null> {
  try {
    const rec = await container.reviewRepo.getIntent(prId);
    if (!rec) return null;
    const parsed = Intent.safeParse(rec); // A9: strips pr_id/provider/… extras
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function loadBlast(
  container: Container,
  workspaceId: string,
  prId: string,
  log: Logger,
): Promise<{ blast: BlastRadius; partial: boolean } | null> {
  try {
    const blast = await new BlastService(container).get(workspaceId, prId, {
      info: () => {},
      warn: () => {},
    });
    const { use, partial } = blastUsable(blast);
    return use ? { blast, partial } : null;
  } catch {
    log.info({ prId }, 'brief: blast unavailable');
    return null;
  }
}

/** D1/D2: docs attached to enabled agents (+ their linked skills, same filter as run-executor). */
export async function loadSpecs(
  container: Container,
  workspaceId: string,
  repoId: string,
): Promise<{ path: string; text: string }[]> {
  try {
    const agents = await container.agentsRepo.listEnabled(workspaceId);
    // ponytail: N+1 over enabled agents (a handful locally)
    const perAgent: string[][] = [];
    for (const a of agents) {
      const linked = await container.agentsRepo.linkedSkills(a.id);
      perAgent.push(
        effectiveContextPaths(
          a.contextPaths,
          linked.filter((l) => l.enabled).map((l) => l.skill.contextPaths),
        ),
      );
    }
    const ordered = orderSpecPaths(perAgent);
    if (ordered.length === 0) return [];
    const { docs } = await container.contextService.readDocs(workspaceId, repoId, ordered);
    // keep the ordered position
    return ordered.flatMap((p) => docs.filter((d) => d.path === p).map((d) => ({ path: d.path, text: d.text })));
  } catch {
    return [];
  }
}

export class BriefService {
  private store: BriefRepository;
  // ponytail: in-process join — single API process; DB advisory lock if multi-instance.
  private inFlight = new Map<string, Promise<PrBriefT>>();

  constructor(
    private container: Container,
    store?: BriefRepository,
  ) {
    this.store = store ?? new BriefRepository(container.db);
  }

  async get(workspaceId: string, prId: string): Promise<PrBriefT> {
    const pr = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const row = await this.store.get(prId);
    const parsed = row ? PrBrief.safeParse(row) : null;
    if (!parsed?.success) throw new AppError('no_brief', 'No brief generated yet', 404);
    return parsed.data;
  }

  async generate(workspaceId: string, prId: string, log: Logger): Promise<PrBriefT> {
    const pr = await this.container.reviewRepo.getPull(workspaceId, prId); // A4: scope first
    if (!pr) throw new NotFoundError('Pull request not found');
    const running = this.inFlight.get(prId);
    if (running) return running;
    const p = this.run(workspaceId, pr, log);
    this.inFlight.set(prId, p);
    try {
      return await p;
    } finally {
      this.inFlight.delete(prId);
    }
  }

  private async run(
    workspaceId: string,
    pr: NonNullable<Awaited<ReturnType<Container['reviewRepo']['getPull']>>>,
    log: Logger,
  ): Promise<PrBriefT> {
    const c = this.container;
    const started = Date.now();
    const files = await c.reviewRepo.getPrFiles(pr.id);
    if (files.length === 0) throw new AppError('empty_diff', 'This PR has no changed files — nothing to brief.', 422);

    const choice = await resolveFeatureModel(c, workspaceId, 'risk_brief');
    let llm;
    try {
      llm = await c.llm(choice.provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError(
          'provider_not_configured',
          'Risk Brief model provider is not configured — add its API key or pick another model in Settings → Models → Risk Brief',
          400,
        );
      }
      throw err;
    }

    const intent = await loadIntent(c, pr.id);
    const blastRes = await loadBlast(c, workspaceId, pr.id, log);
    const specs = await loadSpecs(c, workspaceId, pr.repoId);
    const diff = toDiffFacts(files);
    const description = pr.body ?? null;
    const missing = missingInputs({ intent, blast: blastRes?.blast ?? null, specDocs: specs.length, description });

    const system = await renderPrompt('brief.system.md', {});
    const facts = buildFactsMessage(
      {
        title: pr.title,
        description,
        intent,
        blast: blastRes?.blast ?? null,
        blastPartial: blastRes?.partial ?? false,
        diff,
        specs,
        missing,
      },
      approxTokens(system),
    );

    const base = { prId: pr.id, provider: choice.provider, model: choice.model, estInputTokens: facts.estTokens, truncated: facts.truncated, missing_inputs: missing };
    let res;
    try {
      res = await llm.completeStructured({
        model: choice.model,
        schema: PrBriefDraft,
        schemaName: 'pr_brief',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: facts.text },
        ],
        maxTokens: LLM_MAX_TOKENS,
        timeoutMs: LLM_TIMEOUT_MS,
        maxRetries: LLM_MAX_RETRIES,
      });
    } catch (err) {
      const reason = classifyLlmError(err);
      log.info({ ...base, durationMs: Date.now() - started, outcome: reason }, 'brief generated');
      throw reason === 'llm_invalid_output'
        ? new AppError('llm_invalid_output', 'The model returned an invalid brief — try again', 502)
        : new AppError('llm_failed', 'Brief generation failed — try again', 502);
    }

    const grounded = groundDraft(res.data, buildAllowlist(diff, blastRes?.blast ?? null));
    const brief: PrBriefT = {
      summary: grounded.summary,
      intent,
      blast: blastRes?.blast ?? null,
      risks: { risks: grounded.risks }, // A5
      review_focus: grounded.review_focus,
      head_sha: pr.headSha,
      generated_at: new Date().toISOString(),
      missing_inputs: missing,
      generation: {
        provider: choice.provider,
        model: res.model ?? choice.model,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
        cost_usd: res.costUsd ?? null,
        attempts: res.attempts,
      },
    };
    await this.store.upsert(pr.id, brief);
    log.info(
      {
        ...base,
        attempts: res.attempts,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd ?? null,
        durationMs: Date.now() - started,
        dropped: { risks: grounded.dropped.risks, fileRefs: grounded.dropped.fileRefs, focus: grounded.dropped.focus },
        snapped: grounded.dropped.snapped,
        outcome: 'ok',
      },
      'brief generated',
    );
    return brief;
  }
}
