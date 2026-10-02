# specs/ — cross-module feature specs

Only specs whose feature **touches more than one module/package** live here (e.g. `server` + `client` + `mcp`).
A spec that stays inside one module goes to `docs/specs/` as before.

Layout: `NN-spec-<feature-name>/` (next free `NN` in this folder, lowercase-hyphen), containing:

| File | Purpose |
|---|---|
| `NN-spec-<feature>.md` | The feature spec (problem, goals, ACs in EARS, edge cases, NFRs, open questions) |
| `NN-questions-<N>-<feature>.md` | Clarification round N (blocking questions + answers) |
| `NN-design-analysis-<feature>.md` | Design/mockup analysis: gaps, uncovered edge cases, module interactions, UX proposals |

Written by the [specreator](../.claude/agents/specreator.md) agent; consumed by [implementation-planner](../.claude/agents/implementation-planner.md). Specs describe behavior, workflows and inter-service contracts — not implementation details. Long-lived architecture lives in `docs/`, not here.
