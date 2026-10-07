# 08-validation-2-onboarding-generator.md

Date: 2026-10-03 · Source: plan-verifier (spec rev 2) · Spec: [08-spec](08-spec-onboarding-generator.md) · Plans: [08-plan](08-plan-onboarding-generator.md), [08-plan-2](08-plan-2-onboarding-generator.md) · Supersedes the changed rows of [08-validation](08-validation-onboarding-generator.md)

Commits: rev-2 spec `c4cac72` · plan 2 `1466bf1` · impl `8a6aec3` · tests `413ceae` · UI-gate fixes `d32e368` · AC-32 fix `7267e61` (rev 1: `53151a6`, `79e48f2`, `28df435`).

## Gates (all green)

| Gate | Result |
|---|---|
| server typecheck / lint | clean |
| server hermetic vitest | 456 passed |
| server `.it.test` (Postgres) | 65 passed, 2 skipped (`repo-intel-symbol-clamp`) |
| client typecheck / lint | clean |
| client vitest | 238 passed |

No migrations, no lock files. Vendored edits: only the sanctioned (both `contracts/knowledge.ts`, `client/src/vendor/ui/nav.ts`).

## Result

ACs 1–55: **52 Verified, 3 Not Verified** (AC-46, AC-50, AC-54 — CSS that jsdom cannot check). NFR-1, NFR-2, NFR-6: Not Verified. "Verified" = automated test passes (jsdom, stubbed clipboard, mocked mermaid); a real browser saw only a skeleton tour (UI gate: sidebar order/icon, header/breadcrumb, TOC ≥1280 visible / <1280 hidden, card collapse, Copy rows, reading list without score, first-task card, footer).

Full per-AC matrix: see plan-verifier report rows; unchanged rev-1 ACs keep the evidence in `08-validation-onboarding-generator.md`. Rev-2 test files: `server/test/onboarding-{helpers,service,facts}.test.ts`, `onboarding.it.test.ts`, `contracts.test.ts`; client `OnboardingTourView.test.tsx`, `OnboardingTourView/helpers.test.ts`, `app-shell/helpers.test.ts`.

## Open rows before merge

1. AI-content rendering in a real browser: mermaid, critical-path rows + Open (AC-44/45), 3-up first-task grid (AC-46), LLM `why`/`note`. The one real-provider run gave an `llm_invalid_output` skeleton.
2. AC-50 exact 1280/1279 px boundary and real scroll-spy.
3. AC-46 container query (wrap below 900 px content width).
4. AC-54 visual ellipsis; Copy/Open stay visible.
5. AC-47/AC-48 real clipboard click (Copy, Share link, manual-copy fallback).
6. AC-7 Outdated badge and AC-28/29/30/32 banners; Regenerate click, in a real browser.
7. Light theme.
8. AC-24 in a browser + e2e `06-onboarding.flow.json` (not run).
9. NFR-1 (GET p95 ≤ 300 ms) and NFR-2 (fact collection ≤ 5 s at 5,000 files) unmeasured; log has no `factsMs`.
10. NFR-6 keyboard pass.
11. Plan 2 step R2-S6 (README route maps, INSIGHTS: CSS module / container-query precedent) not done.
12. Decisions D18–D30 (and D2/D7) still "pending user veto".

## Issues

| Severity | Issue | Recommendation |
|---|---|---|
| High | Real model (DeepSeek) returned invalid JSON once → skeleton, because of one attempt / `maxRetries: 0` (D2) | Retest with a strict-JSON-capable model; decide on one schema retry or accept and amend AC-18/NFR-3 |
| Medium | In-progress polling (`OnboardingTourView.tsx`) has no cap | Add max attempts / backoff |
| Medium | CSS-only ACs unverified (46, 50, 54) | Browser check at 1279/1280 px and <900 px content |
| Low | Mockup deviations not recorded in spec as intentional | Record in spec |

## Spec drift (Spec needs update)

- AC-18 / NFR-3 (D2): `maxRetries: 0` + outer 90 s timeout; a timed-out request may still be billed.
- AC-8 / AC-17 (D7): `DEPS_PER_MANIFEST_MAX = 50` is not in the spec.
- AC-13: `isJunkPath` misses root-level `tests/`, `migrations/`; local `ROOT_JUNK_RE` workaround.
- D20: LLM output keys `run_steps`/`first_tasks` are required-nullable (strict JSON), contract fields stay optional.
- AC-41 drops the mockup's sample steps (`pnpm install`, `cp .env.example …`) — real tours show fewer steps than the mockup.
- D24: run-step/first-task fallback does not make a tour `partial`.
- Polling for concurrent generation has no cap.
- Mockup deviations: no complexity badge, no tier-coloured diagram nodes, no clickable path chips, no mobile layout, "Copied" as a text line (not toast), Share link copies the local URL only.
- `MockLLMProvider` schema-failure message classifies as `llm_failed`; real adapters as `llm_invalid_output`.

## Architecture review (rev 2)

No blocking violations. Notes: first `*.module.css` in the client (only for media/container queries); `UNAVAILABLE_PREFIX` duplicated server/client (D26); one inline style left at `SectionContent.tsx:52`.
