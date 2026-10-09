#!/usr/bin/env bash
# L06 gate: typecheck + lint + hermetic tests for every package the eval pipeline touches.
# The server unit suite includes the "scoring makes no LLM call" guard (scoring.no-llm.test.ts).
set -euo pipefail
cd "$(dirname "$0")/.."

step() {
  local name="$1" dir="$2"; shift 2
  printf '\n==> %s\n' "$name"
  (cd "$dir" && "$@")
  printf '    passed: %s\n' "$name"
}

step "server typecheck"      server        pnpm typecheck
step "server lint"           server        pnpm lint
step "server unit tests"     server        pnpm exec vitest run --exclude '**/*.it.test.ts'
step "client typecheck"      client        pnpm typecheck
step "client lint"           client        pnpm lint
step "client tests"          client        pnpm test
step "reviewer-core tests"   reviewer-core npm test --silent

printf '\nverify:l06 OK\n'
