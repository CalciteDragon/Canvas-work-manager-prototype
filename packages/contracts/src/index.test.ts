// Acceptance check 4: one entrypoint carries both halves — runtime schemas and the
// inferred types — and resolves by its package specifier, the way every consumer
// (Angular, the host, MCP tools, seeds) will import it.
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, TaskSchema, TaskStatusSchema } from '@cwm/contracts';
import type { Task, TaskStatus } from '@cwm/contracts';

describe('@cwm/contracts entrypoint', () => {
  it('exports runtime schemas', () => {
    const task: Task = TaskSchema.parse({
      id: 'task-123',
      projectId: 'project-a',
      sectionId: 'section-1',
      title: 'Configure deployment',
      status: 'todo',
      priority: 'medium',
      createdAt: '2026-08-26T10:00:00.000Z',
      updatedAt: '2026-08-26T10:00:00.000Z',
    });

    const status: TaskStatus = task.status;
    expect(TaskStatusSchema.options).toContain(status);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
