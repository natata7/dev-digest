# Task 5.0 Proofs – Client UI: Evals tab, Eval Dashboard, sidebar entry, Compare modal

## Task Summary
Added the Evals tab to the Agent editor (metric tiles with ▲/▼ deltas, case list with Run / Edit / Delete, "Run all evals", case editor modal, run history), the `/eval` Eval Dashboard (all agents + recent runs), `/eval/:agentId` (metrics, regression alert, trend chart, runs table, two-run Compare), the Compare modal (metric deltas + line diff of the system prompt), and the "Eval Dashboard" sidebar item.

## What This Task Proves
- The case list shows kind and last-run state and counts passing cases; run history shows duration and cost (AC-8, AC-25).
- "Run all evals" starts one run and the button is disabled and reads "Running…" while it runs (AC-9, AC-13a).
- Metric tiles show deltas in points; the dashboard shows the regression alert (AC-19, AC-21).
- Compare is disabled unless exactly two runs are selected, orders them older → newer, highlights the changed prompt line, and reports identical prompts (AC-22, AC-23, AC-24).
- The sidebar has "Eval Dashboard" in SKILLS LAB and `/eval[/…]` activates it (AC-20).
- The expected-output editor blocks Save on invalid JSON.

## Evidence Summary
`pnpm test` in `client`: 51 files, 318 tests pass (new: EvalsTab 5, AgentEvalView 2 + 4 helpers, CompareRuns 2 + 3 diff helpers, EvalOverviewView 2, eval-metrics 3, nav 1, activeKeyFor 1). Typecheck and lint are clean.

## Artifact: Component tests
**Command:** `cd client && pnpm exec vitest run src/app/eval src/app/agents src/components`
**Result summary:** all pass; hooks are mocked, so these prove the UI behavior, not the API contract (the API is covered by the server integration tests in 4.0).

## Artifact: Quality gates
**Command:** `cd client && pnpm typecheck && pnpm lint && pnpm test`
**Result summary:** exit 0; 318 tests.

## Artifact: Screenshots
`specs/10-spec-eval-pipeline/screenshots/02-evals-tab.png`, `03-eval-dashboard.png`, `04-compare-modal.png` — captured from the running app together with the experiment runs in task 6.0 (see its proof file), because they need real run data.

## Note
`client/src/vendor/ui/nav.ts` is vendored but is the only definition of the sidebar; earlier features (`53151a6`, `b192a6e`) edited it the same way. The existing `AgentEditor.test.tsx` asserted "no Evals tab"; it now asserts the Evals tab exists.

## Reviewer Conclusion
The UI behaviors required by the acceptance criteria are implemented and covered by component tests; visual evidence follows in 6.0.
