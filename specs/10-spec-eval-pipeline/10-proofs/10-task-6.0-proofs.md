# Task 6.0 Proofs – `pnpm verify:l06`, sensitivity experiment, evidence

## Task Summary
Added the root script `pnpm verify:l06` (`scripts/verify-l06.sh`), ran the experiment on the seeded Security Reviewer with three prompts through the real review engine and scored the runs by code, and captured the UI screenshots.

## What This Task Proves
- `pnpm verify:l06` exits 0 on the final tree and exits 1 when `scoring.ts` imports an LLM client (AC-28, AC-15).
- Changing the system prompt visibly moves the metrics: v2→v3 recall 14% → 100%; v3→v4 precision 100% → 78% with a dashboard alert (AC-27).
- One click on a real finding creates an eval case (AC-1) and the whole flow works in the running app.

## Evidence Summary
Final `pnpm verify:l06` output below. The experiment record, run ids and metric table are in `10-experiment-eval-pipeline.md`. Screenshots are in `specs/10-spec-eval-pipeline/screenshots/`.

## Artifact: `pnpm verify:l06` (green)
**Command:** `pnpm verify:l06` (repo root)
```
==> server typecheck      passed
==> server lint           passed
==> server unit tests     Test Files 48 passed (48) · Tests 559 passed (559)
==> client typecheck      passed
==> client lint           passed
==> client tests          Test Files 52 passed (52) · Tests 322 passed (322)
==> reviewer-core tests   Test Files 4 passed (4) · Tests 30 passed (30)
verify:l06 OK            (exit 0)
```
The server integration suite (real Postgres) is not part of the script because it needs Docker; it was run separately: see below.

## Artifact: negative check
**What it proves:** the script fails if scoring stops being LLM-free.
**Procedure:** prepend `import 'openai';` to `server/src/modules/eval/scoring.ts`, run `pnpm verify:l06`, revert.
```
==> server unit tests
 FAIL  src/modules/eval/scoring.no-llm.test.ts > ... > scoring.ts imports nothing
 → scoring.ts must be dependency-free, found: import 'openai';
exit=1
```

## Artifact: screenshots
| File | Shows |
|---|---|
| `screenshots/01-finding-card.png` | "Turn into eval case" in the FindingCard action row (accepted finding, PR #482) |
| `screenshots/01b-eval-case-created.png` | the button after a real click (case created; the case was then deleted to keep the seeded set at 10) |
| `screenshots/02-evals-tab.png` | Agent → Evals tab: metric tiles with deltas, 7/10 passing, cases with kind and state |
| `screenshots/03-eval-dashboard.png` | `/eval`: all agents, last-run metrics and sparkline, recent runs |
| `screenshots/03b-eval-dashboard-agent.png` | `/eval/:agentId`: alert, tiles, trend chart, runs table with two runs selected |
| `screenshots/04-compare-modal.png`, `05-compare-improved-prompt.png` | Compare v2 → v3: recall 14% → 100% (▲ 86pt), prompt diff |
| `screenshots/06-compare-degraded-prompt.png` | Compare v3 → v4: precision 100% → 78% (▼ 22pt), prompt diff shows the added "Coverage mode" block |

## Findings made while capturing evidence (fixed)
- Importing a Zod schema as a runtime value from `@devdigest/shared` does not bundle in Next (the barrel re-exports `./x.js`); the case editor now validates locally and the server normalizes.
- A cost of \$0.002 was displayed as "\$0.00"; amounts below \$0.01 now show 4 decimals.
- The prompt diff showed the whole 5 KB prompt; unchanged stretches are now folded.
- Provider stalls on some requests: per-attempt timeout 60 s with one retry, concurrency 2, unique session id per execution.

## Reviewer Conclusion
The pipeline works end to end against a real database, the real review engine and a live model; scoring is code-only and guarded by a failing check; prompt changes move recall and precision as the acceptance criteria require.
