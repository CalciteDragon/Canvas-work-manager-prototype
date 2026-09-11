<!-- completed-record id="16 (follow-up)" closed="2026-08-30" summary="Closed the derived-view propagation, reconnect recovery and quiet-read races found after Slice 16" -->
# Slice 16 follow-up — live-updates correctness

> **Completed record — frozen at closeout.** Status **done**, closed **2026-08-30**.
> This file is history, not current truth: the outcome as it was recorded when the work
> closed, the slice definition from the build order, and the implementation plan as it was
> executed. Later work may have changed what it describes. The current state of every
> system it touched lives in [`docs/architecture/`](../../architecture/overview.md); the status
> board is [`progress.md`](../progress.md). The build order these records cite as
> `development.md` was split into `docs/roadmap/` on 2026-09-10.
>
> This is the correctness follow-up to Slice 16. Its outcome is recorded in [`16-live-updates.md`](16-live-updates.md); this file carries the follow-up plan as executed.

## Outcome

The post-slice audit of Slice 16 found five live-refresh defects, and this follow-up closed
them: derived-section propagation (Progress, Timeline, Sub-projects and the sidebar now
change in an open page after one HTTP-MCP batch), first-connect and reconnect recovery
(a completion committed while the stream was offline arrives on reconnect with no second
mutation), shared-store duplication (one Progress read for duplicate sections), recovery
from a failed first project-page load, and quiet-read races. The outcome narrative that
covers both halves is in [Slice 16's record](16-live-updates.md); the four §79 notes are in
`.prototype/notes.json`.

---

## Implementation plan — Slice 16 correctness follow-up — live propagation and recovery

**Status:** done

### Goal

Close every correctness, recovery, test-isolation, and living-documentation gap found in
the post-Slice-16 review without adding real-time synchronization infrastructure.

### Spec sections

§6 (one host and one data file), §8/§10 (Angular depends on application interfaces, not
transports), §30 (independent project sections), §36 (reflections), §38 (derived timeline),
§39 (derived progress), §57 (mutation activity), §62 (SSE followed by relevant refresh),
§63 (live reads must not clobber optimistic state), §71 (the stream stays disposable),
§77–§79 (real-app verification, living decisions, and friction notes).

### Acceptance check

The follow-up is finished only when all of these are executable and pass:

1. `pnpm --filter web test` proves:
   - a reflection mutation refreshes an open Reflections section;
   - a task mutation refreshes open Progress and Timeline sections;
   - a child-project mutation refreshes an open parent Sub-projects section even though
     the event names the child;
   - reconnecting the SSE source triggers one quiet recovery read in every subscribing
     feature without pretending a transport lifecycle is an activity event;
   - a failed quiet read cannot suppress a successful first load in Activity, Dashboard,
     or Shell;
   - a minimal valid `project.updated` frame routes by `type + entityId`, without
     `entityType` or `projectId`;
   - PrototypeSettings starts from defaults regardless of prior test state.
2. `pnpm --filter @cwm/prototype-host live-acceptance` still completes the MCP → committed
   SSE frame → attributed activity path inside one second.
3. `pnpm test` and `pnpm lint` exit 0.
4. In the running app, open a project containing Progress, Timeline, Reflections and
   Sub-projects; make representative HTTP-MCP task, reflection, and child-project mutations
   and verify all four visible sections change without reloading. For reconnect recovery,
   intercept and abort `/prototype/events` in the browser while leaving `/mcp` and `/api`
   reachable, commit one MCP mutation while the section is observably stale, remove the
   interception, and require the section to update after EventSource opens again **without
   a second mutation**. Record the visible before/blocked/recovered states and relevant read
   counts in `.prototype/notes.json`.

### File-level change list

| File | Responsibility |
|---|---|
| `apps/web/src/app/core/live/live-updates.ts` | Extend the application port so one subscription can also receive a connection-established notification. This notification is UI lifecycle state, not a `LiveEvent`. |
| `apps/web/src/app/core/live/prototype-live-updates.ts` | Notify subscribers on every successful `EventSource` open, including browser-managed reconnects and the first connection (closing the startup read/subscribe race). Contain subscriber failures. |
| `apps/web/src/app/core/live/prototype-live-updates.spec.ts` | Drive first-open and reconnect recovery notifications; retain retry/backoff/teardown coverage. |
| `apps/web/src/app/core/live/testing/fake-live-updates.ts` | Add `emitConnected()` for store and component tests. |
| `apps/web/src/app/features/projects/project-page-store.ts` | Retain the requested project id from the start of `load`; own separate current-project-data and workspace-project-hierarchy revisions; route project events by `type + entityId`; and serialize/coalesce all quiet page recoveries behind any active loud **or quiet** read. An event for the requested project arriving before `projectState` exists queues recovery/revisions rather than being dropped. Current-project `project.*` events bump both revisions and refresh project/canvas; unrelated workspace `project.*` events bump hierarchy only. |
| `apps/web/src/app/features/projects/project-page.ts` / `.html` | Use both store-owned revisions for section inputs and route local data/hierarchy invalidation through distinct store methods. |
| `apps/web/src/app/features/projects/project-page-store.spec.ts` | Pin minimal project-event routing, reflection/task revision propagation, child-project invalidation, and connection recovery. |
| `apps/web/src/app/features/projects/sections/section-contract.ts` | Add `projectHierarchyRevision` and `onProjectHierarchyChange` to the dynamic section input contract. |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.ts` | Carry both revisions and callbacks through computed dynamic-component inputs. |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.spec.ts` | Pin the second revision/callback identity and propagation. |
| `apps/web/src/app/features/projects/sections/activity/recent-activity-section.ts` | Observe current-project data revision only and use ActivityStore's serialized same-project read. |
| `apps/web/src/app/features/projects/sections/activity/recent-activity-section.spec.ts` | Prove revision refresh and no duplicate direct live subscription. |
| `apps/web/src/app/features/projects/sections/progress/progress-section.ts` | Observe current-project data revision only. |
| `apps/web/src/app/features/projects/sections/progress/progress-section.spec.ts` | Prove data revision refreshes progress quietly. |
| `apps/web/src/app/features/projects/sections/reflections/reflections-section.ts` | Observe data revision and notify it after successful local create. |
| `apps/web/src/app/features/projects/sections/reflections/reflections-section.spec.ts` | Prove revision refresh and local callback. |
| `apps/web/src/app/features/projects/sections/timeline/timeline-section.ts` | Observe both current-project data and workspace hierarchy revisions. |
| `apps/web/src/app/features/projects/sections/timeline/timeline-section.spec.ts` | Prove either revision refreshes Timeline. |
| `apps/web/src/app/features/projects/sections/sub-projects/sub-projects-section.ts` | Observe hierarchy revision only and notify it after successful local create. |
| `apps/web/src/app/features/projects/sections/sub-projects/sub-projects-section.spec.ts` | Prove hierarchy-only refresh and local callback. |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.ts`, `rich-text/rich-text-section.ts` | Accept the expanded common input contract while continuing to ignore revisions they do not derive from. Their direct component specs need no change because the new inputs are supplied dynamically by `ProjectSectionFrame`, and neither component reads them. |
| `apps/web/src/app/features/projects/sections/reflections/reflections-section.ts` / `sub-projects/sub-projects-section.ts` | After a successful local create, issue the appropriate data or hierarchy callback so cross-section correctness does not depend on the SSE self-echo being available. |
| `apps/web/src/app/features/activity/activity-store.ts` | Remove its direct `LIVE_UPDATES` subscription so the page revision is the single live-refresh owner; add a same-project quiet re-read used by the section. Make all reads single-flight per project context, with one trailing coalesced read after any active loud or quiet read. |
| `apps/web/src/app/features/activity/activity-store.spec.ts` | Pin loud/quiet and quiet/quiet serialization, failure preservation, trailing success, and project-switch freshness. |
| `apps/web/src/app/features/projects/sections/progress/progress-store.ts` / `.spec.ts` | Add/test a same-project quiet refresh serialized behind any active read, with one trailing coalesced refresh. |
| `apps/web/src/app/features/projects/sections/reflections/reflections-store.ts` / `.spec.ts` | Add/test the same serialized quiet-refresh behavior for reflections. |
| `apps/web/src/app/features/projects/sections/timeline/timeline-store.ts` / `.spec.ts` | Add/test the same serialized quiet-refresh behavior for derived timeline data. |
| `apps/web/src/app/features/projects/sections/sub-projects/sub-projects-store.ts` / `.spec.ts` | Add/test serialized quiet refresh plus project-switch generation protection. |
| `apps/web/src/app/features/dashboard/dashboard-store.ts` | Make all reads single-flight with one trailing coalesced read after any active loud or quiet read, so failure cannot invalidate a successful answer; recover quietly on connection. |
| `apps/web/src/app/features/dashboard/dashboard-store.spec.ts` | Pin loud/quiet and quiet/quiet serialization, failure preservation, and trailing recovery success. |
| `apps/web/src/app/core/shell/shell-store.ts` | Make all reads single-flight with one trailing coalesced recovery after any active loud or quiet read, and quietly re-read **both identity and projects** on connection. A failed recovery preserves any good identity/tree; a successful one clears stale error. |
| `apps/web/src/app/core/shell/shell-store.spec.ts` | Pin identity-failure recovery, preservation of good identity, loud/quiet and quiet/quiet serialization, and trailing success. |
| `apps/web/src/app/core/config/prototype-settings.spec.ts` | Clear `sessionStorage` before each test as well as after it so the first case is isolated from ambient/order state. |
| `docs/roadmap/completed/16-live-updates.md` | Correct the remaining concrete-adapter wording and record the defects found after the original review. |
| `docs/decisions/2026-08-live-recovery-invalidates-derived-views.md` | Record why reconnect recovery re-reads visible state rather than replaying events, and why current-project data and workspace hierarchy use separate invalidation channels. |
| `development.md` | Replace the over-broad quiet-refresh claim with the actual host-reload exception and record this follow-up’s verified result. |
| `.prototype/notes.json` | Record the required real-application exercise. |

### Test plan

Tests are written before each implementation group and observed failing for the intended
reason.

1. `PrototypeLiveUpdates`: first `open` and a later browser-managed reopen call the
   connection callback; malformed frames still do not; a throwing **event listener** and a
   throwing **connection callback** each cannot stop later subscribers.
2. `ProjectPageStore`: a minimal `{type:'project.updated', entityId:<open>}` refreshes the
   project and canvas and increments both revisions; a same-project task/reflection event
   increments only project-data revision; a `project.created` naming another id increments
   only hierarchy revision; `emitConnected()`
   queues one quiet full recovery behind an unresolved loud load, then refreshes tasks,
   header progress, project, sections, and both section revisions. A failed queued recovery
   preserves the loud result; a successful recovery cannot be overwritten by the older load
   because it starts only after that load settles. Separately, emit a matching mutation
   before the first project response establishes `projectState`; the requested id must keep
   it routable, queue one trailing recovery, and preserve both revision increments for the
   sections that mount afterward. Finally, hold one quiet full-page recovery unresolved,
   request another via a frame/connection callback, prove no overlapping project, section,
   task, or progress reads start, and require exactly one trailing recovery to become final.
3. Activity/Dashboard/Shell race cases: start a loud load, request a quiet recovery, prove
   the quiet gateway calls do not start until the loud promise settles, then reject the quiet
   read and require the loud state to remain rendered. Also prove a successful trailing
   recovery replaces the loud answer. Shell's failure-first case starts with identity lookup
   rejecting; connection recovery then re-reads and restores both identity and projects,
   while a later failed identity recovery preserves an already-good identity. For each of
   the three, request a second recovery while a quiet read is active and prove it coalesces
   into one trailing request rather than overlapping; the trailing successful response is
   the final rendered answer.
4. Each derived section store: while its first loud read is unresolved, change the revision
   and prove the quiet call is queued; after the loud result renders, reject the quiet call
   and require data/loading/error to stay unchanged. A successful trailing refresh replaces
   the loud answer and clears stale error. While one quiet read is unresolved, issue another
   revision and prove no overlapping request starts: one trailing read runs afterward and is
   the final answer. Switch projects during an old Sub-projects read and require the old
   hierarchy never to land.
5. Section routing: Reflections observes only data revision; Sub-projects only hierarchy;
   Progress and Activity only data; Timeline both. Successful local Reflection/Sub-project
   creates invoke the matching callback. One unrelated workspace `project.*` event therefore
   re-reads only Sub-projects and Timeline, not every section.
6. `PrototypeSettings`: add `beforeEach(sessionStorage.clear)` so every case establishes its
   own clean precondition; retain the independent default-state assertion and after-test
   cleanup without relying on test order.

### Boundaries touched

- Components and stores depend only on `LIVE_UPDATES` and gateway interfaces. `EventSource`
  remains isolated to the prototype adapter.
- Connection establishment is not encoded as `LiveEvent` or added to contracts: transport
  lifecycle is application adapter state, not a §57 activity mutation.
- No domain, repository, or MCP tool boundary changes. MCP still reaches the stream through
  existing domain services and `ActivityService.record`.
- No duplicated entity contracts. Section revision is view state and stays in Angular.
- No literal component design values, no new flag, and no `new Date()` in domain code.

### Explicit non-goals

- No replay log, event ids, `Last-Event-ID`, CRDTs, presence, conflict resolution, or
  cross-process stdio events.
- No redesign of section ownership or consolidation into a global project store.
- No live `AgentConnectionService.touch`; the documented `lastUsedAt` limitation remains.
- No suppression of self-echo and no connection-status UI.
- No unrelated formatting or refactoring of the terse pre-existing section stores.

### Open questions

None that changes the phase shape. A project event naming a child cannot identify every
ancestor section it affects without widening the wire contract. At prototype scale the
reversible choice is a separate workspace-project-hierarchy revision observed only by
Sub-projects and Timeline. Current-project data uses its own revision, so unrelated project
traffic does not reload Activity, Reflections, or Progress.

### Revisions

- Initial plan written from the post-Slice-16 review, the current implementation, and the
  relevant specification sections.
- Round 1: removed ActivityStore's duplicate live subscription; split current-project and
  hierarchy invalidation; added local reflection/sub-project callbacks; serialized quiet
  reads behind loud loads across every touched store; made Shell recover identity as well as
  projects; specified containment for both callback kinds; made PrototypeSettings isolation
  order-independent; and made the browser reconnect exercise reproducible with request
  interception and an observable mutation inside the disconnected window.
- Round 2: retained the requested project id so startup events queue instead of disappearing;
  required serialization/coalescing across quiet reads as well as loud ones; made a
  current-project `project.*` event affect both revisions while unrelated project traffic
  remains hierarchy-only; and expanded the file list into concrete section-contract,
  component, store, and spec paths.
- Round 3: made Activity, Dashboard, and Shell single-flight across quiet reads too; added
  their exact spec paths and quiet/quiet cases; and stated why Task List/Rich Text direct
  specs do not change when the dynamic frame supplies inputs those components ignore.
- Round 4: added the central ProjectPageStore quiet/quiet single-flight regression case and
  a §78 decision entry for reconnect re-read recovery plus the split data/hierarchy
  invalidation model.
- Round 5: no substantive findings remained; implementation approved.
- Diff review found two additional startup/shared-store edges. Duplicate Progress sections
  now deduplicate the same revision token while a genuinely newer revision still queues;
  and a first connection can heal a failed project-page load, including its project,
  canvas, tasks, progress, and stale load errors. Both gained regression coverage before
  the implementation changed.
- Final verification: `pnpm lint`, `pnpm test`, and the live acceptance script passed. In a
  real browser, HTTP MCP updated Progress, Timeline, Reflections and Sub-projects without a
  reload. A second MCP mutation committed while the browser's `:4310` stream was offline;
  reconnect alone moved Progress from 50% to 75% and updated Timeline, with no second
  mutation. The observation is recorded in `.prototype/notes.json`, and the working seed
  was restored with `pnpm prototype:reset`.
