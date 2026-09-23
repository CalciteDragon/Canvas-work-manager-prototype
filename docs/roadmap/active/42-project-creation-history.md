<!-- plan id="42" status="active" summary="Project creation records one project.add action whose Undo removes the untouched project and its canonical page and whose Redo recreates the same ids, reachable from a recovery state at the project's own URL" -->
# Slice 42 — Project creation history and recovery state (Slice 34 Stage C5)

<!-- The first line is the state marker; scripts/roadmap.mjs owns it. While the plan is in
     planned/ keep only the first five sections and keep them short. When it starts (roadmap.mjs
     start), write the rest per AGENTS.md step 1, then revise it through review (step 2) and
     record the rounds under Revisions. Before roadmap.mjs complete, write Outcome. -->

## Goal

Make creating a project one undoable, redoable action in the created project's own history, and
keep that action's Redo reachable from a minimal recovery state at the project's URL after its
Undo has removed the project.

## Spec sections

Main §14 (document integrity: which records may name an absent project), §26 (creating a
project is now an operation like editing one; the project header owns Undo/Redo), §31 (Project
Section Frame; creation Undo preserves section content), §54 (`create_project` answers a receipt; history tool descriptions), §57 (an audit line
about a project outlives that project's creation Undo), §61 (`POST /api/projects` result), §62
(the `project.creation_undone`/`_redone` frames and how they route), §63 (browser reconciliation
after either direction), §68 (what `/projects/:id` shows the
creating actor after creation Undo), §§69–70, §§77–79. Slice 34's coverage row *Project
add/edit/archive/reactivate* ("Creation history belongs to the created project; lifecycle handling
below keeps Redo reachable after creation Undo") and its *Creation Undo, archived owners and
permissions* section.

## Build

- A `project.add` operation kind in the `project` family, capturing the created project and its
  canonical page, recorded by `ProjectService.create` in the **created** project's history.
- Undo removes exactly that project and page, only while nothing else refers to them; Redo
  recreates both with the same ids under the current hierarchy rules.
- Document integrity lets a project be absent when its last creation-lifecycle audit line (document order) is
  `project.creation_undone` (anchoring the Activity that names it) and its creator's history
  retains the undone creation; nothing else may name it.
- The creating actor's history summary stays readable at the project id after Undo; the browser's
  project route renders a recovery state with the header controls, so Redo is one click away.
- `POST /api/projects` and `create_project` answer `{ project, operation }`; browser callers
  unwrap and report.
- Close Stage C's other open item on paper: the transition retry cache is retired by a dated
  amendment, not built.

## Done when

Creating a root or a sub-project through HTTP, both MCP transports or the browser records one
`project.add` in that project's history. Undo removes the project and its canonical page, leaves
its audit lines readable, refreshes every open tree, and — for the creating actor only — leaves a
recovery state at `/projects/:id` whose Redo brings back the same ids. Any content, child,
reference, extra page, field change or other actor's history in the project refuses Undo without a
partial change. The document reloads valid after Undo, Redo, reload and history expiry.

## Do not

- No project deletion outside `project.add` Undo, no tombstone rows, no deleted-project browser,
  no schema version bump or converter (the change is additive to version 5).
- No change to archive/reactivate semantics, Stage D removal or Archive filtering, keyboard
  shortcuts, the transition retry cache, or section label wording.

## Phase boundary and repository findings

Read for this plan: [Slice 34](../planned/34-undo-redo-and-archive.md), the Outcomes of
[Slice 39](../completed/39-project-update-history.md) and
[Slice 41](../completed/41-header-history-controls.md), and the code named below.

**What exists.** [`ProjectService.create`](../../../packages/domain/src/project-service.ts)
validates, inserts the project and its canonical page (`home` for a root, `work` for a
sub-project) and records `project.created` Activity in one unit, and returns a bare `Project`.
It already holds the `OperationRecorder` (Slice 39) but does not call it on create. `update` and
`archive` record into the **subject's own** history; creation follows the same rule, so a
sub-project created from its parent's Sub-Projects section records in the sub-project's history,
not the parent's. The browser already words that case: Slice 41's `crossOwnerFeedback` names the
owning project with an Open link.

`RepositoryOperationRecorder.record` creates a history on first write, so the creating write is
always its history's first action (`order` 1). Pruning happens only inside `record` for that same
history; every recording write first requires its owning project to exist.

**Why a project can now be absent.** Three integrity rules in
[`data-store.ts`](../../../packages/repositories/src/data-store.ts) require a stored project:
an operation history's `projectId` ("strictly, because no Stage A operation deletes a project");
an Activity target of kind `project`; and an Activity event's `projectId` plus its captured
`context.projectId`/`context.rootProjectId`. [The historical-activity-identity
decision](../../decisions/2026-09-historical-activity-identity.md) names this phase as its
revisit trigger ("a future operation deletes a project").

**Two anchors, one per record kind.** Slice 34 forbids an Activity exemption that depends on a
retained Undo record, so Activity and histories are anchored separately:

- **Activity.** A project id absent from `projects` may be named by an event in workspace W — as
  its `project` target, its `projectId`, or its captured `context.projectId`/`rootProjectId` —
  when W holds a `project.created` event for that id and, among W's `project.created`,
  `project.creation_undone` and `project.creation_redone` events targeting it (target and captured
  `projectId` both the id), the **last in document order is `project.creation_undone`** and comes
  after that `project.created`. Document order, not `createdAt`: the simulated clock can move
  backward (`setNow`, `reset`), so an Undo can be stamped earlier than the creation it reverses,
  while `insert` appends and Activity is never removed or reordered, so array position is the
  true record order. This
  proves the absence came from creation Undo, not merely that the project once existed: a seeded
  or pre-slice project deleted by hand (it has a `project.created` event but no Undo) still fails
  integrity, as today. Activity has no deletion path (`ActivityRepository` has no `remove`) and
  `update` has no callers; the anchor's doc comment states that lifecycle events are never
  rewritten. So the anchor is as durable as the audit line it justifies and independent of
  history retention and pruning.
- **Operation histories.** A history whose `projectId` is absent must retain an `undone`
  `project.add` action for that id; its own existence is what needs justifying, so a history
  anchor is sound. **Applied** `project.add` with an absent project, and **undone** `project.add`
  with a present one, are both broken documents. A `retired` `project.add` constrains nothing: it
  only arises from an Undo refusal, which leaves the project in place. The action cannot be pruned
  while the project is absent — pruning happens only inside `RepositoryOperationRecorder.record`
  for that history, and every recording write requires its project to exist. This slice states
  that invariant on `pruneOperationHistory` and tests it, so a later "clean up expired actions"
  pass has to confront it.

Nothing else may name an absent project — no page, section, row, milestone, shortcut, reflection
subject or child — and those rules are unchanged. Payloads **inside** other histories' actions
(a `project.update` reparent's parent id, a reflection's subject, a shortcut's `sourceProjectId`)
are deliberately not resolved by integrity today (`data-store.ts` operation-history comment); they
may name the absent id, and their executors already refuse with repairable `missing` conflicts. A
later Redo restores the canonical record; nothing is rewritten. No collection, no tombstone and no
version bump.

**Undo preflight (`revertProjectAdd`)** — every check before the first write, each failure a
typed conflict with `entityType` and `nextStep`:

| Check | Conflict | Permanent? |
|---|---|---|
| Project exists | `project` `missing` | no — defensive: only this executor removes a project |
| Every captured field equal except `updatedAt` (`completedAt` compared exactly) | `project` `field-changed`, `change-by-hand` | no |
| The captured canonical page exists with every field equal except `updatedAt` | `page` `field-changed` | no |
| No other page for the project | `page` `new-dependent` | no |
| No section with this `projectId`, **archived included** | `section` `new-dependent`, `restore-or-move-dependent-and-retry` | no |
| No task or reflection with this `projectId`, **archived included** | `task`/`reflection` `new-dependent` | no |
| No milestone with this `projectId` | `project` `new-dependent` (no `milestone` conflict type exists; no write path creates one, so defensive) | no |
| No child project, any status | `project` `new-dependent` | no |
| No reflection anywhere, archived included, whose `subject` is `{ kind: 'subproject', id }` | `reflection` `new-dependent` | no |
| No shortcut placed on the captured page | `shortcut` `new-dependent` | no |
| No **other** operation history with `history.projectId === id` | `project` `new-dependent`, `change-by-hand` | **yes** — histories are never deleted, so the action retires |

**What a caller actually meets.** The creating actor's own later writes in the project (a section,
a task through a container, an optional page, a rename) are recorded in the **same** history above
`project.add`, so Undo reaches them first and a creation Undo requested early refuses
`history_not_next` — the preflight rows for them are defensive and tested by calling the executor
directly. The preflight is reached with a non-permanent conflict only by writes recorded
**elsewhere** by the same actor: a child (in the child's history) or a subject-linked reflection
(in the root's history). **Any** other actor's write to the project creates that actor's history,
so creation Undo then retires — even if that actor has since undone everything. The person can
still archive the project.

**Order inside the unit.** A retirement commits its unit (`operation-history-service.ts`, the
`retired` outcome), and the retired-actions decision says a retirement records no Activity and
publishes no frame. `project.add` is the first operation that both records before removal and
has a permanent conflict, so its checks run **before** the event: the executor is split into a
read-only `preflightProjectAddUndo` (throws `OperationExecutionRefused`) and the removal. In
`transition`, the existing `try` that turns `OperationExecutionRefused` into `history_conflict`,
`history_unavailable` or a committed retirement is widened to cover **preflight → audit line →
execute**, so a preflight refusal gets exactly today's handling and never escapes as a 500. The
Activity event is then recorded while the project still resolves (captured context and the
frame's root are right), and the executor re-runs its preflight in the same unit before removing
the page and the project through restricted repository removals only it calls. A refusal from
that **second** run — impossible unless something wrote inside this unit — is an invariant breach:
it is rethrown as a `TypeError` so the unit rolls back, never retired with the audit line
committed. `ProjectHistoryRepositories` in `project-history.ts` stays narrow for existing-project
write inverses; the new `ProjectAddHistoryRepositories` extends it only for the creation executor,
adding `tasks`, `reflections`, `milestones` and `histories` reads. `operation-execution.ts` remains
the section-executor seam and does not change. `OperationHistoryServiceDependencies` adds the
milestone repository needed by that executor, while `ProjectService` gains no repository or service
edge.

**Redo preflight (`reapplyProjectAdd`)** — project id and page id both absent (`already-exists`);
for a sub-project the captured parent exists in the same workspace (`project` `missing`,
non-permanent: the parent's own creation may be redone). Archived ancestry is the transition
blocker, not a conflict. Recreates both records with captured values and `createdAt`; only
`updatedAt` comes from the clock. Nothing reinstates a reflection subject or child — none existed.

**Blocking.** `transitionBlocker` gains `project.add`: in both directions it ignores the subject's
own status (a project may be created with an explicit `archived` status, and Redo has no subject)
and asks `findHighestWriteBlocker` from the **captured parent** for a sub-project, or nothing for a
root. An archived ancestor still blocks, as for every other family. Grant: `projects.write`, the
`project` family's.

**The summary at an absent project.** `OperationHistoryService.summary` today refuses a missing
project. It will answer for an absent id only when the calling actor's own history for that id is
anchored (above); every other caller — another person, another agent connection, a foreign
workspace, an id that never existed — still gets the same 404, so the history route discloses
neither a history nor its snapshot. The project's **existence** stays visible where §57 intends:
`project.created` and `project.creation_undone` remain in the workspace's Activity for anyone with
`workspace.read`. Top-level `blockedBy` uses the captured parent chain. `GET
/api/projects/:id/history` and `get_operation_history` inherit this; `GET /api/projects/:id`
stays 404 for everyone.

**Live frames.** Undo records `project.creation_undone`, Redo `project.creation_redone`, both
targeting the project (`activityActionFor`'s project noun `creation`). The frame's `projectId` and
`rootProjectId` come from the captured context, so the former root's aggregate stores, the
sidebar (`ShellStore` re-reads on any `project.*`) and the header history at that id all refresh.
These two types are **not** added to `PROJECT_RECORD_EVENT_TYPES`: creation never moves a project
between roots, so `rootProjectId` already reaches every tree that changed, exactly as for
`project.created`.

**Browser.** Two creators exist: `ShellStore.createProject` (sidebar root; outside any workspace
shell, so it uses the inert reporter and navigates to the new project, whose header reads the
`project.add` step on load) and `SubProjectsStore.create` (inside the parent's shell; reports
through `reportedWrite`, so the parent's header announces the cross-owner step with its Open
link). `ProjectWorkspaceStore` distinguishes a `not_found` read from other failures: on `load` and
on a context refresh it sets a `missing` state (clearing the project so renderers unmount) instead
of a quiet failure, because after creation Undo the frame's refresh is the path that must notice.
`ProjectWorkspaceShell` renders, when `missing` and the history summary's Redo entry is
`project.add`, a recovery section: heading *Creation undone*, a sentence naming the entry's label,
and the same `ProjectHistoryControls` and `ProjectHistoryFeedback` the header uses. When missing
without such an entry it keeps today's *Project unavailable*.

Frames drive reconciliation, but a dropped frame must not strand either direction, so the shell
also reloads **`ProjectWorkspaceStore` only** — never `history.load`, which would reset the summary
the trigger reads — at most once per `historyId:revision` key, when the held summary's `projectId`
is the route's id, the store is not loading, and either: the store holds this route's project
(`project()?.id === route id`) and the summary's **Redo** entry is `project.add` (an Undo just
removed it); or the store is `missing` and the summary's **Undo** entry is `project.add` (a Redo
just recreated it). A cold visit to the recovery URL therefore starts no extra reload (the store
is loading, then `missing` with a Redo entry — neither case), and a stale summary cannot loop. The
canvas and page stores inside react to the same
Undo frame by re-reading sections of an absent project; those reads fail with `not_found`, and
the stores must stay quiet about it (no error banner, no console error) until the shell unmounts
them — a spec and the e2e journey assert that. `transitionResultFeedback` gains `project.add`
wording for both directions (exhaustive switch).

**Retry cache.** [The Stage A deferral](../../decisions/2026-09-history-stage-a-deferrals.md) says
revisit "when Stage C's header control cannot tell a landed transition from a lost one from the
summary alone". Slice 41 shipped a header that does — a lost response re-reads, and a replay's
`history_revision_stale` refusal carries the summary naming the caller's own step. A dated
amendment records the cache as not built; no code changes. Because this retires an explicit
Slice 34 requirement ("a bounded transition request ID and cached result"), the Slice 34 candidate
gets a dated note beside it too, and the user is told at close. This completes Stage C's list in
[`goals.md`](../goals.md).

## Acceptance check

Isolated test data only (`pnpm --filter @cwm/e2e` prepares its own; host tests use temp stores).
Seeds give each persona its own workspace (Slice 41 Outcome), so a second persona exercises the
**foreign-workspace** case; the same-workspace other-user and other-connection cases are proved by
domain fixtures (test plan) and by the person's own agent connection below.

1. **Root through HTTP.** On `personal-workspace`, `POST /api/projects` a root → 201 `{ project,
   operation }` with `operation.operation === 'project.add'`, label `Created "…"`, revision 1.
   `GET /api/projects/:id/history` shows it as Undo. Transition Undo → the project and its Home
   page are absent from `GET /api/projects` and the page list, `GET /api/projects/:id` is 404, the
   host restarted on the same file loads it (integrity passes), and Activity lists
   `project.created` and `project.creation_undone` with the captured name. The same person's
   summary at that id offers Redo `project.add`; the person's agent connection's summary and a
   second persona's are 404. Redo → same project id and page id, `createdAt` unchanged, Home page
   empty; Undo again succeeds.
2. **Sub-project.** On `nested-projects`, create a sub-project under a live sub-project. The
   action is in the child's history, not the parent's. Undo/Redo it; the root's work tree, Todos
   and Archive projections and the parent's Sub-Projects section agree after each step, each
   driven by one committed frame whose `rootProjectId` is the root.
3. **Refusals, each with its expected reason** (and no change to projects, pages, Activity, live
   frames or history revision unless stated):
   - The creator adds a section, a task or enables Todos in the new root, then asks for creation
     Undo by its action id → `history_not_next`; after undoing that write, creation Undo succeeds.
   - The creator renames it → `history_not_next`; Undo the rename, then creation Undo succeeds.
   - The creator creates a child under the new sub-project → `history_conflict` (`project`
     `new-dependent`); Undo the child's creation (from the child's history), then it succeeds.
   - The creator writes a reflection in the root whose subject is the new sub-project →
     `history_conflict` (`reflection` `new-dependent`); undo that reflection in the root, then it
     succeeds.
   - The person's agent connection — first granted `projects.write` through `PATCH
     /api/agent-connections/:id`, since seeded connections lack it — renames the new project over
     MCP and then undoes its own rename → the person's creation Undo answers `history_retired`: the cursor moves past it, **no Activity
     event and no frame** are published, revision advances once, and the project remains.
   - The parent is archived → `history_blocked` naming the parent in both the refusal and the
     summary entry's `blockedBy`; reactivate, then Undo succeeds.
   - Redo while the parent is archived → `history_blocked`; Redo when the parent is itself absent
     after its own creation Undo → `history_conflict` (`project` `missing`), not retired; after
     the parent's Redo, the child's Redo succeeds.
   - Reparent another sub-project Q under the new project, undo the reparent, undo the creation,
     then redo Q's reparent → `history_conflict` (`missing`), not retired.
4. **Integrity and expiry.** Fixture documents: an undone-created project with its history and
   Activity loads, including one whose creation happened with the clock set forward and whose
   Undo ran after `reset` (Undo stamped earlier than the creation); each of — its
   `project.created` event removed; the last lifecycle event
   being `project.created` or `project.creation_redone`; an absent project with no history at
   all (a hand-deleted seeded project); the history's `project.add`
   removed or `applied`; an `undone` `project.add` whose project is present; the history in another
   workspace; a second actor's history for the absent id; any page, section, row, child or reflection
   subject naming the id — fails with a named message. Then set the clock 25 h forward: the
   summary no longer offers Redo, the browser falls back to *Project unavailable*, the document
   still loads and Activity still reads.
5. **MCP.** Through `mcp-acceptance` on Streamable HTTP and stdio, with a connection holding
   `projects.write`: `create_project` answers `{ project, operation }`; `undo_operation` removes it;
   `get_operation_history` at that id answers for this connection only (another connection gets
   not-found); `redo_operation` recreates the same id. Then lower that same connection to
   `projects.read` and assert the next transition is forbidden with no summary, label or revision
   in the error.
6. **Browser.** `pnpm --filter @cwm/e2e e2e -- project-creation-history`: create a root from the
   sidebar; the header's Undo reads *Undo: Created "…"*; Undo shows the recovery state at the same
   URL with Redo enabled, the sidebar no longer lists the root, and no error banner or console
   error appears; reload keeps the recovery state; Redo returns to the project's Home at the same
   URL. Create a sub-project from a parent's Sub-Projects section: the parent's header announces
   the cross-owner step with Open; Open, Undo, recovery state, Redo. A second persona opening the
   URL sees *Project unavailable*.
7. **Commands.** Named failing tests first, then `pnpm test`, `pnpm lint` (includes
   `docs:check`), `pnpm build` (initial bundle under the 1050 kB ceiling), host `acceptance` and
   `mcp-acceptance`, and `pnpm --filter @cwm/e2e e2e -- project-creation-history project-history
   web archive reflections todos mcp`. Then `pnpm dev:web` and `pnpm dev:host` separately, a seeded
   real-use and MCP pass, friction into `.prototype/notes.json`; do not reset personal runtime data
   for automated tests.

## File-level change list

Paths are repository-relative. Paired `*.test.ts`/`*.spec.ts` change with their source.

**Callers the type checker will not find.** The result change breaks every caller of
`ProjectService.create`, `POST /api/projects` and `gateway.projects.create`; `tsc` finds the typed
ones, but the e2e helpers cast the POST response (`apps/e2e/seed.ts` `api.post<Project>`,
`archive.spec.ts`, `reflections.spec.ts`, `todos.spec.ts`) and the `.mjs` acceptance scripts are
untyped. And because a fresh project's history now starts at revision 1, tests that assume an
empty history after creating through the service or POST change meaning. Before the first commit,
grep the test and e2e trees for `post<Project>`, `/api/projects'`, `projects.create(`,
`historyId: null`, `'Nothing to undo'`, `revision: 1` and undo-until-empty loops, and fix each
hit in the commit that changes the result.

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/project-history.ts`, `project-history.test.ts` | modify | `ProjectAddOperationSchema` (`type: 'project.add'`, `version: 1`, `project: ProjectSchema`, `page: ProjectPageSchema`; refine: the page's `projectId` is the project's and its kind is `canonicalPageKindFor(project.kind)`); undo result `{ operation, outcome: 'removed', projectId }`, redo result `{ operation, outcome: 'reapplied', project, page }`; add to the unions and result arrays; module comment no longer says creation is absent. |
| `packages/contracts/src/operation-receipt.ts`, `packages/contracts/src/undo.ts`, `packages/contracts/src/undo.test.ts`, `packages/contracts/src/index.ts` | modify | `project.add` kind; `operationProjectOf`/`operationSubjectOf` answer `operation.project.id`; exports. |
| `packages/contracts/src/tool-permissions.ts`, `packages/contracts/src/tool-permissions.test.ts`, `packages/contracts/src/row-history.test.ts`, `packages/contracts/src/index.test.ts` | modify | Document the creation action in the existing project family; update the exhaustive operation-kind family and result-union counts for the twenty-third kind; assert `project.add` uses the project family. |
| `packages/contracts/src/project-write-result.ts` | modify | Doc comment: `create` answers it too, always with a receipt. |
| `packages/contracts/src/live.ts`, `packages/contracts/src/live.test.ts` | modify | Document the two new event types as root-routed (not record events); test `isProjectRecordEvent` excludes them. |
| `packages/repositories/src/interfaces.ts`, `packages/repositories/src/json-repositories.ts`, `packages/repositories/src/repositories.test.ts` | modify | Restricted `ProjectRepository.remove(id)` with the single-caller doc comment (mirrors `ProjectPageRepository.remove`). |
| `packages/repositories/src/data-store.ts`, `packages/repositories/src/data-store.test.ts` | modify | The two anchors: Activity accepts an absent project whose `project.created` exists in the same workspace and whose last lifecycle event in document order is `project.creation_undone`; a history accepts an absent project only with a retained `undone` `project.add`; reject applied-and-absent and undone-and-present. Rewrite the comments that say no operation deletes a project. |
| `packages/domain/src/operation-history.ts`, `packages/domain/src/operation-history.test.ts` | modify | State the never-pruned-while-absent invariant on `pruneOperationHistory`; test that `record` into any other history cannot remove an undone `project.add`. |
| `packages/domain/src/project-history.ts`, `packages/domain/src/project-history.test.ts` | modify | `captureProjectAdd`, `projectAddLabel`, `preflightProjectAddUndo`, `revertProjectAdd`, `reapplyProjectAdd` per the tables; add `ProjectAddHistoryRepositories` for creation Undo/Redo reads while keeping `ProjectHistoryRepositories` narrow for existing-project inverses. |
| `packages/domain/src/project-service.ts`, `packages/domain/src/project-service.test.ts` | modify | `create` records `project.add` in the new project's history and answers `ProjectWriteResult`; doc comments. |
| `packages/domain/src/operation-history-service.ts`, `packages/domain/src/operation-history-service.test.ts` | modify | Dispatch; preflight **before** `recordsBeforeRemoval` records for `project.add`; activity verb/target/gerund/summary (`Undid creating "…"`); `transitionBlocker` from the captured parent; `summary` answers an anchored absent project for its own actor only; require the milestone repository for creation preflight. |
| `packages/domain/test/test-support.ts`, `packages/domain/src/section-edit-undo.test.ts`, `packages/mcp-tools/test/harness.ts` | modify | Supply the milestone repository at the remaining `OperationHistoryService` construction sites; the host constructors are wired in the API row below. |
| `packages/domain/src/activity-service.ts`, `packages/domain/src/activity-service.test.ts`, `packages/domain/src/dashboard-service.test.ts` | modify | `projectName` falls back to the captured `targetLabel` **only** for a project-targeted event about that same project; otherwise it is omitted. Tests: a project event and a task event inside a removed project; the agent tile over an absent project (already tolerant — test only). |
| `apps/prototype-host/api/services.ts`, `apps/prototype-host/api/routes.ts`, `apps/prototype-host/api/routes.test.ts` | modify | Wiring if dependencies change; `POST /api/projects` answers `ProjectWriteResult`; summary route tested for absent-project cases. |
| `apps/prototype-host/live-updates.test.ts`, `apps/prototype-host/page-history-acceptance.test.ts`, `apps/prototype-host/recovery-undo-acceptance.test.ts`, `apps/prototype-host/mcp/handler.test.ts` | modify | Result shape and empty-history assumptions; one frame each for creation Undo/Redo with the former root's `rootProjectId`. |
| `apps/prototype-host/scripts/acceptance.mjs`, `apps/prototype-host/scripts/mcp-acceptance.mjs` | modify | Unwrap `{ project }` at every creation; acceptance steps 1–3 and 5. |
| `packages/mcp-tools/src/tools/projects.ts`, `packages/mcp-tools/src/tools/undo.ts`, `packages/mcp-tools/src/tools/project-pages.ts`, `packages/mcp-tools/src/contract.test.ts`, `packages/mcp-tools/src/registry.test.ts`, `packages/mcp-tools/src/activity.test.ts` | modify | `create_project` result and description; `undo_operation`/`redo_operation`/`get_operation_history` descriptions list `project.add`, what its Undo refuses, when it retires, and the absent-project summary. |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts`, `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts`, `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | modify | `projects.create` answers `ProjectWriteResult`; the fake can make `projects.get` answer `not_found` while `history.summary` answers a `project.add` step. |
| `apps/web/src/app/core/shell/shell-store.ts`, `apps/web/src/app/core/shell/shell-store.spec.ts` | modify | Unwrap `project`; keeps the inert reporter (outside the shell), stated in the doc comment. |
| `apps/web/src/app/features/projects/sections/sub-projects/sub-projects-store.ts`, `apps/web/src/app/features/projects/sections/sub-projects/sub-projects-store.spec.ts` | modify | Unwrap and report through `reportedWrite` with the created project's id and name. |
| `apps/web/src/app/features/projects/project-workspace-store.ts`, `apps/web/src/app/features/projects/project-workspace-store.spec.ts` | modify | `missing` signal: set on a `not_found` load or context refresh (project cleared), cleared by a successful read; other refresh failures stay quiet. |
| `apps/web/src/app/features/projects/project-page-store.spec.ts` | modify | A `not_found` section re-read after a project's creation-undo frame stays quiet until the shell unmounts the canvas. The stores already suppress quiet live-refresh failures, so no section-store implementation change is expected. |
| `apps/web/src/app/features/projects/history/project-history-store.ts`, `apps/web/src/app/features/projects/history/project-history-store.spec.ts` | modify | `creationRedo`/`creationUndo` computed views over the held summary (no new state). |
| `apps/web/src/app/features/projects/history/history-feedback.ts`, `apps/web/src/app/features/projects/history/history-feedback.spec.ts` | modify | `project.add` Undo/Redo result wording. |
| `apps/web/src/app/features/projects/project-workspace-shell.ts`, `apps/web/src/app/features/projects/project-workspace-shell.html`, `apps/web/src/app/features/projects/project-workspace-shell.scss`, `apps/web/src/app/features/projects/project-workspace-shell.spec.ts` | modify | Recovery section; the symmetric once-per-revision reloads; tokens only. |
| `apps/web/src/app/features/projects/project-creation-recovery.stories.ts` | create | The recovery state: Redo enabled, pending, blocked by an archived parent; both themes. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 42` (first implementation commit). |
| `apps/e2e/project-creation-history.spec.ts` | create | Acceptance step 6. |
| `apps/e2e/seed.ts`, `apps/e2e/archive.spec.ts`, `apps/e2e/reflections.spec.ts`, `apps/e2e/todos.spec.ts`, `apps/e2e/web.spec.ts`, `apps/e2e/project-history.spec.ts` | modify | Unwrap POST results; a fresh root's header Undo is now enabled ("Nothing to undo" assertions after creation change). |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` §§14, 26, 31, 54, 57, 61, 62, 63, 68, 69 | modify | Creation is recorded; the two anchors; the recovery state; results and frames; the new browser journey in the testing strategy. |
| `docs/decisions/2026-09-project-creation-history.md`, `docs/decisions/README.md` | create / modify | New §78 entry: subject-owned creation; anchors instead of a tombstone and why each is durable; the preflight list and its one permanent conflict (preflight before the audit line); actor-only summary while existence stays in Activity; the recovery state and its revisit trigger. |
| `docs/decisions/2026-09-historical-activity-identity.md`, `docs/decisions/2026-09-operation-history-scope.md`, `docs/decisions/2026-09-project-update-operation-history.md`, `docs/decisions/2026-09-history-stage-a-deferrals.md`, `docs/decisions/2026-09-project-header-history-controls.md`, `docs/decisions/2026-09-operation-history-retired-actions.md`, `docs/decisions/2026-09-operation-history-retention.md`, `docs/decisions/2026-08-project-create-edit-archive-surface.md`, `docs/decisions/2026-08-activity-feed-composes-from-parts.md` | modify | Dated amendments: a project may be absent under the Activity anchor; a history outlives the project; creation now recorded; retry cache closed; the recovery state; the new permanent conflict and its ordering; retention exempts nothing but pruning cannot reach an absent project's history; create answers a receipt; project-name fallback. |
| `docs/architecture/contracts/overview.md`, `docs/architecture/contracts/why.md`, `docs/architecture/contracts/what.md`, `docs/architecture/contracts/how.md` | modify | Name the `project.add` payload and its directional results; link the creation-history decision; update operation counts and key-symbol links. |
| `docs/architecture/repositories/overview.md`, `docs/architecture/repositories/why.md`, `docs/architecture/repositories/what.md`, `docs/architecture/repositories/how.md` | modify | Document the Activity/history anchors, absent-project integrity rules, and the restricted project/page removals. |
| `docs/architecture/domain/overview.md`, `docs/architecture/domain/why.md`, `docs/architecture/domain/what.md`, `docs/architecture/domain/how.md` | modify | Document project creation recording, the project-add executor/preflight, actor-only absent-project summaries, and the unchanged acyclic service graph. |
| `docs/architecture/mcp-tools/overview.md`, `docs/architecture/mcp-tools/why.md`, `docs/architecture/mcp-tools/what.md`, `docs/architecture/mcp-tools/how.md` | modify | Update `create_project`'s receipt result and the operation-history tool descriptions without changing the 37-tool registry. |
| `docs/architecture/prototype-host/api/overview.md`, `docs/architecture/prototype-host/api/why.md`, `docs/architecture/prototype-host/api/what.md`, `docs/architecture/prototype-host/api/how.md` | modify | Document the project creation envelope and absent-project history route behavior. |
| `docs/architecture/prototype-host/live-updates/overview.md`, `docs/architecture/prototype-host/live-updates/why.md`, `docs/architecture/prototype-host/live-updates/what.md`, `docs/architecture/prototype-host/live-updates/how.md` | modify | Document creation Undo/Redo frames routed by the former root and excluded from project-record events. |
| `docs/architecture/prototype-host/mcp-transport/what.md` | modify | Include `project.add` in the existing project permission family description; the published family map and transport remain unchanged. |
| `docs/architecture/web/core/overview.md`, `docs/architecture/web/core/why.md`, `docs/architecture/web/core/what.md`, `docs/architecture/web/core/how.md` | modify | Document the shared create result contract and shell caller's receipt handling through the gateway. |
| `docs/architecture/web/projects/overview.md`, `docs/architecture/web/projects/why.md`, `docs/architecture/web/projects/what.md`, `docs/architecture/web/projects/how.md` | modify | Document create receipts, missing-project state, recovery rendering and once-per-revision route reconciliation. |
| `docs/architecture/testing/overview.md`, `docs/architecture/testing/why.md`, `docs/architecture/testing/what.md`, `docs/architecture/testing/how.md` | modify | Add the project-creation E2E journey and the changed acceptance coverage to the test inventory. |
| `docs/guides/mcp-setup.md` | modify | Correct the live `create_project` example/result description to `{ project, operation }`. |
| `.prototype/notes.json` | modify | Record friction observed in the seeded browser and MCP real-use pass for Slice 42. |
| `docs/architecture/overview.md` | modify | Include reversible project creation in the root architecture summary of scoped history. |
| `docs/roadmap/planned/34-undo-redo-and-archive.md` | modify during close, after `roadmap.mjs complete` moves Slice 42 out of `active/` | Add the dated Stage C closure note, the `project.created` Activity anchor choice, and the retry-cache amendment. This is deliberately not edited while Slice 42 is the active plan, per the roadmap's single-planning-document rule. |
| `AGENTS.md` | modify only if a sentence becomes false | No new tool (count stays thirty-seven) and `ProjectService`'s recorder edge is already named. |
| `docs/roadmap/goals.md`, this plan | modify | Stage C complete at close; Outcome. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `contracts/project-history.test.ts`: `project.add` parses a root with Home and a sub-project with Work; rejects a page of another project, a wrong page kind, extra keys | Payload is strict and self-consistent. |
| `contracts/undo.test.ts`: `operationProjectOf`/`operationSubjectOf` for `project.add`; result unions accept both outcomes | One owner rule. |
| `contracts/tool-permissions.test.ts`, `row-history.test.ts`, `index.test.ts`: `project.add` is a project-family kind with `projects.write` and the full result unions contain twenty-three operations | Every exhaustive count and grant remains true. |
| `contracts/live.test.ts`: the two new types are not record events | Routing stays by root. |
| `repositories/data-store.test.ts`: the anchored document loads; each negative case in acceptance step 4 fails with its message | The anchors are the only exemptions. |
| `repositories/repositories.test.ts`: `ProjectRepository.remove` deletes inside a unit and rolls back with it | Restricted removal is transactional. |
| `domain/operation-history.test.ts`: pruning by cap and expiry in every other history of the same actor leaves an undone `project.add` untouched | The history anchor survives retention. |
| `domain/project-service.test.ts`: create records one `project.add` in the new project's history (not the parent's), labelled, answering the receipt; a failed create records nothing; Activity unchanged | Recording boundary. |
| `domain/project-history.test.ts`: Undo removes exactly project + page; **each preflight row** refuses with its conflict and writes nothing (called directly, including the rows callers normally meet as `history_not_next`); Redo recreates same ids with original `createdAt` and clock `updatedAt`; Redo refuses on an existing id and a missing parent; a project created `archived` is not self-blocked | Executors. |
| `domain/operation-history-service.test.ts`: full create→Undo→Redo→Undo cycle via `transition`; same-actor later write → `history_not_next`; another actor's history (even after it undid everything) → through `transition`, reason `history_retired` with **no Activity event, no frame**, cursor moved, revision +1; a preflight conflict answers `history_conflict`, never a 500; a forced second-run refusal rolls the unit back (no audit line); creation with the clock set forward, then `reset`, then creation Undo commits (commit-time integrity accepts the earlier-stamped Undo); archived parent → `history_blocked` both directions, per-entry `blockedBy` names it; Q-reparent Redo after creation Undo → `missing`, not retired; `summary` at an absent id — own actor gets Redo, another user in the same workspace, another agent connection, a foreign workspace and a never-existed id get not-found; one Activity event per executed transition, recorded before removal, captured root correct; injected persistence failure leaves project, history and Activity unchanged | Service semantics, ordering and disclosure. |
| `domain/activity-service.test.ts`, `dashboard-service.test.ts`: feed and agent tile read a `project.creation_undone` event and a task event inside a removed project; `projectName` is the captured label for the former, omitted for the latter | Audit readability without wrong names. |
| `prototype-host/api/routes.test.ts`: POST answers `{ project, operation }` 201; summary route 200 for the own actor, 404 for others, at an absent id; transitions over HTTP | Transport. |
| `prototype-host/live-updates.test.ts`: Undo and Redo of a sub-project creation each publish one frame with the root's `rootProjectId` | Refresh reaches the former root. |
| `mcp-tools/contract.test.ts`, `registry.test.ts`: `create_project` result; creation Undo/Redo via tools; a connection lowered to `projects.read` is forbidden before any detail | MCP parity and grant order. |
| `web/.../project-workspace-store.spec.ts`: `not_found` on load → `missing`; a frame's refresh that gets `not_found` → `missing` and project cleared; a later successful refresh clears it; a transport error on refresh stays quiet | Missing state is authoritative; other failures unchanged. |
| `web/.../project-workspace-shell.spec.ts`: missing + Redo `project.add` → recovery section with controls; missing without it → *Project unavailable*; Undo result without a frame → one reload → recovery; Redo result without a frame → one reload → project; no reload loop on repeated summaries at the same `historyId:revision`; a cold load of the recovery URL starts no extra reload; a stale Redo `project.add` summary while the project is present reloads exactly once; `history.load` is never called by the reload | Recovery state and both dropped-frame paths. |
| `web/.../project-page-store.spec.ts`: a `not_found` re-read after a project's creation-undo frame sets no error | No error flash. |
| `web/.../sub-projects-store.spec.ts`, `shell-store.spec.ts`: unwrap; sub-project creation reports with the child's id and name | Reporting. |
| `web/.../history-feedback.spec.ts`: `project.add` both directions | Exhaustive wording. |
| `apps/e2e/project-creation-history.spec.ts` | Acceptance step 6 in a real browser. |

## Boundaries touched

- **Domain → repository abstractions only.** Executors are functions over repository interfaces
  and `Clock`; `OperationHistoryService` gains no service edge. `ProjectAddHistoryRepositories`
  alone exposes the row, milestone and history reads required for creation Undo; the shared
  `ProjectHistoryRepositories` for existing-project inverses stays narrow, and `ProjectService`
  gains no edge beyond its existing `OperationRecorder`. No `new Date()`.
- **Restricted deletion is an explicit integrity change,** reachable only from `revertProjectAdd`,
  tested, and documented on the repository interface — Slice 34's condition for creation Undo.
- **MCP calls domain.** Tools change result and descriptions only.
- **Contracts once.** `project.add` and its results live in `project-history.ts`;
  `ProjectWriteResult` is reused, not duplicated for create.
- **Components → gateway interfaces.** The shell reads `ProjectWorkspaceStore` and
  `ProjectHistoryStore`; no HTTP. `core/` gains no feature import: `ShellStore` keeps the inert
  reporter.
- **Tokens only** in the recovery section's styles; no scattered prototype flag.

## Explicit non-goals

- Deleting any project other than an untouched one through its own creation Undo; cascading
  creation Undo to children or content; letting another actor's work be discarded.
- A deleted-project list, tombstones, or a route to find an undone project other than its URL.
- Moving creation into the parent's history, or a root-tree merged history
  (`note-2026-09-23-003`, still open).
- The retry cache (closed on paper), section label wording (`note-2026-09-23-002`), Stage D.

## Open questions

Resolved by default; each goes into the new decision entry:

- **Which history holds a sub-project's creation?** Its own, as Slice 34 and Slice 39's
  subject-owned rule say; the parent's header shows cross-owner feedback. Revisit if real use
  shows people expecting the parent's Undo to remove the child.
- **Is another actor's history a permanent refusal?** Yes: histories are never deleted, so the
  action retires rather than wedging the cursor. The person can still archive the project.
- **How does a person reach Redo after leaving the recovery URL?** Only by returning to it (Back,
  or the Open link in feedback) for 24 h. Recorded as friction to watch, not solved here.
- **Retry cache?** Closed by amendment on Slice 41's evidence; this retires a Slice 34 line, so
  the user is told at close.
- **Why not a tombstone?** A tombstone row stays visible to projections unless every read learns
  to skip it; the creation-lifecycle audit lines already exist, are never deleted, and prove both
  the workspace the project lived in and that its absence came from creation Undo.

## Revisions

- **Draft (2026-09-22):** Written from Slice 34's creation-Undo section, Slices 39 and 41
  Outcomes, and `project-service.ts`, `operation-history-service.ts`, `operation-recorder.ts`,
  `data-store.ts`, `activity-service.ts`, `page-history.ts`, the workspace shell and stores.
- **Round 1 (2026-09-22):** Three blocking, seven substantive, six minor findings; all accepted
  after checking against the code.
  - *Retirement after the audit line:* recording before removal would have committed a false
    "Undid creating" event and frame on the new permanent conflict, contradicting the
    retired-actions decision. The preflight now runs before the event.
  - *Activity anchor tied to a retained Undo record,* which Slice 34 forbids. Activity is now
    anchored by the project's own `project.created` event; only the history keeps a history
    anchor, and the never-pruned-while-absent invariant is stated and tested.
  - *Dropped Undo frame* would leave a deleted project editable: the shell's reload is now
    symmetric, once per summary revision.
  - Substantive: project-name fallback restricted to project-targeted events; MCP grant step
    rewritten (a read-only connection has no history of its own); untyped and cast callers and
    empty-history assumptions listed with a grep step; refusal cases given their real reasons
    (`history_not_next` versus preflight conflict versus retirement); disclosure claim narrowed to
    the history route; the "other history" row defined as `history.projectId` with a
    reparent-Redo `missing` test; page-store quiet `not_found` specified and asserted.
  - Minor: history anchor restricted to `undone` and undone-with-present rejected; archived rows
    named in the preflight; page row is `field-changed`; foreign-workspace limit of the seeds
    stated; §62 added; the agent-tile change is test-only; the Slice 34 candidate gets a dated note
    for the retired retry cache.
- **Round 2 (2026-09-22):** No blocking findings; three substantive, four minor, all accepted.
  - The `project.created` anchor proved existence, not Undo, so a hand-deleted seeded project
    would have loaded. The anchor now requires the newest lifecycle event (list order,
    document-order tie-break) to be `project.creation_undone`, with negative fixtures.
  - The preflight has to sit inside `transition`'s existing `OperationExecutionRefused` handling,
    or a refusal escapes as a 500; a second-run refusal after the audit line now rolls back
    instead of retiring. The executors' repository set grows explicitly (`histories`,
    `milestones`).
  - The dropped-frame reload is keyed on `historyId:revision`, gated on the route id, the store not
    loading and the project present or `missing`, and reloads only `ProjectWorkspaceStore`; specs
    cover a cold recovery-URL visit and a stale summary.
  - Minor: `ActivityRepository.update` has no callers and the anchor's comment says lifecycle
    events are never rewritten; the agent-rename case names its grant and transport; step 4 adds
    the new negative cases.
- **Round 3 (2026-09-22):** Round-2 findings confirmed closed. Two new: ordering lifecycle events
  by `createdAt` would reject a legitimate Undo after the simulated clock moved backward (the
  anchor now uses document order, which `insert` makes causal, with a clock-backward fixture);
  and the rule did not reject a document missing its `project.created` (now required). The
  reviewer found seeds, prototype reload and the v4→v5 Activity backfill unaffected.
- **Round 4 (2026-09-22):** Reviewer confirmed both Round 3 fixes closed and found nothing
  substantive remaining. Added its optional suggestion: the clock-backward case also runs through
  `transition`, so commit-time integrity is tested, not only a document load.
- **Round 5 (2026-09-23):** Fresh review found four plan corrections, all accepted. Corrected
  §31's name and added §69 to the spec change list; named `ProjectHistoryRepositories` rather than
  the section executor seam; expanded the architecture, MCP guide and friction-note file list;
  and moved the Slice 34 note to the close, after this active plan is completed, to preserve the
  roadmap rule that only the active plan is edited during a phase.
- **Round 6 (2026-09-23):** Re-review found that adding creation-preflight repositories to the
  existing `ProjectHistoryRepositories` would widen the authority of project-update inverses and
  force unrelated `ProjectService` callers to supply repositories they do not need. Kept that
  interface narrow and added `ProjectAddHistoryRepositories` for the new executor only; the
  operation-history service receives its milestone read, and `ProjectService` gains no edge.
- **Round 7 (2026-09-23):** Re-review traced the new required milestone dependency to every
  constructor caller. Added the shared domain harness, the direct section-edit test, and the MCP
  test harness to the file list; the two host construction sites were already listed.
- **Round 8 (2026-09-23):** The first full contracts run found three exhaustive counts outside the
  project-specific tests and the operation-family comment still described only existing-project
  writes. Added `tool-permissions.ts`, the permission-family test, row-history union and
  package-entrypoint tests to the checklist, with the new total and `project.add` grant assertion.
- **Round 9 (2026-09-23):** The follow-up review found two stale architecture summaries: the root
  system map limited project history to existing-project writes, and MCP transport's family map
  description omitted creation. Added both exact documentation paths; the transport metadata shape
  itself remains unchanged.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — <what now exists and works, with file links>.

**Deliberate choices** — <decisions made and why; options rejected; links to decision entries>.

**Deviations from the plan** — <what changed mid-implementation and what caused it>.

**Deferred** — <what was left out and which slice owns it>.

**Open questions** — <what the next phase or the user must answer>.

**Documentation updated** — <the architecture folders, decisions and guides touched>.
