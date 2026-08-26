import { describe, expect, it } from 'vitest';
import { ProjectIdSchema, TaskIdSchema } from './ids';
import type { ProjectId, TaskId } from './ids';

describe('branded ids', () => {
  it('accepts the seed-style id strings the prototype uses', () => {
    expect(TaskIdSchema.parse('task-123')).toBe('task-123');
    expect(ProjectIdSchema.parse('project-a')).toBe('project-a');
  });

  it('rejects an empty string and a non-string', () => {
    expect(TaskIdSchema.safeParse('').success).toBe(false);
    expect(TaskIdSchema.safeParse(7).success).toBe(false);
  });

  it('keeps the brands apart at the type level', () => {
    const taskId: TaskId = TaskIdSchema.parse('task-123');
    // @ts-expect-error a TaskId is not a ProjectId, which is the point of branding
    const projectId: ProjectId = taskId;
    expect(projectId).toBe('task-123');
  });
});
