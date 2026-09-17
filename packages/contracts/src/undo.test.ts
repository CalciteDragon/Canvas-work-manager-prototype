import { describe, expect, it } from 'vitest';
import {
  OperationReceiptSchema,
  RedoResultSchema,
  SectionAddResultSchema,
  SectionAddUndoOperationSchema,
  SectionAlreadyRemovedDetailsSchema,
  SectionMoveUndoOperationSchema,
  SectionRemovalResultSchema,
  SectionRemoveUndoOperationSchema,
  SectionUpdateUndoOperationSchema,
  SectionWriteResultSchema,
  UndoConflictSchema,
  UndoOperationSchema,
  UndoResultSchema,
} from './undo';

const AT = '2026-09-14T10:00:00.000Z';
const LATER = '2026-09-15T10:00:00.000Z';

const section = (type: string, overrides: Record<string, unknown> = {}) => ({
  id: 'section-1',
  projectId: 'project-a',
  pageId: 'page-a',
  type,
  title: 'Backlog',
  position: 1,
  columnSpan: 6,
  collapsed: true,
  config: { milestoneIds: ['milestone-1'] },
  archiveGeneration: 0,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
});

const placement = {
  pageId: 'page-a',
  previous: { kind: 'section', id: 'section-0' },
  next: { kind: 'shortcut', id: 'shortcut-1' },
  index: 1,
};

const viewOperation = {
  version: 1,
  type: 'section.remove',
  section: section('progress'),
  placement,
  appliedPolicy: 'none',
  rows: [],
  disposition: 'retained',
  postSectionArchivedAt: AT,
  archiveGeneration: 1,
};

const cascadeOperation = {
  ...viewOperation,
  section: section('task-list'),
  appliedPolicy: 'cascade',
  rows: [
    {
      kind: 'task',
      id: 'task-1',
      before: { sectionId: 'section-1' },
      after: { sectionId: 'section-1', archivedAt: AT, archivedWithSectionId: 'section-1' },
    },
    {
      kind: 'task',
      id: 'task-2',
      before: { sectionId: 'section-1', parentTaskId: 'task-1' },
      after: { sectionId: 'section-1', parentTaskId: 'task-1', archivedAt: AT, archivedWithSectionId: 'section-1' },
    },
  ],
};

const reassignOperation = {
  ...viewOperation,
  section: section('reflections'),
  appliedPolicy: 'reassign',
  reassignToSectionId: 'section-2',
  rows: [
    { kind: 'reflection', id: 'reflection-1', before: { sectionId: 'section-1' }, after: { sectionId: 'section-2' } },
    {
      kind: 'reflection',
      id: 'reflection-2',
      before: { sectionId: 'section-1', archivedAt: AT },
      after: { sectionId: 'section-2', archivedAt: AT },
    },
  ],
};

const addOperation = {
  version: 1,
  type: 'section.add',
  section: section('rich-text', { title: undefined, config: { text: 'Draft' } }),
  placement: { pageId: 'page-a', previous: { kind: 'section', id: 'section-0' }, index: 1 },
};

const moveOperation = {
  version: 1,
  type: 'section.move',
  sectionId: 'section-1',
  projectId: 'project-a',
  pageId: 'page-a',
  placementBefore: placement,
  placementAfter: { pageId: 'page-a', previous: { kind: 'section', id: 'section-2' }, index: 2 },
};

const updateOperation = {
  version: 1,
  type: 'section.update',
  sectionId: 'section-1',
  projectId: 'project-a',
  pageId: 'page-a',
  changes: [
    { field: 'title', before: '', after: null },
    { field: 'config', before: { text: 'old' }, after: { text: 'new' } },
    { field: 'collapsed', before: false, after: true },
    { field: 'columnSpan', before: 12, after: 6 },
  ],
};

const receipt = {
  historyId: 'history-1',
  actionId: 'operation-1',
  operation: 'section.remove',
  revision: 1,
  label: 'Removed the Backlog section',
  createdAt: AT,
  expiresAt: LATER,
};

describe('SectionRemoveUndoOperationSchema', () => {
  it.each([
    ['none', viewOperation],
    ['cascade', cascadeOperation],
    ['reassign', reassignOperation],
  ])('round-trips a %s removal with its full section, placement and row states', (_, operation) => {
    const parsed = UndoOperationSchema.parse(operation);

    expect(parsed).toEqual(operation);
    if (parsed.type === 'section.remove') expect(parsed.section.config).toEqual({ milestoneIds: ['milestone-1'] });
  });

  it.each([
    ['an unknown type', { ...viewOperation, type: 'task.archive' }],
    ['a later version', { ...viewOperation, version: 2 }],
    ['an extra key', { ...viewOperation, unexpected: true }],
    ['an invalid disposition', { ...viewOperation, disposition: 'purged' }],
    ['no disposition', { ...viewOperation, disposition: undefined }],
    ['no captured archive generation', { ...viewOperation, archiveGeneration: undefined }],
    ['a generation that does not advance the section by one', { ...viewOperation, archiveGeneration: 2 }],
    ['reassign without a target', { ...reassignOperation, reassignToSectionId: undefined }],
    ['a target without reassign', { ...cascadeOperation, reassignToSectionId: 'section-2' }],
    ['rows with no applied policy', { ...viewOperation, section: section('task-list'), rows: cascadeOperation.rows }],
    ['a policy with no rows', { ...cascadeOperation, rows: [] }],
    ['duplicate rows', { ...cascadeOperation, rows: [cascadeOperation.rows[0], cascadeOperation.rows[0]] }],
    ['rows the section does not own', { ...cascadeOperation, section: section('reflections') }],
    ['a pre-removal section that was already archived', { ...viewOperation, section: section('progress', { archivedAt: AT }) }],
    ['a placement on another page', { ...viewOperation, placement: { ...placement, pageId: 'page-b' } }],
  ])('rejects %s — the union is typed and versioned, never arbitrary JSON', (_, operation) => {
    expect(UndoOperationSchema.safeParse(operation).success).toBe(false);
  });

  it('records whether the section was retained or deleted', () => {
    expect(UndoOperationSchema.parse(viewOperation)).toMatchObject({ disposition: 'retained' });
    expect(UndoOperationSchema.parse({ ...viewOperation, disposition: 'deleted' })).toMatchObject({ disposition: 'deleted' });
  });

  it('keeps the version-1 operation type addressable for later operation versions', () => {
    expect(SectionRemoveUndoOperationSchema.shape.version.value).toBe(1);
  });
});

describe('section add, move and update operation variants', () => {
  it('round-trips strict version-1 operations and preserves a legacy title before value', () => {
    expect(SectionAddUndoOperationSchema.parse(addOperation)).toEqual(addOperation);
    expect(SectionMoveUndoOperationSchema.parse(moveOperation)).toEqual(moveOperation);
    expect(SectionUpdateUndoOperationSchema.parse(updateOperation)).toEqual(updateOperation);
    expect(UndoOperationSchema.parse(addOperation).type).toBe('section.add');
    expect(UndoOperationSchema.parse(moveOperation).type).toBe('section.move');
    expect(UndoOperationSchema.parse(updateOperation).type).toBe('section.update');
  });

  it.each([
    ['an add with an archived snapshot', { ...addOperation, section: section('progress', { archivedAt: AT }) }],
    ['an add with no placement — Redo would have nowhere to put it', { ...addOperation, placement: undefined }],
    ['an add placed on another page', { ...addOperation, placement: { ...addOperation.placement, pageId: 'page-b' } }],
    ['a move on another page', { ...moveOperation, placementAfter: { ...moveOperation.placementAfter, pageId: 'page-b' } }],
    ['an update with duplicate fields', { ...updateOperation, changes: [...updateOperation.changes, updateOperation.changes[0]] }],
    ['an update with no fields', { ...updateOperation, changes: [] }],
    ['an update with an unknown field', { ...updateOperation, changes: [{ field: 'position', before: 0, after: 1 }] }],
    ['an operation with an extra key', { ...addOperation, extra: true }],
  ])('rejects %s', (_, operation) => {
    expect(UndoOperationSchema.safeParse(operation).success).toBe(false);
  });
});

describe('OperationReceiptSchema', () => {
  it('is strict and carries no operation payload, actor or row data', () => {
    expect(OperationReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(Object.keys(OperationReceiptSchema.shape).sort()).toEqual([
      'actionId', 'createdAt', 'expiresAt', 'historyId', 'label', 'operation', 'revision',
    ]);
    expect(OperationReceiptSchema.safeParse({ ...receipt, actor: 'user' }).success).toBe(false);
    expect(OperationReceiptSchema.safeParse({ ...receipt, rows: [] }).success).toBe(false);
    // The workspace sequence is gone: a receipt is ordered by its history's revision.
    expect(OperationReceiptSchema.safeParse({ ...receipt, sequence: 1 }).success).toBe(false);
    expect(OperationReceiptSchema.safeParse({ ...receipt, revision: 0 }).success).toBe(false);
  });

  it('rides on a section removal result beside the removal’s own Archive verdict', () => {
    const listed = SectionRemovalResultSchema.parse({
      section: section('progress', { archivedAt: AT }),
      operation: receipt,
      archiveListed: true,
    });
    expect(listed.operation).toEqual(receipt);
    expect(listed.archiveListed).toBe(true);
    // Retained is not the same question as listed, so the field is stated, never inferred.
    expect(
      SectionRemovalResultSchema.safeParse({ section: section('progress', { archivedAt: AT }), operation: receipt }).success,
    ).toBe(false);
  });

  it('parses add and nullable no-op write results', () => {
    const added = { ...receipt, operation: 'section.add' };
    expect(SectionAddResultSchema.parse({ section: section('progress'), operation: added }).operation.operation).toBe('section.add');
    expect(SectionWriteResultSchema.parse({ section: section('progress'), operation: null }).operation).toBeNull();
    expect(SectionWriteResultSchema.parse({ section: section('progress'), operation: { ...receipt, operation: 'section.move' } }).operation?.operation).toBe('section.move');
  });

  it('carries the exact recovered removal receipt on a repeat-removal refusal', () => {
    const details = { reason: 'section_already_removed', sectionId: 'section-a', operation: receipt };
    expect(SectionAlreadyRemovedDetailsSchema.parse(details)).toEqual(details);
    expect(SectionAlreadyRemovedDetailsSchema.safeParse({ ...details, operationData: {} }).success).toBe(false);
  });
});

describe('UndoResultSchema and RedoResultSchema', () => {
  it('reports the outcome and where the section landed, with no receipt id', () => {
    const result = {
      operation: 'section.remove',
      outcome: 'partial',
      section: section('progress'),
      placement: { pageId: 'page-a', index: 0, strategy: 'fallback-page', pageEnabled: true },
      restoredRowCount: 0,
    };
    expect(UndoResultSchema.parse(result)).toEqual(result);
    expect(UndoResultSchema.safeParse({ ...result, outcome: 'redone' }).success).toBe(false);
  });

  it('discriminates the add Undo result without inventing a live section', () => {
    const result = { operation: 'section.add', outcome: 'removed', sectionId: 'section-1', projectId: 'project-a', pageId: 'page-a' };
    expect(UndoResultSchema.parse(result)).toEqual(result);
  });

  it('parses each Redo result', () => {
    const at = { pageId: 'page-a', index: 1, strategy: 'previous', pageEnabled: true };
    for (const result of [
      { operation: 'section.remove', outcome: 'removed', section: section('progress', { archivedAt: AT }), disposition: 'retained', settledRowCount: 0 },
      { operation: 'section.add', outcome: 'reapplied', section: section('progress'), placement: at },
      { operation: 'section.move', outcome: 'partial', section: section('progress'), placement: { ...at, strategy: 'index' } },
      { operation: 'section.update', outcome: 'reapplied', section: section('progress') },
    ]) {
      expect(RedoResultSchema.parse(result)).toEqual(result);
    }
    // A redo never lands on a fallback page: it reapplies to the recorded page or refuses.
    expect(RedoResultSchema.safeParse({ operation: 'section.add', outcome: 'reapplied', section: section('progress'), placement: { ...at, strategy: 'fallback-page' } }).success).toBe(false);
  });
});

describe('UndoConflictSchema', () => {
  const missing = { entityType: 'task', id: 'task-missing', problem: 'missing', nextStep: 'nothing-to-restore' };

  it('requires a typed next step and omits titles for missing entities', () => {
    expect(UndoConflictSchema.safeParse(missing).success).toBe(true);
    expect(UndoConflictSchema.safeParse({ ...missing, nextStep: undefined }).success).toBe(false);
    expect(UndoConflictSchema.safeParse({ ...missing, title: 'Gone' }).success).toBe(false);
    expect(UndoConflictSchema.safeParse({ ...missing, nextStep: 'guess' }).success).toBe(false);
  });

  it('no longer describes a superseded receipt — a cursor replaced supersession', () => {
    expect(UndoConflictSchema.safeParse({ entityType: 'section', id: 'section-1', problem: 'superseded', nextStep: 'change-by-hand' }).success).toBe(false);
    expect(UndoConflictSchema.safeParse({ entityType: 'section', id: 'section-1', problem: 'field-changed', nextStep: 'use-later-receipt' }).success).toBe(false);
    expect(UndoConflictSchema.safeParse({ entityType: 'section', id: 'section-1', title: 'Backlog', problem: 'field-changed', nextStep: 'change-by-hand', supersededBy: 'self' }).success).toBe(false);
  });
});
