import { describe, expect, it } from 'vitest';
import {
  PROJECT_REDO_RESULT_SCHEMAS,
  PROJECT_UNDO_RESULT_SCHEMAS,
  ProjectArchiveOperationSchema,
  ProjectReactivateOperationSchema,
  ProjectUndoOperationSchema,
  ProjectUpdateOperationSchema,
} from './project-history';
import { ProjectWriteResultSchema } from './project-write-result';
import { RedoResultSchema, UndoOperationSchema, UndoResultSchema, operationProjectOf, operationSubjectOf } from './undo';

const AT = '2026-09-22T10:00:00.000Z';
const LATER = '2026-09-22T11:00:00.000Z';

const update = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  type: 'project.update',
  projectId: 'project-kitchen',
  archivedThroughout: false,
  changes: [{ field: 'name', before: 'Kitchen', after: 'Kitchen remodel' }],
  ...overrides,
});

const archive = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  type: 'project.archive',
  projectId: 'project-kitchen',
  changes: [{ field: 'status', before: 'active', after: 'archived' }],
  ...overrides,
});

const reactivate = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  type: 'project.reactivate',
  projectId: 'project-kitchen',
  changes: [{ field: 'status', before: 'archived', after: 'planning' }],
  ...overrides,
});

const project = {
  id: 'project-kitchen',
  workspaceId: 'workspace-1',
  kind: 'root',
  name: 'Kitchen',
  status: 'active',
  projectLayoutMode: 'flow',
  progressFormula: 'count',
  createdAt: AT,
  updatedAt: LATER,
};

describe('project.update payloads (§§26, 31, 39)', () => {
  it('accept every recordable field, with null standing for an absent optional value', () => {
    const parsed = ProjectUpdateOperationSchema.parse(
      update({
        changes: [
          { field: 'name', before: 'Kitchen', after: 'Kitchen remodel' },
          { field: 'description', before: null, after: 'Cabinets first' },
          { field: 'icon', before: '🍳', after: null },
          { field: 'targetDate', before: null, after: '2026-12-01' },
          { field: 'projectLayoutMode', before: 'flow', after: 'grid' },
          { field: 'progressFormula', before: 'count', after: 'manual' },
          { field: 'manualProgress', before: null, after: 40 },
          { field: 'status', before: 'active', after: 'completed' },
          { field: 'completedAt', before: null, after: AT },
        ],
      }),
    );
    expect(parsed.changes).toHaveLength(9);
  });

  it('accept a reparent, which only a sub-project can record and which never clears a parent', () => {
    expect(ProjectUpdateOperationSchema.parse(update({ changes: [{ field: 'parentProjectId', before: 'project-a', after: 'project-b' }] })).changes[0]).toEqual({
      field: 'parentProjectId',
      before: 'project-a',
      after: 'project-b',
    });
    expect(ProjectUpdateOperationSchema.safeParse(update({ changes: [{ field: 'parentProjectId', before: 'project-a', after: null }] })).success).toBe(false);
  });

  it('reject an empty, repeated or unchanged footprint', () => {
    expect(ProjectUpdateOperationSchema.safeParse(update({ changes: [] })).success).toBe(false);
    expect(
      ProjectUpdateOperationSchema.safeParse(
        update({ changes: [{ field: 'name', before: 'A', after: 'B' }, { field: 'name', before: 'B', after: 'C' }] }),
      ).success,
    ).toBe(false);
    expect(ProjectUpdateOperationSchema.safeParse(update({ changes: [{ field: 'name', before: 'A', after: 'A' }] })).success).toBe(false);
  });

  // The service's own normalization moves them independently — `archive()` keeps a completion time
  // that a later edit clears, and a frozen clock can re-stamp the stored one — so each is recorded
  // exactly as it moved rather than refused inside the person's write.
  it('accept a completion time that moved alone, and a completion whose time was already stored', () => {
    expect(ProjectUpdateOperationSchema.safeParse(update({ changes: [{ field: 'completedAt', before: AT, after: null }] })).success).toBe(true);
    expect(
      ProjectUpdateOperationSchema.safeParse(update({ changes: [{ field: 'status', before: 'active', after: 'completed' }] })).success,
    ).toBe(true);
  });

  it('reject an archive or reactivation disguised as an update, and an archived-throughout status change', () => {
    expect(ProjectUpdateOperationSchema.safeParse(update({ changes: [{ field: 'status', before: 'active', after: 'archived' }] })).success).toBe(false);
    expect(ProjectUpdateOperationSchema.safeParse(update({ changes: [{ field: 'status', before: 'archived', after: 'active' }] })).success).toBe(false);
    expect(
      ProjectUpdateOperationSchema.safeParse(
        update({ archivedThroughout: true, changes: [{ field: 'status', before: 'planning', after: 'active' }] }),
      ).success,
    ).toBe(false);
    expect(ProjectUpdateOperationSchema.parse(update({ archivedThroughout: true })).archivedThroughout).toBe(true);
  });

  it('reject an unknown version, field or key', () => {
    expect(ProjectUpdateOperationSchema.safeParse(update({ version: 2 })).success).toBe(false);
    expect(ProjectUpdateOperationSchema.safeParse(update({ changes: [{ field: 'kind', before: 'root', after: 'subproject' }] })).success).toBe(false);
    expect(ProjectUpdateOperationSchema.safeParse(update({ snapshot: project })).success).toBe(false);
  });
});

describe('project.archive and project.reactivate payloads', () => {
  it('require the status to cross into or out of archived, and allow fields changed in the same write', () => {
    expect(ProjectArchiveOperationSchema.parse(archive()).type).toBe('project.archive');
    expect(
      ProjectArchiveOperationSchema.parse(
        archive({ changes: [{ field: 'status', before: 'active', after: 'archived' }, { field: 'name', before: 'Kitchen', after: 'Old kitchen' }] }),
      ).changes,
    ).toHaveLength(2);
    expect(ProjectReactivateOperationSchema.parse(reactivate()).type).toBe('project.reactivate');

    expect(ProjectArchiveOperationSchema.safeParse(archive({ changes: [{ field: 'name', before: 'A', after: 'B' }] })).success).toBe(false);
    expect(ProjectArchiveOperationSchema.safeParse(archive({ changes: [{ field: 'status', before: 'archived', after: 'active' }] })).success).toBe(false);
    expect(ProjectReactivateOperationSchema.safeParse(reactivate({ changes: [{ field: 'status', before: 'active', after: 'archived' }] })).success).toBe(false);
  });

  it('carry a completion leaving with the archive, so both come back together', () => {
    const parsed = ProjectArchiveOperationSchema.parse(
      archive({ changes: [{ field: 'status', before: 'completed', after: 'archived' }, { field: 'completedAt', before: AT, after: null }] }),
    );
    expect(parsed.changes.map(({ field }) => field)).toEqual(['status', 'completedAt']);
  });
});

describe('project operations in the shared unions', () => {
  it('parse through the history union and name the subject project as owner and subject', () => {
    for (const operation of [update(), archive(), reactivate()]) {
      const parsed = UndoOperationSchema.parse(operation);
      expect(ProjectUndoOperationSchema.parse(operation)).toEqual(parsed);
      expect(operationProjectOf(parsed)).toBe('project-kitchen');
      expect(operationSubjectOf(parsed)).toBe('project-kitchen');
    }
  });

  it('answer the current project in both directions', () => {
    expect(PROJECT_UNDO_RESULT_SCHEMAS).toHaveLength(3);
    expect(PROJECT_REDO_RESULT_SCHEMAS).toHaveLength(3);
    for (const operation of ['project.update', 'project.archive', 'project.reactivate']) {
      expect(UndoResultSchema.parse({ operation, outcome: 'restored', project }).operation).toBe(operation);
      expect(RedoResultSchema.parse({ operation, outcome: 'reapplied', project }).operation).toBe(operation);
      expect(UndoResultSchema.safeParse({ operation, outcome: 'reapplied', project }).success).toBe(false);
    }
  });
});

describe('ProjectWriteResult', () => {
  it('carries the project and a receipt, or null for a normalized no-op', () => {
    expect(ProjectWriteResultSchema.parse({ project, operation: null })).toEqual({ project, operation: null });
    const receipt = {
      historyId: 'history-1',
      actionId: 'operation-1',
      operation: 'project.update',
      revision: 1,
      label: 'Updated "Kitchen"',
      createdAt: AT,
      expiresAt: LATER,
    };
    expect(ProjectWriteResultSchema.parse({ project, operation: receipt }).operation).toEqual(receipt);
  });

  it('is strict: no captured footprint rides along', () => {
    expect(ProjectWriteResultSchema.safeParse({ project, operation: null, changes: [] }).success).toBe(false);
    expect(ProjectWriteResultSchema.safeParse({ project }).success).toBe(false);
  });
});
