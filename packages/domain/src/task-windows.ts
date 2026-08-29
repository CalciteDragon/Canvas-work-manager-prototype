import type { DashboardTask, Project, Task, TaskStatus } from '@cwm/contracts';

/**
 * The three questions every "what should I be doing?" read asks of a task, in one place.
 *
 * They were written twice before this file existed — `DashboardService` defined the open
 * set and then spelled the overdue condition out again a few lines below its own helper —
 * and Slice 14's `WorkspaceService` would have made it three. §69 lists "upcoming-work
 * calculation" as **one** domain behaviour, so it gets one definition.
 */

/** Open means "still asking for action". `done` and `cancelled` are not. */
export const OPEN_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['todo', 'in_progress', 'blocked']);

export const isOpen = (task: Task): boolean => OPEN_STATUSES.has(task.status);

/**
 * Overdue is a property of *open* work: a task finished late is not overdue, it is done.
 * An undated task can never be overdue.
 */
export const isOverdue = (task: Task, nowMs: number): boolean =>
  task.dueAt !== undefined && Date.parse(task.dueAt) < nowMs && isOpen(task);

/**
 * Soonest deadline first. Undated work sorts to the *front*, which is what
 * `DashboardService` has always done for its in-progress list — the only list either
 * caller sorts that can contain an undated task.
 */
export const byDueDate = (left: Task, right: Task): number => (left.dueAt ?? '').localeCompare(right.dueAt ?? '');

/**
 * A task as a row that can name where it came from. Shared by §24's dashboard and §54's
 * `get_upcoming_work`, which want the same projection for the same reason: a row that
 * cannot say which project it belongs to is not an answer.
 */
export const dashboardTaskFor = (task: Task, project: Project | undefined, nowMs: number): DashboardTask => ({
  id: task.id,
  projectId: task.projectId,
  projectName: project?.name ?? 'Unknown project',
  ...(project?.icon === undefined ? {} : { projectIcon: project.icon }),
  title: task.title,
  status: task.status,
  priority: task.priority,
  ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
  ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
  overdue: isOverdue(task, nowMs),
});
