# Task 3 Proofs – `get_blast_radius` MCP tool returns the same map as the UI

## Task Summary
The lab stub in `mcp/src/server.ts` is replaced by a real read-only tool: it resolves the PR ref, calls `GET /pulls/:id/blast` and returns either a compact text tree (`concise` / `detailed`) or the route body verbatim (`json`).

## What This Task Proves
- Claude Code gets the same symbols, callers and endpoints as the browser block.
- `readOnlyHint: true`, short description, flat schema, `tools/list` size guard still passes.
- An unknown PR returns a useful `isError` message with the next step.

## Evidence Summary
Hermetic tests cover the formatter and the tool; a live call against the running API on the seeded PR #482 shows output identical to `06-proofs/tree.png` and `blast-curl.json`.

## Artifact: MCP tests

**Command:** `cd mcp && npm test && npm run typecheck && npm run lint`
**Result summary:** 4 files / 43 tests pass; typecheck and lint clean. The old "NOT IMPLEMENTED" test is removed.

## Artifact: Live tool call (concise)

**What it proves:** the tool output matches the UI tree.
**Command:** `npx @modelcontextprotocol/inspector --cli node_modules/.bin/tsx src/index.ts --method tools/call --tool-name get_blast_radius --tool-arg pr=<prId>`
**Artifact path:** `06-proofs/mcp-concise.txt`

```
3 symbols · 6 callers · 3 endpoints · 1 cron
<untrusted source="blast-radius">
rateLimit()
  ↳ src/server.ts:88 (app)
  ↳ src/api/public/index.ts:23 (publicRouter)
  ↳ src/api/public/webhooks.ts:45 (webhookHandler)
  ↳ src/api/public/health.ts:11 (healthCheck)
  endpoints: GET /api/public/health, GET /api/public/items, POST /api/public/webhooks
bucketKey()
  ↳ src/api/public/index.ts:31 (publicRouter)
  ↳ src/jobs/reset-buckets.ts:8 (resetBuckets)
  endpoints: GET /api/public/items
  crons: reset-rate-buckets (hourly)
</untrusted>
```

## Artifact: `response_format: json` and unknown PR

**Result summary:** `json` returns the exact route body (same as `blast-curl.json`); an all-zero uuid returns:

```
{ "content": [{ "type": "text", "text": "PR not found — pass owner/repo#number, a PR URL or a DevDigest PR uuid" }], "isError": true }
```

Note: a Claude Code session that started the MCP server before this change keeps the old stub schema until the server is reconnected (`/mcp` → reconnect).

## Reviewer Conclusion
The MCP tool is a thin, read-only view over the same route, so agent and browser see identical data.
