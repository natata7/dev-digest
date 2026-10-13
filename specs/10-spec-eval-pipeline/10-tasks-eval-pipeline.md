# 10-tasks-eval-pipeline.md

Spec: [10-spec-eval-pipeline.md](./10-spec-eval-pipeline.md) · Status: sub-tasks generated, audit remediation applied (re-audit PASS)

## Relevant Files

| File | Why It Is Relevant |
|------|--------------------|
| `server/src/db/schema/eval.ts` | Existing `eval_cases` / `eval_runs`; add `eval_agent_runs` (batch + prompt snapshot) and the new columns |
| `server/src/db/schema.ts` | Schema barrel — export the new table |
| `server/src/db/migrations/0019_*.sql` | New migration produced by `pnpm db:generate` (never hand-edited) |
| `server/src/vendor/shared/contracts/eval-ci.ts` | Source of truth for eval Zod contracts (`EvalCaseInput`, `EvalRunRecord`, `EvalDashboard`, …) — extend here |
| `server/src/vendor/shared/contracts/knowledge.ts` | Base `EvalCase`, `EvalRun`, `EvalPerTrace`, `EvalOwnerKind` |
| `client/src/vendor/shared/**` | Read-only mirror of the shared contracts; re-synced, not hand-edited |
| `server/src/modules/eval/scoring.ts` | NEW — pure scoring (match, recall, precision, citation_accuracy, aggregation) |
| `server/src/modules/eval/scoring.test.ts` | NEW — unit tests for scoring incl. E1–E6 and determinism |
| `server/src/modules/eval/scoring.no-llm.test.ts` | NEW — guard: scoring imports no LLM/network code |
| `server/src/modules/eval/helpers.ts` (+ `helpers.test.ts`) | NEW — diff-fragment cut, secret masking, case-name generation, `expected_output` normalizer, line-diff-free prompt payload |
| `server/src/modules/eval/repository.ts` | NEW — Drizzle access for cases / runs / batches / dashboard aggregates |
| `server/src/modules/eval/service.ts` (+ `service.test.ts`) | NEW — create-from-finding, CRUD, run orchestration, compare, dashboard |
| `server/src/modules/eval/routes.ts` (+ `routes.it.test.ts`) | NEW — HTTP surface, registered in the module registry |
| `server/src/modules/eval/constants.ts` | NEW — limits (fragment 20 KB, ±20 context lines, 200 cases, per-case timeout) |
| `server/src/modules/index.ts` | Module registry — add `eval` |
| `server/src/modules/reviews/findings.ts` | Reference for finding ownership checks (`findingContext`) reused by create-from-finding |
| `server/src/modules/reviews/diff-loader.ts` | Reference for diff access when cutting the fragment (`loadDiff`) |
| `server/src/modules/reviews/run-executor.ts` | Reference for how an agent is resolved/run (`reviewPullRequest`, provider, skills) — reuse resolution, not the DB persistence |
| `server/src/modules/brief/*` | Pattern module (routes/service/repository/constants/helpers) to copy structurally |
| `reviewer-core/src/review/run.ts` | `reviewPullRequest` → `ReviewOutcome.review` (grounded) + `.dropped` — inputs to scoring; no change expected |
| `server/src/db/seed.ts` | Add ≥ 8 eval cases for the seeded Security Reviewer (idempotent) |
| `server/src/db/seed-eval.test.ts` | NEW — seed set assertions (≥ 8, ≥ 2 `must_not_flag`, ≥ 1 clean, idempotent) |
| `client/src/lib/hooks/eval.ts` (+ `eval.test.ts`) | NEW — TanStack Query hooks (cases, run, runs, compare, dashboard, create-from-finding) |
| `client/src/lib/hooks/index.ts` | Re-export the new hooks |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` (+ `.test.tsx`) | Add "Turn into eval case" button |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | Wire the new action into the findings list |
| `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` | Add the `evals` tab descriptor |
| `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` | Render `EvalsTab` |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/*` | NEW — metrics tiles, case list, run-all, case editor modal (+ `EvalsTab.test.tsx`) |
| `client/src/app/eval/page.tsx`, `client/src/app/eval/[agentId]/page.tsx` | NEW — thin pages for the Eval Dashboard |
| `client/src/app/eval/_components/EvalDashboard/*`, `AgentEvalView/*`, `CompareRuns/*` | NEW — dashboard list, per-agent trend + runs table, compare modal (+ tests) |
| `client/src/vendor/ui/nav.ts` | Sidebar groups — add the `eval` item (see Notes: vendor exception) |
| `client/src/components/app-shell/helpers.ts` (+ `helpers.test.ts`) | `activeKeyFor('/eval')` already maps to `eval`; add the test |
| `client/src/components/app-shell/nav.test.ts` | NEW — asserts the `eval` item in the `SKILLS LAB` group |
| `client/messages/en/eval.json` | Extend existing strings (Turn into eval case, Compare, prompt diff) |
| `client/messages/en/prReview.json` (or the file holding `finding.*`) | New `finding.turnIntoEval*` strings |
| `package.json` (repo root) | Add the `verify:l06` script |
| `scripts/verify-l06.sh` | NEW — sequential verify steps with named output |
| `specs/10-spec-eval-pipeline/10-experiment-eval-pipeline.md`, `screenshots/*` | NEW — experiment record and evidence |
| `server/INSIGHTS.md`, `client/INSIGHTS.md` | Read at start; append only if something substantial is learned |

### Notes
- Tests sit next to the source file. Server: `*.test.ts` hermetic, `*.it.test.ts` real Postgres (testcontainers). Commands: `cd server && pnpm typecheck && pnpm lint && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `pnpm exec vitest run .it.test` for integration; `cd client && pnpm typecheck && pnpm lint && pnpm test`; `cd reviewer-core && npm test`.
- Contracts: edit only `server/src/vendor/shared`, then copy to `client/src/vendor/shared` (identical tree). Zod schema and type share one name; REST fields snake_case.
- DB: new tables/columns only through `pnpm db:generate`, applied with `pnpm db:migrate`. Do not edit existing migrations or lock files.
- Vendor exception: the sidebar `NAV` lives in `client/src/vendor/ui/nav.ts`. Earlier features changed it the same way (`53151a6`, `b192a6e` added Onboarding Tour and Conventions), so the change is made there and listed in the commit message; there is no other source of truth for the sidebar.
- Onion rule: `scoring.ts` and `helpers.ts` import nothing from Fastify, Drizzle, adapters or LLM clients. Only `service.ts` talks to the container.
- Start of work in `server`/`client`: read the package `INSIGHTS.md`. End of work: invoke `engineering-insights`.
- Commits use `feat:` / `test:` / `docs:` prefixes.

### Assumptions (spec Open Questions)
- Q1 (file path): the spec lives at `specs/10-spec-eval-pipeline/10-spec-eval-pipeline.md` per `specs/README.md`. If the reviewer needs the literal `specs/eval-pipeline.md`, a copy is added in 6.6.
- Q2 (run grouping): resolved by task 1.3 — a new `eval_agent_runs` table plus `agent_run_id` on `eval_runs`.
- Q3 (clean-case precision weight): a finding in a case with no `must_find` counts as noise with the same weight as any other noise finding (decided default D5).
- Q4 ("Promote vN"): out of scope (spec Non-goals); no task creates it.
- Q5 (diff context): ±20 lines around the finding range, constant in `modules/eval/constants.ts`.
- Q6 (run transport): the run is synchronous inside one HTTP request, with a per-case timeout; no SSE progress.

## Tasks

### [x] 1.0 Data model and contracts for eval cases and agent eval runs

Covers AC-6, AC-11, AC-12, AC-14 (shape), E10. Foundation for every other task.

#### 1.0 Proof Artifact(s)
- Test: `server/src/modules/eval/repository.it.test.ts` passes (`cd server && pnpm exec vitest run .it.test eval`) — a case with a `must_find`/`must_not_flag` expectation and an agent-run batch with prompt snapshot round-trip through real Postgres.
- CLI: `cd server && pnpm db:generate` produces exactly one new migration file after `0018_gray_starfox.sql`; `pnpm db:migrate` applies it on a clean DB; `git diff --stat -- server/src/db/migrations` shows only added files.
- Test: `server/src/modules/eval/contracts.test.ts` passes — the new Zod contracts accept `expected_output` as `{must_find, must_not_flag}` and as the legacy array shape, and reject a range with `end_line < start_line`.
- CLI: `diff -r server/src/vendor/shared client/src/vendor/shared` prints nothing.

#### 1.0 Tasks
- [x] 1.1 Define the `expected_output` contract in `eval-ci.ts`: `EvalExpectation = {file, start_line, end_line, severity?, category?, title?}`, `EvalExpectedOutput = {must_find: EvalExpectation[], must_not_flag: EvalExpectation[]}`, and a `normalizeExpectedOutput` input transform that maps the legacy array to `must_find`. Add a refinement `end_line >= start_line`.
- [x] 1.2 Add contracts for the new API shapes in `eval-ci.ts`: `EvalCaseRecord` (case + `expectation_kind` + last-run status), `CreateEvalCaseFromFinding` (`{expectation?: 'must_find'|'must_not_flag'}`), `RunEvalsInput` (`{case_ids?: string[]}`), `EvalAgentRun` (batch with `agent_version`, `system_prompt`, metrics, `per_case`), `EvalCompare` (`{a, b, delta, prompt_a, prompt_b}`), and extend `EvalDashboard`/agent summary as needed. Reuse `EvalRun`/`EvalRunRecord`; do not duplicate fields.
- [x] 1.3 Extend the Drizzle schema in `server/src/db/schema/eval.ts`: add `eval_agent_runs` (id, workspace_id, agent_id, agent_version, system_prompt, model, recall/precision/citation_accuracy as nullable doublePrecision, traces_passed, traces_total, duration_ms, cost_usd NUMERIC, ran_at); add to `eval_cases` the columns `expectation_kind` (enum `must_find|must_not_flag|none`) and `source_finding_id` (nullable uuid, no FK so deleting a finding does not drop the case); add to `eval_runs` a nullable `agent_run_id` FK (on delete cascade) and a `status` (`ok|error`). Explicit snake_case names; export from `schema.ts`.
- [x] 1.4 Run `pnpm db:generate` and `pnpm db:migrate`; check the generated SQL contains only the additions above. Do not edit any prior migration.
- [x] 1.5 Copy the contract changes to `client/src/vendor/shared` (same files, identical content) and confirm both packages typecheck.
- [x] 1.6 Create `server/src/modules/eval/repository.ts` with typed methods: create/find/list/update/delete case (scoped by workspace), find duplicate by `(agent, source_finding_id, expectation_kind)` and by `(agent, file, range, kind)`, insert agent run with its per-case rows in one transaction, list agent runs, get run pair, per-agent and workspace dashboard aggregates.
- [x] 1.7 Write `contracts.test.ts` (hermetic) and `repository.it.test.ts` (Postgres) per the proof artifacts; include an assertion that deleting an agent cascades its agent runs and their per-case rows (cases use `owner_id` without an FK, so they stay).

### [x] 2.0 Deterministic scoring module (no LLM)

Covers AC-14 – AC-18, NFR-1, E1–E6. Pure function over expectations + findings.

#### 2.0 Proof Artifact(s)
- Test: `server/src/modules/eval/scoring.test.ts` passes (`cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' scoring`) — overlap and no-overlap, boundary-inclusive lines, duplicate matches (E2), `must_not_flag` priority (E3), `null` metrics (E5, E6), micro aggregation across cases, determinism (same input twice → deep-equal output), and the named case "dropped findings lower citation_accuracy" (AC-18: 3 produced, 1 dropped by grounding → 2/3).
- Test: `server/src/modules/eval/scoring.no-llm.test.ts` passes — reads `scoring.ts`, asserts it has no import from `adapters/`, `platform/container`, `openai`, `@anthropic-ai/sdk`, `@devdigest/reviewer-core`'s `llm/`, and no use of `fetch`; also calls scoring with `globalThis.fetch` replaced by a throwing stub.

#### 2.0 Tasks
- [x] 2.1 Create `server/src/modules/eval/scoring.ts` exporting `rangesOverlap`, `matches(finding, expectation)` (same `file` + inclusive line overlap), `scoreCase({expected, findings, droppedCount})` → counters (`expected_found`, `expected_total`, `noise`, `findings_total`, `grounded`, `produced`) and per-case `pass`, and `aggregate(cases[])` → micro recall / precision / citation_accuracy with `null` when the denominator is 0.
- [x] 2.2 Implement the precision rule from the spec: a finding is noise if it matches `must_not_flag`, or if the case has no `must_find` and any finding exists; `must_not_flag` wins over `must_find` when both match (E3); duplicates matching one expectation count once (E2).
- [x] 2.3 Keep the module dependency-free (types from `@devdigest/shared` only), with `ponytail`-style small functions and no I/O.
- [x] 2.4 Write `scoring.test.ts` covering every case listed in the proof artifact, including a table-driven set for the "clean case" and "no findings" paths, and the explicit AC-18 case where grounding-dropped findings lower citation_accuracy.
- [x] 2.5 Write `scoring.no-llm.test.ts` as described; make it fail with a clear message naming the offending import.

### [x] 3.0 One-click "Turn into eval case" (server + FindingCard)

Covers AC-1 – AC-7, E8, E9, E12, NFR-4 (secret masking).

#### 3.0 Proof Artifact(s)
- Test: `server/src/modules/eval/service.test.ts` passes — accepted finding → `must_find` case, dismissed → `must_not_flag`, undecided defaults to `must_find` unless `expectation` is given (D2), duplicate returns the existing case without inserting (AC-5), deleted agent rejected (AC-6), `sk_live_…` is masked in the stored fragment, oversized fragment rejected (E12).
- Test: `server/src/modules/eval/routes.it.test.ts` passes — `POST /findings/:id/eval-case` on the seeded PR `acme/payments-api#482`; a finding from another workspace returns 404.
- Test: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx` passes — the button renders, one click sends one request, shows the "Case created" confirmation, a second rapid click sends no second request.
- Screenshot: `specs/10-spec-eval-pipeline/screenshots/01-finding-card.png` showing the "Turn into eval case" button in the action row of an accepted finding on the running app.

#### 3.0 Tasks
- [x] 3.1 Add pure helpers in `server/src/modules/eval/helpers.ts`: cut a diff fragment containing `[start_line, end_line]` of the finding's file with ±20 context lines (from the unified diff), mask secrets with a regex set (`sk_live_`, `sk_test_`, `ghp_`, AWS key ids, generic `key|secret|token = "…"` long values) while preserving line count, and build a unique case name from the finding title.
- [x] 3.2 Implement `EvalService.createFromFinding(workspaceId, findingId, expectation?)`: load via `findingContext`, check workspace, resolve the agent from the review, derive the kind (accepted → `must_find`, dismissed → `must_not_flag`, otherwise the given value or `must_find`), load the diff with `loadDiff`, cut + mask the fragment, de-duplicate (AC-5), insert the case with `source_finding_id`.
- [x] 3.3 Add the route `POST /findings/:id/eval-case` with `CreateEvalCaseFromFinding` body and `EvalCaseRecord` response in `server/src/modules/eval/routes.ts`; register the `eval` module in `server/src/modules/index.ts`.
- [x] 3.4 Add `useCreateEvalCaseFromFinding` to `client/src/lib/hooks/eval.ts` (invalidates the agent's case list) and export it from the hooks barrel.
- [x] 3.5 Add the button to `FindingCard.tsx` after "Learn" (icon from `@devdigest/ui`, text label), with `pending` handling that prevents double submit, a confirmation toast "Case created" / "Case already exists", and a type picker shown only for undecided findings (D2). Wire it through the PR page's findings list.
- [x] 3.6 Add strings to the messages files; write the service, route (integration) and FindingCard tests. Screenshot `01-finding-card.png` is captured in the consolidated pass in 6.5 (needs the running app).

### [x] 4.0 Agent eval run: `POST /agents/:id/eval-runs`, history, compare, dashboard API, ≥ 8 seeded cases

Covers AC-8 – AC-13a, AC-19 – AC-25 (API side), AC-26, E7, E11, NFR-2, NFR-3.

#### 4.0 Proof Artifact(s)
- Test: `server/src/modules/eval/service.test.ts` (run section) passes with a stubbed `LLMProvider` — a run feeds each case only its stored `input_diff` (AC-10), stores the `system_prompt` and `version` snapshot (AC-11), an empty set returns 4xx (AC-12), an LLM error on one case marks it `error` and the others still score (AC-13), a second concurrent run for the same agent is rejected (AC-13a), missing provider creates no run row (E11).
- Test: `server/src/modules/eval/routes.it.test.ts` passes — `POST /agents/:id/eval-runs`, `GET /agents/:id/eval-runs`, `GET /eval-runs/compare?a=&b=` (deltas + both prompt texts), `GET /eval/dashboard` matches the `EvalDashboard` contract, cases CRUD scoped to the workspace.
- Test: `server/src/db/seed-eval.test.ts` passes — the seeded agent has ≥ 8 cases, ≥ 2 with non-empty `must_not_flag`, ≥ 1 with empty expectations, and re-running the seed adds no duplicates.
- CLI: with the API running, `cd server && pnpm db:seed && ID=$(curl -s localhost:3001/agents | jq -r '.[]|select(.name=="Security Reviewer")|.id') && curl -s localhost:3001/agents/$ID/eval-cases | jq 'length'` prints a number ≥ 8.

#### 4.0 Tasks
- [x] 4.1 CRUD for cases in routes/service/repository: `GET /agents/:id/eval-cases` (with last-run status), `POST /agents/:id/eval-cases`, `PUT /eval-cases/:id`, `DELETE /eval-cases/:id`; validate `expected_output` through the normalizer; enforce limits from `constants.ts` (≤ 200 cases, ≤ 20 KB fragment).
- [x] 4.2 Implement `EvalService.runAgent(workspaceId, agentId, caseIds?)`: load the agent (prompt, model, skills, strategy) with the same resolution used by `ReviewRunExecutor`; reject empty sets and a missing provider before creating anything; guard against concurrent runs per agent (in-process lock, noted as the known ceiling).
- [x] 4.3 For each case: parse `input_diff` with `parseUnifiedDiff`, call `reviewPullRequest` with the agent's prompt and **only** the case's stored inputs (no intent, no repo-intel, no live PR data), with a per-case timeout; collect `review.findings` (grounded) and `dropped`; on error record the case as `error` and continue.
- [x] 4.4 Call the pure `scoreCase`/`aggregate` from task 2.0 and persist, in one transaction, the `eval_agent_runs` row (prompt + version snapshot, metrics, cost, duration) and one `eval_runs` row per case (`actual_output` with findings, dropped and counters, `pass`, `status`).
- [x] 4.5 Add routes: `POST /agents/:id/eval-runs` (body `RunEvalsInput`, response `EvalAgentRun`), `GET /agents/:id/eval-runs`, `GET /eval-runs/compare`, `GET /eval/dashboard` (all agents + recent runs) and `GET /agents/:id/eval-dashboard` (3 metrics + delta vs previous run, trend, runs, alert when any metric dropped).
- [x] 4.6 Seed ≥ 8 deterministic cases for the built-in Security Reviewer in `seed.ts` (stripe key leak, SSRF webhook, SQL injection, missing authz check, lethal-trifecta, a `must_not_flag` unused-import case, a `must_not_flag` test-fixture-secret case, a clean refactor); guard with the existing "insert if missing by name" pattern; fake secrets are obviously fake and masked.
- [x] 4.7 Write the service run tests (stubbed provider via `adapters/mocks.ts` patterns), the integration route tests and `seed-eval.test.ts`.

### [x] 5.0 Client UI: Evals tab, Eval Dashboard page, sidebar entry, Compare modal

Covers AC-8, AC-9, AC-13a, AC-19 – AC-25 (UI side), NFR-6.

#### 5.0 Proof Artifact(s)
- Test: `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.test.tsx` passes — the case list shows statuses, "Run all evals" calls the run hook, shows "Running…" and disables the button (AC-13a), metric tiles show ▲/▼ deltas (AC-19), run rows show duration and cost (AC-25), the case editor validates JSON.
- Test: `client/src/app/eval/_components/CompareRuns/CompareRuns.test.tsx` and `EvalDashboard.test.tsx` pass — Compare is disabled unless exactly two runs are selected (AC-23), identical prompts show "prompts are identical" (AC-24), a changed prompt line is highlighted, the alert appears when a metric dropped (AC-21).
- Test: `client/src/components/app-shell/helpers.test.ts` passes — `/eval` and `/eval/<id>` resolve to the `eval` nav key; `client/src/components/app-shell/nav.test.ts` passes — `NAV` contains an item with key `eval`, label "Eval Dashboard", href `/eval`, in the `SKILLS LAB` section (AC-20).
- Test: the EvalsTab and agent-dashboard tests assert that a run row renders its duration and cost (AC-25).
- CLI: `cd client && pnpm typecheck && pnpm lint && pnpm test` exits 0.
- Screenshot: `specs/10-spec-eval-pipeline/screenshots/02-evals-tab.png`, `03-eval-dashboard.png`, `04-compare-modal.png` taken from the running app and matching the spec's six mockups.

#### 5.0 Tasks
- [x] 5.1 Write `client/src/lib/hooks/eval.ts`: `useEvalCases`, `useCreateEvalCase`, `useUpdateEvalCase`, `useDeleteEvalCase`, `useRunEvals`, `useEvalRuns`, `useEvalCompare`, `useEvalDashboard`, `useAgentEvalDashboard`; export from the hooks barrel; keys invalidate on run/create/delete.
- [x] 5.2 Add the `evals` tab to `AgentEditor/constants.ts` and render `EvalsTab` in `AgentEditor.tsx` (existing `agents.json` already has the `evals` label).
- [x] 5.3 Build `EvalsTab` (colocated folder with `styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`): metrics tiles with deltas, "View full dashboard →" link, case list (kind label, last-run state, Run / Edit / Delete), "Run all evals", "New eval case" and the editor modal (Name, Diff, PR meta, expected output JSON with valid/invalid indicator, Save, Run case; the "Finding skeleton" button and "Run on save" toggle are optional and may be skipped). Run rows show date, version, metrics, pass, duration and cost.
- [x] 5.4 Create `client/src/app/eval/page.tsx` (agent list with sparkline, three metrics, pass count; "Recent eval runs · all agents" table) and `client/src/app/eval/[agentId]/page.tsx` (three metric cards with deltas, alert banner, trend chart using the existing chart primitives from `@devdigest/ui`, runs table with checkboxes and Compare). Pages stay thin; logic in `_components`.
- [x] 5.5 Build `CompareRuns` modal: four metric deltas (recall, precision, citation, cost), the system prompt line diff computed on the client from the two prompt texts (pure helper in `helpers.ts` with its own test), "prompts are identical" state, Close.
- [x] 5.6 Add the `eval` item (label "Eval Dashboard", icon `Gauge` — already exported from `client/src/vendor/ui/icons.tsx`, href `/eval`) after Conventions in the `SKILLS LAB` group of `client/src/vendor/ui/nav.ts`; add the `helpers.test.ts` case for `activeKeyFor` and the new `nav.test.ts` described in the proof artifacts.
- [x] 5.7 Extend `eval.json` strings (compare, prompt diff, turn-into-case); write the component tests; run the app (`./scripts/dev.sh`) and screenshots 02–04 are captured in 6.5 together with the experiment runs.

### [x] 6.0 `pnpm verify:l06`, sensitivity experiment and submission evidence

Covers AC-27, AC-28, Success Metrics 3–5, spec Unit 5.

#### 6.0 Proof Artifact(s)
- CLI: from the repo root `pnpm verify:l06` exits 0; the output names each step (`server typecheck`, `server lint`, `server unit tests`, `client typecheck`, `client lint`, `client tests`, `reviewer-core tests`) and marks each passed.
- CLI: the negative check recorded in the experiment file — after temporarily adding `import OpenAI from 'openai'` to `server/src/modules/eval/scoring.ts`, `pnpm verify:l06` exits non-zero at `server unit tests`; the import is then reverted.
- Screenshot: `specs/10-spec-eval-pipeline/screenshots/05-compare-improved-prompt.png` — Compare of base → improved prompt showing both version labels, non-zero recall/precision deltas and the prompt diff.
- Screenshot: `specs/10-spec-eval-pipeline/screenshots/06-compare-degraded-prompt.png` — Compare of base → deliberately degraded prompt with a negative precision delta visible.
- File: `specs/10-spec-eval-pipeline/10-experiment-eval-pipeline.md` lists the three prompt texts, the run ids and the metric table; contains no keys or real secrets.

#### 6.0 Tasks
- [x] 6.1 Add `scripts/verify-l06.sh` (set -euo pipefail; prints `==> <step>` and a final summary) running: `server` typecheck, lint, hermetic vitest; `client` typecheck, lint, test; `reviewer-core` `npm test`. Add `"verify:l06": "bash scripts/verify-l06.sh"` to the root `package.json`.
- [x] 6.2 Run `pnpm verify:l06` and fix any failure in the touched packages; record the green output.
- [x] 6.3 Do the negative check from the proof artifact and revert it.
- [x] 6.4 Run the experiment on the seeded agent with a real provider key: (a) base prompt, (b) improved prompt (adds explicit rules for the seeded categories), (c) degraded prompt (adds "flag every changed line, including unused imports and style"). Confirm (b) moves recall/precision up relative to (a) and (c) lowers precision; if a movement is below 1 percentage point, repeat the run up to 3 times, then adjust the prompt text, not the scoring. The deterministic scoring tests (2.0) remain the proof that the logic itself is sensitive; the live experiment shows it end to end.
- [x] 6.5 Capture screenshots 05 and 06 from the Compare modal; write `10-experiment-eval-pipeline.md`.
- [x] 6.6 Final pass: check the spec's AC-1…AC-28 against the evidence; leave the final validation to `/sdd-4-validate-spec-implementation`. Invoke `engineering-insights` for server and client.
