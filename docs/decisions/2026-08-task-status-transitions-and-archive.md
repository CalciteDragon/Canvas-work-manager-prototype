# Task status transitions, `completedAt`, and how a task is archived

> **Amended since (noted 2026-09-10).** The archive undo this entry left open exists since the
> archive phase: `TaskService.restore` clears `archivedAt`, and an archive cascades to live
> descendants under `archivedWithTaskId` with restore as its mirror
> ([what undo means for an archived row](2026-09-what-undo-means-for-an-archived-row.md)).
> Tasks also name the section that owns them
> ([sections own their data](2026-09-sections-own-their-data.md)). Move-to-project is still
> refused and still belongs to Slice 20.

**Question**

§33 names five task statuses and a `completedAt`, but no rules: which transitions are
legal, when `completedAt` is set and cleared, and what "archive" means for a task —
§9's `TaskGateway` has `archive(id)`, §58 lists "archive task" as a confirmation
candidate, and Slice 5's build list names `TaskService.archive`. Slice 5 could not
implement the service without answering all three.

**Options tested**

None in use yet — the API is one day old. Considered, and one reversed during review:

- *Archive as `status: 'cancelled'`.* Chosen first, then rejected. It costs no contract
  change, and reusing one of §33's five statuses puts it under real load, which §83 asks
  about. But it destroys exactly the signal it claims to serve: with archive and cancel
  the same value, the prototype learns that `cancelled` is used a lot and nothing about
  *why*. §58 also treats complete and archive as different operations with different
  confirmation rules, and §54's initial MCP tools have no `archive_task` at all. The rule
  it forces — "an archived task cannot be completed" — becomes incomprehensible to a user
  who cancelled a task deliberately and now cannot finish it.
- *Drop `TaskService.archive` from this slice.* Rejected: the build order's build list
  names it, and §9 pins it on the gateway Slice 6 builds against.
- *A full transition table between the five statuses.* Rejected: §83 asks which statuses
  are useful, and a table invented before anyone has used them prejudges the answer.

**What we learned**

Nothing from use. Two things from writing it down: reusing a status for a second meaning
is cheap in code and expensive in evidence; and a rule that is only enforced on the method
name matching it (`archive()`) is decorative when the exposed route is `PATCH`.

**Current decision**

- **Archive is `archivedAt?: IsoDateTime` on `Task`**, not a status. `TaskQuery` gains
  `includeArchived`, implemented in `JsonTaskRepository` so the query means the same thing
  to every implementation. Archived tasks are excluded from lists by default. Status is
  left untouched by archiving, so a task can be archived in any state.
- **Entering `done` stamps `completedAt` from the `Clock`; leaving `done` clears it** —
  whether through `complete()` or through `update({ status })`.
- **`complete()` on an already-done task is idempotent**: no write, no second event.
  A no-op `update` behaves the same way, so the two entry points agree.
- **`complete()` on an archived task is a `DomainRuleError`** (409). Archiving is filing
  work away; finishing it afterwards means unarchiving first.
- **Every other transition between the five statuses is allowed.**
- **The verb follows the transition**: into `done` emits `task.completed`, archiving emits
  `task.archived`, everything else `task.updated`. §57's feed renders the verb, so
  "updated" for a completion would be a visible loss.
- **Moving a task between projects is refused** with a `DomainRuleError`.
  `UpdateTaskInputSchema` carries `projectId`, but the build order (now `docs/roadmap/completed/`) gives move-to-project
  to Slice 20 along with the parent/child semantics that make it hard. Slice 5 owes only
  that it must not corrupt the document — `validateDocumentIntegrity` fails a subtask
  whose parent sits in another project. Refusing beats removing the field: these schemas
  are not `.strict()`, so a removed `projectId` would be silently stripped and answered
  200, which is worse than an explicit 409, and Slice 20 gets the field back with no
  contract churn.

**Confidence**

Medium on `completedAt` and idempotency — they are well-worn and the UI in Slice 7 will
either confirm them immediately or not. Low on archive-as-a-field: it is the more honest
of two guesses, not a finding. Low on the refusal to move, which is a scheduling decision
rather than a product one.

**Revisit when**

- Archive: after Slice 7, when task rows exist. Specifically whether anyone archives a
  task at all rather than cancelling or deleting it, and whether an archived task needs to
  be visibly different from a cancelled one in the list.
- Transitions: after Slice 7 has been used for a week, alongside
  [2026-08-status-and-priority-value-sets](2026-08-status-and-priority-value-sets.md) —
  whether `blocked` and `cancelled` are ever chosen, which is §83's question.
- The move refusal: Slice 20, which owns the real semantics.
