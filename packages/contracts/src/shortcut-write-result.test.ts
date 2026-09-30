import { describe, expect, it } from 'vitest';
import {
  SectionShortcutAddResultSchema,
  SectionShortcutRemovalResultSchema,
  SectionShortcutWriteResultSchema,
} from './shortcut-write-result';

const receipt = {
  historyId: 'history-1',
  actionId: 'operation-1',
  operation: 'shortcut.add',
  revision: 3,
  label: 'Added a shortcut to Backlog',
  createdAt: '2026-09-20T10:00:00.000Z',
  expiresAt: '2026-09-21T10:00:00.000Z',
};

const shortcut = {
  id: 'shortcut-1',
  pageId: 'page-home',
  sourceSectionId: 'section-9',
  position: 1,
  columnSpan: 6,
  collapsed: false,
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
  source: {
    id: 'section-9',
    projectId: 'project-child',
    pageId: 'page-child-work',
    type: 'task-list',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    archiveGeneration: 0,
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T10:00:00.000Z',
  },
  sourceProjectId: 'project-child',
  sourceProjectName: 'Child',
  sourcePageKind: 'work',
  breadcrumb: ['Root', 'Child'],
  availability: 'available',
};

describe('shortcut write results', () => {
  it('always carry a receipt for a create, which always writes', () => {
    expect(SectionShortcutAddResultSchema.parse({ shortcut, operation: receipt }).operation.actionId).toBe('operation-1');
    expect(SectionShortcutAddResultSchema.safeParse({ shortcut, operation: null }).success).toBe(false);
  });

  it('allow a null receipt on an update or a move, which normalization can make a no-op', () => {
    expect(SectionShortcutWriteResultSchema.parse({ shortcut, operation: null }).operation).toBeNull();
  });

  it('report a removal by id and destination rather than by a placement that no longer exists', () => {
    const result = SectionShortcutRemovalResultSchema.parse({
      shortcutId: 'shortcut-1',
      projectId: 'project-root',
      pageId: 'page-home',
      operation: { ...receipt, operation: 'shortcut.remove' },
    });
    expect(result).not.toHaveProperty('shortcut');
    expect(SectionShortcutRemovalResultSchema.safeParse({
      shortcutId: 'shortcut-1', projectId: 'project-root', pageId: 'page-home', operation: null,
    }).success).toBe(false);
  });
});
