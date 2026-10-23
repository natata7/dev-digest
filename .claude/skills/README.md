# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [dependency-checker](dependency-checker/SKILL.md) | Shared | Read-only dependency audit: Mermaid map, installed sizes per package, outdated/vuln/unused/drift flags, prioritized actions |

## Provided by marketplace plugins

The SDD workflow and the architecture skills are no longer copied into this repository. They come from the `dev-digest-ai-marketplace` **stable** channel, pinned in `.claude/settings.json`:

| Plugin | Provides |
|--------|----------|
| `sdd-engineering` | `spec-creator`, `implementation-planner`, `implementer`, `plan-verifier`, `test-writer`, `doc-writer`, `/sdd-engineering:implement`, the write-guard hook, the `run` retrospective skill |
| `architecture-review` | `architecture-reviewer`, `onion-architecture`, `ui-architecture`, `pr-self-review` |
| `research-tools` | `researcher` |
| `engineering-paved-path` | `paved-path`, `engineering-insights` |

Installing `sdd-engineering` pulls in the other three as dependencies. Project-specific rules (module layout, do-not-touch files, verify commands) stay in `CLAUDE.md` and the per-package `AGENTS.md`; the plugins read them. Setup on a new machine:

```bash
CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 claude plugin marketplace add natata7/dev-digest-ai-marketplace#stable --scope project
```

The stable catalog pins release tags; to try a newer release use the `latest` catalog (`natata7/dev-digest-ai-marketplace`) explicitly.

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
