import { describe, expect, it } from 'vitest';
import {
  SectionRemovalResultSchema,
  SectionAlreadyRemovedDetailsSchema,
  SectionRemoveUndoOperationSchema,
  UndoInputSchema,
  UndoOperationSchema,
  UndoReceiptSchema,
  UndoRecordSchema,
  UndoRefusalDetailsSchema,
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
  postSectionArchivedAt: AT,
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

const record = {
  id: 'undo-1',
  workspaceId: 'workspace-a',
  projectId: 'project-a',
  actor: 'user',
  actorUserId: 'user-a',
  sequence: 1,
  label: 'Remove the Backlog section',
  createdAt: AT,
  expiresAt: LATER,
  operation: viewOperation,
};

describe('SectionRemoveUndoOperationSchema', () => {
  it.each([
    ['none', viewOperation],
    ['cascade', cascadeOperation],
    ['reassign', reassignOperation],
  ])('round-trips a %s removal with its full section, placement and row states', (_, operation) => {
    const parsed = UndoOperationSchema.parse(operation);

    expect(parsed).toEqual(operation);
    expect(parsed.section.config).toEqual({ milestoneIds: ['milestone-1'] });
  });

  it.each([
    ['an unknown type', { ...viewOperation, type: 'task.archive' }],
    ['a later version', { ...viewOperation, version: 2 }],
    ['an extra key', { ...viewOperation, unexpected: true }],
    ['an invalid disposition', { ...viewOperation, disposition: 'purged' }],
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

  it('keeps old version-1 records retained while new records may record deletion', () => {
    expect(UndoOperationSchema.parse(viewOperation)).not.toHaveProperty('disposition');
    expect(UndoOperationSchema.parse({ ...viewOperation, disposition: 'retained' })).toMatchObject({ disposition: 'retained' });
    expect(UndoOperationSchema.parse({ ...viewOperation, disposition: 'deleted' })).toMatchObject({ disposition: 'deleted' });
  });

  it('keeps the version-1 operation type addressable for later operation versions', () => {
    expect(SectionRemoveUndoOperationSchema.shape.version.value).toBe(1);
  });
});

describe('UndoRecordSchema', () => {
  it('accepts user, agent and system records under the activity attribution rule', () => {
    expect(UndoRecordSchema.parse(record).actor).toBe('user');
    expect(
      UndoRecordSchema.safeParse({ ...record, actor: 'agent', actorAgentConnectionId: 'agent-1' }).success,
    ).toBe(true);
    const { actorUserId, ...system } = record;
    expect(UndoRecordSchema.safeParse({ ...system, actor: 'system' }).success).toBe(true);
  });

  it('rejects an unattributable record', () => {
    const { actorUserId, ...unattributed } = record;
    expect(UndoRecordSchema.safeParse(unattributed).success).toBe(false);
    expect(UndoRecordSchema.safeParse({ ...unattributed, actor: 'agent' }).success).toBe(false);
    expect(UndoRecordSchema.safeParse({ ...record, actor: 'system' }).success).toBe(false);
  });

  it('requires a positive sequence and an expiry after creation', () => {
    expect(UndoRecordSchema.safeParse({ ...record, sequence: 0 }).success).toBe(false);
    expect(UndoRecordSchema.safeParse({ ...record, sequence: 1.5 }).success).toBe(false);
    expect(UndoRecordSchema.safeParse({ ...record, expiresAt: AT }).success).toBe(false);
  });
});

describe('UndoReceiptSchema', () => {
  const receipt = { undoId: 'undo-1', operation: 'section.remove', label: 'Remove', createdAt: AT, expiresAt: LATER };

  it('is strict and carries no operation, actor or row data', () => {
    expect(UndoReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(Object.keys(UndoReceiptSchema.shape).sort()).toEqual(['createdAt', 'expiresAt', 'label', 'operation', 'undoId']);
    expect(UndoReceiptSchema.safeParse({ ...receipt, actor: 'user' }).success).toBe(false);
    expect(UndoReceiptSchema.safeParse({ ...receipt, rows: [] }).success).toBe(false);
  });

  it('rides on a section removal result', () => {
    expect(SectionRemovalResultSchema.parse({ section: section('progress', { archivedAt: AT }), undo: receipt }).undo).toEqual(
      receipt,
    );
  });
});

describe('UndoInputSchema and UndoResultSchema', () => {
  it('takes only an undo id', () => {
    expect(UndoInputSchema.parse({ undoId: 'undo-1' })).toEqual({ undoId: 'undo-1' });
    expect(UndoInputSchema.safeParse({ undoId: 'undo-1', force: true }).success).toBe(false);
  });

  it('reports the outcome and where the section landed', () => {
    const result = {
      undoId: 'undo-1',
      operation: 'section.remove',
      outcome: 'partial',
      section: section('progress'),
      placement: { pageId: 'page-a', index: 0, strategy: 'fallback-page', pageEnabled: true },
      restoredRowCount: 0,
    };
    expect(UndoResultSchema.parse(result)).toEqual(result);
    expect(UndoResultSchema.safeParse({ ...result, outcome: 'redone' }).success).toBe(false);
  });
});

describe('UndoRefusalDetailsSchema', () => {
  it.each([
    { reason: 'undo_consumed', undoId: 'undo-1', consumedAt: AT },
    { reason: 'undo_expired', undoId: 'undo-1', expiresAt: AT },
    {
      reason: 'undo_conflict',
      undoId: 'undo-1',
      conflicts: [
        {
          entityType: 'section',
          id: 'section-1',
          title: 'Backlog',
          problem: 'superseded',
          nextStep: 'use-later-receipt-or-archive',
        },
      ],
    },
    { reason: 'undo_blocked', undoId: 'undo-1', blockingProjectId: 'project-a', blockingProjectTitle: 'Kitchen' },
    { reason: 'undo_unavailable', undoId: 'undo-1', problem: 'no-compatible-page' },
  ])('parses $reason', (details) => {
    expect(UndoRefusalDetailsSchema.parse(details)).toEqual(details);
  });

  it('rejects an empty conflict list and an unknown reason', () => {
    expect(UndoRefusalDetailsSchema.safeParse({ reason: 'undo_conflict', undoId: 'undo-1', conflicts: [] }).success).toBe(
      false,
    );
    expect(UndoRefusalDetailsSchema.safeParse({ reason: 'undo_maybe', undoId: 'undo-1' }).success).toBe(false);
  });

  it('requires a typed next step and omits titles for missing entities', () => {
    const missing = {
      entityType: 'task',
      id: 'task-missing',
      problem: 'missing',
      nextStep: 'nothing-to-restore',
    };
    expect(UndoRefusalDetailsSchema.safeParse({
      reason: 'undo_conflict', undoId: 'undo-1', conflicts: [missing],
    }).success).toBe(true);
    expect(UndoRefusalDetailsSchema.safeParse({
      reason: 'undo_conflict', undoId: 'undo-1', conflicts: [{ ...missing, nextStep: undefined }],
    }).success).toBe(false);
    expect(UndoRefusalDetailsSchema.safeParse({
      reason: 'undo_conflict', undoId: 'undo-1', conflicts: [{ ...missing, title: 'Gone' }],
    }).success).toBe(false);
    expect(UndoRefusalDetailsSchema.safeParse({
      reason: 'undo_conflict', undoId: 'undo-1', conflicts: [{ ...missing, nextStep: 'guess' }],
    }).success).toBe(false);
  });

  it('carries the exact outstanding removal receipt on a repeat-removal refusal', () => {
    const removalReceipt = {
      undoId: 'undo-1',
      operation: 'section.remove',
      label: 'Removed the Backlog section',
      createdAt: AT,
      expiresAt: LATER,
    };
    const details = { reason: 'section_already_removed', sectionId: 'section-a', undo: removalReceipt };
    expect(SectionAlreadyRemovedDetailsSchema.parse(details)).toEqual(details);
    expect(SectionAlreadyRemovedDetailsSchema.safeParse({ ...details, operationData: {} }).success).toBe(false);
  });
});
