import type { Task } from '@cwm/contracts';

/** §4's overdue rule, shared by the row and the drawer so the two never disagree. */
export const isOverdue = (task: Task, now: number): boolean =>
  task.dueAt !== undefined && task.status !== 'done' && task.status !== 'cancelled' && Date.parse(task.dueAt) < now;
