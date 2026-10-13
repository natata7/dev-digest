import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** One expected `file:line` location. Scoring matches on file + overlapping lines only. */
export const EvalExpectation = z
  .object({
    file: z.string().min(1),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1),
    severity: z.string().optional(),
    category: z.string().optional(),
    title: z.string().optional(),
  })
  .refine((e) => e.end_line >= e.start_line, { message: 'end_line must be >= start_line' });
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/** Stored shape of `eval_cases.expected_output`. */
export const EvalExpectedShape = z.object({
  must_find: z.array(EvalExpectation).default([]),
  must_not_flag: z.array(EvalExpectation).default([]),
});
export type EvalExpectedShape = z.infer<typeof EvalExpectedShape>;

/**
 * Accepts the legacy array form (editor mockup: a list of findings, `end_line`
 * optional) as `must_find`, and defaults a missing `end_line` to `start_line`.
 */
export function normalizeExpectedOutput(raw: unknown): unknown {
  const fix = (x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x) && (x as { end_line?: unknown }).end_line == null
      ? { ...(x as object), end_line: (x as { start_line?: unknown }).start_line }
      : x;
  if (Array.isArray(raw)) return { must_find: raw.map(fix), must_not_flag: [] };
  if (raw && typeof raw === 'object') {
    const o = raw as { must_find?: unknown; must_not_flag?: unknown };
    return {
      must_find: Array.isArray(o.must_find) ? o.must_find.map(fix) : [],
      must_not_flag: Array.isArray(o.must_not_flag) ? o.must_not_flag.map(fix) : [],
    };
  }
  return raw;
}

/** Input form: tolerant of the legacy array, normalized to `EvalExpectedShape`. */
export const EvalExpectedOutput = z.preprocess(normalizeExpectedOutput, EvalExpectedShape);
export type EvalExpectedOutput = z.infer<typeof EvalExpectedOutput>;

/** Which list a case asserts (`none` = clean case: the agent must flag nothing). */
export const EvalExpectationKind = z.enum(['must_find', 'must_not_flag', 'none']);
export type EvalExpectationKind = z.infer<typeof EvalExpectationKind>;

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: EvalExpectedOutput,
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ---- Agent-level eval (L06 eval pipeline) ----

/** Last result of one case, shown in the case list. */
export const EvalCaseLastRun = z.object({
  pass: z.boolean().nullable(),
  status: z.enum(['ok', 'error']),
  ran_at: z.string(),
});
export type EvalCaseLastRun = z.infer<typeof EvalCaseLastRun>;

export const EvalCaseRecord = z.object({
  id: z.string(),
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_meta: z.unknown(),
  expected_output: EvalExpectedShape,
  expectation_kind: EvalExpectationKind,
  source_finding_id: z.string().nullable(),
  notes: z.string().nullable(),
  last_run: EvalCaseLastRun.nullable(),
});
export type EvalCaseRecord = z.infer<typeof EvalCaseRecord>;

/** Body of POST /findings/:id/eval-case. `expectation` only matters for undecided findings. */
export const CreateEvalCaseFromFinding = z.object({
  expectation: z.enum(['must_find', 'must_not_flag']).optional(),
});
export type CreateEvalCaseFromFinding = z.infer<typeof CreateEvalCaseFromFinding>;

export const EvalCaseFromFindingResult = z.object({
  case: EvalCaseRecord,
  created: z.boolean(),
});
export type EvalCaseFromFindingResult = z.infer<typeof EvalCaseFromFindingResult>;

/** Body of POST /agents/:id/eval-runs. Omit `case_ids` to run the whole set. */
export const RunEvalsInput = z.object({
  case_ids: z.array(z.string().uuid()).optional(),
});
export type RunEvalsInput = z.infer<typeof RunEvalsInput>;

/** Per-case outcome inside an agent run. */
export const EvalAgentRunCase = z.object({
  case_id: z.string(),
  case_name: z.string(),
  status: z.enum(['ok', 'error']),
  pass: z.boolean().nullable(),
  expected: EvalExpectedShape,
  actual: z.unknown(),
  error: z.string().nullish(),
});
export type EvalAgentRunCase = z.infer<typeof EvalAgentRunCase>;

/** One execution of an agent over its case set, with the prompt snapshot it ran with. */
export const EvalAgentRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string().nullish(),
  agent_version: z.number().int(),
  system_prompt: z.string(),
  model: z.string(),
  ran_at: z.string(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  per_case: z.array(EvalAgentRunCase).default([]),
});
export type EvalAgentRun = z.infer<typeof EvalAgentRun>;

const Delta = z.number().nullable();
export const EvalMetricDelta = z.object({
  recall: Delta,
  precision: Delta,
  citation_accuracy: Delta,
  cost_usd: Delta,
});
export type EvalMetricDelta = z.infer<typeof EvalMetricDelta>;

/** Compare two runs (`a` = older/base, `b` = newer): metric deltas (b − a) + both prompts. */
export const EvalCompare = z.object({
  a: EvalAgentRun,
  b: EvalAgentRun,
  delta: EvalMetricDelta,
});
export type EvalCompare = z.infer<typeof EvalCompare>;

/** Per-agent dashboard: latest metrics + delta vs the previous run, trend, runs, alert. */
export const EvalAgentDashboard = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  current: EvalAgentRun.nullable(),
  delta: EvalMetricDelta.nullable(),
  trend: z.array(
    z.object({
      ran_at: z.string(),
      recall: z.number().nullable(),
      precision: z.number().nullable(),
      citation_accuracy: z.number().nullable(),
    }),
  ),
  runs: z.array(EvalAgentRun),
  alert: z.string().nullable(),
});
export type EvalAgentDashboard = z.infer<typeof EvalAgentDashboard>;

/** All-agents dashboard: one summary per agent + the newest runs across agents. */
export const EvalOverview = z.object({
  agents: z.array(
    z.object({
      agent_id: z.string(),
      agent_name: z.string(),
      model: z.string(),
      cases_total: z.number().int(),
      last_run: EvalAgentRun.nullable(),
      trend: z.array(z.number().nullable()),
    }),
  ),
  recent_runs: z.array(EvalAgentRun),
});
export type EvalOverview = z.infer<typeof EvalOverview>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
