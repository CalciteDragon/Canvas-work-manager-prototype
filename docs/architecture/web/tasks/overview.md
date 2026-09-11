# Tasks

`apps/web/src/app/features/tasks` is the task user interface (§4, §33–§34, §63):
`TaskRow` with its six §4 variants, `TaskDetailDrawer` (a side drawer, not a modal), and
`TaskListStore`, the feature-scoped store for **one Task List section's** tasks. The
project canvas's Task List section and the root Todos page both build on these; nothing
here knows which page it is on.

**Code:** `apps/web/src/app/features/tasks` · **Tests:** `task-row.spec.ts`,
`task-detail-drawer.spec.ts`, `task-list-store.spec.ts`; `task-row.stories.ts` ·
**Parent:** [web](../overview.md)

## Responsibilities

- `TaskRow`: normal, overdue, completed, high priority, selected and compact variants;
  inline completion; inline title editing; the per-row archive control §34 describes.
  The seventh §4 variant, *Agent Modified*, has no data behind it and is deliberately
  absent ([decision](../../../decisions/2026-08-agent-modified-has-no-data-behind-it.md)).
- `TaskDetailDrawer`: title, status, priority, due date, and the fields a drawer can
  edit without a modal.
- `TaskListStore`: quick create, complete, update, archive and restore for the rows one
  container owns; optimistic completion with revert on failure; quiet re-reads on live
  frames deferred behind a write in flight.

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
