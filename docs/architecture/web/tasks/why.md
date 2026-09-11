# Why the tasks feature is shaped this way

## The problem it solves

Tasks were the first real feature through every layer (Slice 7) and the place §63's
optimistic UI had to be proven: a checkbox completes the task instantly, persists, and
reverts visibly if the host is stopped mid-action. The row and the drawer are also the
prototype's most reused components — every Task List section, the Todos page and the
Design Lab render them — so they must be presentational and the state must live in a
store that can be provided wherever a list of tasks is owned.

## Forces

- **Optimistic writes race the live stream.** The host flushes its frame at commit,
  before the tab's own response lands.
- **Two Task Lists on one page must differ**, because a container owns its rows.
- **A row can wait on an archive while nothing about its completion is happening**, and
  the two disable different controls.
- **§4 names seven row variants**; one of them describes data that does not exist.

## The shape, and the alternatives rejected

**A section-scoped store, not a page-scoped one.** `TaskListStore` was page-scoped in
Slice 7 so that two lists could not drift; under
[sections own their data](../../../decisions/2026-09-sections-own-their-data.md) they
*must* differ, so `TaskListSection` provides one instance each and syncs it against the
page's data revision. Rejected: a root-provided task store — the mega-store §20 forbids,
and wrong under ownership.

**The temporary `/tasks` route was deleted in Slice 8**, as Slice 7 allowed: §68 has no
`/tasks`, and the store became the Task List section's.

**Optimistic completion with an in-flight guard.** The row paints complete, the store
increments `pendingWrites`, and a live frame naming the row is deferred until the
response settles; on failure the row reverts with a visible error and no `completedAt`
in the file. A write epoch discards a read that started before the click and would
otherwise paint its stale snapshot over the settled row
([Slice 25.5's review found this](../../../roadmap/completed/25.5-chronological-todos.md)).

**`pending` and `archiving` are separate flags** on the row, because they disable
different controls.

**Six variants, not seven.** *Agent Modified* would need task-level attribution that no
contract carries; inventing it is a §58 question, not a styling task
([decision](../../../decisions/2026-08-agent-modified-has-no-data-behind-it.md)).

**Date-only due dates are stored at UTC end-of-day**, so an overdue check needs no
timezone and the drawer's date input round-trips
([decision](../../../decisions/2026-08-task-date-only-due-time.md)). Overdue rows print
the date, not the time — a defect only the browser showed.

## Consequences

- The row and the drawer are pure inputs-and-callbacks components: storyable with
  fixtures, testable without a store.
- Whoever provides `TaskListStore` decides which container's rows it holds; the Todos
  page uses its own store because it completes rows through their canonical operation
  rather than owning them.
- Move-to-project is refused by the host until Slice 20, and the drawer does not offer it.

## Decisions that shape this system

- [§4's *Agent Modified* task row has no data behind it](../../../decisions/2026-08-agent-modified-has-no-data-behind-it.md)
- [A date-only task due date is stored at UTC end-of-day](../../../decisions/2026-08-task-date-only-due-time.md)
- [Task status transitions, `completedAt`, and how a task is archived](../../../decisions/2026-08-task-status-transitions-and-archive.md)
- [Container sections own their rows](../../../decisions/2026-09-sections-own-their-data.md)
- [What undo means for an archived row](../../../decisions/2026-09-what-undo-means-for-an-archived-row.md) — the row's Archive control and restore

## Spec sections

§4 component variants · §19 feature state · §33 task model · §34 task interactions · §63
optimistic UI · §69 component tests.
