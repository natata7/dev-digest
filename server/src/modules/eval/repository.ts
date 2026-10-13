import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalExpectedShape, EvalExpectationKind } from '@devdigest/shared';

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalAgentRunRow = typeof t.evalAgentRuns.$inferSelect;
export type EvalCaseRunRow = typeof t.evalRuns.$inferSelect;
export type AgentRow = typeof t.agents.$inferSelect;

export interface InsertCase {
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  inputMeta?: unknown;
  expected: EvalExpectedShape;
  kind: EvalExpectationKind;
  sourceFindingId?: string | null;
  notes?: string | null;
}

export interface InsertAgentRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  systemPrompt: string;
  model: string;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  tracesPassed: number;
  tracesTotal: number;
  durationMs: number | null;
  costUsd: number | null;
}

export interface InsertCaseRun {
  caseId: string;
  status: 'ok' | 'error';
  pass: boolean | null;
  actualOutput: unknown;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

const cost = (n: number | null) => (n == null ? null : n.toFixed(6));

/** Eval data-access. Cases are owned by an agent (`owner_kind='agent'`); everything is workspace-scoped. */
export class EvalRepository {
  constructor(private db: Db) {}

  // ---- agents ------------------------------------------------------------

  async getAgent(workspaceId: string, agentId: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
      .limit(1);
    return row;
  }

  listAgents(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId)).orderBy(asc(t.agents.name));
  }

  // ---- cases -------------------------------------------------------------

  private caseScope(workspaceId: string, agentId: string) {
    return and(
      eq(t.evalCases.workspaceId, workspaceId),
      eq(t.evalCases.ownerKind, 'agent'),
      eq(t.evalCases.ownerId, agentId),
    );
  }

  listCases(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.db.select().from(t.evalCases).where(this.caseScope(workspaceId, agentId)).orderBy(asc(t.evalCases.name));
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .limit(1);
    return row;
  }

  async countCases(workspaceId: string, agentId: string): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(t.evalCases).where(this.caseScope(workspaceId, agentId));
    return Number(r?.n ?? 0);
  }

  async countCasesByAgent(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ id: t.evalCases.ownerId, n: count() })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.id, Number(r.n)]));
  }

  async insertCase(v: InsertCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: v.workspaceId,
        ownerKind: 'agent',
        ownerId: v.agentId,
        name: v.name,
        inputDiff: v.inputDiff,
        inputMeta: v.inputMeta ?? null,
        expectedOutput: v.expected,
        expectationKind: v.kind,
        sourceFindingId: v.sourceFindingId ?? null,
        notes: v.notes ?? null,
      })
      .returning();
    return row!;
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: Partial<Pick<InsertCase, 'name' | 'inputDiff' | 'inputMeta' | 'expected' | 'kind' | 'notes'>>,
  ): Promise<EvalCaseRow | undefined> {
    const set: Partial<typeof t.evalCases.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.inputDiff !== undefined) set.inputDiff = patch.inputDiff;
    if (patch.inputMeta !== undefined) set.inputMeta = patch.inputMeta;
    if (patch.expected !== undefined) set.expectedOutput = patch.expected;
    if (patch.kind !== undefined) set.expectationKind = patch.kind;
    if (patch.notes !== undefined) set.notes = patch.notes;
    if (Object.keys(set).length === 0) return this.getCase(workspaceId, caseId);
    const [row] = await this.db
      .update(t.evalCases)
      .set(set)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** Latest per-case result for each of the given cases (newest first, first wins). */
  async lastRunsByCase(caseIds: string[]): Promise<Map<string, EvalCaseRunRow>> {
    const out = new Map<string, EvalCaseRunRow>();
    if (caseIds.length === 0) return out;
    const rows = await this.db
      .select()
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(desc(t.evalRuns.ranAt));
    for (const r of rows) if (!out.has(r.caseId)) out.set(r.caseId, r);
    return out;
  }

  // ---- agent runs --------------------------------------------------------

  /** Insert the batch row and its per-case rows in one transaction. */
  async insertAgentRun(run: InsertAgentRun, cases: InsertCaseRun[]): Promise<EvalAgentRunRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.evalAgentRuns)
        .values({
          workspaceId: run.workspaceId,
          agentId: run.agentId,
          agentVersion: run.agentVersion,
          systemPrompt: run.systemPrompt,
          model: run.model,
          recall: run.recall,
          precision: run.precision,
          citationAccuracy: run.citationAccuracy,
          tracesPassed: run.tracesPassed,
          tracesTotal: run.tracesTotal,
          durationMs: run.durationMs,
          costUsd: cost(run.costUsd),
        })
        .returning();
      if (cases.length > 0) {
        await tx.insert(t.evalRuns).values(
          cases.map((c) => ({
            caseId: c.caseId,
            agentRunId: row!.id,
            status: c.status,
            pass: c.pass,
            actualOutput: c.actualOutput,
            recall: c.recall,
            precision: c.precision,
            citationAccuracy: c.citationAccuracy,
            durationMs: c.durationMs,
            costUsd: cost(c.costUsd),
          })),
        );
      }
      return row!;
    });
  }

  async getAgentRun(workspaceId: string, runId: string): Promise<EvalAgentRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalAgentRuns)
      .where(and(eq(t.evalAgentRuns.workspaceId, workspaceId), eq(t.evalAgentRuns.id, runId)))
      .limit(1);
    return row;
  }

  /** Newest first. */
  listAgentRuns(workspaceId: string, agentId: string, limit: number): Promise<EvalAgentRunRow[]> {
    return this.db
      .select()
      .from(t.evalAgentRuns)
      .where(and(eq(t.evalAgentRuns.workspaceId, workspaceId), eq(t.evalAgentRuns.agentId, agentId)))
      .orderBy(desc(t.evalAgentRuns.ranAt))
      .limit(limit);
  }

  listRecentRuns(workspaceId: string, limit: number): Promise<EvalAgentRunRow[]> {
    return this.db
      .select()
      .from(t.evalAgentRuns)
      .where(eq(t.evalAgentRuns.workspaceId, workspaceId))
      .orderBy(desc(t.evalAgentRuns.ranAt))
      .limit(limit);
  }

  /** Per-case rows of one agent run, joined with the case name. */
  async caseRunsOf(agentRunId: string): Promise<Array<{ run: EvalCaseRunRow; caseName: string }>> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(eq(t.evalRuns.agentRunId, agentRunId))
      .orderBy(asc(t.evalCases.name));
    return rows;
  }
}
