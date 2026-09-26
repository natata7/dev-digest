import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
} from 'drizzle-orm/pg-core';
import type { IntentSource } from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    /** The agent_run that produced this review (links the timeline run ↔ review). */
    runId: uuid('run_id'),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    prIdx: index('reviews_pr_idx').on(t.prId),
    wsIdx: index('reviews_ws_idx').on(t.workspaceId),
  }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    // Enum lists mirror @devdigest/shared's Severity/FindingCategory/FindingKind
    // (contracts/findings.ts) — keep in sync if those contracts change. Like
    // reviews.kind above, `{ enum }` narrows the TS type only (no DB-level
    // CHECK); the Zod contract remains the actual runtime enforcement.
    severity: text('severity', { enum: ['CRITICAL', 'WARNING', 'SUGGESTION'] }).notNull(),
    category: text('category', { enum: ['bug', 'security', 'perf', 'style', 'test'] }).notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind', {
      enum: ['finding', 'secret_leak', 'lethal_trifecta', 'phantom', 'hook'],
    })
      .notNull()
      .default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    reviewIdx: index('findings_review_idx').on(t.reviewId),
  }),
);

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // `{ enum }` is a TS-level narrowing only — no DB CHECK constraint (see
  // INSIGHTS.md 2026-09-18). Runtime enforcement is the Zod `IntentConfidence`.
  confidence: text('confidence', { enum: ['high', 'medium', 'low'] }).notNull().default('medium'),
  sources: jsonb('sources').$type<IntentSource[]>().notNull().default(sql`'[]'::jsonb`),
  /** head_sha the PR was at when this intent was computed — staleness check. */
  headSha: text('head_sha'),
  provider: text('provider'),
  model: text('model'),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow(),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
