import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import * as t from '../../db/schema.js';
import { EvalRepository } from './repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-repo] Docker not available — skipping integration tests.');

d('EvalRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: EvalRepository;
  let wsId: string;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    repo = new EvalRepository(pg.handle.db);
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: 'ws' } as never).returning();
    wsId = ws!.id;
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: wsId, name: 'A', provider: 'openrouter', model: 'm', systemPrompt: 'be strict' })
      .returning();
    agentId = a!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('round-trips a must_find case and a must_not_flag case', async () => {
    const exp = { must_find: [{ file: 'a.ts', start_line: 3, end_line: 4 }], must_not_flag: [] };
    const c1 = await repo.insertCase({
      workspaceId: wsId, agentId, name: 'c1', inputDiff: 'diff', expected: exp, kind: 'must_find', sourceFindingId: null,
    });
    const c2 = await repo.insertCase({
      workspaceId: wsId, agentId, name: 'c2', inputDiff: 'diff',
      expected: { must_find: [], must_not_flag: [{ file: 'b.ts', start_line: 1, end_line: 1 }] }, kind: 'must_not_flag',
    });
    const list = await repo.listCases(wsId, agentId);
    expect(list.map((c) => [c.name, c.expectationKind])).toEqual([['c1', 'must_find'], ['c2', 'must_not_flag']]);
    expect((await repo.getCase(wsId, c1.id))!.expectedOutput).toEqual(exp);
    expect(await repo.countCases(wsId, agentId)).toBe(2);
    expect(c2.sourceFindingId).toBeNull();
  });

  it('scopes cases to the workspace', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' } as never).returning();
    const [c] = await repo.listCases(wsId, agentId);
    expect(await repo.getCase(other!.id, c!.id)).toBeUndefined();
    expect(await repo.deleteCase(other!.id, c!.id)).toBe(false);
  });

  it('stores an agent run with its prompt snapshot and per-case rows atomically', async () => {
    const [c1, c2] = await repo.listCases(wsId, agentId);
    const run = await repo.insertAgentRun(
      {
        workspaceId: wsId, agentId, agentVersion: 3, systemPrompt: 'be strict', model: 'm',
        recall: 1, precision: 0.5, citationAccuracy: 1, tracesPassed: 1, tracesTotal: 2, durationMs: 120, costUsd: 0.0123,
      },
      [
        { caseId: c1!.id, status: 'ok', pass: true, actualOutput: { findings: [] }, recall: 1, precision: null, citationAccuracy: null, durationMs: 50, costUsd: 0.01 },
        { caseId: c2!.id, status: 'error', pass: null, actualOutput: { error: 'boom' }, recall: null, precision: null, citationAccuracy: null, durationMs: 70, costUsd: null },
      ],
    );
    const got = await repo.getAgentRun(wsId, run.id);
    expect(got).toMatchObject({ agentVersion: 3, systemPrompt: 'be strict', tracesTotal: 2 });
    expect(Number(got!.costUsd)).toBeCloseTo(0.0123, 6);
    const per = await repo.caseRunsOf(run.id);
    expect(per.map((p) => [p.caseName, p.run.status])).toEqual([['c1', 'ok'], ['c2', 'error']]);
    const last = await repo.lastRunsByCase([c1!.id, c2!.id]);
    expect(last.get(c1!.id)!.pass).toBe(true);
    expect((await repo.listAgentRuns(wsId, agentId, 5))[0]!.id).toBe(run.id);
  });

  it('deleting the agent cascades its agent runs and their per-case rows', async () => {
    const runs = await repo.listAgentRuns(wsId, agentId, 5);
    expect(runs.length).toBeGreaterThan(0);
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agentId));
    expect(await repo.listAgentRuns(wsId, agentId, 5)).toEqual([]);
    const rows = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.agentRunId, runs[0]!.id));
    expect(rows).toEqual([]);
  });
});
