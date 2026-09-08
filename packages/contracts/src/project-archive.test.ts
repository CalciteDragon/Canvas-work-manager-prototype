import { describe, expect, it } from 'vitest';
import {
  ProjectArchiveItemSchema,
  ProjectArchiveResultSchema,
  ProjectArchiveRestorationSchema,
  ProjectRestoreStatusSchema,
  RestoreProjectInputSchema,
} from './project-archive';

const AT = '2026-09-01T00:00:00.000Z';

const root = {
  id: 'project-root',
  workspaceId: 'workspace-demo',
  kind: 'root' as const,
  name: 'Root',
  status: 'active' as const,
  projectLayoutMode: 'flow' as const,
  createdAt: AT,
  updatedAt: AT,
};

const origin = {
  projectId: 'project-root',
  pageId: 'page-root',
  pageKind: 'home' as const,
  pageEnabled: true,
  breadcrumb: [{ projectId: 'project-root', name: 'Root' }],
};

describe('Project Archive contracts (§31)', () => {
  it('requires a canonical entity, cause and typed restoration state for each union member', () => {
    const result = ProjectArchiveItemSchema.safeParse({
      kind: 'task',
      task: {
        id: 'task-1',
        projectId: 'project-root',
        sectionId: 'section-tasks',
        title: 'Archived task',
        status: 'todo',
        priority: 'medium',
        createdAt: AT,
        updatedAt: AT,
        archivedAt: AT,
      },
      origin: { ...origin, sectionId: 'section-tasks', sectionName: 'Tasks' },
      cause: { kind: 'task-cascade', taskId: 'task-parent' },
      restoration: { kind: 'blocked', blocker: { kind: 'section', sectionId: 'section-tasks', name: 'Tasks' } },
    });

    expect(result.success).toBe(true);
  });

  it('does not let a hidden live item claim direct restore', () => {
    expect(ProjectArchiveRestorationSchema.safeParse({
      kind: 'not-archived',
      blocker: { kind: 'project', projectId: 'project-root', name: 'Root' },
    }).success).toBe(true);

    const result = ProjectArchiveRestorationSchema.safeParse({
      kind: 'not-archived',
      blocker: { kind: 'project', projectId: 'project-root', name: 'Root' },
      operation: 'restore_task',
    });

    expect(result.success).toBe(false);
  });

  it('requires a non-archived status for project reactivation', () => {
    expect(ProjectRestoreStatusSchema.safeParse('active').success).toBe(true);
    expect(ProjectRestoreStatusSchema.safeParse('archived').success).toBe(false);
    expect(RestoreProjectInputSchema.safeParse({ status: 'archived' }).success).toBe(false);
  });

  it('keeps the root as context instead of duplicating it as an item', () => {
    const result = ProjectArchiveResultSchema.safeParse({ projectId: root.id, root, items: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items).toEqual([]);
  });
});
