# mcp — agent map

Local **stdio MCP server** that exposes DevDigest to Claude Code (and any MCP client): list reviewer agents, run one on a PR, read findings, read repo conventions. A thin adapter over the running Fastify API — no DB, no server imports, no business logic.

## Stack

TypeScript 5.9 · `@modelcontextprotocol/sdk` 1.x · zod 3.25 (the SDK's floor — the rest of the repo is on 3.24; only `import type` crosses packages) · `tsx` (runner, no build step) · Vitest 2.1

## Commands

- `npm install` — once; the Claude Code registration runs `mcp/node_modules/.bin/tsx`, so the server won't start without it
- Register / unregister (opt-in, from repo root — there is deliberately no `/.mcp.json`): see [README.md](./README.md)
- `npm start` — run over stdio (needs the API: `./scripts/dev.sh`)
- `npm run inspect` — MCP Inspector UI against the server
- `npm test` · `npm run typecheck` · `npm run lint`

Env: `DEVDIGEST_API_URL` (default `http://localhost:3001`), `DEVDIGEST_RUN_TIMEOUT_MS` (default `120000`).

## Map

| file | layer | what's there |
|---|---|---|
| `src/index.ts` | entry | stdio transport + `createServer()` |
| `src/server.ts` | presentation | server `instructions`, the 5 `registerTool` calls (zod input, annotations); handlers = resolve → call → format; `ToolError` → `isError` result |
| `src/run.ts` | application | `startAndWait(deps, input)` — dedupe → POST review → poll `GET /runs/:id` → progress → cancel → timeout fallback. All I/O injected via `deps` |
| `src/format.ts` | domain (pure) | compact text for agents / findings / conventions, severity filter, limits, `MAX_CHARS` cap, `fence()` |
| `src/api.ts` | infrastructure | the only `fetch`; error mapping to `ToolError`; `resolvePr` / `resolveRepo` / `resolveAgent` |

Tools: `list_agents`, `run_agent_on_pr` (only write tool; blocks ≤120 s), `get_findings`, `get_conventions`, `get_blast_radius` (read-only; resolves the PR ref and calls `GET /pulls/:id/blast`; `response_format`: `concise` | `detailed` | `json`). Design + rationale: [docs/specs/04-spec-mcp-server](../docs/specs/04-spec-mcp-server/04-plan-mcp-server.md).

## Conventions (non-default)

- **stdout is the protocol.** Log with `console.error` only (lint enforces `no-console` except `error`). Never run the server through `npm run` from a client config — npm banners on stdout break the handshake.
- **Token budget.** Claude Code defers MCP schemas behind ToolSearch: tool name + first sentence of the description is what gets matched. Keep descriptions ≤2 sentences, inputs flat with enums/defaults, no `outputSchema` (it doubles the payload). `server.test.ts` guards the whole `tools/list` size.
- **Output is compact text**, not JSON. Repo/LLM-authored text is always wrapped by `fence()` in `<untrusted source=…>`. One deliberate exception: `get_blast_radius` `response_format: json` returns the `/pulls/:id/blast` body verbatim as JSON (still inside `fence()`, since symbol/route names are repo data) so the browser and Claude Code see the same payload.
- **Errors the model can fix** → throw `ToolError` with the next step in the message ("call list_agents", "start ./scripts/dev.sh"). No stacks in tool output.
- **Onion inside the package:** `run.ts` imports only types + `ToolError` from `api.ts`; `format.ts` imports only types. Tests for `run.ts` inject fakes — no global `fetch` stub needed there.

## Gotchas

- Resolving `owner/repo#123` calls `GET /repos/:id/pulls`, which **syncs from GitHub on every call** (slow-ish, upserts rows). A UUID PR ref skips it.
- The MCP shares the API's localhost rate limits with the web UI: 120 req/min global, 10 reviews/min. Polling is every 3 s (~40 req per 120 s run) and backs off on 429.
- Tool-call timeout of the host (Claude Code `MCP_TOOL_TIMEOUT`) may be shorter than 120 s — then lower `DEVDIGEST_RUN_TIMEOUT_MS`; the run itself keeps going and `get_findings(run_id)` picks it up.
- No prompt-injection **scanner** on findings/conventions — only fencing + a line in `instructions`. Known gap.
- A Claude Code session started **before** a tool schema change (e.g. adding `get_blast_radius`) keeps the stdio server's old `tools/list` for the whole session — reconnect (`/mcp` → restart, or a fresh `claude`) to pick up new/changed tools.
- This package uses **npm**, not pnpm.

## Do-not-touch

- `package-lock.json` — regenerate via `npm install`, never hand-edit

## Docs

- [README.md](./README.md) — from-zero setup, register/unregister in Claude Code, troubleshooting

## Session Protocol

- **Start:** before working here, read [INSIGHTS.md](./INSIGHTS.md) and note anything relevant to the task.
- **End:** before finishing, invoke `engineering-insights` — write a new entry only if something substantial and not already recorded came up.
