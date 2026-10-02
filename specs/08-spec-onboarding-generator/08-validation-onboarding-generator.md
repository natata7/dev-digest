# 08-validation-onboarding-generator.md

Date: 2026-10-03 · Source: plan-verifier report · Spec: [08-spec](08-spec-onboarding-generator.md) · Plan: [08-plan](08-plan-onboarding-generator.md)

Commits: spec `7f71d75` · plan `3288fa9` · impl `53151a6` (S1–S4, S6, S7) · client fix `79e48f2` (AC-4, AC-33) · tests `28df435` (S5, S8).

## Gates (all green)

| Gate | Result |
|---|---|
| server typecheck / lint | clean |
| server hermetic vitest | 430 passed |
| server `.it.test` (Postgres via Testcontainers) | 67 passed |
| client typecheck / lint | clean |
| client vitest | 203 passed |

Vendored edits: only the 3 sanctioned (`server` + `client` `contracts/knowledge.ts`, `client/src/vendor/ui/nav.ts`). No migrations, no lock files.

## Coverage matrix (AC → task → test → commit)

Tests: SF `onboarding-facts` · SH `onboarding-helpers` · SS `onboarding-service` · SI `onboarding.it` · SR `repo-intel-onboarding-reads` · SC `contracts` (all `server/test/`) · CV `OnboardingTourView.test.tsx` · CU `OnboardingTourView/helpers.test.ts` · CH `app-shell/helpers.test.ts`. Commits: I = 53151a6, C = 79e48f2, T = 28df435.

| Req | Task | Test | Commit | Status |
|---|---|---|---|---|
| AC-1 | S6 | CH | I, T | Verified (unit) — browser check open |
| AC-2 | S4, S7 | SI, SS, CV | I, T | Verified |
| AC-3 / E21 | S1, S4, S7 | SC, SI, SS, CV | I, T | Verified |
| AC-4 / E1 | S7 | CV | C | Verified (initial impl was wrong; fixed in 79e48f2) |
| AC-5 | S4 | SI, SS | T | Verified |
| AC-6 / E19 | S4 | SI, SS | T | Verified |
| AC-7 / E16 | S4, S7 | SS, CV | I, T | Verified |
| AC-8 / E6, E8, E9 | S3 | SF | T | Verified (D7 cap is extra-spec) |
| AC-9 / E20 | S3 | SF | T | Verified |
| AC-10 | S3 | SF | T | Verified |
| AC-11 | S2, S3 | SR, SH | T | Verified |
| AC-12 / E7 | S2, S3 | SR, SH | T | Verified |
| AC-13 | S2, S3 | SR, SH | T | Verified (root-junk workaround, see drift) |
| AC-14 | S3, S7 | SH, CV | T | Verified |
| AC-15 | S2, S3 | SH, SF, SR | T | Verified |
| AC-16 / E8 | S3, S7 | SH, CU, CV | T | Verified |
| AC-17 / E20 | S3 | SH | T | Verified |
| AC-18 / E3 | S4 | SS | T | Verified (D2 drift) |
| AC-19 / E11 | S3 | SH | T | Verified |
| AC-20 / E12 | S3 | SH | T | Verified |
| AC-21 / E10 | S3 | SH | T | Verified |
| AC-22 | S4 | SS | T | Verified |
| AC-23 / E15 | S4 | SS, SI | T | Verified |
| AC-24 | S6 | CH | I, T | Verified (unit) — browser + e2e `06-onboarding.flow.json` open |
| AC-25 / E2, E4, E5 | S3, S4 | SH, SS, SI | T | Verified |
| AC-26 | S3 | SH | T | Verified |
| AC-27 / E13 | S3, S4 | SS, SH | T | Verified (stub throws adapter message) |
| AC-28 / E14 | S4, S7 | SS, CV | T | Verified |
| AC-29 | S7 | CV, CU | T | Verified |
| AC-30 | S7 | CV | T | Verified |
| AC-31 | S7 | CV (mermaid mocked) | T | Verified (mock only) |
| AC-32 | S7 | CV | T | Verified |
| AC-33 | S7 | CV | C | Verified (fixed in 79e48f2) |
| AC-34 / E17 | S3, S4 | SH, SS | T | Verified |
| AC-35 / E18 | S3 | SF | T | Verified |
| AC-36 | S7 | CV | T | Verified (jsdom only) |
| AC-37 | S7 | CV | T | Verified |
| AC-38 | S3, S4, S7 | SH, SS, CV | T | Verified |
| NFR-1 | S4, S9 | — | — | **Not Verified** (no timing) |
| NFR-2 | S3, S9 | — | — | **Not Verified** (no timing; log has no fact-collection split) |
| NFR-3 | S4 | SS, SI | T | Verified |
| NFR-4 | S3 | SF | T | Verified |
| NFR-5 | S4 | SS | T | Verified |
| NFR-6 | S7 | CV (roles) | T | **Not Verified** (keyboard pass manual) |

## Open rows before merge

1. AC-1 browser: sidebar entry visible for selected repo, opens `/repos/:repoId/onboarding`.
2. AC-24 browser + e2e (`e2e` `npm test`, needs `./scripts/dev.sh`): highlight only on the repo route, none on `/onboarding`.
3. NFR-1: GET p95 ≤ 300 ms on seeded stack — unmeasured.
4. NFR-2: fact collection ≤ 5 s at 5,000 files — unmeasured; add a `factsMs` log field first.
5. NFR-6 keyboard pass (Generate, Regenerate, Resync).
6. Real-browser check of mermaid (AC-31), Markdown/raw HTML (AC-36), generate flow with/without provider key, Resync UX.
7. Plan step S9 (README route maps, INSIGHTS) not done.
8. Plan decisions D0–D17 are still "pending user veto"; D2 and D7 change spec semantics.

## Spec needs update (drift)

| Item | Change | Proposed spec edit |
|---|---|---|
| AC-18 / NFR-3 (D2) | `maxRetries: 0` + outer `withTimeout(90s)`; transport retries off, a timed-out request may still be billed | State that "one call" means no schema re-prompt or transport retry |
| AC-8 / AC-17 (D7) | `DEPS_PER_MANIFEST_MAX = 50` added to guarantee the token budget | Add the per-manifest dependency cap |
| AC-13 | `isJunkPath` misses root-level `tests/`, `migrations/`; onboarding has a local `ROOT_JUNK_RE` workaround, repo-intel gap untouched | Decide: fix `isJunkPath`, or accept the local rule |
| Test infra | `MockLLMProvider` schema-failure message classifies as `llm_failed`, real adapters as `llm_invalid_output` (recorded in `server/INSIGHTS.md`) | none (not a spec change) |

## Architecture review

`architecture-reviewer` on 53151a6: no violations. Notes: client/server `knowledge.ts` differed before this work (pre-existing drift); repositories are built inside the service constructor (matches plan).
