---
description: Spec-driven implementation — runs a ready Implementation Plan via implementer agents, then architecture review + fix loop, then plan-verifier. Does NOT run specreator, implementation-planner or test-writer.
argument-hint: <plan-or-spec path> [extra requirements text] [figma url / design image paths]
---

You are the orchestrator of an implementation run. Input: `$ARGUMENTS`

Out of scope by decision: writing the spec (`specreator`), planning (`implementation-planner`), writing new tests (`test-writer`). Never launch them. Keep your own context small: ask every subagent for a short report and don't paste their output back.

## 0. Parse input

From `$ARGUMENTS` take: the **plan file** (`*-plan-*.md`; if only a spec path/folder is given, look for the plan in the same folder), the **spec** (AC-N source), **extra requirements** (free text), **designs** (Figma URLs, image paths).
No plan found → stop and tell the user to run `implementation-planner` first (and save its output to `<spec folder>/NN-plan-<feature>.md`). Don't invent a plan.

Read the plan and the spec once. **Plan gate:** if the plan header has no `Approved: YYYY-MM-DD` line, stop and ask the user (AskUserQuestion) to review the plan and confirm; on yes, write that line into the plan header and continue. Never run an unreviewed plan. Extract: steps with dependencies, AC-N per step, files owned per step, skills per step, the INSIGHTS digest, verify scope. If steps lack file ownership, derive it from the plan text; if two parallel steps would touch the same file, serialize them.

Before launching anything, list every edit the plan makes to a vendored/do-not-touch file (e.g. `client/src/vendor/ui/nav.ts`) and ask the user once whether to proceed; record the answer in the implementer prompt.

## 1. Implement

- Steps that change shared contracts (`server/src/vendor/shared`) go first, alone.
- Then launch independent steps/packages **in parallel** (several `implementer` Agent calls in ONE message). Dependent steps wait.
- Each implementer prompt contains: its step text, AC-N, files owned, skills to load, the INSIGHTS digest, relevant designs, relevant extra requirements. Nothing else.
- Designs: pass image paths verbatim to every UI step and tell it to `Read` them; never replace them with your own text summary. Put mockup-specific facts (placement, copy, hidden controls) in the prompt only as additions to the images, and check them against the images yourself (the user's text can disagree with the mockup — flag it, follow the mockup).
- Parallel steps with a dependency between them: state the exact signature and where it is wired (container getter, `_shared` schema) in BOTH prompts. No stubs, no inline `new` of another module's service, no cross-module imports of schemas.
- Reject (re-ask once) an implementer report with no `Read:` line.
- A contract step must update the fixtures/tests that parse the changed DTO and run the related tests, not only typecheck.
- After each batch: tick the step's checkbox in the plan file; if an implementer reports a deviation or a "needs from others", resolve it (one more implementer call) before moving on. The repo has no sync script and `client/src/vendor/shared` already differs from the server copy, so never copy whole files. After a contract step, if the client needs it, have the implementer apply the *same hunk* by hand to the matching file under `client/src/vendor/shared` (the one sanctioned edit there); if the hunk doesn't apply cleanly, don't force it — list it for the user.

## 2. Architecture review + fix loop (max 2 rounds)

1. Run `architecture-reviewer` once on the full `git diff` (changed files only).
2. No findings, or only `PLAUSIBLE` ones → note them and go to step 3. `CONFIRMED` findings → group by package and send each group to an `implementer` (fix mode: exact findings, files they cover). Parallel across packages.
3. After a fix round, re-run `architecture-reviewer` **only on the files changed in that round**. Round 2 only for still-open `CONFIRMED` findings. After round 2, anything left goes into the final report — don't loop further.

## 3. Verify (once)

Run `plan-verifier` with the spec path (AC-N), the plan path, and "tests were deliberately not written in this run — report missing test coverage as a note, not as Not Verified; UI/browser-only AC → Not Verified (manual/e2e)". It runs the full typecheck/test/lint per touched package — nobody else does.
Not Verified items that are code gaps → one fix round via `implementer`, then re-run the verifier on those items only. Save the verifier's report to `<spec folder>/NN-validation-<feature>.md` (you write it; the verifier can't).

### 3b. UI gate (only when designs were supplied)
Either compare the real screens with the mockups (start the stack with `./scripts/dev.sh`, drive it with the Playwright MCP tools, screenshot each mockup's screen) or say explicitly in the final message that the UI was **not visually verified**. Never report a UI feature as done on typecheck/lint/tests alone.

## 4. Spec drift check

Collect everything that makes the spec stale: implementer deviations, contract changes in `server/src/vendor/shared` (DTO/field/endpoint differs from the spec), requirements the user added via extra requirements, `Not Verified` items caused by a spec/code mismatch. For each, list `AC-N → what changed → proposed spec edit`. Do NOT edit the spec and do NOT launch `specreator`; put the list in the final message under "Spec needs update" so the user (or `specreator` in edit mode) updates it. No drift → say "spec in sync".

## 5. Wrap up

- If the run produced a non-obvious lesson, append one entry to the touched module's `INSIGHTS.md` per `.claude/skills/engineering-insights/SKILL.md` (once, here — implementers don't).
- Final message (short): steps done, files changed (count + packages), review findings fixed / left, verifier verdict with the Not Verified list, spec drift list (or "spec in sync"), validation file path, and the manual items for the user (e.g. browser check). Don't commit.
