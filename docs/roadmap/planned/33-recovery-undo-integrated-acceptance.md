<!-- plan id="33" status="planned" summary="Verify recovery, Undo, permissions and migration through browser and MCP journeys" -->
# Slice 33 — Recovery and Undo integrated acceptance

## Goal

Demonstrate the complete refactor against realistic persisted projects and both user interfaces.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§25–27 (all acceptance criteria); main §§54, 60, 62–63, 69, 75–79.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Depends on Slice 32. Expand the existing Archive/browser/MCP acceptance journeys and realistic seeds only where necessary; preserve seed validation and snapshots. Include old disposable tombstones, independently archived subtasks, rich text, cross-page reassignment, shortcut neighbors and archived ancestry.
- Trace every Refactor §26 criterion to a named automated assertion and browser/MCP observation in the active plan. Reopen a converted file and a file written after Undo; prove both Archive durability and bounded receipt behavior.
- Review the actual diff with correctness/spec and separate boundary reviewers. Audit single-source contracts, acyclic domain graph, no infrastructure imports, gateway-only components, token styles, injected Clock and commit-only publication.
- Reconcile main §§29–32, 54, 61–63, 69 and changed architecture four-file sets against delivered code; audit decision amendments, README/upgrade and MCP/milestone guides. Mark supplemental proposal status in its index with accurate implementation coverage, preserving the supplied source.
- Run the app on a realistic seed and real MCP client; record observed friction in .prototype/notes.json and update CURRENT_SLICE when each implementation phase starts. Close candidates through roadmap.mjs; update goals with evidence and remaining questions.

## Done when

All twelve Refactor §26 criteria have explicit passing evidence. Run pnpm test, pnpm lint, pnpm build, pnpm e2e and the affected host acceptance commands. Demonstrate failure injection and current permission revocation without data loss, source-ID integrity after deletion/Undo, and Archive restore versus neighbor-aware Undo. Log skipped or blocked checks honestly; do not close the refactor if any required acceptance remains unverified.

## Do not

- Add speculative Redo, an ArchiveItem aggregate, production persistence, retention products or unrelated UI polish. Friction outside this refactor becomes a later candidate.
