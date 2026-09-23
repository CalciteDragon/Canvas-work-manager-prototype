# Why the domain exists

## The problem it solves

Three callers change the workspace — a person in the browser, an agent over MCP, and the
development panel — and §57 requires each change to be attributed and §53 requires each
agent change to be permitted. If the rules lived in routes, the tool layer would need a
copy; if they lived in tools, the UI would; and the copy nobody tested would be the one
that drifted. §12 puts every rule in one package that none of the three transports can
bypass, and §70 says that package is what survives into the MVP.

## Forces

- **Reusable means transport-free.** A service that imported `fs`, `fetch` or a JSON
  adapter would be a service the MVP could not lift out. The import allowlist exists so
  that this is checked rather than hoped.
- **Time must be injectable** (§45): "Friday afternoon" and "deadline tomorrow" are
  scenarios the dev panel sets, and a frozen clock in tests must be a real, running one in
  the host — so there is one `Clock` interface and two implementations.
- **Agents change the threat model of a permission check.** An agent that could edit its
  own connection could grant itself what it was just denied; write paths that look their
  targets up must not demand a read grant the caller was not given.
- **The document is one file**, so every derived page can afford to walk the whole
  workspace, and none of them should store a projection that could go stale.

## The shape, and the alternatives rejected

**Services take repository interfaces and a `Clock`, and compose each other only along
acyclic edges.** `TaskService` and `ReflectionService` compose `SectionService` to resolve
a container; `SectionService` holds repositories and never a row service. Rejected: a
service locator or a global unit of work — either would hide the edges the lint checks.

**Canvas creation inserts in one domain operation.** A section or shortcut may carry an
optional zero-based `position`; the service inserts it into the page's combined order and
renumbers the affected placements inside the existing unit of work. Creating at the end and
then calling `move` was rejected because it would split one creation into two writes and two
activity events. The caller-selected insertion follows the approved direct-editing direction
([decision](../../decisions/2026-09-direct-canvas-editing-direction.md)); the create-position rule
is recorded in [contextual insertion names its position](../../decisions/2026-09-contextual-insertion-names-its-position.md).
The order itself is shared by sections and shortcuts
([decision](../../decisions/2026-09-home-orders-sections-and-shortcuts-together.md)).

**Permissions live on the actor** and are asserted inside the domain, not at the transport
([decision](../../decisions/2026-08-permissions-live-on-the-actor.md)). `AgentConnectionService`
is user-actors-only and there is no `agents.*` permission. Each service has a private
unchecked lookup for its own write paths, so a `tasks.write`-only grant is usable.

**Workspace scoping is applied last and a foreign id is 404** — never 409, so a refusal
cannot confirm that someone else's project exists
([decision](../../decisions/2026-08-workspace-scoping-and-not-found.md)).

**Archive is a field, not a status; retained removal archives, restore is exact.** `archivedAt` on
tasks, reflections and sections, with `archivedWithSectionId` / `archivedWithTaskId`
marking what one operation took down so that restore brings back exactly that and nothing
independently archived ([decision](../../decisions/2026-09-what-undo-means-for-an-archived-row.md)).
New section removal deletes only after the content policy says nothing needs recovery and an
independent audit proves no task, reflection or shortcut still references the section. Required
references retain an integrity tombstone; existing tombstones are never purged
([decision](../../decisions/2026-09-disposable-removal-and-immediate-undo.md)).

**Undo and Redo walk a per-actor history of typed actions, not a replay and not the activity
log.** Supported section, task and reflection writes record in the same caller-owned unit, put one
action into the exact actor's history for the subject's project, and return a receipt.
Each versioned payload contains only the created snapshot and placement, combined neighbours,
changed-field footprint or removal footprint that its executor may safely touch.
`OperationHistoryService` runs only the next action in a direction, within 24 hours, checking the
state the other direction left rather than which record is newer, and refusing with a typed reason
rather than overwriting a later write; an action that can never succeed again retires instead of
wedging the stack. The cursor and `revision` — not timestamps — order everything. Archive Restore
stays durable — no receipt is needed to invoke it and it never expires — and since Slice 37 every
Restore, row **and** section, also records an action of its own. Rejected: inverse data on
`ActivityEvent` (activity is audit), a generic command bus or event sourcing, and routing history
through `SectionService` or the row services (a cycle) — the payloads live in package-internal
function modules both sides share ([scope](../../decisions/2026-09-operation-history-scope.md),
[retention](../../decisions/2026-09-operation-history-retention.md),
[retired actions](../../decisions/2026-09-operation-history-retired-actions.md),
[removal footprint](../../decisions/2026-09-section-removal-undo-records.md),
[section edit boundaries](../../decisions/2026-09-section-edit-undo-boundaries.md)).

Task and reflection executors preflight the entire captured footprint before writing. Field Undo
compares only fields the action changed; structural Undo checks exact rows, ancestry, dependents
and archive markers; an implicit container is removed/restored with its created row as one action.
Historical reflection subjects may be restored when the subject still exists in the workspace,
without reapplying the stricter eligibility rule for a new assignment
([decision](../../decisions/2026-09-row-operation-history.md)).

**A recorded Restore stays durable, and a placement inverse stays out of its source.** Archive
Restore still needs no receipt and never expires; recording it only means the same actor can take it
back before undoing the removal beneath it, and a Restore by *someone else* still retires that
removal. Its inverse writes the captured markers and nothing else, so an independently archived row
is untouched and `archiveGeneration` never moves. Because retention prunes per history, a surviving
`section.restore` can be the only record that a section reached a generation, so `generationFloor`
counts it. A shortcut executor takes a repository type with no rows in it and records into the
**destination** project, which is where the write happened
([decision](../../decisions/2026-09-section-restore-and-shortcut-history.md)).

**A page toggle's inverse deletes only what the toggle created.** The enable that created an optional
page records `page.add`, whose Undo removes that record — the exact id, only while it is still
unchanged, and only after checking every canonical section (archived ones included) and every
placement that names the page. Any dependency refuses the whole transition; nothing is cascaded or
cleaned up, because a page toggle must never delete content. `updatedAt` is deliberately left out of
that identity check: the actor's own later toggles move it, and comparing it would make a correct Undo
chain refuse its own last step. Every later toggle records `page.update` and writes one boolean, so
content on the page survives both directions. The ordinary toggle keeps §26's archive exemption; the
transitions do not, so history is not a way around §31's freeze
([decision](../../decisions/2026-09-optional-page-operation-history.md)).

**An existing project's write is reversible without becoming a way around its rules.** One commit
writes every project field, so one action per changed call covers edits, completion, reparenting,
layout and progress settings, and the status crossing decides whether it is an archive, a
reactivation or an update. The subject's own history owns it, so a reparent that changes its root
never moves an action between histories. Reversal re-runs the forward hierarchy and archive rules
against the tree as it is now — archiving never cascades, and a history step does not acquire a
cascade. The history blocker gets one narrow exception, for the subject's **own** archived status and
only for an archive's Undo, a reactivation's Redo and an edit made while archived, because the service
allowed those writes and refusing would wedge the cursor on the project they are about; an archived
ancestor still blocks ([decision](../../decisions/2026-09-project-update-operation-history.md)).

**A summary entry says whether that one step may run.** The summary's top-level `blockedBy`
describes the project, but an archive's own Undo, a reactivation's Redo and an archived-throughout
edit may run while their subject is archived; a header reading only the project-level blocker could
never undo an archive. `summaryOf` therefore computes each entry's `blockedBy` with the very
`transitionBlocker` a transition of that step runs, so availability and execution cannot drift.
Labels are captured at record time and name the change: shortcut labels read the source section's
name with a plain `find` (never the scope checks, so a label adds no refusal), and project labels
name the one edit and its result, or say `Edited` for several
([decision](../../decisions/2026-09-project-header-history-controls.md)).

**Activity audit outlives safely removed rows.** `ActivityService` captures trusted target label
and owning project/root while the entity is readable in the caller's unit. Feeds prefer current
names while a target exists and fall back to captured identity afterward; no inverse data lives in
Activity ([decision](../../decisions/2026-09-historical-activity-identity.md)).

**A history transition's grant comes from its stored action.** Section actions need
`projects.write`, task actions `tasks.write`, and reflection actions `reflections.write`.
`OperationHistoryService` looks up the exact-owned action, asserts that family grant before
revision/conflict detail, and only then executes it; caller input never chooses the grant
([decision](../../decisions/2026-09-operation-family-permissions.md)).

**Archiving a project reaches down without cascading.** A project with a live child
refuses to archive; live work beneath an archived ancestor is hidden from ordinary reads
and cannot be newly created or reactivated there. The rule is pure functions over the
project list (`project-visibility.ts`) so every read model shares one answer
([decision](../../decisions/2026-09-reactivating-under-an-archived-ancestor.md)).

**Combined reads assert every grant they return.** `get_project_todos`, the Archive and
the journal need more than one read permission and are refused outright rather than
answering with the half they were allowed — and `WorkspaceService` exists because
composing checked services would have demanded three grants where §53 offers one
([decision](../../decisions/2026-08-workspace-tools-need-their-own-service.md)).

**Live frames ride the activity record.** Emission is in `ActivityService.record`, held
until commit, so it is at most one frame per operation and never one for a no-op
([decision](../../decisions/2026-08-live-events-ride-the-activity-record.md)).

**Instants are compared as text.** `IsoDateTimeSchema` permits omitted seconds and
fractions of any length; `Date.parse` would collapse distinct values. `Instant` splits an
ISO string so ordering stays lossless without a clock or timezone
([decision](../../decisions/2026-09-todos-chronology-and-canonical-navigation.md)).

## Consequences

- Adding a rule is one failing domain test and one service edit; every transport gets it.
- A domain test needs no server, no file and no browser: an `InMemoryDataStore`, a
  `PrototypeClock` and an actor.
- The domain cannot express "who is asking" beyond the actor it is handed. The host and
  the stdio process construct actors; a mismatched pair is caught only at commit by
  document integrity (the `workspace-scoping` entry's *revisit when*).
- Derived pages recompute on every read. On a JSON document this is fine; it is also
  why `projectId` stays on rows beside `sectionId` rather than being derived through a
  join.

## Decisions that shape this system

Newest first. The full list with status is in the [decision index](../../decisions/README.md#domain).

- [Undoing a first enable deletes the page it created; undoing a toggle moves one boolean](../../decisions/2026-09-optional-page-operation-history.md)
- [A recorded Restore is a new action, and a shortcut action owns only its placement](../../decisions/2026-09-section-restore-and-shortcut-history.md)
- [Task and reflection writes join operation history](../../decisions/2026-09-row-operation-history.md)
- [Activity identity survives removal of its task or reflection](../../decisions/2026-09-historical-activity-identity.md)
- [Undo and Redo require their stored operation family's grant](../../decisions/2026-09-operation-family-permissions.md)
- [Stage A defers historical activity identity and the retry cache, and uses one transition route](../../decisions/2026-09-history-stage-a-deferrals.md)
- [Applied-state checks and an archive generation replace supersession; unrepairable actions retire](../../decisions/2026-09-operation-history-retired-actions.md)
- [One explicit write is one history action, kept for 24 hours and at most 50 per history](../../decisions/2026-09-operation-history-retention.md)
- [Undo and Redo follow one history per exact actor, per owning project](../../decisions/2026-09-operation-history-scope.md)
- [Explicit section edits reverse only their operation's changes](../../decisions/2026-09-section-edit-undo-boundaries.md)
- [A section removal commits one scoped, expiring Undo record](../../decisions/2026-09-section-removal-undo-records.md)
- [Disposable removal and immediate canvas Undo](../../decisions/2026-09-disposable-removal-and-immediate-undo.md)
- [Root Archive recovery guidance](../../decisions/2026-09-root-archive-recovery-guidance.md)
- [Content-oriented Archive policy](../../decisions/2026-09-content-oriented-archive-policy.md)
- [Direct canvas editing is the next development direction](../../decisions/2026-09-direct-canvas-editing-direction.md)
- [Reflection subjects and the root journal feed](../../decisions/2026-09-reflection-subjects-and-the-journal-feed.md)
- [What the Todos page decides for itself](../../decisions/2026-09-todos-chronology-and-canonical-navigation.md)
- [Home orders sections and shortcuts together](../../decisions/2026-09-home-orders-sections-and-shortcuts-together.md)
- [A shortcut resolves source identity, not source content](../../decisions/2026-09-a-shortcut-resolves-identity-not-content.md)
- [Live work under an archived ancestor is hidden, and cannot be newly created](../../decisions/2026-09-reactivating-under-an-archived-ancestor.md)
- [Reassigning a container's rows may cross pages within a project](../../decisions/2026-09-reassign-may-cross-pages.md)
- [A disabled page refuses new content and keeps everything already on it](../../decisions/2026-09-a-disabled-page-hides-navigation-not-data.md)
- [A root's optional pages are created on first enable](../../decisions/2026-09-optional-pages-are-created-on-first-enable.md)
- [A root project is a workspace with pages; a subproject is a unit of work](../../decisions/2026-09-project-workspaces-and-subproject-work-units.md)
- [What undo means for an archived row](../../decisions/2026-09-what-undo-means-for-an-archived-row.md)
- [A section has a name, and the default is derived rather than stored](../../decisions/2026-09-a-section-has-a-name.md)
- [Container sections own their rows; view sections own nothing](../../decisions/2026-09-sections-own-their-data.md)
- [Where a live event is emitted, and when it is delivered](../../decisions/2026-08-live-events-ride-the-activity-record.md)
- [A section's activity event names its project, not the section](../../decisions/2026-08-section-activity-targets-the-project.md)
- [What counts as AI in the prototype](../../decisions/2026-08-prototype-ai-scope-and-fun-fact.md)
- [Reflections use reverse chronology and optional prompts](../../decisions/2026-08-reflection-chronology-and-prompts.md)
- [Timeline derives ranges without inventing a project start date](../../decisions/2026-08-timeline-range-semantics.md)
- [Progress formulas are selectable per project](../../decisions/2026-08-progress-formula-experiment.md) · [Project progress has one canonical formula](../../decisions/2026-08-project-progress-count-based.md)
- [Why `workspace.read` needed a service of its own](../../decisions/2026-08-workspace-tools-need-their-own-service.md)
- [How §53's "Last used" is recorded](../../decisions/2026-08-last-used-is-a-throttled-write.md)
- [Where the agent permission model is enforced](../../decisions/2026-08-permissions-live-on-the-actor.md)
- [Workspace scoping, and why a foreign id is 404 rather than 409](../../decisions/2026-08-workspace-scoping-and-not-found.md)
- [Task status transitions, `completedAt`, and how a task is archived](../../decisions/2026-08-task-status-transitions-and-archive.md)
- [Project nesting rules and what archiving a parent does](../../decisions/2026-08-project-nesting-and-archive-rules.md)
- [An existing project's writes are one action family, and its own archive can be undone while archived](../../decisions/2026-09-project-update-operation-history.md)
- [A forward reparent refuses a Home shortcut it would carry across roots](../../decisions/2026-09-forward-reparent-refuses-cross-root-shortcut.md)
- [The project header offers Undo and Redo of the displayed project's history](../../decisions/2026-09-project-header-history-controls.md) — each summary entry carries its own `blockedBy`

## Spec sections

§12 domain package · §27 who owns what and where a write lands · §31 archive · §33–§34
tasks and the Todos page · §36 reflections and the journal · §38–§39 timeline and
progress · §40 search · §42–§43 AI · §45 time · §53 permissions · §57 activity · §62
live-update emission.

**Archive projects recoverable content, judged on current state.** `sectionRecoveryOf`
(`section-recovery-policy.ts`, package-internal) is a pure function: contracts capability plus the
rows still assigned to the section. `ProjectArchiveService` applies it to section entries only;
retained disposable view tombstones stay stored but unlisted, uncertain rich-text config and
unknown types are kept, and a container holding only independently archived rows stays listed as
the first step of their recovery. New removal consults this policy after settling rows, then makes
a separate canonical-reference check before deleting. Archive remains a projection, not the
deletion gate ([content policy](../../decisions/2026-09-content-oriented-archive-policy.md),
[disposable removal](../../decisions/2026-09-disposable-removal-and-immediate-undo.md)).
