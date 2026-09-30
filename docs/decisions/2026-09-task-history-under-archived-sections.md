# A task step's Undo and Redo refuse while its section is archived

**Question**

Slice 46's closeout review (finding 3) found that the header could Undo or Redo a task edit, a
completion or a reopen while the task's section was archived. A removed task list's rows were
renamed, completed or reopened behind the Archive, which is the edit that
[what Undo means for an archived row](2026-09-what-undo-means-for-an-archived-row.md) freezes:
an archived section is not a place rows are edited or moved. The ordinary write already refuses it:
`TaskService.update` checks the row's own section through `assertSectionLive` and a root task's new
section through `requireContainer`. Reflection history refuses it too, because it always checks the
reflection's current container. So which sections must a `task.update` transition check, and what
does the refusal say?

**Options tested**

- *Keep scalar steps exempt, as before*: rejected. It is the finding. `writeTaskUpdate` checked a
  container only when the action recorded structural rows **and** the target was live, so an edit,
  completion or reopen was never checked. An archived target was checked only for existence.
- *Mirror the service path by path*: rejected. It would copy the service's one gap. A reparent follows
  the new parent's section through `requireWithin`/`assertWritablePage` alone, so an ordinary update
  can move an *independently archived* row under an archived parent into an archived section.
  Copying that makes history write into a frozen section on purpose.
- *Check the row's current section, and a recorded structural target in a different section,
  whatever either row's archive state*: adopted.

**What we learned**

Reproduced in `row-history.test.ts` before the repair: twelve cases resolved or listed too little.
Undo and Redo of an edit, a completion and a reopen, and Undo of a subtask edit, all resolved under
an archived section. So did an edit of an independently archived row, an archived row's move out of
or into an archived section, a same-section reparent of two archived rows, the Redo of a reparent
that took an archived row into an archived section, and an Undo once an archived project in front of
the section was reactivated. A field conflict or a cascaded move's `archive-state-changed` was
listed without the archived section. The Add, Delete and Restore
executors already refused through a row `archived-subject`, `archive-state-changed` or a
live-container check, and needed nothing.

Checking the target whatever its state, and not only when it is archived, matters for the refusal's
use. One refusal then names every archived section it involves, so one Restore round is enough and a
caller never restores one section only to be refused on the next.

History is **deliberately stricter than the service** on the reparent path. The Undo of such a step
is already refused by the current-section check. Refusing its Redo on the target is the same freeze,
and the refusal is repairable by a Restore. The service gap itself is ordinary `TaskService`
behavior and is out of finding 3's scope.

**Current decision**

- Every `task.update` transition, in either direction, refuses with `history_conflict` while the
  row's **current** section is archived, or while the recorded structural target section, when it
  differs, is archived. This covers edits, completion, reopening, moves and reparents, whether the
  row is live or independently archived.
- Each such section is reported once as `{ entityType: 'section', problem: 'archived-subject',
  nextStep: 'restore-state-and-retry' }` with its `nameOf` title. A hard-deleted section, current or
  target, reports `missing` with `nothing-to-undo`. What is new is that the current section is checked
  at all, and that a missing target is reported even alongside a structural conflict.
- The order is: row field conflict, row structural conflicts, then sections, current before target.
  A structural conflict no longer hides a missing or archived target; both are listed.
- The check runs in the executor, before any write, not in the transition blocker. The blocker is
  project-scoped and contract-typed with `blockingProjectId`, and the archived-project blocker still
  runs first. The refusal retires nothing, because a Restore repairs it.
- `task.add`, `task.archive` and `task.restore` are unchanged. No contract, host, MCP or web change:
  the typed conflict already reaches HTTP 409, MCP's `history_conflict:` message and the header.

**Confidence**

High for the rule: it restates a freeze the service and reflection history already enforce, and each
case is pinned in both directions with its recovery after a Restore.

**Revisit when**

- Archived-row completion is decided. `TaskService.update` refuses to complete an archived task, but
  a `task.update` Redo of a completion, or Undo of a reopen, can still write `done` onto a row
  another actor archived in a live section. That is not a container rule.
- The service's reparent gap is fixed. Then history and the service agree on that path, and this
  entry's "stricter" note can go.
- The header should disable a step in advance for an archived section. That needs a per-entry
  blocker, which is a summary contract change.

**Amended, 2026-09-28 (Slice 49).** The ordinary reparent gap is closed: an inherited archived destination now refuses in `TaskService.update` ([decision](2026-09-task-reparent-archived-section.md)). History also refuses entering `done` on an independently archived task, with section-cascade deduplication ([decision](2026-09-archived-task-completion-history.md)). The earlier “history stricter” observation remains the Slice 48 finding, not current behavior. The header blocker remains deferred.
