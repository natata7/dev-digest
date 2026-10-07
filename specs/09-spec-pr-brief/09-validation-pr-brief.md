# 09 — Validation: PR Brief

Verifier: plan-verifier, range `2b20af0..HEAD`. Spec: [09-spec-pr-brief.md](09-spec-pr-brief.md). Plan: [09-plan-pr-brief.md](09-plan-pr-brief.md) incl. amendments A1–A13.

## Verdict
No blockers. All automated checks green; every AC/NFR with an automated test is Verified; A1–A13 are reflected in code.

| Check | Result |
|---|---|
| `diff` of both `brief.ts` contract copies | empty |
| server `pnpm typecheck` / `pnpm lint` | pass |
| server hermetic vitest | 41 files, 498 tests pass |
| server `brief.it.test` (Postgres) | 4/4 pass |
| client `pnpm typecheck` / `pnpm lint` | pass |
| client `pnpm test` | 41 files, 272 tests pass |
| e2e `npm run typecheck` | pass (flow `08-pr-brief` NOT run, needs live stack) |
| Do-not-touch (lock files, migrations, vendor) | respected; only the two `brief.ts` copies under vendor changed |

## Coverage (summary)
Verified with tests: AC-1, 2, 4–15, 18–21, 23–36; NFR-1–5; E1–E22 (see spec edge-case table).

Not Verified (manual / browser only):
- AC-3 two-column breakpoint (grid is `auto-fit minmax(440px,1fr)`, plan D12) — check at 1280 / 800 px.
- AC-16 / AC-17 real scroll to file/line (jsdom tests assert `scrollIntoView`; e2e flow exists but was not run).
- AC-22 skeleton visuals; NFR-6 keyboard pass; E23 (restart during generation, behaviour covered by AC-10).
- Real provider call with a configured `risk_brief` key (tests stub the LLM).

## Minor follow-ups
- AC-22: on Refresh the old brief stays visible with the button disabled (skeleton only when no brief). Amend spec or show skeleton on refresh.
- AC-17: no test for "line outside rendered hunks → scroll to header" branch.
- `buildFactsMessage` reports `truncated.description = false` when only the 800-token section cap clips the description (log under-reports).

## Spec needs update (drift)
- D1: "attached specs" = Project Context docs of enabled agents (already edited in the spec).
- AC-22: refresh behaviour above.
- AC-3 / layout: brief card on top, Intent + Blast side by side below (follows user screenshots; risks are a list inside the brief card).
- AC-33: client disables on `pr.files.length === 0`.
- Contract: `PrBrief.risks` stays `{ risks: Risk[] }`.

## UI gate
Mockups were supplied. The screens were NOT visually compared in a browser in this run.

## Resolved after the first report (live browser check, demo repo PR #28 + unit tests)
- AC-16 / AC-17: clicked Review focus item #1 on PR #28 → `?tab=diff&file=…&line=1`, Files changed opened on that file, line highlighted and in view. New test: focused line outside rendered hunks → scrolls to the card header (`FileCard.test.tsx`).
- AC-22: refresh now shows the skeleton in place of the old brief (`useBriefGenerating`, shared across component instances); previous brief is kept on failure. Verified live (skeleton → new brief) and in `PrBriefCard.test.tsx`. Spec already matched.
- AC-3 / AC-33 / layout drift: spec text updated to the shipped layout.
- Reload persistence: one `GET /pulls/:id/brief`, no `POST`, summary rendered immediately.
- Grounding on real data: 7 risks + 8 focus items from a real `risk_brief` model run; 0 paths outside the PR diff ∪ Blast map.
- Real provider call with a configured `risk_brief` key: done (OpenRouter `deepseek/deepseek-v4-flash`, 2 attempts of one call, ≈$0.0014).
- Checks: client `vitest` 290/290, `typecheck`, `lint` pass.

Still manual / not done: NFR-6 keyboard pass, E23 (restart mid-generation), e2e flow `08-pr-brief` (needs `agent-browser`), demo video.
