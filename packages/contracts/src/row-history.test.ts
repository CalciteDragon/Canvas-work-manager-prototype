import { describe, expect, it } from 'vitest';
import { UndoOperationSchema, UndoResultSchema, RedoResultSchema } from './undo';
import {
  ReflectionAddOperationSchema,
  ReflectionArchiveOperationSchema,
  ReflectionRestoreOperationSchema,
  ReflectionUpdateOperationSchema,
  RowUndoOperationSchema,
  TaskAddOperationSchema,
  TaskArchiveOperationSchema,
  TaskRestoreOperationSchema,
  TaskUpdateOperationSchema,
} from './row-history';
import { ReflectionWriteResultSchema, TaskAddResultSchema, TaskWriteResultSchema } from './row-write-result';

const task = {
  id: 'task-1',
  projectId: 'project-a',
  sectionId: 'section-1',
  title: 'Configure deployment',
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
};

const reflection = {
  id: 'reflection-1',
  projectId: 'project-a',
  sectionId: 'section-2',
  body: 'That went better than expected.',
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
};

const section = {
  id: 'section-1',
  projectId: 'project-a',
  pageId: 'page-home',
  type: 'task-list',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  archiveGeneration: 0,
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
};

const container = { section, placement: { pageId: 'page-home', index: 0 } };

const structure = (over: Record<string, unknown> = {}) => ({ sectionId: 'section-1', ...over });

describe('TaskAddOperationSchema', () => {
  it('captures the complete created task, so Redo rebuilds it from stable values', () => {
    const operation = TaskAddOperationSchema.parse({ version: 1, type: 'task.add', task });
    expect(operation.task.id).toBe('task-1');
    expect(operation.container).toBeUndefined();
  });

  it('carries the implicit container the create made, as one action', () => {
    const operation = TaskAddOperationSchema.parse({ version: 1, type: 'task.add', task, container });
    expect(operation.container?.section.id).toBe('section-1');
  });

  it('rejects a container that is not the created task’s own', () => {
    expect(
      TaskAddOperationSchema.safeParse({
        version: 1,
        type: 'task.add',
        task,
        container: { ...container, section: { ...section, id: 'section-9' } },
      }).success,
    ).toBe(false);
    expect(
      TaskAddOperationSchema.safeParse({
        version: 1,
        type: 'task.add',
        task,
        container: { ...container, section: { ...section, projectId: 'project-b' } },
      }).success,
    ).toBe(false);
  });

  it('rejects an archived created task, an archived container and an unknown key', () => {
    expect(
      TaskAddOperationSchema.safeParse({
        version: 1,
        type: 'task.add',
        task: { ...task, archivedAt: '2026-09-17T11:00:00.000Z' },
      }).success,
    ).toBe(false);
    expect(
      TaskAddOperationSchema.safeParse({
        version: 1,
        type: 'task.add',
        task,
        container: { ...container, section: { ...section, archivedAt: '2026-09-17T11:00:00.000Z' } },
      }).success,
    ).toBe(false);
    expect(TaskAddOperationSchema.safeParse({ version: 1, type: 'task.add', task, extra: 1 }).success).toBe(false);
  });

  it('rejects an unknown version, which is what stops arbitrary JSON executing', () => {
    expect(TaskAddOperationSchema.safeParse({ version: 2, type: 'task.add', task }).success).toBe(false);
  });
});

describe('TaskUpdateOperationSchema', () => {
  const base = { version: 1, type: 'task.update', taskId: 'task-1', projectId: 'project-a', completion: false };

  it('records only the fields that actually changed', () => {
    const operation = TaskUpdateOperationSchema.parse({
      ...base,
      changes: [{ field: 'title', before: 'Old', after: 'New' }],
      rows: [],
    });
    expect(operation.changes).toHaveLength(1);
    expect(operation.rows).toEqual([]);
  });

  it('records a completion as status and completedAt together (§34)', () => {
    expect(
      TaskUpdateOperationSchema.parse({
        ...base,
        completion: true,
        changes: [
          { field: 'status', before: 'todo', after: 'done' },
          { field: 'completedAt', before: null, after: '2026-09-17T12:00:00.000Z' },
        ],
        rows: [],
      }).completion,
    ).toBe(true);
    // A completion that recorded only the status would restore a done task with no timestamp.
    expect(
      TaskUpdateOperationSchema.safeParse({
        ...base,
        completion: true,
        changes: [{ field: 'status', before: 'todo', after: 'done' }],
        rows: [],
      }).success,
    ).toBe(false);
  });

  it('records a move as the structural footprint of the root and the descendants it took', () => {
    const operation = TaskUpdateOperationSchema.parse({
      ...base,
      changes: [],
      rows: [
        { kind: 'task', id: 'task-1', before: structure(), after: structure({ sectionId: 'section-3' }) },
        { kind: 'task', id: 'task-2', before: structure(), after: structure({ sectionId: 'section-3' }) },
      ],
    });
    expect(operation.rows).toHaveLength(2);
  });

  it('rejects an empty footprint, a duplicate field, a duplicate row and a no-change field', () => {
    expect(TaskUpdateOperationSchema.safeParse({ ...base, changes: [], rows: [] }).success).toBe(false);
    expect(
      TaskUpdateOperationSchema.safeParse({
        ...base,
        changes: [
          { field: 'title', before: 'a', after: 'b' },
          { field: 'title', before: 'b', after: 'c' },
        ],
        rows: [],
      }).success,
    ).toBe(false);
    expect(
      TaskUpdateOperationSchema.safeParse({
        ...base,
        changes: [],
        rows: [
          { kind: 'task', id: 'task-1', before: structure(), after: structure({ sectionId: 'section-3' }) },
          { kind: 'task', id: 'task-1', before: structure(), after: structure({ sectionId: 'section-4' }) },
        ],
      }).success,
    ).toBe(false);
    expect(
      TaskUpdateOperationSchema.safeParse({ ...base, changes: [{ field: 'title', before: 'a', after: 'a' }], rows: [] })
        .success,
    ).toBe(false);
  });

  it('rejects a reflection row in a task update', () => {
    expect(
      TaskUpdateOperationSchema.safeParse({
        ...base,
        changes: [],
        rows: [{ kind: 'reflection', id: 'reflection-1', before: structure(), after: structure({ sectionId: 'section-3' }) }],
      }).success,
    ).toBe(false);
  });
});

describe('TaskArchiveOperationSchema and TaskRestoreOperationSchema', () => {
  const rows = [
    { kind: 'task', id: 'task-1', before: structure(), after: structure({ archivedAt: '2026-09-17T12:00:00.000Z' }) },
    {
      kind: 'task',
      id: 'task-2',
      before: structure({ parentTaskId: 'task-1' }),
      after: structure({ parentTaskId: 'task-1', archivedAt: '2026-09-17T12:00:00.000Z', archivedWithTaskId: 'task-1' }),
    },
  ];

  it('records exactly the rows the cascade wrote, subject first', () => {
    for (const type of ['task.archive', 'task.restore'] as const) {
      const operation = (type === 'task.archive' ? TaskArchiveOperationSchema : TaskRestoreOperationSchema).parse({
        version: 1,
        type,
        taskId: 'task-1',
        projectId: 'project-a',
        rows,
      });
      expect(operation.rows.map((row) => row.id)).toEqual(['task-1', 'task-2']);
    }
  });

  it('rejects a footprint that does not begin with its subject, or that is empty', () => {
    expect(
      TaskArchiveOperationSchema.safeParse({
        version: 1,
        type: 'task.archive',
        taskId: 'task-1',
        projectId: 'project-a',
        rows: [rows[1]],
      }).success,
    ).toBe(false);
    expect(
      TaskArchiveOperationSchema.safeParse({ version: 1, type: 'task.archive', taskId: 'task-1', projectId: 'project-a', rows: [] })
        .success,
    ).toBe(false);
  });
});

describe('reflection operations', () => {
  it('captures the created reflection and any container it made', () => {
    const operation = ReflectionAddOperationSchema.parse({
      version: 1,
      type: 'reflection.add',
      reflection,
      container: { section: { ...section, id: 'section-2', type: 'reflections' }, placement: { pageId: 'page-home', index: 1 } },
    });
    expect(operation.container?.section.id).toBe('section-2');
  });

  it('records a subject set, cleared and reassigned as one whole-object field', () => {
    const set = ReflectionUpdateOperationSchema.parse({
      version: 1,
      type: 'reflection.update',
      reflectionId: 'reflection-1',
      projectId: 'project-a',
      changes: [{ field: 'subject', before: null, after: { kind: 'task', id: 'task-1' } }],
    });
    expect(set.changes[0]).toMatchObject({ field: 'subject' });
    const reassigned = ReflectionUpdateOperationSchema.parse({
      version: 1,
      type: 'reflection.update',
      reflectionId: 'reflection-1',
      projectId: 'project-a',
      changes: [{ field: 'subject', before: { kind: 'task', id: 'task-1' }, after: { kind: 'subproject', id: 'project-b' } }],
    });
    expect(reassigned.changes).toHaveLength(1);
  });

  it('distinguishes a cleared title from an unchanged one', () => {
    const cleared = ReflectionUpdateOperationSchema.parse({
      version: 1,
      type: 'reflection.update',
      reflectionId: 'reflection-1',
      projectId: 'project-a',
      changes: [{ field: 'title', before: 'Retro', after: null }],
    });
    expect(cleared.changes[0]).toEqual({ field: 'title', before: 'Retro', after: null });
    // `undefined` is absence, and absence never reaches a recorded change.
    expect(
      ReflectionUpdateOperationSchema.safeParse({
        version: 1,
        type: 'reflection.update',
        reflectionId: 'reflection-1',
        projectId: 'project-a',
        changes: [{ field: 'title', before: 'Retro' }],
      }).success,
    ).toBe(false);
  });

  it('records archive and restore as exactly one row, which is the subject', () => {
    const rows = [
      {
        kind: 'reflection',
        id: 'reflection-1',
        before: { sectionId: 'section-2' },
        after: { sectionId: 'section-2', archivedAt: '2026-09-17T12:00:00.000Z' },
      },
    ];
    for (const schema of [ReflectionArchiveOperationSchema, ReflectionRestoreOperationSchema]) {
      const type = schema === ReflectionArchiveOperationSchema ? 'reflection.archive' : 'reflection.restore';
      expect(schema.parse({ version: 1, type, reflectionId: 'reflection-1', projectId: 'project-a', rows }).rows).toHaveLength(1);
      expect(
        schema.safeParse({ version: 1, type, reflectionId: 'reflection-2', projectId: 'project-a', rows }).success,
      ).toBe(false);
      expect(
        schema.safeParse({ version: 1, type, reflectionId: 'reflection-1', projectId: 'project-a', rows: [...rows, ...rows] }).success,
      ).toBe(false);
    }
  });

  it('rejects an unknown reflection field', () => {
    expect(
      ReflectionUpdateOperationSchema.safeParse({
        version: 1,
        type: 'reflection.update',
        reflectionId: 'reflection-1',
        projectId: 'project-a',
        changes: [{ field: 'mood', before: 'a', after: 'b' }],
      }).success,
    ).toBe(false);
  });
});

describe('the row operation union', () => {
  it('names the eight version-1 row operations and nothing else', () => {
    expect(RowUndoOperationSchema.options.map((option) => option.shape.type.value)).toEqual([
      'task.add',
      'task.update',
      'task.archive',
      'task.restore',
      'reflection.add',
      'reflection.update',
      'reflection.archive',
      'reflection.restore',
    ]);
  });

  it('joins the one operation union a history action holds', () => {
    expect(UndoOperationSchema.parse({ version: 1, type: 'task.add', task }).type).toBe('task.add');
    expect(UndoOperationSchema.safeParse({ version: 1, type: 'task.rename', task }).success).toBe(false);
  });

  it('gives every row operation both directions in the transition unions', () => {
    expect(UndoResultSchema.options).toHaveLength(22);
    expect(RedoResultSchema.options).toHaveLength(22);
    expect(UndoResultSchema.safeParse({
      operation: 'task.add',
      outcome: 'removed',
      taskId: task.id,
      projectId: task.projectId,
    }).success).toBe(true);
  });
});

describe('write contracts', () => {
  it('requires a receipt on create and allows null on a normalized no-op', () => {
    expect(TaskAddResultSchema.safeParse({ task, operation: null }).success).toBe(false);
    expect(TaskWriteResultSchema.parse({ task, operation: null }).operation).toBeNull();
    expect(ReflectionWriteResultSchema.parse({ reflection, operation: null }).operation).toBeNull();
  });

  it('carries no captured footprint — a public result is snapshot-free', () => {
    const receipt = {
      historyId: 'history-1',
      actionId: 'operation-1',
      operation: 'task.add',
      revision: 1,
      label: 'Created "Configure deployment"',
      createdAt: '2026-09-17T10:00:00.000Z',
      expiresAt: '2026-09-18T10:00:00.000Z',
    };
    expect(TaskAddResultSchema.parse({ task, operation: receipt }).operation.label).toContain('Created');
    // The receipt is strict, so a snapshot smuggled beside it is a parse failure rather than a
    // silently stripped key: a public result can never grow a captured footprint by accident.
    expect(TaskAddResultSchema.safeParse({ task, operation: { ...receipt, task } }).success).toBe(false);
  });
});
