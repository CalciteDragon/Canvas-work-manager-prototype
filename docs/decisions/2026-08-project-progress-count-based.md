# Project header progress is count-based, and "no tasks" is not "0%"

**Question**

§26 puts Progress in the project header. §39 wants count-based, weighted, and manual
formulas prototyped behind a feature setting. Which does the header show now?

**Options tested**

- *Count based* (`completed / total`): chosen. It is the only one the current data supports —
  tasks carry no estimates, and nothing yet lets a person enter a figure by hand.
- *Weighted*: unavailable. §33's task has no estimate field, and inventing one to feed a
  header number would prejudge §39's actual question.
- *Manual*: deferred with the Progress section (§30), which is where a feature setting to
  switch between the three belongs.

**What we learned**

Two things the formula alone does not settle, both found in the running app.

**Archived tasks are outside the denominator.** `TaskListStore.load` passes
`includeArchived: false`, so the header counts exactly the tasks the Task List section shows.
A number computed over tasks the user cannot see would be unexplainable.

**A project with no tasks reports "Not available", not "0%".** These are different claims —
"nothing to measure" against "nothing done" — and the distinction matters more than it looks.
The first implementation rendered them identically, because a `0` progress is falsy and the
template's `@if (progress; as …)` binding sent a real zero down the "no value" branch. A
project where work had genuinely not started read as unmeasurable. Found by opening `Home
renovation` in `nested-projects`; now pinned by a test.

A failed task load also reports "Not available" rather than `0%`, for the same reason.

**Current decision**

The header shows `round(done / unarchived total × 100)%`, computed in `ProjectPageStore` from
the `TaskListStore` the page already provides, and "Not available" when there are no tasks or
the task load failed. No `ProgressService`, and no feature setting.

**Confidence**

Medium for count-based as the prototype's default; high for the empty and failed cases being
distinct from zero.

**Revisit when**

The Progress section (§30, §39) is built. It owns the feature setting and the other two
formulas, and it is where this derivation should move out of a page store.
