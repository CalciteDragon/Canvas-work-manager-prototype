<!-- completed-record id="28" closed="2026-09-13" summary="Imported the proposed refactor spec and reviewed five dependency-ordered implementation candidates" -->
# Slice 28 — Archive, removal and Undo planning

## Goal

Preserve the supplied proposed specification and produce a reviewed development sequence on a new branch, without implementing product changes.

## Spec sections

[Refactor §§1–29](../../specifications/archive-removal-undo-refactor-spec.md), especially §23 sequencing and §§25–27 acceptance; main §§8–15, 27, 29–32, 53–54, 57, 61–63, 69, 75–80. Follow AGENTS.md §3 and the documentation protocol §6.

## Build

Import the proposal unchanged, distinguish reference intent from current behavior, and stage slices 29–33 in dependency order. Use the existing Archive projection, keep a single capability source, place atomic inverse storage before hard deletion, and defer Redo/independent Archive storage.

## Done when

The new branch contains the identical supplied spec, reachable proposed-spec documentation, five linked planned candidates, a generated board and a review with no substantive unresolved planning findings. Documentation checks and lint pass.

## Do not

Implement application code, start the future candidates, adopt unresolved product choices, rewrite frozen records, or edit runtime data/CURRENT_SLICE for this documentation-only phase.

## Acceptance check

Compare SHA256 hashes of the supplied and imported spec; run node scripts/roadmap.mjs check, pnpm docs:check, pnpm lint and git diff --check. Inspect the diff for documentation-only scope and verify the branch name. Review candidates against Refactor §§25–27 and actual code. No browser/TDD product test is applicable because runtime behavior is unchanged; future candidates explicitly require those checks.

## File-level change list

| File | Responsibility |
|---|---|
| docs/specifications/archive-removal-undo-refactor-spec.md | Unchanged supplied proposed reference |
| docs/specifications/README.md | Provenance, status, numbered-reference convention and roadmap link |
| docs/documentation-protocol.md | Define proposed-reference home, separate from active plans/current architecture |
| docs/roadmap/goals.md | Requested direction, dependencies and activation gates |
| docs/roadmap/progress.md | Generated board |
| docs/roadmap/active/28-archive-removal-undo-planning.md | This phase, reviews and outcome; moved to completed at close |
| docs/roadmap/planned/29-recovery-policy-and-archive.md | Capability and projection candidate |
| docs/roadmap/planned/30-atomic-section-removal-undo.md | Persistence/executor and placement candidate |
| docs/roadmap/planned/31-disposable-removal-and-undo-ui.md | Safe deletion and browser Undo candidate |
| docs/roadmap/planned/32-section-edit-undo.md | Explicit add/move/settings candidate |
| docs/roadmap/planned/33-recovery-undo-integrated-acceptance.md | Whole-refactor verification candidate |

## Test plan — tests first

Use existing documentation structural/link/board checks, imported-source hash comparison and diff validation. No new tests for this reversible documentation-only change. Application tests and failure-first cases belong to each implementation candidate when activated.

## Boundaries touched

No code edges change. Plans preserve contracts as the sole shared shapes, domain policy and current grants, caller-owned UnitOfWork and injected Clock, acyclic service composition, MCP-to-domain and UI-to-gateway seams. Reuse ProjectArchiveService/ProjectArchiveItem and page-placements.ts; do not copy the proposal's illustrative paths blindly. Keep JSON infrastructure deliberately small.

## Explicit non-goals

No implementation, deployment or runtime seed manipulation. No product decision is represented as settled just because the supplied document recommends it. Future phases must append decisions/amendments and change implementation, tests and living docs together.

## Open questions

None block planning. Product choices are explicit activation gates in slices 29–32; if a gate changes scope, resolve it with the user before dependent implementation. Five-section candidate definitions are intentional under the repository protocol; file-level plans are written at activation.

## Revisions

- Initial repository-grounded draft: reuse the existing Archive projection; schedule Undo and placement before deletion; protect pre-archived row and shortcut references; keep proposed reference separate from shipped behavior.

- **Round 1 (2026-09-13):** Independent plan and diff review found no substantive findings after checking the proposal, current services, contracts and repository integrity. It confirmed coverage of pre-archived rows, shortcut references, permission failures and Undo-before-deletion ordering. The reviewer noted that goals must accurately reflect the active slice at delivery; closing this planning phase resolves that status.
- **Verification revision (2026-09-13):** The documentation checker found six main-spec links whose encoded ampersand did not resolve under its decodeURI behavior. Replaced the encoded ampersand with a literal one. Initial sandboxed dependency reads failed; reran required checks with access to the installed packages rather than changing dependencies.

## Outcome

**Deliverables** — Created branch `codex/archive-removal-undo-plan`, imported the [proposed specification](../../specifications/archive-removal-undo-refactor-spec.md) unchanged (matching SHA256), and staged five linked candidates in [goals](../goals.md). The generated board records them as planned, not implemented.

**Deliberate choices** — Reuse ProjectArchiveService/ProjectArchiveItem, preserve the shared ownership seam, and place atomic placement-aware Undo before hard deletion. Keep full implementation file/test plans for slice activation, as the documentation protocol requires. Product choices remain explicit gates; no product decision was adopted in this planning-only change.

**Deviations from the plan** — No runtime changes or application walkthrough: this phase changes documentation only. The proposed-reference index and protocol explicitly distinguish supplied source material from current architecture. The original proposal is preserved rather than rewritten to match illustrative code paths.

**Deferred** — Implementation is entirely in slices 29–33. Redo and first-class archive storage remain optional future work, not scheduled deliverables.

**Open questions** — Meaningful-content edge cases, Undo retention/actor ownership/conflicts and page fallbacks, shortcut cleanup and gesture boundaries are assigned to the relevant candidate's activation gates. None prevents this development roadmap being reviewed.

**Documentation updated** — Supplemental-spec index, documentation protocol, roadmap goals, this record, five candidates and generated progress. Existing architecture, main spec and old decisions remain unchanged because runtime behavior remains unchanged.
