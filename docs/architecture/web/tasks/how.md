# How the tasks feature works

## Runtime flow

1. `TaskListSection` (in [projects](../projects/overview.md)) provides a `TaskListStore`
   for its container and tells it which `sectionId` it owns; the store lists the rows
   through `tasks.list({ sectionId })`.
2. Each row renders as `TaskRow` with the task and its flags; the section wires the row's
   callbacks to store methods and opens `TaskDetailDrawer` for a selected row.
3. A quick create posts `{ projectId, sectionId, title }` and unwraps `result.task`; a completion
   paints first, posts second and reconciles from the same strict envelope, guarded as drawn in
   [what](what.md). Title Escape closes editing before the ensuing blur, so it records no write.
4. Live frames naming a task the store holds trigger a quiet re-read unless a write is in
   flight, in which case the re-read waits; a read whose epoch is stale is discarded.
5. TaskRow's **Delete** emits the task id to the section, which calls `tasks.archive`. The
   section captures the title before the write and announces the committed archive in a polite
   status outside the rows. It clears the cue on a new attempt or section switch and rejects a
   late answer for another section. The store returns the committed result even when its quiet
   follow-up read fails; a failed write announces nothing. A fresh list containing the task
   after Undo or Restore withdraws the cue. Root Archive restores through the same gateway.
6. The Task List section's host is a named size container, `task-list`. Narrower than `42rem`
   (the list's working minimum plus `--layout-drawer-width`), `task-list-section.scss` stacks
   `TaskDetailDrawer` below the rows and `task-detail-drawer.scss` drops its sticky position, so
   the drawer cannot cover a row's Delete. A container rather than a media query, because a
   Grid-layout section is narrow at desktop width too; the drawer is not scrolled into view
   ([why](../../../decisions/2026-09-phone-navigation-drawer.md)).
6. Todos does not render `TaskRow`: `TodosPageStore` serializes its own Complete and Delete
   writes, removes a task subtree optimistically and reports the task's receipt to its project.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `TaskRow` | component | The row | [API](../../../api/components/TaskRow.html) |
| `TaskDetailDrawer` | component | The drawer | [API](../../../api/components/TaskDetailDrawer.html) |
| `TaskListStore` | injectable | One container's rows and writes | [API](../../../api/injectables/TaskListStore.html) |
| `TaskGateway` | interface (core) | The seven task operations | [API](../../../api/interfaces/TaskGateway.html) |

## Dependencies

**Depends on**

- [core](../core/overview.md) — `WORK_MANAGER_GATEWAY.tasks`, `LIVE_UPDATES`,
  `OPERATION_HISTORY_REPORTER` and `reportedWrite` (never the projects feature, which implements
  the reporter).
- [contracts](../../contracts/overview.md) — `Task`, `CreateTaskInput`, `UpdateTaskInput`,
  `TaskStatus`, `TaskPriority`.

**Depended on by**

- [projects](../projects/overview.md) — the Task List section provides the store; the
  Todos page owns its own row and store.
- [prototype-tooling](../prototype-tooling/overview.md) — the Design Lab's live panels
  render the six variants from fixtures.
- [testing](../../testing/overview.md) — the `TaskRow` story set and the web e2e journey.

## Invariants and lints

- **Optimistic writes are guarded and revert visibly** — `task-list-store.spec.ts`,
  including a delayed response and a failed one.
- **A stale read never paints** — the write-epoch test.
- **Six variants, pinned by stories and `task-row.spec.ts`.**
- **Tokens only** in `task-row.scss` and `task-detail-drawer.scss`.
- **The `42rem` stacking literal is in two stylesheets** — `task-list-section.scss` and
  `task-detail-drawer.scss` — and must move together; `phone-layout.spec.ts` taps Delete with
  the drawer open.

## Commands

```bash
pnpm --filter web test -- tasks
pnpm storybook                       # TaskRow's six variants with the theme toolbar
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
- **The trap:** a `[checked]` binding after a refused toggle. The browser owns that
  state; the row has to put it back explicitly, which is how a refused permission
  toggle once left a checkbox visually moved.
