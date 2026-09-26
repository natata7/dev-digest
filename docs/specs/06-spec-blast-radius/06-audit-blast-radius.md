# 06-audit-blast-radius.md

## Executive Summary
- Overall Status: PASS (re-audit run 2)
- Required Gate Failures: 0 (was 2)
- Flagged Risks: 0 open (2 remediated)

## Gateboard

| Gate | Status | Why it failed (≤10 words) | Exact fix target |
|------|--------|---------------------------|------------------|
| Requirement-to-test traceability | PASS | Fixed: 1.4 pass-through + grep; 2.7 Resync POST | — |
| Proof artifact verifiability | PASS | — | — |
| Repository standards consistency | PASS | Fixed: `concise\|detailed\|json`, exception documented (6.1) | — |
| Open question resolution | PASS | OQ1 resolved in 1.3; OQ2 in 5.2/5.4 | — |
| Regression-risk blind spots | PASS | Fixed: caching (5.4, 5.6) + OverviewTab test (2.8) | — |
| Non-goal leakage | PASS | — | — |

## Standards Evidence Table

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` / `CLAUDE.md` (root) | yes | Contracts only in `server/src/vendor/shared` + mirror; snake_case REST; colocated components; tests next to source; `feat:`/`fix:`; no lockfile/migration edits | — |
| `server/AGENTS.md` | yes | `*.it.test.ts` = integration, else hermetic; read INSIGHTS.md first; `engineering-insights` at end | "`src/vendor/` do-not-touch" vs root "edit `server/src/vendor/shared`" — resolved: root rule is specific, shared is source of truth |
| `client/AGENTS.md` | yes | Data only via `src/lib/hooks`; thin pages; `_components/<Name>/` with own test; tests mock fetch | — |
| `mcp/AGENTS.md` | yes | ≤2-sentence descriptions; compact text output (not JSON); `fence()` for repo text; `ToolError` with next step; `format.ts` type-only imports; npm | Spec says `response_format: markdown|json`; code uses `ResponseFormat = 'concise' \| 'detailed'` (`mcp/src/format.ts:13`) and AGENTS says "not JSON" — resolved in run 2: enum `concise | detailed | json`, `json` documented as deliberate exception (spec Unit 3, tasks 3.2, 6.1) |
| `TESTING.md` | yes | Hermetic by default via `adapters/mocks.ts`; path-filtered CI per package | — |
| `README.md` | yes (sections) | MCP usage, testing & CI overview | — |
| `.github/workflows/*.yml` | listed | Per-package CI lanes (client, mcp, server-unit, server-integration) | — |
| `CONTRIBUTING.md`, `.github/pull_request_template.md` | not found | — | — |

## Findings

### REQUIRED Failures
1. **Two functional requirements have no test artifact.**
   - Missing item: (a) Unit 1 FR "shall NOT re-apply limits or filtering" — no test proves the mapper passes callers through uncapped/unfiltered. (b) Unit 2 FR "Resync … refetches the blast when the index updates" — 2.7 checks the button renders, not that it calls `POST /repos/:id/resync`.
   - File section to edit: `06-tasks-blast-radius.md > ## Tasks > 1.0 > 1.4` and `> 2.0 > 2.7` (+ 2.0 Proof Artifact bullet 1).
   - Acceptance condition: 1.4 includes "25 callers for one symbol in → 25 out; no `MAX_CALLERS_PER_SYMBOL`/`BFS_DEPTH` literal in blast module or client"; 2.7 includes "clicking Resync issues `POST /repos/<id>/resync`".

2. **MCP `response_format` conflicts with repo pattern.**
   - Missing item: spec Unit 3 says `markdown` (default) | `json`; existing tools use `'concise' | 'detailed'` and `mcp/AGENTS.md` mandates compact text, not JSON. Task 3.2 defers to "audit/remediation decision".
   - File section to edit: spec `### Unit 3` FR 3 and Technical Considerations; tasks `## Tasks > 3.0` (3.2, Proof Artifact 1); `mcp/AGENTS.md` conventions line (task 6.1).
   - Acceptance condition (proposed): enum = `concise` (default) | `detailed` | `json`; `json` is a documented deliberate deviation — returns the route's `BlastRadius` verbatim for browser parity (Q6 answer), and `mcp/AGENTS.md` notes this exception.

### FLAG Findings
1. **Prior PRs fan-out to code-host API.**
   - Risk: up to 10 files × (commits + associated PRs) ≈ 20+ GitHub/GitLab calls per Overview view, repeated on every refetch; slow page and rate-limit pressure.
   - Suggested remediation: in 5.6 set `staleTime: Infinity` on `usePrHistory` (history of merged PRs doesn't change during a session); in 5.4 add a small in-memory cache keyed by `prId + head_sha`.
2. **Overview prop change regressions.**
   - Risk: 2.3 changes `OverviewTab` props and layout; existing `IntentCard` tests / page render could break unnoticed.
   - Suggested remediation: in 2.8 explicitly run `IntentCard.test.tsx` and add one `OverviewTab` render test that mounts both cards.

## User-Approved Remediation Plan
- Approved and Completed (2026-09-26):
  1. Edit task 1.4 and 2.7 (+ 2.0 proof bullet) as per REQUIRED #1.
  2. Adopt `concise | detailed | json` for `get_blast_radius`; update spec Unit 3 + task 3.2/3.0 proof + task 6.1 (AGENTS note).
  3. (FLAG) Add caching to 5.4/5.6 and the OverviewTab regression test to 2.8.

## Re-Audit Delta (run 2)
- Changed gate statuses: Requirement-to-test traceability FAIL→PASS; Repository standards consistency FAIL→PASS; Regression-risk blind spots FLAG→PASS.
- Still-failing REQUIRED gates: none.
- Newly introduced findings: none. Checked: spec Unit 3 FR + proof now say `concise/detailed/json` (no stale `markdown` refs in spec/tasks); task 1.4 grep is scoped to blast module + `BlastRadiusCard` (no false positives from unrelated `20` literals); caching adds a service test in 5.0 proof artifacts.
