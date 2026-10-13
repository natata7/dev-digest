# Task 2.0 Proofs – Deterministic scoring module (no LLM)

## Task Summary
`server/src/modules/eval/scoring.ts` scores an eval case with plain code: a finding matches an expectation when the file is equal and the line ranges overlap (inclusive). It yields per-case counters, `pass`, and micro-averaged recall / precision / citation_accuracy, with `null` where a denominator is zero.

## What This Task Proves
- Matching, boundary lines, duplicate hits (E2), must_not_flag priority (E3), clean cases, `null` metrics (E5/E6) and determinism behave as specified.
- AC-18: findings dropped by the grounding gate lower citation_accuracy (3 produced, 1 dropped → 2/3).
- AC-15: scoring has no imports, no `fetch`, no LLM/provider references, and runs with `fetch` replaced by a throwing stub.

## Evidence Summary
22 unit tests (13 behavior + 9 guard) pass; typecheck, lint and the full hermetic server suite are green.

## Artifact: Scoring behavior tests
**Command:** `cd server && pnpm exec vitest run src/modules/eval/scoring.test.ts`
**Result summary:** 13 passed, including "AC-18 … lower citation_accuracy (2 of 3 survive)" and the micro-vs-macro aggregation case.

## Artifact: No-LLM guard
**Command:** `cd server && pnpm exec vitest run src/modules/eval/scoring.no-llm.test.ts`
**Result summary:** 9 passed — zero import lines in `scoring.ts`, no match for adapters/container/openai/anthropic/reviewer-core/fetch/URL patterns, and a run with a throwing `fetch` stub.

## Artifact: Quality gates
**Command:** `cd server && pnpm typecheck && pnpm lint && pnpm exec vitest run --exclude '**/*.it.test.ts'`
**Result summary:** all exit 0.

## Note
Interpretation recorded in the spec Definitions: a *clean* case means both lists are empty; in a `must_not_flag`-only case, unrelated findings are not noise.

## Reviewer Conclusion
Scoring is a pure, deterministic function; the metrics the dashboard shows come from counting, not from a model.
