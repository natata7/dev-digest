# 07-plan-project-context.md

Implementation Plan для [07-spec-project-context.md](07-spec-project-context.md). Статус: **чернетка, не виконано**.

## Рішення (зафіксовані)

| Тема | Рішення |
|---|---|
| Зберігання вибору | Нова jsonb-колонка `context_paths` (впорядкований масив відносних шляхів, default `[]`) на `agents` і на `skills`. Без нових таблиць. Прецедент: `skills.evidence_files`. |
| Версіонування | `context_paths` **не** входить у `agent_versions` / `skill_versions`, `version` не інкрементується. Окремі `PUT`, щоб не зачепити логіку версій. |
| Корінь пошуку | `repos.clone_path`. Glob з `AppConfig` (`contextGlob`, env `CONTEXT_DOCS_GLOB`, default `**/{specs,docs,insights}/**/*.md`). |
| Токени | `Math.ceil(chars / 4)` — той самий `approxTokens`, що вже є в клієнті (`RunTraceDrawer/helpers`). Серверна копія — одна функція в новому модулі. |
| Used by N agents | Обчислюється на льоту: агенти з документом у власних `context_paths` + агенти, чиї увімкнені скіли мають його. Без денормалізації. |
| Новий модуль | `server/src/modules/context/` (`routes.ts` / `service.ts` / `helpers.ts`), узгоджено з onion-architecture. Читання файлів — через існуючий патерн доступу до clone-директорії (перевірити в repo-intel, не вигадувати новий). |
| Engine | `PromptParts.specs` стає `Array<string \| { path: string; text: string }>`; `{path}` стає label у `<untrusted source="…">`. Рядки працюють як раніше (CI-runner не ламається). |
| Без LLM | Жодних нових викликів; лише читання файлів. |

## Факти з коду, на які спирається план

- `reviewer-core/src/prompt.ts:123-146` уже має `## Project context` + `wrapUntrusted` (label зараз `spec-${i}`), `assembly.specs = specsBlock`. `INJECTION_GUARD` — той самий файл.
- `server/src/modules/reviews/run-executor.ts`: `specs` не передається в `reviewPullRequest`; `specs_read: []` у двох місцях (~L324 і ~L474). `linkedSkills` дає скіли агента (L193).
- `RunTrace.specs_read: string[]` у `contracts/trace.ts`; `trace-builder.ts` приймає `specsRead: string[]`.
- Клієнт: `TraceBody.tsx` уже показує `specs_read` (рядок `trace.config.specsRead`) і Prompt Assembly з `approxTokens`. `AgentEditor` має таби Config/Skills (`?tab=`), `SkillEditor` має Config/Preview/Versions. Сторінки Project Context у клієнті **немає** (є лише `repos/[repoId]/conventions`, `pulls`); хуки `useContextFiles` / `useReindexContext` у `lib/hooks/core.ts` — заготовка на неіснуючий `/repos/:id/context`.
- `agents/routes.ts`, `skills/routes.ts` — оновлення версії іде через окремі роути; ми додаємо нові `PUT .../context`.

## Порядок і залежності

```
Step 1 (контракти+міграція) → Step 2 (reviewer-core)  ┐
                            → Step 3 (server context) ├→ Step 5 (run-executor) → Step 7 (docs/verify)
                            → Step 4 (attach API)     ┘
Step 3,4 → Step 6 (client)
```

Кроки 2, 3, 4 незалежні після кроку 1 і можуть іти паралельно (різні пакети/модулі).

---

## Step 1 — Контракти та схема БД (server)

**Пакет:** `server/` · **Скіли:** `zod`, `drizzle-orm-patterns`, `postgresql-table-design`

- `server/src/vendor/shared/contracts/platform.ts`: розширити `SpecFile` до `{ path, kind: 'specs'|'docs'|'insights', size, tokens, used_by_agents }`; новий `ContextList = { files: SpecFile[], total_tokens: number }`; `ContextFile = { path, content, tokens }`; `ContextPaths = { paths: string[] }` (body для PUT). `IndexStatus.chunks_indexed` лишити (repo-intel його використовує) — футер "tokens total" бере `total_tokens` з `ContextList`, не з `IndexStatus`.
- `contracts/trace.ts`: `RunTrace.specs_read` залишити `string[]` (зворотна сумісність зі збереженими trace), додати **optional** `specs_read_detail: { path, tokens }[]` та `specs_skipped: { path, reason: 'missing' }[]`.
- Agent/Skill DTO: додати `context_paths: string[]`.
- `db/schema/agents.ts`, `db/schema/skills.ts`: `contextPaths: jsonb('context_paths').$type<string[]>().notNull().default([])`.
- `pnpm db:generate` → нова міграція (існуючі не чіпати). **Не** редагувати `src/vendor/` у client вручну — синхронізує скрипт.

**Перевірка:** `pnpm typecheck` (server).

## Step 2 — Engine: label по шляху (reviewer-core)

**Пакет:** `reviewer-core/` · **Скіли:** `typescript-expert`, `onion-architecture`

- `PromptParts.specs` і `ReviewInput.specs` → `Array<string | { path: string; text: string }>`.
- `assemblePrompt`: label = `path` для об'єктів, `spec-${i}` для рядків. Екранування `</untrusted>` вже є в `wrapUntrusted`; додатково екранувати лапки/переводи рядка в самому label (path приходить із файлової системи).
- Решту (`## Project context`, `assembly.specs`) не чіпати.

**Тести (test-writer):** `prompt.test.ts` — 2 spec-и → 2 блоки з `source="path"`; текст із `</untrusted>` не виходить із блоку; порожній/відсутній `specs` → секції немає (регресія).

## Step 3 — Server: модуль `context` (discovery + read-only API)

**Пакет:** `server/` · **Скіли:** `fastify-best-practices`, `onion-architecture`, `security`

- `platform/config.ts`: `contextGlob` у `EnvSchema` та `AppConfig`.
- `modules/context/helpers.ts` (чисті функції): `approxTokens`, `kindOf(path)`, `isInsideRoot(root, rel)`, `matchesGlob`. Glob — через уже встановлену залежність (перевірити, що є в `server/package.json`; нову не додавати заради цього — інакше `node:fs` `glob` / власний прохід каталогу з фільтром по сегментах `specs|docs|insights`).
- `service.ts`: `list(workspaceId, repoId)` — рекурсивний прохід clone-директорії, пропуск dot-директорій і `node_modules`, `kind`, `size`, `tokens`, `used_by_agents`; `total_tokens`. `read(workspaceId, repoId, path)` — нормалізація, відхилення `..`, абсолютних шляхів, шляхів поза glob, symlink за межі кореня (`realpath`).
- `routes.ts`: `GET /repos/:id/context` → `ContextList`; `GET /repos/:id/context/file?path=` → `ContextFile`. Лише GET — жодних write-операцій над файлами.
- Репо без `clone_path` → порожній список (не 500).
- Зареєструвати модуль у `modules/index.ts`.

**Тести:** `helpers.test.ts` (glob/kind/traversal), `service.test.ts` на temp-директорії (файли всередині/поза glob, symlink назовні, `node_modules`), `*.it.test.ts` — не потрібен (нема нових запитів до БД, крім `used_by_agents`, який покривається в Step 4).

## Step 4 — Server: прикріплення до агента і скіла

**Пакет:** `server/` · **Скіли:** `fastify-best-practices`, `drizzle-orm-patterns`, `onion-architecture`

- `agents/routes.ts` + `service.ts` + `repository.ts`: `PUT /agents/:id/context` (body `ContextPaths`) → зберігає масив у `context_paths`; валідація: рядки, ≤ N елементів, без дублікатів, відносні шляхи без `..` (повторно використати `isInsideRoot`-перевірку формату; існування файлу **не** вимагати — зниклий файл дозволений).
- `skills/routes.ts` + `service.ts` + `repository.ts`: те саме для `PUT /skills/:id/context`. **Не** створювати запис у `skill_versions`.
- DTO агента/скіла повертають `context_paths`.
- `used_by_agents` (для Step 3): метод у `agents/repository.ts` — по шляху рахує агентів, у яких шлях є в `agents.context_paths` або в `skills.context_paths` увімкненого лінкованого скіла (dedup по `agent_id`).
- Хелпер `effectiveContextPaths(agentPaths, skillPathsInOrder)` — агентські спочатку, потім скіли, dedup (перший виграє). Чиста функція в `modules/context/helpers.ts`.

**Тести:** unit на `effectiveContextPaths` (перетин → один раз); `*.it.test.ts` — PUT → GET повертає ті самі шляхи в тому ж порядку, у БД лише рядки; `skill.version` не змінюється; `used_by_agents` рахує і пряме, і через-скіл прикріплення.

## Step 5 — Run executor: читання + додавання в промпт + trace

**Пакет:** `server/` · **Скіли:** `onion-architecture`, `security`

- `run-executor.ts`: після `linkedSkills` (L193) викликати `loadProjectContext(repo, effectivePaths, runLog)` (метод сервісу `context`, не логіка в executor): читає кожен файл з `clone_path`; відсутній/нечитабельний → `skipped.push({path,reason:'missing'})` + `runLog.info`, без падіння; повертає `{ docs: {path,text,tokens}[], skipped }`.
- Передати `specs: docs.map(d => ({path, text}))` у `reviewPullRequest` лише коли `docs.length > 0` (інакше промпт ідентичний сьогоднішньому).
- Обидва місця `specs_read: []` (успіх ~L324 і fallback ~L474): успіх → `docs.map(d => d.path)` + `specs_read_detail` + `specs_skipped`; fallback-trace — залишити порожнім/із `skipped`, якщо вже порахований.
- Лог `Review prompt composed` не змінюється (в `describePromptSections` секція `specs` уже є → source `Project Context`).
- Жодного нового `llm.*` виклику.

**Тести:** розширити наявні тести run-executor (герметичні, зі stub LLM): прикріплені два файли → `specs_read` має обидва, виклик LLM один; один файл видалено → прогін `done`, `specs_skipped` має `missing`; без прикріплень → `assembly.specs === null`, `specs_read === []`.

## Step 6 — Client: сторінка, вкладки Context, trace

**Пакет:** `client/` · **Скіли:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`

- Синхронізувати `vendor/shared` (скриптом проєкту, не руками).
- `lib/hooks/core.ts`: переробити `useContextFiles` на `ContextList`, додати `useContextFile(repoId, path)`, `useSetAgentContext`, `useSetSkillContext`; прибрати/замінити `useReindexContext`, якщо ніде не використовується (перевірити grep).
- **Сторінка Project Context**: `app/repos/[repoId]/context/page.tsx` (тонка) + `_components/ProjectContextView/` (список, Preview read-only без Edit, footer "Indexed: N files · X tokens total", заголовок "Used by N agents"). Додати пункт у сайдбар (`Project Context`). Пошук/фільтр по шляху.
- **Спільний компонент** `ContextDocList` (чекбокс, шлях, kind-бейдж, токени, drag-reorder, фільтр, Preview, позначка "missing") — у спільному місці (`components/`), бо використовується двома табами (правило frontend-architecture: 2+ споживачі → promote).
- `AgentEditor`: таб **Context** (`AgentEditor/_components/ContextTab/`) — "K of N attached", футер `≈ X tokens` + підказка "Injected as an untrusted block into every run"; PUT на зміну.
- `SkillEditor`: таб **Context** — "Project context to use", "K attached", блок "Serializes as" (`## Project specifications` + список шляхів).
- Токени в UI = сума `tokens` прикріплених; оновлюється одразу при toggle (локальний стан + оптимістичний PUT).
- Trace: `TraceBody` — "Specs read" зі шляхами й токенами (`specs_read_detail`, fallback на `specs_read`), перелік `specs_skipped`; у Prompt Assembly рядок **"Project context — attached specs (untrusted)"** (є `trace.specs` слот; перейменувати лейбл в i18n) з expand на повний текст.
- i18n: усі нові рядки через next-intl.

**Тести:** `ContextTab.test.tsx` (toggle → сума токенів змінюється; missing позначено), `ProjectContextView.test.tsx` (нема кнопки Edit, футер "tokens total"), оновити `RunTraceDrawer.test.tsx` (`specs_read` з деталями).

## Step 7 — Документація та верифікація

**Скіли:** `engineering-insights`, `mermaid-diagram`

- `server/AGENTS.md` / `client/AGENTS.md` / README модуля `context` — короткі нотатки (view-only, path-traversal, glob).
- Повні перевірки: server `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test && pnpm lint`; reviewer-core `npm run typecheck && npm test && npm run lint`; client `pnpm typecheck && pnpm test && pnpm lint`.
- Proof artifacts зі специфікації → `07-proofs/` (скріншоти 4 екранів, API-відповіді, виведення тестів). Далі `plan-verifier` → `07-validation-project-context.md`.

## Ризики та рішення

| Ризик | Мітигація |
|---|---|
| `path` у label ламає розмітку `<untrusted source="…">` | Екранувати `"` і `\n` у label (Step 2). |
| Symlink у репо виводить за межі кореня | `realpath` + перевірка префікса (Step 3). |
| Дуже великі `.md` роздувають промпт | Лише попередження в UI про сумарні токени (Open Question 1 зі спеки); жорсткого ліміту немає. |
| Агент workspace-рівня, репо PR різні | Шляхи відносні; відсутній у репо PR → `missing` (Open Question 2). |
| `RunTrace` старих прогонів без нових полів | Нові поля optional; клієнт робить fallback на `specs_read`. |
| Дублювання `approxTokens` клієнт/сервер | Свідомо: пакети не діляться кодом; формула одна, `ceil(chars/4)`. |

## Режим виконання

Кроки 2–4 незалежні, тож їх зручно віддати паралельно трьом implementer-ам; 1 і 5 — послідовно, 6 — після 3–4. Альтернатива — один implementer по порядку. Рекомендація — multi-agent для 2/3/4, далі решта послідовно. Які пріоритети?
