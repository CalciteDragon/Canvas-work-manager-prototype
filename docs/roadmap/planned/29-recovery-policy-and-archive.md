<!-- plan id="29" status="planned" summary="Project meaningful recovery content through the existing Archive service while retaining integrity tombstones" -->
# Slice 29 — Recovery policy and content-oriented Archive

## Goal

Make Archive a useful projection of recoverable content without weakening row ownership.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§6–9, 14–16, 18–22, 25–27; main §§11–13, 27, 29–32, 54, 61.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Begin after planning Slice 28. Evolve `ProjectArchiveService` and `ProjectArchiveItem` in place; do not introduce a competing Archive service or duplicate contract. Keep root-tree origin, blockers, hidden-by-ancestor cases, independently archived rows and current grants.
- Extend the contracts capability source behind `SECTION_OWNERSHIP` / `ownedKindOf`; derive ownership helpers from it. A pure domain recovery policy combines capabilities with actual remaining content. Cover all seven registered types (including sub-projects) and conservative handling of unknown types/configs; never infer deletion eligibility from missing metadata.
- Gate before implementation: settle meaningful rich text (including whitespace/malformed config), unknown types, containers holding only pre-archived rows, and recovery guidance when their section entry would otherwise be hidden. A hidden tombstone must not strand an independently archived row. Record choices in a new decision and amend the existing archive/restore decision with a dated note.
- Keep tombstones and cascade markers. Reassignment already moves archived as well as live rows when live rows exist; preserve whole subtrees. Treat empty-after-reassignment differently from cascade. Expose recovery metadata through the existing host/MCP read and Archive store, not UI policy.
- Update main §§29–32 and contracts/domain/web-projects documentation with the landed projection semantics; update API/MCP docs if their public shape changes. Archive Restore keeps deterministic append placement, exact cascade membership and idempotency.

## Done when

Write failing policy/projection tests first for every Refactor §14 case, legacy view tombstones, unknown types, rich text and pre-archived-only containers. Domain/contract and web Archive tests demonstrate that disposable views are absent, notes/cascaded content remain recoverable, independently archived rows still have an actionable recovery path, and root/ancestor blockers plus minimal multi-grant checks are preserved. Run pnpm test, pnpm lint and an Archive browser/MCP pass with nested-projects-showcase, including a disabled Archive tab. This covers Refactor §26 criteria 1, 3–6 and the projection part of 10–11.

## Do not

- Hard-delete sections, persist undo, rename all archive APIs for terminology alone, hide archived projects or lose row-level recovery. Later slices own Undo and deletion.
