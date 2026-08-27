import { describe, expect, it } from 'vitest';
import { TaskPrioritySchema, TaskSchema, TaskStatusSchema } from './task';

const task = {
  id: 'task-123',
  projectId: 'project-a',
  title: 'Configure deployment',
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
};

describe('TaskSchema', () => {
  it('accepts a minimal task', () => {
    expect(TaskSchema.parse(task)).toMatchObject({ id: 'task-123', status: 'todo' });
  });

  it('accepts a subtask — §33 carries parentTaskId even though subtask UI is later', () => {
    expect(TaskSchema.parse({ ...task, parentTaskId: 'task-1' }).parentTaskId).toBe('task-1');
  });

  it('accepts the optional §33 fields', () => {
    const full = TaskSchema.parse({
      ...task,
      description: 'Wire up the pipeline',
      status: 'done',
      startAt: '2026-08-24T09:00:00.000Z',
      dueAt: '2026-08-27T17:00:00.000Z',
      completedAt: '2026-08-26T11:32:00.000Z',
    });
    expect(full.completedAt).toBe('2026-08-26T11:32:00.000Z');
  });

  it('rejects an empty title', () => {
    expect(TaskSchema.safeParse({ ...task, title: '' }).success).toBe(false);
  });

  it('rejects a date-only dueAt — task dates are instants', () => {
    expect(TaskSchema.safeParse({ ...task, dueAt: '2026-08-27' }).success).toBe(false);
  });
});

describe('TaskStatusSchema', () => {
  it('is exactly the five §33 statuses, in §33 order', () => {
    expect(TaskStatusSchema.options).toEqual(['todo', 'in_progress', 'blocked', 'done', 'cancelled']);
  });

  it('rejects a status the spec does not name', () => {
    expect(TaskSchema.safeParse({ ...task, status: 'archived' }).success).toBe(false);
  });
});

describe('TaskPrioritySchema', () => {
  it('is the prototype starting set', () => {
    expect(TaskPrioritySchema.options).toEqual(['low', 'medium', 'high']);
  });

  it('rejects a priority outside it', () => {
    expect(TaskSchema.safeParse({ ...task, priority: 'critical' }).success).toBe(false);
  });
});

describe('TaskSchema archivedAt', () => {
  it('accepts an archived task', () => {
    expect(TaskSchema.parse({ ...task, archivedAt: '2026-08-26T11:32:00.000Z' }).archivedAt).toBe(
      '2026-08-26T11:32:00.000Z',
    );
  });

  it('leaves archivedAt absent on a live task', () => {
    expect(TaskSchema.parse(task).archivedAt).toBeUndefined();
  });

  it('rejects a date-only archivedAt — it is an instant like the other timestamps', () => {
    expect(TaskSchema.safeParse({ ...task, archivedAt: '2026-08-26' }).success).toBe(false);
  });
});
