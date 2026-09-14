# Contextual insertion remembers its target and creates in one positioned write

**Question**

How does a person insert a section or Home shortcut between existing placements without
creating it at the end first? Grid gaps also need a meaning that preserves the ordered, wrapping
layout in §27 rather than introducing fixed cells.

**Options tested**

- *Create at the end, then move*: rejected. It takes two writes and can leave the placement at the
  wrong position if the second write fails.
- *Pass the visible numeric index from the popup*: rejected. A frame can move while the popup is
  open, making the remembered number refer to a different place.
- *Resolve a stable before-ID at submit and send one optional position*: chosen. The domain
  creates at the requested position and renumbers the combined order as part of that operation.
- *Treat each empty Grid area as a reserved cell*: rejected. Grid is still an ordered, wrapping
  sequence; a gap is an insertion opportunity, not a persisted coordinate.

**What we learned**

Section and shortcut creation both operate on the page's combined section/shortcut order. The
create inputs carry an optional `position`; the domain clamps it to the current sequence and
densely renumbers the result inside the existing unit of work. This keeps default append behavior
for callers that omit the field and lets HTTP and MCP share the same contract.

The canvas remembers a placement ID (`beforeId`) rather than a numeric index, then resolves that
ID against the latest loaded order when the user submits. If the anchor disappeared, creation
returns an error and keeps the dialog open rather than silently appending somewhere else. Grid-gap
targets are calculated from the current wrapping spans and are offered only when a supported
width fits; the initial width is the widest supported span that fits. That selected span is
retained if neighboring placements change while the dialog is open; it is not silently refitted
to a new gap.

**Current decision**

The domain accepts optional `position` for section and shortcut creation and performs insertion
and dense combined-order renumbering in the same domain operation. The UI captures an insertion
anchor by `beforeId` and resolves its current position at submit. An unavailable anchor is a
visible failure. Grid gaps are transient insertion targets within the existing order, never
reserved cells or absolute coordinates. The supported span chosen when a gap is selected is
preserved through submit even if nearby spans change.

**Confidence**

High for atomic domain placement and stable UI anchoring: both avoid partial creates and stale
indices. Medium for retaining a chosen gap width across neighbor changes; it preserves the user's
selection, though the resulting visual gap can differ from the one first selected.

**Revisit when**

Use of real, mixed-width Home canvases shows that a remembered gap becoming visually different is
confusing, or that callers need a different insertion contract than one optional ordered position.

**Amended, 2026-09-13.** A positioned insert shifts its siblings' `position` without changing
their `updatedAt`. Renumbering is not an edit: only a move's own subject is marked updated, so
`updatedAt` keeps meaning "last edited" for every placement a neighbour's write displaces.
