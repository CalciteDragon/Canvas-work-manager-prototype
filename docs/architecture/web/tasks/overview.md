# Tasks

`apps/web/src/app/features/tasks` is the task user interface (§4, §33–§34, §63):
`TaskRow` with its six §4 variants, `TaskDetailDrawer` (a desktop side lift and phone modal sheet), and
`TaskListStore`, the feature-scoped store for **one Task List section's** tasks. The
Task List section builds on these; the root Todos page uses its own row and store because its
projection, completion lock and project-scoped receipts have different state.

**Code:** `apps/web/src/app/features/tasks` · **Tests:** `task-row.spec.ts`,
`task-detail-drawer.spec.ts`, `task-list-store.spec.ts`, `task-drawer-coordinator.spec.ts`;
`task-row.stories.ts`; `apps/e2e/task-lifts.spec.ts` ·
**Parent:** [web](../overview.md)

## Responsibilities

- `TaskRow`: normal, overdue, completed, high priority, selected and compact variants;
  reversible completion; title or background selection; and an icon-only **Delete** control that calls the
  existing soft-archive behavior.
  The seventh §4 variant, *Agent Modified*, has no data behind it and is deliberately
  absent ([decision](../../../decisions/2026-08-agent-modified-has-no-data-behind-it.md)).
- `TaskDetailDrawer`: title, priority, due date and estimate editing, committed task facts,
  dirty-draft protection and Escape handling in the native top layer. A contained mode lets the
  Design Lab render the same surface in flow.
- `TaskDrawerCoordinator`: the shell-scoped selection owner and drawer-open signal. Task Lists
  inject it optionally, so they still render alone; selecting another list clears the first.
- `TaskListStore`: quick create, complete, reopen, update and archive for the rows one
  container owns; optimistic completion toggles with exact field revert on failure; quiet re-reads on live
  frames deferred behind a write in flight. Quick create preserves the existing selection, and a
  successful quiet refresh clears a selection whose task vanished. Every write reports to the header's history through
  core's `OPERATION_HISTORY_REPORTER` with the **task's** own project — a list inside a shortcut
  writes rows its source sub-project owns (Slice 41).
- `TaskListSection`: after a committed Delete, keeps a polite archive/recovery cue outside the
  rows, including when the last task leaves. A refused write shows only the existing error.
  It owns native-mode selection, lift registration and focus entry/return for the drawer.

## Not responsible for

- Where a new task lands: the host resolves the container ([domain](../../domain/overview.md));
  the store passes the section it was provided for.
- Subtasks and drag ordering — Slice 20, a planned candidate behind the `subtasks` flag.
- The Task List *section* itself (frame, config, provision of the store) —
  [projects](../projects/overview.md).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
