import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[onboarding] Docker not available — skipping integration tests.');

const KINDS = ['architecture', 'critical_paths', 'local_run', 'reading_order', 'first_tasks'];
const OUT = {
  sections: KINDS.map((kind) => ({ kind, title: kind, body: `body ${kind}`, diagram: null, links: [] })),
  reading_why: [],
  run_steps: [{ command: 'npm run test', note: null }],
  first_tasks: [{ title: 'Read core', path: 'src/core.ts' }],
};

function stubIntel(status: 'full' | 'degraded', sha = 'sha-1'): RepoIntel {
  const index = { status, filesIndexed: 1, filesSkipped: 0, durationMs: 0 };
  return {
    indexRepo: async () => index,
    refreshIndex: async () => index,
    getIndexState: async () => ({
      ...index, repoId: '', lastIndexedSha: sha, indexerVersion: 1, updatedAt: new Date(0),
      ...(status === 'degraded' ? { reason: 'no_data', degraded: true, degradedReason: 'no_data' as const } : {}),
    }),
    getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true }),
    getRepoMap: async () => ({ text: '', tokens: 0, cached: false, degraded: true }),
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => [],
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
    getRankedFiles: async () => [{ path: 'src/core.ts', pagerank: 1, hotness: 0, junk: false }],
    getEndpointFacts: async () => [],
  };
}

d('onboarding routes', () => {
  let pg: PgFixture;
  let wsId: string;
  let clone: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    wsId = ws!.id;
    clone = await mkdtemp(join(tmpdir(), 'onb-it-'));
    await writeFile(join(clone, 'package.json'), JSON.stringify({ name: 'it', scripts: { test: 'vitest' } }));
  });
  afterAll(async () => {
    await pg?.stop();
    if (clone) await rm(clone, { recursive: true, force: true });
  });

  async function newRepo(name: string, clonePath: string | null) {
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return r!.id;
  }
  function makeApp(llm: MockLLMProvider, intel: RepoIntel) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({ config, db: pg.handle.db, overrides: { llm: { openrouter: llm, openai: llm }, repoIntel: intel } });
  }
  const count = (p: MockLLMProvider) => p.calls.filter((c) => c.method === 'completeStructured').length;

  it('GET with no row -> 404 no_tour; POST then GET returns the same tour, GET makes no LLM call (AC-2, AC-3)', async () => {
    const id = await newRepo('tour-a', clone);
    const llm = new MockLLMProvider('openai', { structured: OUT });
    const app = await makeApp(llm, stubIntel('full'));

    const none = await app.inject({ method: 'GET', url: `/repos/${id}/onboarding` });
    expect(none.statusCode).toBe(404);
    expect(none.json().error.code).toBe('no_tour');

    const post = await app.inject({ method: 'POST', url: `/repos/${id}/onboarding` });
    expect(post.statusCode).toBe(200);
    expect(post.json().status).toBe('complete');
    expect(post.json().run_steps).toEqual([{ command: 'npm run test', note: null, source: 'llm' }]);
    expect(post.json().first_tasks).toEqual([{ title: 'Read core', path: 'src/core.ts' }]);
    expect(count(llm)).toBe(1);

    const get = await app.inject({ method: 'GET', url: `/repos/${id}/onboarding` });
    expect(get.statusCode).toBe(200);
    expect(get.json().sections.map((s: { kind: string }) => s.kind)).toEqual(KINDS);
    expect(get.json().generated_at).toBe(post.json().generated_at);
    expect(count(llm)).toBe(1);
    await app.close();
  });

  it('old-shape stored row -> 404 no_tour (E21)', async () => {
    const id = await newRepo('tour-old', clone);
    await pg.handle.db.insert(t.onboarding).values({
      repoId: id,
      json: { sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }] },
      generatedAt: new Date(),
    });
    const app = await makeApp(new MockLLMProvider('openai'), stubIntel('full'));
    const res = await app.inject({ method: 'GET', url: `/repos/${id}/onboarding` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('no_tour');
    await app.close();
  });

  it('POST without a clone -> 409 repo_not_cloned, 0 LLM calls (AC-5)', async () => {
    const id = await newRepo('tour-noclone', null);
    const llm = new MockLLMProvider('openai', { structured: OUT });
    const app = await makeApp(llm, stubIntel('full'));
    const res = await app.inject({ method: 'POST', url: `/repos/${id}/onboarding` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_cloned');
    expect(count(llm)).toBe(0);
    await app.close();
  });

  it('unknown / other-workspace repo -> 404 on GET and POST (AC-6)', async () => {
    const app = await makeApp(new MockLLMProvider('openai'), stubIntel('full'));
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'onb-other' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'x', name: 'ghost', fullName: 'x/ghost', clonePath: clone })
      .returning();
    for (const id of ['00000000-0000-0000-0000-000000000000', foreign!.id]) {
      expect((await app.inject({ method: 'GET', url: `/repos/${id}/onboarding` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: `/repos/${id}/onboarding` })).statusCode).toBe(404);
    }
    await app.close();
  });

  it('degraded index -> stored skeleton with no LLM call (AC-25)', async () => {
    const id = await newRepo('tour-skel', clone);
    const llm = new MockLLMProvider('openai', { structured: OUT });
    const app = await makeApp(llm, stubIntel('degraded', ''));
    const res = await app.inject({ method: 'POST', url: `/repos/${id}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'skeleton', reason: 'no_index' });
    expect(count(llm)).toBe(0);
    const [row] = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, id));
    expect(row).toBeTruthy();
    await app.close();
  });

  it('two parallel POSTs -> one 200, one 409 generation_in_progress, one LLM call (AC-23)', async () => {
    const id = await newRepo('tour-race', clone);
    const llm = new MockLLMProvider('openai', { structured: OUT });
    const orig = llm.completeStructured.bind(llm);
    llm.completeStructured = (async (req: never) => {
      await new Promise((r) => setTimeout(r, 300));
      return orig(req);
    }) as never;
    const app = await makeApp(llm, stubIntel('full'));
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/repos/${id}/onboarding` }),
      app.inject({ method: 'POST', url: `/repos/${id}/onboarding` }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const loser = a.statusCode === 409 ? a : b;
    expect(loser.json().error.code).toBe('generation_in_progress');
    expect(count(llm)).toBe(1);
    await app.close();
  });
});
