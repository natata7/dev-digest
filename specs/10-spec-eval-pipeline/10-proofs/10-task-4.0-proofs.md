# Task 4.0 Proofs – Agent eval run, history, compare, dashboard API, seeded gold set

## Task Summary
`POST /agents/:id/eval-runs` runs an agent over its case set using only each case's stored diff (fixed `single-pass` strategy, the agent's own prompt and skills), scores the result with the pure scorer, and stores one `eval_agent_runs` row (prompt + version snapshot, metrics, cost, duration) plus one `eval_runs` row per case. History, compare, per-agent dashboard and an all-agents overview are served from the stored runs. The Security Reviewer is seeded with 10 gold cases.

## What This Task Proves
- A run uses stored inputs only and records the prompt/version it ran with (AC-10, AC-11); empty set → 422 (AC-12); a failing case becomes `error` without sinking the run and is excluded from metrics (AC-13); a second concurrent run → 409 (AC-13a); a missing provider writes nothing (E11).
- Changing the system prompt changes the stored metrics: in the integration run, precision falls from 1.0 to 0.5 between prompt v1 and v2 while recall stays 1.0; Compare returns both prompts and `delta.precision = -0.5`; the dashboard alert reads "Precision dipped 50pts on v2 (vs v1)" (AC-19…AC-22, AC-27 at API level).
- The integration test drives the real `reviewPullRequest` + grounding gate with a mock LLM, so citation_accuracy (0.5 — one finding dropped by grounding) is produced by the real pipeline (AC-18).
- Seed: 10 cases, 2 `must_not_flag`, 1 clean, idempotent (AC-26).

## Evidence Summary
Server: typecheck, lint, 558 hermetic tests and 79 integration tests (incl. 4 new route tests) pass. Live API check on the migrated and seeded dev database returns the seeded set.

## Artifact: Run service tests (hermetic)
**Command:** `cd server && pnpm exec vitest run src/modules/eval/run-service.test.ts src/db/seed-eval.test.ts`
**Result summary:** 6 + 11 passed — stored-diff-only input and prompt/version snapshot, micro metrics (recall 1, precision 1/3, citation 3/4 on the fixture), empty set, error isolation, concurrency lock, missing provider, case-id subset; seed set shape and that every expected range lies on a diff line.

## Artifact: Integration tests (real Postgres, real review engine, mock LLM)
**Command:** `cd server && pnpm exec vitest run src/modules/eval/routes.it.test.ts`
**Result summary:** 4 passed — case CRUD with duplicate-name rejection, run v1 → run v2 with changed prompt, history order, compare deltas, per-case outcomes, dashboard alert, overview, 404 for an unknown run, 422 for an agent without cases, seeded set ≥ 8 and idempotent re-seed.

## Artifact: Live API check
**Command:** `ID=$(curl -s localhost:3001/agents | jq -r '.[]|select(.name=="Security Reviewer")|.id'); curl -s localhost:3001/agents/$ID/eval-cases | jq 'length, ([.[]|select(.expectation_kind=="must_not_flag")]|length), ([.[]|select(.expectation_kind=="none")]|length)'`

```
10
2
1
```
**Result summary:** the migrated dev database holds 10 seeded cases (2 must_not_flag, 1 clean). `GET /eval/dashboard` lists 5 agents.

## Artifact: Quality gates
**Command:** `cd server && pnpm typecheck && pnpm lint && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test`
**Result summary:** all exit 0 (48 + 15 test files).

## Reviewer Conclusion
The server side of the pipeline is complete and verified against a real database and the real review engine; prompt changes show up as metric deltas in stored, comparable runs.
