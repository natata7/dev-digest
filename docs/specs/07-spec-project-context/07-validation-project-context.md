# 07-validation-project-context.md

Звіт `plan-verifier` для [07-spec-project-context.md](07-spec-project-context.md). Тести для нового коду в цьому запуску свідомо не писали — відсутнє покриття є нотаткою, а не Not Verified.

## Підсумок

Server, reviewer-core і client реалізовані. Один регресійний тест (`server/test/contracts.test.ts`, фікстура `Skill` без `context_paths`) виправлено після звіту верифікатора — тепер 16/16 проходять. Не підтверджені: UI-вимоги, що потребують браузера; пункт сайдбара; `used_by_agents` на DTO скіла.

## Coverage Matrix

### Unit 1 — discovery + read-only API
| Вимога | Статус | Доказ |
|---|---|---|
| Рекурсивний пошук за configurable glob (default `**/{specs,docs,insights}/**/*.md`) | Verified | `platform/config.ts` (`CONTEXT_DOCS_GLOB`), `modules/context/service.ts`, `helpers.ts` |
| `path`, `kind`, `size`, `tokens` на документ | Verified | `service.ts`, `contracts/platform.ts` `SpecFile` |
| Повний текст одного документа; відхилення поза root/glob | Verified (за кодом) | `service.ts` `readSafe` (isInsideRoot + glob + realpath → 404). Живий запит `../../etc/passwd` не виконувався |
| Summary: кількість файлів + total tokens | Verified | `ContextList.total_tokens` |
| Жодних write-ендпойнтів | Verified | `context/routes.ts` — лише два GET |
| Ігнор dot-директорій і `node_modules` | Verified | `helpers.ts` `skipDir` |

### Unit 2 — attach
| Вимога | Статус | Доказ |
|---|---|---|
| Впорядковані шляхи, без тексту, на агенті й скілі | Verified | `schema/agents.ts`, `schema/skills.ts`, міграція `0018_gray_starfox.sql` |
| Toggle/reorder зберігаються; валідація шляхів | Verified | `PUT /agents/:id/context`, `PUT /skills/:id/context`; `_shared/schemas.ts` `ContextPathsBody` |
| Без нової версії скіла | Verified (за кодом) | `skills/repository.ts` `setContextPaths` |
| Effective = агент → скіли, dedup | Verified | `context/effective.ts`, `run-executor.ts` |
| `used_by_agents` для документа | Verified | `agents/repository.ts` `contextUsage` |
| `used_by_agents` для скіла | Not Verified | Поля на DTO скіла немає; є наявний `agent_count` |

### Unit 3 — run executor + trace
| Вимога | Статус | Доказ |
|---|---|---|
| Читання effective docs → `specs` → `## Project context` | Verified | `run-executor.ts`, `reviewer-core/src/prompt.ts` |
| `<untrusted source="path">` + injection guard | Verified | `wrapUntrusted`, санітизація label |
| Без додаткового LLM-виклику | Verified (за кодом) | У diff лише читання файлів |
| Зниклий файл: skip + запис у лог і trace | Verified (за кодом) | `readDocs` → `skipped`, `runLog.info` |
| `specs_read` (+ detail з токенами) і `specs_skipped` | Verified | `run-executor.ts`, `contracts/trace.ts` |
| Без документів — поведінка як раніше | Verified | `specs` не передається при порожньому списку |

### Unit 4 — UI
| Вимога | Статус | Доказ |
|---|---|---|
| Сторінка Project Context: Preview без Edit, футер "tokens total", "Used by N agents" | Not Verified (manual/e2e) | `app/repos/[repoId]/context/` |
| Пункт "Project Context" у сайдбарі | Not Verified (gap) | Nav у vendored `client/src/vendor/ui/nav.ts` — не редагувалось |
| Agent / Skill Context tab, токени, "missing", "Serializes as" | Not Verified (manual/e2e) | `ContextTab/`, `components/context-doc-list/` |
| Trace: Specs read, Skipped, рядок "Project context — attached specs (untrusted)" | Not Verified (manual/e2e) | `TraceBody.tsx`, `messages/en/runs.json` |
| Рядки через i18n; хуки | Verified | `messages/en/*.json`, `lib/hooks/core.ts` |

## Команди (до виправлення фікстури)

- server: typecheck pass; hermetic 367/368 (єдиний провал — фікстура `Skill`, виправлена; перевірено повторно 16/16); lint pass; `.it.test`: 59 pass, 1 файл `settings-models.it.test.ts` впав на `CONNECTION_CLOSED` (інфраструктурне, поза змінами).
- reviewer-core: typecheck / test (30) / lint pass.
- client: typecheck / test (168) / lint pass.

## Нотатки і ризики

- Немає тестів на новий код: `context/helpers|service`, `effectiveContextPaths`, PUT-ендпойнти, run-executor, `ContextTab`, `ProjectContextView`.
- Fallback-trace (при падінні прогону) лишає `specs_read: []` без `specs_skipped` — за планом.
- Architecture review: 3 CONFIRMED виправлено (DI `ContextService` через container, `container.agentsRepo`, дубль `KIND_COLOR`/filter), повторне рев'ю чисте. PLAUSIBLE залишені: прямий `node:fs` у `ContextService`; `setContext` — тонкий, правила шляхів у Zod-схемі route.
- Step 7 (AGENTS.md/README нотатки) не виконано.
- Метрики 2–5 зі спеки (кількість LLM-викликів, розбіжність токенів ≤10%) не вимірювались.
