import { describe, expect, it } from 'vitest';
import { ProjectTodosResultSchema } from './project-todos';

const TASK = {
  id: 'task-1',
  projectId: 'project-a',
  sectionId: 'section-1',
  title: 'Order the tiles',
  status: 'todo',
  priority: 'medium',
  dueAt: '2026-09-01T09:00:00.000Z',
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
};

const SUBPROJECT = {
  id: 'project-b',
  workspaceId: 'workspace-1',
  kind: 'subproject',
  parentProjectId: 'project-a',
  name: 'Kitchen',
  status: 'active',
  targetDate: '2026-09-01',
  projectLayoutMode: 'flow',
  progressFormula: 'count',
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
};

const taskItem = (overrides: Record<string, unknown> = {}) => ({
  kind: 'task',
  task: TASK,
  origin: {
    projectId: 'project-a',
    pageId: 'page-project-a',
    pageKind: 'home',
    breadcrumb: [{ projectId: 'project-a', name: 'Renovation' }],
    sectionId: 'section-1',
    sectionName: 'Task List',
  },
  ...overrides,
});

const subprojectItem = () => ({
  kind: 'subproject',
  project: SUBPROJECT,
  origin: {
    projectId: 'project-b',
    pageId: 'page-project-b',
    pageKind: 'work',
    breadcrumb: [
      { projectId: 'project-a', name: 'Renovation' },
      { projectId: 'project-b', name: 'Kitchen' },
    ],
  },
});

describe('ProjectTodosResultSchema (§34)', () => {
  it('parses canonical task and subproject branches', () => {
    const result = ProjectTodosResultSchema.parse({
      projectId: 'project-a',
      items: [taskItem(), subprojectItem()],
    });

    expect(result.items).toHaveLength(2);
    const [task, subproject] = result.items;
    // The canonical records, not a Todos-shaped copy of them (§34).
    if (task?.kind !== 'task' || subproject?.kind !== 'subproject') throw new Error('unexpected kinds');
    expect(task.task.id).toBe('task-1');
    expect(task.origin.sectionName).toBe('Task List');
    expect(subproject.project.parentProjectId).toBe('project-a');
    expect(subproject.origin.pageKind).toBe('work');
  });

  it('is valid for a root with no work under it', () => {
    expect(ProjectTodosResultSchema.parse({ projectId: 'project-a', items: [] }).items).toEqual([]);
  });

  const rejects = (items: unknown[]): boolean =>
    !ProjectTodosResultSchema.safeParse({ projectId: 'project-a', items }).success;

  it('rejects a kind that names the wrong record', () => {
    // The discriminator and the record it carries are one decision, not two.
    expect(rejects([{ ...taskItem(), kind: 'subproject' }])).toBe(true);
    expect(rejects([{ ...subprojectItem(), kind: 'task' }])).toBe(true);
    expect(rejects([{ ...taskItem(), kind: 'milestone' }])).toBe(true);
  });

  it('rejects a root project in the work-unit branch', () => {
    // §26: a root is not a unit of work, and Todos never lists the root it is showing.
    expect(rejects([{ ...subprojectItem(), project: { ...SUBPROJECT, kind: 'root', parentProjectId: undefined } }]))
      .toBe(true);
  });

  it('rejects a status outside §33', () => {
    expect(rejects([{ ...taskItem(), task: { ...TASK, status: 'archived' } }])).toBe(true);
  });

  it('rejects a task origin with no section', () => {
    const { sectionId: _sectionId, ...withoutSection } = taskItem().origin;
    expect(rejects([{ ...taskItem(), origin: withoutSection }])).toBe(true);
  });

  it('rejects malformed ids, page kinds and dates', () => {
    expect(rejects([{ ...taskItem(), task: { ...TASK, id: '' } }])).toBe(true);
    expect(rejects([{ ...taskItem(), task: { ...TASK, dueAt: '2026-09-01' } }])).toBe(true);
    expect(rejects([{ ...subprojectItem(), project: { ...SUBPROJECT, targetDate: '2026-09-01T00:00:00.000Z' } }]))
      .toBe(true);
    expect(rejects([{ ...taskItem(), origin: { ...taskItem().origin, pageKind: 'calendar' } }])).toBe(true);
    expect(rejects([{ ...taskItem(), origin: { ...taskItem().origin, breadcrumb: [] } }])).toBe(true);
  });
});
