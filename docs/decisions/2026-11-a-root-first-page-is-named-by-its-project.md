# A root's first page is named by its project, never "Home"

**Question**

The workspace dashboard and each root's first page were both "Home" (L7-003, W4-005, L6-006). In
one navigation tree they would sit one row apart, under a seed root called "Home renovation". Does
the first page keep its name? (Slice 81, Q5; §23, §26.)

**Options tested**

- *(a) Rename the first page "Overview"*: rejected; a new word for the same place.
- *(b) Rename the dashboard "Dashboard"*: rejected; the dashboard's name was not the problem.
- *(c) Keep both*: rejected; three findings stay open.
- *(d) No separate row: the root's own row opens its first page, and in-content mentions use the
  project's name*: chosen (user decision, 2026-11-10).

**What we learned**

Under (d) the tree's current item, the page's `h1` and the document title all say the project's
name, so nothing has to be invented. Most mentions of the first page were paths, where the project
is already the last step, so the page step simply goes: the project's link opens the page itself.

**Current decision**

- The tree has no Home row for a root (Slice 81 step 4); the title is "<root> · Canvas Work
  Manager" (see [titles](2026-11-document-titles-and-skip-link.md)).
- A fallback notice says "… Showing Home renovation instead."; the broken-document case says "This
  project has no first page to show." (`project-page-registry.ts`).
- Archive's origin path ends at the root, whose link opens the first page and section ("Origin:
  Home renovation"); a restore toast says "Restored “Backlog” to Home renovation." (`archived-region.ts`,
  `archive-page.ts`, `restoredItemFeedback`).
- A shortcut's source line on a first page is its path alone ("Home renovation"), not
  "Home renovation · Home" (`shortcut-frame.ts`).
- Unchanged: the `home` page kind in contracts and MCP, the dashboard's "Home", and the page-settings
  popover's fixed "Home" row, which lists page kinds rather than naming a place (slice 9's vocabulary
  pass may revisit it).

**Confidence**

Medium-high: user decision and unit specs; the remaining "Home" words outside navigation are left
for the vocabulary slice.

**Revisit when**

The vocabulary slice (slice 9) renames page kinds, or a person reading a notice cannot tell the
project from its first page.
