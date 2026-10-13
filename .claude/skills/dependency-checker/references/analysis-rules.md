# Analysis rules

## Size tiers (installed size of one package, own files only)

| Tier | Size | Map color |
|---|---|---|
| XL | ≥ 50 MB | red `#f87171` |
| L | 10–50 MB | orange `#fb923c` |
| M | 1–10 MB | yellow `#facc15` |
| S | < 1 MB | green `#4ade80` |

Prod and dev are tiered the same, but prod findings weigh more (see scoring).

## Flags

| Flag | Rule |
|---|---|
| Heavy | tier L/XL **and** kind=prod, or any dep whose size > 30% of its package total |
| Drift | same dep in ≥2 packages with different `range` or installed `version` |
| Duplicate-role | two deps doing the same job in one package (two HTTP clients, two date libs, two validators) |
| Outdated | major behind = high, minor = low, patch = ignore |
| Vulnerable | from audit: critical/high = P0/P1; moderate/low = P2/P3 |
| Unused candidate | zero import hits in src, config, scripts |
| Misplaced | build/test/type-only tool in `dependencies`, or runtime import in `devDependencies` |
| License | anything not MIT/ISC/BSD/Apache-2.0/0BSD → mention |
| Boundary | relative import into another package's `src/` (e.g. `reviewer-core/src/pipeline.js`) instead of the `@devdigest/*` alias / public entry → P0 |
| Many transitive | `own_deps` ≥ 15 for a small-purpose lib |

## Priority scoring

| P | Criteria |
|---|---|
| P0 | critical/high vulnerability in prod dep; runtime dep imported but missing from package.json; boundary-violating import (see Boundary flag) |
| P1 | high vuln in dev dep; major-behind prod dep with known breaking security fix; unused prod dep ≥ 5 MB |
| P2 | prod Heavy with a viable lighter alternative; drift across packages; misplaced deps; unused < 5 MB |
| P3 | minor outdated; dev-only size; cosmetics |
| Info | license notes, healthy-but-notable facts (largest dev tools, vendored aliases) — no action required |

Within a tier, order by expected gain (MB removed or risk removed) ÷ effort. Every action needs an exact command, e.g. `cd server && pnpm remove <name>` — recommended, not executed.

## Alternatives — only suggest when you can name the concrete swap and why (e.g. "`mermaid` 76 MB: lazy-load via `next/dynamic` since it is client-only"). No "consider alternatives" filler.
