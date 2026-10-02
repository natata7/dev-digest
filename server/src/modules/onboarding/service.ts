import type { FastifyBaseLogger } from 'fastify';
import {
  Onboarding,
  type OnboardingLlmReason,
  type OnboardingSection,
  type OnboardingReadingItem,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { withTimeout } from '../../platform/resilience.js';
import { RepoRepository } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { LLM_MAX_TOKENS, LLM_TIMEOUT_MS, OnboardingLlmOutput } from './constants.js';
import { collectCloneFacts } from './facts.js';
import {
  buildFacts,
  buildSkeleton,
  classifyLlmError,
  filterLinks,
  mergeLlmOutput,
  reasonForIndex,
  serializeFactsForPrompt,
  type Facts,
} from './helpers.js';
import { OnboardingRepository } from './repository.js';

const SECTION_ORDER = ['architecture', 'critical_paths', 'local_run', 'reading_order', 'first_tasks'];

interface LlmSuccess {
  sections: OnboardingSection[];
  reading_path: OnboardingReadingItem[];
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/**
 * Onboarding orchestration. GET reads the stored tour only; POST builds facts,
 * a deterministic skeleton, and (index full/partial only) makes exactly one LLM call.
 */
export class OnboardingService {
  private repos: RepoRepository;
  private store: OnboardingRepository;
  // ponytail: in-process lock — single API process; DB advisory lock if multi-instance.
  private inFlight = new Set<string>();

  constructor(private container: Container) {
    this.repos = new RepoRepository(container.db);
    this.store = new OnboardingRepository(container.db);
  }

  async get(workspaceId: string, repoId: string): Promise<Onboarding> {
    await this.requireRepo(workspaceId, repoId);
    const stored = await this.readStored(repoId);
    if (!stored) throw new AppError('no_tour', 'No onboarding tour generated yet', 404);
    return this.withOutdated(repoId, stored);
  }

  async generate(workspaceId: string, repoId: string, log: FastifyBaseLogger): Promise<Onboarding> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new AppError('repo_not_cloned', 'Repository is not cloned', 409);
    if (this.inFlight.has(repoId)) {
      throw new AppError('generation_in_progress', 'A tour is already being generated', 409);
    }
    this.inFlight.add(repoId);
    const started = Date.now();
    try {
      const { container } = this;
      const state = await container.repoIntel.getIndexState(repoId);
      const decision = reasonForIndex(container.config.repoIntelEnabled, state);
      const clone = await collectCloneFacts(repo.clonePath);

      let facts: Facts;
      if (decision.llm) {
        const [ranked, endpoints, chains] = await Promise.all([
          container.repoIntel.getRankedFiles(repoId),
          container.repoIntel.getEndpointFacts(repoId),
          container.repoIntel.getCriticalPaths(repoId),
        ]);
        facts = buildFacts(clone, { state, ranked, endpoints, chains });
      } else {
        facts = buildFacts(clone, null);
      }
      const skeleton = filterLinks(buildSkeleton(facts), facts.allowedPaths);
      const indexedSha = decision.indexStatus === 'none' ? null : state.lastIndexedSha || null;
      const base = {
        ranking_basis: facts.rankingBasis,
        coverage: facts.coverage,
        indexed_sha: indexedSha,
        outdated: false,
        regeneration_error: null,
      };
      const skeletonTour = (reason: Onboarding['reason']): Onboarding => ({
        ...base,
        sections: skeleton,
        reading_path: facts.readingPath,
        status: 'skeleton',
        reason,
        generated_at: new Date().toISOString(),
        model: null,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
      });

      let result: Onboarding;
      let dropped: string[] = [];
      let llmReason: OnboardingLlmReason | null = null;
      let regenerationError: OnboardingLlmReason | null = null;

      if (!decision.llm) {
        result = skeletonTour(decision.reason);
        await this.save(repoId, result);
      } else {
        const serialized = serializeFactsForPrompt(facts);
        dropped = serialized.dropped;
        const llm = await this.callLlm(workspaceId, facts, skeleton, serialized.text);
        if ('reason' in llm) {
          llmReason = llm.reason;
          const prev = await this.readStored(repoId);
          if (prev && prev.status !== 'skeleton') {
            regenerationError = llm.reason;
            result = prev; // stored tour stays byte-unchanged (AC-28)
          } else {
            result = skeletonTour(llm.reason);
            await this.save(repoId, result);
          }
        } else {
          const anyFacts = llm.sections.some((s) => s.source === 'facts');
          result = {
            ...base,
            sections: llm.sections,
            reading_path: llm.reading_path,
            status: anyFacts || decision.reason === 'index_partial' ? 'partial' : 'complete',
            reason: decision.reason,
            generated_at: new Date().toISOString(),
            model: llm.model,
            tokens_in: llm.tokensIn,
            tokens_out: llm.tokensOut,
            cost_usd: llm.costUsd,
          };
          await this.save(repoId, result);
        }
      }

      const out = await this.withOutdated(repoId, result);
      out.regeneration_error = regenerationError;
      const cov = out.coverage;
      log.info(
        {
          repoId,
          status: result.status,
          reason: llmReason ?? result.reason,
          indexStatus: cov.index_status,
          counts: {
            routes: cov.routes.shown,
            scripts: cov.scripts.shown,
            structure: cov.structure.shown,
            reading_path: cov.reading_path.shown,
            critical_paths: cov.critical_paths.shown,
          },
          truncated: {
            routes: cov.routes.truncated,
            scripts: cov.scripts.truncated,
            structure: cov.structure.truncated,
            reading_path: cov.reading_path.truncated,
          },
          walkTruncated: clone.walkTruncated,
          droppedCategories: dropped,
          tokensIn: result.tokens_in,
          tokensOut: result.tokens_out,
          durationMs: Date.now() - started,
        },
        'onboarding generated',
      );
      return out;
    } finally {
      this.inFlight.delete(repoId);
    }
  }

  /** The single LLM call; every failure is classified, never thrown. */
  private async callLlm(
    workspaceId: string,
    facts: Facts,
    skeleton: OnboardingSection[],
    factsText: string,
  ): Promise<LlmSuccess | { reason: OnboardingLlmReason }> {
    try {
      const choice = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
      const llm = await this.container.llm(choice.provider);
      const system = await renderPrompt('onboarding.system.md', {
        sections: SECTION_ORDER.map((k, i) => `${i + 1}. ${k}`).join('\n'),
        language: 'English',
      });
      const res = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: OnboardingLlmOutput,
          schemaName: 'onboarding_tour',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: factsText },
          ],
          maxTokens: LLM_MAX_TOKENS,
          timeoutMs: LLM_TIMEOUT_MS,
          maxRetries: 0,
        }),
        LLM_TIMEOUT_MS,
      );
      const merged = mergeLlmOutput(facts, skeleton, res.data);
      return {
        ...merged,
        model: res.model ?? choice.model,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd ?? null,
      };
    } catch (err) {
      return { reason: classifyLlmError(err) };
    }
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async readStored(repoId: string): Promise<Onboarding | null> {
    const row = await this.store.get(repoId);
    if (!row) return null;
    const parsed = Onboarding.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  private save(repoId: string, tour: Onboarding): Promise<void> {
    return this.store.upsert(repoId, tour, new Date(tour.generated_at));
  }

  /** `outdated` is derived on every response, never trusted from storage (D10). */
  private async withOutdated(repoId: string, tour: Onboarding): Promise<Onboarding> {
    const { container } = this;
    let current = '';
    if (container.config.repoIntelEnabled) {
      current = (await container.repoIntel.getIndexState(repoId)).lastIndexedSha ?? '';
    }
    return {
      ...tour,
      outdated: (tour.indexed_sha ?? '') !== current,
      regeneration_error: null,
    };
  }
}
