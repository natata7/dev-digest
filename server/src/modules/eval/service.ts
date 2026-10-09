import type {
  EvalAgentDashboard,
  EvalAgentRun,
  EvalCaseInput,
  EvalCaseRecord,
  EvalCaseFromFindingResult,
  EvalCompare,
  EvalOverview,
  Provider,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { enabledSkillBodies } from '../agents/helpers.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { loadDiff } from '../reviews/diff-loader.js';
import {
  CASE_CONCURRENCY,
  CASE_TIMEOUT_MS,
  FRAGMENT_CONTEXT_LINES,
  MAX_CASES_PER_AGENT,
  MAX_FRAGMENT_BYTES,
  RECENT_RUNS_LIMIT,
  RUNS_LIMIT,
  SPARK_POINTS,
} from './constants.js';
import {
  caseName,
  cutFragment,
  expectationFor,
  findDuplicate,
  kindOfExpected,
  maskSecrets,
  metricDelta,
  parseExpected,
  regressionAlert,
  toAgentRunDto,
  toCaseRecord,
} from './helpers.js';
import { EvalRepository, type EvalCaseRow, type InsertCaseRun } from './repository.js';
import { metricsOf, scoreCase, type Counters } from './scoring.js';

/** Seam for tests: the review engine call. Scoring itself never reaches the model. */
export interface EvalDeps {
  review: typeof reviewPullRequest;
}

/** Agents with an eval run in flight (in-process lock — one active run per agent). */
const running = new Set<string>();

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`case timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export type ManualCaseInput = Omit<EvalCaseInput, 'owner_kind' | 'owner_id'>;

export class EvalService {
  constructor(
    private container: Container,
    readonly repo: EvalRepository = new EvalRepository(container.db),
    private deps: EvalDeps = { review: reviewPullRequest },
  ) {}

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.repo.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  // ---- cases -------------------------------------------------------------

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]> {
    await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listCases(workspaceId, agentId);
    const last = await this.repo.lastRunsByCase(rows.map((r) => r.id));
    return rows.map((r) => toCaseRecord(r, last.get(r.id)));
  }

  async createCase(workspaceId: string, agentId: string, input: ManualCaseInput): Promise<EvalCaseRecord> {
    await this.requireAgent(workspaceId, agentId);
    await this.assertRoom(workspaceId, agentId);
    this.assertFragmentSize(input.input_diff);
    const taken = (await this.repo.listCases(workspaceId, agentId)).map((c) => c.name);
    if (taken.includes(input.name)) throw new ValidationError(`A case named "${input.name}" already exists`);
    const row = await this.repo.insertCase({
      workspaceId,
      agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputMeta: input.input_meta,
      expected: input.expected_output,
      kind: kindOfExpected(input.expected_output),
      notes: input.notes,
    });
    return toCaseRecord(row);
  }

  async updateCase(workspaceId: string, caseId: string, input: ManualCaseInput): Promise<EvalCaseRecord> {
    const existing = await this.repo.getCase(workspaceId, caseId);
    if (!existing) throw new NotFoundError('Eval case not found');
    this.assertFragmentSize(input.input_diff);
    const clash = (await this.repo.listCases(workspaceId, existing.ownerId)).find(
      (c) => c.name === input.name && c.id !== caseId,
    );
    if (clash) throw new ValidationError(`A case named "${input.name}" already exists`);
    const row = await this.repo.updateCase(workspaceId, caseId, {
      name: input.name,
      inputDiff: input.input_diff,
      inputMeta: input.input_meta,
      expected: input.expected_output,
      kind: kindOfExpected(input.expected_output),
      notes: input.notes,
    });
    return toCaseRecord(row!);
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    if (!(await this.repo.deleteCase(workspaceId, caseId))) throw new NotFoundError('Eval case not found');
  }

  // ---- create from a finding (AC-1…AC-7) ---------------------------------

  async createFromFinding(
    workspaceId: string,
    findingId: string,
    requested?: 'must_find' | 'must_not_flag',
  ): Promise<EvalCaseFromFindingResult> {
    const reviews = this.container.reviewRepo;
    const ctx = await reviews.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
    const { finding, review, pull } = ctx;

    const agent = review.agentId ? await this.repo.getAgent(workspaceId, review.agentId) : undefined;
    if (!agent) {
      throw new AppError('agent_not_found', 'The agent that produced this finding no longer exists', 409);
    }

    const kind = expectationFor(finding, requested);
    const loc = { file: finding.file, start_line: finding.startLine, end_line: finding.endLine };

    const existing = await this.repo.listCases(workspaceId, agent.id);
    const dup = findDuplicate(existing, kind, loc, findingId);
    if (dup) return { case: toCaseRecord(dup), created: false };
    await this.assertRoom(workspaceId, agent.id);

    const repoRow = await reviews.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const diff = await loadDiff(this.container, reviews, workspaceId, pull, repoRow);
    const cut = cutFragment(diff.raw, finding.file, finding.startLine, finding.endLine, FRAGMENT_CONTEXT_LINES);
    if (!cut) throw new ValidationError('The finding is not inside the PR diff, so it cannot become an eval case');
    const fragment = maskSecrets(cut);
    this.assertFragmentSize(fragment);

    const expected = {
      must_find: kind === 'must_find' ? [{ ...loc, severity: finding.severity, category: finding.category, title: finding.title }] : [],
      must_not_flag: kind === 'must_not_flag' ? [{ ...loc, severity: finding.severity, category: finding.category, title: finding.title }] : [],
    };
    const row = await this.repo.insertCase({
      workspaceId,
      agentId: agent.id,
      name: caseName(finding.title, existing.map((c) => c.name)),
      inputDiff: fragment,
      inputMeta: { title: pull.title, source: 'finding' },
      expected,
      kind,
      sourceFindingId: findingId,
    });
    return { case: toCaseRecord(row), created: true };
  }

  // ---- run an agent over its case set (AC-9…AC-13a) ----------------------

  async runAgent(workspaceId: string, agentId: string, caseIds?: string[]): Promise<EvalAgentRun> {
    const agent = await this.requireAgent(workspaceId, agentId);
    let cases = await this.repo.listCases(workspaceId, agentId);
    if (caseIds) cases = cases.filter((c) => caseIds.includes(c.id));
    if (cases.length === 0) throw new ValidationError('This agent has no eval cases to run');

    if (running.has(agentId)) throw new AppError('eval_running', 'An eval run is already in progress for this agent', 409);
    running.add(agentId);
    try {
      // Resolve the provider first: a missing key fails the request before any row exists (E11).
      const llm = await this.container.llm(agent.provider as Provider);
      const linked = await this.container.agentsRepo.linkedSkills(agent.id);
      const skills = enabledSkillBodies(linked);

      const started = Date.now();
      const results = await mapPool(cases, CASE_CONCURRENCY, (c) => this.runCase(c, agent, llm, skills));

      const ok = results.filter((r) => r.counters);
      const metrics = metricsOf(ok.map((r) => r.counters!));
      const costs = results.map((r) => r.row.costUsd).filter((n): n is number => n != null);
      const row = await this.repo.insertAgentRun(
        {
          workspaceId,
          agentId,
          agentVersion: agent.version,
          systemPrompt: agent.systemPrompt,
          model: agent.model,
          recall: metrics.recall,
          precision: metrics.precision,
          citationAccuracy: metrics.citation_accuracy,
          tracesPassed: results.filter((r) => r.row.pass === true).length,
          tracesTotal: results.length,
          durationMs: Date.now() - started,
          costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
        },
        results.map((r) => r.row),
      );
      return toAgentRunDto(row, agent.name, await this.repo.caseRunsOf(row.id));
    } finally {
      running.delete(agentId);
    }
  }

  /** One case: stored input only → review → grounded findings → pure scoring. Errors stay local to the case. */
  private async runCase(
    c: EvalCaseRow,
    agent: { systemPrompt: string; model: string; name: string },
    llm: Awaited<ReturnType<Container['llm']>>,
    skills: string[],
  ): Promise<{ row: InsertCaseRun; counters: Counters | null }> {
    const expected = parseExpected(c.expectedOutput);
    const started = Date.now();
    const meta = (c.inputMeta ?? {}) as { title?: string; body?: string };
    try {
      const outcome = await withTimeout(
        this.deps.review({
          systemPrompt: agent.systemPrompt,
          model: agent.model,
          diff: parseUnifiedDiff(c.inputDiff ?? ''),
          llm,
          // Fixed so two runs of different prompts differ only by the prompt.
          strategy: 'single-pass',
          ...(skills.length > 0 ? { skills } : {}),
          ...(meta.body ? { prDescription: meta.body } : {}),
          task:
            `Review the pull request "${meta.title ?? c.name}". Report only distinct findings you can defend, ` +
            `each citing an exact file and line range that appears in the diff. Zero findings is a valid result.`,
          sessionId: `eval:${agent.name}:${c.name}`,
        }),
        CASE_TIMEOUT_MS,
      );
      const findings = outcome.review.findings;
      const score = scoreCase({
        expected,
        findings: findings.map((f) => ({ file: f.file, start_line: f.start_line, end_line: f.end_line })),
        droppedCount: outcome.dropped.length,
      });
      return {
        counters: score.counters,
        row: {
          caseId: c.id,
          status: 'ok',
          pass: score.pass,
          actualOutput: {
            expected,
            findings: findings.map((f) => ({
              file: f.file,
              start_line: f.start_line,
              end_line: f.end_line,
              severity: f.severity,
              category: f.category,
              title: f.title,
            })),
            dropped: outcome.dropped.length,
            counters: score.counters,
          },
          recall: score.recall,
          precision: score.precision,
          citationAccuracy: score.citation_accuracy,
          durationMs: Date.now() - started,
          costUsd: outcome.costUsd,
        },
      };
    } catch (e) {
      return {
        counters: null,
        row: {
          caseId: c.id,
          status: 'error',
          pass: null,
          actualOutput: { expected, error: e instanceof Error ? e.message : String(e) },
          recall: null,
          precision: null,
          citationAccuracy: null,
          durationMs: Date.now() - started,
          costUsd: null,
        },
      };
    }
  }

  // ---- history, compare, dashboards (AC-19…AC-25) -------------------------

  async listRuns(workspaceId: string, agentId: string): Promise<EvalAgentRun[]> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listAgentRuns(workspaceId, agentId, RUNS_LIMIT);
    return rows.map((r) => toAgentRunDto(r, agent.name));
  }

  /** `a` = base, `b` = candidate; both with per-case detail. */
  async compare(workspaceId: string, aId: string, bId: string): Promise<EvalCompare> {
    const [ra, rb] = await Promise.all([this.repo.getAgentRun(workspaceId, aId), this.repo.getAgentRun(workspaceId, bId)]);
    if (!ra || !rb) throw new NotFoundError('Eval run not found');
    const [ca, cb, agents] = await Promise.all([
      this.repo.caseRunsOf(ra.id),
      this.repo.caseRunsOf(rb.id),
      this.repo.listAgents(workspaceId),
    ]);
    const name = (id: string) => agents.find((x) => x.id === id)?.name;
    const a = toAgentRunDto(ra, name(ra.agentId), ca);
    const b = toAgentRunDto(rb, name(rb.agentId), cb);
    return { a, b, delta: metricDelta(a, b) };
  }

  async agentDashboard(workspaceId: string, agentId: string): Promise<EvalAgentDashboard> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listAgentRuns(workspaceId, agentId, RUNS_LIMIT); // newest first
    const runs = rows.map((r) => toAgentRunDto(r, agent.name));
    const [cur, prev] = runs;
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      model: agent.model,
      cases_total: await this.repo.countCases(workspaceId, agentId),
      current: cur ?? null,
      delta: cur && prev ? metricDelta(prev, cur) : null,
      trend: [...runs].reverse().map((r) => ({
        ran_at: r.ran_at,
        recall: r.recall,
        precision: r.precision,
        citation_accuracy: r.citation_accuracy,
      })),
      runs,
      alert: cur ? regressionAlert(cur, prev) : null,
    };
  }

  async overview(workspaceId: string): Promise<EvalOverview> {
    const [agents, counts, rows] = await Promise.all([
      this.repo.listAgents(workspaceId),
      this.repo.countCasesByAgent(workspaceId),
      this.repo.listRecentRuns(workspaceId, 500),
    ]);
    const names = new Map(agents.map((a) => [a.id, a.name]));
    const runs = rows.map((r) => toAgentRunDto(r, names.get(r.agentId)));
    return {
      agents: agents.map((a) => {
        const mine = runs.filter((r) => r.agent_id === a.id); // newest first
        return {
          agent_id: a.id,
          agent_name: a.name,
          model: a.model,
          cases_total: counts.get(a.id) ?? 0,
          last_run: mine[0] ?? null,
          trend: mine.slice(0, SPARK_POINTS).reverse().map((r) => r.recall),
        };
      }),
      recent_runs: runs.slice(0, RECENT_RUNS_LIMIT),
    };
  }

  // ---- limits ------------------------------------------------------------

  private async assertRoom(workspaceId: string, agentId: string) {
    if ((await this.repo.countCases(workspaceId, agentId)) >= MAX_CASES_PER_AGENT) {
      throw new ValidationError(`An agent can have at most ${MAX_CASES_PER_AGENT} eval cases`);
    }
  }

  private assertFragmentSize(diff: string) {
    if (Buffer.byteLength(diff, 'utf8') > MAX_FRAGMENT_BYTES) {
      throw new ValidationError(`The diff fragment is larger than ${MAX_FRAGMENT_BYTES / 1024} KB`);
    }
  }
}
