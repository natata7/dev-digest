import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { CodeHostClient } from '../src/platform/container.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[brief] Docker not available — skipping integration tests.');

const DRAFT = {
  summary: 'Adds rate limiting.',
  risks: [{ kind: 'k', title: 'Race', explanation: 'e', severity: 'high', file_refs: ['src/a.ts', 'src/ghost.ts'] }],
  review_focus: [{ file: 'src/a.ts', line: 3, reason: 'core change' }],
};

// Degraded intel: blast comes back unusable -> recorded as a missing input, no real index needed.
const intel = {
  getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' }),
  getIndexState: async () => ({ status: 'degraded', lastIndexedSha: 'sha-1' }),
} as unknown as RepoIntel;

// A code host that fails on any use: GET must never reach it (NFR-3).
const throwingHost = new Proxy({}, { get: () => () => { throw new Error('code host must not be called'); } }) as unknown as CodeHostClient;

d('brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let wsId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    wsId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr() {
    const name = `brief-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId, repoId: repo!.id, number: 1, title: 'Rate limit', author: 'a', branch: 'f', base: 'main',
        headSha: 'head-1', additions: 5, deletions: 0, filesCount: 1, status: 'open',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 5, deletions: 0, patch: '@@ -1,1 +1,5 @@\n+x' });
    return pr!.id;
  }
  const makeApp = (llm: MockLLMProvider, github?: CodeHostClient) =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { llm: { openai: llm, openrouter: llm }, repoIntel: intel, ...(github ? { github } : {}) },
    });
  const count = (p: MockLLMProvider) => p.calls.filter((c) => c.method === 'completeStructured').length;

  it('GET with no row -> 404 no_brief; unknown PR -> 404 not_found', async () => {
    const id = await newPr();
    const app = await makeApp(new MockLLMProvider('openai', { structured: DRAFT }));
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('no_brief');
    const nf = await app.inject({ method: 'GET', url: '/pulls/00000000-0000-0000-0000-000000000000/brief' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error.code).not.toBe('no_brief');
    await app.close();
  });

  it('bodiless POST then GET return equal JSON; LLM called once; grounded and bound to head sha (AC-8)', async () => {
    const id = await newPr();
    const llm = new MockLLMProvider('openai', { structured: DRAFT });
    const app = await makeApp(llm);
    const post = await app.inject({ method: 'POST', url: `/pulls/${id}/brief` });
    expect(post.statusCode).toBe(200);
    expect(post.json().head_sha).toBe('head-1');
    expect(post.json().risks.risks[0].file_refs).toEqual(['src/a.ts']);
    expect(post.json().missing_inputs).toContain('blast');

    const get = await app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual(post.json());
    expect(count(llm)).toBe(1);
    await app.close();
  });

  it('two parallel POSTs -> both 200, one LLM call', async () => {
    const id = await newPr();
    const llm = new MockLLMProvider('openai', { structured: DRAFT });
    const app = await makeApp(llm);
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/pulls/${id}/brief` }),
      app.inject({ method: 'POST', url: `/pulls/${id}/brief` }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(count(llm)).toBe(1);
    expect(a.json()).toEqual(b.json());
    await app.close();
  });

  it('GET with a code host that throws still returns 200 (NFR-3)', async () => {
    const id = await newPr();
    const llm = new MockLLMProvider('openai', { structured: DRAFT });
    const seeded = await makeApp(llm);
    await seeded.inject({ method: 'POST', url: `/pulls/${id}/brief` });
    await seeded.close();

    const app = await makeApp(new MockLLMProvider('openai'), throwingHost);
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().summary).toBe('Adds rate limiting.');
    await app.close();
  });
});
