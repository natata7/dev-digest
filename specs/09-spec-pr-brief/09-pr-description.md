# feat: PR Brief — Why + Risk summary on the Overview tab

## What
A **PR Brief** block on the PR Overview tab. No brief yet → **Generate brief**. After generation:
a summary (what the PR does and why), **Risk areas** (title + file, expandable explanation) and
**Review focus** (`file:line` + reason). Intent and Blast radius sit next to it; if an input is missing the card says so
("Generated without: description").

- Click a Review focus item or a risk file → **Files changed** opens on that file and scrolls to / highlights the line
  (`?tab=diff&file=…&line=…`). File not in the diff → "File not in this PR's diff".
- The brief is stored per PR and shown immediately after a reload (one `GET`, no model call). The refresh button regenerates it
  (skeleton while it runs; on failure the previous brief is kept).
- Cached by `head_sha`: after a new commit the card shows "PR updated since this brief was generated" + Regenerate.

## How
- **One model call** (`completeStructured`, built-in schema re-prompts count as attempts), model from the `risk_brief` setting.
- Input = facts only, ≤ 8,000 estimated tokens with per-section caps; **no diff hunk bodies** (only changed-line ranges).
- The reply is validated by `PrBriefDraft`; every `file_refs`/`review_focus.file` must be in the PR diff or the Blast radius map
  (otherwise dropped), focus lines snap to a real hunk line. `summary` and `review_focus` added to **both** `brief.ts` copies (identical).
- UI strings come from `client/messages/en/brief.json`; the banner reuses `VerdictBanner` (verdict + PR score of the latest review).

## Demo (demo repo, real PR #28 `release`, 141 files)
Real run through OpenRouter `deepseek/deepseek-v4-flash`: 8 risks, 8 focus items, 0 ungrounded paths, 2 attempts of one call, ≈$0.0014.
Screenshots: [`docs/demo/pr-brief/`](../../docs/demo/pr-brief). Demo video: _attach before opening the PR_ (not recorded by an agent).
Seeded PR #482 (`acme/payments-api`) has a deterministic brief for the e2e flow `08-pr-brief`.

## Process
- Spec: [`09-spec-pr-brief.md`](09-spec-pr-brief.md) (spec-creator) · Plan: [`09-plan-pr-brief.md`](09-plan-pr-brief.md) (implementation-planner).
  Both were committed before the feature code (`2b20af0` precedes `ff05d8d`).
- **Cross-model review:** the plan was reviewed by `claude-opus-5-5` (a different model from the Sonnet implementers/planner).
  It found 4 major issues — async Smart Diff focus (A1), S5/S6 prop seam (A2), patch-less seed (A3), join-before-scoping (A4) —
  plus 9 minor ones; all folded in as amendments A1–A13 before any code was written.
- Final plan-verifier report: [`09-validation-pr-brief.md`](09-validation-pr-brief.md) — no open requirements (see its "Resolved" section).
- Workflow retro: [`docs/retro/ledger.md`](../../docs/retro/ledger.md). Cost report: [`09-cost-report.md`](09-cost-report.md).

## Checks
server hermetic 498 ✓ · server `brief.it` 4/4 ✓ · client 290 ✓ · typecheck/lint (server, client, e2e) ✓.
