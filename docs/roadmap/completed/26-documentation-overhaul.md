<!-- completed-record id="26" closed="2026-09-10" summary="Living documentation tree and roadmap; Compodoc links and completion guards verified" -->
# Slice 26 — Documentation overhaul

## Goal
Finish and verify the requested documentation migration already present in the working tree.

## Spec sections
§75 workflow, §77 intent and verification, §78 decision history, §82 roadmap direction.

## Build
Retain the migrated architecture tree, decision index, guides, templates and historical records. Finish the roadmap Outcome guard and verify the tools.

## Done when
The lifecycle rejects an unwritten Outcome and accepts prose; no smoke records remain; documentation checks, Compodoc, lint and offline tests pass.

## Do not
No product behavior changes, historical rewrites, commits, pushes, or unrelated settings/store cleanup.

## Acceptance check
Run temporary slice 99 through new, start, refused complete, written Outcome, complete with explicit date; verify board, remove fixture and sync. Run roadmap check, docs check with and without API output, docs:api, lint and test. Validate Mermaid using the installed renderer if available. Review the migration diff and new files.

## File-level change list
- `scripts/roadmap.mjs`: use hasWrittenOutcome for completed-record validation and complete.
- `scripts/roadmap.test.mjs`: regression cases for template/empty/comment outcomes, section bounds, prose and completed-record validation.
- `package.json`: include root regression tests in test.
- `docs/roadmap/README.md`, `docs/documentation-protocol.md`: document written prose requirement.
- `docs/architecture/testing/overview.md`, `docs/architecture/testing/what.md`, `docs/architecture/testing/how.md`: root tooling test inventory and command.
- `docs/roadmap/active/26-documentation-overhaul.md` → `docs/roadmap/completed/26-documentation-overhaul.md`: review evidence and outcome.
- `docs/roadmap/progress.md`: generated board.
- Retained migration: `AGENTS.md`, `README.md`, specification, `.gitignore`, `pnpm-lock.yaml`, `tsconfig.compodoc.json`, `apps/web/.storybook/main.ts`, `scripts/check-docs.mjs`, `docs/architecture/**`, `docs/templates/**`, `docs/decisions/**`, `docs/guides/**`, `docs/roadmap/**`, deletion of `development.md`. Review corrections stay on these documentation surfaces.

## Test plan — tests first
Node:test without dependencies: first prove parseEntry incorrectly accepts a template-only completed record. Cover absent/empty Outcome, untouched template, comments and subheadings, prose outside section and real prose. CLI smoke proves refusal leaves state intact and successful completion updates board.

## Boundaries touched
Documentation and root tooling only; no domain, UI, contract, MCP or design-token changes.

## Explicit non-goals
No seed mutation, CURRENT_SLICE change or product browser journey: actual-use acceptance is the roadmap CLI and generated documentation. No new product decision. No optional launch-config cleanup.

## Open questions
None; leave uncommitted per user handoff.

## Revisions
**Round 1 (2026-09-10):** Reviewer found no blocking scope/spec gaps; requested explicit empty-Outcome/next-section coverage. Added that case and watched the completed-record regression fail for the intended reason. The section-bound case already passes. Migration predates this continuation; earlier review/TDD history is unavailable and is not claimed.

**Round 2 (2026-09-10):** Plan re-review found no remaining substantive issues. Diff review found 25 Compodoc links targeting the wrong symbol category and missing built-anchor validation. Added `scripts/check-docs.test.mjs` (watched it fail on the missing guard), extended `scripts/check-docs.mjs` to verify anchors and normalize resolved API paths, and corrected links against generated output. Prose fixes cover the host seeding/default path, localhost/temp-file test usage, service composition and system count. Testing overview/what/how and protocol reflect the added regression. No product behavior changed.

## Outcome
**Deliverables** — The [architecture tree](../../architecture/overview.md), [documentation protocol](../../documentation-protocol.md), [decision index](../../decisions/README.md), [guides](../../guides/mcp-setup.md), Compodoc configuration and [roadmap](../README.md) now form the living documentation entry path. Thirty-one historical records retain their original narrative; seven candidates remain planned. The roadmap refuses template-only Outcomes in both completion and validation. Twenty-five Compodoc links now point to their actual generated anchors, and the checker verifies those anchors.

**Deliberate choices** — Preserve historical evidence and the user-requested uncommitted state. Use Node's built-in test runner for the two small tooling regressions. The generated-anchor case explicitly skips if Compodoc has not been built; it ran and passed here. Source-only validation remains available without generated output. This documentation continuation changes no product behavior and answers no new product question.

**Verification** — The CLI lifecycle refused the empty Outcome without moving the active file, accepted written prose, recorded the explicit closing date and summary on the board, and left no slice-99 files after cleanup. Both built and source-only documentation checks pass (18 system folders). Compodoc builds successfully. All 1,727 workspace tests passed, as did all eight root regression cases. Full lint and diff whitespace checks passed. Initial dependency access failures under the sandbox were resolved by rerunning the affected commands with approved access. Final subagent review found no substantive remaining issues.

**Deviations from the plan** — Review expanded the guard fix to generated-anchor validation and corrected inaccurate prose about first-run seeding, default data paths, service composition and localhost/temp-file tests. This was a continuation of an already-written migration; no earlier TDD or review history is claimed. Product browser/MCP journeys and seed mutation were unnecessary for this documentation-only phase; the actual-use check was the roadmap CLI and generated reference.

**Deferred** — Optional Mermaid rendering was not performed: no local Mermaid renderer was available. Diagram syntax was inspected during review, which is not a render check. Unrelated launch configuration, local settings and the pnpm store remain untouched. No feature candidate was started.

**Open questions** — None blocking closeout. The roadmap's product direction remains use of the prototype.

**Documentation updated** — Root entry/quickstart, spec workflow/roadmap pointers, all architecture folders, decision index and migration links/banners, moved guides, roadmap and templates; continuation corrections touch the system root, domain, testing, Compodoc-linked how pages and protocol.
