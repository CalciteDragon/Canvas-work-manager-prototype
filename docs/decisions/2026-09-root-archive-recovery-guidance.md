# Root Archive recovery guidance

## Question

How should archived and effectively hidden work stay findable across a root tree, including when
the optional Archive page is disabled?

## Options tested

- Keep a small Archived region on each canvas and show only items directly owned by that canvas.
- Make the root Archive page the single whole-tree projection, with origin, cause, blocker and
  canonical restore information on every item.
- Treat archived projects as a cascade and restore their descendants automatically.

## What we learned

A canvas-local list cannot show content archived from another page, cascade members hidden by an
ancestor, or live content beneath an archived project. The existing section, task and reflection
restore operations already know the exact marker members to restore, so a second archive model
would drift. Project restoration has no stored prior status and therefore needs an explicit
non-archived choice. A disabled recovery tab must not make the recovery surface unreachable.

The 25.8 browser/MCP pass used the root-wide projection for an independently archived task and
section, then reactivated an archived intermediate project so its live descendant returned. The
same IDs survived reload; independently archived work stayed archived, and the disabled-page
manager/Open archive path remained reachable from nested navigation. The full tree is recoverable,
although the display density and blocker wording still deserve use beyond a showcase.

## Current decision

Slice 25.6 uses a root-wide Archive page and `get_project_archive` read model. Items are ordered
by owner project, kind and ID, and carry their canonical origin, own/cascade/hidden cause, and
the current actionable blocker. The page delegates to the existing canonical archive/restore
operations; it does not add a cascade, deletion, bulk restore, or guessed prior project status.
Project controls offer **Open archive** from root and nested navigation contexts, enabling the
page and navigating only after context reconciliation succeeds. Project recovery presents an
explicit non-archived status selector.

## Confidence

High for reachability and domain semantics after the integrated browser/MCP journey; medium for the
display density and blocker wording because the archived tree was still a deliberate showcase.

## Revisit when

After a multiweek pass with several archive/recovery cases, or sooner if browser use shows that the
root-wide list, stable ordering or explicit recovery guidance does not make the next action obvious.

**Amended, 2026-09-13.** Slice 27 removes **Open archive** from the project navigation column.
The project's More menu opens the Archive page from root and nested work routes, including when
the optional Archive tab is disabled. The entry point still navigates only after page context
reconciliation succeeds; the recovery model and its canonical operations are unchanged. See
[the contextual chrome decision](2026-09-canvas-chrome-is-revealed-not-moded.md).

**Amended, 2026-09-13 (planning only).** Slice 29's [content-oriented Archive policy](2026-09-content-oriented-archive-policy.md)
plans to filter section entries by meaningful remaining content, retaining owner entries
needed by independently archived rows and preserving the existing row/project guidance.
This is a pending projection change; the More-menu entry and current runtime remain unchanged.

**Amended, 2026-09-13 — landed.** Slice 29 filters Archive's section entries by recoverable
content. Row, sub-project and project guidance is unchanged. A container whose rows were archived
independently stays listed and ready, with copy saying to restore it and then those rows; a live
container beneath an archived project keeps its `not-archived` project blocker and gets only
reactivation guidance. No new blocker kind, restore operation or automatic dependency restore was
added.
