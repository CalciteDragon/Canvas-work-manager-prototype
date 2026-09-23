# An existing project's writes are one action family, and its own archive can be undone while archived

**Question**

`ProjectService.update` is the single domain path for a project's name, description, icon, target
date, status, parent, layout mode, progress formula and manual value; `archive` calls the same
private commit, `restore_project` delegates to `update`, and the browser archives through PATCH. Stage
C had to make every one of those writes reversible without making history a way around §26's
hierarchy rules or §31's archive freeze.

Three questions came with it. Should lifecycle (archive, reactivation) and saved options (layout,
progress) be separate families? Which history owns a sub-project's write, especially a reparent that
changes its root? And how can an archive be undone at all, when the history executor refuses every
transition whose project is archived?

**Options tested**

- *Separate families for lifecycle and saved options*: rejected. Both run through one commit, so two
  families would instrument the same write twice, and a PATCH that changes status **and** a name
  would have to become two actions with two Activity events. One call is one action.
- *One `project.update` kind for everything*: rejected. The label, the Activity verb and — decisively
  — the archived-subject rule below all need to know whether the status crossed the archive boundary,
  so `project.archive` and `project.reactivate` are kinds of their own. Completion and reopening stay
  `project.update`, as a task completion stays `task.update` (§34).
- *Recording into the root's history*: rejected. A reparent would change which history owns the
  action between the write and its Undo, and a sub-project's writes would appear in a stack the person
  opened on a different project. The **subject's own** history owns the action, whatever its root is
  now; no history migrates.
- *Recording from the caller's input*: rejected. The footprint is the **normalized change** the
  commit applies — only fields that actually moved, with exact before and after values, optional
  absence as `null`, and `completedAt` exactly as the commit derived it. A PATCH that sets what is already there
  records nothing, touches no timestamp, emits no Activity and leaves the Redo branch alone.
- *Regenerating `completedAt` on Redo, or clearing it on Undo of a reopening*: rejected. The time a
  project was completed is business state someone read and relied on; it is restored verbatim.
- *Letting the history executor bypass the archive freeze for project actions*: rejected as a general
  rule. Only three steps get a narrow exception, and only for their own subject — see below.
- *A second live frame naming the old root on a cross-root reparent*: rejected. The one-frame rule
  holds; the browser widens which frames its open root aggregates re-read on instead.

**What we learned**

The existing history blocker refuses every transition when the history's project or any ancestor is
archived. For project actions that would wedge the cursor on the very project the actions are about:
an archive could never be undone (its subject is archived), a reactivation could never be redone
after its Undo (the Undo re-archived it), and — because `ProjectService.update` deliberately permits
renaming or moving an archived project — an archived-project edit would strand every action below it
until someone reactivated the project by hand.

So `mayRunWhileSubjectArchived` names exactly three cases: `project.archive` Undo, `project.reactivate`
Redo, and a `project.update` captured with `archivedThroughout: true` (archived before **and** after
the write — the one fact the changed-fields footprint cannot carry, since an unchanged status is not
recorded). For those, the blocker walk starts at the subject's **parent**, so an archived ancestor
still blocks and nothing else changes. The summary's `blockedBy` keeps reporting the observed
archived project: it describes the project, not one step, and a future header control must account
for the action-specific exception rather than infer that every step is disabled.

Reversal re-runs the forward rules against the tree as it is now. A destination parent must exist in
the workspace, must not sit beneath the subject, and must have no archived ancestry; a direction that
archives refuses while any child is live (archiving never cascades, and a history step must not
acquire a cascade); a manual formula without its value refuses. The case that proved the parent
check is not redundant with the blocker: an archived sub-project moved across roots whose former
parent is archived afterwards. The self-archive exception makes the Undo eligible, and the
destination check still refuses it with `archive-state-changed` until the former parent is
reactivated.

Using the prototype found one more rule the executor must re-run. A Home shortcut places a section
in its own root's tree, and commit-time integrity rejects a placement that crosses roots — so moving a
sub-project to another root while an old-root shortcut places one of its sections fails at commit.
The ordinary PATCH answers that with a 500 today (a pre-existing gap, spun out as its own task); a
history step must not. `crossRootShortcutConflicts` refuses a cross-root reparent reversal with a
typed `shortcut-reference` conflict naming the placement (`remove-reference-and-retry`), before any
write, and ignores placements whose source stays behind.

Recording archive changed four existing regressions: tests that archived a project as the same actor
and then undid an older step now found the archive on top of their stack. Each was changed to have
**someone else** archive the project — the scenario the blocker exists for — as Slice 38 did for its
disable.

The closing domain review found that a `completedAt` rule in the payload contract — "a completion
time moves only with its status" — could be broken by the service's **own** normalization, and would
then throw inside a person's ordinary write. `archive()` keeps a completed project's time, while a
later rename of that archived project clears it (`update` clears the time for any non-completed
status); and a completion at a frozen clock can re-stamp the time already stored. The rule was
removed: each of `status` and `completedAt` is recorded exactly as it moved, and Undo writes it back.
Whether `archive()` and a later edit *should* disagree about the time is a pre-existing service
question this phase leaves open.

A cross-root reparent publishes one `project.*` frame naming the sub-project's **current** root, so a
browser store open on the root it left would miss the removal. `PROJECT_RECORD_EVENT_TYPES` and
`isProjectRecordEvent` in contracts (`live.ts`) name the project-record frames — update, archive and
the six project Undo/Redo verbs, deliberately not `project.created`, which names its own root already
— and a domain test proves they are exactly what project writes and transitions emit. The Todos,
Archive and Reflections stores and the workspace tree re-read on one from anywhere in the workspace,
while content frames from other roots still leave them alone; Archive does it without flashing its
loading state.

**Current decision**

Every changed `ProjectService.update` or `archive` of an existing project records exactly one action
in the acting actor's history **for that project**: `project.archive` when the status entered
`archived`, `project.reactivate` when it left it, `project.update` otherwise. The payload holds only
the changed fields with exact values, plus `archivedThroughout` on an update. `update`, `archive`,
PATCH, `update_project`, `archive_project` and `restore_project` answer `{ project, operation }` with
a `null` receipt for a normalized no-op; `create` still answers the bare project and records nothing.

Undo writes the recorded `before` values and Redo the `after` values, after checking that every
recorded field still holds the value the other direction left and re-running the parent, cycle,
archived-ancestry, live-child and manual-progress rules, and refusing a cross-root move that would
strand a Home shortcut on the old root. Unrelated fields survive; an overlapping
change conflicts — a drifted status as `archive-state-changed`, a drifted parent as `reparented`,
anything else as `field-changed`. No project conflict is permanent. Only `updatedAt` advances.

`project` is a sixth operation family needing `projects.write`. A project action and its transitions
target the subject project in Activity (`project.update_undone`, `project.archive_redone`,
`project.reactivation_undone`, …). An archive's Undo, a reactivation's Redo and an archived-throughout
edit may run while their own subject is archived; an archived ancestor still blocks them, and no other
family gets the exception. Durable restoration (`restore_project`, Archive Restore) still takes an
explicit status and needs no receipt.

**Confidence**

High for the semantics: the domain suite covers every field, the completion timestamp across an
advanced clock, the cross-root move and its refusals, the three archived-subject cases and the
ancestor that still blocks, persistence failure and grants; both MCP transports and the browser drive
the chains end to end. Lower for the **surface**: the browser still offers no Undo of a project edit,
because persistent header controls are a later phase.

**Revisit when**

Persistent Undo/Redo header controls arrive and must decide how to present a step that is eligible
while `blockedBy` is set; when project **creation** joins history with its missing-project recovery
route; or if §83 settles the status set and a new status needs its own kind.

**Amended, 2026-09-22 — Slice 41.** The open questions this entry left for header controls are
answered ([decision](2026-09-project-header-history-controls.md)): each summary entry now carries its own `blockedBy`, computed by the same
`transitionBlocker` a transition runs, so an archive's own Undo is offered while the summary's
project-level `blockedBy` still names the project. Labels now name the edit and its result —
`Renamed "Old" to "New"`, `Completed "X"`, `Reopened "X"`, `Set "X" to On hold`,
`Moved "X" under Kitchen`, `Changed the layout of "X"`, `Changed progress for "X"`,
`Changed the target date of "X"`, `Edited the description of "X"`, `Changed the icon of "X"`, or
`Edited "X"` for more than one field (`status`+`completedAt` and formula+manual progress each count
once) — for actions recorded from now on; retained actions keep their older text until they expire.
Archive and reactivation labels are unchanged. The browser now offers these steps in the header.
