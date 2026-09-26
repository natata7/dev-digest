# 06 Tasks – Blast Radius

Spec: [06-spec-blast-radius.md](./06-spec-blast-radius.md)

## Relevant Files

| File | Why It Is Relevant |
|------|--------------------|
| `server/src/vendor/shared/contracts/brief.ts` | Source of truth: extend `BlastRadius` with `degraded?`, `reason?`, `indexed_sha?` |
| `client/src/vendor/shared/contracts/brief.ts` | Read-only mirror — copy the change verbatim |
| `server/src/modules/repo-intel/types.ts` | `BlastResult`, `DegradedReason`, `IndexState` (input shapes; read only) |
| `server/src/modules/repo-intel/service.ts` | `getBlastRadius`, `getIndexState` facade (read only) |
| `server/src/modules/repo-intel/constants.ts` | `MAX_CALLERS_PER_SYMBOL`, `BFS_DEPTH` — single source of limits (not duplicated) |
| `server/src/modules/blast/routes.ts` | NEW — `GET /pulls/:id/blast`, `GET /pulls/:id/history` |
| `server/src/modules/blast/service.ts` | NEW — resolve PR + repo + changed files, call facade once, map, log |
| `server/src/modules/blast/helpers.ts` | NEW — pure `toBlastRadius(result, indexedSha)` mapper + summary builder + history mapper |
| `server/src/modules/blast/helpers.test.ts` | NEW — mapper unit tests |
| `server/src/modules/blast/service.test.ts` | NEW — service tests with injected fake repo-intel / code host |
| `server/src/modules/index.ts` | Register `blast` module |
| `server/src/modules/pulls/repository.ts` | Reuse `getPullInWorkspace`, `getRepoById`, `getPrFiles` |
| `server/src/modules/_shared/context.ts`, `_shared/schemas.ts` | `getContext`, `IdParams` |
| `server/test/routes-smoke.test.ts` | Route smoke pattern (`app.inject`) — add blast/history routes |
| `server/src/vendor/shared/adapters.ts` | `CodeHostClient` port — add `listPriorPullRequests` |
| `server/src/adapters/github/octokit.ts` | GitHub implementation of prior PRs |
| `server/src/adapters/gitlab/rest.ts` | GitLab implementation of prior MRs |
| `server/src/adapters/mocks.ts` | Mock code host — add the new method |
| `client/src/lib/hooks/blast.ts` | NEW — `useBlastRadius(prId)`, `usePrHistory(prId)` |
| `client/src/lib/hooks/index.ts` | Export new hooks |
| `client/src/lib/hooks/repo-intel.ts` | Reuse `useRepoIntelStatus`, `useResyncRepoIntel` |
| `client/src/lib/repo-urls.ts` | Reuse `repoBlobUrl`, `repoPrUrl` (GitHub + GitLab) |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | Pass `repoId`, `provider`, `repoFullName` to `OverviewTab` |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` | Mount `BlastRadiusCard` |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/*` | NEW — `BlastRadiusCard.tsx`, `BlastTree.tsx`, `BlastGraph.tsx`, `PriorPrs.tsx`, `styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`, `*.test.tsx`, `helpers.test.ts` |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/*` | Reference pattern for a colocated card + test |
| `client/messages/en/blast.json` | All UI strings (add degraded reasons, resync, empty, error, prior PRs keys) |
| `mcp/src/server.ts` | Replace `get_blast_radius` stub |
| `mcp/src/format.ts` | NEW `formatBlast(blast, format)` |
| `mcp/src/format.test.ts`, `mcp/src/server.test.ts` | Tests for formatter and tool |
| `mcp/src/api.ts` | Reuse `resolvePr`, `api`, `ToolError` |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.test.tsx` | NEW — regression test: Overview renders both cards |
| `mcp/AGENTS.md`, `mcp/README.md`, `server/AGENTS.md` | Doc updates |
| `docs/specs/06-spec-blast-radius/06-proofs/` | Screenshots, transcript, logs |

### Notes
- Tests sit next to source (`X.ts` + `X.test.ts`); server unit tests are hermetic (`pnpm exec vitest run --exclude '**/*.it.test.ts'`).
- Contracts change only in `server/src/vendor/shared`, then copied to `client/src/vendor/shared`.
- Client data only through hooks in `src/lib/hooks`; strings only via `useTranslations("blast")`.
- MCP: `console.error` only; repo-derived text wrapped with `fence()`; errors via `ToolError` with the next step; `npm`, not pnpm.
- Read `server/INSIGHTS.md`, `client/INSIGHTS.md`, `mcp/INSIGHTS.md` (if present) before starting each package.

## Tasks

### [x] 1.0 Server: contract extension + `GET /pulls/:id/blast` (Unit 1)

#### 1.0 Proof Artifact(s)
- Test: `server/src/modules/blast/helpers.test.ts` passes — flat `callers` grouped by `viaSymbol`, per-group endpoints/crons from `factsByFile`, rank sorting, summary string, `degraded`/`reason` passthrough, missing `factsByFile`.
- Test: `server/src/modules/blast/service.test.ts` + `server/test/routes-smoke.test.ts` pass — response parses with `BlastRadius`; facade called exactly once; unknown PR id → 404.
- CLI: `curl -s http://localhost:3001/pulls/<prId>/blast | jq` on the test PR shows ≥2 callers and ≥1 entry in `endpoints_affected` (saved to `06-proofs/blast-curl.json`).
- Log excerpt: `06-proofs/blast-log.txt` — API log line `blast served from index` with degraded, reason, counts; no index/parse job logged.

#### 1.0 Tasks
- [x] 1.1 In `server/src/vendor/shared/contracts/brief.ts` add `BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data'])` and optional `degraded`, `reason`, `indexed_sha` on `BlastRadius`; copy the file to `client/src/vendor/shared/contracts/brief.ts`; ensure exports in the shared index.
- [x] 1.2 Create `server/src/modules/blast/helpers.ts` with pure `toBlastRadius(result: BlastResult, indexedSha?: string): BlastRadius`: map `changedSymbols`; group `callers` by `viaSymbol` (callers → `{ name: symbol, file, line }`); per group union+dedupe `factsByFile[file].endpoints/crons`; sort groups by max caller rank desc, callers by rank desc then file, line; include symbols with zero callers as groups with empty callers; pass `degraded`/`reason`.
- [x] 1.3 Add `buildSummary(blast)` in the same file: `"<n> symbols · <n> callers · <n> endpoints · <n> crons"` from unique counts (endpoint count = union of per-group endpoints; if `factsByFile` absent use `impactedEndpoints.length` — resolves spec Open Question 1).
- [x] 1.4 Write `helpers.test.ts`: grouping by `viaSymbol`, facts union + dedupe, zero-caller symbol, sort order, summary string, degraded passthrough, missing `factsByFile`, contract `BlastRadius.parse` succeeds on output; pass-through: 25 callers for one symbol in → 25 out (no re-capping/filtering). No limit constant/literal is duplicated outside `repo-intel/constants.ts`: `grep -rnE "MAX_CALLERS_PER_SYMBOL|BFS_DEPTH" server/src/modules/blast "client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard"` returns nothing, and neither place slices the callers list.
- [x] 1.5 Create `server/src/modules/blast/service.ts` `BlastService.get(workspaceId, prId)`: resolve PR in workspace (404 `NotFoundError` if missing) + repo; changed files from `getPrFiles`; call `container.repoIntel.getBlastRadius(repoId, files)` once; read `getIndexState(repoId).lastIndexedSha` for `indexed_sha`; map via `toBlastRadius`; `logger.info({ prId, degraded, reason, symbols, callers }, 'blast served from index')`.
- [x] 1.6 Create `server/src/modules/blast/routes.ts`: `GET /pulls/:id/blast` with `IdParams`, response schema `BlastRadius`; register `blast` in `server/src/modules/index.ts`.
- [x] 1.7 Write `service.test.ts` (fake repo-intel via container overrides): facade called once with changed files; unknown PR → NotFound; degraded result passes through. Add `/pulls/:id/blast` to `server/test/routes-smoke.test.ts`.
- [x] 1.8 Run `pnpm typecheck`, `pnpm lint`, hermetic tests in `server`; start stack, pick test PR (touches `server/src/modules/reviews/helpers.ts` or `client/src/components/diff-viewer/helpers.ts`), verify `index-state` = `full`, capture curl output + log excerpt into `06-proofs/`.

### [~] 2.0 Client: Blast radius block (Tree view) on Overview (Unit 2)

#### 2.0 Proof Artifact(s)
- Test: `BlastRadiusCard.test.tsx` passes — summary counts, caller links (GitHub `/blob/<sha>/…#L<n>` and GitLab `/-/blob/<sha>/…#L<n>`), cron pills separate from endpoint pills, `noDownstream` text, degraded badge with reason + Resync button, clicking Resync issues `POST /repos/<repoId>/resync`, symbol collapse/expand, error state.
- Test: `OverviewTab.test.tsx` passes — Overview renders both `IntentCard` and `BlastRadiusCard`; existing `IntentCard.test.tsx` still green.
- Screenshot: `docs/specs/06-spec-blast-radius/06-proofs/tree.png` — Overview of the test PR with summary, ≥2 callers and ≥1 endpoint.
- Screenshot: `06-proofs/degraded.png` and `06-proofs/no-callers.png` — degraded badge + Resync, and no-callers text.

#### 2.0 Tasks
- [x] 2.1 Add `client/src/lib/hooks/blast.ts` with `useBlastRadius(prId)` (`queryKey: ["blast", prId]`, `GET /pulls/:id/blast`, typed `BlastRadius`); export from hooks index.
- [x] 2.2 Extend `client/messages/en/blast.json`: `title`, `empty.noSymbols`, `degraded.badge`, `degraded.reason.<each reason>`, `resync`, `resyncing`, `error`, `openOnHost`; keep existing keys.
- [x] 2.3 Pass `repoId`, `provider`, `repoFullName` from `page.tsx` into `OverviewTab` and mount `<BlastRadiusCard />` there (layout next to `IntentCard` as in the design).
- [x] 2.4 Create `_components/BlastRadiusCard/` (`BlastRadiusCard.tsx`, `BlastTree.tsx`, `styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`): summary row (symbols / callers / endpoints / crons counts from `helpers.ts`), collapsible symbol nodes with `callerCount`, caller links `file:line` via `repoBlobUrl(provider, repoFullName, indexed_sha ?? headSha, file, line)` with `target="_blank" rel="noopener noreferrer"`, endpoint pills and separately styled cron pills.
- [x] 2.5 Empty states: no changed symbols → `empty.noSymbols`; symbols but zero callers → `noDownstream`; loading and error states that don't break the Overview tab.
- [x] 2.6 Degraded state: when `degraded`, show badge + translated reason and a Resync button using `useResyncRepoIntel(repoId)`; poll `useRepoIntelStatus(repoId, true)` until `lastIndexedSha`/`updatedAt` changes, then invalidate `["blast", prId]`.
- [x] 2.7 Write `helpers.test.ts` (counts, URL building for both providers) and `BlastRadiusCard.test.tsx` (RTL + mocked fetch, following `IntentCard.test.tsx`): all cases from the proof artifact list, including asserting that the Resync click calls `POST /repos/<repoId>/resync` (mocked fetch receives method + URL).
- [ ] 2.8 Add `OverviewTab/OverviewTab.test.tsx` rendering both cards (regression guard for the new props); run `pnpm typecheck`, `pnpm lint`, `pnpm test` in `client` (incl. `IntentCard.test.tsx`); capture `tree.png`, `degraded.png`, `no-callers.png` on the running stack; click a caller link and confirm it opens the exact line.

### [x] 3.0 MCP: real `get_blast_radius` (Unit 3)

#### 3.0 Proof Artifact(s)
- Test: `mcp` `npm test` passes — `concise`/`detailed` text output (symbol → `file:line` → endpoints/crons + degraded line), `response_format: json` returns the stubbed route body, unknown PR → `isError` with next step, `readOnlyHint: true`, `tools/list` size guard still passes; old NOT IMPLEMENTED test removed.
- CLI/transcript: `docs/specs/06-spec-blast-radius/06-proofs/mcp-transcript.md` — Claude Code `get_blast_radius` on the test PR lists the same symbols/callers/endpoints as `tree.png`.

#### 3.0 Tasks
- [x] 3.1 Add `formatBlast(blast, format)` to `mcp/src/format.ts`: text tree `symbol()` → `  ↳ file:line (caller)` → `endpoints:` / `crons:`; first line = `summary`; if `degraded` add `⚠ index incomplete (<reason>) — missing callers ≠ no impact`; wrap repo-derived text with `fence()`; respect `cap()`.
- [x] 3.2 Replace the stub in `mcp/src/server.ts`: `resolvePr(pr)` → `api<BlastRadius>(\`/pulls/${id}/blast\`)` → `formatBlast`; input `{ pr, response_format }` with `response_format: 'concise' (default) | 'detailed' | 'json'` — `concise`/`detailed` follow the existing `ResponseFormat` text pattern; `json` returns the route's `BlastRadius` body verbatim (deliberate, documented exception for browser parity); `readOnlyHint: true`, `openWorldHint: false`; description ≤2 sentences stating when to call it.
- [x] 3.3 Unknown PR / 404 → `ToolError("PR not found — pass owner/repo#number, a PR URL or a DevDigest PR uuid")`.
- [x] 3.4 Update `format.test.ts` and `server.test.ts`: formatter cases (normal, no callers, degraded), json mode equals stub body, unknown PR error, annotations; delete NOT IMPLEMENTED test.
- [x] 3.5 Run `npm run typecheck`, `npm run lint`, `npm test` in `mcp`; call the tool from Claude Code on the test PR and save transcript to `06-proofs/mcp-transcript.md`, comparing with `tree.png`.

### [~] 4.0 Client: Graph view + Tree/Graph toggle (Unit 4)

#### 4.0 Proof Artifact(s)
- Test: `helpers.test.ts` graph cases pass — `BlastRadius` → nodes (symbols / callers / endpoints+crons) and edges; duplicates merged; empty input → no nodes.
- Test: `BlastRadiusCard.test.tsx` — toggle switches Tree ↔ Graph; graph has `aria-label`; empty graph shows `graph.empty`.
- Screenshot: `docs/specs/06-spec-blast-radius/06-proofs/graph.png` — Graph view of the test PR.

#### 4.0 Tasks
- [x] 4.1 Add `toGraph(blast)` in `BlastRadiusCard/helpers.ts`: three columns (symbols, callers by name, endpoints+crons), edges symbol→caller and caller→endpoint/cron using the group's facts; deterministic ordering.
- [x] 4.2 Create `BlastGraph.tsx`: inline SVG, column layout with fixed row spacing, curved edges, truncated labels with `<title>` for full text, legend (changed symbol · callers · endpoints affected), `aria-label={t("graph.ariaLabel")}`, `graph.empty` when no callers. No new dependency.
- [x] 4.3 Add segmented Tree/Graph toggle (`view.tree`, `view.graph`, Tree default) to the summary row of `BlastRadiusCard`.
- [ ] 4.4 Tests for `toGraph` and toggle/empty/aria cases; run client verify; capture `graph.png`.

### [~] 5.0 Prior PRs touching these files — GitHub + GitLab (Unit 5)

#### 5.0 Proof Artifact(s)
- Test: `service.test.ts` — second `history()` call for the same PR + head sha doesn't call the code host again (cache hit).
- Test: adapter tests (mocked HTTP) for `OctokitGitHubClient.listPriorPullRequests` and GitLab equivalent pass — merged PRs/MRs touching given files, current PR excluded, caps applied.
- Test: `service.test.ts` history cases pass — response parses with `PrHistory`; code-host error → `{ history: [] }` (200); `notes` is deterministic.
- Test: `BlastRadiusCard.test.tsx` — Prior PRs section shows count, expands, links via `repoPrUrl` for both providers.
- Screenshot: `docs/specs/06-spec-blast-radius/06-proofs/prior-prs.png` — expanded section on the test PR.

#### 5.0 Tasks
- [x] 5.1 Add to `CodeHostClient` (`server/src/vendor/shared/adapters.ts`) `listPriorPullRequests(repo, files: string[], opts: { excludeNumber: number; limit: number }): Promise<PriorPr[]>` (`number, title, author, merged_at, files`); add a no-op/fixture to `server/src/adapters/mocks.ts`.
- [x] 5.2 Implement in `octokit.ts`: for each of the first 10 files, list commits by `path` (per_page small) → `listPullRequestsAssociatedWithCommit` → keep merged, dedupe by number, collect overlapping files; wrap with existing `withRetry`/`withTimeout`.
- [x] 5.3 Implement in `gitlab/rest.ts`: `GET /projects/:id/repository/commits?path=…` → `GET /projects/:id/repository/commits/:sha/merge_requests` → keep `state=merged`, dedupe by iid, collect overlap; same resilience wrappers.
- [x] 5.4 In `BlastService` add `history(workspaceId, prId)`: resolve PR/repo/files, call adapter with `excludeNumber = pr.number`, `limit = 5`; sort by overlap count desc then `merged_at` desc; `notes = "touched <n> of these files"`; any error → log warn + `{ history: [] }`; cache results in memory keyed by `prId + head_sha` (`Map`, small bounded size) so repeated views don't re-hit the code host. Add `GET /pulls/:id/history` (response `PrHistory`).
- [ ] 5.5 Adapter + service tests (mocked HTTP / fake code host); add route to smoke test.
- [ ] 5.6 Client: `usePrHistory(prId)` in `hooks/blast.ts` with `staleTime: Infinity` (merged history doesn't change within a session); `PriorPrs.tsx` collapsible row with count chip at the bottom of the card; items link via `repoPrUrl(provider, repoFullName, number)` and show title, author, date, overlapping files; add `prior.*` keys to `blast.json`.
- [ ] 5.7 RTL tests for Prior PRs (count, expand, GitHub/GitLab links, empty); run server + client verify; capture `prior-prs.png`.

### [ ] 6.0 Delivery: docs, full verification, PR with demo

#### 6.0 Proof Artifact(s)
- CLI: `server`/`client` `pnpm typecheck && pnpm lint` + tests, `mcp` `npm run typecheck && npm run lint && npm test` — all green (output summarized in PR description).
- Doc: `mcp/AGENTS.md` and `mcp/README.md` no longer call `get_blast_radius` a stub; `server/AGENTS.md` map lists `modules/blast`.
- URL: open GitHub PR (branch off `L04`) with implementation description, demo video link, and a "which subagent did what" section.

#### 6.0 Tasks
- [ ] 6.1 Update `mcp/AGENTS.md` (tools line + note in "Output is compact text" that `get_blast_radius` `response_format: json` is the one deliberate JSON exception), `mcp/README.md`, `server/AGENTS.md` map; run `engineering-insights` for server/client/mcp and add entries only if substantial.
- [ ] 6.2 Run the full verify matrix for `server`, `client`, `mcp`; fix any failures.
- [ ] 6.3 Record the demo video (Overview tree → click caller → degraded + Resync → Graph → Prior PRs → Claude Code `get_blast_radius`).
- [ ] 6.4 Commit with `feat:` prefixes, push branch, open PR: summary, per-unit changes, proof artifact links, demo link, subagent attribution table.
