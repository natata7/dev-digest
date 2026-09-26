# Agents

Кастомні subagents для DevDigest. Канонічна локація — `.claude/agents/`. Кожен агент — окремий `<name>.md` з YAML frontmatter + інструкціями-персоною; повний текст правил читай у відповідному файлі, цей README лише мапить набір.

## Каталог

| Агент | Модель | Дозволи (tools) | Вхід | Вихід |
|---|---|---|---|---|
| [researcher](researcher.md) | sonnet | `Read, Bash, Grep, Glob, WebFetch, WebSearch` (без Write/Edit) | Питання дослідження (репозиторій і/або зовнішні джерела) | Звіт: Висновок / Докази / Посилання / Не вдалося з'ясувати |
| [planner](planner.md) | opus | `Read, Grep, Glob, Bash` (read-only; Bash лише для `git log`/`pnpm ls`/`find` тощо, без мутуючих команд, без Write/Edit) | Опис фічі/зміни | Development Plan (структурований Markdown) |
| [implementer](implementer.md) | sonnet | `Read, Write, Edit, Grep, Glob, Bash, WebFetch, WebSearch` | Development Plan від `planner` | Implementation Report (структурований Markdown) |
| [test-writer](test-writer.md) | sonnet | `Read, Write, Edit, Grep, Glob, Bash` (Write/Edit дисципліновані лише на тестові файли) | Development Plan/вимоги або наявний код | Звіт: написані тести, прогін, поза межами |
| [architecture-reviewer](architecture-reviewer.md) | sonnet | `Read, Grep, Glob, Bash, ReportFindings` (без Write/Edit) | Diff або набір файлів | Виклик `ReportFindings` (структуровані знахідки з file:line) |
| [plan-verifier](plan-verifier.md) | sonnet | `Read, Grep, Glob, Bash` (Bash лише для наявних verify-команд пакету, без Write/Edit) | Development Plan/вимоги + реалізований код | Coverage Matrix у форматі `docs/specs/NN-validation-*.md` |
| [doc-writer](doc-writer.md) | sonnet | `Read, Write, Edit, Grep, Glob, Bash` (Write/Edit дисципліновані лише на `*.md` документації) | План/validation-звіт або наявний код | Документація (README/docs/specs), опційно з mermaid-діаграмами |

## Відповідальність

- **researcher** — дослідницький агент без побічних ефектів. Не використовує `/deep-research`; якщо задача нечітка — спершу ставить уточнювальні запитання. Два режими: пошук у коді репозиторію та пошук у зовнішніх джерелах, кожен зі своїм форматом звіту.
- **planner** — готує Development Plan: визначає зачеплені пакети (`server`/`client`/`reviewer-core`/`e2e`), архітектурні обмеження, читає `INSIGHTS.md` зачеплених модулів і явно фіксує, які скіли `implementer` має застосувати на кожному кроці. Ніколи не пише код.
- **implementer** — виконує готовий Development Plan у frontend і backend, завантажує скіли зі списку плану (відхилення від списку позначає у звіті, не мовчить), запускає verify-команди зачеплених пакетів, перевіряє лише власну відповідність плану. Архітектурне й безпекове рев'ю — поза межами цього агента, виконують окремі агенти.
- **test-writer** — пише тести для UI і backend за проєктними скілами (`react-testing-library`, `fastify-best-practices/testing`, `onion-architecture/testing-strategy`); Write/Edit дисципліновані лише на тестові файли, ніколи не чіпає продукт-код, щоб зробити тест зеленим.
- **architecture-reviewer** — read-only, перевіряє межі шарів (onion-architecture для backend, ui-architecture для frontend) на diff і повертає знахідки через `ReportFindings` з доказом `file:line`. Не фіксує, лише звітує.
- **plan-verifier** — звіряє реалізований код з кожним пунктом плану/вимог у форматі Coverage Matrix (Verified/Not Verified + доказ), сумісному з наявною конвенцією `docs/specs/NN-validation-*.md`; не підміняє перевірку наративною порадою.
- **doc-writer** — перетворює план/validation-звіт або наявний код на документацію (package README, `docs/specs/`, root `docs/`) з mermaid-діаграмами; Write/Edit дисципліновані лише на `*.md`, ніколи не редагує `docs/agent-prompts/*.md` як звичайний текст (це канонічні копії system-промптів review-агентів, синхронізовані в БД).

## Потік

```
planner → implementer → { test-writer, architecture-reviewer, plan-verifier } → doc-writer
```

`planner` не мутує стан і не виконує роботу сам — оркеструючий Claude передає його Development Plan як контекст наступному виклику `implementer`. Список скілів у плані — контракт: `implementer` не розширює й не ігнорує його мовчки. `architecture-reviewer` і `plan-verifier` не залежать одне від одного — обидва читають вихід `implementer`/`test-writer` з різним фокусом (межі шарів vs трасування вимог) і можуть йти паралельно. `doc-writer` йде останнім, документуючи підтверджену реалізацію.

## Джерела правил (planner, implementer, test-writer, architecture-reviewer, plan-verifier, doc-writer)

Правила агентів спираються на вже наявні в репозиторії конвенції, а не на нові вигадані патерни:

- Dispatcher-патерн вибору скілів за шляхом (`client/` → `ui-architecture`, `server/`/`reviewer-core/` → `onion-architecture`, змішаний diff → обидва) — [.claude/skills/pr-self-review/SKILL.md](../skills/pr-self-review/SKILL.md)
- Протокол читання/оновлення `INSIGHTS.md` на старті й наприкінці задачі — [.claude/skills/engineering-insights/SKILL.md](../skills/engineering-insights/SKILL.md)
- Модулі, verify-команди (`typecheck`/`test`/`lint` per package) і Do-not-touch (`src/vendor/`, `db/migrations/`, lock-файли) — [CLAUDE.md](../../CLAUDE.md) та per-package `AGENTS.md` (`server/AGENTS.md`, `client/AGENTS.md`, `reviewer-core/AGENTS.md`)
- Архітектурні обмеження, які план мусить поважати — [.claude/skills/onion-architecture/SKILL.md](../skills/onion-architecture/SKILL.md) (чекліст порушень — [rules/anti-patterns.md](../skills/onion-architecture/rules/anti-patterns.md)), [.claude/skills/ui-architecture/SKILL.md](../skills/ui-architecture/SKILL.md)
- Дисципліна review-знахідок (severity anti-inflation, тільки file:line з diff, без padding) — [docs/agent-prompts/README.md](../../docs/agent-prompts/README.md), [docs/agent-prompts/general-reviewer.md](../../docs/agent-prompts/general-reviewer.md)
- Формат Coverage Matrix для перевірки реалізації проти специфікації (Verified/Not Verified + доказ), відмінний від сусідньої конвенції `audit` (перевірка плану ДО коду) — приклад: [docs/specs/05-spec-api-contract-reviewer/05-validation-api-contract-reviewer.md](../../docs/specs/05-spec-api-contract-reviewer/05-validation-api-contract-reviewer.md) vs [05-audit-api-contract-reviewer.md](../../docs/specs/05-spec-api-contract-reviewer/05-audit-api-contract-reviewer.md)
- Тестові конвенції (`react-testing-library`, hermetic vs `.it.test.ts`) — [.claude/skills/react-testing-library/SKILL.md](../skills/react-testing-library/SKILL.md), [.claude/skills/fastify-best-practices/rules/testing.md](../skills/fastify-best-practices/rules/testing.md), [.claude/skills/onion-architecture/rules/testing-strategy.md](../skills/onion-architecture/rules/testing-strategy.md), [TESTING.md](../../TESTING.md)
- Діаграми — [.claude/skills/mermaid-diagram/SKILL.md](../skills/mermaid-diagram/SKILL.md); таксономія документації — [Diátaxis](https://diataxis.fr/)
- Frontmatter-конвенції subagents (`name`/`description`/`tools`/`model`, `tools` як read-only vs read-write розмежування — явний allowlist важливіший за default-успадкування всіх інструментів батьківської сесії, sequential-chain патерн передачі summary між агентами, "review, don't fix") — [Authoring Custom Subagents](https://code.claude.com/docs/en/sub-agents), [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) (розділ "Add an adversarial review step")
- Конвенції каталогу скілів, які агенти вибирають — [.claude/skills/README.md](../skills/README.md), [Authoring SKILL.md Files](https://code.claude.com/docs/en/skills)
