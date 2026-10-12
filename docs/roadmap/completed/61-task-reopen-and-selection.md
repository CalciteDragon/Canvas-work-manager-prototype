<!-- completed-record id="61" closed="2026-10-01" summary="Task checkboxes complete and reopen in Task Lists and Todos; titles select, drawer titles edit, and keyboard focus survives toggles and closing" -->
# Slice 61 — Reversible task checkbox and click selection (Slice 59 Stage B)

## Goal

Stage B of the [Slice 59 umbrella](59-markdown-and-work-navigation.md): a done task's
checkbox can be unchecked to reopen it, in Task Lists and on Todos; clicking a Task List row or
its title selects the task and opens the existing drawer, where the title is now edited. The
**Details** button and inline title editing go away.

## Spec sections

- §4, §21–22: TaskRow keeps its six variants. Styles use tokens only, in both themes, with
  `--size-hit-target` on coarse pointers.
- §19–20: state stays in `TaskListStore` and `TodosPageStore`. `TaskRow` and `TaskDetailDrawer`
  stay presentational.
- §33: there is no new status. Reopen targets `todo`.
- §34: this slice **corrects** the spec in the same change. Inline title editing moves into the
  drawer. Selection is by row or title click. The checkbox reverses completion. The Todos
  paragraph that says completion is one-way changes for tasks only; workstreams stay one-way on
  Todos.
- §36: a reflection linked to a reopened task keeps its subject. The task leaves the
  completed-work picker.
- §39: progress drops after a reopen.
- §45: `completedAt` comes only from the domain's clock. The browser may clear it optimistically,
  but never invents one.
- §57: a reopen is recorded as `task.updated`. That is the existing domain verb, and it does not
  change.
- §62–63: a reopen is optimistic, with a field-scoped revert and a visible error. A live frame
  never repaints a pending row.
- §69 and §77–79: browser evidence, real use, friction notes and decision entries.

## Build

### 1. Reopen: what already exists

The domain, HTTP and MCP already support reopening. `TaskService.update(id, { status: 'todo' })`
clears `completedAt` (`task-service.ts`, "leaving it clears it"). The relevant tests already
exist:

- `task-service.test.ts`: "clears completedAt when a done task moves back to todo";
- `row-history.test.ts`: reopen Undo and Redo bring `completedAt` back verbatim, including under
  archived-section and archived-task refusals;
- `reflection-service.test.ts`: a subject is retained through reopen.

`PATCH /api/tasks/:id` and `update_task` expose this write. **No domain, contract, gateway or
MCP change is planned.** Two evidence tests are added at the transport layer, where none pins a
reopen today (test plan). Because the behaviour already exists, each one is proved sensitive
with a temporary, reverted fault rather than by being seen red first.

### 2. `TaskRow` — checkbox, selection, no inline editing

- **Checkbox** (`input[data-task-complete]`, the selector is kept):
  - It is enabled whether or not the task is done, and is absent when the row is `readOnly`.
  - While `pending`, it is **not** natively disabled. It carries `aria-disabled="true"`, and the
    handler refuses the intent and resets the box. A natively disabled focused control drops focus
    to `body` (the HTML focus fix-up rule), and then a keyboard user could not press Space a second
    time to undo their own toggle.
  - Its accessible name is `Complete <title>` when the task is not done, and `Reopen task <title>`
    when it is.
  - `(change)` calls `toggleCompletion(event)`:
    - it emits `completionRequested` when the task is not done, and the new `reopenRequested`
      when it is;
    - then it sets the native `checked` back to `completed()`.

    The browser has already moved the box, so this puts it back to the model's value. The model's
    optimistic patch, or its revert, is what moves the box after that. This is the trap that
    `how.md` names: a refused or no-op intent would otherwise leave a box ticked that nothing
    persisted.
  - A cancelled task keeps today's Task List behaviour. Its box is unchecked, and checking it
    completes the task.
- **Selection:**
  - The title becomes `button[data-task-title]`. Its visible text is the title, and its
    accessible name is `<title>, open details`, so it begins with the visible text (WCAG 2.5.3).
    It carries `aria-current="true"` when the row is selected.
  - Click, Enter and Space emit `selectedRequested`. The button is native, so Enter and Space come
    for free.
  - Selecting is **idempotent, not a toggle**. Choosing the selected row again keeps the drawer
    open, and the drawer's Close is the way out. This is why the button does not use
    `aria-pressed`.
  - Clicking the row's background (`(click)` on the `article`) emits `selectedRequested` once,
    unless either of these is true:
    - the target is inside `button, input, a, select, textarea, label` in the row (the title
      button emits for itself; the checkbox and Delete never select);
    - the row is `readOnly`.

    The `article` gets no role or tabindex: the title button is the keyboard path, and there is no
    interactive wrapper around nested controls. The row gains `[attr.data-task-id]` so that focus
    can be returned to it.
  - **A pointer gesture that moved is not a selection.**
    - The whole `app-task-row` is the section's `cdkDrag` host, and people select title text by
      dragging. So the row records the position at `pointerdown` (as a capture listener on the
      `article`).
    - The capture listener records `pointerType` and the position at `pointerdown`. The `click`
      event is not relied on to be a `PointerEvent`.
    - A **mouse or pen** click on the title or the background is ignored when the pointer moved
      more than 4 px, which is under CDK's 5 px drag threshold. Touch is exempt, so a tap with
      ordinary finger slop still selects. A touch drag of 5 px or more is a CDK drag, and its
      click never reaches the row anyway.
    - A **background** click is also ignored when this gesture created a text selection. That
      means the selection's anchor and focus changed between `pointerdown` and `click`, and the
      selection now ends non-collapsed inside the row. A selection made elsewhere beforehand
      therefore does not hide a drag-select in the row. A selection that existed before the gesture never blocks a click, and the
      title button is not subject to this rule, because button text is not drag-selectable.
    - A keyboard activation (`event.detail === 0`) always selects.
    - This makes "does a drag or a text selection select the task?" a decided **no**, pinned by
      `canvas-editing.spec.ts` (acceptance step 3), rather than a question left for real use.
  - A read-only row renders its title as a `span`, as today. It has no selection, no checkbox and
    no Delete.
- **Removed:**
  - the `data-task-details` button;
  - `editing`, `draftTitle`, `titleError`, the `titleEditor` view child and its focus effect;
  - `beginEditing`, `updateDraft`, `commitTitle`, `cancelEditing`;
  - the `titleEdited` output;
  - the `data-task-title-editor` input.
- **Styling:**
  - The background click gets `cursor: pointer` on fine pointers.
  - The title button keeps today's look, and the selected variant is unchanged.
  - `.task-row__checkbox[aria-disabled='true']` and its Todos twin get the existing disabled
    treatment: the opacity token and the cursor that `.task-row__delete:disabled` uses. The
    `aria-disabled` box would otherwise lose the native disabled look and show no pending state.
  - There is no new token.

### 3. `TaskDetailDrawer` — title field and Escape

- A new first field, **Title**: `input[data-task-drawer-title]`, wrapped in its `<label>` like the
  existing fields. It adds no static id: the drawer's `id="task-drawer-title"` already repeats when
  two lists each have a drawer open, and the field does not add another.
  - It holds a `draft` and a `baseTitle`, which is the title the draft was last synced to. The
    field is **dirty** when `draft !== baseTitle`, not when the draft differs from the current
    `task().title`. Otherwise an agent's rename would make a clean field look dirty, and the next
    blur would send the stale title back over it.
  - It also remembers `lastEmitted`, the title it last sent for the current id.
  - When `task().id` changes, it resets `draft`, `baseTitle`, the error and `lastEmitted`.
  - When `task().title` changes, one of three things happens:
    - **It now equals `draft`**, as when this field's own commit lands: `baseTitle` takes the new
      value, and the field is clean.
    - **Otherwise, if the field is clean**, as when an agent renames the task: `draft` and
      `baseTitle` both take the new title.
    - **Otherwise, the field is dirty with different text**: both are left alone.
  - Blur or Enter commits the trimmed draft:
    - A blank draft shows `A task title is required.` in `role="alert"`, emits nothing and stays
      dirty.
    - A draft equal to `task().title` emits nothing, and resyncs `baseTitle`.
    - On **blur only**, a draft equal to `lastEmitted` emits nothing. Without this, Enter followed
      by the blur from Tab, Close or another row's title would send the same PATCH twice. An
      explicit Enter always commits a changed draft. That makes Enter the retry after a failure,
      and a repeated Enter only queues a domain no-op behind the first through `enqueue`.
    - Any other draft emits `titleChanged { id, title }` and records `lastEmitted`.
  - Escape in the field, when it is dirty, restores `draft` and `baseTitle` to `task().title`,
    clears the alert and calls `stopPropagation()`, so it does not also close the drawer. The blur
    that follows therefore sees no change and emits nothing. If a commit was in flight, its
    response then arrives on a clean field and is shown, and a later blur emits nothing.
  - A failed write leaves the draft in the field, still dirty. The section's existing
    `[data-tasks-error]` alert shows the reason. Pressing Enter again retries. There is no new
    input or callback for this. A successful refresh makes the field clean.
- Escape anywhere else in the drawer emits `closed`.
- The heading keeps the committed title. Priority, due date, estimate and the facts list are
  unchanged.

### 4. `TaskListStore` and `TaskListSection`

- `TaskListStore.reopen(id)` is the mirror of `complete`:
  - It refuses (returns `false` with no request) when the task is unknown, not done, or already
    in `completingIds`.
  - It claims `status`, `completedAt` and `updatedAt`, then optimistically patches
    `status: 'todo'` and **deletes** `completedAt`. Clearing is not inventing a time.
  - It adds the id to `completingIds`. The name is kept: the doc comment changes to "a
    completion toggle in flight".
  - It calls `gateway.tasks.update(id, { status: 'todo' })` inside `reportedWrite`, with
    `taskReport`.
  - On success, `patchCurrent` applies the server's fields.
  - On failure, `patchCurrent` applies the exact `previous` record, which includes its original
    `completedAt`, and sets `error`.
  - It runs inside `mutating`, so a live frame waits behind it, as it does for `complete`.
  - **It is bound to its section.** It captures `loadGeneration` at the start. If a `load()` for
    another section has run by the time the answer lands, it changes nothing:
    - no patch;
    - no `error`;
    - it returns `false`.

    `complete` lacks this guard today. It gets the same one in this slice, with its own red test,
    because the two are one interaction and the umbrella requires "late answer cannot paint
    another section".
- `TaskListSection`:
  - `(reopenRequested)="reopen($event)"` captures `section().id` before it awaits. It then calls
    `onProjectDataChange()()` only if `store.reopen(id)` applied the result **and** the section id
    is unchanged, which is the guard `archive` already uses. Header progress then re-reads, as it
    does after `complete`. `complete` gets the same section check.
  - `(titleEdited)` is removed from the row. The drawer's `(titleChanged)` goes to the existing
    `editTitle` → `store.updateTitle`.
  - `closeDrawer()` replaces the inline `store.selectTask(null)`:
    - It records the selected id and whether focus is inside the drawer, or on the body.
    - It clears the selection.
    - Then, in `afterNextRender`, and only if focus started in the drawer or on the body, it
      focuses that row's `[data-task-title]`, or the quick-create input if the row has gone. The
      section-switch guard that `archive` uses applies here too.
  - Opening the drawer does not move focus. It is a non-modal complementary region beside the
    list, as it is today.

### 5. Todos — a task checkbox; workstreams unchanged

- A task row whose status is not `cancelled` renders `input[type=checkbox][data-todo-toggle]`
  where it now renders the Complete button.
  - It is checked when the task is done.
  - Its name is `Complete <title>` or `Reopen task <title>`, as in the Task List.
  - While `writesBlocked()` it has `aria-disabled="true"`, and is not natively disabled, for the
    focus reason given in §2. The handler refuses the intent then. Complete and Delete keep their
    native `disabled`.
  - Todos has no row component, so the reset lives in the page. The template calls
    `toggle(item, $event)`. `toggle` runs in this order:
    1. It computes the intent from `item`.
    2. It calls `store.complete` or `store.reopen`. Their synchronous prefix applies the
       optimistic replace, or refuses.
    3. **Before its first `await`**, it sets `(event.target as HTMLInputElement).checked` to the
       store's current value for that id.

    A reset after the await could write a stale status onto a box whose model has already moved.
    The `[checked]` binding would not correct it, because its last value already matches.
- A cancelled task keeps its status text and has no control.
- Workstream rows keep `button[data-todo-complete]` and its one-way behaviour.
- The task row's `data-todo-link` still navigates to the canonical container. Todos has no
  drawer and no selection.
- `TodosPageStore.reopen(item)`:
  - It is a task-only mirror of `complete`, serialized on the same single write slot. It refuses
    when a completion or a Delete is in flight, or when the task is not `done`.
  - It optimistically replaces the item with `status: 'todo'`, without `completedAt`, and bumps
    `writeEpoch`.
  - It calls `gateway.tasks.update(id, { status: 'todo' })` in `reportedWrite`, reporting
    `task.projectId`. Its generation and disposal guards are identical to `complete`'s.
  - It copies `complete`'s `finally` block: clear `writing` and `completingState`, then run the
    queued re-read once.
  - On failure it restores the exact `item` and sets `writeError`.
  - It returns whether the view applied the result.
- `TodosPage.toggle(item, event)`, as described above:
  - It awaits the store's promise.
  - If the store applied the result, it calls `onProjectDataChange()()`.
  - After the write settles, if focus had been on that toggle and fell to `body`, it focuses the
    re-rendered `[data-todo-toggle]` for the same id. The toggle is not natively disabled, so
    normally nothing moves.
- `isTodoFinished` is unchanged: it still styles finished rows.

### 6. Wording and the spec

- **§34 (dated correction):**
  - "inline title editing" now reads "title editing in the detail drawer";
  - a row or title click selects the task and opens the drawer;
  - a done task's checkbox reopens it to `todo`, and the domain clears `completedAt`;
  - the Todos sentence "Completion is one-way…" is amended for tasks only. Workstreams still
    reopen from their header.
- **§4:** the component-test list says "TaskRow completion, reopen, selection and Delete".
- The walkthrough's steps 20, 24 and 25 describe the real browser path. Step 20's "Reopen the
  task" becomes "Uncheck it".

## Done when

On isolated data, in a browser, at desktop width and at 375 px with touch:

- **Task List reopen.** Checking a task and then unchecking it, then reloading:
  - the API reads `status: "todo"` and no `completedAt`;
  - header progress returns to its value before the completion;
  - the task is absent from the Reflections completed-work picker;
  - a reflection already linked to it still shows "About &lt;task&gt; · Todo" (the Reflections page's label for `todo`).
- **Todos reopen.** The same check, uncheck and reload works on Todos. A cancelled task has no
  control, and a workstream's Complete is unchanged.
- **History.** The owning project's header Undo after a reopen restores the exact earlier
  `completedAt`, and Redo clears it again. This holds from a Task List and from Todos, for a
  descendant-owned task as well.
- **Refusals.** A refused reopen, from a routed 409 on PATCH and from failure injection, restores
  the native checkbox to checked and shows the error. Nothing is written.
- **Selection.**
  - There is no Details button.
  - Clicking a title or the row background, or pressing Enter or Space on the title, opens the
    drawer.
  - The checkbox and Delete do not open it.
  - The title is edited in the drawer. Escape discards the draft, and a blank title is refused.
  - Close and Escape return focus to the row's title.
  - A text drag over a title selects nothing.
  - At 375 px the stacked drawer is closable by touch.
- **Keyboard toggles.** On both surfaces, Space toggles the checkbox, and focus stays on it, so a
  second Space reverses the first.
- **Read-only rows.** Rows in a Home shortcut have no checkbox, no selection and no drawer.

## Do not

- Add a status, a remembered pre-completion status, a reopen endpoint or tool, or a reopen
  confirmation. Do not change the domain verbs.
- Reopen workstreams from Todos, or change workstream completion anywhere.
- Add a drawer to Todos, change its links, or make Todos rows selectable.
- Add bulk completion, double-click editing, drag-handle changes or a new drawer layout. Do not
  add status, description or project-move controls to the drawer.
- Touch Markdown (Stage C), shortcuts (D) or the Sub-Projects section (E).

## Acceptance check

1. Write the specs in the test plan first, and watch each fail for the missing behaviour. Three
   kinds of test are exceptions, and the test plan names each one:
   - the transport evidence tests, which are proved with a temporary fault (Build §1);
   - the regression-guard halves that already pass today, which are named as such.

   The Todos stale-read case is not an exception. It fails first on the missing `reopen`.
2. Create `apps/e2e/task-interaction.spec.ts`. It runs against Playwright's own servers on
   isolated `nested-projects` data.
   - **Setup.** Two kinds of data are used:
     - A scratch root, **Reopen lab**, is created through the API (as `work-navigation.spec.ts`
       does). It has a Task List holding tasks A, B and C, a cancelled task D (created with
       `status: "cancelled"`), and a Reflections section. Its Todos and Reflections pages are
       enabled.
     - The seeded Renovation root, for the descendant-owned case. Kitchen's done task is
       `task-kitchen-completed`, whose `completedAt` is `2026-08-22T18:00:00.000Z`.
   - **Task List reopen.** This runs at desktop width as two tests, one per theme, using the
     browser's `colorScheme` emulation. Each test creates its **own** Reopen lab in `beforeEach`,
     so the reflection, progress and history assertions never see the other run's data. The
     assertions are the same in both.
     1. Read `[data-project-progress]` as P0.
     2. Complete A, and read P1 (P1 > P0). Record `completedAt` from `GET /api/tasks/<A>`.
     3. Add a reflection whose subject is A through the API.
     4. Open the Reflections page. Assert that `[data-reflections-subject-picker]` is visible and
        has an option with `data-subject-id=<A>`, and that the entry reads `About A · Done`.
     5. Back on Home, hold `PATCH /api/tasks/<A>` with `page.route` and uncheck A. Assert
        `not.toBeChecked()` while the request is held. Release it.
     6. Reload. Assert:
        - the API has `status: "todo"` and no `completedAt` key;
        - `[data-project-progress]` reads P0;
        - on the Reflections page, the picker is visible and no longer has A's option;
        - the entry reads `About A · Todo`.
   - **History (Task List).**
     1. Click the header Undo. Assert that `GET /api/tasks/<A>` has `status: "done"` and the
        exact `completedAt` from step 2, and that the box is checked.
     2. Click Redo. Assert that `completedAt` is absent and the box is unchecked.
   - **Refusals.**
     - Route `PATCH /api/tasks/<A>` (with A done) to a 409 with a domain-shaped body, then uncheck
       A. Assert that the box is checked again, that `[data-tasks-error]` shows the message, and
       that the API still reads `done`.
     - On Todos, set the development panel's failure rate to 100% and uncheck a done task. Assert
       `[data-todo-write-error]`, that the toggle is checked again, and that the API still reads
       `done`. A `finally` restores the rate to 0%, as `web.spec.ts`'s failure case does.
   - **Todos (Reopen lab).**
     1. Complete B through the API and open Todos.
     2. Uncheck B's `[data-todo-toggle]`. Assert that `[data-todo-status]` reads "To do", reload,
        and confirm `todo` and no `completedAt` through the API.
     3. Check it again. Assert "Done" and a `completedAt` through the API.
     4. Assert that D, the cancelled task, has no `[data-todo-toggle]`.
   - **Todos (descendant owner, Renovation).**
     1. On `/projects/project-renovation/pages/todos`, uncheck `task-kitchen-completed`.
     2. Assert that the header feedback reads exactly
        `Updated "<its title>" was recorded in Kitchen’s history.`, with a curly apostrophe.
     3. Assert that the workstream rows still have `[data-todo-complete]`.
     4. Follow the feedback's Open link to Kitchen and click Undo there. Assert that the API reads
        `done` with `completedAt` equal to `2026-08-22T18:00:00.000Z`.
   - **Keyboard toggles.**
     1. Focus A's checkbox and press Space. Wait for the PATCH response, and assert that A's box is
        still focused. Press Space again, and assert that both writes landed through the API.
     2. Repeat with B's `[data-todo-toggle]` on Todos.
   - **Selection.**
     1. Assert there is no `[data-task-details]` anywhere.
     2. Tab to A's title and press Enter. `[data-task-drawer]` appears, the title has
        `aria-current="true"`, and focus stays on it.
     3. Press Space on B's title: the drawer heading shows B.
     4. Click B's row metadata (`.task-row__metadata`): the drawer still shows B.
     5. Click A's checkbox, then C's Delete. Neither changes the drawer's heading.
     6. Drag-select across A's title text with the mouse, as `canvas-editing.spec.ts` does. The
        drawer heading is still B, and no PATCH was sent.
     7. In the drawer's title field, clear the text and blur: there is an alert, and no PATCH.
     8. Type a new title and press Escape: the draft is discarded, there is no PATCH, and the
        drawer is still open.
     9. Type `Renamed B`, press Enter, then Tab away. Exactly one PATCH is sent, and the API and
        the row read `Renamed B`.
     10. Press Escape in the drawer: it closes, and focus is on B's `[data-task-title]`.
   - **Read-only.**
     1. Create a workstream under Reopen lab, with a Task List and a task, through the API.
     2. Place a Home shortcut to that list through the API.
     3. Assert that the shortcut's rows have no checkbox, no `button[data-task-title]` and no
        Delete, and that clicking a row opens no drawer.
3. Update the existing journeys. They keep every assertion except the changed intent:
   - `web.spec.ts:66` opens the drawer by clicking the title;
   - `web.spec.ts:336`, `row-history.spec.ts:48,53`, `project-history.spec.ts:272` and
     `todos.spec.ts:253,367` use `[data-todo-toggle]` on task rows. `todos.spec.ts:253`'s helper
     keeps `[data-todo-complete]` for the Cabinets workstream;
   - `row-history.spec.ts:30–37`, `project-history.spec.ts:101–104,389–391,548–550` rename through
     the drawer's `[data-task-drawer-title]`;
   - `canvas-editing.spec.ts:1116–1124`: a text drag over the title must not start a section
     drag, must not send a task PATCH, and must not open `[data-task-drawer]`. This replaces the
     absent-editor assertion, which no longer means anything;
   - after the routed failure, the updated `web.spec.ts:336` also asserts that the toggle reads
     unchecked again.

   Add a 375 px touch case to `phone-layout.spec.ts`:
   - tap a title to open the stacked drawer. Playwright's `tap()` has no movement, so the
     tap-slop rule is proved by the unit test, not here;
   - tap the drawer's Close;
   - assert focus is on that title;
   - assert there is no horizontal overflow;
   - tap a done task's checkbox, and assert it reopens through the API.

   It does **not** assert that the drawer is in view after the tap. The
   [phone drawer decision](../../decisions/2026-09-phone-navigation-drawer.md) leaves the stacked
   drawer unscrolled, which is known friction (`note-2026-09-29-005`). With Details gone, a title
   tap is now the only way to open the drawer. The decision entry records that trade-off, and
   real use re-evaluates it. Changing it is not in this slice.
4. Run `pnpm test` and `pnpm lint` (which includes `docs:check`). Run `pnpm build` and record the
   initial bundle against the 1050 kB budget. Then run `pnpm storybook:build`, `pnpm docs:api`,
   the targeted Playwright files, and the full `pnpm e2e` once. Run
   `pnpm --filter @cwm/prototype-host acceptance` and `mcp-acceptance`, because the transport
   reopen evidence sits beside them.
5. **Real use.**
   - Set `CURRENT_SLICE = 61`.
   - Start `pnpm dev:host` with an isolated `nested-projects` `CWM_DATA_FILE`, and `pnpm dev:web`
     separately.
   - Complete and reopen tasks on Kitchen and on Todos, and rename tasks in the drawer.
   - Select tasks with a mouse and with the keyboard, including dragging a task between two
     lists, and confirm that a drag never selects.
   - Ask an MCP client to "reopen" a task, and confirm that it uses `update_task status:"todo"`.
   - Record the friction, and a verdict on selection versus toggling, in `.prototype/notes.json`.
   - Report the exact commands, the results and the limits in Outcome.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/features/tasks/task-row.ts`, `.html`, `.scss` | modify | Toggle intent with native reset, `reopenRequested`, title selection button, background click with the pointer and selection rules, `data-task-id`, `aria-disabled` pending style; remove inline editing and Details. |
| `apps/web/src/app/features/tasks/task-row.spec.ts`, `.stories.ts` | modify | The cases below, with the inline-editing cases removed. The existing Completed story now shows an enabled box named "Reopen task". A new `Reopening` play story unchecks a done row with a pending flag. |
| `apps/web/src/app/features/tasks/task-detail-drawer.ts`, `.html`, `.scss`, `.spec.ts` | modify | Title field (draft, dirty, blank refusal, Escape), drawer Escape → `closed`. |
| `apps/web/src/app/features/tasks/task-list-store.ts`, `.spec.ts` | modify | `reopen`, with an optimistic clear, an exact revert and the queue behind live frames. |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.ts`, `.html`, `.spec.ts` | modify | Reopen wiring and the progress callback; drawer `titleChanged`; `closeDrawer` focus return. |
| `apps/web/src/app/features/projects/pages/todos-page.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | modify | Task checkbox and its `aria-disabled` style, `toggle(item, event)`, cancelled task without a control, workstream button kept. |
| `apps/web/src/app/features/projects/pages/todos-page-store.ts`, `.spec.ts` | modify | `reopen`, serialized on the same slot, generation-guarded. |
| `apps/web/src/app/prototype/design-lab/panels/live-panels.html`, `.ts` | modify only if a binding breaks | The gallery still renders six variants and the drawer; nothing about the editor remains there. |
| `apps/web/src/app/features/projects/project-workspace-shell.spec.ts` | modify | Update its Todos completion integration path to the task checkbox selector. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 61` when implementation starts. |
| `apps/prototype-host/api/routes.test.ts` | modify | Reopen evidence over HTTP. |
| `packages/mcp-tools/src/contract.test.ts` | modify | Reopen evidence over MCP. |
| `apps/e2e/task-interaction.spec.ts` | create | Acceptance step 2. |
| `apps/e2e/web.spec.ts`, `row-history.spec.ts`, `project-history.spec.ts`, `todos.spec.ts`, `canvas-editing.spec.ts`, `phone-layout.spec.ts` | modify | Acceptance step 3. |
| `.prototype/notes.json` | modify on real use | Friction and the selection verdict. |
| `docs/decisions/2026-09-task-checkbox-reopen-and-selection.md` | create | §78. It records:<br>• reopen goes to `todo`, not a remembered status;<br>• the checkbox appears on both surfaces;<br>• a cancelled task on Todos has no control;<br>• `aria-disabled` rather than `disabled` while pending, to keep focus;<br>• selection is idempotent, not a toggle;<br>• the background click, and moved or text-selecting gestures that do not select;<br>• title editing lives in the drawer;<br>• opening does not move focus, so the narrow stacked drawer is not scrolled into view (a known trade-off);<br>• workstreams are unchanged;<br>• a reopen keeps the domain's `Updated "…"` history label, and whether it should say "Reopened" is a question for real use. |
| `docs/decisions/2026-09-todos-chronology-and-canonical-navigation.md`, `2026-08-task-status-transitions-and-archive.md`, `2026-08-project-create-edit-archive-surface.md` | modify (dated amendment) | Todos task completion is reversible; the UI now exposes reopen; TaskRow no longer demonstrates inline title editing. |
| `docs/decisions/README.md` | modify | Index the new entry and the amendments. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify | Dated §34 correction; §4 component-test wording. |
| `docs/architecture/web/tasks/overview.md`, `what.md`, `how.md`, `why.md` | modify | Responsibilities (selection, reopen, drawer title); the diagram and the sequence gain reopen; runtime flow steps 2–3 and 7; the "trap" now names the toggle reset; `why` links the decision. |
| `docs/architecture/web/projects/what.md`, `how.md` | modify | The Todos row now has a task checkbox with reopen. |
| `docs/architecture/testing/what.md`, `how.md` | modify | The E2E inventory gains `task-interaction.spec.ts`. |
| `docs/guides/first-milestone-walkthrough.md` | modify | Steps 20, 24 and 25. |
| `docs/guides/mcp-setup.md` | modify | One line: reopen is `update_task` with `status: "todo"`. |
| `docs/roadmap/planned/59-markdown-and-work-navigation.md`, `docs/roadmap/goals.md`, generated `progress.md` | modify | Stage B → Slice 61 link and Now. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `task-row.spec.ts: a done row's checkbox is enabled, named "Reopen task …", and emits reopenRequested` | It fails today: the box is disabled. |
| `…: an open row emits completionRequested; while pending the box is aria-disabled, not disabled, emits nothing and resets` | Intent by model state, and the focus-keeping pending state. It fails today, because the box is natively disabled. |
| `…: after either intent the native checked returns to the model value` | The trap: the spec does not change the input, so the box must read back the model's value. |
| `…: title click, Enter and Space emit selectedRequested; the name is "<title>, open details"; aria-current follows selected` | Keyboard selection. |
| `…: a background click emits once; a click on the title, checkbox or Delete emits nothing extra` | "selects once" and no selection from controls. The Delete half is a regression guard and passes today. |
| `…: a mouse click that moved more than 4 px emits nothing; a touch tap that moved 6 px emits; a keyboard activation always emits` | Drags are not selections; touch slop is. jsdom may lack `PointerEvent`, so the test dispatches an `Event('pointerdown')` with `pointerType`, `clientX` and `clientY` defined on it. |
| `…: a background click that created a text selection emits nothing; an existing selection in the row does not block a title or background click` | Text selection is not selection, and a leftover selection cannot block a click. |
| `…: there is no Details button and no title editor` | The removals. |
| `…: a read-only row has no button title and a background click emits nothing` | Shortcut rows. The no-button half passes today, so it is a regression guard. The background half fails first. |
| `task-detail-drawer.spec.ts: the title field commits trimmed on Enter and on blur; unchanged emits nothing` | The new field. |
| `…: a blank title alerts and emits nothing; Escape restores the draft, clears the alert, and the following blur emits nothing` | Draft rules. |
| `…: Enter then blur emits once; a second Enter emits again` | No duplicate PATCH on blur, and Enter retries. |
| `…: a clean field follows an agent rename, and the next blur emits nothing` | Dirty is measured against `baseTitle`. |
| `…: Escape while a commit is in flight, then the response lands: the field shows the new title and blur emits nothing` | The in-flight Escape path. |
| `…: Enter, the response lands while focus stays in the field, then an agent renames to Y: the field shows Y and Enter emits nothing` | A commit's own response cleans the field. |
| `…: a dirty draft survives a same-id task input change; a new id resets the draft, the alert and lastEmitted` | A live refresh cannot erase typing. |
| `…: Escape outside the title field emits closed; Escape in a dirty title field does not` | Close by keyboard. |
| `task-list-store.spec.ts: reopen paints todo and drops completedAt before the gateway answers, then applies the server fields` | Optimistic reopen through `tasks.update(id, { status: 'todo' })`. |
| `…: a failed reopen restores the exact completedAt and status and sets error` | Exact revert. |
| `…: reopen refuses an open, unknown or already-toggling task without a request` | Guards. |
| `…: a live frame during reopen waits and lands once after it settles` | §62 ordering. |
| `…: an older reopen answer does not overwrite a newer title edit` | Field-scoped rollback, like the existing completion case. |
| `…: reopen reports the task's own project receipt` | The history reporter. |
| `…: a reopen or complete answered after load(another section) patches nothing, sets no error and returns false` | Late answer cannot paint another section. The complete half fails first, because the guard is missing today. |
| `task-list-section.spec.ts: a successful reopen tells the page; a failed one does not` | Progress refresh. |
| `…: a reopen answered after the section input changes does not tell the page` | The section-side guard. |
| `…: after a successful reopen the native box reads unchecked; after a successful complete it reads checked` | The success-path reset through a real `TaskRow`. |
| `…: clicking a title opens the drawer; the drawer's title change goes to updateTitle` | Wiring. |
| `…: Close returns focus to the row's title, or to quick-create when the row is gone` | Focus return. |
| `todos-page-store.spec.ts: reopen paints To do, writes update(status todo), applies the record and reports the owner` | The Todos write. |
| `…: a failed reopen restores the exact item with writeError; a late answer after load() paints nothing` | Revert and generation. |
| `…: a read already in flight when reopen starts is discarded; a frame during reopen re-reads once after it settles` | §62 ordering on Todos. |
| `…: reopen is refused while a complete or Delete is in flight, and for a non-done task` | Serialization. |
| `todos-page.spec.ts: a done task renders a checked toggle named "Reopen task …"; a cancelled task none; a workstream keeps Complete` | Rendering. |
| `…: unchecking calls reopen and refreshes project data on success; the native box reads unchecked after success, and checked again after a refusal or while writes are blocked` | Wiring, and the trap on both paths. |
| `…: while writes are blocked the toggle is aria-disabled, not disabled, and emits no write` | Focus-keeping block. |
| `apps/prototype-host/api/routes.test.ts: PATCH status todo on a done task clears completedAt and returns its receipt; a foreign-workspace id answers 404 and changes nothing` | HTTP evidence. Proved with a temporary fault that keeps `completedAt`. The unknown-id 404 is already covered at line 367, so it is a regression guard. |
| `packages/mcp-tools/src/contract.test.ts: update_task reopens a done task with tasks.write and records it in the owner's history` | MCP evidence. Proved with the same kind of fault. The missing-grant refusal with no write is already covered for every tool by the generic grant loop (`OTHER_GRANTS`, around line 806). This test cites that coverage and does not duplicate it. |
| `task-interaction.spec.ts` and the updated journeys | Real focus, a native checkbox in a browser, routed failures, reload, history and touch. |

## Boundaries touched

- **Gateway only.** Reopen uses the existing `tasks.update`. There is no new gateway member,
  contract, domain rule or MCP tool.
- **Presentational components.** `TaskRow` and `TaskDetailDrawer` keep inputs and outputs only.
  The stores own the writes, and `TodosPageStore` stays page-provided.
- **Domain.** Untouched. `completedAt` stays the clock's: the browser only clears it, and the
  server's answer replaces the optimistic value.
- **Tokens only** in the changed `.scss`. There is no prototype-mode branch, and `core/` is
  untouched.

## Explicit non-goals

- A drawer status selector. Reopening to `in_progress` or `blocked` stays a PATCH or MCP
  operation.
- Moving focus into the drawer when it opens, or giving the drawer a modal trap.
- Toggling the drawer closed by clicking the selected title again.
- Selection or a drawer on Todos.
- Reworking the drag handle or CDK drag behaviour beyond the 4 px no-select rule.

## Open questions

None blocking. These are the defaults, recorded in the decision entry and confirmed or revised by
real use:

- Reopen goes to `todo`.
- Selection is idempotent and opening does not move focus.
- A cancelled Todos task has no control, while in a Task List checking a cancelled task completes
  it (that behaviour is unchanged).

## Revisions

- **Initial plan (2026-09-30):** Derived from the umbrella's Stage B after reading the following:
  - `TaskRow`, `TaskDetailDrawer`, `TaskListStore` and `TaskListSection`;
  - `TodosPageStore` and `TodosPage`;
  - the domain's reopen, history and reflection tests;
  - the Reflections page subject rendering;
  - spec §§4, 33, 34 and 63;
  - the web/tasks architecture;
  - every e2e selector that uses Details, the inline editor or the Todos Complete button.

  The code differs from the umbrella in two ways:
  - The drawer has **no title field** today, so "the drawer's existing title field" has to be
    built. That is §3 above.
  - Reopen already exists below the browser. So this slice adds transport evidence, not domain
    work.
- **Review round 1 (2026-09-30):** Each finding was checked against the code before revising.
  - **Late answers.** `TaskListStore.complete` has no `loadGeneration` check, and the section
    notifies the page without a section check. Reopen and complete both get the store-side guard
    and the section-side guard, with red tests.
  - **The drawer's double commit.** Enter followed by blur would have sent the same title twice.
    `lastEmitted` now suppresses the repeat, and refocusing the field clears it, so a failure can
    still be retried.
  - **Where the Todos reset happens.** Todos has no row component, so the reset is placed
    explicitly in `toggle(item, event)`, before the first `await`. The success-path reset is now
    tested on both surfaces.
  - **Keyboard focus.** A natively disabled focused checkbox drops focus. Pending and blocked
    toggles now use `aria-disabled` and are refused in the handler. An e2e case does
    Space, Space on both surfaces.
  - **Seed facts.** The done Kitchen task is `task-kitchen-completed` (`2026-08-22T18:00:00.000Z`).
    The exact cross-owner feedback string is asserted, and each step names its root.
  - **Todos live-frame and stale-read test** added.
  - **Minor fixes:**
    - the picker is asserted visible, with A present before the reopen and absent after;
    - the setup has a third task and a cancelled task;
    - the theme runs are explicit;
    - progress is measured as P0, then P1, then P0 again;
    - the failure rate is reset in a `finally`;
    - the transport tests now include a foreign id, and cite the existing grant loop;
    - a moved or text-selecting gesture is decided not to select, and is pinned;
    - the narrow-drawer trade-off and the `Updated` history label go to the decision entry;
    - the regression guards are named;
    - the `Reopening` story replaces a removal of editing stories that do not exist.
- **Review round 2 (2026-09-30):** The reviewer confirmed that round 1's findings were resolved,
  and found two substantive problems the revision had introduced.
  - **A — a stale draft could undo an agent's rename.** Dirty was measured against
    `task().title`, so a clean field looked dirty as soon as an agent renamed the task, and the
    next blur sent the old title back. Dirty is now measured against `baseTitle`, the title the
    draft was last synced to. Two new tests cover the agent rename and Escape while a commit is
    in flight.
  - **B — a leftover text selection could block every title click.** The selection rule now
    applies only to background clicks, and only when the gesture itself created the selection.
  - **Minor fixes:**
    - `lastEmitted` applies to blur only, so Enter is the retry;
    - an `aria-disabled` pending style was added;
    - the Todos stale-read case is no longer listed as an exception;
    - each theme run creates its own Reopen lab;
    - touch taps are exempt from the 4 px rule, and phone layout has a tap-slop case;
    - the unknown-id 404 is a named regression guard;
    - Todos `reopen` copies `complete`'s `finally` block, which runs the queued re-read.
- **Review round 3 (2026-09-30):** The reviewer confirmed B–G resolved and A partly resolved.
  - **The `baseTitle` rule contradicted itself.** A commit's own response landed on a field that
    was dirty under the rule, so the response was ignored, and the field stayed dirty, so a later
    agent rename was not followed. A title that arrives equal to the draft now cleans the field.
    A new drawer test covers it.
  - **Minor fixes:**
    - `pointerType` is recorded at `pointerdown`;
    - a selection change between `pointerdown` and `click` is what counts as gesture-created;
    - tap slop is proved in the unit test, because Playwright's `tap()` cannot move.
  - With these applied, the reviewer reported nothing substantive remaining. The plan is ready to
    implement.

- **Execution and diff review round 1 (2026-10-01):** Independent agents implemented the presentational components, the two stores, and transport/browser evidence. Component behavioral red was 14 failures with 9 regressions passing; the initial implementation passed 23 component cases and the final full suite covered the two added regressions. Store behavioral red was 13 failures with 58 passing; 72 final store cases passed. Root Todos component red was four failures for absent toggles; section integration first exposed missing APIs. HTTP and MCP evidence each failed on the exact retained `completedAt` assertion under a temporary domain fault, restored immediately, then passed. Angular compiler parent-directory traversal required elevated test/build access; no dependency or runtime changes were needed.
  - A synchronous Todos refusal can settle before Angular paints the optimistic status. The immediate native reset alone then leaves the box out of sync because Angular's previous binding already equals the reverted model. A second reset reads the **current** store row after settlement, guarded by route generation, rather than the captured stale item. The regression is `resets a refused reopen and exposes the error without refreshing progress`.
  - The full web suite exposed the shell's old Todos task-button selector; its integration test now clicks the task checkbox. This adds one bounded test file to the list above.
  - No opacity token exists in the current token set. Pending toggles keep the already-used disabled opacity of 0.5 and existing cursor treatment; colors, sizes, spacing and radii use existing tokens.
  - The first browser run exposed that Playwright's `check()/uncheck()` assumes the native box remains moved synchronously. These model-owned toggles deliberately reset first, so journeys use native `click()` with eventual checked-state and persisted-field assertions. The target journeys then passed 22/22. A pre-existing phone resize case timed out in that first run and passed in the settled repeat without a production change.
  - Independent review verified and corrected stale tasks architecture references to a write epoch and `pendingWrites`; this store uses `pendingMutations`, `loadGeneration` and per-field revisions, while Todos owns the write epoch. Restore belongs to root Archive, not TaskListStore.
  - Review strengthened progress evidence to a numeric P1 > P0, waited for identity before asserting both real theme values, and used Tab from the checkbox to prove title reachability.
  - A proposed drawer optimistic-title rollback defect was checked and rejected: `updateFields` patches only after the response. A held-refusal/Enter-retry integration regression passes, proving draft retention without changing production code.
- **Independent diff review round 2 (2026-10-01):** The correctness/spec reviewer and separate boundaries/documentation reviewer re-read the actual diff after repairs. The remaining erroneous Restore attribution was removed from tasks overview; no production boundary violation was found. Documentation checks passed after the root negative-test fixtures had finished. Final review and complete browser/real-use evidence are recorded below before closure.

## Outcome

**Deliverables.** Task checkboxes now complete and reopen in [TaskRow](../../../apps/web/src/app/features/tasks/task-row.ts) and [Todos](../../../apps/web/src/app/features/projects/pages/todos-page.ts). Both stores clear completion time optimistically, restore exact fields on refusal, and discard answers after a container change. Task List titles and backgrounds select idempotently; title editing lives in the [drawer](../../../apps/web/src/app/features/tasks/task-detail-drawer.ts), with blank refusal, dirty Escape, Enter retry and focus return. The [browser journey](../../../apps/e2e/task-interaction.spec.ts) verifies progress, linked reflections, picker removal, reload, exact Undo/Redo timestamps, native refusals, keyboard selection and read-only rows. Existing phone journeys verify touch reopening and closing at 375 px.

**Deliberate choices.** The [task interaction decision](../../decisions/2026-09-task-checkbox-reopen-and-selection.md) records reopening to `todo`, keeping existing domain verbs and endpoints, model-owned checkbox resets, `aria-disabled` pending controls, and idempotent selection. Real use supports keeping those defaults: a task moved between two lists without opening details, a text drag selected no task, Space retained toggle focus, and closing returned focus to the title. Workstreams and cancelled Todos rows retain their existing behavior. Opening still leaves focus in the list; the stacked phone drawer remains partly below the fold, as already decided for phone layout.

**Deviations.** A second Todos native reset after settlement was necessary for immediate refusals that finish before Angular renders the optimistic binding; it reads the current row with a route-generation guard. The full web suite required updating one additional shell integration selector. Pending opacity uses the existing 0.5 convention because no opacity token exists. Browser helpers changed from `check`/`uncheck` to native clicks with eventual model/persistence assertions. Independent diff reviews corrected stale architecture names, removed an erroneous Restore attribution, and strengthened numerical progress, actual theme and Tab evidence. A proposed optimistic drawer-title defect did not hold against the code; a held-refusal/retry regression passed without a production change. Separate correctness/spec and boundaries/docs re-reviews returned no substantive findings.

**Verification.** `pnpm test` passed all 2,870 tests, and `pnpm lint` (including documentation and boundaries), `pnpm build`, `pnpm storybook:build`, and `pnpm docs:api` passed. The initial application bundle is 1045.80 kB, below the 1050 kB ceiling; the existing 850 kB warning remains. `pnpm --filter @cwm/prototype-host acceptance` and `pnpm --filter @cwm/prototype-host mcp-acceptance` passed, including HTTP and stdio. `pnpm e2e -- task-interaction.spec.ts phone-layout.spec.ts` passed 22/22; the full `pnpm e2e` passed 102/102. No required check was skipped. An initial existing phone resize timeout passed on the settled repeat and full run without a production change. Angular checks required elevated access for compiler traversal outside the sandbox, not changes to dependencies.

**Real use and limits.** Ran `pnpm dev:host` with `CWM_DATA_FILE` pointing to a workspace-local copy of `prototype/seeds/nested-projects.json`, and `pnpm dev:web` separately. Completed/reopened Kitchen tasks and descendant-owned Todos tasks, renamed through the drawer, used mouse and keyboard selection, and moved a task into a second list. A real official SDK HTTP client negotiated protocol `2026-07-28` and called `update_task` with `taskId: 'task-kitchen-completed', status: 'todo'`; its returned task had no `completedAt`, and the browser's live checkbox and progress changed. This verifies a concrete client tool call, not autonomous language-model tool choice. Measured DOM viewport dimensions were 1280 × 900 and 375 × 812 after accounting for the in-app browser's zoom. At 375 px Close worked, focus returned to the title, and no document overflow appeared. The selection verdict and remaining phone discoverability/history-label friction are recorded in [note-2026-10-01-002](../../../.prototype/notes.json).

**Deferred and open questions.** Markdown, canvas shortcuts, replacement of Sub-Projects, and integrated polish remain Slice 59 Stages C–F. Drawer layout and automatic scroll remain outside this slice; sustained phone use should determine whether the below-fold trade-off needs revisiting. `Updated` remains the accurate history label, with a possible more explicit reopening label left for future evidence. There are no blocking questions for this phase.

**Documentation updated.** The spec's task interaction wording, all four web/tasks files, web/projects behavior and runtime flow, testing inventory, walkthrough and MCP setup guide now describe the implemented behavior. The new decision is indexed and linked from tasks/why, and three prior decisions carry dated amendments. Slice 59, goals and the generated board link this completed Stage B. Final documentation checks and lint were rerun after the closing record was written.
