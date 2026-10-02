# 07-spec-project-context.md

## Introduction/Overview

Рев'юер-агент не знає, що команда вже вирішила у своїх специфікаціях (PRD, security baseline, rate-limiting). **Project Context** дозволяє користувачу вручну вибрати `.md`-документи з репозиторію (`specs/`, `docs/`, `insights/`) і прикріпити їх до агента або скіла. Перед кожним прогоном сервер читає ці файли з диска й додає їхній текст у промпт як **недовірені дані**. Користувач бачить, скільки токенів додасть кожен документ, а в trace прогону — які саме документи потрапили в запит і їхній повний текст. Жодного додаткового LLM-виклику і жодного редагування документів — лише перегляд.

## Goals

- Користувач знаходить усі `.md` у `specs/`, `docs/`, `insights/` вибраного репозиторію без ручного введення шляхів.
- Користувач прикріплює документи до агента (вкладка **Context**) та до скіла (секція **Project context to use**) чекбоксом.
- Біля кожного документа та в підсумку видно кількість токенів ще до запуску рев'ю.
- Кожен прогін додає прикріплені документи в `## Project context` як недовірений блок (delimiters + injection guard); 0 додаткових LLM-викликів.
- Trace показує `specs_read`, список документів з токенами, а Prompt Assembly — окремий розділ з повним текстом, який можна розгорнути.

## User Stories

- **As a reviewer**, I want to browse all spec/doc/insight Markdown files of a repo so that I can see what project knowledge is available.
- **As an agent author**, I want to attach selected documents to an agent in its Context tab so that every run of that agent sees them.
- **As a skill author**, I want to attach documents to a skill so that any agent using the skill inherits them.
- **As an agent author**, I want to see how many tokens each document and the whole selection add so that I can control prompt size and cost before running.
- **As a reviewer**, I want to open a run's trace and read the exact attached documents' text so that I can verify what the model was given.
- **As a reviewer**, I want a clear note when an attached file no longer exists so that I don't assume it was used.

## Demoable Units of Work

### Unit 1: Server — document discovery and read-only API

**Purpose:** Єдине джерело списку документів, їхнього тексту й токенів для сторінки Project Context, вкладок Context та preview.

**Functional Requirements:**
- The system shall recursively find `.md` files in the repo's clone directory using a configurable glob; the default glob is `**/{specs,docs,insights}/**/*.md`.
- The system shall return for each document: relative `path`, `kind` (`specs` | `docs` | `insights`, derived from the matched folder), `size` in bytes, and `tokens` (estimate).
- The system shall return the full text of one document on request (for preview), and shall reject any path that resolves outside the repo clone directory or does not match the glob.
- The system shall return an index summary: number of documents and **total tokens** (shown in the UI footer instead of "chunks").
- The system shall not expose any endpoint that writes, renames, or deletes a document.
- The system shall ignore `node_modules/`, `.git/` and other dot-directories during discovery.

**Proof Artifacts:**
- API: `GET` list for the seeded repo returns documents with `path`, `kind`, `tokens` demonstrates discovery and token counting.
- API: preview request with `../../etc/passwd` returns 4xx demonstrates path-traversal protection.
- Test: hermetic unit test over a temp directory with files inside/outside the glob demonstrates glob and `kind` classification.

### Unit 2: Attach documents to agents and skills

**Purpose:** Зберегти вибір користувача — лише шляхи, не текст.

**Functional Requirements:**
- The system shall store attached documents per agent and per skill as an ordered list of relative paths (no document text in the database).
- The user shall be able to toggle a document on/off, reorder attached documents (order = order in the prompt), and the system shall persist both.
- The system shall return the attached list together with the current available documents so the UI can mark which are checked.
- Deleting or disabling nothing else shall change when a skill's attachments change: no new skill version is created (attachments are not part of the skill version history).
- When an agent uses a skill, the effective documents of a run shall be the agent's own attachments followed by the skill's attachments, de-duplicated by path (first occurrence wins).
- The system shall return, for a skill and for each document, `used_by_agents`: the number of agents that use it (directly, or through a skill for the skill case).

**Proof Artifacts:**
- API: attach two paths, reload, same paths in same order demonstrates persistence of paths only.
- DB: query of the new column/table shows only path strings demonstrates "paths, not text".
- Test: attachments from agent and its skill overlap on one path → effective list has it once demonstrates de-duplication.

### Unit 3: Run executor injects project context; trace transparency

**Purpose:** Фактично довести документи до моделі й показати це в trace.

**Functional Requirements:**
- Before each run the system shall read the effective documents from the repo clone and pass their text to the review engine as the `specs` input; the engine shall render them in a `## Project context` section.
- Each document shall be wrapped in an untrusted delimiter block labelled with its path, and the existing injection guard shall apply (closing-delimiter text inside a document must not break out of the block).
- The system shall not make any additional LLM call for project context.
- If an attached file no longer exists or cannot be read, the system shall skip it, continue the run, and record it in the run log and in the trace (see below). The run shall not fail.
- The trace shall set `specs_read` to the list of documents actually injected, together with each one's token estimate; skipped documents shall be listed separately with reason `missing`.
- The trace's `prompt_assembly.specs` shall contain the full injected text so it can be read in the UI.
- When no documents are attached, the `## Project context` section shall be omitted and behaviour shall be identical to today.

**Proof Artifacts:**
- Test: engine prompt with two specs contains `## Project context` and two `<untrusted source="…">` blocks demonstrates injection.
- Test: spec text containing `</untrusted>` is escaped demonstrates the injection guard.
- Test: run with one existing and one deleted path completes, `specs_read` has one entry and the skipped list has one `missing` demonstrates skip-and-record.
- Log: provider call count for a run with and without documents is the same demonstrates no extra LLM call.

### Unit 4: UI — Project Context page, Context tabs, trace

**Purpose:** Дати користувачу інтерфейс з макетів: перегляд, вибір, токени, прозорість.

**Functional Requirements:**
- The **Project Context** page shall list discovered documents (path, kind), show a Preview of the selected one (read-only; no Edit control), and show the footer "Indexed: N files · X tokens total".
- The page header of a document shall show "Used by N agents" instead of a coverage score.
- The agent editor shall have a **Context** tab: a list with checkbox, path, kind badge, drag handle for order, filter box, and a Preview button per document; a header "K of N attached"; a footer with total tokens of the attached documents and a note that they are injected into every run.
- The skill editor shall have a **Context** tab with the same list under the title "Project context to use", with "K attached" and a "Serializes as" preview of the attached paths.
- The UI shall show per-document tokens in the list so the user sees the cost before choosing; the total updates immediately on toggle.
- An attached document whose file is gone shall appear in the list marked "missing" and shall remain removable.
- The run trace drawer shall show **Specs read** with the document paths and tokens, and a Prompt Assembly row **"Project context — attached specs (untrusted)"** that expands to the full text and has copy/expand like the other rows.
- All new UI strings shall be added through the existing i18n message files.

**Proof Artifacts:**
- Screenshot: Project Context page with footer "tokens total" demonstrates the "chunks" replacement and read-only preview.
- Screenshot: agent Context tab with 2 of 7 attached and token total demonstrates selection-time cost.
- Screenshot: skill Context tab with "Serializes as" demonstrates skill attachment.
- Screenshot: trace drawer expanded "Project context — attached specs (untrusted)" demonstrates full-text transparency.
- Test: component test for the Context tab (toggle → total tokens changes) demonstrates live token sum.

## Non-Goals (Out of Scope)

1. **Automatic document selection:** choosing documents by PR content is a separate feature; here selection is manual only.
2. **Editing documents:** view-only. Edits happen in the repo itself; the UI never writes files (editing through the app would need a git write/commit flow — too heavy for this scope).
3. **Embeddings / vector search / chunking of documents:** whole documents are injected; the old "chunks" notion is dropped from this UI.
4. **Coverage score:** replaced by the simple "Used by N agents" counter.
5. **Skill versioning for attachments:** attachment changes do not create a new skill version.
6. **Extra LLM calls** (summarising, ranking) for context.

## Design Considerations

Макети: Project Context page (список + preview + footer), вкладка Context агента, вкладка Context скіла ("Project context to use" + "Serializes as"), trace drawer (Configuration → Specs read; Prompt Assembly → "Project context — attached specs (untrusted)"). Відмінності від макетів: footer "1,240 chunks" → "N tokens total"; бейдж coverage (78) → "Used by N agents"; кнопка/режим Edit у Preview відсутні. Токени в макеті агента (`≈ 317 tokens`) рахуються для вибраних документів.

## Repository Standards

- Server: `routes.ts` / `service.ts` / `repository.ts` у новому модулі; залежності через `platform/container.ts`; Zod-контракти в `server/src/vendor/shared` (єдине джерело, дзеркало в client не правиться вручну). Див. [server/AGENTS.md](../../../server/AGENTS.md), skill `onion-architecture`.
- Drizzle: camelCase поле → snake_case колонка, нова міграція лише через `pnpm db:generate`; REST-поля snake_case.
- Client: `_components/<Name>/<Name>.tsx` + `styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`; тонкі `page.tsx`; next-intl для рядків. Див. [client/AGENTS.md](../../../client/AGENTS.md).
- Тести поруч із кодом (`*.test.ts(x)`); герметичні, без реального LLM.
- Conventional commits (`feat:`, `fix:`).

## Technical Considerations

- Уже існують заготовки, які треба задіяти, а не дублювати: `PromptParts.specs` + `wrapUntrusted` та `INJECTION_GUARD` у `reviewer-core/src/prompt.ts`; `specs_read` у `RunTrace` та `trace-builder.ts` (зараз завжди `[]` у `run-executor.ts`); `PromptAssembly.specs`; контракти `SpecFile` / `IndexStatus` у `platform.ts` та клієнтські хуки `useContextFiles` / `useReindexContext` (повторно використати й розширити; `IndexStatus.chunks_indexed` замінити на токени).
- Корінь пошуку — `repos.clone_path`. Glob задається в конфігурації сервера (`AppConfig`) зі значенням за замовчуванням з Unit 1.
- Оцінка токенів — груба (≈ символи/4), узгоджена з наявним `approxTokens` у клієнті; точний токенізатор не потрібен для цієї фічі.
- Зберігання шляхів: нова колонка/таблиця для агента та скіла; це нова міграція, наявні не редагуються.
- Файли читаються при кожному прогоні (актуальний стан диска), не кешуються між прогонами.
- Ліміт на документ/сумарний обсяг — див. Open Questions.

## Security Considerations

- Вміст документів — **недовірений**: завжди в `<untrusted>`-блоці, під дією injection guard; `</untrusted>` усередині тексту екранується.
- Захист від path traversal: шлях нормалізується, має лишатися в межах clone-директорії та збігатися з glob; symlink, що виводить за межі, ігнорується.
- Документи, що можуть містити секрети, не копіюються в БД (зберігаються лише шляхи); повний текст потрапляє лише в trace прогону, як і інші секції промпта.
- API не має write-операцій над файлами.

## Success Metrics

1. 100% прогонів із прикріпленими документами мають непорожній `specs_read` і розділ "Project context" у Prompt Assembly.
2. 0 додаткових LLM-викликів на прогін через Project Context.
3. Видалений прикріплений файл → прогін завершується (0 падінь), документ позначений `missing` у trace.
4. Токени в UI відрізняються від токенів у trace не більше ніж на 10% для тих самих документів.
5. Path-traversal запити → 100% відхилених.

## Open Questions

1. **Ліміт обсягу:** чи потрібен максимум токенів на прогін (наприклад, попередження в UI при > N токенів)? Пропозиція: лише попередження, без відсікання.
2. **Мультирепо:** вкладка Context агента працює в контексті вибраного репозиторію; агенти — workspace-рівня. Пропозиція: шляхи відносні, а при прогоні читаються з репо PR; якщо файлу в цьому репо немає — `missing`.
3. **Конфігурація glob:** лише змінна середовища/AppConfig, чи також поле в Settings UI? Пропозиція: лише AppConfig.
