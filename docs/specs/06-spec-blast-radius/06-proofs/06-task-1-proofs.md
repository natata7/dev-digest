# Task 1 Proofs – `GET /pulls/:id/blast` serves the grouped impact map from the index

## Task Summary
New server module `server/src/modules/blast/` exposes `GET /pulls/:id/blast`. It resolves the PR's changed files, calls `repoIntel.getBlastRadius` once, and maps the facade's flat `callers[]` (keyed by `viaSymbol`) into the grouped `BlastRadius` contract. The contract gained optional `degraded`, `reason`, `indexed_sha`. A demo index for `acme/payments-api` PR #482 is seeded (`server/src/db/seed-blast.ts`) so the map has real data without a clone.

## What This Task Proves
- Flat callers are grouped per changed symbol; endpoints and crons are attributed per group from `factsByFile`.
- The route response validates against `BlastRadius` (Fastify response schema) and the mapper output parses with `BlastRadius.parse`.
- The facade is called exactly once; no AST/graph rebuild on the request path (log shows only `blast served from index`).
- `degraded` / `reason` pass through; limits are not re-applied in the blast module.
- A PR whose files were never fetched (MCP/direct call) now resolves its files through `PullsService.getDetail` instead of returning an empty map.

## Evidence Summary
Unit tests cover the mapper and service; a live `curl` on the seeded PR shows 4 real callers of `rateLimit()` and 3 HTTP endpoints; the API log for the same request shows one index read line and no indexing job.

## Artifact: Mapper + service unit tests

**What it proves:** grouping by `viaSymbol`, facts union + dedupe, zero-caller groups, same-name merge, rank sort, summary string, degraded passthrough, missing `factsByFile` fallback, `indexed_sha` only when non-empty, 25-in → 25-out pass-through, facade called once, unknown PR → `NotFoundError`, files fetched via PR detail when none persisted.
**Why it matters:** the flat → grouped mapping is the core server work (P2).
**Command:** `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm typecheck && pnpm lint`
**Result summary:** all green — 34 files / 346 tests; typecheck and lint clean.

```
 Test Files  34 passed (34)
      Tests  346 passed (346)
$ tsc --noEmit -p tsconfig.json
$ eslint .
```

Files: `server/src/modules/blast/helpers.test.ts`, `server/src/modules/blast/service.test.ts`, `server/test/routes-smoke.test.ts` (DB-free: non-uuid id → 422 before the handler).

## Artifact: Limits are not duplicated

**What it proves:** `MAX_CALLERS_PER_SYMBOL` / `BFS_DEPTH` live only in `repo-intel/constants.ts`.
**Command:** `grep -rnE "MAX_CALLERS_PER_SYMBOL|BFS_DEPTH" server/src/modules/blast "client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard"`
**Result summary:** no matches.

## Artifact: Live route on the test PR

**What it proves:** ≥2 real callers and ≥1 HTTP endpoint on a PR that changes a shared helper (`src/middleware/ratelimit.ts`).
**Command:** `curl -s http://localhost:3001/pulls/<prId>/blast | jq` (seeded `acme/payments-api` #482)
**Artifact path:** `06-proofs/blast-curl.json`
**Result summary:** `rateLimit()` → 4 callers (`src/server.ts:88`, `src/api/public/index.ts:23`, `webhooks.ts:45`, `health.ts:11`) and 3 endpoints; `bucketKey()` → 2 callers, 1 endpoint + cron `reset-rate-buckets (hourly)`; the declaring file `src/middleware/ratelimit.ts` never appears as a caller.

```
"summary": "3 symbols · 6 callers · 3 endpoints · 1 cron",
"degraded": false,
"indexed_sha": "a1b2c3d4e5f6"
```

## Artifact: Request log — index read only

**What it proves:** the request reads the prebuilt index; no parsing / indexing job runs (P2).
**Artifact path:** `06-proofs/blast-log.txt` (API started on :3099 with output to a file, one request, then stopped)

```
[18:47:09.421] INFO: incoming request  url: "/pulls/d884d17e-…/blast"
[18:47:09.558] INFO: blast served from index
    prId: "d884d17e-…"  degraded: false  symbols: 3  callers: 6
[18:47:09.561] INFO: request completed  statusCode: 200  responseTime: 140ms
```

## Reviewer Conclusion
The route turns the facade's flat result into the grouped contract without recomputing anything, carries degradation through, and returns real callers + endpoints on the test PR.
