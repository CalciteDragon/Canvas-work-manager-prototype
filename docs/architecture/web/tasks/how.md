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
5. Archive from the row calls `tasks.archive`; restore comes from the root Archive page
   through the same gateway, not from here.

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
  Todos page renders `TaskRow`.
- [prototype-tooling](../prototype-tooling/overview.md) — the Design Lab's live panels
  render the six variants from fixtures.
- [testing](../../testing/overview.md) — the `TaskRow` story set and the web e2e journey.

## Invariants and lints

- **Optimistic writes are guarded and revert visibly** — `task-list-store.spec.ts`,
  including a delayed response and a failed one.
- **A stale read never paints** — the write-epoch test.
- **Six variants, pinned by stories and `task-row.spec.ts`.**
- **Tokens only** in `task-row.scss` and `task-detail-drawer.scss`.

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
