import { describe, expect, it } from 'vitest';
import {
  SectionRestoreOperationSchema,
  SectionRestoreRedoResultSchema,
  SectionRestoreUndoResultSchema,
} from './section-restore-history';
import { UndoOperationSchema, RedoResultSchema, UndoResultSchema } from './undo';

const section = {
  id: 'section-1',
  projectId: 'project-a',
  pageId: 'page-work',
  type: 'task-list',
  position: 3,
  columnSpan: 12,
  collapsed: false,
  config: {},
  archiveGeneration: 2,
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const row = (over: Record<string, unknown> = {}) => ({
  kind: 'task',
  id: 'task-1',
  before: { sectionId: 'section-1', archivedAt: '2026-09-19T09:00:00.000Z', archivedWithSectionId: 'section-1' },
  after: { sectionId: 'section-1' },
  ...over,
});

const operation = (over: Record<string, unknown> = {}) => ({
  version: 1,
  type: 'section.restore',
  sectionId: 'section-1',
  projectId: 'project-a',
  pageId: 'page-work',
  archivedAt: '2026-09-19T09:00:00.000Z',
  archiveGeneration: 2,
  oldPosition: 3,
  placement: { pageId: 'page-work', previous: { kind: 'section', id: 'section-0' }, index: 1 },
  rows: [row()],
  ...over,
});

describe('SectionRestoreOperationSchema', () => {
  it('captures the markers before Restore and the placement it actually landed on', () => {
    const parsed = SectionRestoreOperationSchema.parse(operation());
    expect(parsed.archivedAt).toBe('2026-09-19T09:00:00.000Z');
    expect(parsed.placement.index).toBe(1);
    expect(parsed.rows).toHaveLength(1);
  });

  it('accepts a Restore that revived no rows, which an empty or prose section does', () => {
    expect(SectionRestoreOperationSchema.parse(operation({ rows: [] })).rows).toEqual([]);
  });

  it('rejects an unknown version or an extra key, so stored JSON never executes untyped', () => {
    expect(SectionRestoreOperationSchema.safeParse(operation({ version: 2 })).success).toBe(false);
    expect(SectionRestoreOperationSchema.safeParse(operation({ policy: 'cascade' })).success).toBe(false);
  });

  it('rejects a placement on another page than the section’s own', () => {
    expect(
      SectionRestoreOperationSchema.safeParse(operation({ placement: { pageId: 'page-home', index: 0 } })).success,
    ).toBe(false);
  });

  it('rejects a placement that names the restored section as its own neighbour', () => {
    expect(
      SectionRestoreOperationSchema.safeParse(
        operation({ placement: { pageId: 'page-work', next: { kind: 'section', id: 'section-1' }, index: 0 } }),
      ).success,
    ).toBe(false);
  });

  it('records each row once', () => {
    expect(SectionRestoreOperationSchema.safeParse(operation({ rows: [row(), row()] })).success).toBe(false);
  });

  it('rejects a row that was not archived with this section, which Restore never revives', () => {
    expect(
      SectionRestoreOperationSchema.safeParse(
        operation({ rows: [row({ before: { sectionId: 'section-1', archivedAt: '2026-09-19T09:00:00.000Z' } })] }),
      ).success,
    ).toBe(false);
    expect(
      SectionRestoreOperationSchema.safeParse(
        operation({
          rows: [
            row({
              before: {
                sectionId: 'section-1',
                archivedAt: '2026-09-19T09:00:00.000Z',
                archivedWithSectionId: 'section-9',
              },
            }),
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('rejects a row Restore did not actually leave live in this section', () => {
    expect(
      SectionRestoreOperationSchema.safeParse(
        operation({ rows: [row({ after: { sectionId: 'section-1', archivedAt: '2026-09-19T09:00:00.000Z' } })] }),
      ).success,
    ).toBe(false);
    expect(
      SectionRestoreOperationSchema.safeParse(operation({ rows: [row({ after: { sectionId: 'section-9' } })] })).success,
    ).toBe(false);
  });

  it('joins the operation union, so a history action can hold it', () => {
    expect(UndoOperationSchema.parse(operation()).type).toBe('section.restore');
  });
});

describe('section restore transition results', () => {
  it('answers the re-archived section and the rows it took back down', () => {
    const result = SectionRestoreUndoResultSchema.parse({
      operation: 'section.restore',
      outcome: 'restored',
      section: { ...section, archivedAt: '2026-09-19T09:00:00.000Z' },
      affectedRowIds: ['task-1'],
    });
    expect(result.affectedRowIds).toEqual(['task-1']);
    expect(UndoResultSchema.parse(result).operation).toBe('section.restore');
  });

  it('answers the placement Redo resolved, and reports a lost location as partial', () => {
    const result = SectionRestoreRedoResultSchema.parse({
      operation: 'section.restore',
      outcome: 'partial',
      section,
      placement: { pageId: 'page-work', index: 4, strategy: 'index', pageEnabled: false },
      affectedRowIds: [],
    });
    expect(result.placement.pageEnabled).toBe(false);
    expect(RedoResultSchema.parse(result).operation).toBe('section.restore');
  });

  it('never carries a structural snapshot of the rows it wrote', () => {
    const parsed = SectionRestoreUndoResultSchema.parse({
      operation: 'section.restore',
      outcome: 'restored',
      section,
      affectedRowIds: ['task-1'],
      rows: [row()],
    });
    expect(parsed).not.toHaveProperty('rows');
  });
});
