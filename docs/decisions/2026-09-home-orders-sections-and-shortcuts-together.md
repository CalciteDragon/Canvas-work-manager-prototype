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

**Current decision**

Sections and shortcut placements share one dense, position-then-id order per page. New placements
append to that order; moves receive a combined index; removing either kind closes the gap without
changing another page. `sections()` remains section-only for row-container operations.

**Confidence**

High. Domain tests cover every position-changing path and the canvas test exercises drops of both
kinds through one sequence.

**Revisit when**

The canvas gains a placement type with ordering semantics that are not section-like, or real use
shows that a single dense order makes drag targets ambiguous on the grid.
