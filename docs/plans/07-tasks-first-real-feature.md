# Slice 7 — Tasks: the first real feature

## Goal

Make tasks creatable, completable, and editable through a temporary `/tasks` workspace while preserving the gateway boundary and visibly recovering from failed optimistic completion.

## Spec sections

- §4 — TaskRow visual variants: normal, overdue, completed, high priority, selected, and compact.
- §19 — page → feature store → gateway architecture with Angular Signals.
- §33 — task fields and the five-status model consumed by the UI.
- §34 — quick create, inline completion, inline title editing, detail drawer, priority, and due date. Drag ordering, move project, start date, and subtasks remain deferred where the slice explicitly assigns or permits them to remain.
- §63 — optimistic completion, revert, and visible error on failure.
- §69 — reusable TaskRow completion component test.

## Acceptance check

Run `pnpm test` and `pnpm lint`, then load the `busy-week` seed and open `/tasks` in the running application. Verify that:

1. existing tasks load over HTTP;
2. quick create adds a persisted task to the selected project;
3. inline title editing, priority, and due-date changes survive a page reload;
4. with the browser's network throttled so the completion request remains visibly pending, clicking an incomplete task checkbox paints it completed before the response and the completed state survives reload; and
5. with the page loaded and the browser then switched offline, clicking another task checkbox first paints it completed, then visibly restores its prior state and shows an error.

`data.json` must contain the successful mutations and must not contain the reverted completion.

## File-level change list

- `development.md` — mark Slice 7 in progress at phase start and done only after the acceptance path passes.
- `docs/plans/07-tasks-first-real-feature.md` — keep this implementation checklist and review record current.
- `apps/web/src/styles/_tokens.scss` — add semantic tokens needed by task states and drawer controls in both themes.
- `apps/web/src/app/app.routes.ts` — add the temporary `/tasks` route.
- `apps/web/src/app/app.routes.spec.ts` — prove the temporary route resolves without disturbing §68 routes.
- `apps/web/src/app/features/tasks/task-list-store.ts` — own feature-scoped signal state, gateway reads/writes, optimistic completion rollback, selection, and user-visible errors.
- `apps/web/src/app/features/tasks/task-list-store.spec.ts` — drive load, create/edit/detail mutations, optimistic timing, server reconciliation, and rollback/error behavior at the store boundary.
- `apps/web/src/app/features/tasks/task-row.ts` — render one reusable task row, derive its named visual states, and emit interaction intent without calling a gateway.
- `apps/web/src/app/features/tasks/task-row.html` — checkbox, inline title editor, metadata, and detail-selection affordance.
- `apps/web/src/app/features/tasks/task-row.scss` — token-only styling for all six named variants.
- `apps/web/src/app/features/tasks/task-row.spec.ts` — exercise completion, title editing, overdue/completed/high-priority/selected/compact state exposure, and rejection of blank titles.
- `apps/web/src/app/features/tasks/task-detail-drawer.ts` — present the selected task as an inline side drawer and emit priority/due-date changes and close intent.
- `apps/web/src/app/features/tasks/task-detail-drawer.html` — accessible labelled drawer controls.
- `apps/web/src/app/features/tasks/task-detail-drawer.scss` — token-only side-drawer layout that leaves the task workspace visible.
- `apps/web/src/app/features/tasks/task-detail-drawer.spec.ts` — prove priority, due-date clear/set, and close events.
- `apps/web/src/app/features/tasks/tasks-page.ts` — connect the page to its local store and initiate loading.
- `apps/web/src/app/features/tasks/tasks-page.html` — quick-create form, project chooser, task rows, empty/loading/error states, and adjacent drawer.
- `apps/web/src/app/features/tasks/tasks-page.scss` — token-only responsive workspace layout.
- `apps/web/src/app/features/tasks/tasks-page.spec.ts` — verify page/store wiring for initial load, quick create, completion, selection, and visible rollback errors.
- `docs/decisions/2026-08-task-date-only-due-time.md` — record the date-only-to-datetime encoding chosen for the drawer.
- `.prototype/notes.json` — record friction found in the real-browser Slice 7 exercise.

## Test plan

Write each test before its implementation and observe the intended failure.

### Store tests

- `loads projects and unarchived tasks and chooses the first project for quick create` — proves the route has the data and project context required by `CreateTaskInput`.
- `creates a trimmed task in the chosen project and selects the server result` — proves quick create uses the gateway and updates signals.
- `updates title, priority, and dueAt from gateway results` — proves editing stays behind `TaskGateway` and reconciles canonical responses.
- `marks completion immediately while the gateway promise is pending, then reconciles the server task` — proves §63 optimism rather than a fast spinner.
- `restores the exact previous task and exposes a message when completion fails` — proves rollback and visible failure.
- `does not let an older failed completion overwrite a newer mutation` — proves rollback cannot restore stale state.
- `does not let an older successful completion response overwrite a newer mutation` — proves server reconciliation cannot restore stale fields when asynchronous writes overlap.

### Component tests

- `emits completion before awaiting any persistence` — proves TaskRow is interaction-only and reusable.
- `commits a trimmed inline title and keeps editing on blank input` — protects the reusable editing behavior.
- `exposes normal, overdue, completed, high-priority, selected, and compact states independently` — proves all §4 variants are observable in DOM classes/attributes; a completed past-due task specifically remains completed rather than overdue.
- `emits priority, due-date set/clear, and close intent from the side drawer` — protects the detailed editor without a modal.
- `loads on entry and wires quick create, row completion/title editing, selection, and drawer edits to TaskListStore` — proves the temporary page integrates the feature.
- `renders the rollback error in the workspace` — proves §63's error is visible, not only held in a signal.
- `resolves /tasks to TasksPage` — proves the temporary exercise route is reachable.

### Verification checks

- Full workspace tests and lint.
- Real HTTP/browser acceptance sequence above against `busy-week`.
- Inspect `.prototype/data.json` after successful and failed mutations.
- Confirm `docs/decisions/2026-08-task-date-only-due-time.md`, `development.md`, and `.prototype/notes.json` describe the behavior actually exercised.

## Boundaries touched

- Components inject only `TaskListStore`; only that feature store injects `WORK_MANAGER_GATEWAY`. No component imports the concrete HTTP adapter (§8, §19).
- The store uses `Task`, `Project`, ids, and input types from `@cwm/contracts`; it creates no parallel entity contracts (§11).
- No domain or host files change. Domain services remain repository + `Clock` only, and MCP remains out of scope (§12).
- Every component style value uses shared CSS custom properties. New literal design values live only in `_tokens.scss` (§21).
- Prototype transport failure is surfaced through the existing `GatewayError` boundary; no prototype-mode branch is introduced (§47).

## Explicit non-goals

- No subtasks or drag ordering; both belong to Slice 20.
- No move-project interaction; Slice 20 owns it.
- No start-date editor; due date is the Slice 7 detail field exercised here, while broader scheduling arrives with later project/calendar slices.
- No project page or reusable Task List section; Slice 8 owns both.
- No event stream or cross-client refresh; Slice 16 owns live updates.
- No failure-injection development panel; Slice 12 owns it. Making the already-loaded page's host unavailable is this slice's executable failure path.
- No Storybook setup or stories; Slice 17 owns the Design Lab/Storybook milestone.
- No global store, persistence in components, new backend endpoint, or new contract.

## Open questions

None that changes the shape of the slice. The temporary all-task page will include an explicit project chooser because task creation requires `projectId`; the first listed project is only the initial selection. A due date is edited as a calendar date and encoded as the end of that UTC day so a date-only UI has deterministic behavior over the existing datetime contract. The latter is already a behavior-defining product decision, so its decision entry is an unconditional deliverable; the real exercise may revise it, but may not omit it.

## Revisions

- Initial plan written from the Slice 7 text, §§4, 19, 33, 34, 63, and 69, and the existing gateway/contracts/routes/test idioms.
- Review round 1 made the real optimistic-timing check observable through browser network controls, added stale-success reconciliation coverage, completed the six-state TaskRow matrix, and made the due-date decision log unconditional.
- Review round 2 aligned the failure-path non-goal with the browser-offline acceptance procedure.
- Diff review added same-field write ordering, distinct no-project/load-failure states, and keyboard focus/name behavior for inline title editing; all three follow-up reviews then returned no substantive findings.
- The real-browser pass found that `[value]` on a dynamic priority `<select>` displayed its first option even when the task was `medium`. A failing component test now pins the selected value and each option explicitly reflects the task priority.

## Acceptance evidence

- `pnpm test` passed across contracts, repositories, web, prototype data, domain, and host; `pnpm lint` and the token checker passed.
- With `busy-week` loaded before host startup, `/tasks` rendered eight seeded tasks and three projects over HTTP.
- Quick create produced `Slice 7 acceptance task` in `Website launch`; inline editing renamed it to `Slice 7 accepted task`, and the drawer set priority `high` plus due date `2026-09-10`. After reload, the row still rendered the new title, high priority, and due date.
- A temporary localhost-only proxy held the completion response for `Run launch QA`. During the hold the row was `task-row--completed` with `aria-busy="true"`; after the response it remained completed with `aria-busy="false"`.
- With the host stopped and the loaded page still open, the same delayed failure path made `Verify analytics events` paint completed/busy first, then restore its overdue/blocked presentation and show `could not reach the prototype host — Failed to fetch`.
- `.prototype/data.json` recorded `Run launch QA` and `Slice 7 accepted task` as `done`. The acceptance task retained `high` and `2026-09-10T23:59:59.999Z`; `Verify analytics events` remained `blocked` with no `completedAt`.

The browser controller did not expose a network-offline switch, so the failure check used the slice's own *Done when* procedure—stop the host after load—behind the same response delay used to make the optimistic state observable. This changed the plan's mechanism, not the behavior under test.
