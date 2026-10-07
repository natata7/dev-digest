# 08 Questions Round 1 – Onboarding Generator

Date: 2026-10-02 · Spec: [08-spec-onboarding-generator.md](./08-spec-onboarding-generator.md)

> **Status of answers.** `AskUserQuestion` was not available in the session that wrote this round, so every
> question below was **decided by recommendation, pending user veto**. The chosen option is marked `[x]`.
> To veto, change the mark (or write your option in (E)) and the spec will be updated in round 2.

Questions are grouped by the six clarification categories: (1) scope / what "onboarding" means,
(2) very large repositories, (3) what is shown without a full clone, (4) data / contracts,
(5) failure / degraded states, (6) security / untrusted text / cost.

---

## Category 1 — Scope: what "onboarding" means in DevDigest

### 1.1 What is "onboarding" here?

Today `/onboarding` is the **Add repository** screen (`client/src/app/onboarding/page.tsx`), while the sidebar
already has an unused "Onboarding Tour" label (`shell.json` → `nav.onboarding-tour`), a `FeatureModelId`
`onboarding` ("Writes the per-repo onboarding tour"), an `onboarding` DB table (one row per repo) and an
`Onboarding` Zod contract.

- [x] (A) A **per-repository tour** for a developer new to that repo, on a repo-scoped page (`/repos/:repoId/onboarding`). The app's first-run "Add repository" flow at `/onboarding` stays as is.
- [ ] (B) The app's first-run flow (connect GitHub, add repo) extended with a tour.
- [ ] (E) Other

**Recommended:** (A). **Why:** every existing asset (feature model, table, contract, nav label) already describes a per-repo tour; (B) is a different feature.
**Decision:** (A) — decided by recommendation, pending user veto.

### 1.2 Which five sections?

Existing copy (`client/messages/en/onboarding.json`) promises "overview, architecture, key modules, getting
started, conventions & gotchas"; the existing prompt template names `routes_and_apis`. The request names
other five.

- [x] (A) The requested five, in this order: `architecture` (overview), `critical_paths`, `local_run`, `reading_order`, `first_tasks`. Existing copy is updated to match.
- [ ] (B) Keep the existing five from the copy.
- [ ] (E) Other

**Recommended:** (A). **Why:** it is the feature definition; the old copy is starter placeholder text.
**Decision:** (A) — decided by recommendation, pending user veto.

### 1.3 When is a tour generated?

- [x] (A) **On demand** (Generate / Regenerate button). The latest tour per repo is stored and re-shown without new LLM calls. No automatic generation after clone/index.
- [ ] (B) Automatically after every successful index.
- [ ] (E) Other

**Recommended:** (A). **Why:** (B) spends an LLM call per re-index for a page that may never be opened.
**Decision:** (A) — decided by recommendation, pending user veto.

### 1.4 Which surfaces are in scope?

- [x] (A) Server (facts + generation + API) and client (tour page + nav entry) only. MCP tool and the Settings "Sync generated docs to a folder" behaviour are **out of scope**.
- [ ] (B) Also an MCP `get_onboarding_tour` tool.
- [ ] (C) Also write the tour as a Markdown file into the repo folder when "Sync generated docs" is on.
- [ ] (E) Other

**Recommended:** (A). **Why:** keeps one feature per spec; (B)/(C) are cheap follow-ups once the contract is stable.
**Decision:** (A) — decided by recommendation, pending user veto.

### 1.5 Where do "first tasks" come from?

- [x] (A) The LLM proposes 3–5 starter tasks grounded in the collected facts (each citing real paths/scripts). No issue-tracker (GitHub/GitLab issues) lookup.
- [ ] (B) Fetch "good first issue" issues from the code host.
- [ ] (E) Other

**Recommended:** (A). **Why:** (B) adds a new code-host integration in two adapters; the facts already give enough material.
**Decision:** (A) — decided by recommendation, pending user veto.

### 1.6 Sidebar highlight collision

`activeKeyFor()` maps any path containing `/onboarding` to `onboarding-tour`, so the Add-repo page would light
up "Onboarding Tour".

- [x] (A) Only `/repos/:repoId/onboarding` activates "Onboarding Tour"; `/onboarding` (Add repo) activates no repo nav item.
- [ ] (B) Leave as is.

**Recommended:** (A). **Why:** otherwise the nav lies about where the user is.
**Decision:** (A) — decided by recommendation, pending user veto.

---

## Category 2 — Very large repositories (caps / sampling)

Repo-intel already caps the index at 5,000 files (`MAX_INDEXED_FILES`, first N by walk order), 400 KB per file
and a ~110 s soft budget; overflow finishes as `partial`.

### 2.1 How are tour inputs bounded?

- [x] (A) **Fixed deterministic caps, no random sampling**: reading path 12 files; critical paths ≤ 5 chains (repo-intel default); routes ≤ 50 (by file rank); scripts ≤ 30; structure ≤ 40 directory entries, depth ≤ 2; README excerpt ≤ 4,000 chars; the whole serialized fact payload ≤ 12,000 estimated tokens (chars/4). Each truncated category is flagged and the tour shows "showing X of Y".
- [ ] (B) Random/stratified sampling of files.
- [ ] (C) No caps.
- [ ] (E) Other

**Recommended:** (A). **Why:** determinism makes facts testable and the skeleton reproducible; rank order keeps the most important items.
**Decision:** (A) — decided by recommendation, pending user veto.

### 2.2 Repos over the 5,000-file index cap

- [x] (A) Use whatever the index holds (status `partial`), generate normally, and show "Based on N indexed of M files — index is partial".
- [ ] (B) Refuse to generate.
- [ ] (E) Other

**Recommended:** (A). **Why:** a partial tour with an honest note is more useful than none; the cap is already enforced upstream.
**Decision:** (A) — decided by recommendation, pending user veto.

### 2.3 Multi-package repos and non-JS stacks

repo-intel parses only `.ts/.tsx/.js/.jsx/.mjs/.cjs`.

- [x] (A) Stack/scripts are read from the root manifest plus up to 10 nested `package.json` files at depth ≤ 2; other ecosystems are **detected by manifest presence only** (`go.mod`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`, `Dockerfile`, `docker-compose.yml`, `Makefile`). Graph-based facts (reading path, critical paths, routes) exist only for indexed JS/TS files.
- [ ] (B) Parse manifests of every ecosystem.
- [ ] (E) Other

**Recommended:** (A). **Why:** matches what repo-intel actually indexes; full multi-ecosystem parsing is a separate effort.
**Decision:** (A) — decided by recommendation, pending user veto.

---

## Category 3 — What is shown without a full clone

Clones are **always shallow** (`CLONE_DEPTH = 1`), so there is no git history and repo-intel stores
`hotness = 0` for every file (rank = PageRank only, "Option B" in `pipeline/rank.ts`).

### 3.1 Hotness in the reading-path formula

- [x] (A) Score = `rank × (1 + hotness)` with hotness normalized to [0, 1]. While hotness is unavailable (always, today) the score equals PageRank, and the tour says "Ranked by import graph only — no git history in the shallow clone". No clone deepening in this feature.
- [ ] (B) Deepen the clone (e.g. 180 days) to compute real hotness.
- [ ] (E) Other

**Recommended:** (A). **Why:** keeps the intended formula so hotness switches on later with no behavior change; (B) changes clone/index cost for every repo.
**Decision:** (A) — decided by recommendation, pending user veto.

### 3.2 Repo not cloned yet (or clone failed)

- [x] (A) No generation and no LLM call: the page shows "Repository is not cloned yet" with Generate disabled. No fallback to code-host APIs (README/languages via GitHub API).
- [ ] (B) Build a thin tour from code-host APIs.
- [ ] (E) Other

**Recommended:** (A). **Why:** all facts come from the clone/index; a code-host fallback is a second data path for a transient state.
**Decision:** (A) — decided by recommendation, pending user veto.

### 3.3 Clone present but index not usable (none / degraded / failed / repo-intel flag off)

- [x] (A) Deterministic **skeleton only, no LLM call**: clone-file facts (stack, structure, scripts, env var names) are filled; graph facts (reading path, critical paths, routes) are shown as "unavailable — index <status>" with a Resync action.
- [ ] (B) Still call the LLM with clone-only facts.
- [ ] (E) Other

**Recommended:** (A). **Why:** matches the stated design ("index degraded → skeleton"), saves cost and avoids an LLM tour without graph grounding.
**Decision:** (A) — decided by recommendation, pending user veto.

### 3.4 Index `partial`

- [x] (A) Generate with the LLM on partial facts; the tour carries status `partial` and an honest note.
- [ ] (B) Treat as degraded (skeleton only).

**Recommended:** (A). **Why:** partial usually means "5,000-file cap or time budget hit"; most graph data is still present.
**Decision:** (A) — decided by recommendation, pending user veto.

---

## Category 4 — Data / contracts

### 4.1 Contract shape

The existing `Onboarding` contract is `{ sections: OnboardingSection[] }` with free-string `kind`.

- [x] (A) Extend it (source of truth `server/src/vendor/shared`, mirrored to client): `kind` becomes an enum of the five sections; add tour-level `status` (`complete` | `partial` | `skeleton`), `reason` (nullable), `generated_at`, `indexed_sha`, `coverage` (index status, files indexed/skipped, truncation flags), `ranking_basis` (`pagerank` | `pagerank_hotness`), `model`, `tokens_in`, `tokens_out`, `cost_usd` (nullable), and `regeneration_error` (nullable). Each section has `source` (`llm` | `facts`).
- [ ] (B) New separate contract and table.
- [ ] (E) Other

**Recommended:** (A). **Why:** reuses the existing contract, table and client wiring; fields are additive.
**Decision:** (A) — decided by recommendation, pending user veto.

### 4.2 Who decides the reading-order file list?

- [x] (A) The file list and its order are **deterministic** (from facts). The LLM may only add a one-line "why read this" per listed file; any file it adds or reorders is ignored.
- [ ] (B) The LLM picks the reading order from candidates.

**Recommended:** (A). **Why:** the reading path is the feature's grounded core; it must be identical with or without the LLM.
**Decision:** (A) — decided by recommendation, pending user veto.

### 4.3 Persistence and history

- [x] (A) One stored tour per repo (existing `onboarding` table, PK `repo_id`), replaced on successful regeneration. No version history.
- [ ] (B) Keep every generated version.

**Recommended:** (A). **Why:** a tour is a snapshot of "now"; history has no stated user need.
**Decision:** (A) — decided by recommendation, pending user veto.

### 4.4 Generation request model

- [x] (A) Synchronous `POST` returning the tour (the LLM call is bounded at 90 s); a second generate for the same repo while one is running gets 409.
- [ ] (B) Background job + polling.

**Recommended:** (A). **Why:** one bounded call fits a request; conventions extraction already works this way. Revisit if timeouts appear.
**Decision:** (A) — decided by recommendation, pending user veto.

### 4.5 Staleness

- [x] (A) The tour stores the index SHA it was built from; when the repo's current `lastIndexedSha` differs, the page shows an "Outdated — index has moved since this tour" badge next to Regenerate. No auto-regeneration.
- [ ] (B) No staleness signal.

**Recommended:** (A). **Why:** cheap and honest; the SHA is already in `IndexState`.
**Decision:** (A) — decided by recommendation, pending user veto.

---

## Category 5 — Failure / degraded states

### 5.1 LLM failure (provider error, timeout, schema-invalid output, no API key)

- [x] (A) If **no complete/partial tour exists**: store and show the deterministic skeleton with `status: skeleton` and the reason. If **one already exists**: keep it unchanged and return it with `regeneration_error` (reason), shown as a banner "Regeneration failed (<reason>) — showing the tour from <date>".
- [ ] (B) Always replace the stored tour with the skeleton.
- [ ] (E) Other

**Recommended:** (A). **Why:** a transient provider error must not destroy a good tour, yet the failure stays visible.
**Decision:** (A) — decided by recommendation, pending user veto.

### 5.2 Partially valid LLM output

- [x] (A) Validate per section: a section missing from the output is filled from the skeleton (`source: facts`); links to paths not in the facts are dropped; a diagram that fails to render is hidden with no error. Retries: none (still exactly one LLM call).
- [ ] (B) Reject the whole output and fall back to the full skeleton.

**Recommended:** (A). **Why:** keeps good sections; a retry would break the "one LLM call" budget.
**Decision:** (A) — decided by recommendation, pending user veto.

---

## Category 6 — Security / untrusted text / cost

### 6.1 Which repo text may reach the prompt?

- [x] (A) Collected facts (paths, manifest names/dependencies, script names and commands, endpoint strings) + README excerpt (≤ 4,000 chars) + environment variable **names only** from `.env.example` / `.env.sample` / `.env.template`. Never read `.env`, `.env.local` or other non-template env files; never include values. All of it is wrapped as untrusted data under the existing injection guard.
- [ ] (B) Facts only (no README, no env names).
- [ ] (E) Other

**Recommended:** (A). **Why:** README and env names are the best grounding for "local run"; values may be secrets.
**Decision:** (A) — decided by recommendation, pending user veto.

### 6.2 How is LLM output treated?

- [x] (A) As untrusted: Markdown rendered without raw HTML; mermaid rendered in the existing safe component; links limited to repo-relative paths present in the facts; commands are shown as text and never executed by DevDigest.
- [ ] (B) Trust output.

**Recommended:** (A). **Why:** output may echo injected repo text.
**Decision:** (A) — decided by recommendation, pending user veto.

### 6.3 Cost visibility and limits

- [x] (A) Exactly one LLM call per Generate/Regenerate, zero on view; model from Settings → Feature Models (`onboarding`); output capped at 4,000 tokens; tour footer shows model, tokens in/out and cost (or "cost unknown").
- [ ] (B) No cost display.

**Recommended:** (A). **Why:** cost already flows through structured-call results; showing it keeps spend honest.
**Decision:** (A) — decided by recommendation, pending user veto.

### 6.4 Language of the tour

- [x] (A) English only (the client ships only the `en` locale); identifiers, paths and commands verbatim.
- [ ] (B) Follow a workspace language setting.

**Recommended:** (A). **Why:** no other locale exists in the client.
**Decision:** (A) — decided by recommendation, pending user veto.
