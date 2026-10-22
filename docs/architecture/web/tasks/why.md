# Why the tasks feature is shaped this way

## The problem it solves

Tasks were the first real feature through every layer (Slice 7) and the place §63's
optimistic UI had to be proven: a checkbox completes the task instantly, persists, and
reverts visibly if the host is stopped mid-action. The row and the drawer are also the
prototype's most reused components — Task List sections and the Design Lab render them;
Todos owns a separate row — so they must be presentational and the state must live in a
store that can be provided wherever a list of tasks is owned.

## Forces

- **Optimistic writes race the live stream.** The host flushes its frame at commit,
  before the tab's own response lands.
- **Two Task Lists on one page must differ**, because a container owns its rows.
- **A row can wait on an archive while nothing about its completion is happening**, and
  the two disable different controls.
- **§4 names seven row variants**; one of them describes data that does not exist.
- **Editing must open within the viewport and take focus**, even when its row is below the fold.
  Desktop rows remain usable beside the lift; a phone needs the viewport for its task editor.

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
increments `pendingMutations`, and a live frame naming the row is deferred until the
response settles; on failure the row reverts with a visible error and no `completedAt`
in the file. A read crossed by a mutation queues a fresh read rather than painting its
stale snapshot; `loadGeneration` rejects answers from another container. The separate Todos
store uses a write epoch to reject a chronology read that started before a click
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

**The drawer uses the browser's top layer.** A desktop manual popover escapes section containment,
and the shell reserves its width so row and header controls remain reachable. At the shell's phone
breakpoint the same editor becomes a modal sheet. Container-based stacking is retired because the
editor now belongs to the viewport. Each selection focuses its heading, and closing restores the
row title or quick-create through the shared focus helper
([top-layer decision](../../../decisions/2026-10-lifts-use-the-top-layer.md),
[selection amendment](../../../decisions/2026-09-task-checkbox-reopen-and-selection.md),
[phone amendment](../../../decisions/2026-09-phone-navigation-drawer.md)).

**Selection is explicit.** Quick-add preserves it, so adding on a phone keeps the list available.
The shell-scoped coordinator and root lift stack close the old editor when another list or lift
opens. Optional injection preserves the standalone section contract (§66), and releasing a stale
claim cannot clear the new owner.

## Consequences

- The row and the drawer take task inputs and emit write intents, so fixtures still render them
  without a store. The drawer exposes its native surface to the section's focus and lift lifecycle;
  the Lab uses its contained mode.
- Whoever provides `TaskListStore` decides which container's rows it holds; the Todos
  page uses its own store because it completes rows through their canonical operation
  rather than owning them.
- Move-to-project is refused by the host until Slice 20, and the drawer does not offer it.

## Decisions that shape this system

- [Task checkboxes reopen and task titles select](../../../decisions/2026-09-task-checkbox-reopen-and-selection.md) — reversible completion, drawer title editing and heading focus on selection.
- [Creation defaults follow the open work](../../../decisions/2026-10-creation-defaults-follow-the-open-work.md) — quick-add preserves selection and leaves details explicit.
- [Lifts use the browser top layer](../../../decisions/2026-10-lifts-use-the-top-layer.md) — side lift, modal phone sheet, shared focus and one-lift ownership.
- [Task Delete names its existing recovery routes](../../../decisions/2026-09-task-delete-recovery-feedback.md) — a committed archive gets a polite cue outside the rows.
- [§4's *Agent Modified* task row has no data behind it](../../../decisions/2026-08-agent-modified-has-no-data-behind-it.md)
- [A date-only task due date is stored at UTC end-of-day](../../../decisions/2026-08-task-date-only-due-time.md)
- [Task status transitions, `completedAt`, and how a task is archived](../../../decisions/2026-08-task-status-transitions-and-archive.md)
- [One-step section removal and task Delete](../../../decisions/2026-09-one-step-section-removal-and-task-delete.md) — task Delete keeps the reversible archive semantics
- [Container sections own their rows](../../../decisions/2026-09-sections-own-their-data.md)
- [What undo means for an archived row](../../../decisions/2026-09-what-undo-means-for-an-archived-row.md) — the row's Delete control (a reversible archive) and restore
- [Task and reflection writes join operation history](../../../decisions/2026-09-row-operation-history.md) — strict task envelopes and commit boundaries
- [Below 48rem the global sidebar is a modal drawer](../../../decisions/2026-09-phone-navigation-drawer.md) — its slice-73 amendment gives the task sheet the same viewport breakpoint
- [Pending, saved and failed feedback stays on the object](../../../decisions/2026-10-feedback-stays-on-the-object.md) — the pending row, no toast for a create, row and field failures, the drawer's saved cue

## Spec sections

§4 component variants · §19 feature state · §33 task model · §34 task interactions · §63
optimistic UI · §69 component tests.


Slice 77 follows [rows open their canonical owner](../../../decisions/2026-10-rows-open-their-canonical-owner.md): shared anatomy, title-only navigation and independent write controls.
