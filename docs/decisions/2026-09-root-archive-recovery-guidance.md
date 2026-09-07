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

## Current decision

Slice 25.6 uses a root-wide Archive page and `get_project_archive` read model. Items are ordered
by owner project, kind and ID, and carry their canonical origin, own/cascade/hidden cause, and
the current actionable blocker. The page delegates to the existing canonical archive/restore
operations; it does not add a cascade, deletion, bulk restore, or guessed prior project status.
Project controls offer **Open archive** from root and nested navigation contexts, enabling the
page and navigating only after context reconciliation succeeds. Project recovery presents an
explicit non-archived status selector.

## Confidence

High for reachability and domain semantics; medium for the display density and blocker wording
until the full browser journey has been used with realistic archived trees.

## Revisit when

After Slice 25.7's Reflections renderer and the integrated 25.8 acceptance pass, or sooner if
browser use shows that the root-wide list, stable ordering or explicit recovery guidance does not
make the next action obvious.
