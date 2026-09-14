import { describe, expect, it } from 'vitest';
import {
  ProjectArchiveItemSchema,
  ProjectArchiveResultSchema,
  ProjectArchiveRestorationSchema,
  ProjectArchiveSectionItemSchema,
  ProjectArchiveSectionRecoverySchema,
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

  describe('section recovery metadata', () => {
    const sectionItem = {
      kind: 'section' as const,
      section: {
        id: 'section-tasks',
        projectId: 'project-root',
        pageId: 'page-root',
        type: 'task-list',
        position: 0,
        columnSpan: 12,
        collapsed: false,
        config: {},
        createdAt: AT,
        updatedAt: AT,
        archivedAt: AT,
      },
      cascadeCount: 0,
      origin: { ...origin, sectionId: 'section-tasks', sectionName: 'Tasks' },
      cause: { kind: 'own' as const },
      restoration: { kind: 'ready' as const, operation: 'restore_section' as const, permission: 'projects.write' as const },
    };

    it('accepts owned content with a positive count, config and unknown content', () => {
      for (const recovery of [
        { kind: 'owned-content', ownedData: 'tasks', contentCount: 3, separateRestoreCount: 2 },
        { kind: 'owned-content', ownedData: 'reflections', contentCount: 1, separateRestoreCount: 0 },
        { kind: 'config' },
        { kind: 'unknown' },
      ]) {
        expect(ProjectArchiveSectionRecoverySchema.parse(recovery)).toEqual(recovery);
        expect(ProjectArchiveSectionItemSchema.safeParse({ ...sectionItem, recovery }).success).toBe(true);
      }
    });

    it('rejects malformed metadata', () => {
      for (const recovery of [
        { kind: 'owned-content', ownedData: 'tasks', contentCount: 0, separateRestoreCount: 0 },
        { kind: 'owned-content', ownedData: 'tasks', contentCount: 1.5, separateRestoreCount: 0 },
        { kind: 'owned-content', ownedData: 'milestones', contentCount: 1, separateRestoreCount: 0 },
        { kind: 'owned-content', ownedData: 'tasks', separateRestoreCount: 0 },
        { kind: 'owned-content', ownedData: 'tasks', contentCount: 2 },
        { kind: 'owned-content', ownedData: 'tasks', contentCount: 2, separateRestoreCount: -1 },
        { kind: 'owned-content', ownedData: 'tasks', contentCount: 2, separateRestoreCount: 3 },
        { kind: 'disposable' },
        { contentCount: 2 },
      ]) {
        expect(ProjectArchiveSectionRecoverySchema.safeParse(recovery).success).toBe(false);
        expect(ProjectArchiveSectionItemSchema.safeParse({ ...sectionItem, recovery }).success).toBe(false);
      }
    });

    it('still parses a section item written before the metadata existed', () => {
      expect(ProjectArchiveSectionItemSchema.safeParse(sectionItem).success).toBe(true);
    });
  });
});
