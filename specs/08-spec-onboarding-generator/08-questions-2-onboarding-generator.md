# 08 Questions Round 2 – Onboarding Generator (late design)

Date: 2026-10-03 · Spec: [08-spec-onboarding-generator.md](./08-spec-onboarding-generator.md) · Design analysis: [08-design-analysis-onboarding-generator.md](./08-design-analysis-onboarding-generator.md) · Round 1: [08-questions-1-onboarding-generator.md](./08-questions-1-onboarding-generator.md)

> **Status.** Answered by user 2026-10-03. The spec is updated (revision 2, ACs tagged [R2-new]/[R2-changed]). `C#`/`G#`/`E#` refer to the design analysis.

---

## Q1: Structured run steps with copy buttons (C10, E22)

The mockup shows numbered commands with a copy button each. The spec says commands are text only.

- [ ] (A) Add `run_steps[] {command, note, source}`. A command is copyable only if it matches a collected fact verbatim (a script command, or `<pm> run <name>`). Others are dropped. The note is shown muted and is not copied.
- [ ] (B) Same as (A) but LLM-authored commands are allowed, with an "AI-written, check before running" warning.
- [ ] (C) No contract change. Keep the Markdown body and drop the copy buttons.

**Recommended:** (A). **Why:** copy-paste is how injected text reaches a terminal. Fact-verified commands keep AC-36's spirit and still match the design.
**Decision:** **(A)**, answered by user 2026-10-03. Optional field `run_steps[{command, note, source}]`; a command is copyable only if it exactly matches a collected fact (script command or `<pm> run <name>`); anything else is dropped; the note is muted and not copied. → AC-36, AC-40, AC-41, AC-43, AC-47; derived: `<pm>` from root lockfile (AC-8).

## Q2: First tasks as cards, and the complexity badge (C11)

- [ ] (A) Add `first_tasks[] {title, path}` (path validated like AC-21, directories allowed). No complexity badge.
- [ ] (B) Same as (A) plus optional LLM `complexity: low|medium|high`, hidden on skeleton tours.
- [ ] (C) No contract change. Render the Markdown list and ignore the card design.

**Recommended:** (A). **Why:** complexity is an unverifiable LLM guess the skeleton can't fill. Cards with a validated path get most of the design's value.
**Decision:** **(A)**, answered by user 2026-10-03. Optional field `first_tasks[{title, path}]`, path validated like AC-21 (directories allowed). No complexity badge: unverifiable and the skeleton can't fill it; the mockup's Low/Medium badge is explicitly dropped. → AC-26, AC-42, AC-46.

## Q3: Critical paths: file rows vs dependency chains (C8)

- [ ] (A) Render the section's validated `links[]` as rows `path — label`. Keep the chains in the body/diagram.
- [ ] (B) Change AC-12 to "≤ 5 critical files" instead of chains.
- [ ] (C) Render each chain as one row; no descriptions.

**Recommended:** (A). **Why:** no contract change, links are already validated, and the chains (the deterministic fact) are kept.
**Decision:** **(A)**, answered by user 2026-10-03 ("everything as on the mockup"). Rows `path — label` from validated `links[]`, each with an Open button; chains stay in body/diagram. → AC-44.

## Q4: The "Open" button target (C9, E24)

- [ ] (A) Open the provider blob URL at `indexed_sha` in a new tab (reuse `repoBlobUrl`). Hide the button when there is no provider or no SHA.
- [ ] (B) Drop "Open"; paths stay plain text.
- [ ] (C) Open the file in a new in-app file viewer (new feature).

**Recommended:** (A). **Why:** the helper already exists (Conventions, FindingCard), it costs no server work, and it pins the file to the version the tour describes.
**Decision:** **(A)**, answered by user 2026-10-03 ("everything as on the mockup"). Open goes to the GitHub/GitLab file at `indexed_sha` in a new tab via the existing `repoBlobUrl` helper; hidden when no provider/SHA (there is no in-app file viewer). → AC-45.

## Q5: "Share link" button (C3)

- [ ] (A) Drop it from the design.
- [ ] (B) Replace it with "Copy link" (copies the current page URL).
- [ ] (C) Real sharing (needs a sharing/auth model, which is a separate feature).

**Recommended:** (A). **Why:** DevDigest is local-first, so a localhost link shares nothing.
**Decision:** **(B), kept as "Share link"**, answered by user 2026-10-03 ("everything as on the mockup"). The button keeps the mockup label and copies the current page URL to the clipboard with a "Copied" confirmation and a manual-copy fallback. The local-first caveat remains (a localhost URL works only on the same machine); the user accepted the mockup knowing it. → AC-48, AC-49.

## Q6: Section headings source (C7)

- [ ] (A) Fixed i18n headings by `kind`, using the mockup wording ("Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"). They are used in cards, the TOC and the empty state. The LLM `title` is ignored.
- [ ] (B) Keep LLM/skeleton titles as built.

**Recommended:** (A). **Why:** stable TOC labels, one wording everywhere, and no untrusted text in headings.
**Decision:** **(A)**, answered by user 2026-10-03 (accepted recommendation). → AC-3, AC-39.

## Q7: TOC, collapsible cards, icons, layout (C4, C5, C6, C17)

- [ ] (A) Adopt all of them: a TOC with scroll-spy at viewports ≥ 1280 px (hidden below), collapsible cards (expanded by default, not persisted, `aria-expanded`, TOC click expands), one icon per kind, first-task cards wrapping to 1 column on narrow content. Mobile stays out of scope.
- [ ] (B) Adopt the cards and icons only; no TOC, no collapse.
- [ ] (E) Other

**Recommended:** (A). **Why:** client-only, no contract impact, matches the design. The breakpoint keeps narrow windows usable.
**Decision:** **(A)**, answered by user 2026-10-03 (accepted recommendation). → AC-46, AC-50, AC-51, NFR-6.

## Q8: Header subtitle (C13, E25)

- [ ] (A) "Generated from index of {files_indexed} files · generated {relative generated_at}". For skeleton tours without an index: "Generated without an index · {relative}".
- [ ] (B) Keep the static subtitle and the footer timestamp as built.

**Recommended:** (A). **Why:** honest numbers. The mockup's 12,450 cannot happen (5,000-file cap), and "last refreshed" was ambiguous.
**Decision:** **(A)**, answered by user 2026-10-03 (accepted recommendation). → AC-49.

## Q9: Placement of states not in the mockup (C20, C21, C22)

- [ ] (A) Page-level banners (status, partial, regeneration failed, generating, not cloned, load error) go under the header. The per-category "showing X of Y" and the ranking note go inside their card. The Outdated badge stays left of Regenerate. The cost footer stays under the last card.
- [ ] (B) Keep the current layout (all notes stacked above the sections).

**Recommended:** (A). **Why:** each note sits next to the data it qualifies, and AC-7/AC-37 are kept.
**Decision:** **(A)**, answered by user 2026-10-03 (accepted recommendation). → AC-7, AC-14, AC-16, AC-29, AC-37.

## Q10: Reading-path score display (C14)

- [ ] (A) Hide the numeric score (the order shows the ranking). Keep the 12-item cap.
- [ ] (B) Keep "score 0.0123" as built.

**Recommended:** (A). **Why:** the mockup omits it, and a raw PageRank value means nothing to a newcomer.
**Decision:** **(A)**, answered by user 2026-10-03 (accepted recommendation). → AC-53.

## Q11: Contract migration for stored tours (E27). Only applies if Q1 or Q2 adds fields.

- [ ] (A) The new fields are required. Old stored rows count as "no tour" (AC-3/E21), and the user regenerates.
- [ ] (B) The new fields are optional. The UI falls back to the Markdown body when they are absent.

**Recommended:** (B). **Why:** stored tours survive without a paid regeneration, and the fallback rendering already exists.
**Decision:** **(B)**, answered by user 2026-10-03. New fields are optional; old stored tours stay valid; the client falls back to the Markdown body when absent. → contract, AC-52, E27.

## Q12: Sidebar order and icon (C1, C2)

- [ ] (A) Pull Requests → Onboarding Tour → Project Context, with a graph/network-style icon from the existing set. Change it in the `@devdigest/ui` source of truth.
- [ ] (B) Keep it as built.

**Recommended:** (A). **Why:** cheap, matches the design, and a newcomer's first stop belongs near the top.
**Decision:** **(A)**, answered by user 2026-10-03 (accepted recommendation). Icon: a graph/network-style icon from the existing set, not `Lightbulb`. Edit target: the vendored `client/src/vendor/ui/nav.ts` (user-sanctioned). → AC-1.
