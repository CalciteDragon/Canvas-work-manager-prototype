# How the tasks feature works

## Runtime flow

1. `TaskListSection` (in [projects](../projects/overview.md)) provides a `TaskListStore`
   for its container and tells it which `sectionId` it owns; the store lists the rows
   through `tasks.list({ sectionId })`.
2. Each row renders as `TaskRow` with the task and its flags; the section wires the row's
   callbacks to store methods. Title or background clicks select idempotently and open
   `TaskDetailDrawer`; title Enter/Space are the keyboard path. A moved mouse/pen gesture or a
   new background text selection does not select. Checkbox and Delete never select. Since slice 72
   the checkbox is the shared `.checkbox` primitive over the native input, the Delete the quiet
   trash `.tool`, and the details drawer's Close an `.icon-button` that keeps its "Close task
   details" name; the drawer's fields use `.field` and `.select`.
3. A quick create paints `pendingCreate` synchronously, then posts `{ projectId, sectionId, title }`
   and unwraps `result.task` without changing selection or opening a drawer; keyboard quick-add
   keeps focus in the add field. `create()` resolves an outcome (`added`, `refused`, `failed`,
   `unconfirmed` or `stale`). A failure owes one list read, and a same-title task whose id was
   absent at submit counts as committed. The trap: clear the field only when the pending entry
   is this submit's, or a refused second submit loses its draft. A completion
   paints first, posts second and reconciles from the same strict envelope, guarded as drawn in
   [what](what.md). Reopen uses `tasks.update(id, { status: 'todo' })`, clears `completedAt`
   optimistically and restores the exact saved fields on failure. Both toggle answers are
   guarded by the load generation, so a late answer cannot paint another section.
   Field edits (`updateFields`) claim, paint and raise `pendingMutations` at call time, and a
   failure restores `confirmedFields`, never an older optimistic value.
   The drawer's Title commits on Enter/blur, refuses blank text and keeps dirty drafts through
   live refreshes. Dirty compares against its last synced base title. Escape discards a dirty
   draft before blur; otherwise it closes. Blur after Enter does not send a second PATCH;
   explicit Enter retries a failed write.
4. Live frames naming a task the store holds trigger a quiet re-read unless a write is in
   flight, in which case the re-read waits. `pendingMutations` coalesces those reads;
   `loadGeneration` rejects answers crossing a container switch, and a read crossed by a
   mutation is queued again. Per-field revisions keep an old write from reverting a newer edit.
   A successful refresh clears the selected id when the task is absent.
5. TaskRow's **Delete** emits the task id to the section, which calls `tasks.archive`. The
   section captures the title before the write and confirms the committed archive in a toast
   with receipt Undo and Open archive. The report is marked `feedback: 'own'` so cross-owner
   reporting opens no second toast. A failed write announces no success; a successful write
   remains acknowledged when only its quiet follow-up read fails. The toast closes on navigation,
   reload or a newer write. Focus enters it only from body or the vanished Delete control, and
   dismissal returns to quick-add or another surviving control. Root Archive restores through
   the same gateway.
6. `TaskDetailDrawer` renders one native `<dialog>`. On desktop, `popover="manual"` and
   `showPopover()` place its `.lift--side` surface in the top layer, with `aria-modal="false"`.
   Under core's `SHELL_NARROW_QUERY`, `showModal()` opens `.lift--sheet` with
   `aria-modal="true"`. Switching between these widths closes and clears the selection.
   The section has no drawer column or named size container. The shell reserves the desktop
   width for its header and canvas ([mechanism](../../../decisions/2026-10-lifts-use-the-top-layer.md)).
   `contained` mode opens the Lab specimen in flow without entering the top layer.
7. Every explicit title or background selection focuses the drawer's `tabindex="-1"` heading
   after rendering; the next Tab reaches Title. The visually header-positioned Close control
   follows the fields in DOM order. `LiftFocus` records the row title and restores it, or
   quick-create when it vanished, only while focus still belongs to the drawer or body. A selected
   task disappearing on refresh uses the same fallback; section removal leaves focus to the
   canvas. Dirty Title Escape prevents native dismissal and discards the draft; another Escape
   closes. `closedby="none"` keeps native cancellation from bypassing that rule.
   The optionally injected `TaskDrawerCoordinator` is provided by `ProjectWorkspaceShell`.
   A selection claims both the coordinator and shared `LiftStack`; another list or lift closes
   it and clears its selection, so the same row can reopen. Destruction releases registrations
   without scheduling a competing focus handoff.
8. Todos does not render `TaskRow`: `TodosPageStore` serializes task complete, reopen and Delete
   writes on one slot. Task toggles reset synchronously from the optimistic store value, before
   awaiting the request. Workstreams keep their one-way Complete button; cancelled tasks have
   no toggle. Both surfaces use `aria-disabled` for pending toggles and refuse intents without
   losing keyboard focus.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `TaskRow` | component | The row | [API](../../../api/components/TaskRow.html) |
| `PendingTaskRow` | component | The "Adding…" row of a quick-add in flight | [API](../../../api/components/PendingTaskRow.html) |
| `isOverdue` | function | §4's overdue rule, shared by the row and the drawer | [API](../../../api/miscellaneous/variables.html#isOverdue) |
| `TaskDetailDrawer` | component | The drawer | [API](../../../api/components/TaskDetailDrawer.html) |
| `TaskListStore` | injectable | One container's rows and writes | [API](../../../api/injectables/TaskListStore.html) |
| `TaskDrawerCoordinator` | injectable | The shell's selected Task List and open state | [API](../../../api/injectables/TaskDrawerCoordinator.html) |
| `TaskGateway` | interface (core) | The seven task operations | [API](../../../api/interfaces/TaskGateway.html) |

## Dependencies

**Depends on**

- [core](../core/overview.md) — `WORK_MANAGER_GATEWAY.tasks`, `LIVE_UPDATES`,
  `OPERATION_HISTORY_REPORTER` and `reportedWrite` (never the projects feature, which implements
  the reporter).
- [contracts](../../contracts/overview.md) — `Task`, `CreateTaskInput`, `UpdateTaskInput`,
  `TaskStatus`, `TaskPriority`.
- Shared `LiftFocus` and `LiftStack` ([web](../overview.md)) provide focus restoration and
  one-lift ownership to the Task List section. The section reads core's `SHELL_NARROW_QUERY`.

**Depended on by**

- [projects](../projects/overview.md) — the shell provides the coordinator and reserves desktop
  drawer width, the Task List section provides the store; the
  Todos page owns its own row and store.
- [prototype-tooling](../prototype-tooling/overview.md) — the Design Lab's live panels
  render the six variants from fixtures.
- [testing](../../testing/overview.md) — the `TaskRow` story set and the web e2e journey.

## Invariants and lints

- **Optimistic writes are guarded and revert visibly** — `task-list-store.spec.ts`,
  including a delayed response and a failed one.
- **A stale read never paints** — TaskListStore's pending-mutation/load-generation cases;
  TodosPageStore separately uses a write epoch for its projected chronology.
- **Six variants, pinned by stories and `task-row.spec.ts`.**
- **Tokens only** in `task-row.scss` and `task-detail-drawer.scss`.
- **Native top-layer behavior is browser-tested** — `task-lifts.spec.ts` covers viewport
  placement, phone inertness, heading-to-Title focus, forced closes, live removal and breakpoint
  changes in both themes. Unit specs stub native calls and check component decisions.
- **Quick create never selects** — `task-list-store.spec.ts`; **one drawer belongs to the
  shell** — `task-drawer-coordinator.spec.ts`, with standalone sections covered by the section spec.

## Commands

```bash
pnpm --filter web test -- tasks
pnpm storybook                       # TaskRow's six variants with the theme toolbar
pnpm --filter @cwm/e2e e2e task-lifts.spec.ts
```

Manual check the store's tests cannot replace: set Network Delay to 3 s in the panel,
tick a task, watch it stay complete while the request waits; set Failure Rate to 100 %,
tick another, watch it revert with the error and no `completedAt` in `data.json`.

## Changing it

- **A new row interaction:** the callback on `TaskRow`, the store method with its
  optimistic paint inside the guard, the gateway member if new, and a spec for the
  failure path first.
- **Subtasks (Slice 20):** the `subtasks` flag already exists in `PrototypeSettings`;
  `parentTaskId` already exists on the contract; the host already follows a parent's
  section.
- **The trap:** a `[checked]` binding alone cannot undo a refused native toggle. TaskRow resets
  immediately after emitting to its model's value; Todos resets after the store's synchronous
  optimistic prefix and before awaiting, then reads the current row again after settlement to
  handle an immediate refusal that skips an optimistic render. A late reset from a captured item
  can paint stale status onto a settled box.


Slice 77 adds [taskMeta](../../../api/miscellaneous/variables.html#taskMeta), the pure status/priority/date/overdue formatter shared by TaskRow, Todos and dashboard widgets. TaskRow's optional link input renders its title as a RouterLink and refuses selection. Its two-level editable title ancestry, toggle reset and Delete behavior remain intact. The row body uses display: contents to retain the DOM hooks on the global object-row grid.
