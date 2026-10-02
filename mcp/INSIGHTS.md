# Insights — mcp

Read before starting work here; append before finishing — see [`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) for the rubrics and the anti-vague test. Newest entry on top within each section. Append-only: correct a stale entry with a new dated note, never rewrite or delete it.

## Pattern

## Mistake

### 2026-09-26 — a `"zod/*"` tsconfig path pin makes `tsc` hang on `@modelcontextprotocol/sdk`
Copying `reviewer-core/tsconfig.json` verbatim (paths `"zod"` **and** `"zod/*"` → `./node_modules/zod…`) made `tsc --noEmit` run for 5+ minutes and crash out of memory; a one-tool probe showed `TS2589: Type instantiation is excessively deep` on `server.registerTool`. The `zod/*` mapping bypasses zod's package `exports` for the SDK's `zod/v4/core` / `zod/v3` subpath imports, so tsc loads mismatched declaration files and the SDK's zod-compat conditional types explode. Fix: pin only bare `"zod"` (still needed so `../server/src/vendor/shared` resolves to this package's zod in CI, where `server/node_modules` is absent). Typecheck is ~2 s after the fix. If you add another SDK that imports zod subpaths, don't re-add `zod/*`.

## Decision

## Context

## Open Questions
