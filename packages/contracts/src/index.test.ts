// Acceptance check 4: one entrypoint carries both halves — runtime schemas and the
// inferred types — and resolves by its package specifier, the way every consumer
// (Angular, the host, MCP tools, seeds) will import it.
import { describe, expect, it } from 'vitest';
import {
  ProjectTodosResultSchema,
  SCHEMA_VERSION,
  TaskSchema,
  TaskStatusSchema,
  UndoReceiptSchema,
  UndoRefusalDetailsSchema,
  UndoResultSchema,
} from '@cwm/contracts';
import type { ProjectTodosResult, Task, TaskStatus } from '@cwm/contracts';

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

  // §34's projection is shared by the page, the HTTP route and `get_project_todos`, so it
  // travels through the same entrypoint as the records it carries.
  it('exports the Todos projection', () => {
    const empty: ProjectTodosResult = ProjectTodosResultSchema.parse({ projectId: 'project-a', items: [] });

    expect(empty.items).toEqual([]);
  });

  // The host, the MCP tools and the domain all name Undo's shapes; none of them redeclares one.
  it('exports the Undo receipt, result and refusal schemas', () => {
    expect(UndoReceiptSchema.shape.undoId).toBeDefined();
    expect(UndoResultSchema.options).toHaveLength(4);
    expect(UndoRefusalDetailsSchema.safeParse({ reason: 'undo_expired', undoId: 'undo-1', expiresAt: '2026-09-14T10:00:00.000Z' }).success).toBe(true);
  });
});
