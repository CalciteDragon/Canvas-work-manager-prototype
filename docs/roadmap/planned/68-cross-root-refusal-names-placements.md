<!-- plan id="68" status="planned" summary="A refused cross-root move names each blocking shortcut's canvas and source section, so an agent or person can remove it in one step" -->
# Slice 68 — Cross-root move refusal names each placement

## Goal

When moving a project to another root is refused because a shortcut would cross root trees, the
refusal names where each blocking placement lives and what it points at. A person or an agent can
then remove it in one step, without searching the tree.

**Source.** Friction note `note-2026-10-03-002` (Slice 65 real use through HTTP MCP).
- Today the refusal is: `shortcut "shortcut-…" would cross root trees; remove that placement
  first`.
- Since [Slice 65](../completed/65-work-canvas-shortcuts.md), the blocking placement can sit on the
  mover's own Work canvas or anywhere else in the tree. An agent had to list shortcuts project by
  project to find it.

## Spec sections

- **§§26–27:** project hierarchy, and shortcuts across a root tree.
- **§54:** MCP refusals a text-only client can act on.
- **§61:** HTTP rule errors.
- **§77, §79:** real use and friction.

## Build

- **The message.** `ProjectService.assertNoShortcutCarriedAcrossRoots`
  (`packages/domain/src/project-service.ts`) builds the message from data the check already reads.
  For each placement it names:
  - the shortcut id;
  - the **destination** project and page;
  - the **source** section's name (`nameOf`) and its owning project.

  It ends with the repair, for example: remove the shortcut from that page, then retry the move.
  The wording stays surface-neutral (AGENTS §1): it names no UI control or MCP tool.
- **One shared sentence.** The history executor gives the same refusal for Undo and Redo of a move
  (`project-history.ts`). Both should produce one sentence from one helper, rather than two copies.
- **Several placements.** Keep the message bounded: name up to three placements, then "and N
  more".
- **Tests.**
  - Domain tests: one placement on the mover's own Work canvas; one on another canvas in the old
    root; several placements.
  - The MCP `update_project` refusal text in `mcp-acceptance.mjs` (both transports).
  - An HTTP route test.

## Done when

- **Through MCP, on a scratch `nested-projects` copy:** an agent places a shortcut to Garden's
  brief on Cabinets' Work canvas. It then calls `update_project` to move Cabinets to a new root.
  The refusal names Cabinets' Work page as the placement's canvas and Garden's brief as its source.
  - The agent removes exactly that shortcut, using the id in the message, and the retried move
    succeeds. No `list_section_shortcuts` call is needed.
  - The same sentence appears for a refused Undo/Redo of a move.
- **Atomicity.** The refusal still writes nothing.
- **Gates.** `pnpm test`, `pnpm lint` and `mcp-acceptance` pass, and real use is recorded.

## Do not

- Change when a move is refused (the both-ends rule from Slice 65), or add an automatic "remove and
  move" path.
- Add a new error type, error code or structured payload. This slice is about wording.
- Name a UI control or MCP tool in the domain message.
