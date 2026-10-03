# 06-validation-blast-radius.md

## Executive Summary
- **Overall:** PASS — no gate tripped (A–F pass; open delivery items recorded as MEDIUM).
- **Implementation Ready:** Yes — every functional requirement of Units 1–5 is verified by passing tests and live evidence; only the delivery steps (demo video, pull request — tasks 6.3/6.4) remain, and they don't change code.
- **Key metrics:** 100% functional requirements Verified (46/46) · 100% proof artifacts working (13/13 files, all commands re-run green) · 61 files changed, all core files mapped to a requirement or an explicit user decision.

## Coverage Matrix

### Functional Requirements

| Requirement | Status | Evidence |
|---|---|---|
| U1-1 `BlastRadius` extended with optional `degraded`, `reason`, `indexed_sha`; client mirror identical | Verified | `server/src/vendor/shared/contracts/brief.ts`; `diff` server vs client copy → identical; commit `e830ab1` |
| U1-2 `GET /pulls/:id/blast` in `modules/blast`, response validated by `BlastRadius` | Verified | `routes.ts` response schema `{200: BlastRadius}`; `helpers.test.ts` `BlastRadius.parse(output)` |
| U1-3 changed files → `getBlastRadius` called exactly once | Verified | `service.test.ts` "calls getBlastRadius exactly once" |
| U1-4 flat callers grouped by `viaSymbol` | Verified | `helpers.test.ts` grouping cases; `blast-curl.json` |
| U1-5 per-group endpoints/crons from `factsByFile`; empty when absent | Verified | `helpers.test.ts` facts union + missing-`factsByFile` cases |
| U1-6 rank sort of groups and callers | Verified | `helpers.test.ts` sort case; live order `server.ts:88` (rank .97) first |
| U1-7 deterministic count summary, no model | Verified | `buildSummary` tests; live `"3 symbols · 6 callers · 3 endpoints · 1 cron"`; no LLM import in `modules/blast` (only a doc comment matches) |
| U1-8 `degraded`/`reason` pass through; `indexed_sha` from index state | Verified | `helpers.test.ts`, `service.test.ts`; UI `degraded.png` |
| U1-9 limits not re-applied; declaring file excluded by facade | Verified | 25-in → 25-out test; `grep MAX_CALLERS_PER_SYMBOL|BFS_DEPTH` in blast module + card → 0; `ratelimit.ts` absent from callers in `blast-curl.json` |
| U1-10 unknown PR → 404 | Verified | `service.test.ts` NotFoundError; live `curl …/00000000-…/blast` → `404` |
| U1-11 log shows index read only | Verified | `blast-log.txt`: single `blast served from index` line, no index job |
| U2-1 `useBlastRadius` hook in `lib/hooks` | Verified | `client/src/lib/hooks/blast.ts` |
| U2-2 block on Overview, colocated folder | Verified | `BlastRadiusCard/`; `OverviewTab.test.tsx`; `tree.png` |
| U2-3 summary row counts | Verified | `BlastRadiusCard.test.tsx`; `tree.png` |
| U2-4 collapsible symbols, callers `file:line`, endpoint pills, separate cron pills | Verified | RTL tests (collapse/expand, cron vs endpoint pills); `tree.png` |
| U2-5 link to exact line (GitHub + GitLab), `indexed_sha` → head fallback | Verified | `helpers.test.ts` URL cases; snapshot hrefs in `06-task-2-proofs.md` |
| U2-6 no-symbols / no-callers text | Verified | RTL `empty.noSymbols`, `noDownstream`, `noCallersRest`; `no-callers.png` |
| U2-7 degraded badge + reason + Resync → refetch | Verified | RTL Resync issues `POST /repos/repo-1/resync`; live `degraded.png` → Resync → `no-callers.png` (index `updatedAt` advanced) |
| U2-8 loading/error states don't break Overview | Verified | RTL error-state test |
| U2-9 strings from `blast.json` | Verified | `useTranslations("blast")`; keys in `client/messages/en/blast.json` |
| U3-1 stub replaced, PR ref resolved like other tools | Verified | `mcp/src/server.ts`; `server.test.ts` |
| U3-2 `readOnlyHint: true`, short description, size guard | Verified | `server.test.ts` annotations + `tools/list` < 6000 chars |
| U3-3 `response_format` concise/detailed/json | Verified | `format.test.ts`, `server.test.ts`; `mcp-concise.txt` |
| U3-4 unknown PR → actionable `isError` | Verified | test + live inspector call (`06-task-3-proofs.md`) |
| U3-5 degraded stated explicitly | Verified | `format.test.ts` degraded warning line |
| U4-1 Tree/Graph toggle, Tree default | Verified | RTL `aria-pressed`; `graph.png` |
| U4-2 3-column graph from response only | Verified | `toGraph` tests; `graph.png` |
| U4-3 legend, aria-label, empty text | Verified | RTL tests |
| U4-4 truncated labels with full text on hover | Verified | `BlastGraph.tsx` `<title>`; snapshot shows full names as accessible names |
| U4-5 no new dependency | Verified | no `package.json`/lockfile change in the diff |
| U5-1 `GET /pulls/:id/history` → `PrHistory` | Verified | `service.test.ts` parse; live curl (`06-task-5-proofs.md`) |
| U5-2 port method + GitHub and GitLab adapters | Verified | `github-adapter.test.ts`, `gitlab-adapter.test.ts` |
| U5-3 capped work, retry/timeout wrappers | Verified | first-10-files test; adapters use existing `withRetry`/`withTimeout`/`request()` |
| U5-4 deterministic `notes`, no LLM | Verified | `toPriorHistory` tests |
| U5-5 error → empty history, block unaffected | Verified | `service.test.ts` warn + `{history: []}` |
| U5-6 collapsible UI with count, `repoPrUrl` links | Verified | `PriorPrs.test.tsx`; `prior-prs.png` (real GitLab MRs) |
| U5-7 cache per PR head sha (audit remediation) | Verified | `service.test.ts` cache hit / miss |
| (All other U1–U5 FR bullets are sub-points of the rows above) | Verified | — |

### Repository Standards

| Standard Area | Status | Evidence & Notes |
|---|---|---|
| Contracts changed only at source of truth + verbatim mirror | Verified | `brief.ts` identical in server and client |
| No migration / lockfile edits | Verified | diff contains neither |
| Server module layout (routes/service/helpers), container wiring | Verified | architecture review: no findings in server layers; reuses `container.reviewRepo` |
| Client: data via hooks, colocated `_components/<Name>/`, thin page | Verified | architecture review: no findings in client |
| MCP: `console.error` only, `fence()` for repo text, `ToolError` | Verified | review finding (unfenced `json`) fixed in `0fad940`; test asserts `<untrusted>` wrapper |
| Tests next to source; server unit lane hermetic | Verified | new smoke cases are DB-free (422 before handler); CI has no Postgres |
| Quality gates | Verified | server 368 tests, client 168, mcp 43; typecheck + lint clean in all three (re-run for this report) |
| Conventional commits | Verified | `feat:` ×3, `fix:` ×1, each "Related to T… in Spec 06" |

### Proof Artifacts

| Unit/Task | Proof Artifact | Status | Verification Result |
|---|---|---|---|
| T1 | `06-task-1-proofs.md`, `blast-curl.json`, `blast-log.txt` | Verified | live curl re-run: same summary, `degraded: false` |
| T2 | `06-task-2-proofs.md`, `tree.png`, `degraded.png`, `no-callers.png` | Verified | images embedded inline with paths; states match |
| T3 | `06-task-3-proofs.md`, `mcp-concise.txt` | Verified | output matches UI tree |
| T4 | `06-task-4-proofs.md`, `graph.png` | Verified | graph content correct (see LOW issue) |
| T5 | `06-task-5-proofs.md`, `prior-prs.png` | Verified | real GitLab MRs listed |
| Test suites | `pnpm/npm test` in server, client, mcp | Verified | all green |

## Validation Issues

| Severity | Issue | Impact | Recommendation |
|---|---|---|---|
| MEDIUM | Tasks 6.3 (demo video) and 6.4 (open PR with description + "which subagent did what") are still open (`06-tasks-blast-radius.md` §6.0). They are P1 course acceptance criteria, not spec FRs. | Homework cannot be submitted yet | Record the demo, open the PR L04 → main |
| MEDIUM | `server/src/db/seed.ts` + new `seed-blast.ts` are core files not listed in the task list's Relevant Files. Linked to the user's decision (seed test data for acme/payments-api) and to U1 proof. | Traceability gap only | Add both to Relevant Files |
| MEDIUM | P1 "≥2 real callers + ≥1 endpoint" is shown on seeded index data; the user's real repos (Laravel/Vue) yield at most 1 caller, 0 endpoints, since the indexer and endpoint extraction cover TS/JS routes only. | Reviewer may ask for real-repo evidence | Mention in the PR; optionally import a TS repo (e.g. DevDigest itself) for the demo |
| LOW | `graph.png` was captured before the toggle labels changed to "Tree"/"Graph"; `prior-prs.png` has a header overlap from the scroll container. | Cosmetic | Re-shoot if needed |
| LOW | Graph links every caller to all endpoints of its symbol (contract has no per-caller facts). | Graph may overstate edges | Documented in task 4 proof; extend contract only if needed |

## Evidence Appendix

**Commits analyzed (`17f84e0..HEAD`, 61 files, +3993/−28):**
- `e830ab1` feat: blast radius route + prior PRs history (server, contracts, seed, spec docs, T1 proofs)
- `e9b64ad` feat: get_blast_radius MCP tool (mcp, T3 proofs)
- `a664537` feat: Blast radius block (client, T2/T4/T5 proofs)
- `0fad940` fix: fence json output; docs

**Commands re-run for this report:**
```
server: vitest (unit) → 35 files / 368 passed · typecheck ok · lint ok
client: pnpm test → 34 files / 168 passed · typecheck ok · lint ok
mcp:    npm test → 4 files / 43 passed · typecheck ok · lint ok
curl /pulls/<#482>/blast → "3 symbols · 6 callers · 3 endpoints · 1 cron", degraded False
curl /pulls/00000000-…/blast → 404
grep MAX_CALLERS_PER_SYMBOL|BFS_DEPTH (blast module + card) → 0
diff server/client brief.ts → identical
credential scan of 06-proofs (sk_live, ghp_, glpat-, api key, password, token=) → none
```

---
**Validation Completed:** 2026-09-26
