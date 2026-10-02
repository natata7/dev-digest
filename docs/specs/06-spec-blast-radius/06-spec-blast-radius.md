# 06-spec-blast-radius.md

## Introduction/Overview

Рев'юер бачить diff, але не бачить, що ще в репозиторії може зачепити ця зміна. **Blast Radius** — блок на вкладці Overview сторінки PR, який показує: які символи оголошені у змінених файлах, хто їх викликає (`файл:рядок`), і які HTTP-ендпоінти та крони від них залежать. Дані вже пораховані модулем `repo-intel` під час індексації — фіча лише читає готовий індекс (`repoIntel.getBlastRadius`), мапить його в контракт `BlastRadius` і показує в UI та через MCP-інструмент `get_blast_radius`. Жодного LLM і жодного повторного парсингу.

## Goals

- Дати рев'юеру за один погляд відповідь «що ще може зачепити цей diff»: кількість символів, викликачів, ендпоінтів і кронів + дерево/граф зв'язків.
- Один серверний роут `GET /pulls/:id/blast` — єдине джерело карти і для UI, і для Claude Code (MCP), з однаковою відповіддю.
- Чесна деградація: коли індекс неповний або даних немає — видно причину й кнопку Resync, а не порожній екран.
- Контекст історії: показати попередні змерджені PR/MR, що змінювали ті самі файли (GitHub і GitLab).
- 0 викликів LLM і 0 перебудов AST/імпортного графа на запит.

## User Stories

- **As a PR reviewer**, I want to see a Blast radius block on the Overview tab so that I know which code outside the diff may break.
- **As a PR reviewer**, I want to click a caller's `file:line` and land on that exact line on GitHub/GitLab so that I can inspect the call site without searching.
- **As a PR reviewer**, I want to see a clear message when there are no callers, and a distinct badge with the reason when the index is incomplete, so that I don't mistake missing data for "no impact".
- **As a PR reviewer**, I want to trigger a resync from the degraded badge so that I can fix a stale/partial index without leaving the page.
- **As a PR reviewer**, I want to switch between Tree and Graph views so that I can read the impact as a list or as a picture.
- **As a PR reviewer**, I want to see prior PRs that touched the same files so that I know the recent history of this code.
- **As a developer using Claude Code**, I want to ask for a PR's impact map and get the same data as the browser shows so that I can reason about impact without opening the UI.

## Demoable Units of Work

### Unit 1: Server — `GET /pulls/:id/blast` + contract

**Purpose:** Єдиний read-only роут, який перетворює плаский `BlastResult` фасаду на згрупований контракт `BlastRadius`. Обслуговує UI та MCP.

**Functional Requirements:**
- The system shall extend `BlastRadius` in `server/src/vendor/shared/contracts/brief.ts` with optional fields `degraded?: boolean`, `reason?: 'flag_off' | 'index_failed' | 'index_partial' | 'repo_too_large' | 'no_data'`, and `indexed_sha?: string` (commit the index was built on — used for caller links), and mirror the change to `client/src/vendor/shared/contracts/brief.ts`. Existing fields stay unchanged (backward compatible).
- The system shall expose `GET /pulls/:id/blast` in a new module `server/src/modules/blast/` (routes / service, following existing module layout), with the response validated by the `BlastRadius` Zod schema.
- The system shall collect the PR's changed files and call `repoIntel.getBlastRadius(repoId, changedFiles)` exactly once per request.
- The system shall group the flat `callers` list by `viaSymbol` into `downstream[]`: one entry per changed symbol with callers `{ name: symbol, file, line }`.
- The system shall compute `endpoints_affected` and `crons_affected` per group as the de-duplicated union of `factsByFile[callerFile]` over that group's caller files. When `factsByFile` is absent (fallback path), per-group crons are empty and endpoints are empty; the flat `impactedEndpoints` are not invented per-symbol.
- The system shall sort `downstream` groups by the highest caller `rank` (desc) and callers within a group by `rank` (desc), with a stable tiebreak by `file`, `line`.
- The system shall build `summary` as a deterministic string from counts (e.g. `"2 symbols · 14 callers · 3 endpoints · 1 cron"`) — no model call.
- The system shall pass `degraded` and `reason` from the facade through to the response unchanged, and set `indexed_sha` from the repo's index state (`lastIndexedSha`) when available.
- The system shall NOT re-apply limits or filtering logic: the per-symbol caller cap and BFS depth stay in `server/src/modules/repo-intel/constants.ts` (`MAX_CALLERS_PER_SYMBOL`, `BFS_DEPTH`), and excluding the declaring file stays in the facade.
- The system shall return 404 with a clear error body for an unknown PR id.
- The system shall log (info level) that the blast was served from the index (degraded flag + reason + counts), with no AST/graph rebuild on this path.

**Proof Artifacts:**
- Unit test: the flat-callers → grouped-downstream mapper (grouping by `viaSymbol`, facts union per group, rank sorting, summary string, degraded passthrough, missing `factsByFile`) demonstrates the core mapping is correct.
- Test: route response parses with `BlastRadius` schema; unknown PR → 404.
- CLI: `curl http://localhost:3001/pulls/<prId>/blast` on the test PR returns ≥2 callers and ≥1 endpoint.
- Log excerpt: request log shows index read, no parse/indexing job.

### Unit 2: UI — Blast radius block (Tree view) on Overview

**Purpose:** Показати карту рев'юеру на вкладці Overview, як на скріншоті дизайну.

**Functional Requirements:**
- The system shall add a client hook (e.g. `useBlastRadius(prId)`) in `client/src/lib/hooks/` next to existing hooks, calling `GET /pulls/:id/blast` via TanStack Query.
- The user shall see a "Blast radius" block on the PR Overview tab (`_components/OverviewTab/OverviewTab.tsx`), implemented as a colocated component folder (`_components/BlastRadiusCard/…` with `styles.ts`, `helpers.ts`, `index.ts`).
- The user shall see a summary row at the top: counts of symbols, callers, endpoints and crons (labels `stat.symbols`, `stat.callers`, `stat.endpoints`, `stat.crons`).
- The user shall see each changed symbol as a collapsible tree node with a caller count (`callerCount`), expanded to show its callers as `file:line`, followed by endpoint pills (`METHOD /path`) and, separately styled, cron pills.
- The user shall be able to click a caller `file:line` and open that line in a new tab on the repo's code host, built with the existing `repoBlobUrl(provider, repoFullName, indexed_sha, file, line)` from `client/src/lib/repo-urls.ts` (GitHub `/blob/…#L12`, GitLab `/-/blob/…#L12`). If `indexed_sha` is missing, fall back to the PR head sha.
- The user shall see the `noDownstream` text when there are changed symbols but no callers, and a clear empty text when there are no changed symbols at all.
- The user shall see a distinct "incomplete index" badge with the human-readable reason when `degraded: true`, next to a **Resync** button that calls `POST /repos/:id/resync` (existing `useResyncRepoIntel`) and refetches the blast when the index updates.
- The user shall see loading and error states (error does not break the rest of the Overview tab).
- All UI text shall come from `client/messages/en/blast.json` via next-intl; missing keys (degraded reasons, resync, empty, prior PRs, errors) are added to that file.

**Proof Artifacts:**
- Screenshot: Overview tab on the test PR showing summary, ≥2 callers under a symbol and ≥1 endpoint pill, crons separate.
- Screenshot: degraded state (badge + reason + Resync button) and no-callers state.
- Test (RTL): component renders summary counts, caller links with correct GitHub and GitLab URLs, `noDownstream` text, degraded badge; collapse toggles a symbol.

### Unit 3: MCP — real `get_blast_radius`

**Purpose:** Claude Code отримує ту саму карту, що й браузер, без UI.

**Functional Requirements:**
- The system shall replace the `get_blast_radius` stub in `mcp/src/server.ts` with a call to `GET /pulls/:id/blast`, resolving the `pr` argument the same way other tools do (`owner/repo#123`, PR URL, or uuid).
- The tool shall keep `readOnlyHint: true`, a short "when to call it" description within the existing size limits (first sentence ≤200 chars, total ≤300), and a clear argument schema.
- The tool shall accept `response_format` (`concise` default | `detailed` | `json`): `concise`/`detailed` follow the existing `ResponseFormat` text pattern of other tools — compact tree (symbol → callers `file:line` → endpoints / crons, plus a degraded line with reason); `json` = the route's `BlastRadius` body verbatim. `json` is a deliberate, documented exception to the mcp "compact text, not JSON" convention, kept for exact browser parity.
- The tool shall return a useful `isError` message for an unknown PR (e.g. "PR not found — check owner/repo#number or run list…") and the existing dev.sh hint when the API is down.
- The tool shall state explicitly when data is degraded, so an agent never reads "no callers" as "no impact" on an incomplete index.

**Proof Artifacts:**
- Test: `mcp` hermetic tests (API stubbed) — concise/detailed text output, json output equals stub body, unknown PR error, `readOnlyHint: true`; the old "NOT IMPLEMENTED" test is replaced.
- CLI/transcript: Claude Code call `get_blast_radius` on the test PR returns the same symbols/callers/endpoints as the UI screenshot.

### Unit 4: UI — Graph view with Tree / Graph toggle

**Purpose:** Другий вигляд карти — граф «символ → викликачі → ендпоінти/крони», як на третьому скріншоті.

**Functional Requirements:**
- The user shall switch between Tree and Graph with a segmented toggle (labels `view.tree`, `view.graph`); Tree is the default.
- The system shall render a left-to-right graph in three columns: changed symbols → caller names → endpoints/crons, with edges derived solely from the `BlastRadius` response (no extra requests).
- The system shall show a legend (changed symbol · callers · endpoints affected) and `graph.empty` when there are no callers; the graph has `aria-label` from `graph.ariaLabel`.
- Long labels shall be truncated with an ellipsis and full text available on hover (title).
- The system shall not add a new graph dependency; use inline SVG or the already-installed `mermaid`.

**Proof Artifacts:**
- Screenshot: Graph view of the test PR.
- Test: helper that converts `BlastRadius` → nodes/edges (unit test); toggle switches views (RTL).

### Unit 5: Prior PRs touching these files (GitHub + GitLab)

**Purpose:** Показати коротку історію: змерджені PR/MR, які раніше змінювали ті самі файли.

**Functional Requirements:**
- The system shall expose `GET /pulls/:id/history` returning the existing `PrHistory` contract (`history[]` of `{ pr_number, title, merged_at, author, files_overlap, notes }`).
- The system shall add a method to the `CodeHostClient` port (`server/src/vendor/shared/adapters.ts`) and implement it in both adapters: GitHub (`server/src/adapters/github/octokit.ts`) and GitLab (`server/src/adapters/gitlab/rest.ts`), finding merged PRs/MRs that touched any of the changed files, excluding the current PR.
- The system shall cap the work (limited number of files queried and results returned, e.g. top N by overlap then recency) and reuse existing retry/timeout wrappers.
- `notes` shall be filled deterministically (e.g. "touched 2 of these files") — no LLM.
- On code-host error or missing token, the route shall return an empty history (UI shows "no prior PRs"/unavailable), never break the Blast radius block.
- The user shall see a collapsible "Prior PRs touching these files" section with a count at the bottom of the Blast radius block; each item links to the PR/MR via existing `repoPrUrl(provider, …)` and shows title, author, merge date and overlapping files.

**Proof Artifacts:**
- Test: adapter methods (mocked HTTP) for GitHub and GitLab; service maps + caps results.
- Screenshot: expanded Prior PRs section on the test PR.

## Non-Goals (Out of Scope)

1. **Recomputing the index:** no AST parsing, import graph or BFS on the request path; limits are not duplicated in UI/route.
2. **LLM summary:** no model-generated text in this spec (`summary` is a count string).
3. **Changing repo-intel facade logic:** declaring-file exclusion, caller cap, depth and ranking stay as-is.
4. **Blast for non-indexed languages:** only what the existing indexer supports (`.ts/.tsx/.js/…`).
5. **Self-hosted GitHub Enterprise / GitLab instances:** links and history use github.com / gitlab.com, same as `repo-urls.ts` today.
6. **Interactive graph editing/zoom/drag:** static graph only.

## Design Considerations

- Reference design: https://claude.ai/artifact/KP2JTS2LE2eDQCTx6MU1hK and the three screenshots (Overview layout; Tree view; Graph view).
- Block sits on the Overview tab alongside the Intent card (right column in the design); dark theme styles from `@devdigest/ui` and existing card styles.
- Summary row: icon + bold number + label for symbols / callers / endpoints / cron, with the Tree/Graph toggle at the right.
- Tree: chevron + `<>` icon + `symbol()` + "N callers" on the right; caller rows with `↳` and monospace `file:line`; endpoint pills (blue, globe icon), cron pills (amber, clock icon).
- Degraded badge must be visually distinct from the empty state.
- "Prior PRs touching these files" is a collapsible row with a count chip at the bottom of the block.

## Repository Standards

- Server module layout per `server/AGENTS.md` and onion-architecture: routes → service → repo-intel facade / `CodeHostClient` port; adapters implement ports; wiring via `platform/container.ts`.
- Zod contracts: change only in `server/src/vendor/shared`, then mirror to `client/src/vendor/shared`; schema constant and type share a name; REST fields snake_case.
- Client: colocated feature component folders (`_components/<Name>/<Name>.tsx` + `styles.ts`, `helpers.ts`, `index.ts`), hooks in `client/src/lib/hooks/`, strings via next-intl `messages/en/blast.json`.
- Tests next to source (`*.test.ts(x)`); server hermetic tests excluded from `.it.test.ts`.
- MCP tool rules from spec 04 (short description, compact output, `readOnlyHint`, helpful errors); `mcp` uses npm.
- Conventional commit prefixes (`feat:`, `fix:`); no lockfile hand-edits; no migration edits (no DB changes expected).
- Verify per package: `pnpm typecheck` / `pnpm test` / `pnpm lint` (server, client), `npm run typecheck` / `npm test` / `npm run lint` (mcp).

## Technical Considerations

- `BlastResult` (facade, flat `callers` with `viaSymbol`) and `BlastRadius` (contract, grouped `downstream`) differ — the mapper is a pure function in the blast module, unit-tested in isolation.
- `factsByFile` is present only on the persistent-index path; on the ripgrep fallback (`degraded: true, reason: 'no_data'`) only the flat `impactedEndpoints` exist. Per-symbol attribution is then impossible — spec keeps per-group endpoints empty and shows the degraded badge. Summary endpoint count uses the union of per-group endpoints (and falls back to `impactedEndpoints` length when degraded) — confirm during implementation.
- Links use `indexed_sha` (index's `lastIndexedSha`) because caller line numbers come from the index, not the PR head (decision from questions round 1, Q2).
- Resync is async (202); the UI watches `index-state` (`lastIndexedSha`/`updatedAt` advance, like `ProjectContextView`) then invalidates the blast query.
- Prior PRs: GitHub — commits by path → associated PRs (or search merged PRs), GitLab — commits by path → merge requests of commit. Respect rate limits; cap requests. Consider short in-memory caching per PR head sha if calls are slow.
- Graph rendering: no new dependency; prefer inline SVG with simple column layout (matches design better than mermaid's auto layout).
- No external standards research needed — all patterns exist in the repo.

## Security Considerations

- Code-host tokens (GitHub PAT / GitLab token) stay server-side via existing secrets; never sent to the client or MCP output.
- MCP output wraps repo-derived strings (file paths, symbol names, PR titles) in the existing `<untrusted>` convention — they are data, not instructions.
- Links open in a new tab with `rel="noopener noreferrer"`; file paths are URL-encoded (`repoBlobUrl` already does it).
- Route is read-only; resync uses the existing endpoint.

## Success Metrics

1. On the test PR (changes a shared helper, e.g. `server/src/modules/reviews/helpers.ts`), UI and MCP both show ≥2 real callers and ≥1 HTTP endpoint, with identical data.
2. 100% of caller links open the exact line on the code host (GitHub and GitLab).
3. 0 LLM calls and 0 index rebuilds per `/pulls/:id/blast` request (verified via logs).
4. All P1 acceptance criteria met; mapper covered by unit tests; all packages pass typecheck/test/lint.

## Open Questions

1. Exact summary endpoint count in degraded mode (union of per-group vs flat `impactedEndpoints`) — resolve during implementation, document in the PR.
2. Prior PRs limits (how many files to query, how many PRs to show) — default proposal: first 10 changed files, top 5 PRs.
