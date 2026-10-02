# @devdigest/mcp — local MCP server

Exposes DevDigest to Claude Code over MCP (stdio): `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius` (PR impact map — callers, endpoints, crons).

**Opt-in, never automatic.** There is no `/.mcp.json`, and `scripts/dev.sh` does not start it. A stdio MCP server isn't a long-running process: Claude Code spawns it per session **only if you registered it**. You register it when you need it and remove it when you don't.

## From zero

### 1. Prerequisites

- Node ≥ 22, pnpm ≥ 10, Docker (for the app itself — see the root [README](../README.md#prerequisites))
- Claude Code CLI (`claude --version`)

### 2. Start DevDigest (the MCP only talks to its HTTP API)

```sh
./scripts/dev.sh               # Postgres + migrate + seed + API :3001 + web :3000
# or API only:  ./scripts/dev.sh --no-client
curl -s localhost:3001/health  # → {"status":"ok"}
```

For real reviews an LLM key must be set (`server/.env` or Settings UI). At least one agent and one imported repo with a PR must exist. The seed data provides `acme/payments-api#482` and the demo agents.

### 3. Install the MCP package (once)

```sh
cd mcp && npm install && cd ..   # npm, not pnpm
```

### 4. Register it in Claude Code (when you need it)

Run from the **repo root**. `local` scope means only you, only this project, stored in `~/.claude.json`, nothing is committed:

```sh
claude mcp add devdigest -e DEVDIGEST_API_URL=http://localhost:3001 \
  -- "$PWD/mcp/node_modules/.bin/tsx" "$PWD/mcp/src/index.ts"

claude mcp get devdigest       # Status: ✔ Connected  (needs step 2 running)
```

Absolute paths make it independent of the working directory. Call `tsx` directly, never `npm start`: npm prints banners to stdout, and stdout is the MCP protocol channel.

Optional env (add another `-e`):
- `DEVDIGEST_RUN_TIMEOUT_MS=120000` — how long `run_agent_on_pr` waits before returning `run_id`.

### 5. Use it

Start `claude` in the repo root (a session that was already open needs a restart). `/mcp` should list `devdigest` as connected. Then ask, for example:

- "List DevDigest agents"
- "Review acme/payments-api#482 with the Security Reviewer"
- "What did run <run_id> find?"
- "What conventions does acme/payments-api follow?"

### 6. Turn it off

- For this session only: `/mcp` → `devdigest` → Disable.
- Unregister it completely: `claude mcp remove devdigest -s local`.

The API (`dev.sh`) keeps running either way. Stopping the API while registered doesn't break Claude Code: the tools just answer "DevDigest API unreachable — start ./scripts/dev.sh".

## Run it without Claude Code

```sh
cd mcp
npm run inspect   # MCP Inspector in the browser: list tools, call them by hand
npm start         # raw stdio server — waits for JSON-RPC on stdin (useful only for debugging)
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `claude mcp get` shows ✘ Failed | `mcp/node_modules` missing → step 3; or paths registered from the wrong dir → remove + re-add from the repo root |
| Tools answer "API unreachable" | Start step 2; check `DEVDIGEST_API_URL` |
| "No system user found — run pnpm db:seed" | `cd server && pnpm db:seed` |
| "Repo … is not imported" | Import the repo in the web UI (localhost:3000) |
| `run_agent_on_pr` returns `status: running` | Normal after 120 s — call `get_findings(run_id)` later |
| "Rate limited" | The API allows 10 reviews/min and 120 req/min, shared with the web UI — wait a minute |

Internals, conventions and gotchas: [AGENTS.md](./AGENTS.md).
