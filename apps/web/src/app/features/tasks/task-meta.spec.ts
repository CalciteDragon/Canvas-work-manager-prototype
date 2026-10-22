import { describe, expect, it } from 'vitest';
import { taskMeta, taskStatusLabel } from './task-meta';

describe('task meta (§21, §33)', () => {
  const task = {
    status: 'blocked' as const,
    priority: 'high' as const,
    dueAt: '2026-10-20T18:30:00.000Z',
  };

  it('orders status, high priority, due date and the server overdue flag', () => {
    expect(taskMeta(task, { overdue: true })).toEqual([
      { kind: 'status', text: 'Blocked' },
      { kind: 'priority', text: 'High priority' },
      { kind: 'due', text: 'Due 2026-10-20', datetime: task.dueAt },
      { kind: 'overdue', text: 'Overdue' },
    ]);
  });

  it('omits default todo status and non-high priorities, unless Todos asks for its exact label', () => {
    expect(taskMeta({ status: 'todo', priority: 'medium' })).toEqual([]);
    expect(taskMeta({ status: 'todo', priority: 'low' }, { alwaysStatus: true })).toEqual([
      { kind: 'status', text: 'To do' },
    ]);
  });

  it('preserves the dashboard due-today time without turning an overdue date into tonight', () => {
    expect(taskMeta(task, { dueToday: true }).find(item => item.kind === 'due')?.text).toBe('Due 18:30');
    expect(taskMeta(task, { dueToday: true, overdue: true }).find(item => item.kind === 'due')?.text)
      .toBe('Due 2026-10-20');
  });

  it('uses the completed date instead of the due date when Recent Progress asks for it', () => {
    const done = { ...task, status: 'done' as const, completedAt: '2026-10-21T01:00:00.000Z' };
    expect(taskMeta(done, { completed: true })).toEqual([
      { kind: 'status', text: 'Done' },
      { kind: 'priority', text: 'High priority' },
      { kind: 'completed', text: 'Completed 2026-10-21', datetime: done.completedAt },
    ]);
    expect(taskMeta({ status: 'done', priority: 'medium' }, { completed: true })).toEqual([
      { kind: 'status', text: 'Done' },
    ]);
  });

  it('keeps done and cancelled labels and never infers overdue from a browser clock', () => {
    expect(taskStatusLabel('cancelled')).toBe('Cancelled');
    expect(taskStatusLabel('in_progress')).toBe('In progress');
    expect(taskMeta({ ...task, status: 'cancelled' })[0]?.text).toBe('Cancelled');
    expect(taskMeta(task).some(item => item.kind === 'overdue')).toBe(false);
  });
});
