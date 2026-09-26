# 06 Questions Round 1 – Blast Radius

Позначте `[x]` біля обраного варіанта (або допишіть свій у (E)) і збережіть файл.

## 1. GitHub vs GitLab — посилання «файл:рядок»

У завданні згадано `githubBlobUrl` у `client/src/lib/github-urls.ts`, але у вашому форку такого файлу немає. Натомість є `repoBlobUrl(provider, repoFullName, sha, file, startLine)` у `client/src/lib/repo-urls.ts`, який уже вміє і GitHub (`/blob/…#L12`), і GitLab (`/-/blob/…#L12`) і використовується у `FindingCard` та `ConventionsView`.

- [x] (A) Використати наявний `repoBlobUrl` — посилання працюють для GitHub і GitLab репозиторіїв однаково
- [ ] (B) Додати окремий `githubBlobUrl` як у завданні, лише GitHub (GitLab — без посилань)
- [ ] (E) Other (describe)

**Recommended answer(s):** (A)

**Why:** Хелпер уже є й протестований для обох провайдерів; (B) дублює код і ламає GitLab-репозиторії.

## 2. На який commit (sha) вести посилання викликача

Рядки викликачів беруться з індексу repo-intel, який будувався на `lastIndexedSha` (зазвичай голова default-гілки на момент індексації), а не на head PR. Файли-викликачі зазвичай не змінюються у PR, тож рядок збігається в обох, але не гарантовано.

- [ ] (A) `head_sha` PR (як у `FindingCard`) — простіше, клієнт уже має це значення
- [x] (B) `lastIndexedSha` з індексу — рядок гарантовано той, що порахував індекс; сервер додає його у відповідь
- [ ] (E) Other (describe)

**Recommended answer(s):** (A)

**Why:** Критерій приймання — «відкриває саме цей рядок у GitHub» у контексті PR; файли-викликачі поза diff, тож на head PR рядок той самий у 99% випадків, і не треба розширювати контракт ще одним полем. (B) точніший, якщо індекс відстає від PR.

## 3. Як передати `degraded` / `reason` у контракті

Zod-схема `BlastRadius` у `brief.ts` має лише `changed_symbols`, `downstream`, `summary` — полів для деградації немає, а P2 вимагає, щоб вони дійшли до UI.

- [x] (A) Додати в `BlastRadius` опційні `degraded?: boolean` і `reason?: enum(flag_off | index_failed | index_partial | repo_too_large | no_data)` у джерелі правди `server/src/vendor/shared`, скопіювати в `client/src/vendor/shared`
- [ ] (B) Не чіпати `BlastRadius`; роут повертає обгортку `{ blast: BlastRadius, degraded, reason }` (нова схема `BlastRadiusResponse`)
- [ ] (E) Other (describe)

**Recommended answer(s):** (A)

**Why:** Опційні поля зворотно сумісні, відповідь роута лишається «валідною за контрактом BlastRadius» (P2), і MCP віддає ту саму форму. (B) чистіше розділяє дані й метадані, але додає ще одну схему.

## 4. Які опційні (P3) частини включити в цю специфікацію

Можна вибрати кілька.

- [x] (A) Дерево зі згортанням/розгортанням символів
- [x] (B) Крони окремо від HTTP-ендпоінтів (окремі «пігулки» як на скріншоті)
- [x] (C) Сортування символів/викликачів за `rank`
- [x] (D) Кнопка «Resync» поруч із позначкою неповного індексу (`POST /repos/:id/resync`)
- [x] (F) Підписи лише з `client/messages/en/blast.json` (next-intl)
- [x] (G) Перемикач Tree / Graph і графовий вигляд
- [x] (H) Блок «Prior PRs touching these files»
- [ ] (E) Other (describe)

**Recommended answer(s):** (A), (B), (C), (D), (F)

**Why:** Це дешеві доповнення в межах того самого компонента й даних. (G) і (H) суттєво збільшують обсяг (граф — окремий layout-рендер; Prior PRs — нові виклики до GitHub/GitLab API, нова серверна логіка) — краще окремою специфікацією після здачі P1/P2.

## 5. Якщо Prior PRs все ж включаємо (4H) — підтримка провайдерів

Даних під `PrHistory` у стартері немає. Для GitHub — пошук закритих/змерджених PR, що змінювали ті самі файли (list commits by path → associated PRs); для GitLab — merge requests через commits by path. Це нові методи в обох адаптерах (`server/src/adapters/github/octokit.ts`, `server/src/adapters/gitlab/rest.ts`).

- [ ] (A) Не включаємо Prior PRs (див. п.4) — питання не актуальне
- [x] (B) GitHub і GitLab одночасно
- [ ] (C) Лише GitHub; для GitLab-репо блок прихований
- [ ] (E) Other (describe)

**Recommended answer(s):** (A)

**Why:** Опційна фіча з окремою інтеграцією в два API; якщо ж потрібна — (B), бо DevDigest офіційно підтримує обидва провайдери і інші фічі (посилання, PR-лінки) вже працюють для обох.

## 6. Формат відповіді MCP `get_blast_radius`

Інші інструменти в `mcp/src/server.ts` мають параметр `response_format` (стислий markdown за замовчуванням / JSON).

- [x] (A) Той самий патерн: `response_format` — `markdown` (стисле дерево: символ → викликачі `file:line` → ендпоінти/крони, + позначка degraded) або `json` (сирий `BlastRadius` з роута)
- [ ] (B) Лише сирий JSON із роута
- [ ] (E) Other (describe)

**Recommended answer(s):** (A)

**Why:** Відповідає правилам з лабораторної (стисла відповідь, мало токенів) і наявному стилю інших інструментів, а JSON-режим гарантує «ту саму карту, що в браузері».
