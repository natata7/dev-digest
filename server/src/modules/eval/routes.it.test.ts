import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';

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

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
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
});
