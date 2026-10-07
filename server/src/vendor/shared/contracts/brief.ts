import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff, Review focus. Composed into PrBrief (the persisted, LLM-written
 * brief: summary + risks + review focus; intent/blast are nullable inputs,
 * history optional). PrBriefDraft is what the model returns.
 */

// ---- Intent ----
/** Where one piece of context for the intent classifier came from. */
export const IntentSource = z.object({
  kind: z.enum(['title', 'description', 'linked_issue', 'spec', 'files']),
  /** '#412' | 'docs/specs/intent.md' | '12 files'. */
  ref: z.string(),
  status: z.enum(['used', 'unavailable']),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

/**
 * What the classifier MODEL returns. All fields required — strict
 * `json_schema` mode rejects optional properties. `sources` is filled in by
 * the server afterwards (the model cannot know what was actually resolved).
 */
export const IntentDraft = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: IntentConfidence,
});
export type IntentDraft = z.infer<typeof IntentDraft>;

export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: IntentConfidence.default('medium'),
  sources: z.array(IntentSource).default([]),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

/** Why the index behind a Blast radius read is incomplete/absent. Mirrors
 *  repo-intel's `DegradedReason` (server/src/modules/repo-intel/types.ts). */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  /** True when the index behind this read is incomplete/absent — missing
   *  callers ≠ no impact. */
  degraded: z.boolean().optional(),
  reason: BlastDegradedReason.optional(),
  /** Commit the index was built on; caller `file:line` links resolve against
   *  this sha (not necessarily the PR head). */
  indexed_sha: z.string().optional(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Review focus ----
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

// ---- Composed PR Brief (pr_brief.json) ----
/** What the MODEL returns. All fields required (strict json_schema mode). */
export const PrBriefDraft = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export type PrBriefDraft = z.infer<typeof PrBriefDraft>;

export const PrBriefMissingInput = z.enum(['intent', 'blast', 'specs', 'description']);
export type PrBriefMissingInput = z.infer<typeof PrBriefMissingInput>;

export const PrBriefGeneration = z.object({
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  attempts: z.number().int(),
});
export type PrBriefGeneration = z.infer<typeof PrBriefGeneration>;

export const PrBrief = z.object({
  summary: z.string(),
  intent: Intent.nullable(),
  blast: BlastRadius.nullable(),
  risks: Risks,
  review_focus: z.array(ReviewFocusItem),
  history: PrHistory.optional(),
  head_sha: z.string(),
  /** ISO timestamp. */
  generated_at: z.string(),
  missing_inputs: z.array(PrBriefMissingInput),
  generation: PrBriefGeneration,
});
export type PrBrief = z.infer<typeof PrBrief>;
