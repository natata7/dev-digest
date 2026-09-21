# Insights — reviewer-core

Read before starting work here; append before finishing — see [`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) for the rubrics and the anti-vague test. Newest entry on top within each section. Append-only: correct a stale entry with a new dated note, never rewrite or delete it.

## Pattern

### 2026-09-21 — `INJECTION_GUARD` already named "derived intent/scope" as untrusted, before the Intent Layer existed
`reviewer-core/src/prompt.ts`'s `INJECTION_GUARD` constant already listed "derived intent/scope" alongside "the diff, PR title/description, code comments, README" in its untrusted-content enumeration, well before `PromptParts.intent`/`SCOPE_POLICY` were added for the Intent Layer feature. Confirms the prompt's security contract was designed to accommodate exactly this addition — the new `SCOPE_POLICY` block only needed to be explicitly SUBORDINATE to (never overriding) that pre-existing rule, not to invent a new injection-defense story. When adding a new untrusted prompt slot, check `INJECTION_GUARD`'s own wording first — it may already have been future-proofed for it.

## Mistake

## Decision

## Context

## Open Questions
