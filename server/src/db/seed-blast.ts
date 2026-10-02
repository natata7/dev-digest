import { eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';
import { INDEXER_VERSION } from '../modules/repo-intel/constants.js';

/**
 * Demo repo-intel index for acme/payments-api (PR #482 "rate limiting") so the
 * Blast radius block has real data without a clone: `rateLimit()` / `bucketKey()`
 * declared in the changed `src/middleware/ratelimit.ts`, resolved callers in
 * other files, and per-file endpoint/cron facts. Mirrors the design prototype.
 * Idempotent: wipes and rewrites this repo's index rows on every seed.
 */
const DECL = 'src/middleware/ratelimit.ts';
const INDEXED_SHA = 'a1b2c3d4e5f6';

// [path, enclosing symbol, start, end, rank]
const CALLER_FILES: Array<[string, string, number, number, number]> = [
  ['src/api/public/index.ts', 'publicRouter', 5, 40, 0.92],
  ['src/api/public/webhooks.ts', 'webhookHandler', 30, 70, 0.81],
  ['src/api/public/health.ts', 'healthCheck', 5, 20, 0.44],
  ['src/server.ts', 'app', 70, 120, 0.97],
  ['src/jobs/reset-buckets.ts', 'resetBuckets', 3, 20, 0.31],
];

// [from file, to symbol, line]
const REFS: Array<[string, string, number]> = [
  ['src/api/public/index.ts', 'rateLimit', 23],
  ['src/api/public/webhooks.ts', 'rateLimit', 45],
  ['src/api/public/health.ts', 'rateLimit', 11],
  ['src/server.ts', 'rateLimit', 88],
  ['src/jobs/reset-buckets.ts', 'bucketKey', 8],
  ['src/api/public/index.ts', 'bucketKey', 31],
];

const FACTS: Record<string, { endpoints: string[]; crons: string[] }> = {
  'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
  'src/api/public/webhooks.ts': { endpoints: ['POST /api/public/webhooks'], crons: [] },
  'src/api/public/health.ts': { endpoints: ['GET /api/public/health'], crons: [] },
  'src/jobs/reset-buckets.ts': { endpoints: [], crons: ['reset-rate-buckets (hourly)'] },
};

export async function seedBlastDemo(db: Db, repoId: string): Promise<void> {
  for (const table of [t.symbols, t.references, t.fileFacts, t.fileRank, t.repoIndexState]) {
    await db.delete(table).where(eq(table.repoId, repoId));
  }

  await db.insert(t.symbols).values([
    { repoId, path: DECL, name: 'rateLimit', kind: 'function', line: 12, endLine: 38, exported: true },
    { repoId, path: DECL, name: 'bucketKey', kind: 'function', line: 40, endLine: 52, exported: true },
    ...CALLER_FILES.map(([path, name, line, endLine]) => ({
      repoId,
      path,
      name,
      kind: 'function',
      line,
      endLine,
      exported: true,
    })),
  ]);

  await db.insert(t.references).values(
    REFS.map(([fromPath, toSymbol, line]) => ({ repoId, fromPath, toSymbol, line, declFile: DECL })),
  );

  await db.insert(t.fileRank).values(
    [...CALLER_FILES.map((f) => [f[0], f[4]] as const), [DECL, 0.88] as const].map(
      ([filePath, rank]) => ({
        repoId,
        filePath,
        pagerank: rank,
        hotness: 0,
        rank,
        percentile: Math.round(rank * 100),
      }),
    ),
  );

  await db.insert(t.fileFacts).values(
    Object.entries(FACTS).map(([filePath, f]) => ({ repoId, filePath, ...f })),
  );

  await db.insert(t.repoIndexState).values({
    repoId,
    lastIndexedSha: INDEXED_SHA,
    indexerVersion: INDEXER_VERSION,
    status: 'full',
    filesIndexed: CALLER_FILES.length + 1,
    filesSkipped: 0,
    stats: { durationMs: 0, reason: 'seed' },
  });
}
