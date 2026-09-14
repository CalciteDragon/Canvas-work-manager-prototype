# Home orders sections and shortcuts together

**Question**

How should a Home canvas position its own sections alongside references to sections elsewhere in
the root tree?

**Options tested**

- *Keep dense positions in separate section and shortcut bands*: rejected. A section at position
  1 and a shortcut at position 1 cannot express which one is first, and it contradicts §27's
  statement that a shortcut sits in the canvas like anything else.
- *Use one combined sequence for every page placement*: chosen.

**What we learned**

Position arithmetic has to see both collections. A small domain helper can list and renumber a
page's `ProjectSection` and `SectionShortcut` records through repository interfaces, without a
new service edge. `SectionService` therefore receives the shortcut repository and uses the same
helper for add, move, duplicate, remove and restore; `SectionShortcutService` uses it for create,
move and remove.

The browser also needs one owner. `ProjectPageStore` already owns one page's generation guards,
quiet refreshes, optimistic reorder and write deferral, so it owns both arrays and exposes a
combined `placements()` signal. `ShortcutStore` is limited to the picker source read.

The 25.8 showcase put four Home shortcut placements beside all seven registered section kinds and
used both Flow and Grid. The combined order remained stable through source updates and removal,
while the source frame stayed read-only and linked to its canonical owner. The pass supports one
ordering for interaction, though the resulting Home density still merits broader observation.

**Current decision**

Sections and shortcut placements share one dense, position-then-id order per page. New placements
append to that order; moves receive a combined index; removing either kind closes the gap without
changing another page. `sections()` remains section-only for row-container operations.

**Confidence**

High for the ownership and ordering rule: domain tests cover every position-changing path, the canvas
test exercises both kinds through one sequence, and the integrated pass used four live placements.
Medium for the visual density of that combined canvas after the Flow/Grid choice.

**Revisit when**

The canvas gains a placement type with ordering semantics that are not section-like, or broader use
shows that a single dense order makes drag targets ambiguous on the grid. The 25.8 pass surfaced
density as an observation, not a reason to split the order.

**Amended, 2026-09-14 — Slice 30.** Undo of a section removal is a position-changing path in this
same order. Removal snapshots the section's previous and next placements — of either kind — and its
index before writing; Undo inserts after the surviving previous neighbour, else before the
surviving next, else at the clamped index, and renumbers so that only the restored section's
`updatedAt` moves. A neighbour archived, removed or moved to another page has not survived
([section removal Undo records](2026-09-section-removal-undo-records.md), rule 7).
