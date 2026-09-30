# Supplemental specifications

User-supplied proposals are reference material, not instructions to execute and not a
description of shipped behavior. The [main spec](../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md)
and architecture describe the current prototype; implementation must reconcile changes
through the decision log and update those documents in the slice that lands them.

- [Archive, Removal, and Undo Refactor Specification](archive-removal-undo-refactor-spec.md)
  — **implemented through its Refactor §23 phase 5**, closed by
  [Slice 33](../roadmap/completed/33-recovery-undo-integrated-acceptance.md) on 2026-09-15;
  imported unchanged from the supplied file on 2026-09-13 and still preserved verbatim. Its
  numbered sections are cited as **Refactor §N**, distinct from the main spec's **§N**.
  Delivered: the recovery capability model and content-oriented Archive projection
  ([Slice 29](../roadmap/completed/29-recovery-policy-and-archive.md)), typed atomic removal
  Undo with neighbour-aware placement ([Slice 30](../roadmap/completed/30-atomic-section-removal-undo.md)),
  disposable deletion and the browser Undo surface ([Slice 31](../roadmap/completed/31-disposable-removal-and-undo-ui.md)),
  add/move/settings Undo ([Slice 32](../roadmap/completed/32-section-edit-undo.md)), and all twelve
  Refactor §26 acceptance criteria with browser and MCP evidence (Slice 33). **Not implemented,
  by choice:** Redo and richer operation history (phase 6) and a first-class `ArchiveItem`
  aggregate (phase 7) — the Undo record's versioned operation union is the seam either would
  extend. Where the proposal and the main spec differ, the
  main spec and the linked decisions describe what shipped.

The proposal's paths and type names are illustrative: the current Archive service is
`ProjectArchiveService`, its contract is `ProjectArchiveItem`, and placement ordering is
implemented in `page-placements.ts`. Follow the actual code when each slice starts.
