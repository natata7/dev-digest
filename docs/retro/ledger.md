# Workflow retro ledger

Entries appended by the manual `/workflow-retro` skill. Older entries are never edited.

## 2026-10-02 — /implement (multi-agent) — Project Context feature (spec 07)
- Mode: in-context · Outcome: partial (code done, UI not browser-verified, Step 7 docs skipped)
- Cost: ≈509k subagent tokens (in/out split n/a; orchestrator tokens n/a; $ n/a, no rates loaded) · Fix-loop: 23% review-driven (117k), 27% incl. verifier-found test fix, 42% incl. user-driven UI rework (77.6k) · Bottleneck: Step 6 client implementer (78.6k, 155 s) and UI-align rework (77.6k); verifier longest wall-clock (295 s, full suites) · Agents: 13 (S1 → S2 ‖ S3 ‖ S4 → S5 ‖ S6 → test-fix ‖ arch-review → fix-server ‖ fix-client → re-review → verifier → UI-align)
- Friction:
  - UI built from a text summary of the designs, image paths not passed to the Step 6 implementer; user had to say "я ж тобі давав дизайн", then a 77.6k rework (UI-align agent). No agent compared against mockups; verifier marked all UI "Not Verified".
  - Sidebar item first placed in SKILLS LAB following the user's text, but mockup 1 shows WORKSPACE; fixed only after the user's complaint.
  - Required `context_paths` on Agent/Skill DTO broke 9 client fixtures (Step 1 report) and `server/test/contracts.test.ts:193` (found late, by verifier, not by any implementer).
  - Parallel hand-off design forced a stub (`async () => new Map()`, Step 3) and a cross-module schema import (`ContextPathsBody` in context/effective.ts, Step 4) → 2 of 3 CONFIRMED review findings.
  - Step 2 implementer reported it did not read plan/spec/INSIGHTS; Step 4 only skimmed INSIGHTS.
  - Step 6 left 2 failing AgentEditor tests (asserted "Context" absent); needed an extra agent call.
- Duplication / misses:
  - server/INSIGHTS.md ×4 (S1, S3, S4, S5), client/INSIGHTS.md ×2 + client/AGENTS.md ×2, spec+plan ×~8 agents (from prompts; deep mode would give real read counts).
  - Missed: sidebar position, mockup mismatch (found by user), Step 7 docs, skill-level `used_by_agents`, `specs_skipped` absent in fallback trace, seed repo may lack `clone_path` (empty page) — unchecked.
- Proposals:
  1. UI-step prompts must include mockup image paths + "match mockup" checklist; add a browser/screenshot gate for client steps (S/M, /implement skill + implementer prompt) — avoids ~15% rework.
  2. After any shared-contract change: grep fixtures/tests parsing that DTO and run the affected hermetic tests in the same step (S, implementer prompt).
  3. Plan template: for parallel steps, name cross-module hand-offs up front (container getter, `_shared` schemas) so no stubs/inline `new` (S, implementation-planner).
  4. Require a "Read: plan/spec/INSIGHTS" line in every implementer report; reject otherwise (S, implementer prompt).
  5. Plan template: list edits to vendored files needing user decision before the run (S).
  6. Pass a short shared INSIGHTS digest instead of each agent re-reading (M).
- Status: adopted 2026-10-03

## 2026-10-03 — spec→plan→implement→test→verify (multi-agent) — Onboarding Generator (spec 08)
- Mode: in-context · Outcome: partial (code + tests green, 3 CSS ACs + NFR-1/2/6 + AI-content UI not verified, R2-S6 docs skipped, cross-model plan review skipped)
- Cost: ≈1,875k subagent tokens (in/out split n/a; orchestrator n/a; $ n/a — rates not loaded) · Fix-loop: ≈7% (132k: AC-4/33 fix, UI-gate fixes, AC-32 fix + tests) · Rework from late design: ≈53% (994k = whole rev 2) · Bottleneck: implementation-planner (187k + 172k = 19%, 532 s + 438 s wall-clock; big reads of code + restating the plan) · Agents: 29 (rev1: specreator → planner → S1 → S2 ‖ S6 ‖ S7 → S3 → S4 → arch ‖ test S5 ‖ test S8 → fix → verifier; rev2: design-analysis → spec → plan2 → S1 → S2 ‖ S4 ‖ S5 → S3 ‖ T1 → T2 → arch ‖ UI-gate → fix → tests → fix → verifier)
- Friction:
  - Never asked whether a design existed; specreator/planner reports and plan header said "design: none". User: "ти навіть не спитав чи є дизайн". Result: whole rev 2 (design analysis, spec rev 2, delta plan 172k, 7 impl/test agents). Repeat of 2026-10-02 "UI built without mockups".
  - Subagents cannot use AskUserQuestion (specreator hand-back, planner hand-back): all 6 clarification categories and D0–D17 were answered "by recommendation"; user only saw them at the approval gate.
  - Cross-model review of the plan, explicitly requested in the task, was never run (no tool for another vendor; `/implement` has no such gate).
  - `/implement` says "Don't commit" while the task asked for a commit per stage — resolved by manual commits between steps.
  - Dev-stack UI gate (96k) found 4 bugs typecheck/tests missed: duplicate POST, stuck "already generating" banner (found by a new test, fixed in a 3rd round), lowercase/raw-code banner copy, stray inline styles — all at the very end.
  - Verifier ran both full suites twice (76.8k, 73.1k); rev-1 validation file went stale and needed a second file.
  - Spec drift accumulates silently: D2 (maxRetries 0), D7 (dep cap), `isJunkPath` root dirs worked around in onboarding instead of fixed at source.
- Duplication / misses:
  - plan 1 ×~10 agents, spec ×~10, plan 2 ×~8, mockups ×4 (design-analysis, S5', UI gate, test T2 via spec), server/INSIGHTS digest passed by line range (helped); no shared digest for spec/plan (from prompts; deep mode would give real counts).
  - Missed: design question, cross-model review, NFR-1/2 measurements (no `factsMs` log), R2-S6 docs/INSIGHTS, real-LLM content verification (one real run → `llm_invalid_output` skeleton), spec not updated for D2/D7/D20.
- Proposals:
  1. specreator + implementation-planner step 1: ask first "is there a design/mockup/Figma?" via the orchestrator; no "design: none" without an explicit user answer (S, agent prompts) — repeat of 2026-10-02 #1, saves ≈50% rework.
  2. Orchestrator owns clarification: subagents return a numbered question list with recommendations, main asks via AskUserQuestion and resumes the agent with SendMessage (S/M, pipeline/command text).
  3. Add a plan-review gate before `/implement` (cross-model or second-model reviewer agent, or explicit "skipped by user") (S/M, command).
  4. Run the browser UI gate right after the first client step, not at the end, and again only on changed screens (S, /implement).
  5. Delta-plan mode for the planner: reuse unchanged tasks/decisions instead of re-reading everything (172k) (M, planner prompt).
  6. Shared spec/plan digest (≤150 lines) passed to implementers/test-writers instead of full files (M) — carried from 2026-10-02 #6.
  7. `/implement --commit` (commit per batch) so the command and "commit each stage" agree (S).
- Status: adopted 2026-10-03 (1,2 in specreator/implementation-planner prompts; 3,4,6,7 in /implement; 5 in planner Крок 0)
