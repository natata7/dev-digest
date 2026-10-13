# Task 3.0 Proofs – One-click "Turn into eval case"

## Task Summary
`POST /findings/:id/eval-case` turns a finding into an eval case for the agent that produced it: accepted → `must_find`, dismissed → `must_not_flag`, undecided → the caller's choice (default `must_find`). The case stores a diff fragment (the finding's file, hunks within ±20 lines of the range, secrets masked) and the `file:start_line-end_line` expectation. The FindingCard has a "Turn into eval case" button wired through `FindingsPanel`.

## What This Task Proves
- Both expectation types are created from real findings, with the right `file:line` (AC-1, AC-2, AC-3).
- A repeat click never creates a duplicate (AC-5) and the UI sends one request per click (E8).
- A deleted/unknown agent is rejected with 409 `agent_not_found` (AC-6); another workspace's finding is 404.
- The stored fragment is small, masked (`sk_live_********`) and rejected if the finding is outside the diff (AC-7, E12, NFR-4).

## Evidence Summary
Server: 8 service tests, 8 helper tests and 2 integration tests (real Postgres) pass. Client: 4 new FindingCard tests and 1 FindingsPanel test pass; typecheck, lint and the full suites of both packages are green.

## Artifact: Server tests
**Commands:** `cd server && pnpm exec vitest run src/modules/eval/service.test.ts src/modules/eval/helpers.test.ts`; `pnpm exec vitest run src/modules/eval/routes.it.test.ts`
**Result summary:** `service.test.ts` 8 passed (must_find, must_not_flag, undecided default/explicit, masking, duplicate, deleted agent, foreign workspace, outside-diff); `helpers.test.ts` 8 passed; `routes.it.test.ts` 2 passed — accepted → `must_find`, dismissed → `must_not_flag`, repeat → `created:false` with the same case id, foreign workspace 404, orphaned agent 409.

## Artifact: Client tests
**Command:** `cd client && pnpm test`
**Result summary:** 295 passed. `FindingCard.test.tsx` covers: one click → one call with no expectation for a decided finding; ignored while `pending`; "Eval case created" / "Eval case already exists" labels; undecided finding asks for "Should be found" / "Should not be flagged" before creating; no button when no handler. `FindingsPanel.test.tsx` covers the hook call with the finding id.

## Artifact: Screenshot
**Artifact path:** `specs/10-spec-eval-pipeline/screenshots/01-finding-card.png` — captured together with the UI screenshots of tasks 5.0/6.0 from the running app (see the 6.0 proof file); not part of this commit.

## Reviewer Conclusion
The one-click path works end to end on the server and in the component layer, with duplicate, masking and ownership guards covered by tests.
