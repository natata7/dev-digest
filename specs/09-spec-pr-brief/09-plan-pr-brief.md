# 09-plan-pr-brief.md

Implementation Plan for [09-spec-pr-brief.md](09-spec-pr-brief.md).

Approved: 2026-10-03
Plan review: claude-opus-5-5 (subagent, different model), 2026-10-03 — sound design, 4 major + 9 minor findings, folded in as amendments A1–A13 below

Status: approved, not yet implemented. Execution mode: **multi-agent**.

---

## Ціль і межі

One **PR Brief** card on the PR detail Overview tab: summary, Risk areas, Review focus (`file:line — reason`), built from precomputed facts (diff stats + Smart Diff roles + hunk new-side ranges, intent, blast radius, PR description, **attached Project Context docs**) with exactly one `completeStructured` call on the `risk_brief` feature model. The server filters every path to (PR diff files ∪ blast map files), stores the brief per PR (existing `pr_brief` table, bound to `head_sha`), GET serves it with zero LLM calls, POST regenerates. Clicking a focus item / risk file opens Files changed on that file (and line).

Packages: `server`, `client`, `@devdigest/shared` (`contracts/brief.ts`, both copies), `e2e` (one new flow, optional step S8). Not touched: `reviewer-core` (only `wrapUntrusted` is reused), `mcp` (spec non-goal).

**Priority view (assignment):**
- P1 = S1 (contract), S2+S3 (generate/GET/POST, grounding filter AC-11–13/15, missing inputs, errors), S5 (card, Generate/Refresh, summary/risks/focus, reload shows stored), S6 (focus click → Files changed on that file, AC-16).
- P2 = one `completeStructured` (AC-24), `resolveFeatureModel(…,'risk_brief')` (AC-25), budget (AC-26/27), SHA binding + stale banner (AC-29/30), in-flight join (AC-31), generation line (AC-32), line snapping (AC-14), scroll to line (AC-17), both `brief.ts` copies.
- P3 = AC-18–23 (risk file links, not-in-diff notice, verdict banner, expandable explanation, skeleton, i18n). All are cheap and folded into S5/S6; they can be cut without touching the server.

## Огляд вимог

**Ясно:** AC-1…AC-36, E1–E23, NFR-1…NFR-6 are testable; ACs do not contradict each other.

**Звірено з кодом (facts the plan relies on):**
- `PrBrief` (`server/src/vendor/shared/contracts/brief.ts`) has no producer and no consumer except the type re-export in `client/src/lib/types.ts:38`; no test parses it (grep `PrBrief` over `server/test`, `client/src`, `mcp/src`, `reviewer-core/src` → nothing else). Both copies are byte-identical today (`diff` empty).
- `pr_brief` table (`server/src/db/schema/reviews.ts:97`): `pr_id` PK (FK cascade) + `json jsonb`. Enough → **no migration, no `pnpm db:generate`**. `generated_at`/`head_sha` live inside the JSON.
- Feature model `risk_brief` exists (`contracts/platform.ts:18,61`, default `openai`/`gpt-4.1`), resolver `resolveFeatureModel(container, ws, 'risk_brief')` (`modules/settings/feature-models.ts`), already covered by `server/test/settings-models.it.test.ts:54`.
- `container.reviewRepo`: `getPull(ws, prId)`, `getRepo(repoId)`, `getPrFiles(prId)` (`path, additions, deletions, patch`), `getIntent(prId)` → `PrIntentRecord | undefined` (no LLM). `reviewsForPull(prId)` exists (client already gets verdict/score via `usePrReviews`).
- Blast: `BlastService.get(ws, prId, logger)` (`modules/blast/service.ts`) returns the exact `BlastRadius` the Blast card shows (index read only, no LLM). It only calls the code host when `pr_files` is empty — brief returns `422 empty_diff` before that.
- Smart Diff role: pure `classifyFile(path)` exported from `modules/reviews/smart-diff/index.ts`.
- **Project Context (D1 correction):** docs are attached per agent (`agents.context_paths`) and per skill (`skills.context_paths`). `run-executor.ts:201` builds the effective list with `effectiveContextPaths(agent.contextPaths, enabledLinkedSkills.map(s => s.contextPaths))` (`modules/context/effective.ts`) and reads it with `container.contextService.readDocs(ws, repoId, paths)` (path-vetted: lexical + glob + realpath, never throws, unreadable → `skipped`). `container.agentsRepo.listEnabled(ws)` and `agentsRepo.linkedSkills(agentId)` exist. Token estimator `approxTokens = ceil(chars/4)` in `modules/context/helpers.ts:4`.
- LLM port: `completeStructured({ model, schema, schemaName, messages, maxTokens, timeoutMs, maxRetries })` → `{ data, model, tokensIn, tokensOut, costUsd, attempts }` (`vendor/shared/adapters.ts:55-79`); adapters loop `attempt <= maxRetries + 1` with schema re-prompt and throw `ExternalServiceError('… structured output failed schema validation')`. `container.llm(provider)` throws `ConfigError` when the key is missing (before any call).
- Error mapping precedent: `classifyLlmError` in `modules/onboarding/helpers.ts:415` (ConfigError / timeout / schema-validation regex / else). `AppError(code, msg, status)` for custom statuses (`platform/errors.ts`).
- Prompt infra: `renderPrompt(name, vars)` (`platform/prompts.ts`), templates in `server/src/prompts/` (only `onboarding.system.md` today, with a SECURITY paragraph to mirror); `wrapUntrusted(label, text)` re-exported by `platform/prompt.ts`.
- Client: `OverviewTab` renders `IntentCard`, `BlastRadiusCard`, description; it already receives `prId`, `headSha`. `page.tsx` keeps tab in `?tab=` and has `setParam`. `DiffTab` groups by role with `DEFAULT_COLLAPSED_ROLES = docs, boilerplate`; `FileCard` (`client/src/components/diff-viewer/FileCard/FileCard.tsx`) owns its `open` state, no ids/refs, no focus support; `parsePatch` gives `newNo` per line. No `?file=` deep link exists anywhere. `client/messages/en/brief.json` exists but **no component uses the `brief` namespace** (grep) → safe to rewrite. `VerdictBanner` takes `verdict, summary, score, findingsCount, blockers`. `RunCostBadge` (`formatRunCost`/`formatTokens`) for the muted generation line.
- `OverviewTab.test.tsx` mocks `@/lib/hooks/reviews` (only `usePrIntent`, `useRecomputeIntent`) and `@/lib/hooks/blast` at hook level → adding the card breaks it unless the test mocks `@/lib/hooks/brief` and adds `usePrReviews` to the reviews factory (client INSIGHTS 2026-09-26).

**Неоднозначно (recorded as decisions, pending veto):** spec-doc source and ordering (D1, Q1), focus/navigation details (D9–D11), layout breakpoint (D12), empty `pr_files` (D6), stale intent (D5).

**Чого бракує у спеці (не блокує):** how the 1,200-token spec section is split across several attached docs (D2); where the "not in diff" notice text lives (D11); deterministic e2e coverage (needs a seeded brief, S8).

**Spec edit requested by the orchestrator (D1).** The planner can only write this plan file (hook-enforced), so the spec was **not** edited. Minimal replacement text for `spec-creator`/orchestrator to apply:
- *Decided defaults → D1:* "**Attached specs** = the Project Context docs attached to the workspace's enabled review agents (each enabled agent's `context_paths` plus the `context_paths` of its enabled linked skills — the same effective set reviews receive), read from the clone through Project Context's path-vetted reader. Ordered by how many enabled agents use the doc (desc), then path (asc). The head of each doc is included until the 1,200-token spec section cap. PR-referenced spec paths are not read separately (they already feed the Intent). `specs` is in `missing_inputs` when no doc is attached or none is readable." *(adjust if Q1 picks option b/c)*
- *Open questions:* replace the `[NEEDS CLARIFICATION: D1 …]` line with "None. D1 resolved by the user (2026-10-03): attached specs = Project Context docs attached to the reviewers."
- Wording only: sequence diagram `API->>CX: text of referenced spec docs` → `attached Project Context docs`; E4 "No referenced specs" → "No attached Project Context docs"; NFR-1 row and *Input sources* row "Referenced spec docs" → "Attached Project Context docs"; header *Modules touched* already lists `context`.

## Питання до користувача та відповіді

`AskUserQuestion` is unavailable to this subagent. Blocking questions are returned to the orchestrator; decisions below are adopted **by recommendation, pending user veto** (a veto reopens the named steps).

### Blocking questions (must be answered)

| # | Question | Options (recommended first) | Why it blocks |
|---|---|---|---|
| Q1 | Which Project Context docs count as the brief's "attached specs"? | **(a) Effective docs of all *enabled* agents** (agent paths + enabled linked skills' paths, same as reviews get), ordered by usage count desc then path asc. (b) Docs attached to *any* agent (reuse `agentsRepo.contextUsage` as is, includes disabled agents). (c) (a) ∪ PR-referenced `docs/specs/plans` paths from the description (PR-referenced first). | Changes the S2/S3 loader and the AC-4 `specs` semantics. (a) matches "attached to the reviewer"; (c) costs more budget and duplicates what Intent already summarises. |
| Q2 | Execution mode? | **Multi-agent** (recommended): 2 packages + e2e, after S1 the server lane (S2→S3→S4) and two client lanes (S5, S6) are file-disjoint; tests need a separate `test-writer`. / Single-agent: one sequential pass S1→S9. | Agent rule: the planner must not choose the mode. |
| Q3 | Is there a mockup image/Figma for the PR Brief card, or only the text description from the assignment? | **Text description only** (spec header says so; layout = simple lists, no pixel-matching). / A mockup exists → give its path; S5 gets a re-read and layout/text may change. | Agent rule: no plan on "no mockups" without explicit confirmation. |

### Decisions (pending veto)

| ID | Decision | Affects |
|---|---|---|
| D0 | Execution mode = multi-agent (Q2). | all |
| D1 | Spec source per Q1(a). Loader in brief service: `agentsRepo.listEnabled(ws)` → for each agent `agentsRepo.linkedSkills(agent.id)` filtered to `l.enabled && l.skill.enabled` → `effectiveContextPaths(agent.contextPaths, skills.map(s => s.skill.contextPaths))`; count usage per path; order count DESC, path ASC; `contextService.readDocs(ws, repoId, ordered)`. No changes to `agents`/`context` modules. `ponytail:` N+1 over enabled agents (a handful locally). | S3 |
| D2 | Spec section: each doc's head ≤ 400 tokens (1,600 chars), docs added in order until the 1,200-token cap; the rest are omitted and counted (`specs_omitted` in the log, one line "N more attached docs omitted" to the model). `specs` is missing only when zero docs are readable. | S2 |
| D3 | `completeStructured` with `maxRetries: 2` (adapter default re-prompts = attempts of one call, AC-24), `maxTokens: 2000`, `timeoutMs: 60_000` (per attempt, NFR-2), `schemaName: 'pr_brief'`. No outer `withTimeout` (per-attempt timeout is the spec's bound). | S3 |
| D4 | Error mapping: `ConfigError` → `AppError('provider_not_configured', 'Risk Brief model provider is not configured — add its API key or pick another model in Settings → Models → Risk Brief', 400)`; schema-validation (`classifyLlmError` → `llm_invalid_output`) → `AppError('llm_invalid_output', …, 502)`; anything else (incl. timeout) → `AppError('llm_failed', …, 502)`. `classifyLlmError` is moved to `modules/_shared/llm-errors.ts` and re-exported from `onboarding/helpers.ts` (same precedent as `_shared/clone-fs.ts`), so brief does not import from onboarding. | S2, S3 |
| D5 | Intent: any `pr_intent` row is used, even if computed for an older head (brief never recomputes intent, D2 of spec). Only "no row" → `missing_inputs: intent`. | S3 |
| D6 | Diff source = `container.reviewRepo.getPrFiles(pr.id)` (what Files changed renders). Zero rows → `422 empty_diff` (no code-host fallback; the PR detail page always persists files before Overview mounts). Hunk ranges via one regex over `patch` (`/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm`, count default 1, count 0 → no range); null patch → no ranges. | S2, S3 |
| D7 | Allowlist/anchors: diff paths + every `changed_symbols[].file` + every `downstream[].callers[].file` (exact strings, D7 of spec). Anchors: diff file → all lines in `[newStart, newStart+newLines-1]`; caller-only file → its caller `line`s. Snap = keep if valid, else nearest anchor (ties → lower line), no anchor → 1. | S2 |
| D8 | Risks are stored in model order (capped 8); the **client** sorts high→medium→low stably for display (AC-15). | S2, S5 |
| D9 | Deep link: `?tab=diff&file=<path>[&line=<n>]`. Page `setTab` clears `file`/`line` so a stale focus never reapplies. Focus applies on DiffTab mount (tab switch remounts it). | S6 |
| D10 | Focus mechanics: DiffTab un-collapses the role group containing the file; `DiffViewer` gets `focus?: { path: string; line?: number }`; `FileCard` opens itself when focused and `scrollIntoView` its header, or the `CodeLine` whose `newNo === line` (highlighted via a style) when rendered (AC-17). Works in grouped and original-order views. | S6 |
| D11 | AC-19 notice "File not in this PR's diff: <path>" lives in `prReview.json` (`smartDiff.fileNotInDiff`, DiffTab's namespace); everything in the card is in `brief.json` (AC-23). | S6 |
| D12 | AC-3 layout: brief card full width on top; Intent and Blast in a CSS grid `repeat(auto-fit, minmax(440px, 1fr))` (inline styles cannot hold media queries). Two columns from ~1,000 px viewport; checked manually at 1280/800 px. `ponytail:` approximate breakpoint, a real `@media (min-width:1024px)` class if exactness matters. Description stays below. | S5 |
| D13 | `cost_usd` stays `null` when the adapter gives none; `attempts` from `StructuredResult.attempts`. | S3 |
| D14 | Stored row that fails `PrBrief.safeParse` (future contract change) → GET 404 (card shows Generate). | S3 |
| D15 | e2e: seed one valid `pr_brief` row for demo PR #482 (validated with `PrBrief.parse` in the seed) and add one deterministic flow; no LLM. | S8 |

## Рекомендації

1. **No migration, no new tables.** `pr_brief.json` already fits the whole DTO.
2. **Reuse over rebuild:** `BlastService.get` (same data as the Blast card → allowlist consistent with what the user sees), `container.reviewRepo` trio + `getIntent`, `classifyFile`, `effectiveContextPaths` + `contextService.readDocs` (path safety for free), `approxTokens`, `wrapUntrusted`, `renderPrompt`, `resolveFeatureModel`, `VerdictBanner`, `RunCostBadge`, `parsePatch`.
3. **Pure core:** allowlist, anchors, draft filtering, facts serialisation + budget, missing-input calc, spec-doc ordering all live in `brief/helpers.ts` → AC-11–15, 26, 27, 4 are hermetic unit tests with crafted inputs.
4. **In-flight join** = `Map<prId, Promise<PrBrief>>` on the single `BriefService` instance created once in `routes.ts` (D6 of spec), deleted in `finally`.
5. **Client:** new hook file `hooks/brief.ts` (do not extend `hooks/reviews.ts` — avoids breaking the 6 `vi.mock(".../hooks/reviews")` factories).
6. **Risk worth knowing:** joining an in-flight generation also joins its failure (both callers get the 502) — intended.
7. **Order:** contract first, then server lane and two client lanes in parallel, tests per lane, e2e + docs last.

## Зачеплені модулі

| Package | Area | Change |
|---|---|---|
| `server` | `src/vendor/shared/contracts/brief.ts` | `PrBrief` changes + `PrBriefDraft`, `ReviewFocusItem`, `PrBriefMissingInput`, `PrBriefGeneration` (source of truth) |
| `server` | `src/modules/_shared/llm-errors.ts` (new), `src/modules/onboarding/helpers.ts` (re-export only) | shared LLM error classification |
| `server` | `src/modules/brief/` (new: `constants.ts`, `helpers.ts`, `repository.ts`, `service.ts`, `routes.ts`), `src/modules/index.ts`, `src/prompts/brief.system.md` (new) | facts, budget, grounding, GET/POST |
| `server` | `src/db/seed.ts` | one seeded brief for PR #482 (S8) |
| `client` | `src/vendor/shared/contracts/brief.ts` | identical copy (sanctioned mirror edit) |
| `client` | `src/lib/hooks/brief.ts` (new), `messages/en/brief.json` (rewrite), `OverviewTab/**`, `PrBriefCard/**` (new) | card |
| `client` | `page.tsx` (PR detail), `DiffTab/**`, `src/components/diff-viewer/{DiffViewer,FileCard,CodeLine}/*`, `messages/en/prReview.json` | deep link + focus |
| `e2e` | `specs/08-pr-brief.flow.json` (new) | click focus → Files changed |

## Архітектурні обмеження

- **server → `onion-architecture`:** `routes.ts` (Zod params/body, `getContext`, no logic) → `service.ts` (orchestration over `container.reviewRepo`, `BlastService`, `container.agentsRepo`, `container.contextService`, `container.llm`, `BriefRepository`) → `repository.ts` (Drizzle only, `pr_brief`). Pure rules in `helpers.ts` (no fs/DB/LLM/Fastify imports). Cross-module reuse is limited to **public, already-shared entry points**: `BlastService` (precedent: `blast → pulls/service`), `reviews/smart-diff/index.ts` barrel (`classifyFile`, pure), `context/effective.ts` (precedent: `run-executor`), `context/helpers.ts#approxTokens` (pure). No imports of other modules' `repository.ts`, tables, or Zod schemas; LLM error classification moves to `_shared`.
- **client → `ui-architecture`:** page stays thin (only URL param wiring). Feature logic in colocated `_components/PrBriefCard/` (`PrBriefCard.tsx`, `styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`, optional `_components/RiskList`, `_components/FocusList`). Data only via `src/lib/hooks/brief.ts`. `diff-viewer` stays generic (takes a `focus` prop; knows nothing about briefs).
- **Do-not-touch:** no `server/src/db/migrations/**` edits (none needed), no lock files (no new deps), `client/src/vendor/**` only for the sanctioned `contracts/brief.ts` copy. `server/src/vendor/shared` edited only in S1.
- **Contract changes:** `PrBrief.intent`/`blast` become nullable, `history` optional, 6 new required fields → S1 adds contract tests; there are no existing fixtures to update (verified). Both copies must stay byte-identical (`diff` empty is a checkpoint).
- **NFR-5:** model text rendered as plain text (`{text}` in JSX), never `Markdown`/`dangerouslySetInnerHTML`; the only links are validated file buttons.

## Контекст з INSIGHTS.md (digest for executors)

1. New module needing PR + repo + files → `container.reviewRepo.getPull/getRepo/getPrFiles`, not a new repository (server 2026-09-26).
2. `findings.file`/`pr_files.path` are exact-match by construction — keep allowlist matching exact, no normalisation (server 2026-09-22, spec D7).
3. `MockLLMProvider` schema failure throws `MockLLMProvider fixture failed schema`, which does **not** classify as `llm_invalid_output` → stub `completeStructured` to throw the real adapter message `structured output failed schema validation` for AC-28 (server 2026-10-03).
4. A bad fixture is still fine for "any LLM failure" paths (server 2026-09-21).
5. Bodiless POST has `req.body === null` → body schema `z.object({}).nullish()` (server 2026-09-18).
6. `ValidationError` is always 422; use `new AppError(code, msg, status)` for 400/404/422/502 codes (server Decision entry).
7. Extract best-effort fact loaders (blast/intent/specs) into named functions that return `{ value | null }` so failure paths are hermetically testable (server 2026-09-21).
8. Routes using `getContext` need Postgres → route tests go to `*.it.test.ts` (server 2026-09-26).
9. Never write `*/` (or a glob like `a/*/b`) inside a `/** */` comment (server 2026-09-19/22).
10. Cost already flows via `StructuredResult.costUsd` — don't recompute (server 2026-09-14).
11. Adding exports to a hook module that is `vi.mock`-ed elsewhere breaks those tests → new file `hooks/brief.ts`; still update `OverviewTab.test.tsx` mocks (client 2026-09-26).
12. Fetch-level stubbing (`BlastRadiusCard.test.tsx`) is the house pattern for new component tests (client 2026-09-26).
13. Reuse `formatRunCost`/`formatTokens` for the generation line (client 2026-09-14).
14. `client/src/vendor/shared` is a partial mirror in general, but `brief.ts` must stay byte-identical (spec) — apply the same hunk, then `diff` (client 2026-09-14).
15. Re-read a component right before writing its tests if a lane changed it mid-session (client 2026-09-26).

## Скіли по кроках

| Step | Paths | Skills |
|---|---|---|
| S1 | `server/src/vendor/shared/contracts/brief.ts`, client copy, `server/test/contracts.test.ts` | `zod`, `onion-architecture` |
| S2 | `server/src/modules/brief/{constants,helpers}.ts`, `server/src/modules/_shared/llm-errors.ts`, `server/src/modules/onboarding/helpers.ts` | `onion-architecture`, `typescript-expert`, `security` |
| S3 | `server/src/modules/brief/{repository,service,routes}.ts`, `server/src/modules/index.ts`, `server/src/prompts/brief.system.md` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `security` |
| S4 | server tests | `onion-architecture` (`rules/testing-strategy.md`), `security` |
| S5 | `client/src/lib/hooks/brief.ts`, `client/messages/en/brief.json`, `OverviewTab/**`, `PrBriefCard/**` | `ui-architecture`, `react-best-practices`, `next-best-practices`, `frontend-architecture` |
| S6 | PR detail `page.tsx`, `DiffTab/**`, `client/src/components/diff-viewer/**`, `client/messages/en/prReview.json` | `ui-architecture`, `react-best-practices`, `next-best-practices` |
| S7 | client tests | `react-testing-library`, `ui-architecture` |
| S8 | `server/src/db/seed.ts`, `e2e/specs/08-pr-brief.flow.json` | `drizzle-orm-patterns`, `zod` |
| S9 | READMEs, INSIGHTS, validation | `engineering-insights`, `mermaid-diagram` |

## Міжкрокові зв'язки (сигнатура + де підключається) і правки vendored-файлів

**S1 → S2/S3/S5/S6 — contract (`@devdigest/shared`, `contracts/brief.ts`, exported via existing `export *`):**

```ts
export const ReviewFocusItem = z.object({ file: z.string(), line: z.number().int(), reason: z.string() });
export const PrBriefDraft = z.object({            // model output; all fields required (strict json_schema)
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export const PrBriefMissingInput = z.enum(['intent', 'blast', 'specs', 'description']);
export const PrBriefGeneration = z.object({
  provider: z.string(), model: z.string(),
  tokens_in: z.number().int(), tokens_out: z.number().int(),
  cost_usd: z.number().nullable(), attempts: z.number().int(),
});
export const PrBrief = z.object({
  summary: z.string(),
  intent: Intent.nullable(),
  blast: BlastRadius.nullable(),
  risks: Risks,
  review_focus: z.array(ReviewFocusItem),
  history: PrHistory.optional(),
  head_sha: z.string(),
  generated_at: z.string(),                       // ISO
  missing_inputs: z.array(PrBriefMissingInput),
  generation: PrBriefGeneration,
});
// + `export type X = z.infer<typeof X>` for each (house naming rule)
```

**S2 → S3 — brief internals (`server/src/modules/brief/`, written by S2, consumed by S3):**

```ts
// _shared/llm-errors.ts (moved from onboarding/helpers.ts, re-exported there unchanged)
export type LlmErrorReason = 'llm_not_configured' | 'llm_timeout' | 'llm_invalid_output' | 'llm_failed';
export function classifyLlmError(err: unknown): LlmErrorReason

// brief/constants.ts
INPUT_TOKEN_BUDGET = 8000; CAP = { system: 800, intent: 400, blast: 1200, diff: 3600, description: 800, specs: 1200 };
SPEC_DOC_HEAD_TOKENS = 400; BLAST_CALLERS_MAX = 40; BLAST_CALLERS_KEEP = 10; DIFF_ROWS_KEEP = 20;
MAX_RISKS = 8; MAX_FOCUS = 8; LLM_MAX_TOKENS = 2000; LLM_TIMEOUT_MS = 60_000; LLM_MAX_RETRIES = 2;

// brief/helpers.ts (pure)
export interface DiffFileFact { path: string; additions: number; deletions: number; role: SmartDiffRole; ranges: [number, number][] }
export function hunkRanges(patch: string | null): [number, number][]                    // D6 regex, @@ context text never kept
export function toDiffFacts(files: { path; additions; deletions; patch }[]): DiffFileFact[]   // role = classifyFile(path)
export function buildAllowlist(diff: DiffFileFact[], blast: BlastRadius | null): { paths: Set<string>; anchors: Map<string, number[]> } // D7
export function snapLine(line: number, anchors: number[] | undefined): number            // AC-14 / D7
export function groundDraft(draft: PrBriefDraft, allow: ReturnType<typeof buildAllowlist>):
  { summary: string; risks: Risk[]; review_focus: ReviewFocusItem[];
    dropped: { risks: number; fileRefs: number; focus: number; snapped: number } }       // AC-12/13/14/15
export function orderSpecPaths(perAgent: string[][]): string[]                          // D1: usage DESC, path ASC
export function missingInputs(i: { intent: unknown; blast: unknown; specDocs: number; description: string | null }): PrBriefMissingInput[]
export function buildFactsMessage(f: {
  title: string; description: string | null; intent: Intent | null;
  blast: BlastRadius | null; blastPartial: boolean; diff: DiffFileFact[];
  specs: { path: string; text: string }[]; missing: PrBriefMissingInput[];
}, systemTokens: number): { text: string; estTokens: number; truncated: { specs: boolean; description: boolean; callers: boolean; diffRows: number } }
// Every untrusted block via wrapUntrusted(label, text); per-section caps then NFR-1 drop order; total (system + text) ≤ 8,000 est. tokens.
export function blastUsable(b: BlastRadius): { use: boolean; partial: boolean }        // AC-34: degraded + reason ≠ index_partial → not used
```

**S3 → S5/S6/S8 — HTTP (`server/src/modules/brief/routes.ts`, registered in `modules/index.ts`):**
- `GET /pulls/:id/brief` → `200 PrBrief` | `404 { error: { code: 'no_brief' } }` (none / invalid stored JSON) | `404 not_found` (PR not in workspace). Never calls LLM or code host.
- `POST /pulls/:id/brief` (body `z.object({}).nullish()`) → `200 PrBrief` | `404 not_found` | `422 empty_diff` | `400 provider_not_configured` | `502 llm_failed` | `502 llm_invalid_output`.

**S5 ↔ S6 — client seam (written by S5, wired by S6):**
- `OverviewTab` gains props `onOpenFile: (path: string, line?: number) => void`, `filesCount: number`; it passes `onOpenFile`, `prId`, `headSha`, `filesCount` to `PrBriefCard`.
- S6 owns `page.tsx`: `openFile = (path, line) => router.replace(…?tab=diff&file=<enc>&line=<n>)`, passes `onOpenFile={openFile}` and `filesCount={pr.files_count}` to `OverviewTab`, and `focusPath = search.get('file')`, `focusLine = Number(search.get('line')) || undefined` to `DiffTab`. Until S6 lands, S5 compiles against these prop names (no stubs needed — props are plain callbacks).
- `DiffViewer` / `FileCard` new optional prop: `focus?: { path: string; line?: number }` (S6).

**Vendored / do-not-touch edits the plan requires (for the `/implement` gate):**
1. `server/src/vendor/shared/contracts/brief.ts` — source of truth; S1 only.
2. `client/src/vendor/shared/contracts/brief.ts` — the same hunk in S1; `diff` of the two copies must be empty (spec requirement, P2 assignment item).
No migrations, no lock-file changes, no `client/src/vendor/ui` edits.

**Designs:** pending Q3. Currently the only design source is the assignment's text description (no image/Figma); there are no mockup paths to give S5. UI copy comes from the spec ACs.

## Кроки реалізації

Dependency graph:

```
S1 (contract) ──┬─> S2 (pure helpers) ─> S3 (service/API/prompt) ─> S4 (server tests) ─┐
                ├─> S5 (card, hooks, copy, Overview layout) ─┐                          ├─> S8 (seed + e2e) ─> S9 (docs, verify)
                └─> S6 (deep link + diff focus, page wiring) ─┴─> S7 (client tests) ────┘
```

- [x] **S1 — Shared contract `PrBrief` (both copies) + contract tests** · `server` (+ client copy) · deps: none · runs first, alone
  - AC: contract basis for AC-2, 4, 5, 6, 8, 14, 15, 24, 28, 29, 30, 32
  - Files owned: `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, `server/test/contracts.test.ts`
  - Work: schemas per «Міжкрокові зв'язки»; update the top-of-file doc comment. Tests: a full brief parses; `intent: null`/`blast: null`/no `history` parse; `PrBriefDraft` rejects missing `review_focus` and non-int `line`. Checkpoint: `diff` of the two files empty; typecheck both packages.
  - Skills: `zod`, `onion-architecture`

- [x] **S2 — Brief pure helpers + shared LLM error classification** · `server` · deps: S1
  - AC: AC-4 (missing list + prompt mention), AC-11, AC-12, AC-13, AC-14, AC-15, AC-26, AC-27, AC-34 (usable/partial rule), NFR-1, NFR-4 (counts source); E2, E3, E5, E7, E8, E10, E11, E17, E19, E22
  - Files owned: `server/src/modules/_shared/llm-errors.ts` (new), `server/src/modules/onboarding/helpers.ts` (replace `classifyLlmError` body with a re-export only; no behaviour change), `server/src/modules/brief/constants.ts`, `server/src/modules/brief/helpers.ts`
  - Work: everything in the S2 signature block. `buildFactsMessage` sections in fixed order (missing-inputs line → intent → blast summary + callers `file:line name` (≤ 40, "caller list may be incomplete" note when partial) → diff rows sorted by churn DESC then path ASC as `path +A -D role ranges` → description → spec heads); each untrusted block wrapped; per-section caps by `approxTokens`; then drop order spec → description tail → callers beyond 10 → diff rows from the low-churn end (top 20 never dropped, one `+N more files (A additions, D deletions)` line). Diff rows contain numbers and paths only — never patch lines.
  - Skills: `onion-architecture`, `typescript-expert`, `security`

- [x] **S3 — Brief service, repository, routes, prompt** · `server` · deps: S2
  - AC: AC-1 (no call before POST), AC-4, AC-8 (GET 0 calls), AC-9, AC-10 (store only on success), AC-24, AC-25, AC-28, AC-29, AC-31, AC-32 (stored fields), AC-33, AC-34, AC-35, AC-36, NFR-2, NFR-3, NFR-4, NFR-5 (server side: plain strings only); E1, E2, E4, E5, E6, E12, E13, E14, E15, E18, E21, E23
  - Files owned: `server/src/modules/brief/repository.ts`, `server/src/modules/brief/service.ts`, `server/src/modules/brief/routes.ts`, `server/src/modules/index.ts` (register), `server/src/prompts/brief.system.md` (new)
  - Work:
    - `repository.ts`: `get(prId) → unknown | null`, `upsert(prId, json)` (`onConflictDoUpdate` on `pr_id`).
    - `service.get(ws, prId)`: `reviewRepo.getPull` (404) → row → `PrBrief.safeParse` → else `AppError('no_brief', …, 404)` (D14).
    - `service.generate(ws, prId, log)`: in-flight `Map` join (AC-31) → PR (404) → `getPrFiles` → 0 → `AppError('empty_diff', …, 422)` → `resolveFeatureModel(…,'risk_brief')` + `container.llm(provider)` (ConfigError → 400, D4) → best-effort loaders, each its own named function returning value-or-null: `loadIntent` (`reviewRepo.getIntent`, D5), `loadBlast` (`new BlastService(container).get`, catch → null; `blastUsable` decides), `loadSpecs` (D1/D2) → `missingInputs` → `buildFactsMessage` → **one** `completeStructured({ model, schema: PrBriefDraft, schemaName: 'pr_brief', messages: [system, user], maxTokens: 2000, timeoutMs: 60_000, maxRetries: 2 })` → error → D4 mapping, nothing stored → `groundDraft` → assemble `PrBrief` (`head_sha = pull.headSha`, `generated_at`, `intent`/`blast` used or null, `generation` from result + choice) → upsert → return.
    - One log line per generation (success or failure): `{ prId, provider, model, attempts, tokensIn, tokensOut, costUsd, durationMs, estInputTokens, truncated, missing_inputs, dropped: { risks, fileRefs, focus }, snapped, specsOmitted, outcome }` — no PR/spec/model text.
    - `routes.ts`: `GET`/`POST /pulls/:id/brief` with `IdParams`, `getContext`, body `z.object({}).nullish()`, response `200: PrBrief`; one `BriefService` per plugin instance.
    - `brief.system.md`: role, output rules (summary 1–3 sentences what + why; ≤ 8 risks, each with ≥ 1 `file_refs` taken from the listed files; ≤ 8 focus items in reading order using listed paths and lines from listed ranges/caller lines; mention missing inputs honestly), SECURITY paragraph copied in spirit from `onboarding.system.md`. Keep ≤ ~800 tokens.
  - Skills: `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `security`

- [x] **S4 — Server tests** · `server` · executor `test-writer` · deps: S3
  - Files owned: `server/test/brief-helpers.test.ts`, `server/test/brief-service.test.ts`, `server/test/brief.it.test.ts`, `server/test/llm-errors.test.ts` (optional; onboarding tests already cover classification)
  - Skills: `onion-architecture` (`rules/testing-strategy.md`), `security`

- [x] **S5 — Client hooks, copy, PR Brief card, Overview layout** · `client` · deps: S1 (contract); codes against the S3 HTTP signature (can run in parallel with S2–S4)
  - AC: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-15 (display sort), AC-18 (risk file buttons call `onOpenFile(path)`), AC-20, AC-21, AC-22, AC-23, AC-30, AC-32 (muted line), AC-33, AC-36 (message), NFR-5, NFR-6; E1, E5, E6, E11, E13, E14, E16, E18, E20
  - Files owned: `client/src/lib/hooks/brief.ts` (new), `client/messages/en/brief.json` (rewrite; old keys unused), `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/{OverviewTab.tsx,styles.ts}`, `client/src/app/repos/[repoId]/pulls/[number]/_components/PrBriefCard/**` (new: `PrBriefCard.tsx`, `styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`, optional `_components/RiskList`, `_components/FocusList`)
  - Work:
    - Hooks: `usePrBrief(prId)` — GET, `ApiError` 404 → `null`; `useGenerateBrief(prId)` — POST, `onSuccess: setQueryData(["pr-brief", prId], data)`; on error the cached brief is untouched (AC-10).
    - Card states: no brief → "Generate brief" (disabled + "This PR has no changed files — nothing to brief." when `filesCount === 0`, AC-33); pending → skeleton, buttons disabled (AC-22); brief → banner (`VerdictBanner` with latest review from `usePrReviews` when one exists, else plain summary — AC-20), "Generated without: …" note (AC-4), Risk areas sorted by severity with text label + colour badge, collapsed explanation toggle, file buttons (AC-5, 18, 21, NFR-6), Review focus as buttons `file:line — reason` with `aria-label` containing path and line (AC-6, 16 trigger), empty texts (AC-7), stale banner when `brief.head_sha !== headSha` with Regenerate (AC-30), Refresh (AC-9), muted line provider · model · tokens · cost (`formatTokens`/`formatRunCost`, "cost unknown" for null) · attempts (AC-32), error row with Retry on POST failure using the server message (covers AC-36 text), keeping the previous brief (AC-10). All copy from `brief.json`; model text rendered as plain text.
    - `OverviewTab`: `PrBriefCard` first, then a grid with `IntentCard` + `BlastRadiusCard` (D12), description last; new props per seam.
  - Skills: `ui-architecture`, `react-best-practices`, `next-best-practices`, `frontend-architecture`

- [x] **S6 — Files changed deep link + file/line focus** · `client` · deps: S1; parallel with S5 (file-disjoint)
  - AC: AC-16, AC-17, AC-18 (navigation part), AC-19; E9, E19
  - Files owned: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/{DiffTab.tsx,helpers.ts,styles.ts}`, `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx`, `client/src/components/diff-viewer/FileCard/FileCard.tsx`, `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`, `client/src/components/diff-viewer/styles.ts`, `client/messages/en/prReview.json` (`smartDiff.fileNotInDiff`)
  - Work: page `openFile` + pass props (seam); `setTab` clears `file`/`line` (D9). DiffTab: `focusPath`/`focusLine` props; if `focusPath` not in `files` → notice naming the path (AC-19, D11); else un-collapse its role group on mount and pass `focus` to the `DiffViewer` holding it. `FileCard`: when `focus.path === file.path` → `setOpen(true)` in an effect, then `scrollIntoView` the matching `CodeLine` (`newNo === line`, highlighted style) or the header (AC-16/17). Pure helper `roleOfPath(groups, path)` in `DiffTab/helpers.ts`.
  - Skills: `ui-architecture`, `react-best-practices`, `next-best-practices`

- [x] **S7 — Client tests** · `client` · executor `test-writer` · deps: S5, S6
  - Files owned: `PrBriefCard/PrBriefCard.test.tsx`, `PrBriefCard/helpers.test.ts`, `OverviewTab/OverviewTab.test.tsx` (add `vi.mock("@/lib/hooks/brief")`, `usePrReviews` in the reviews factory, layout assertion), `DiffTab/helpers.test.ts` (extend), `DiffTab/DiffTab.test.tsx` (new), `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` (new)
  - Skills: `react-testing-library`, `ui-architecture`

- [x] **S8 — Seeded brief + e2e flow (deterministic, no LLM)** · `server` + `e2e` · executor `test-writer` · deps: S3, S6 · optional (D15; veto drops it, RTL + manual check then cover AC-16)
  - AC: AC-8, AC-16 (end-to-end), AC-2 display
  - Files owned: `server/src/db/seed.ts` (one `pr_brief` row for PR #482 with `head_sha` `a1b2c3d4e5f6`, a focus item on `src/config.ts` with a line inside its seeded hunk, `PrBrief.parse` before insert, `onConflictDoNothing`), `e2e/specs/08-pr-brief.flow.json` (open #482 → Overview shows "Review focus" → click focus item → `wait --url tab=diff` + `file=src` → `wait --text src/config.ts`)
  - Skills: `drizzle-orm-patterns`, `zod`

- [ ] **S9 — Docs, INSIGHTS, verification** · `server` + `client` · executors `doc-writer`, then `plan-verifier` · deps: S4, S7, S8
  - Files owned: `server/README.md` (API map: 2 routes), `server/AGENTS.md` (map row `src/modules/brief`), `client/README.md` (Overview brief + deep-link params), `server/INSIGHTS.md` / `client/INSIGHTS.md` (only if a non-obvious lesson came up), `specs/09-spec-pr-brief/09-validation-pr-brief.md` (written by the orchestrator from the verifier report)
  - Skills: `engineering-insights`, `mermaid-diagram`

## Traceability: AC → task → planned test

Test files: **SC** = `server/test/contracts.test.ts` · **SH** = `server/test/brief-helpers.test.ts` (pure) · **SS** = `server/test/brief-service.test.ts` (hermetic: fake container with stub `reviewRepo`, stub `repoIntel`/`BlastService` path, stub `agentsRepo`/`contextService`, `MockLLMProvider` call counter or throwing stubs, in-memory `BriefRepository`) · **SI** = `server/test/brief.it.test.ts` (Postgres, routes) · **CB** = `PrBriefCard.test.tsx` (fetch stubbed) · **CBH** = `PrBriefCard/helpers.test.ts` · **CO** = `OverviewTab.test.tsx` · **CD** = `DiffTab.test.tsx` + `DiffTab/helpers.test.ts` · **CF** = `FileCard.test.tsx` · **E** = `e2e/specs/08-pr-brief.flow.json` · **M** = manual browser.

| AC / NFR | Edge | Task | Planned test |
|---|---|---|---|
| AC-1 | E21 | S3, S5 | CB → GET 404 → "Generate brief" shown, no POST issued; SS → `get` never calls LLM |
| AC-2 | — | S5 | CB → click Generate → POST → summary + "Risk areas" + "Review focus" rendered without remount |
| AC-3 | — | S5 | CO → Intent and Blast each rendered once, brief card present, grid style on wrapper; M → 1280 / 800 px |
| AC-4 | E1, E4, E5 | S2, S3, S5 | SH → `missingInputs` table; `buildFactsMessage` mentions each missing input; SS → no intent / blast throws / no attached docs / empty body → `missing_inputs`; CB → "Generated without: intent, specs" |
| AC-5 | E7 | S5 | CB → each risk shows title, severity label, ≥ 1 file button |
| AC-6 | — | S5 | CB → focus item text `src/a.ts:12 — reason` |
| AC-7 | E11 | S5 | CB → empty risks/focus → the two empty-state texts |
| AC-8 | E13 | S3, S5 | SI → POST then GET returns equal JSON, LLM call count stays 1; CB → stored brief rendered, no POST; E |
| AC-9 | — | S3, S5 | SS → second generate replaces stored row, 1 call each; CB → Refresh → POST → new summary |
| AC-10 | E14, E23 | S3, S5 | SS → failing LLM keeps the old row byte-equal; CB → POST 502 → old brief still shown + error + Retry |
| AC-11 | E2, E10 | S2 | SH → allowlist = diff ∪ symbols ∪ callers; `./src/a.ts` and `SRC/a.ts` not matched |
| AC-12 | E7 | S2 | SH → invented ref removed; risk with no refs left dropped; counts reported |
| AC-13 | E7 | S2 | SH → focus item with invented file dropped |
| AC-14 | E8, E19 | S2 | SH → line outside hunks → nearest range line; caller-only file → nearest caller line; deleted file / null patch → 1 |
| AC-15 | E22 | S2, S5 | SH → 10 risks / 10 focus → first 8, model order; CBH → stable severity sort |
| AC-16 | E9 | S6 | CD → `focusPath` in a collapsed `docs` group → group expanded, file open; CF → focused card open + `scrollIntoView` called; CB → click focus item → `onOpenFile(path, line)`; E |
| AC-17 | — | S6 | CF → rendered line → that row scrolled + highlighted; line outside hunks → header scrolled |
| AC-18 | — | S5, S6 | CB → risk file button → `onOpenFile(path)` |
| AC-19 | E9 | S6 | CD → `focusPath` not in files → "File not in this PR's diff" notice with the path |
| AC-20 | E20 | S5 | CB → with a review → VerdictBanner verdict + score + summary; none → summary only |
| AC-21 | — | S5 | CB → explanation hidden until expand; severity has text label |
| AC-22 | — | S5 | CB → pending POST → skeleton, Generate/Refresh disabled |
| AC-23 | — | S5 | CB renders with `brief.json` messages only (missing key would throw in next-intl test provider) |
| AC-24 | — | S3 | SS → spy: `completeStructured` called once with `maxRetries: 2`; `complete`/`embed` never; intent never derived |
| AC-25 | — | S3 | SS → workspace override for `risk_brief` → that provider/model passed; none → registry default |
| AC-26 | E17 | S2 | SH → 400-file fixture + huge description + 5 docs → `estTokens ≤ 8000`, drop order honoured, top-20 rows kept, "+N more files" line |
| AC-27 | — | S2 | SH → patch with `+secret`/`-old`/`@@ … @@ function foo()` → none of those strings in the message, ranges present |
| AC-28 | E15 | S3 | SS → stub throws `ExternalServiceError('structured output failed schema validation')` → 502 `llm_invalid_output`, nothing stored (INSIGHTS #3) |
| AC-29 | — | S3 | SS → stored `head_sha` = PR `headSha` |
| AC-30 | E16 | S5 | CB → `head_sha` ≠ prop `headSha` → "PR updated since this brief was generated" + Regenerate; no auto POST |
| AC-31 | E12 | S3 | SS → two concurrent `generate` with a deferred LLM → 1 call, same object; SI → two parallel POSTs → both 200, 1 call |
| AC-32 | — | S3, S5 | SS → `generation` fields from result; CB → muted line, "cost unknown" for null |
| AC-33 | E6 | S3, S5 | SS → 0 files → 422 `empty_diff`, 0 calls; CB → `filesCount=0` → message + disabled button |
| AC-34 | E2, E3 | S2, S3 | SH → `blastUsable` per reason; SS → `index_partial` used + note in message, not missing; throws → missing |
| AC-35 | E1 | S3 | SS → no intent row → `missing_inputs` has `intent`, generation proceeds |
| AC-36 | E18 | S3, S5 | SS → `container.llm` throws `ConfigError` → 400 `provider_not_configured`, message names "Risk Brief", 0 calls, no row; CB → error text shown |
| NFR-1 | E17 | S2 | as AC-26 (per-section caps asserted) |
| NFR-2 | — | S3 | SS → `maxTokens: 2000`, `timeoutMs: 60000` |
| NFR-3 | — | S3 | SI → GET with stub code host that throws → still 200; SS → GET 0 LLM calls |
| NFR-4 | — | S3 | SS → logger spy: exactly one line per success/failure, fields present, serialized line contains no description/spec/summary text |
| NFR-5 | — | S5 | CB → summary `<img src=x onerror=…>` / `**bold**` rendered as literal text |
| NFR-6 | — | S5 | CB → focus items are `button`s with accessible name containing path and line; M → keyboard pass |
| Contract | — | S1 | SC → parse cases; checkpoint `diff` of both `brief.ts` copies empty |

**Edge cases → task:** E1 S3/S5 · E2 S2/S3 · E3 S2/S3 · E4 S3 · E5 S2/S3 · E6 S3/S5 · E7 S2 · E8 S2 · E9 S6 · E10 S2 · E11 S2/S5 · E12 S3 · E13 S3/S5 · E14 S3/S5 · E15 S3 · E16 S5 · E17 S2 · E18 S3/S5 · E19 S2 · E20 S5 · E21 S3/S5 · E22 S2 · E23 S5.

**Gaps:** no AC without a task; no task without an AC (S9 is docs/verification). AC-3 breakpoint is approximate (D12) — manual check. E23 (process restart) has no automated test; covered by AC-10 behaviour.

## Режим виконання і розподіл

**Pending user answer (Q2). Recommended: multi-agent.** Reason: two packages + e2e, one contract seam, after S1 the server lane and two client lanes touch disjoint files, and tests must be written by `test-writer` (implementers do not write tests).

| Batch | Steps (parallel within batch) | Executor |
|---|---|---|
| 1 | S1 (alone — contract first) | `implementer` |
| 2 | S2 (server) ‖ S5 (client card) ‖ S6 (client deep link) | `implementer` ×3 |
| 3 | S3 (server, needs S2) ‖ S7 (client tests, needs S5+S6) | `implementer` ‖ `test-writer` |
| 4 | S4 (server tests) | `test-writer` |
| 5 | S8 (seed + e2e, needs S3+S6) | `test-writer` |
| 6 | architecture review of the full diff (≤ 2 fix rounds) | `architecture-reviewer` → `implementer` (fix mode) |
| 7 | S9 docs, then verification | `doc-writer` → `plan-verifier` |

File ownership is disjoint inside each batch (S5/S6 share no files: `page.tsx` belongs to S6 only; `OverviewTab` to S5 only).

**If single-agent is chosen:** one sequential pass S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9, with checkpoints after S1 (both typechecks + `diff`), after S3 (server typecheck + hermetic suite), after S4 (server `.it`), after S6 (client typecheck), after S7 (client tests).

## План перевірки (described, not run)

From root `CLAUDE.md`:
- `server/`: `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` · `pnpm exec vitest run .it.test` (Docker/Postgres) · `pnpm lint`
- `client/`: `pnpm typecheck` · `pnpm test` · `pnpm lint`
- `e2e/` (needs `./scripts/dev.sh` with a freshly seeded DB): `npm run typecheck` · `npm test` — all flows incl. the new `08-pr-brief.flow.json`; `02`/`04`/`05` must stay green.
- Contract: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` → empty.
- Manual: Overview on a seeded PR with and without a `risk_brief` provider key; Generate → reload (no new call in server log) → Refresh; push a commit → stale banner; click focus/risk items (in-diff, caller-only, collapsed docs group); layout at 1280 / 800 px; keyboard pass; check the one server log line per generation.

## Ризики / відкриті питання

| Risk | Mitigation |
|---|---|
| Q1 answer changes the spec loader | Loader isolated in `loadSpecs` + `orderSpecPaths`; only S2/S3 and the spec D1 text change. |
| Many attached docs → only the first few heads fit | D2 caps per doc; omitted count logged and told to the model. |
| `pr_files` empty for a PR whose detail was never opened (MCP/direct API) → 422 | D6; the UI always loads detail first. Upgrade: reuse `BlastService`'s detail fallback if needed. |
| Joined in-flight request also gets the failure | Intended (one model call, AC-31). |
| Approximate AC-3 breakpoint | D12, manual check; switch to a CSS class if exactness is required. |
| Hook-level mocks in `OverviewTab.test.tsx` break when the card mounts | S7 owns that file and updates the factories (INSIGHTS #11). |
| `BlastService` cross-module import | Same precedent as `blast → pulls/service`; architecture-reviewer confirms in batch 6. |
| Seeded brief drifts from the contract | `PrBrief.parse` in seed fails loudly. |
| Spec D1 text still says "PR-referenced specs" | Orchestrator applies the replacement text above (planner can only write this file). |

Open questions: Q1–Q3 (blocking); D0–D15 pending veto.

## Поза межами плану

- PR history in the brief, MCP exposure, posting to GitHub/GitLab, brief history/versions, auto-generation, intent/blast computation inside brief generation, localisation (spec non-goals).
- DB migration (not needed), `reviewer-core` changes.
- Multi-instance in-flight lock (DB advisory lock) — add when the API runs more than one process.

## Review amendments (cross-model review, claude-opus-5-5, 2026-10-03) — binding for implementers

- A1 [major, S6] Smart Diff loads async: `DiffTab` first renders ungrouped, then remounts grouped. Un-collapse the focused file's role group in an effect keyed on `[groups, focusPath]` (not "on mount"). `FileCard` focus must override the grouped view's `defaultOpen=false`. Scroll only after `open` has rendered lines (effect on `open` / rAF), not in the same effect as `setOpen(true)`.
- A2 [major, S5/S6] Make `onOpenFile` and `filesCount` OPTIONAL props on `OverviewTab` in S5 so S5 and S6 typecheck independently in batch 2; S6 wires them in `page.tsx`.
- A3 [major, S8] Seeded `pr_files` for #482 have no `patch` (`server/src/db/seed.ts` ~L156), so no hunks. S8 must either seed a patch for `src/config.ts` or document that the focus line snaps to 1; the seeded brief on #482 means "Generate" is only exercised via Refresh. S8 deps also include S5.
- A4 [major, S3] In `generate`: `getPull(ws, prId)` (404/scoping) FIRST, then the in-flight join keyed by prId.
- A5 `PrBrief.risks` is `Risks = { risks: Risk[] }`; `groundDraft` returns `Risk[]` — wrap on assembly; client reads `brief.risks.risks`.
- A6 D1 filter: reviews filter linked skills by `l.enabled` only (run-executor ~L201). Use exactly the same filter as `run-executor` ("same effective set reviews receive"); do not add `l.skill.enabled` unless run-executor does.
- A7 `classifyLlmError` returns `OnboardingLlmReason` (`contracts/knowledge.ts`); in `_shared/llm-errors.ts` alias that type (no new enum), or skip the move and just use `instanceof ConfigError` + the schema regex in brief. Prefer the least change.
- A8 AC-20: `ReviewRecord.verdict` is nullable; `VerdictBanner` needs non-null verdict + findingsCount + blockers. Use the newest review with `verdict != null` and compute counts from it (or 0); none → plain summary.
- A9 `getIntent` returns `PrIntentRecord` (extra keys pr_id/provider/…). Pick only `Intent` fields (via `Intent.parse`/pick) before storing.
- A10 Caps (MAX 8) apply AFTER grounding/filtering. Tests: "10 valid → first 8".
- A11 AC-33: client disables on `pr.files.length === 0` (matches server's `pr_files`), not `files_count`. GET 404 merges `no_brief` and PR `not_found`; client maps both to null.
- A12 Layout follows the user's screenshots: PR Brief card on top (banner + summary), Intent and Blast radius side by side below (the mockup puts Risk areas in the Intent card; a simple list inside the PR Brief card is accepted by the assignment). Page container is capped ~1080px, so the two-column grid depends on container width.
- A13 Store anchors as `[start,end]` ranges and snap against ranges (no giant number arrays). Schema re-prompts exceed 8k on attempts 2–3; the budget applies to the first send (AC-24/NFR-1).
