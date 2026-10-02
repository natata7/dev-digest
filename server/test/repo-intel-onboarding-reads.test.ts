import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

/**
 * Spec 08 AC-11/12/13/15: facade reads feeding the onboarding tour.
 * Hermetic: the service's repository is patched, no Postgres.
 */
function svc(flag: boolean, repo: Record<string, unknown>): RepoIntelService {
  const s = new RepoIntelService({ config: { repoIntelEnabled: flag }, db: {} as never } as never);
  (s as unknown as { repo: unknown }).repo = repo;
  return s;
}

describe('getRankedFiles (AC-13)', () => {
  const rows = [
    { path: 'src/core.ts', pagerank: 0.5, hotness: 0 },
    { path: 'src/a.test.ts', pagerank: 0.4, hotness: 0 },
    { path: 'src/types.d.ts', pagerank: 0.3, hotness: 0 },
    { path: 'vitest.config.ts', pagerank: 0.2, hotness: 0 },
    { path: 'db/migrations/0001.sql', pagerank: 0.1, hotness: 0 },
    { path: 'src/tests/x.ts', pagerank: 0.05, hotness: 0.5 },
  ];

  it('returns every row in repository order with pagerank/hotness and junk flags', async () => {
    const out = await svc(true, { getAllRanked: async () => rows }).getRankedFiles('r1');
    expect(out.map((r) => r.path)).toEqual(rows.map((r) => r.path));
    expect(out.find((r) => r.path === 'src/tests/x.ts')).toMatchObject({ pagerank: 0.05, hotness: 0.5 });
    expect(Object.fromEntries(out.map((r) => [r.path, r.junk]))).toEqual({
      'src/core.ts': false,
      'src/a.test.ts': true,
      'src/types.d.ts': true,
      'vitest.config.ts': true,
      'db/migrations/0001.sql': true,
      'src/tests/x.ts': true,
    });
  });

  it('flag off -> []', async () => {
    const out = await svc(false, { getAllRanked: async () => rows }).getRankedFiles('r1');
    expect(out).toEqual([]);
  });
});

describe('getEndpointFacts (AC-11)', () => {
  const facts = [
    { file: 'a.ts', endpoints: ['POST /b', 'GET /a'] },
    { file: 'b.ts', endpoints: ['GET /z'] },
    { file: 'c.ts', endpoints: [] },
  ];
  it('flattens to {file, endpoint}, endpoints ASC within a file, files in repo order', async () => {
    const out = await svc(true, { getAllEndpointFacts: async () => facts }).getEndpointFacts('r1');
    expect(out).toEqual([
      { file: 'a.ts', endpoint: 'GET /a' },
      { file: 'a.ts', endpoint: 'POST /b' },
      { file: 'b.ts', endpoint: 'GET /z' },
    ]);
  });
  it('flag off -> []', async () => {
    expect(await svc(false, { getAllEndpointFacts: async () => facts }).getEndpointFacts('r1')).toEqual([]);
  });
});

describe('getCriticalPaths determinism on equal ranks (AC-12, AC-15)', () => {
  const ranked = [
    { path: 'root.ts', rank: 1 },
    { path: 'b.ts', rank: 0.5 },
    { path: 'c.ts', rank: 0.5 },
  ];
  it('picks the same next hop regardless of edge order', async () => {
    const e1 = [
      { fromFile: 'root.ts', toFile: 'c.ts' },
      { fromFile: 'root.ts', toFile: 'b.ts' },
    ];
    const run = (edges: unknown[]) =>
      svc(true, { getEdges: async () => edges, getRankedPaths: async () => ranked }).getCriticalPaths('r1');
    const a = await run(e1);
    const b = await run([...e1].reverse());
    expect(a).toEqual(b);
    expect(a[0]![1]).toBe('b.ts'); // path ASC wins the tie
  });
  it('no edges -> [] (E7); flag off -> []', async () => {
    expect(await svc(true, { getEdges: async () => [], getRankedPaths: async () => ranked }).getCriticalPaths('r1')).toEqual([]);
    expect(await svc(false, { getEdges: async () => [{ fromFile: 'a', toFile: 'b' }], getRankedPaths: async () => ranked }).getCriticalPaths('r1')).toEqual([]);
  });
});
