import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { MockLLMProvider } from '../../adapters/mocks.js';

// built at runtime so no key-shaped literal sits in the repo (GitHub push protection)
const KEY_TAIL = '51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-routes] Docker not available — skipping integration tests.');

const PATCH = `@@ -10,6 +10,7 @@
 export const config = {
   port: 1,
+  stripeKey: "sk_live_${KEY_TAIL}",
   redisUrl: x,
 };`;

d('eval routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let wsId: string;
  let agentId: string;
  let seq = 0;

  const makeApp = (llm?: MockLLMProvider) =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      ...(llm ? { overrides: { llm: { openai: llm, openrouter: llm } } } : {}),
    });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    wsId = ws!.id;
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: wsId, name: 'Eval Test Agent', provider: 'openrouter', model: 'm', systemPrompt: 'be strict' })
      .returning();
    agentId = a!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** A PR + review (by `agent`) + one finding on src/config.ts:12, in workspace `ws`. */
  async function findingIn(ws: string, agent: string | null, decision: 'accepted' | 'dismissed' | null) {
    const name = `eval-${seq++}`;
    const db = pg.handle.db;
    const [repo] = await db.insert(t.repos).values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` }).returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws, repoId: repo!.id, number: 1, title: 'Add stripe', author: 'a', branch: 'f', base: 'main',
        headSha: 'h1', additions: 1, deletions: 0, filesCount: 1, status: 'open',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: PATCH });
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pr!.id, agentId: agent, kind: 'review', verdict: 'comment', summary: 's', score: 50, model: 'm' })
      .returning();
    const [f] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id, file: 'src/config.ts', startLine: 12, endLine: 12, severity: 'CRITICAL', category: 'security',
        title: 'Hardcoded Stripe key', rationale: 'r', confidence: 0.9,
        acceptedAt: decision === 'accepted' ? new Date() : null,
        dismissedAt: decision === 'dismissed' ? new Date() : null,
      })
      .returning();
    return f!.id;
  }

  it('accepted → must_find, dismissed → must_not_flag; stored fragment is masked; repeat is a no-op', async () => {
    const app = await makeApp();
    const acc = await findingIn(wsId, agentId, 'accepted');
    const r1 = await app.inject({ method: 'POST', url: `/findings/${acc}/eval-case` });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toMatchObject({ created: true, case: { expectation_kind: 'must_find' } });
    expect(r1.json().case.input_diff).not.toContain(KEY_TAIL);
    expect(r1.json().case.expected_output.must_find[0]).toMatchObject({ file: 'src/config.ts', start_line: 12, end_line: 12 });

    const again = await app.inject({ method: 'POST', url: `/findings/${acc}/eval-case` });
    expect(again.json()).toMatchObject({ created: false });
    expect(again.json().case.id).toBe(r1.json().case.id);

    const dis = await findingIn(wsId, agentId, 'dismissed');
    const r2 = await app.inject({ method: 'POST', url: `/findings/${dis}/eval-case` });
    expect(r2.json()).toMatchObject({ created: true, case: { expectation_kind: 'must_not_flag' } });

    const list = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` });
    expect(list.json()).toHaveLength(2);
    await app.close();
  });

  it("404 for another workspace's finding; 409 when the agent is gone", async () => {
    const app = await makeApp();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' } as never).returning();
    const foreign = await findingIn(other!.id, null, 'accepted');
    expect((await app.inject({ method: 'POST', url: `/findings/${foreign}/eval-case` })).statusCode).toBe(404);

    const orphan = await findingIn(wsId, null, 'accepted');
    const res = await app.inject({ method: 'POST', url: `/findings/${orphan}/eval-case` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('agent_not_found');
    await app.close();
  });

  // ---- agent runs through the REAL review engine (mock LLM), scored by code ----

  const modelFinding = (file: string, line: number) => ({
    id: `f-${file}-${line}`, severity: 'WARNING', category: 'bug', title: 'Issue', file, start_line: line, end_line: line,
    rationale: 'because', suggestion: null, confidence: 0.9,
  });
  const reviewFixture = (findings: unknown[]) => ({ verdict: 'comment', summary: 's', score: 60, findings });
  const diffFor = (file: string) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,2 +1,3 @@\n a\n+b\n c\n`;

  it('runs an agent over its cases, stores history, compares two prompts, and builds the dashboards', async () => {
    const [ag] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: wsId, name: 'Runner', provider: 'openrouter', model: 'm', systemPrompt: 'PROMPT ONE', version: 1 })
      .returning();
    const id = ag!.id;
    const base = makeApp(new MockLLMProvider('openai', { structured: reviewFixture([modelFinding('a.ts', 2)]) }));
    const app = await base;

    // cases: a.ts must be found; b.ts must not be flagged
    const body = (name: string, expected: unknown, file: string) => ({ name, input_diff: diffFor(file), expected_output: expected });
    const c1 = await app.inject({ method: 'POST', url: `/agents/${id}/eval-cases`, payload: body('finds-a', { must_find: [{ file: 'a.ts', start_line: 2, end_line: 2 }] }, 'a.ts') });
    const c2 = await app.inject({ method: 'POST', url: `/agents/${id}/eval-cases`, payload: body('quiet-b', { must_not_flag: [{ file: 'b.ts', start_line: 2, end_line: 2 }] }, 'b.ts') });
    expect(c1.statusCode).toBe(200);
    expect(c2.json().expectation_kind).toBe('must_not_flag');
    expect((await app.inject({ method: 'POST', url: `/agents/${id}/eval-cases`, payload: body('finds-a', {}, 'a.ts') })).statusCode).toBe(422); // duplicate name

    const run1 = await app.inject({ method: 'POST', url: `/agents/${id}/eval-runs` });
    expect(run1.statusCode).toBe(200);
    const r1 = run1.json();
    expect(r1).toMatchObject({ agent_version: 1, system_prompt: 'PROMPT ONE', recall: 1, precision: 1, traces_total: 2, traces_passed: 2 });
    expect(r1.citation_accuracy).toBeCloseTo(0.5); // the b.ts case's a.ts finding is dropped by the grounding gate
    await app.close();

    // change the prompt; a noisier model now re-flags b.ts
    await pg.handle.db.update(t.agents).set({ systemPrompt: 'PROMPT TWO — flag everything', version: 2 }).where(eq(t.agents.id, id));
    const noisy = await makeApp(new MockLLMProvider('openai', { structured: reviewFixture([modelFinding('a.ts', 2), modelFinding('b.ts', 2)]) }));
    const r2 = (await noisy.inject({ method: 'POST', url: `/agents/${id}/eval-runs` })).json();
    expect(r2).toMatchObject({ agent_version: 2, system_prompt: 'PROMPT TWO — flag everything', recall: 1, traces_passed: 1 });
    expect(r2.precision).toBeCloseTo(0.5);

    const hist = (await noisy.inject({ method: 'GET', url: `/agents/${id}/eval-runs` })).json();
    expect(hist.map((r: { id: string }) => r.id)).toEqual([r2.id, r1.id]);

    const cmp = (await noisy.inject({ method: 'GET', url: `/eval-runs/compare?a=${r1.id}&b=${r2.id}` })).json();
    expect(cmp.a.system_prompt).toBe('PROMPT ONE');
    expect(cmp.b.system_prompt).toContain('PROMPT TWO');
    expect(cmp.delta.precision).toBeCloseTo(-0.5);
    expect(cmp.delta.recall).toBeCloseTo(0);
    expect(cmp.b.per_case.map((c: { case_name: string; pass: boolean }) => [c.case_name, c.pass])).toEqual([['finds-a', true], ['quiet-b', false]]);

    const dash = (await noisy.inject({ method: 'GET', url: `/agents/${id}/eval-dashboard` })).json();
    expect(dash).toMatchObject({ agent_name: 'Runner', cases_total: 2, current: { id: r2.id } });
    expect(dash.alert).toMatch(/Precision dipped 50pts on v2 \(vs v1\)/);
    expect(dash.trend).toHaveLength(2);

    const overview = (await noisy.inject({ method: 'GET', url: '/eval/dashboard' })).json();
    expect(overview.recent_runs[0].id).toBe(r2.id);
    expect(overview.agents.find((a: { agent_name: string }) => a.agent_name === 'Runner').last_run.id).toBe(r2.id);

    expect((await noisy.inject({ method: 'GET', url: `/eval-runs/compare?a=${r1.id}&b=00000000-0000-0000-0000-000000000000` })).statusCode).toBe(404);
    expect((await noisy.inject({ method: 'POST', url: `/agents/${(await seedAgentWithoutCases()).id}/eval-runs` })).statusCode).toBe(422);
    await noisy.close();
  });

  async function seedAgentWithoutCases() {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: wsId, name: `Empty ${seq++}`, provider: 'openrouter', model: 'm', systemPrompt: 'p' })
      .returning();
    return a!;
  }

  it('seeds ≥ 8 cases for the Security Reviewer and the seed is idempotent', async () => {
    const app = await makeApp();
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as Array<{ id: string; name: string }>;
    const sec = agents.find((a) => a.name === 'Security Reviewer')!;
    const first = (await app.inject({ method: 'GET', url: `/agents/${sec.id}/eval-cases` })).json() as Array<{ expectation_kind: string }>;
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(first.filter((c) => c.expectation_kind === 'must_not_flag').length).toBeGreaterThanOrEqual(2);
    expect(first.filter((c) => c.expectation_kind === 'none').length).toBeGreaterThanOrEqual(1);
    await seed(pg.handle.db);
    const second = (await app.inject({ method: 'GET', url: `/agents/${sec.id}/eval-cases` })).json();
    expect(second).toHaveLength(first.length);
    await app.close();
  });
});
