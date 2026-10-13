---
name: dependency-checker
description: "Audits every dependency of the DevDigest monorepo (server, client, reviewer-core, mcp, e2e, evals) and the links between its packages: draws a Mermaid dependency map, reports the installed size of each package, flags heavy / duplicated / outdated / vulnerable / unused / drifting dependencies, and ends with a prioritized action list. Use when the user asks to check, audit, review, visualize or slim down dependencies, 'what is heavy in node_modules', 'draw the dependency graph', 'which packages can we drop', 'dependency report', 'perевірити залежності' — even if they don't say 'audit'. Read-only: never edits package.json or lockfiles."
metadata:
  tags: dependencies, npm, pnpm, bundle-size, audit, mermaid, monorepo
---

## When to use

- Full dependency audit of the repo or of one package (`server`, `client`, …)
- "Draw the dependency map", "what weighs the most", "what can we remove/replace"
- Before adding a heavy dependency, or as a periodic health check

Not for: fixing code-level architecture violations (see `onion-architecture`, `ui-architecture`) or code vulnerabilities (see `security`).

## Rules

- **Read-only.** Never edit `package.json` or lockfiles (CLAUDE.md do-not-touch). Recommend commands; don't run installs/updates.
- Sizes come from the script, never guessed. If a package isn't installed (`installed: false`), say "size n/a — not installed", don't estimate.
- Network commands (`outdated`, `audit`) may fail offline — report the failure, don't hide it, and continue.
- Write the report in the user's language. Keep the section order below fixed.

## Workflow

1. **Collect** (deterministic):
   ```sh
   node .claude/skills/dependency-checker/scripts/collect.mjs . > <scratchpad>/deps.json
   ```
   Gives per package: manager, lockfile, internal links (tsconfig `@devdigest/*` paths), every dependency with kind / range / installed version / size in bytes / license / own-dep count, plus `shared` (deps declared in >1 package).
2. **Enrich** per package, using that package's manager (`pnpm` for server/client/evals, `npm` for reviewer-core/mcp/e2e)
   - Boundary imports: grep each package's `src` for relative imports that climb into a sibling package (`reviewer-core`, `server`, `client`). A package must reach another only through its alias/public entry (`@devdigest/*`), never by relative path into its `src/`.
   - `pnpm outdated --format json` / `npm outdated --json`
   - `pnpm audit --json` / `npm audit --json`
   - Unused: for each prod dep, `grep -rl "from '<name>'\|require('<name>')" <pkg>/src` (also check config files, scripts, `package.json` scripts/bins). Zero hits → *candidate*, not proof; say so.
3. **Analyse** using the rules in [references/analysis-rules.md](references/analysis-rules.md) (size tiers, flags, priority scoring).
4. **Report** in exactly the structure of [references/report-template.md](references/report-template.md).

## Output contract

Exactly these 5 sections, in this order, with these names. Write "none found" instead of skipping one.

1. **Scope** — which packages were analyzed (`client`, `server`, `reviewer-core`, `mcp`, `e2e`, `evals`), their manager, #prod / #dev deps, and what was *not* analyzed (e.g. not installed → size n/a). The repo is **not** a workspace: never describe packages as linked via `workspace:*` / pnpm workspaces.
2. **Dependency map** — fenced ```` ```mermaid ```` `flowchart`: (a) package-to-package links, drawing **internal** links (tsconfig path aliases like `@devdigest/shared`, relative imports) with a dashed edge and **external** npm deps with a solid edge; (b) per package, top-10 heaviest deps, label `name · 12.3 MB`, colored by size tier. Syntax per the `mermaid-diagram` skill.
3. **Size breakdown** — per package a table sorted by size desc (top 15 + "N more, X MB"): dependency · kind · version · installed size · % of package · tier. Real numbers only.
4. **Findings & Priorities** — every finding carries a tier **P0 / P1 / P2 / Info**, is grouped under those tier headings, and names a specific package + dependency/file + evidence. Categories: boundary violations, heavy, drift, outdated, vulnerable, unused candidate, misplaced, license. Removals/upgrades are *recommendations to confirm*, with the exact command — never executed.
5. **Summary** — 3–5 concrete takeaways ordered by priority, each naming a package/dependency and the action; then one line of method & limits (what ran, what failed, sizes are installed on-disk, not bundle).

Rules for the report: be specific ("`server/package.json`: remove `moment` — 0 imports in `server/src`"), never generic ("consider optimizing dependencies").

## Gotchas

- Packages are standalone (no workspace): the same dep appearing in several packages is real duplication, and version drift between them is worth flagging.
- `@devdigest/shared` / `@devdigest/ui` are vendored through tsconfig paths, not npm deps — they appear as map edges, not in size tables.
- `client/` runtime weight ≠ installed size (Next tree-shakes); label client findings "installed size" and only call something a bundle problem if it's imported client-side (`'use client'`).
- Dev tooling (`typescript`, `eslint`, `vitest`) is big on disk but costs nothing at runtime — don't rank it as P0 for size.
