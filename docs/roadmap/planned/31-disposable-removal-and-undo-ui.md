<!-- plan id="31" status="planned" summary="Safely delete disposable sections and expose receipt-driven Undo through the gateway and canvas" -->
# Slice 31 — Disposable removal and immediate Undo UI

## Goal

Remove disposable sections safely while giving users an immediate, server-backed Undo action.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§7–9, 14–16, 21–23, 25–27; main §§8–11, 19–21, 27, 31–32, 54, 61–63.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Depends on Slice 30's committed inverse capture and tested executor. Apply recovery policy in SectionService: delete known disposable views, empty rich text and truly empty reassigned containers only when all canonical references are safe; retain content-bearing sections and necessary integrity tombstones.
- Audit `data-store.ts` validation and `SectionRepository.remove`, including sectionId, archivedWithSectionId, archivedWithTaskId and shortcut source IDs. Gate before implementation: choose shortcut cleanup versus a retained integrity tombstone; snapshot any removed shortcut placement in the same operation so Undo restores the whole action. Never relax integrity or silently delete archived rows.
- Complete the removal/Undo receipt API and gateway integration together, including fake/test gateways. UI stores consume receipts; never reconstruct inverse state or decide retention. Update SectionRemovalDialog consequence copy and the existing Archive presentation.
- Add an accessible project-scoped Undo action after successful removal, handle pending/failure/consumed/expired/conflict/partial states, and invalidate affected project/root views. Guard identity, navigation generation and live-write races. Failed remove produces no success action; failed Undo remains intelligible and retryable when appropriate.
- Gate before implementation: settle how long and where the action remains visible across page/project/persona changes. Keep receipt delivery in mutation responses unless evidence warrants another path; never broadcast private inverse state.
- Update web/core, web/projects, host/API, repositories and domain documentation, public comments and applicable main spec sections; amend old 'nothing deletes'/'Archive is undo' decisions only with the corresponding code.

## Done when

Tests first enforce the full removal matrix against persisted state as well as Archive output, including pre-archived rows and shortcuts. Browser tests show Progress/Timeline/Recent Activity and empty rich text removed, absent from Archive, then restored with config and placement by Undo; meaningful rich text and cascade recover durably; reassign-all leaves no empty Archive entry and Undo reverses all moved rows. Exercise failure injection, keyboard/touch focus, persona/navigation races and live refresh. Run pnpm test, pnpm lint, pnpm e2e and MCP mutation/undo acceptance. This completes Refactor §26 criteria 1–11 for removal.

## Do not

- Purge existing tombstones wholesale, delete content to make integrity pass, expose storage policy in components, add global history UI or Undo for shortcut-only actions (source-removal side effects remain included).
