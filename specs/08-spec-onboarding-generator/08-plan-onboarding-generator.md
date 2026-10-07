# 08-plan-onboarding-generator.md

Implementation Plan for [08-spec-onboarding-generator.md](08-spec-onboarding-generator.md) (round-1 decisions: [08-questions-1](08-questions-1-onboarding-generator.md), adopted by recommendation, pending user veto — not re-litigated here).

Approved: 2026-10-02

Status: draft, nothing executed. Execution mode: **multi-agent (recommended, pending user confirmation — see «Режим виконання»)**.

---

## Ціль і межі

Per-repo Onboarding Tour (`/repos/:repoId/onboarding`): deterministic facts from the clone + repo-intel index → skeleton → at most one structured LLM call → per-section merge → one stored tour per repo (existing `onboarding` table, no migration) → client page + sidebar entry. Packages: `server`, `client`. Not touched: `reviewer-core`, `mcp`, `e2e` (existing `e2e/specs/06-onboarding.flow.json` for the Add-repo page must stay green — AC-24 only changes the nav highlight).

## Огляд вимог

**Ясно:** AC-1…AC-38, E1–E21, NFR-1…NFR-6 are testable; no open `[NEEDS CLARIFICATION]`; no AC contradicts another.

**Звірено з кодом (факти, на які спирається план):**
- `Onboarding`/`OnboardingSection`/`OnboardingLink` exist in `server/src/vendor/shared/contracts/knowledge.ts:28-47` (`kind: z.string()`); the client mirror `client/src/vendor/shared/contracts/knowledge.ts` already diverges in unrelated parts (Agent comments, `AgentVersion`) — apply a hunk, never copy the file. Only consumer: `server/test/contracts.test.ts:139` (old 1-section fixture — will break, step S1 fixes it).
- `onboarding` table (`server/src/db/schema/context.ts:120-126`): `repo_id` PK, `json` jsonb, `generated_at`. Enough to store the whole DTO → **no migration, no `pnpm db:generate`**.
- Feature model `onboarding` exists (`FEATURE_MODELS`, default `openrouter` / `deepseek/deepseek-v4-flash`); resolver `resolveFeatureModel(container, ws, 'onboarding')` (`server/src/modules/settings/feature-models.ts`).
- Prompt template `server/src/prompts/onboarding.system.md` names old sections (`routes_and_apis`) — rewrite; loader `renderPrompt` in `server/src/platform/prompts.ts`. `wrapUntrusted` (escapes `</untrusted>`) re-exported from `server/src/platform/prompt.ts`.
- `RepoIntel` facade (`server/src/modules/repo-intel/types.ts`): `getIndexState` (synthesises `status:'degraded', reason:'no_data', lastIndexedSha:''` when no row; does NOT check the flag), `getTopFilesByRank` (returns `string[]` only — no scores/hotness), `getCriticalPaths` (≤ 5 chains, `[]` if no edges or flag off). **Gaps:** no method exposes `pagerank`/`hotness` per file nor all endpoint facts; `getRankedPaths` orders by `rank DESC` only and `getCriticalPaths` sorts by rank only → ties are nondeterministic (threatens AC-15). Step S2 closes these.
- `file_rank` has `pagerank`, `hotness` (always 0, Option B), `rank` (= pagerank today; "would become pagerank × (1 + hotness)" later). `file_facts.endpoints` jsonb `string[]`.
- `EXCLUDED_DIRS` exported from `server/src/modules/repo-intel/constants.ts`.
- Path safety: `isInsideRoot` + realpath pattern already in `server/src/modules/context/{helpers,service}.ts` (spec 07).
- LLM port `completeStructured({ model, schema, schemaName, messages, maxTokens, timeoutMs, maxRetries })` → `{ data, tokensIn, tokensOut, costUsd, model }`. Adapters re-prompt on schema failure (`maxRetries` default 2) and retry transport errors (429/5xx). Missing key → `ConfigError` from `container.llm()`. `TimeoutError` in `server/src/platform/resilience.ts`.
- Client: `activeKeyFor` (`client/src/components/app-shell/helpers.ts:29`) maps any `/onboarding` → `onboarding-tour` (bug per AC-24). `shell.json` already has `nav.onboarding-tour`. `client/messages/en/onboarding.json` is unused by any component (verified by grep) — safe to rewrite. `MermaidDiagram` (`client/src/components/mermaid-diagram`) already validates with `mermaid.parse({suppressErrors})` and renders nothing on bad input (covers AC-31 mechanics). `Markdown` primitive uses `react-markdown` without `rehype-raw` (raw HTML not rendered). `useRepoIntelStatus` / `useResyncRepoIntel` in `client/src/lib/hooks/repo-intel.ts`. `Repo.clone_path` is in the shared `Repo` DTO. Cost formatting: `client/src/components/run-cost-badge` (`formatRunCost`/`formatTokens`).
- **NAV:** `NAV` lives in `client/src/vendor/ui/nav.ts` and is imported directly by vendored `Sidebar.tsx` (`import { NAV } from "../nav"`). There is **no upstream copy of `@devdigest/ui` anywhere in the monorepo and no sync script** (confirmed: only copy is `client/src/vendor/ui`; `.claude/commands/implement.md` states "The repo has no sync script"; precedent commit `aa82fbb` added the Project Context entry by editing this same file). So the source of truth for the NAV list is `client/src/vendor/ui/nav.ts` itself → planned as an isolated, explicitly sanctioned one-line edit (step S6, see Decisions D1).

**Неоднозначно (вирішено як припущення — див. Decisions):** meaning of "exactly one LLM call" vs adapter transport retries (D2); which `file_rank` column feeds the score (D3); tie-break order (D4); structure counting & walk scope (D5, D6); dependency list size per manifest (D7 — needed to guarantee AC-17); README detection (D8); persistence of `regeneration_error` (D9); shape of `coverage.index_status`/`indexed_sha` (D10); which reasons get Resync (D11); diagram-allowed sections (D12); client behaviour on 409 `generation_in_progress` (D13); lock scope (D14); per-section validity rules (D15); `why` sanitising (D16); mapping `getIndexState` → reason (D17).

**Чого бракує у спеці (не блокує):** a per-manifest dependency cap (D7); explicit coverage for `stack` in the AC-17 drop order (D7 makes it bounded instead); no e2e flow for the tour (manual browser check instead — see «Поза межами плану»).

## Питання до користувача та відповіді (Decisions)

`AskUserQuestion` is not available in this session, so every question is recorded with the recommended answer adopted (**pending user veto**; a veto reopens the named steps).

| ID | Question | Adopted answer (recommended) | Affects |
|---|---|---|---|
| D0 | Execution mode: multi-agent or single-agent? | **Multi-agent.** Two packages; after S1 the server chain (S2→S4→S5) and the client chain (S6, S7) are independent; tests need a separate `test-writer` role because `implementer` must not write tests. | all |
| D1 | NAV entry needs a vendored edit — proceed? | **Yes, edit `client/src/vendor/ui/nav.ts` directly** (it *is* the only copy / source of truth of `@devdigest/ui`; precedent `aa82fbb`). One hunk only: add `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Lightbulb", href: "/repos/:repoId/onboarding" }` to the `WORKSPACE` group after `context`. Existing icon (no `icons.tsx` edit), no `gKey` (no new shortcut). `/implement` must list this edit and get user OK at its gate. Alternative (wrapping/overriding `Sidebar` in app code) rejected: also a vendored edit, larger. | S6, AC-1 |
| D2 | What counts as "one LLM call"? | One `completeStructured` invocation with `maxRetries: 0` (no schema re-prompt), `maxTokens: 4000`, `timeoutMs: 90_000`, wrapped in a service-level `withTimeout(…, 90_000)` hard bound. Adapter transport retries on 429/5xx inside that one invocation are not counted as extra generations. **Spec-drift candidate** for NFR-3/AC-18 wording. | S5 |
| D3 | Score source column | `score = pagerank × (1 + clamp(hotness, 0, 1))` using the `pagerank` column (not `rank`, which is documented to become `pagerank × (1 + hotness)` later → would double-count). `ranking_basis = 'pagerank_hotness'` iff any eligible row has `hotness > 0`, else `'pagerank'`. | S2, S4 |
| D4 | Deterministic ties | `path ASC` as the final tie-break everywhere (new facade reads, `getRankedPaths`, `getCriticalPaths` next-hop sort). Only changes order among equal ranks — no other behaviour change for blast/conventions. | S2 |
| D5 | Structure: what is a "per-directory file count"? | Recursive count of regular files under each directory at depth 1–2, walk via `readdir({withFileTypes})` (symlinks never followed), skipping `EXCLUDED_DIRS`. Hard visit cap 50,000 entries (`ponytail:` ceiling; counts become lower bounds past it, logged). | S4 |
| D6 | Where to look for manifests | Same bounded walk: root `package.json` + up to 10 nested `package.json` at depth ≤ 2 (path ASC); presence manifests detected at root and depth ≤ 2 (reported as paths). Env templates (`.env.example`/`.env.sample`/`.env.template`) and README at **root only**. | S4 |
| D7 | Stack: which dependencies, how many | Names only (no versions) of `dependencies` keys + `engines` keys, sorted ASC, **≤ 50 names per manifest** — added so AC-17's ≤ 12k budget always holds (stack is not in the drop order). **Spec-drift candidate** for AC-8. | S4 |
| D8 | README detection | First root entry matching `/^readme(\.md\|\.markdown\|\.txt)?$/i` by name ASC; excerpt = first 4,000 chars. | S4 |
| D9 | Is `regeneration_error` persisted? | No. The stored tour stays byte-unchanged (AC-28); only the POST response carries it. `GET` always returns `regeneration_error: null`. | S5, S7 |
| D10 | `coverage.index_status` / `indexed_sha` shape | `index_status ∈ full\|partial\|degraded\|failed\|none` (`none` = no index row or flag off); `indexed_sha: string \| null` (null when no index). `outdated = (stored.indexed_sha ?? '') !== (current.lastIndexedSha ?? '')`, computed on every GET/POST response, never trusted from storage. | S1, S5 |
| D11 | Which reasons show Resync (AC-29) | `index_partial`, `no_index`, `index_degraded`, `index_failed`. Not `flag_off` (resync cannot help; banner says repo-intel is disabled) and not `llm_*`. | S7 |
| D12 | Diagrams | Prompt allows a mermaid diagram only for `architecture` and `critical_paths`; other sections `diagram: null`. Not enforced server-side beyond type; client hides any unrenderable diagram (AC-31). | S5 |
| D13 | Client on 409 `generation_in_progress` | Show the generating state text "A tour is already being generated", keep buttons disabled, refetch GET after 3 s once. | S7 |
| D14 | AC-23 lock scope | In-process `Set<repoId>` on the single `OnboardingService` instance (`ponytail:` single API process, local-first; DB advisory lock if multi-instance). Released in `finally`. | S5 |
| D15 | When is an LLM section "invalid" (AC-20) | Kind not in enum or duplicated, empty/whitespace `title` or `body`, `title` > 120 chars, `body` > 8,000 chars. Invalid/missing → skeleton section with `source: 'facts'`. | S4 |
| D16 | `why` sanitising (AC-19) | Collapse newlines to spaces, trim, cap 200 chars; empty → null. Only for paths already in `reading_path`. | S4 |
| D17 | Index state → reason (AC-25) | `!config.repoIntelEnabled` → `flag_off`; `status==='degraded' && reason==='no_data'` (synthesised, no row) → `no_index`; persisted `degraded` → `index_degraded`; `failed` → `index_failed`; `partial` → LLM path, `reason: index_partial`; `full` → LLM path, `reason: null`. | S4, S5 |

## Рекомендації

1. **No migration.** Store the full DTO in `onboarding.json`; compute `outdated` on read. Saves a schema step and a `db:generate`.
2. **Reuse, don't rebuild:** `wrapUntrusted` (`platform/prompt.ts`), `renderPrompt`, `resolveFeatureModel`, `MockLLMProvider` (fixture failing the schema simulates `llm_invalid_output` for free — server INSIGHTS 2026-09-21), `MermaidDiagram`, `Markdown`, `formatRunCost`, `useResyncRepoIntel`, `EXCLUDED_DIRS`, `isInsideRoot`.
3. **Promote `isInsideRoot` + a `readInsideClone` helper to `server/src/modules/_shared/clone-fs.ts`** (re-exported from `context/helpers.ts`, so the context module does not change behaviour) instead of a cross-module import from `context/`.
4. **Two new facade reads instead of reaching into repo-intel tables** (onion: features code against `RepoIntel`, never its repository).
5. **Keep pure logic pure:** everything except disk walk, DB, and LLM lives in `onboarding/helpers.ts` → AC-11…AC-21, AC-26 are testable without Postgres or a clone.
6. **Risk worth knowing:** `withTimeout` does not abort the underlying HTTP request — a timed-out call may still be billed. Acceptable (bounded by `maxTokens`), noted in Risks.
7. **Order of work:** contract first (S1), then two parallel lanes; tests after each lane; docs/verify last.

## Зачеплені модулі

| Package | Area | Change |
|---|---|---|
| `server` | `src/vendor/shared/contracts/knowledge.ts` | extend `Onboarding` contract (source of truth) |
| `server` | `src/modules/repo-intel/` | 2 new facade reads + deterministic tie-breaks |
| `server` | `src/modules/_shared/clone-fs.ts` (new), `src/modules/context/helpers.ts` (re-export only) | path-safe clone reads |
| `server` | `src/modules/onboarding/` (new), `src/modules/index.ts`, `src/prompts/onboarding.system.md` | facts, skeleton, generation, API |
| `client` | `src/vendor/shared/contracts/knowledge.ts` | same hunk as server (sanctioned mirror edit) |
| `client` | `src/vendor/ui/nav.ts` | one NAV entry (sanctioned vendored edit, D1) |
| `client` | `src/components/app-shell/helpers.ts` | `activeKeyFor` fix |
| `client` | `src/lib/hooks/onboarding.ts` (new), `src/lib/hooks/index.ts`, `messages/en/onboarding.json`, `src/app/repos/[repoId]/onboarding/**` (new) | page + hooks + copy |

## Архітектурні обмеження

- **server → `onion-architecture`:** `routes.ts` (Zod params, `getContext`, no logic) → `service.ts` (orchestration; talks to `container.repoIntel`, `container.llm`, `RepoRepository`, `OnboardingRepository`) → `repository.ts` (Drizzle only). Pure rules in `helpers.ts` (no fs/DB/LLM imports). Disk access only in `facts.ts` via `_shared/clone-fs.ts`. Never import repo-intel's `repository.ts` or tables from onboarding — only the `RepoIntel` facade and exported constants.
- **client → `ui-architecture`:** page thin; feature logic in colocated `_components/OnboardingTourView/` (`styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`, tests). Data only via hooks in `src/lib/hooks/onboarding.ts` (no ad-hoc fetch). Reuse cross-cutting components; nothing promoted to `src/components` (single consumer).
- **Do-not-touch:** no edits to `server/src/db/migrations/**` (none needed), lock files (no new deps), `client/src/vendor/**` except the two sanctioned hunks (shared contract mirror in S1, `nav.ts` in S6). `server/src/vendor/shared` is edited only in S1 (contract step, first and alone).
- **Contract change makes fields required** → S1 must update every fixture that parses `Onboarding` in both packages (`server/test/contracts.test.ts`; client has none today — grep again at implementation time).
- **Facade interface change** → every object literal implementing `RepoIntel` must gain the new methods: `server/test/conventions.it.test.ts` `stubIntel` (only one today — grep `getCriticalPaths` in `server/test` again).

## Контекст з INSIGHTS.md (digest for executors)

1. `MockLLMProvider.completeStructured` runs the fixture through `schema.safeParse` and throws on mismatch → a fixture missing a required field simulates "invalid output"; a dedicated throwing stub is needed only for timeout/ConfigError (server, 2026-09-21).
2. `MockGitClient.readFile` returns `''` for missing paths — onboarding reads the disk directly, but treat empty/whitespace README/env files as absent anyway (server, 2026-09-19).
3. A Fastify POST with no body has `req.body === null` → use `z.object({}).nullish()` for the generate route body (server, 2026-09-18).
4. `ValidationError` is always 422; custom statuses need `new AppError(code, msg, status)` — use it for 409 `repo_not_cloned` / `generation_in_progress` and 404 `no_tour` (server, Decision entry on `AppError(...,400)`).
5. Extract best-effort try/catch blocks into named functions so failure paths are hermetically testable (server, 2026-09-21) — applies to the LLM call → reason classification.
6. `routes-smoke.test.ts` routes touching `getContext` still need Postgres — put route tests in `*.it.test.ts` (server, 2026-09-26).
7. Never write a glob like `a/*/b` inside a `/** */` comment — `*/` closes it (server, 2026-09-19/22).
8. Cost already flows through `StructuredResult.costUsd` — don't recompute (server, 2026-09-14).
9. `client/src/vendor/shared` is a partial mirror — apply only the hunk the client needs; never copy files (client, 2026-09-14).
10. `useRepoIntelStatus`/`useResyncRepoIntel`: completion = `lastIndexedSha`/`updatedAt` advancing, status enum is terminal-only; `BlastRadiusCard.tsx` is the reference consumer (client, 2026-09-26).
11. When a hooks module is `vi.mock`-ed elsewhere, adding exports requires updating those factories — new hooks go to a NEW file `hooks/onboarding.ts` to avoid that (client, 2026-09-26).
12. Reuse `formatRunCost`/`formatTokens` for the footer, not a local formatter (client, 2026-09-14).
13. Fetch-level stubbing (`ConventionsView.test.tsx`, `BlastRadiusCard.test.tsx`) is the house pattern for component tests (client, 2026-09-26).

## Скіли по кроках

| Step | Paths | Skills |
|---|---|---|
| S1 | `server/src/vendor/shared/contracts/knowledge.ts`, client mirror, `server/test/contracts.test.ts` | `zod`, `onion-architecture` |
| S2 | `server/src/modules/repo-intel/**`, `server/test/conventions.it.test.ts` | `onion-architecture`, `drizzle-orm-patterns` |
| S3 | `server/src/modules/_shared/clone-fs.ts`, `server/src/modules/context/helpers.ts`, `server/src/modules/onboarding/{facts,helpers,constants}.ts` | `onion-architecture`, `security`, `typescript-expert` |
| S4 | `server/src/modules/onboarding/{service,repository,routes}.ts`, `server/src/modules/index.ts`, `server/src/prompts/onboarding.system.md` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `security` |
| S5 | server tests | `onion-architecture` (testing-strategy rule), `security` |
| S6 | `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts` | `ui-architecture` |
| S7 | `client/src/lib/hooks/onboarding.ts`, `client/src/lib/hooks/index.ts`, `client/messages/en/onboarding.json`, `client/src/app/repos/[repoId]/onboarding/**` | `ui-architecture`, `react-best-practices`, `next-best-practices`, `frontend-architecture` |
| S8 | client tests | `react-testing-library`, `ui-architecture` |
| S9 | READMEs / INSIGHTS | `engineering-insights`, `mermaid-diagram` |

(`frontend-architecture` is listed in the planner rules but has no folder under `.claude/skills/`; executors fall back to `ui-architecture` if it is absent.)

## Міжкрокові зв'язки (сигнатура + де підключається) і правки vendored-файлів

**S1 → S3/S4/S7 — contract (`@devdigest/shared`, `contracts/knowledge.ts`, exported via the existing `export *` in `index.ts`):**

```ts
OnboardingSectionKind = z.enum(['architecture','critical_paths','local_run','reading_order','first_tasks'])
OnboardingSectionSource = z.enum(['llm','facts'])
OnboardingSection = { kind: OnboardingSectionKind, title, body, diagram: string|null|undefined, links: OnboardingLink[], source: OnboardingSectionSource }
OnboardingReadingItem = { path: string, score: number, why: string | null }
OnboardingStatus = z.enum(['complete','partial','skeleton'])
OnboardingLlmReason = z.enum(['llm_failed','llm_timeout','llm_invalid_output','llm_not_configured'])
OnboardingReason = z.enum(['index_partial','no_index','index_degraded','index_failed','flag_off', ...OnboardingLlmReason.options])
OnboardingCoverageCount = { shown: int>=0, total: int>=0, truncated: boolean }
OnboardingCoverage = { index_status: z.enum(['full','partial','degraded','failed','none']), files_indexed: int, files_skipped: int,
                       routes, scripts, structure, reading_path, critical_paths: OnboardingCoverageCount }
OnboardingRankingBasis = z.enum(['pagerank','pagerank_hotness'])
Onboarding = { sections: OnboardingSection[] (.length(5)), reading_path: OnboardingReadingItem[], status, reason: OnboardingReason|null,
               regeneration_error: OnboardingLlmReason|null, ranking_basis, coverage, indexed_sha: string|null, generated_at: string (ISO),
               outdated: boolean, model: string|null, tokens_in: int|null, tokens_out: int|null, cost_usd: number|null }
```
Order of the 5 sections is enforced by the server builder (S3), and asserted in tests; the schema enforces count only.

**S2 → S3/S4 — `RepoIntel` facade (`server/src/modules/repo-intel/types.ts`, implemented in `service.ts`, reached via `container.repoIntel`):**

```ts
export interface RankedFileRow { path: string; pagerank: number; hotness: number; junk: boolean } // junk = existing isJunkPath()
getRankedFiles(repoId: string): Promise<RankedFileRow[]>      // all file_rank rows, rank DESC then path ASC; [] when flag off
export interface EndpointFactRow { file: string; endpoint: string }
getEndpointFacts(repoId: string): Promise<EndpointFactRow[]>  // every file_facts endpoint, file ASC then endpoint ASC; [] when flag off
```
Plus `getRankedPaths` gains `asc(filePath)` as 2nd order key and `getCriticalPaths` next-hop sort gains `path ASC` tie-break.

**S3 → S4 — onboarding internals (same package, same lane; written by S3, consumed by S4):**

```ts
// _shared/clone-fs.ts
export function isInsideRoot(root: string, rel: string): boolean            // moved from context/helpers.ts, re-exported there
export async function readInsideClone(root: string, rel: string, maxChars?: number): Promise<string | null> // lexical + realpath check; null on any violation/missing/empty
// onboarding/facts.ts
export async function collectCloneFacts(root: string): Promise<CloneFacts> // manifests, deps, scripts, structure, env names, readme excerpt
// onboarding/helpers.ts (pure)
export function buildFacts(clone: CloneFacts, intel: IntelFacts | null): Facts  // IntelFacts = { state, ranked: RankedFileRow[], endpoints: EndpointFactRow[], chains: string[][] }
export function buildSkeleton(facts: Facts): OnboardingSection[]                 // 5 sections, source 'facts'
export function serializeFactsForPrompt(facts: Facts): { text: string; dropped: string[] } // AC-17 budget, wrapUntrusted per category
export function mergeLlmOutput(facts: Facts, skeleton: OnboardingSection[], out: OnboardingLlmOutput): { sections; reading_path }
export function filterLinks(sections: OnboardingSection[], allowed: Set<string>): OnboardingSection[]
export function reasonForIndex(flagOn: boolean, state: IndexState): { llm: boolean; reason: OnboardingReason | null; indexStatus }
export function classifyLlmError(err: unknown): OnboardingLlmReason
// onboarding/constants.ts
export const OnboardingLlmOutput = z.object({ sections: z.array(z.object({ kind: z.string(), title: z.string(), body: z.string(), diagram: z.string().nullable(), links: z.array(OnboardingLink) })), reading_why: z.array(z.object({ path: z.string(), why: z.string() })) })
// caps: READING_PATH_N=12, ROUTES_MAX=50, SCRIPTS_MAX=30, SCRIPT_CMD_MAX=200, STRUCTURE_MAX=40, NESTED_MANIFESTS_MAX=10, DEPS_PER_MANIFEST_MAX=50, README_MAX=4000, FACTS_TOKEN_BUDGET=12000, LLM_MAX_TOKENS=4000, LLM_TIMEOUT_MS=90000
```
The LLM output schema is server-only (not in `@devdigest/shared`), lenient per section so AC-20 per-section validation is possible.

**S4 → S7 — HTTP (`server/src/modules/onboarding/routes.ts`, registered in `modules/index.ts`):**
- `GET /repos/:id/onboarding` → `200 Onboarding` | `404 {error:{code:'no_tour'}}` (none or stored row fails `Onboarding.safeParse`) | `404 not_found` (repo not in workspace).
- `POST /repos/:id/onboarding` (body `z.object({}).nullish()`) → `200 Onboarding` (incl. `regeneration_error`) | `409 repo_not_cloned` | `409 generation_in_progress` | `404 not_found`.
- Client also reads `GET /repos` (`Repo.clone_path`) and uses existing `POST /repos/:id/resync`.

**Vendored / do-not-touch edits the plan requires (all listed for the `/implement` gate):**
1. `server/src/vendor/shared/contracts/knowledge.ts` — source of truth; contract step S1 only.
2. `client/src/vendor/shared/contracts/knowledge.ts` — same hunk applied by hand in S1 (sanctioned mirror edit; never copy the file).
3. `client/src/vendor/ui/nav.ts` — one NAV item in S6 (D1). No upstream exists; this file is the source of truth for `@devdigest/ui`'s nav.
No migrations, no lock-file changes.

**Designs:** none supplied (spec: "Design analysis: none"). UI copy comes from the spec ACs; layout follows the existing Conventions page pattern. No mockup paths to pass.

## Кроки реалізації

Dependency graph:

```
S1 (contract) ──┬─> S2 (repo-intel facade) ─> S3 (facts+skeleton, pure) ─> S4 (service/API/prompt) ─> S5 (server tests)
                └─> S7 (client page) ─────────────────────────────────────────────────────────────> S8 (client tests)
S6 (nav + activeKeyFor) — independent, any time
S5 + S8 ─> S9 (docs, INSIGHTS, full verify)
```

- [x] **S1 — Shared contract `Onboarding` (server source of truth + client hunk)** · package `server` (+ client mirror) · deps: none · runs first, alone
  - AC: contract basis for AC-2, AC-3/E21, AC-7, AC-14, AC-16, AC-19, AC-22, AC-25, AC-27, AC-28, AC-30, AC-37
  - Files owned: `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts` (same hunk), `server/test/contracts.test.ts`
  - Work: extend schemas exactly per «Міжкрокові зв'язки»; update the old `Onboarding.parse` fixture in `contracts.test.ts` to the new shape and add one assertion that the old shape `{sections:[…]}` fails `safeParse` (E21) and that 4 sections fail. Grep both packages for `Onboarding` fixtures again.
  - Skills: `zod`, `onion-architecture`

- [x] **S2 — repo-intel facade: ranked files with pagerank/hotness, endpoint facts, deterministic ties** · `server` · deps: S1 (none strictly; can start in parallel with S1 only if file-disjoint — it is) 
  - AC: AC-11, AC-12, AC-13, AC-15, AC-21 (source of "indexed files"), E7
  - Files owned: `server/src/modules/repo-intel/types.ts`, `server/src/modules/repo-intel/service.ts`, `server/src/modules/repo-intel/repository.ts`, `server/src/modules/repo-intel/README.md`, `server/test/conventions.it.test.ts` (add the two methods to `stubIntel` only)
  - Work: `RankedFileRow`/`EndpointFactRow` types + `getRankedFiles`/`getEndpointFacts` on the interface and service (flag off → `[]`); repository `getRankedFileRows(repoId)` (select path, pagerank, hotness; order `rank DESC, file_path ASC`) and `getAllEndpointFacts(repoId)`; `junk` via existing `isJunkPath`; add `asc(file_path)` tie-break to `getRankedPaths`; add `|| a.localeCompare(b)` tie-break in `getCriticalPaths` next-hop sort.
  - Skills: `onion-architecture`, `drizzle-orm-patterns`

- [x] **S3 — Onboarding facts collection + pure builders (skeleton, budget, merge, links)** · `server` · deps: S1, S2
  - AC: AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-19, AC-20, AC-21, AC-26, AC-35, AC-38 (skeleton copy English), NFR-4; edge E6, E7, E8, E9, E10, E11, E12 (missing section), E18, E20
  - Files owned: `server/src/modules/_shared/clone-fs.ts` (new), `server/src/modules/context/helpers.ts` (replace `isInsideRoot` body with a re-export only), `server/src/modules/onboarding/facts.ts`, `server/src/modules/onboarding/helpers.ts`, `server/src/modules/onboarding/constants.ts`
  - Work:
    - `collectCloneFacts(root)`: one bounded walk (D5/D6) → root + ≤ 10 nested `package.json` (depth ≤ 2, path ASC) parsed with `JSON.parse` in try/catch (bad JSON → manifest listed, no deps/scripts); deps per D7; presence list per AC-8; scripts (name + command ≤ 200 chars) root first then manifest path ASC, keep `total`; structure entries depth 1–2, recursive counts, order count DESC then path ASC, keep `total`; env names from the three templates only (parse `^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=` and keep group 1 only — values never stored); README excerpt (D8). Every read through `readInsideClone`. Never open any other `.env*`.
    - `buildFacts`: reading path = non-junk ranked rows, score per D3, top 12, order score DESC then path ASC, `ranking_basis`; routes = endpoint facts ordered by declaring file's score/rank DESC then endpoint ASC, cap 50; chains as-is (≤ 5); coverage `{shown,total,truncated}` per category; `allowedPaths` = all ranked paths ∪ manifest paths ∪ README path ∪ structure entries ∪ env template paths.
    - `serializeFactsForPrompt`: each category wrapped with `wrapUntrusted('<fixed label>', text)` (from `platform/prompt.ts`); while `ceil(chars/4) > 12000` drop items from the end of structure → routes → README excerpt → scripts; never reading path / critical paths; report dropped categories.
    - `buildSkeleton` per AC-26, fixed English templates; "unavailable — index <status>" texts; `first_tasks` template (test script if any → "Run `npm run <test>`"; first reading-path file; first route).
    - `mergeLlmOutput` (AC-19/20, D15/D16) + `filterLinks` (AC-21, applied to every section incl. skeleton ones).
    - `reasonForIndex` (D17), `classifyLlmError` (`ConfigError` → `llm_not_configured`; `TimeoutError` or name/message matching timeout → `llm_timeout`; message matching `schema validation` or `ZodError` → `llm_invalid_output`; else `llm_failed`).
  - Skills: `onion-architecture`, `security`, `typescript-expert`

- [x] **S4 — Onboarding service, repository, routes, prompt** · `server` · deps: S3
  - AC: AC-2 (server: GET makes 0 LLM calls), AC-3/E21, AC-5/E1, AC-6/E19, AC-7/E16, AC-18/E3, AC-22, AC-23/E15, AC-25/E2/E4/E5, AC-27/E13, AC-28/E14, AC-34/E17, AC-38, NFR-1, NFR-2, NFR-3, NFR-5
  - Files owned: `server/src/modules/onboarding/service.ts`, `server/src/modules/onboarding/repository.ts`, `server/src/modules/onboarding/routes.ts`, `server/src/modules/index.ts`, `server/src/prompts/onboarding.system.md`
  - Work:
    - `repository.ts`: `get(repoId)` → `{ json, generatedAt } | null`; `upsert(repoId, json, generatedAt)` (`onConflictDoUpdate` on `repo_id`).
    - `service.get(ws, repoId)`: repo via `RepoRepository.getById(ws, id)` (404 `not_found`); row → `Onboarding.safeParse`; fail/none → `AppError('no_tour', …, 404)`; set `outdated` (D10) from `container.repoIntel.getIndexState`, `regeneration_error: null`.
    - `service.generate(ws, repoId, log)`: 404 / `clonePath == null` → `AppError('repo_not_cloned', …, 409)` before anything else; lock (D14) → `AppError('generation_in_progress', …, 409)`; state + `reasonForIndex`; `collectCloneFacts`; intel reads only when LLM path; `buildFacts`/`buildSkeleton`. Skeleton path → store + return. LLM path → `resolveFeatureModel(…,'onboarding')`, `container.llm(provider)` (ConfigError → `llm_not_configured`, still no call), ONE `completeStructured({ model, schema: OnboardingLlmOutput, schemaName: 'onboarding_tour', messages:[system = renderPrompt('onboarding.system.md',{sections, language:'English'}), user = serialized facts], maxTokens: 4000, timeoutMs: 90_000, maxRetries: 0 })` inside `withTimeout(…, 90_000)` (D2); success → merge, `status` complete/partial, model/tokens/cost, upsert; failure → `classifyLlmError`; if stored valid tour with status complete|partial → return it unchanged + `regeneration_error` (no write); else store skeleton with `reason = llm_*`. One log line (NFR-5): `{ repoId, status, reason, indexStatus, counts, truncated flags, droppedCategories, tokensIn, tokensOut, durationMs }` — no repo text.
    - `routes.ts`: `GET`/`POST /repos/:id/onboarding` with `IdParams`, `getContext`, body `z.object({}).nullish()`.
    - `onboarding.system.md`: rewrite for the 5 sections in order, D12 diagram rule, `reading_why` (one line per listed path, never add/reorder), links only from the facts, keep the SECURITY paragraph, `{{language}}` + verbatim identifiers rule.
    - Register `onboarding` in `modules/index.ts`.
  - Skills: `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `security`

- [x] **S5 — Server tests** · `server` · executor `test-writer` · deps: S4
  - AC: see traceability table (server rows)
  - Files owned: `server/test/repo-intel-onboarding-reads.test.ts`, `server/test/onboarding-facts.test.ts`, `server/test/onboarding-helpers.test.ts`, `server/test/onboarding-service.test.ts`, `server/test/onboarding.it.test.ts`
  - Skills: `onion-architecture` (rules/testing-strategy.md), `security`

- [x] **S6 — Sidebar entry + nav highlight fix** · `client` · deps: none (parallel with anything) · **sanctioned vendored edit (D1)**
  - AC: AC-1, AC-24
  - Files owned: `client/src/vendor/ui/nav.ts` (one item only), `client/src/components/app-shell/helpers.ts`, `client/src/components/app-shell/helpers.test.ts` (new; may be written here or by S8)
  - Work: add the NAV item (D1). `activeKeyFor`: replace `pathname.includes("/onboarding")` with `/^\/repos\/[^/]+\/onboarding(\/|$)/.test(pathname)`; plain `/onboarding` → `""`.
  - Skills: `ui-architecture`

- [x] **S7 — Client hooks, copy, tour page** · `client` · deps: S1 (client mirror), API shape from S4 (signature above — can be built in parallel with S2–S4)
  - AC: AC-2, AC-3, AC-4, AC-7, AC-14, AC-16, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-36, AC-37, AC-38, NFR-6; edge E1, E12, E14, E15, E16, E21
  - Files owned: `client/src/lib/hooks/onboarding.ts` (new), `client/src/lib/hooks/index.ts` (one export line), `client/messages/en/onboarding.json` (rewrite), `client/src/app/repos/[repoId]/onboarding/page.tsx` (new, thin), `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/**` (new: `OnboardingTourView.tsx`, `styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`, optional sub-`_components/` e.g. `TourSection`, `TourStatusBanner`, `TourFooter`)
  - Work:
    - Hooks: `useOnboardingTour(repoId)` — GET; `ApiError` 404 with `code === 'no_tour'` → `null` (empty state), other errors surface. `useGenerateOnboardingTour(repoId)` — POST; on success `setQueryData(["onboarding", repoId], data)` (keeps `regeneration_error` from the response).
    - Page states: loading; not cloned (`Repo.clone_path === null` from `useRepos`) → "Repository is not cloned yet", Generate disabled (AC-4); empty state naming the 5 sections + "Generate onboarding tour" (AC-3); generating (button disabled + `role="status"` text, AC-32; D13 for 409); tour: header with Regenerate + "Outdated" badge when `outdated` (AC-7); status banner `role="status"` for `skeleton`/`partial` with plain-words reason + Resync (D11) via `useResyncRepoIntel` (AC-29); partial note "Based on N indexed files (M skipped) — index is partial" (AC-30); regeneration banner "Regeneration failed (<reason>) — showing the tour from <generated_at>" (AC-28); 5 sections in fixed order as `<h2>` headings (NFR-6) with `Markdown` body (no raw HTML, AC-36), `MermaidDiagram` when `diagram` (AC-31), links as repo-relative path text; reading order list with score + `why`; ranking note when `ranking_basis === 'pagerank'` and reading path non-empty (AC-14); "showing X of Y" per truncated coverage category (AC-16); scripts/commands rendered as `<code>` text only, no run buttons (AC-36); footer: model · tokens in/out (`formatTokens`) · cost (`formatRunCost`) or "cost unknown"; skeleton → "Generated without LLM" (AC-37); GET/POST network/5xx → "Couldn't load the onboarding tour" + Retry, keeping any tour already shown (AC-33). All copy in `onboarding.json` (English, AC-38).
  - Skills: `ui-architecture`, `react-best-practices`, `next-best-practices`, `frontend-architecture`

- [x] **S8 — Client tests** · `client` · executor `test-writer` · deps: S6, S7
  - AC: see traceability table (client rows)
  - Files owned: `client/src/components/app-shell/helpers.test.ts`, `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/OnboardingTourView.test.tsx`, `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/helpers.test.ts`
  - Skills: `react-testing-library`, `ui-architecture`

- [ ] **S9 — Docs, INSIGHTS, full verification** · `server` + `client` · executors `doc-writer`, then `plan-verifier` · deps: S5, S8
  - AC: none new (verification of all); NFR-1/NFR-2 manual timing recorded here
  - Files owned: `server/README.md` (API map: 2 routes), `client/README.md` (route map: `/repos/:repoId/onboarding`), `server/src/modules/repo-intel/README.md` (if not done in S2), `server/INSIGHTS.md` / `client/INSIGHTS.md` (only if a non-obvious lesson came up), `specs/08-spec-onboarding-generator/08-validation-onboarding-generator.md` (written by the orchestrator from the verifier report)
  - Skills: `engineering-insights`, `mermaid-diagram`

## Traceability: AC → task → planned test

Test files: **SF** = `server/test/onboarding-facts.test.ts` (temp clone dir, hermetic) · **SH** = `server/test/onboarding-helpers.test.ts` (pure) · **SS** = `server/test/onboarding-service.test.ts` (hermetic: fake container, stub `RepoIntel`, `MockLLMProvider` / throwing stubs, in-memory repository patched like `repo-intel-facade-degraded.test.ts`) · **SI** = `server/test/onboarding.it.test.ts` (Postgres, `MockLLMProvider` call counter) · **SR** = `server/test/repo-intel-onboarding-reads.test.ts` (hermetic, patched repository) · **SC** = `server/test/contracts.test.ts` · **CH** = `client/src/components/app-shell/helpers.test.ts` · **CV** = `OnboardingTourView.test.tsx` (fetch stubbed) · **CU** = `OnboardingTourView/helpers.test.ts` · **M** = manual browser check.

| AC / NFR | Edge | Task | Planned test (file → case) |
|---|---|---|---|
| AC-1 | — | S6 | CH → `NAV` has item `onboarding-tour` with href `/repos/:repoId/onboarding`; M → entry visible for selected repo |
| AC-2 | — | S4, S7 | SI → POST then GET returns same tour, LLM call count unchanged by GET; CV → stored tour renders 5 `h2` in fixed order, no POST issued |
| AC-3 | E21 | S1, S4, S7 | SC → old shape fails `safeParse`; SI → GET with no row → 404 `no_tour`; GET with old-shape row → 404 `no_tour`; CV → 404 `no_tour` → empty state lists 5 section names + Generate |
| AC-4 | E1 | S7 | CV → repo `clone_path: null` → "Repository is not cloned yet", Generate disabled |
| AC-5 | E1 | S4 | SI → POST on repo with `clone_path` null → 409 `repo_not_cloned`, 0 LLM calls |
| AC-6 | E19 | S4 | SI → GET and POST for unknown id / other-workspace repo → 404 |
| AC-7 | E16 | S4, S7 | SS → stored `indexed_sha` ≠ current `lastIndexedSha` → `outdated: true`, equal → false; CV → "Outdated" badge next to Regenerate |
| AC-8 | E6, E8, E9 | S3 | SF → root + 12 nested manifests → only 10 nested (depth ≤ 2, path ASC), `node_modules/**/package.json` ignored, presence list (`go.mod`, `Dockerfile`, …) detected, Go-only repo → presence only, no package.json → empty stack without error |
| AC-9 | E8, E20 | S3 | SF → 35 scripts → 30 kept, root first then path ASC, 300-char command → 200 chars, `total = 35` |
| AC-10 | — | S3 | SF → > 40 dirs → 40 entries, order count DESC then path ASC, `dist`/`node_modules` excluded |
| AC-11 | — | S2, S3 | SR → `getEndpointFacts` order + flag off `[]`; SH → 60 endpoints → 50, order by file rank DESC then endpoint ASC |
| AC-12 | E7 | S2, S3 | SR → `getCriticalPaths` deterministic on equal ranks; SH → no edges → chains `[]`, critical_paths section "unavailable" wording only in skeleton, reading path still present |
| AC-13 | — | S2, S3 | SR → `getRankedFiles` order rank DESC then path ASC, `junk` flags tests/configs/`.d.ts`/migrations; SH → fixed pagerank/hotness rows → expected 12 paths and scores, junk excluded |
| AC-14 | — | S3, S7 | SH → all hotness 0 → `ranking_basis: 'pagerank'`; one >0 → `pagerank_hotness`; CV → note "Ranked by import graph only — no git history in the shallow clone" |
| AC-15 | — | S2, S3 | SH → `buildFacts` + `buildSkeleton` twice on same inputs → `JSON.stringify` identical; SF → `collectCloneFacts` twice on same temp dir → identical |
| AC-16 | E8 | S3, S7 | SH → each over-cap category sets `{shown,total,truncated:true}`; CV → "showing X of Y" rendered per truncated category |
| AC-17 | E20 | S3 | SH → oversized facts → serialized ≤ 12,000 est. tokens, drop order structure → routes → README → scripts, reading path + chains always present |
| AC-18 | E3 | S4 | SS → index full → exactly 1 `completeStructured` with `maxTokens 4000`, `timeoutMs 90000`, `maxRetries 0`, model/provider from `onboarding` feature model override |
| AC-19 | E11 | S3 | SH → LLM adds a path and reorders → `reading_path` paths/order equal to facts; only `why` for listed paths accepted, sanitised (D16) |
| AC-20 | E12 | S3 | SH → output missing `local_run` and invalid `first_tasks` → those sections `source:'facts'` from skeleton, others `source:'llm'` |
| AC-21 | E10 | S3 | SH → link to invented path removed, link to indexed file / manifest / README / structure entry kept |
| AC-22 | E3 | S4 | SS → index full → `status complete, reason null`; index partial → `status partial, reason index_partial`; model/tokens/cost from result; repository upsert called once |
| AC-23 | E15 | S4 | SS → two concurrent `generate` with a deferred LLM → second throws 409 `generation_in_progress`, 1 LLM call; SI → two parallel POSTs → one 200, one 409 |
| AC-24 | — | S6 | CH → `activeKeyFor('/repos/abc/onboarding') === 'onboarding-tour'`, `activeKeyFor('/onboarding') === ''`; M → Add-repo page highlights nothing (e2e `06-onboarding.flow.json` still passes) |
| AC-25 | E2, E4, E5, E6 | S3, S4 | SH → `reasonForIndex` table (flag off / no row / degraded / failed); SS → each → `status skeleton` + matching reason, 0 LLM calls, stored |
| AC-26 | E6, E7, E9 | S3 | SH → skeleton has 5 sections in order; architecture = stack + structure; critical paths "unavailable — index degraded"; local run = scripts verbatim + env names + README link (absent README → no link); reading order "unavailable — index none"; first tasks template filled (test script present / absent) |
| AC-27 | E13 | S3, S4 | SS → thrown error / `TimeoutError` / fixture failing schema / `ConfigError` on `container.llm` with no stored LLM tour → stored skeleton with `llm_failed` / `llm_timeout` / `llm_invalid_output` / `llm_not_configured` |
| AC-28 | E14 | S4, S7 | SS → stored complete tour + failing LLM → stored row untouched, response = stored tour + `regeneration_error`; CV → banner "Regeneration failed (…) — showing the tour from …" |
| AC-29 | E4 | S7 | CV → skeleton `no_index` → `role="status"` banner with plain-words reason + Resync → POST `/repos/:id/resync`; `flag_off` → no Resync; CU → reason → label/`isIndexReason` mapping |
| AC-30 | E3 | S7 | CV → partial tour → "Based on N indexed files (M skipped) — index is partial" |
| AC-31 | E12 | S7 | CV → section with invalid diagram (mermaid mocked to `parse → false`) → body still rendered, no error text |
| AC-32 | E15 | S7 | CV → pending POST → generating state, Generate/Regenerate disabled; 409 `generation_in_progress` → D13 text |
| AC-33 | — | S7 | CV → GET 500 → "Couldn't load the onboarding tour" + Retry refetches; POST 500 with a tour on screen → error shown, tour still rendered |
| AC-34 | E17 | S3, S4 | SH → README with `</untrusted>` + "ignore previous instructions" → escaped inside delimiters; SS → captured user message: all repo text inside `<untrusted …>` blocks, system prompt contains SECURITY paragraph |
| AC-35 | E18 | S3 | SF → `.env` and `.env.local` with secrets present → never read (spy/no value in facts), `.env.example` → names only, values absent |
| AC-36 | — | S7 | CV → body containing `<script>`/`<img onerror>` not rendered as elements; scripts shown as `<code>` text, no run/execute control |
| AC-37 | — | S7 | CV → LLM tour footer shows model, tokens in/out, cost; `cost_usd: null` → "cost unknown"; skeleton → "Generated without LLM" |
| AC-38 | — | S3, S4, S7 | SH → skeleton titles/copy English, paths/scripts verbatim; SS → system prompt rendered with `language: English`; CV → copy from `onboarding.json` |
| NFR-1 | — | S4, S9 | M → time `GET /repos/:id/onboarding` on seeded stack (≤ 300 ms p95), recorded in validation |
| NFR-2 | — | S3, S9 | M → time fact collection on a 5,000-file index (log `durationMs` split), recorded in validation |
| NFR-3 | — | S4 | SS → call counter: generate (LLM path) = 1, skeleton = 0, GET = 0 |
| NFR-4 | — | S3 | SF → symlink file and symlinked dir pointing outside the clone → skipped; `readInsideClone('../x')` → null |
| NFR-5 | — | S4 | SS → logger spy: exactly one info line with repo id, status, reason, index status, counts/truncation, tokens, duration; serialized log contains no README/script text |
| NFR-6 | — | S7 | CV → `getAllByRole('heading', {level: 2})` order, banner `role="status"`, buttons are `<button>` (keyboard-focusable); M → keyboard pass |

**Edge cases → task:** E1 S4/S7 · E2 S3/S4 · E3 S4/S7 · E4 S3/S4/S7 · E5 S3/S4 · E6 S3 · E7 S2/S3 · E8 S3 · E9 S3 · E10 S3 · E11 S3 · E12 S3/S7 · E13 S4 · E14 S4/S7 · E15 S4/S7 · E16 S4/S7 · E17 S3/S4 · E18 S3 · E19 S4 · E20 S3 · E21 S1/S4.

**Gaps:** no AC without a task; no task without an AC (S9 is verification/docs only). AC-1, AC-24, NFR-1, NFR-2, NFR-6 (keyboard part) need a manual browser/timing check in addition to unit tests.

## Режим виконання і розподіл

**Recommended and recorded: multi-agent** (D0, pending user confirmation). Reason: two packages, one contract seam, server and client lanes are independent after S1, and tests must be written by a separate `test-writer` (implementers are forbidden to write tests).

| Batch | Steps (parallel within batch) | Executor |
|---|---|---|
| 1 | S1 (alone — contract first) | `implementer` |
| 2 | S2 (server) ‖ S6 (client, vendored nav — after user OK at `/implement` gate) ‖ S7 (client page; codes against the HTTP signature above) | `implementer` ×3 |
| 3 | S3 (server, needs S2) | `implementer` |
| 4 | S4 (server) ‖ S8 (client tests, needs S6+S7) | `implementer` ‖ `test-writer` |
| 5 | S5 (server tests) | `test-writer` |
| 6 | architecture review of full diff (+ ≤ 2 fix rounds) | `architecture-reviewer` → `implementer` (fix mode) |
| 7 | S9 docs, then verification | `doc-writer` → `plan-verifier` |

File ownership is disjoint inside each batch (S6 and S7 share no files; S2 and S7 are different packages). S3 and S4 stay serial (same module).

## План перевірки (described, not run)

From root `CLAUDE.md`:
- `server/`: `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` · `pnpm exec vitest run .it.test` (Docker/Postgres) · `pnpm lint`
- `client/`: `pnpm typecheck` · `pnpm test` · `pnpm lint`
- `e2e/` (regression for AC-24, needs running stack via `./scripts/dev.sh`): `npm test` — `06-onboarding.flow.json` must still pass.
- Manual: browser — sidebar entry + highlight on `/repos/:id/onboarding` vs `/onboarding`; generate on a seeded repo with and without a provider key; keyboard pass; NFR-1/NFR-2 timings.
- Checkpoints: after S1 (server typecheck + `contracts.test.ts`, client typecheck), after S2 (`repo-intel-*` tests + typecheck), after S4 (server hermetic suite), after S7 (client typecheck).

## Ризики / відкриті питання

| Risk | Mitigation |
|---|---|
| Vendored `nav.ts` edit could be overwritten if an external `@devdigest/ui` sync is ever introduced | One isolated hunk, documented in S9 READMEs and in this plan; no upstream exists today (D1). |
| "One LLM call" vs adapter transport retries (OpenRouter SDK `maxRetries` 2 by default) | `maxRetries: 0` + outer 90 s bound (D2); flagged as spec-drift candidate. |
| `withTimeout` does not abort the in-flight HTTP request → a timed-out call may still be billed | Bounded by `maxTokens: 4000`; accepted. |
| Tie-break change in `getRankedPaths`/`getCriticalPaths` alters order for blast/conventions among equal ranks | Only equal-rank order changes; S2 runs existing `repo-intel-*` tests. |
| Stored rows from a future contract change become "no tour" (AC-3) | Intended by spec (E21); user regenerates. |
| Pathological repos (huge dir trees) slow the structure walk (NFR-2) | 50k-entry visit cap (D5), `EXCLUDED_DIRS` skipped. |
| `wrapUntrusted` escapes only the exact lowercase `</untrusted>` | Same guard as all reviews today; out of scope to change reviewer-core. |
| D7 dependency cap and D2 call semantics are additions to the spec | Listed for the post-implementation spec-drift check. |

Open questions: none blocking — all recorded as Decisions D0–D17 pending veto.

## Поза межами плану

- MCP tool, writing the tour into the repo, tour history, auto-generation after index, GitHub issue fetching, clone deepening/hotness computation, non-JS manifest parsing, localisation (spec non-goals).
- A new e2e flow for the tour (would need a seeded cloned repo id in `e2e`; manual browser check instead). Add when e2e gets repo fixtures.
- Changing `reviewer-core`'s `wrapUntrusted`/`INJECTION_GUARD`.
- Any DB migration.
