# Project progress has one canonical formula, and "no tasks" is not "0%"

**Question**

§26 puts Progress in the project header while §39 adds count-based, weighted, and
manual formulas. How do the header and Progress section stay consistent?

**Options tested**

- *Page-local count*: initially shipped in Slice 8, but could not reflect weighted or
  manual selection.
- *Progress section config*: rejected because removing or duplicating a section would
  remove or conflict with the project's progress answer.
- *Canonical project setting*: chosen. The header and every Progress section read the
  same domain result.

**What we learned**

Three things the formula alone does not settle, found in the running app.

**Archived tasks are outside the denominator.** `TaskListStore.load` passes
`includeArchived: false`, so the header counts exactly the tasks the Task List section shows.
A number computed over tasks the user cannot see would be unexplainable.

**A project with no tasks reports "Not available", not "0%".** These are different claims —
"nothing to measure" against "nothing done" — and the distinction matters more than it looks.
The first implementation rendered them identically, because a `0` progress is falsy and the
template's `@if (progress; as …)` binding sent a real zero down the "no value" branch. A
project where work had genuinely not started read as unmeasurable. Found by opening `Home
renovation` in `nested-projects`; now pinned by a test.

A failed progress read also reports "Not available" rather than `0%`, for the same reason.

**Formula selection is project state, not canvas layout.** In the Slice 10 acceptance
exercise, count produced `1 of 3 tasks complete`, weighted produced `2 of 10 estimate
points complete`, and manual persisted `41%` through reload. The header and section moved
together because both consume `ProgressService`; duplicating or removing a Progress
section cannot change the answer.

**Current decision**

`Project.progressFormula` is the canonical per-project feature setting, defaulting to
count. `ProgressService` derives the selected answer from the project and its unarchived
tasks; the project store and Progress sections read that answer through their gateway. *(Since
Slice 25.3 the header's copy of it belongs to `ProjectWorkspaceStore`, since progress describes
the project rather than one of its pages.)*
Count and weighted keep cancelled-but-unarchived tasks in the denominator, matching the
visible task collection. Projects with no tasks return unavailable for derived formulas.

**Confidence**

High for one canonical answer and for empty/failed being distinct from zero. Medium for
count remaining the default until broader prototype use compares the formulas.

**Revisit when**

User testing shows a need for roll-ups, estimate scales other than neutral points, or a
different default formula.
