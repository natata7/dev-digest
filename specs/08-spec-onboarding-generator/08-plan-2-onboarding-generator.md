# 08-plan-2-onboarding-generator.md

Delta Implementation Plan for **revision 2** of [08-spec-onboarding-generator.md](08-spec-onboarding-generator.md) (ACs tagged [R2-new]/[R2-changed]). Inputs: [round-2 answers](08-questions-2-onboarding-generator.md), [design analysis](08-design-analysis-onboarding-generator.md), mockups `08-mockup-onboarding-{full,top,run-reading}.png`. Base: revision 1 is implemented and committed (`53151a6`, `79e48f2`, tests `28df435`, plan [08-plan-onboarding-generator.md](08-plan-onboarding-generator.md) with decisions D0–D17, which stay in force unless a D18+ entry below overrides them).

Approved: 2026-10-03

Status: draft. Nothing executed. Execution mode: **multi-agent** (recommended, D18, pending user confirmation).

---

## Ціль і межі

Change only what revision 2 needs:
- **Contract**: two optional fields on `Onboarding`: `run_steps[]` and `first_tasks[]`.
- **Server** (onboarding module only): package-manager detection, skeleton `run_steps`/`first_tasks`, LLM output + validation of both, reworded skeleton bodies, prompt, and log counts.
- **Client**: nav position and icon, plus a re-layout of the tour page per the mockups: fixed headings, TOC, collapsible cards with icons, run-step rows with Copy, critical-path rows with Open, first-task cards, header/subtitle/breadcrumb/Share link, and in-card notes.

Not touched: `repo-intel`, the DB (no migration, the tour lives in `onboarding.json` jsonb), `reviewer-core`, `mcp`, `e2e`, and the routes and hooks (`client/src/lib/hooks/onboarding.ts` is unchanged).

## Огляд вимог

**Ясно:** all [R2] ACs are testable. No `[NEEDS CLARIFICATION]`. Two derived details are open to veto in the spec itself: the `<pm>` lockfile precedence and the 8/5/200/120 caps. They are adopted as written.

**Звірено з кодом (what the delta builds on):**
- The `Onboarding` contract (`server/src/vendor/shared/contracts/knowledge.ts:28-123`) is byte-identical in the client mirror for the whole Onboarding block. The two files only diverge further down (Provider/CiFailOn comments, `AgentVersion*`). Apply a hunk; never copy the file.
- Strict structured output: `OpenAIProvider` sends `json_schema` with `strict: true` via `zodResponseFormat` (`reviewer-core/src/llm/structured.ts`). Optional properties are not allowed, so the new LLM-output keys must be **required + nullable** (D20). `MockLLMProvider` validates fixtures against the schema, so the existing `goodOut` (SS) and `OUT` (SI) fixtures without the new keys will **fail** until the test-writer updates them (R2-T1).
- `buildSkeleton` (`onboarding/helpers.ts:160`) returns `OnboardingSection[]` only. The skeleton `local_run` body lists all scripts. The `reading_order` body prints `score 0.xxxx`, which conflicts with AC-53. The `first_tasks` body hardcodes `npm run` (AC-8/26 now need `<pm>`). `mergeLlmOutput` returns `{sections, reading_path}`. The service builds `skeletonTour`/`result` objects (`service.ts:95-145`) and logs NFR-5 counts (`service.ts:151`).
- Existing quirk, kept: `status = partial` when any **section** fell back to facts (`service.ts:131`). D24 keeps the run-steps/tasks fallback out of that rule.
- `facts.ts` `walkClone` already collects `rootFiles`, so lockfile presence is free.
- Client: `OnboardingTourView.tsx` (223 lines) renders `sec.title` (LLM text). Coverage notes are stacked above sections, the reading list shows a score, links are bare `<code>` chips, the header is `"Onboarding tour · full_name"` with a static subtitle, and the crumb is `[{label:"Onboarding tour"}]`.
- Reusable today:
  - `repoBlobUrl(provider, fullName, sha, file)` in `client/src/lib/repo-urls.ts`
  - `repoDisplayName` (lives in Conventions' colocated `helpers.ts`, so it must be promoted, D22)
  - `IconBtn`, `Button`, `Badge`, `Markdown`, `MermaidDiagram`, `formatRunCost`/`formatTokens`
  - next-intl `useFormatter().relativeTime` for "2 hours ago" (installed dependency, no new helper)
  - crumb pattern `[{ label: full_name, mono: true }, { label }]` from `pulls/page.tsx`
  - `Repo.provider` is a required enum `github|gitlab`, so "unknown provider" in practice means "repo row not loaded" (D25)
- Icon set (`client/src/vendor/ui/icons.tsx`) has `Workflow`, `Activity`, `Command`, `FileText`, `Target`, `File`, `Copy`, `Check`, `Link`, `ExternalLink`, `ChevronDown`. There is no `Network`, so `Workflow` is the graph-style glyph and also matches the mockup's architecture/nav icon.
- No responsive or CSS-module precedent exists in `client/src` (all inline `styles.ts`). The ≥ 1280 px viewport rule (AC-50) and the 900 px content-width wrap (AC-46) cannot be written as inline styles, see D21. Vitest runs with `css: false`, so jsdom cannot assert them: browser check.
- `IntersectionObserver` and `Element.scrollIntoView` do not exist in jsdom. The component must guard both, and tests stub them.
- `client/src/components/app-shell/helpers.test.ts` asserts only key/label/href. Order and icon assertions are new (R2-T2).

**Неоднозначно (вирішено як D-рішення нижче):** strict-schema shape of the new LLM keys (D20); responsive mechanism (D21); `repoDisplayName` reuse (D22); body vs structured rows in each card (D23); status effect of run-step/task fallback (D24); Open availability (D25); detecting an "unavailable" section on the client (D26); contract caps (D27); Share link/Regenerate visibility in the empty state (D28); nested-manifest scripts in the skeleton (D29); copy-confirmation lifetime (D30).

**Чого бракує у спеці (не блокує):** none beyond the decisions above. Note: the mockup's `pnpm install` / `cp .env.example …` steps are **not** fact scripts, so AC-41 drops them by design. A real tour shows fewer, verified steps than the mockup sample.

## Питання до користувача та відповіді (Decisions D18+)

`AskUserQuestion` is not available in this session. Each decision records the recommended answer as adopted, **pending user veto**. A veto reopens the named tasks.

| ID | Question | Adopted answer (recommended) | Affects |
|---|---|---|---|
| D18 | Execution mode | **Multi-agent.** Two packages with one contract seam. After R2-S1, the server lane (S2→S3) and the client lane (S4 ‖ S5) are independent. Tests must come from a separate `test-writer` (implementers don't write tests), and the 28df435 tests need rewriting from the spec. | all |
| D19 | Nav icon + position (vendored edit) | Move the existing `onboarding-tour` item in `client/src/vendor/ui/nav.ts` to sit **between `pulls` and `context`**, `icon: "Workflow"`. No other change (no `gKey`, label unchanged). There is no upstream `@devdigest/ui`, so this file is the source of truth (precedent D1, `aa82fbb`). Needs explicit user OK at the `/implement` gate. | R2-S4, AC-1 |
| D20 | LLM-output shape for the new keys under strict `json_schema` | Server-only `OnboardingLlmOutput` gains **required, nullable** keys: `run_steps: z.array(z.object({ command: z.string(), note: z.string().nullable() })).nullable()` and `first_tasks: z.array(z.object({ title: z.string(), path: z.string() })).nullable()`. `null`, `[]`, or empty-after-validation all fall back to the skeleton (AC-20). A key truly absent (non-strict provider) fails the parse and yields `llm_invalid_output`/`llm_failed`. Accepted: strict mode makes it unreachable on OpenAI. `.optional()` was rejected because OpenAI strict mode does not support it. | R2-S2, R2-T1, AC-20, AC-40 |
| D21 | How to do the 1280 px viewport rule and the 900 px content wrap | **One colocated CSS module** `OnboardingTourView.module.css` with two rules: `@media (max-width: 1279px) { .toc { display: none } }` and a container query on the first-tasks grid (`container-type: inline-size`; 3 columns, 1 column `@container (max-width: 899px)`). The platform does it, with no JS resize listeners. All other styles stay in `styles.ts`. Alternative: a `matchMedia` + `ResizeObserver` hook, which is more code and only matters for jsdom. | R2-S5, AC-46, AC-50 |
| D22 | Header short repo name | **Promote** `repoDisplayName` from `conventions/_components/ConventionsView/helpers.ts` to `client/src/lib/repo-urls.ts`, leaving a re-export in the Conventions helpers so its imports/tests are unchanged. This is the second consumer (ui-architecture: promote on second consumer, no cross-feature import). | R2-S5, AC-49 |
| D23 | Body vs structured rows per card | Uniform rule: **structured rows/list first, then the Markdown body, then the diagram.** architecture = body + diagram; critical_paths = link rows + body + diagram (AC-44); local_run = run-step rows + body (AC-43); reading_order = reading-path list (AC-53) + body; first_tasks = task cards (AC-46) + body. To avoid duplication, the **skeleton** bodies for local_run / reading_order / first_tasks become short intro lines when their structured data is non-empty (no script list, no numbered paths with scores, no task list). The prompt asks the LLM for a 1–3 sentence intro body in those three sections that does not repeat the commands, paths or tasks. Tours from revision 1 (no `run_steps`/`first_tasks`) keep their old bodies (AC-52). | R2-S2, R2-S3, R2-S5 |
| D24 | Does a run-step / first-task fallback make the tour `partial`? | **No.** The existing "any section `source: facts` ⇒ partial" rule stays limited to `sections`. Run-step fallback is visible per step via `source: 'facts'`. | R2-S3 |
| D25 | When is Open shown (AC-45) | Shown when the repo row from `useRepos()` is loaded **and** has `full_name` **and** `tour.indexed_sha` is non-null. Then `href = repoBlobUrl(repo.provider, repo.full_name, tour.indexed_sha, path)`, `target="_blank" rel="noopener noreferrer"`. `provider` is a required enum in `Repo`, so E24 "local-only" reduces to "repo not loaded / SHA null". | R2-S5 |
| D26 | Client detection of an "unavailable" section (AC-55) | `section.source === 'facts'` and body starts with the server's fixed prefix `Unavailable — index` (client constant `UNAVAILABLE_PREFIX`, kept equal to the skeleton text in `helpers.ts`). Rows cannot appear anyway (links/reading path are empty in that case). `ponytail:` string coupling; add a contract flag if the copy ever changes. | R2-S5 |
| D27 | Caps in the shared contract? | **No `.max()` in the contract.** The server enforces 8/5 (and 200/120 chars). This keeps stored rows valid if caps change. The contract just mirrors the spec table's shapes. | R2-S1 |
| D28 | Header actions in the empty state | Share link is **always** shown (copies the page URL). Regenerate is shown only when a tour exists (as built; the empty state keeps its Generate CTA, AC-3/AC-19 mockup C19). Subtitle only when a tour exists. | R2-S5 |
| D29 | Skeleton local_run body when scripts exist only in nested manifests | Follow AC-26 literally: `run_steps` = **root-manifest** scripts only (≤ 8, `<pm> run <name>`). The body = env names + README reference, plus "No root scripts detected. Detected manifests: …" when there are no root scripts. Nested scripts still reach the LLM via facts. Alternative (veto): also list nested scripts in the body. | R2-S2 |
| D30 | "Copied" confirmation | One page-level `role="status"` live region that reads "Copied" for 2 s (`COPIED_MS = 2000`) after a successful Copy or Share-link write. On failure, the manual-copy fallback persists until the next action. | R2-S5 |

## Рекомендації

1. **Additive server helpers, not signature changes.** Add `detectPackageManager`, `buildSkeletonRunSteps`, `buildSkeletonFirstTasks`, `validateRunSteps`, `validateFirstTasks`. `buildSkeleton(f)` keeps its signature (only body texts change), and `mergeLlmOutput` gains fields in its *return* only. Existing call sites and most of the SH tests stay valid.
2. **Reuse:** `repoBlobUrl`, `repoDisplayName` (promoted), `useFormatter().relativeTime` (next-intl) instead of a 4th relative-time helper, `IconBtn`/`Button`, the existing `navigator.clipboard?.writeText` pattern (plus a failure branch), the `MermaidDiagram`/`Markdown` primitives, `formatRunCost`. No new dependencies.
3. **Remount instead of reset logic:** render the cards under `key={tour.generated_at}`, so collapse state resets after every load or regeneration (AC-51 "not persisted") without an effect.
4. **Split the 223-line view by responsibility** into colocated sub-components (header, TOC, section card, per-kind content). This is also what makes the delta reviewable.
5. **Risk:** the server hermetic suite goes red between R2-S2 and R2-T1 (fixtures lack the new required-nullable keys). Run checkpoints accordingly and schedule R2-T1 right after R2-S3.
6. **Order:** contract alone → server lane ‖ client lane → test-writers → architecture review → docs/validation.

## Зачеплені модулі

| Package | Area | Change |
|---|---|---|
| `server` | `src/vendor/shared/contracts/knowledge.ts` | +`OnboardingRunStep`, `OnboardingFirstTask`, 2 optional fields on `Onboarding` |
| `server` | `src/modules/onboarding/{constants,helpers,facts}.ts` | pm detection, skeleton steps/tasks, validation, body texts, serialization adds pm |
| `server` | `src/modules/onboarding/service.ts`, `src/prompts/onboarding.system.md` | wire new fields, NFR-5 counts, prompt |
| `client` | `src/vendor/shared/contracts/knowledge.ts` | same hunk (sanctioned mirror edit) |
| `client` | `src/vendor/ui/nav.ts` | move item + icon (sanctioned vendored edit, D19) |
| `client` | `src/lib/repo-urls.ts`, `src/app/repos/[repoId]/conventions/_components/ConventionsView/helpers.ts` | promote `repoDisplayName` (re-export left behind) |
| `client` | `src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/**`, `client/messages/en/onboarding.json` | page re-layout |

## Архітектурні обмеження

- **server → `onion-architecture`:** pure rules (pm detection, steps/tasks build + validate, merge) stay in `helpers.ts` with no fs/DB/LLM imports. `facts.ts` only adds `packageManager` from the already-walked `rootFiles`. The service only wires and logs. The LLM output schema stays server-only in `constants.ts` (not in `@devdigest/shared`).
- **client → `ui-architecture`:** `page.tsx` stays thin. All new UI is colocated under `OnboardingTourView/_components/*`. Pure derivations (`sectionHeadingKey`, `isUnavailable`, `openHref`, `subtitleKind`, coverage-per-kind mapping) go in `OnboardingTourView/helpers.ts`. A colocated `useCopy` hook lives in `OnboardingTourView/useCopy.ts` (UI behaviour, not data). Data stays in the existing `src/lib/hooks/onboarding.ts` (unchanged). No cross-feature import (D22 promotes instead).
- **Do-not-touch:**
  - no edits to `server/src/db/migrations/**` (none needed) or lock files (no deps)
  - `client/src/vendor/**` only for the two sanctioned hunks (contract mirror in R2-S1, `nav.ts` in R2-S4)
  - `server/src/vendor/shared` only in R2-S1, first and alone
- **Optional DTO fields** (D27/AC-52): nothing becomes required in `Onboarding`, so existing fixtures that parse `Onboarding` in both packages stay valid (`server/test/contracts.test.ts`, CV `tour()` factory). The **server-only** LLM output schema does gain required(-nullable) keys, so every `MockLLMProvider` onboarding fixture must be updated by R2-T1 (SS `goodOut`, SI `OUT`; grep `structured:` in `server/test/onboarding*`).
- **a11y (NFR-6):** each card heading is an `h2` that contains the toggle `<button aria-expanded aria-controls>`. The `h2` stays in the DOM when collapsed. TOC entries are `<a href="#onb-<kind>">` or buttons. Copy/Open/Share are real `<button>`/`<a>` elements with accessible names ("Copy command", "Open <path>").

## Контекст з INSIGHTS.md (digest for executors)

1. Strict `json_schema` (OpenAI) rejects `.optional()`. Use required + `.nullable()` (server `contracts/brief.ts` comment; D20).
2. `MockLLMProvider.completeStructured` safe-parses fixtures and throws on mismatch. A fixture missing a new required key fails every LLM-path test (server 2026-09-21).
3. A mock schema failure classifies as `llm_failed`, not `llm_invalid_output`. To test the invalid path, stub the real adapter message (server 2026-10-03).
4. Extract try/catch into named functions so failure paths are hermetically testable (server 2026-09-21). Already done for `callLlm`, keep it.
5. Never write a glob like `a/*/b` in a `/** */` comment (server 2026-09-19/22).
6. `client/src/vendor/shared` is a PARTIAL mirror: apply the Onboarding hunk only, never copy the file (client 2026-09-14).
7. Fetch-level stubbing is the house pattern for component tests. Re-verify stubbed suites against behaviour changes, not just re-run them (client 2026-09-26). This applies to the CV rewrite.
8. Adding exports to a `vi.mock`-ed hooks module breaks other suites' factories. This delta adds **no** hooks (client 2026-09-26).
9. One shared cost formatter (`formatRunCost`/`formatTokens`) for the footer (client 2026-09-14).
10. `borderColor`/`borderWidth` shorthands mixed with `borderLeft*` warn in React (client 2026-09-14). Relevant for the TOC active accent bar: use `borderLeft: "2px solid …"` only.
11. `useRepoIntelStatus`/`useResyncRepoIntel` stay the Resync path (client 2026-09-26).
12. Check git history before implementing something "missing" (both 2026-09-14). The copy pattern exists in `RunTraceDrawer`/`LiveLogStream`.

## Скіли по кроках

| Task | Paths | Skills |
|---|---|---|
| R2-S1 | shared contract (server + client mirror) | `zod`, `onion-architecture` |
| R2-S2 | `server/src/modules/onboarding/{constants,helpers,facts}.ts` | `onion-architecture`, `zod`, `security`, `typescript-expert` |
| R2-S3 | `server/src/modules/onboarding/service.ts`, `server/src/prompts/onboarding.system.md` | `onion-architecture`, `security` |
| R2-S4 | `client/src/vendor/ui/nav.ts` | `ui-architecture` |
| R2-S5 | `client/src/app/repos/[repoId]/onboarding/**`, `client/messages/en/onboarding.json`, `client/src/lib/repo-urls.ts`, Conventions `helpers.ts` (re-export) | `ui-architecture`, `react-best-practices`, `next-best-practices`, `frontend-architecture` |
| R2-T1 | server onboarding tests | `onion-architecture` (testing-strategy), `security` |
| R2-T2 | client onboarding + app-shell tests | `react-testing-library`, `ui-architecture` |
| R2-S6 | READMEs/INSIGHTS/validation | `engineering-insights` |

## Міжкрокові зв'язки (сигнатура + де підключається) і правки vendored-файлів

**R2-S1 → R2-S2/S3/S5: contract** (`@devdigest/shared`, `contracts/knowledge.ts`, exported by the existing `export *`):

```ts
export const OnboardingRunStep = z.object({
  command: z.string(),
  note: z.string().nullable(),
  source: OnboardingSectionSource,
});
export type OnboardingRunStep = z.infer<typeof OnboardingRunStep>;
export const OnboardingFirstTask = z.object({ title: z.string(), path: z.string() });
export type OnboardingFirstTask = z.infer<typeof OnboardingFirstTask>;
// Onboarding gains (optional, AC-52 / E27, no .max per D27):
//   run_steps: z.array(OnboardingRunStep).optional(),
//   first_tasks: z.array(OnboardingFirstTask).optional(),
```

**R2-S2 → R2-S3: onboarding internals** (same lane, serial):

```ts
// constants.ts
export const RUN_STEPS_MAX = 8, FIRST_TASKS_MAX = 5, NOTE_MAX = 200, TASK_TITLE_MAX = 120;
export const UNAVAILABLE_PREFIX = 'Unavailable — index'; // client mirrors it (D26)
OnboardingLlmOutput += {
  run_steps: z.array(z.object({ command: z.string(), note: z.string().nullable() })).nullable(),
  first_tasks: z.array(z.object({ title: z.string(), path: z.string() })).nullable(),
} // D20
// helpers.ts
export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';
export function detectPackageManager(rootFiles: string[]): PackageManager // AC-8 precedence, E29
CloneFacts += { packageManager: PackageManager }                          // set by facts.ts
export function buildSkeletonRunSteps(f: Facts): OnboardingRunStep[]      // AC-26
export function buildSkeletonFirstTasks(f: Facts): OnboardingFirstTask[]  // AC-26, filtered by allowedPaths
export function validateRunSteps(f: Facts, steps: OnboardingLlmOutput['run_steps']): { kept: OnboardingRunStep[]; dropped: number } // AC-41
export function validateFirstTasks(f: Facts, tasks: OnboardingLlmOutput['first_tasks']): { kept: OnboardingFirstTask[]; dropped: number } // AC-42
mergeLlmOutput(facts, skeleton, out): {
  sections; reading_path;
  run_steps: OnboardingRunStep[]; first_tasks: OnboardingFirstTask[];       // skeleton fallback inside (AC-20)
  dropped: { run_steps: number; first_tasks: number };                      // NFR-5
}
```

**R2-S3 → R2-S5: HTTP**. Routes are unchanged (`GET`/`POST /repos/:id/onboarding`). The response now always carries `run_steps` and `first_tasks` for tours generated after R2. Tours stored earlier may omit them, and the client must handle `undefined` (AC-52).

**R2-S2/S3 and R2-S5: shared constant by value.** `UNAVAILABLE_PREFIX` ("Unavailable — index") exists as a server constant used by `buildSkeleton` and as a client constant in `OnboardingTourView/constants.ts`. The client doesn't import server code; R2-T1 and R2-T2 each assert their own copy.

**Vendored / do-not-touch edits (list for the `/implement` gate):**
1. `server/src/vendor/shared/contracts/knowledge.ts`: source of truth. Onboarding block only, R2-S1.
2. `client/src/vendor/shared/contracts/knowledge.ts`: the **same hunk** applied by hand in R2-S1 (Onboarding block is identical today; the rest of the file diverges, so don't copy).
3. `client/src/vendor/ui/nav.ts`: R2-S4. Move the `onboarding-tour` entry between `pulls` and `context`, `icon: "Lightbulb"` → `icon: "Workflow"` (D19). One hunk.

No migrations, no lock-file changes, no `icons.tsx` edit (`Workflow` already registered).

**Mockups per UI task** (all in `specs/08-spec-onboarding-generator/`):

| Mockup | What it defines (for R2-S4 / R2-S5 / R2-T2) | Not to copy |
|---|---|---|
| `08-mockup-onboarding-full.png` (authoritative) | Two-column layout (TOC left ~250 px, content right). Five expanded cards in order, each with tinted icon, heading and chevron. First-task cards 3-up. Sidebar order Pull Requests → **Onboarding Tour** → Project Context with graph icon | Sample data (payments-api, 12,450 files), complexity badges, coloured diagram nodes, clickable inline path chips |
| `08-mockup-onboarding-top.png` | Breadcrumb `acme/payments-api › Onboarding Tour`. Header "Onboarding for **<short name>**" (accent mono), subtitle line, Regenerate + **Share link** (link icon) right. TOC "ON THIS PAGE" with left accent bar on the active item. Card icons (architecture = `Workflow`-like, critical paths = `Activity`, run = `Command`). Critical-path rows: file icon + mono path + "— label" + Open button | "last refreshed" wording (AC-49 uses "generated …") |
| `08-mockup-onboarding-run-reading.png` | Run-step rows: index number, mono command, copy icon right. Guided reading path: numbered mono path with muted one-line why below, **no score** | `# comments` inline in commands (our `note` is separate muted text, never copied) |

Not drawn in any mockup but placed by the spec: page banners under the header (AC-29), in-card "showing X of Y" (AC-16) and ranking note (AC-14), Outdated badge left of Regenerate (AC-7), footer under the last card (AC-37). Icons for reading path and first tasks are not legible in the mockups, so `FileText` and `Target` are adopted (cosmetic, veto-able).

## Кроки реалізації

Dependency graph:

```
R2-S1 (contract, alone)
   ├─> R2-S2 (server pure) ─> R2-S3 (service + prompt) ─> R2-T1 (server tests)
   └─> R2-S5 (client page) ──────────────┐
R2-S4 (nav, vendored) ───────────────────┴─> R2-T2 (client tests)
R2-T1 + R2-T2 ─> architecture review ─> R2-S6 (docs, validation, verify)
```

- [x] **R2-S1 — Contract: `run_steps`, `first_tasks` (optional)** · `server` (+ client mirror) · deps: none · **runs first, alone** · executor `implementer`
  - AC/E: contract basis for AC-20, AC-26, AC-36, AC-40–AC-43, AC-46, AC-47, AC-52; E27
  - Files owned: `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts` (same hunk)
  - Work: add the schemas and fields exactly as in «Міжкрокові зв'язки». No test edits: fields are optional, so existing fixtures stay valid. The new contract cases belong to R2-T1.
  - Checkpoint: server + client `pnpm typecheck`.
  - Skills: `zod`, `onion-architecture`

- [x] **R2-S2 — Server pure layer: pm, skeleton steps/tasks, validation, merge, bodies** · `server` · deps: R2-S1 · executor `implementer`
  - AC/E: AC-8 (lockfile → pm), AC-15, AC-20, AC-26, AC-38, AC-40 (output schema), AC-41, AC-42, AC-53 (skeleton body has no score); E9, E22, E23, E29
  - Files owned: `server/src/modules/onboarding/constants.ts`, `server/src/modules/onboarding/helpers.ts`, `server/src/modules/onboarding/facts.ts`
  - Work:
    - `detectPackageManager(rootFiles)`: `pnpm-lock.yaml` → `pnpm`, else `yarn.lock` → `yarn`, else `bun.lockb`|`bun.lock` → `bun`, else `npm`. `collectCloneFacts` sets `packageManager` from `w.rootFiles`.
    - `buildSkeletonRunSteps`: root-manifest scripts (`manifest === 'package.json'`) from the collected `scripts` in AC-9 order, first 8, `{ command: \`${pm} run ${name}\`, note: null, source: 'facts' }`.
    - `buildSkeletonFirstTasks` (fixed English titles):
      - "Run the test script" → `package.json`, if a root `test` script exists
      - "Read the first reading-path file" → `readingPath[0].path`
      - "Trace the first route" → `routes[0].file`
      - Each item only when its fact exists, then filtered by `allowedPaths`.
    - `buildSkeleton` body changes (D23/D29):
      - local_run = env names + README reference, or the "No root scripts detected. Detected manifests: …" line when there are no root scripts. No scripts list.
      - reading_order = `"Read these files in this order."` when the path is non-empty, else the unchanged `Unavailable — index <status>.`
      - first_tasks = a short intro line when tasks exist, else the existing "No concrete tasks…" line. The `npm run` hardcode is removed.
      - `Unavailable — index` text comes from `UNAVAILABLE_PREFIX`. Titles stay (contract keeps `title`, AC-39 ignores it in UI).
    - `validateRunSteps`: trim `command`. Keep it iff it equals any collected script `command`, or equals `${pm} run ${name}` for a collected root-manifest script name. Note: collapse newlines, trim, cap 200, empty → null. `source: 'llm'`. Keep ≤ 8 in LLM order. `dropped` = input length − kept.
    - `validateFirstTasks`: path normalised like `filterLinks` (strip leading `./`), kept iff in `allowedPaths` (structure dirs included; also accept a trailing `/` variant of a structure entry, e.g. `specs/`). Title trimmed, newlines collapsed, cap 120, empty → drop. Keep ≤ 5.
    - `mergeLlmOutput`: add `run_steps`/`first_tasks`. `null`, or empty after validation → skeleton builders (AC-20). Return `dropped` counts.
    - `serializeFactsForPrompt`: add `package_manager: <pm>` as the first line of the `stack` block. The pm is repo-derived, so it stays inside `wrapUntrusted`.
  - Checkpoint: `pnpm typecheck`. **Expected red** in the hermetic SS/SI LLM-path tests until R2-T1 updates fixtures (D20). Don't "fix" the tests here.
  - Skills: `onion-architecture`, `zod`, `security`, `typescript-expert`

- [x] **R2-S3 — Service wiring, prompt, log** · `server` · deps: R2-S2 · executor `implementer`
  - AC/E: AC-15, AC-18 (still one call), AC-20, AC-22, AC-26, AC-28 (unchanged prev tour may lack fields), AC-40, NFR-3, NFR-5
  - Files owned: `server/src/modules/onboarding/service.ts`, `server/src/prompts/onboarding.system.md`
  - Work:
    - `skeletonTour` adds `run_steps: buildSkeletonRunSteps(facts)` and `first_tasks: buildSkeletonFirstTasks(facts)`.
    - The LLM success result takes both from `mergeLlmOutput`. Status rule unchanged (D24). AC-28 path returns `prev` byte-unchanged.
    - NFR-5 log adds `runSteps: { kept, dropped }`, `firstTasks: { kept, dropped }` (0 dropped on the skeleton path).
    - Prompt adds:
      - `run_steps`: ordered, ≤ 8. Each `command` must be EXACTLY a script command from the facts or `<package_manager> run <root script name>`. `note` is a short plain-text explanation or null, no shell syntax. Return `null` if none.
      - `first_tasks`: ≤ 5 `{title ≤ 120 chars, path}`, where `path` is a file or structure directory from the facts.
      - For `local_run`, `reading_order` and `first_tasks`, the body is a 1–3 sentence intro that does not repeat commands, paths or tasks (D23).
      - SECURITY paragraph kept.
    - Still exactly one `completeStructured` call (AC-40).
  - Skills: `onion-architecture`, `security`

- [x] **R2-S4 — Sidebar position + icon** · `client` · deps: none (parallel with anything after the gate OK) · executor `implementer` · **sanctioned vendored edit (D19)**
  - AC/E: AC-1 (AC-24 unchanged, `activeKeyFor` untouched)
  - Files owned: `client/src/vendor/ui/nav.ts` (one hunk)
  - Mockups: `08-mockup-onboarding-full.png`, `08-mockup-onboarding-top.png` (sidebar: order + graph icon + active state)
  - Skills: `ui-architecture`

- [x] **R2-S5 — Tour page re-layout per mockups** · `client` · deps: R2-S1 (mirror types). Codes against the unchanged HTTP API, so it runs in parallel with R2-S2/S3 · executor `implementer`
  - AC/E: AC-3, AC-7, AC-14, AC-16, AC-29, AC-36, AC-37, AC-39, AC-43–AC-55, NFR-6; E24–E28
  - Files owned:
    - `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/**`:
      - existing `OnboardingTourView.tsx`, `styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`
      - new `OnboardingTourView.module.css` (D21), new `useCopy.ts`
      - new `_components/{TourHeader,TourToc,SectionCard,SectionContent}/` each with `<Name>.tsx` + `index.ts` (+ `styles.ts` if needed)
      - **excluding** `*.test.ts(x)`
    - `client/messages/en/onboarding.json`
    - `client/src/lib/repo-urls.ts` (add `repoDisplayName`)
    - `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/helpers.ts` (replace the body with a re-export only, D22)
  - Mockups: all three (see table above). The full mockup defines layout, order and first-task grid. The top mockup defines header, breadcrumb, TOC, card chrome and critical-path rows. The run-reading mockup defines run-step rows and the reading list.
  - Work:
    - **Copy (AC-39, AC-3):** `sectionNames` → `headings` with the five fixed strings ("Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"), used by cards, TOC and empty state. `sec.title` is never rendered.
    - **Header (AC-49, AC-7, AC-48, D28):**
      - Title `"Onboarding for "` + short name (accent mono).
      - Subtitle via `t.rich`/ICU: `"Generated from index of {files, number} files · generated {when}"`, or `"Generated without an index · generated {when}"` when `coverage.files_indexed === 0 || coverage.index_status === 'none'`. `when = useFormatter().relativeTime(new Date(generated_at))`.
      - Right side, in order: Outdated `Badge` → Regenerate → Share link (`icon: "Link"`).
      - Crumb `[{ label: full_name ?? repoId, mono: true }, { label: "Onboarding Tour" }]`.
    - **Banners (AC-29):** not-cloned, generating, load error, regeneration failed, status+Resync and partial note all render in one stack directly under the header, above the first card (current order kept, coverage notes removed from the stack).
    - **TOC (AC-50, AC-51):**
      - `TourToc` renders only when a tour exists, inside a `.toc` wrapper hidden < 1280 px by the CSS module.
      - Entries are buttons labelled with the five headings. Active entry = the section nearest the top, via one `IntersectionObserver` (guarded `typeof IntersectionObserver !== 'undefined'`). The active item gets `aria-current="true"` and the left accent bar.
      - Click → expand that card if collapsed, then `document.getElementById('onb-<kind>')?.scrollIntoView?.()` after the state update (`requestAnimationFrame` or effect).
    - **SectionCard (AC-51, NFR-6):**
      - `<section id="onb-<kind>" aria-labelledby>` containing an `<h2>` with icon (`Workflow` / `Activity` / `Command` / `FileText` / `Target`) and a toggle `<button aria-expanded aria-controls>` with a chevron.
      - Content is hidden when collapsed; the `h2` stays. State is `useState` per card.
      - Wrapper keyed by `tour.generated_at` to reset collapse state (Recommendation 3).
    - **SectionContent per kind (D23):**
      - **architecture:** body + diagram; in-card notes "showing X of Y" for `routes` and `structure` (AC-16).
      - **critical_paths:**
        - Rows from `sec.links`: `File` icon, mono path, then " — label" unless `label === path` (AC-44).
        - Open `<a>` per D25 (AC-45).
        - Then body + diagram; in-card note for `critical_paths` (AC-16).
      - **local_run:**
        - If `run_steps?.length`: numbered rows with mono `command` + muted plain-text `note` (React text node, never Markdown) + Copy `IconBtn` (AC-43, AC-36).
        - Then body; in-card note for `scripts`.
        - If absent or empty: body only (AC-52).
      - **reading_order:**
        - Numbered list of mono `path` with the muted `why` beneath when present. No score (AC-53, `readingScore` key deleted).
        - Ranking note when `ranking_basis === 'pagerank'` and the path is non-empty (AC-14).
        - In-card note for `reading_path`, then body.
      - **first_tasks:**
        - If `first_tasks?.length`: grid of cards (title + mono path), no complexity indicator. Grid is a container query: 3 columns, or 1 column when the content is < 900 px (AC-46, D21).
        - Then body. If absent or empty: body only (AC-52).
      - **Unavailable (AC-55, D26):** muted body text, no rows or controls.
    - **Truncation (AC-54):** paths, commands, labels and task titles use `overflow:hidden; textOverflow:ellipsis; whiteSpace:nowrap; minWidth:0` plus `title={fullText}`. Buttons sit in a `flexShrink:0` slot.
    - **`useCopy` (AC-47, AC-48, D30):**
      - `copy(text, onFail)` = `navigator.clipboard?.writeText` inside try/catch, with missing API treated as failure. Success → live region "Copied" for `COPIED_MS`.
      - Run-step failure → select the command node's text (`Range` + `getSelection`) and show "Press Ctrl+C / Cmd+C to copy".
      - Share-link failure → render a read-only `<input>` with `window.location.href`, focused + `select()`ed.
      - The copied text is exactly `step.command` or `location.href`.
    - **Footer (AC-37):** unchanged content, stays directly under the last card.
    - **Layout:** page `maxWidth` grows to fit TOC + content (two-column flex at ≥ 1280 px via the CSS module; single column below).
  - Checkpoint: client `pnpm typecheck`, `pnpm lint`. CV is **expected red** until R2-T2 (headings and layout changed).
  - Skills: `ui-architecture`, `react-best-practices`, `next-best-practices`, `frontend-architecture`

- [ ] **R2-T1 — Server tests (rewrite/extend 28df435 from spec)** · `server` · executor `test-writer` · deps: R2-S3
  - AC/E: AC-8, AC-15, AC-20, AC-26, AC-40, AC-41, AC-42, AC-52 (contract), NFR-5; E9, E22, E23, E27, E29
  - Files owned: `server/test/onboarding-helpers.test.ts`, `server/test/onboarding-service.test.ts`, `server/test/onboarding-facts.test.ts`, `server/test/onboarding.it.test.ts`, `server/test/contracts.test.ts`
  - Must update: SS `goodOut` and SI `OUT` fixtures gain `run_steps`/`first_tasks` (D20). SH `buildSkeleton` cases "local run has scripts verbatim…" and "first tasks: … npm run test" are rewritten to AC-26 R2 (run_steps / first_tasks items, `<pm> run`, body without script list, no score in the reading body).
  - Skills: `onion-architecture`, `security`

- [ ] **R2-T2 — Client tests (rewrite/extend 28df435 from spec)** · `client` · executor `test-writer` · deps: R2-S4, R2-S5
  - AC/E: AC-1, AC-2, AC-3, AC-7, AC-14, AC-16, AC-29, AC-31, AC-36, AC-37, AC-39, AC-43–AC-55, NFR-6; E24–E28
  - Files owned: `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/OnboardingTourView.test.tsx`, `.../OnboardingTourView/helpers.test.ts`, `client/src/components/app-shell/helpers.test.ts`, `client/src/lib/repo-urls.test.ts` (new or existing; for `repoDisplayName`, only if not already covered by Conventions `helpers.test.ts`)
  - Notes:
    - The `AppShell` mock must render `crumb` labels (AC-49 breadcrumb).
    - Stub `IntersectionObserver`, `Element.prototype.scrollIntoView` and `navigator.clipboard` (resolve and reject variants).
    - The `useActiveRepo`/`useRepos` stubs need `provider`.
    - Existing assertions on `TITLES`, "score", bare link chips and stacked notes must be rewritten.
  - Skills: `react-testing-library`, `ui-architecture`

- [ ] **R2-S6 — Docs, INSIGHTS, validation, full verify** · `server` + `client` · executors `doc-writer` → `plan-verifier` · deps: R2-T1, R2-T2, architecture review
  - AC: none new (verification). Records browser checks for AC-1, AC-46, AC-50, AC-51, AC-54 and NFR-6 keyboard.
  - Files owned:
    - `client/INSIGHTS.md` (first CSS-module / container-query use, if kept)
    - `server/INSIGHTS.md` (strict-schema nullable keys, if non-obvious)
    - `specs/08-spec-onboarding-generator/08-validation-onboarding-generator.md` (append an R2 matrix, written by the orchestrator from the verifier report)
  - Skills: `engineering-insights`

## Traceability: AC → task → planned test

Test files: **SF** `server/test/onboarding-facts.test.ts` · **SH** `server/test/onboarding-helpers.test.ts` · **SS** `server/test/onboarding-service.test.ts` · **SI** `server/test/onboarding.it.test.ts` · **SC** `server/test/contracts.test.ts` · **CV** `OnboardingTourView.test.tsx` · **CU** `OnboardingTourView/helpers.test.ts` · **CH** `client/src/components/app-shell/helpers.test.ts` · **M** manual browser check. "upd" = existing 28df435 case rewritten; "new" = added.

| AC / NFR | Edge | Task | Planned test |
|---|---|---|---|
| AC-1 [R2] | — | R2-S4 | CH upd: `onboarding-tour` index is between `pulls` and `context` in WORKSPACE, `icon === "Workflow"` (≠ `Lightbulb`), href unchanged. M: sidebar matches mockup |
| AC-2 (affected) | — | R2-S5 | CV upd: five `h2` in fixed order now carry the **fixed headings**, no POST |
| AC-3 [R2] | E21 | R2-S5 | CV upd: empty state lists the five AC-39 headings + Generate. SS/SI unchanged (old-shape row → `no_tour`) |
| AC-7 [R2] | E16 | R2-S5 | CV upd: "Outdated" badge is the element immediately before Regenerate in the header (DOM order) |
| AC-8 [R2] | E29 | R2-S2 | SH new: `detectPackageManager` table: pnpm+yarn → pnpm; yarn only → yarn; `bun.lock`/`bun.lockb` → bun; none → npm. SF new: `collectCloneFacts.packageManager` from root lockfile; nested lockfile ignored |
| AC-14 [R2] | — | R2-S5 | CV upd: ranking note is inside the "Guided reading path" section (`within(section)`) |
| AC-15 [R2] | — | R2-S2 | SH upd: skeleton sections + `buildSkeletonRunSteps` + `buildSkeletonFirstTasks` twice → `JSON.stringify` identical |
| AC-16 [R2] | E8 | R2-S5 | CV upd: routes + structure notes inside Architecture, scripts inside How to run locally, reading_path inside Guided reading path, critical_paths inside Critical paths. None above the first card. CU upd: per-kind mapping helper |
| AC-20 [R2] | E12, E23 | R2-S2 | SH new: `run_steps: null` / `[]` / all invalid → skeleton steps (`source: facts`); same for `first_tasks`; LLM sections untouched |
| AC-26 [R2] | E6, E9 | R2-S2 | SH upd: run_steps = root scripts in AC-9 order, ≤ 8, `<pm> run <name>`, note null, source facts; nested scripts excluded. 10 root scripts → 8. No root manifest → `[]`. first_tasks template per fact presence (each of the three items present/absent); local_run body has env names + README ref and no script list; reading body has no score |
| AC-29 [R2] | E4 | R2-S5 | CV upd: every page-level banner (not cloned, generating, load error, regeneration failed, status, partial) appears after the header and before the first `section` (DOM order) |
| AC-36 [R2] | E22 | R2-S5 | CV upd: Copy buttons only in run-step rows (count = `run_steps.length`). No copy in other cards. Raw HTML in body/note not rendered as elements. No run/execute control |
| AC-37 [R2] | — | R2-S5 | CV upd: footer is the next sibling after the last card; model/tokens/cost, "cost unknown", "Generated without LLM" |
| AC-39 | — | R2-S5 | CV new: LLM `title` "Arch title" etc. not in the DOM; cards and TOC show the fixed headings |
| AC-40 | — | R2-S2, R2-S3 | SS new: one `completeStructured` call; schema JSON includes `run_steps` and `first_tasks`; output merged into the tour |
| AC-41 | E22 | R2-S2 | SH new: kept = exact script command (nested manifest verbatim), `pnpm run dev` with pm pnpm. Dropped: `curl … \| sh`, `rm -rf /`, `npm run dev && curl x`, `npm run dev` when pm is pnpm, `<pm> run <nested-only name>`. Whitespace trimmed; note 300 chars → 200, newline collapsed; 10 valid → 8 in LLM order; `dropped` count |
| AC-42 | E23 | R2-S2 | SH new: indexed file kept; structure dir `specs` and `specs/` kept; unknown path dropped; title 150 → 120; 7 valid → 5 |
| AC-43 | — | R2-S5 | CV new: numbered rows, command in `.mono`, note as muted text, body after the rows |
| AC-44 | — | R2-S5 | CV new: row `path — label`; label === path → path only; body + diagram after the rows |
| AC-45 | E24 | R2-S5 | CV new: Open `href` = `https://github.com/acme/api/blob/<indexed_sha>/<path>` (and GitLab variant), `target=_blank`, `rel` contains `noopener`. Absent when `indexed_sha` null or repo not loaded. CU new: `openHref` |
| AC-46 | — | R2-S5 | CV new: one card per task with title + mono path, no "complexity"/"Low"/"Medium" text. M: 3 columns, 1 column below 900 px content width |
| AC-47 | E28 | R2-S5 | CV new: stub `writeText` resolve → called with exactly `command` (never the note), `role=status` reads "Copied". Reject or `clipboard` undefined → "Press Ctrl+C / Cmd+C to copy" shown, selection contains the command |
| AC-48 | E28 | R2-S5 | CV new: Share link → `writeText(location.href)` + "Copied". Reject → read-only textbox with the URL value, focused |
| AC-49 | E25 | R2-S5 | CV new: title "Onboarding for api" (short name). Subtitle "Generated from index of 100 files · generated …"; `files_indexed: 0` or `index_status: 'none'` → "Generated without an index · generated …"; crumb labels `acme/api`, "Onboarding Tour". CU new: subtitle-kind helper |
| AC-50 | — | R2-S5 | CV new: TOC nav with the five headings when a tour exists, absent in the empty state. Active item tracked via stubbed IO callback (`aria-current`). M: hidden at 1279 px, shown at 1280 px, scroll-spy |
| AC-51 | — | R2-S5 | CV new: toggles have `aria-expanded="true"` by default; click → `false`, `h2` still present, body gone; TOC click on a collapsed card → expanded + `scrollIntoView` called; regenerate (new `generated_at`) → all expanded again |
| AC-52 | E27 | R2-S1, R2-S5 | SC new: revision-1 tour (no `run_steps`/`first_tasks`) parses; tour with both parses. CV new: such a tour renders the Markdown body in local_run/first_tasks, no Copy buttons, no task cards; `run_steps: []` same |
| AC-53 | — | R2-S5 | CV upd: numbered mono paths, why beneath, no "score"/numeric text |
| AC-54 | E26 | R2-S5 | CV new: long path/command/label/title elements carry `title` = full text; Copy/Open still in the row. M: ellipsis visible, buttons not pushed off |
| AC-55 | E7 | R2-S5 | CV new: skeleton with `Unavailable — index degraded.` in critical_paths/reading_order → muted text, no rows, no Open/Copy. CU new: `isUnavailable` |
| NFR-5 [R2] | — | R2-S3 | SS upd: log line includes `runSteps`/`firstTasks` `{kept, dropped}` (dropped > 0 for the injected-command fixture), still no repo text (command strings absent from the serialized log) |
| NFR-6 [R2] | — | R2-S5 | CV upd: `getAllByRole('heading',{level:2})` = 5 in order also with one collapsed; Share link, toggles, TOC entries, Copy, Open reachable by role (`button`/`link`) with names; "Copied" in `role=status`. M: keyboard pass |
| AC-31 (affected) | E12 | R2-S5 | CV upd: invalid diagram inside the card hidden, body present (re-verify inside the new card) |

Unchanged, not re-tested beyond the existing suite: AC-4–AC-6, AC-9–AC-13, AC-17–AC-19, AC-21–AC-25, AC-27, AC-28, AC-30, AC-32–AC-35, AC-38, NFR-1–NFR-4. These existing tests must stay green. AC-28/30/32/33 CV cases are re-run after the re-layout and only re-anchored if selectors moved.

**Edge cases → task:** E22 S2/S5 · E23 S2 · E24 S5 · E25 S5 · E26 S5 · E27 S1/S5 · E28 S5 · E29 S2.

**Gaps:** no [R2] AC without a task, no task without an AC. Partial coverage by design:
- AC-50 viewport and AC-46 width behaviour are CSS-only (D21), so jsdom cannot verify them: manual (M).
- AC-45 "unknown provider" is unreachable through the `Repo` contract (D25).
- The AC-20 "missing key" case is only reachable with non-strict providers (D20).

## Режим виконання і розподіл

**Recommended and recorded: multi-agent** (D18, pending user confirmation).

| Batch | Tasks (parallel within batch) | Executor |
|---|---|---|
| 1 | R2-S1 (alone, contract first) | `implementer` |
| 2 | R2-S2 (server) ‖ R2-S4 (client nav, after user OK on the vendored edit) ‖ R2-S5 (client page) | `implementer` ×3 |
| 3 | R2-S3 (server, needs S2) ‖ R2-T2 (client tests, needs S4+S5) | `implementer` ‖ `test-writer` |
| 4 | R2-T1 (server tests) | `test-writer` |
| 5 | Architecture review of the full delta diff (+ ≤ 2 fix rounds) | `architecture-reviewer` → `implementer` (fix mode) |
| 6 | R2-S6 docs, then verification | `doc-writer` → `plan-verifier` |

File ownership is disjoint inside each batch:
- S2 owns `constants/helpers/facts`; S5 owns the client page and copy; S4 owns `nav.ts`.
- S3 owns `service` + prompt; T2 owns only client test files.

Implementers never edit `*.test.*`. Test-writers derive cases from the spec ACs above, not from the implementation.

## План перевірки (described, not run)

From root `CLAUDE.md`:
- `server/`: `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` · `pnpm exec vitest run .it.test` (Docker/Postgres) · `pnpm lint`
- `client/`: `pnpm typecheck` · `pnpm test` · `pnpm lint`
- `e2e/` regression (stack via `./scripts/dev.sh`): `npm test`. `06-onboarding.flow.json` must still pass (the nav move must not affect the Add-repo page).
- Manual browser checks:
  - sidebar order and icon
  - TOC at 1280 vs 1279 px and scroll-spy
  - collapse/expand + TOC jump
  - Copy on `http://localhost` (secure context) and the denied-permission fallback
  - Share link
  - Open → GitHub file at `indexed_sha`
  - ellipsis + tooltip
  - first-task grid at < 900 px content
  - keyboard pass (NFR-6)
  - a revision-1 stored tour still renders (AC-52)
- Checkpoints:
  - after R2-S1: both typechecks
  - after R2-S2/S3: server typecheck + lint (hermetic LLM-path tests expected red until R2-T1)
  - after R2-S5: client typecheck + lint
  - after R2-T1/T2: full suites green

## Ризики / відкриті питання

| Risk | Mitigation |
|---|---|
| Required-nullable LLM keys break every existing onboarding LLM fixture | Planned. R2-T1 owns the fixture update, and R2-S2 checkpoint expects red (D20). |
| Strict-mode providers emit `run_steps: null` often → users mostly see skeleton steps | Acceptable: the skeleton steps are verified facts (`<pm> run <root script>`). The prompt asks for steps explicitly. |
| AC-41 exact match drops useful LLM steps (`pnpm install`, `cp .env.example .env`) | By design (E22, user decision Q1). Document in the validation notes that the mockup's sample steps are not reproducible. |
| `UNAVAILABLE_PREFIX` string coupling between server and client (D26) | Both copies asserted in R2-T1/R2-T2. Add a contract flag if the copy changes. |
| First CSS module / container query in the client (D21) | Next 15 supports both natively. Vitest `css: false` returns a harmless proxy. Record in `client/INSIGHTS.md`. |
| Vendored `nav.ts` edit could be overwritten by a future `@devdigest/ui` sync | One hunk, listed for the gate. No upstream exists today. |
| `OnboardingTourView.tsx` growth | Split into 4 colocated sub-components (R2-S5). |
| `relativeTime` with a frozen "now" in tests | Test-writer uses fake timers or asserts the prefix only. |

Open questions: none blocking. D18–D30 pending user veto. D20, D23 and D29 are the ones that shape behaviour.

## Поза межами плану

- Spec non-goals: complexity badge, tier-coloured diagram nodes, clickable inline path chips, mobile layout, real link sharing, in-app file viewer, MCP tool, history.
- Design-analysis *Proposed* items not adopted by the spec: loading skeleton cards (G2), dimmed stored tour during regeneration (P1), per-card `facts`/`AI` marker (P2), "Copy all" (P3).
- Fixing `isJunkPath` root-level dirs and NFR-1/NFR-2 timing (open rows of revision 1's validation, unchanged here).
- Any DB migration, route or hook change, `reviewer-core`/`mcp`/`e2e` change.
