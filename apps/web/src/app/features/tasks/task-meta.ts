import type { Task, TaskStatus } from '@cwm/contracts';

/** One ordered fragment of a task's metadata, rendered without combining its status label. */
export interface TaskMetaItem {
  kind: 'status' | 'priority' | 'due' | 'completed' | 'overdue';
  text: string;
  datetime?: string;
}

/** Surface-specific dates and status visibility; overdue is supplied by the owning read model. */
export interface TaskMetaOptions {
  alwaysStatus?: boolean;
  dueToday?: boolean;
  completed?: boolean;
  overdue?: boolean;
}

/** §33's human-readable task status. */
export const taskStatusLabel = (status: TaskStatus): string => ({
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
})[status];

/** §21's shared order for Task List, Todos and dashboard row metadata. */
export const taskMeta = (
  task: Pick<Task, 'status' | 'priority' | 'dueAt' | 'completedAt'>,
  options: TaskMetaOptions = {},
): TaskMetaItem[] => {
  const items: TaskMetaItem[] = [];
  if (options.alwaysStatus || task.status !== 'todo') {
    items.push({ kind: 'status', text: taskStatusLabel(task.status) });
  }
  if (task.priority === 'high') items.push({ kind: 'priority', text: 'High priority' });
  if (options.completed) {
    if (task.completedAt) items.push({
      kind: 'completed', text: `Completed ${task.completedAt.slice(0, 10)}`, datetime: task.completedAt,
    });
  } else if (task.dueAt) {
    const date = options.dueToday && !options.overdue ? task.dueAt.slice(11, 16) : task.dueAt.slice(0, 10);
    items.push({ kind: 'due', text: `Due ${date}`, datetime: task.dueAt });
  }
  if (options.overdue) items.push({ kind: 'overdue', text: 'Overdue' });
  return items;
};
