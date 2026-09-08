import { describe, expect, it } from 'vitest';
import { ProjectCompletedWorkResultSchema, ProjectJournalResultSchema } from './project-journal';

const origin = {
  projectId: 'project-root',
  pageId: 'page-home',
  pageKind: 'home',
  breadcrumb: [{ projectId: 'project-root', name: 'Work Manager' }],
  sectionId: 'section-reflections',
  sectionName: 'Reflections',
} as const;

const reflection = {
  id: 'reflection-1',
  projectId: 'project-root',
  sectionId: 'section-reflections',
  body: 'Shipped the first pass.',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

describe('project journal contracts', () => {
  it('parses a journal item with a resolved subject view', () => {
    const result = ProjectJournalResultSchema.parse({
      projectId: 'project-root',
      items: [
        {
          reflection: { ...reflection, subject: { kind: 'task', id: 'task-1' } },
          origin,
          subject: {
            kind: 'task',
            id: 'task-1',
            name: 'Ship it',
            status: 'done',
            completedAt: '2026-09-01T09:00:00.000Z',
            archived: false,
            hiddenByArchivedAncestor: false,
            breadcrumb: [{ projectId: 'project-root', name: 'Work Manager' }],
          },
        },
      ],
    });
    expect(result.items[0]?.subject?.name).toBe('Ship it');
  });

  it('keeps the completed-work result as a picker-only projection', () => {
    const result = ProjectCompletedWorkResultSchema.parse({
      projectId: 'project-root',
      candidates: [
        {
          kind: 'subproject',
          id: 'project-child',
          name: 'Launch',
          status: 'completed',
          completedAt: '2026-09-01T09:00:00.000Z',
          archived: false,
          hiddenByArchivedAncestor: false,
          breadcrumb: [
            { projectId: 'project-root', name: 'Work Manager' },
            { projectId: 'project-child', name: 'Launch' },
          ],
        },
      ],
    });
    expect(result.candidates).toHaveLength(1);
  });
});
