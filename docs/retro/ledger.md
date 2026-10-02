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
- Status: open
