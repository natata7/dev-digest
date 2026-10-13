import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  numeric,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  inputDiff: text('input_diff'),
  inputFiles: jsonb('input_files'),
  inputMeta: jsonb('input_meta'),
  expectedOutput: jsonb('expected_output'),
  notes: text('notes'),
  // Which expectation list the case was created for (`none` = clean case / manual).
  expectationKind: text('expectation_kind', { enum: ['must_find', 'must_not_flag', 'none'] })
    .notNull()
    .default('none'),
  // The finding the case was created from — plain uuid (no FK) so deleting a
  // finding/review never drops the case. Used for duplicate detection.
  sourceFindingId: uuid('source_finding_id'),
});

// One execution of an agent over its whole case set (the unit the dashboard,
// trend and Compare operate on). Snapshots the prompt + version so two runs stay
// comparable after the agent is edited.
export const evalAgentRuns = pgTable('eval_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  agentVersion: integer('agent_version').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  model: text('model').notNull(),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  recall: doublePrecision('recall'),
  precision: doublePrecision('precision'),
  citationAccuracy: doublePrecision('citation_accuracy'),
  tracesPassed: integer('traces_passed').notNull().default(0),
  tracesTotal: integer('traces_total').notNull().default(0),
  durationMs: integer('duration_ms'),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
});

export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => evalCases.id, { onDelete: 'cascade' }),
  // The agent run this case result belongs to (null for legacy single-case rows).
  agentRunId: uuid('agent_run_id').references(() => evalAgentRuns.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['ok', 'error'] }).notNull().default('ok'),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  actualOutput: jsonb('actual_output'),
  pass: boolean('pass'),
  recall: doublePrecision('recall'),
  precision: doublePrecision('precision'),
  citationAccuracy: doublePrecision('citation_accuracy'),
  durationMs: integer('duration_ms'),
  // Money — NUMERIC not float. Drizzle types this as `string`; convert with
  // Number()/.toFixed(6) at the read/write boundary, same as agent_runs.costUsd.
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
});

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
