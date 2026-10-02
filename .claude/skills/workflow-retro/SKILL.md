---
name: workflow-retro
description: Manual-only retrospective of a finished multi-agent workflow (e.g. /implement, specreator → planner → implementer → reviewer → verifier). Reports tokens, agent count and launch order, friction, duplicated work and gaps, proposes improvements, and appends a ledger entry to docs/retro/ledger.md. Run only when the user types /workflow-retro.
disable-model-invocation: true
---

# Workflow Retro

Manual trigger only. Never invoke from a hook, from `/implement`, or from another agent. If you were not explicitly asked, do nothing.

## Args

- (none) — **in-context** mode: use only what is already in this conversation.
- `deep` — also read the raw session transcript for exact numbers.

## Data sources

**In-context (default):** the conversation — Agent/Task calls, their prompts and returned reports, tool results, user corrections. Token numbers are only what the harness showed; otherwise mark `n/a`. Never invent figures.

**Deep:** transcript at `~/.claude/projects/<cwd with / → ->/<session-id>.jsonl` (newest file = this session; subagent transcripts sit in a sibling `<session-id>/subagents/` dir if present). Sum `message.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) per agent via `jq`; get launch order from the timestamps of `Agent` tool_use blocks. Report per-agent and total.

## Step 0 — close old proposals

Read `docs/retro/ledger.md`. For every entry with `Status: open`, ask the user (one grouped question) whether each was adopted, rejected, or still open. Update only that entry's `Status:` line (`adopted YYYY-MM-DD` / `rejected: <reason>`) — the single permitted edit to an older entry. Skip if there are no open entries or the ledger is empty.

## Collect

1. **Scope** — workflow name, goal, span (first → last step), outcome (done / partial / failed).
2. **Cost** — total tokens (in / out / cache), per agent if known; wall-clock if known.
   - **$**: tokens × the model's current rates (take rates from the `claude-api` skill; never from memory). Unknown model/rates → tokens only.
   - **Fix-loop share**: tokens of review → fix → re-review rounds and verifier-driven fixes ÷ total, vs. main implementation work. Show both percentages.
   - **Bottleneck**: agent with the largest share of tokens and of wall-clock; name it and say why (big reads, retries, long output).
3. **Agents** — table in launch order: `# | agent | task (1 line) | parallel with | tokens | result`.
4. **Friction** — per agent: what was hard (retries, failed commands, re-reads, clarifying questions, review/fix loops, user corrections).
5. **Smooth** — what went easily and why (clear plan, good skill, small scope).
6. **Duplication** — same files read by several agents, same context re-derived, overlapping findings between reviewer and verifier, plan restated in every prompt.
   - **File reads**: list files read by 2+ agents with a count (`path ×N — agents`). Deep mode: extract from `Read` tool_use blocks across subagent transcripts; in-context: from visible calls. Files ×3+ are candidates for a shared context digest — say so.
7. **Misses** — what slipped through: skipped spec items, issues found late (by verifier, not reviewer), missing tests, docs not updated, insights not captured.

Evidence rule: every friction/duplication/miss item cites where it was seen (agent + step, or file:line). No evidence → drop it.

## Propose

Not just analysis. End with ranked proposals (max 7), each: `change → expected effect → cost (S/M/L) → where` (agent prompt, skill, command, plan template). Consider: parallelizing independent steps, passing a shared context digest instead of re-reading, trimming agent prompts, cheaper model for mechanical steps, an earlier gate (verifier before reviewer?), a missing agent/skill, stop conditions for fix loops.

Also add any "what the skill itself could measure next time" suggestions only if concrete.

## Cross-ledger summary

When the ledger has ≥3 entries (including this one), add a **Recurring** section to the chat report: normalize friction/duplication/miss items across entries and list any that appear in ≥3 entries (or ≥2 of the last 3), with the dates. A recurring item means change the agent prompt/skill/plan template — make it the first proposal. Also flag proposals that stayed `open` across 3+ runs.

## Output

1. **Chat:** short report — summary line, cost ($, fix-loop share), bottleneck, agent table, top 3 friction, top 3 duplication/miss, proposals.
2. **Ledger:** append one entry to `docs/retro/ledger.md` (create with `# Workflow retro ledger` header if missing). Read the file first; if the same lesson is already recorded, reference it (`repeat of <date> <title>`) instead of restating. Never edit older entries (except the `Status:` line, see Step 0). Format:

```md
## YYYY-MM-DD — <workflow> — <goal in ≤8 words>
- Mode: in-context | deep · Outcome: done | partial | failed
- Cost: <total tokens, $ or n/a> · Fix-loop: <N%> · Bottleneck: <agent> · Agents: <N> (<order: a → b ‖ c → d>)
- Friction: <bullets with evidence>
- Duplication / misses: <bullets with evidence; files read ×3+>
- Proposals: <ranked bullets>
- Status: open   <!-- flip to adopted/rejected when acted on -->
```

3. **Module insights:** if an item is a durable codebase lesson (not a workflow lesson), do not put it in the ledger — hand it to the `engineering-insights` skill for the relevant module's `INSIGHTS.md`.
