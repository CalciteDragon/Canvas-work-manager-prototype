import { describe, expect, it } from 'vitest';
import {
  OperationActionSchema,
  OperationHistoryRefusalDetailsSchema,
  OperationHistoryStepInputSchema,
  OperationHistorySchema,
  OperationHistorySummarySchema,
  OperationHistoryTransitionInputSchema,
  OperationHistoryTransitionResultSchema,
} from './operation-history';

const createdAt = '2026-09-16T10:00:00.000Z';
const expiresAt = '2026-09-17T10:00:00.000Z';

const history = {
  id: 'history-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  actor: 'user',
  actorUserId: 'user-1',
  cursor: 1,
  orderHighWaterMark: 1,
  revision: 4,
};

const action = {
  id: 'operation-1',
  historyId: 'history-1',
  order: 1,
  state: 'applied',
  label: 'Updated the Backlog section',
  createdAt,
  expiresAt,
  operation: {
    version: 1,
    type: 'section.update',
    sectionId: 'section-1',
    projectId: 'project-1',
    pageId: 'page-1',
    changes: [{ field: 'collapsed', before: false, after: true }],
  },
};

const summary = {
  projectId: 'project-1',
  historyId: 'history-1',
  revision: 4,
  undo: { actionId: 'operation-1', operation: 'section.update', label: 'Updated the Backlog section', expiresAt, blockedBy: null },
  redo: null,
  blockedBy: null,
};

describe('operation history contracts', () => {
  it('rejects an unknown operation version or type', () => {
    expect(OperationActionSchema.safeParse(action).success).toBe(true);
    expect(OperationActionSchema.safeParse({ ...action, operation: { ...action.operation, version: 2 } }).success).toBe(false);
    expect(OperationActionSchema.safeParse({ ...action, operation: { ...action.operation, type: 'section.unknown' } }).success).toBe(false);
    expect(OperationActionSchema.safeParse({ ...action, state: 'consumed' }).success).toBe(false);
  });

  it('stores an optional-page action and its summary entry additively (Slice 38)', () => {
    const page = {
      id: 'page-reflections',
      projectId: 'project-1',
      kind: 'reflections',
      enabled: true,
      createdAt,
      updatedAt: createdAt,
    };
    const added = {
      ...action,
      label: 'Enabled the reflections page',
      operation: { version: 1, type: 'page.add', page },
    };
    const toggled = {
      ...action,
      label: 'Disabled the reflections page',
      operation: { version: 1, type: 'page.update', projectId: 'project-1', pageId: 'page-reflections', kind: 'reflections', before: true, after: false },
    };
    expect(OperationActionSchema.parse(added).operation.type).toBe('page.add');
    expect(OperationActionSchema.parse(toggled).operation.type).toBe('page.update');
    // Schema version 5 is unchanged, so a payload the old union never held must still fail.
    expect(OperationActionSchema.safeParse({ ...added, operation: { version: 1, type: 'page.remove', pageId: 'page-reflections' } }).success).toBe(false);
    expect(
      OperationHistorySummarySchema.parse({
        ...summary,
        undo: { actionId: 'operation-1', operation: 'page.add', label: 'Enabled the reflections page', expiresAt, blockedBy: null },
      }).undo?.operation,
    ).toBe('page.add');
  });

  it('a cursor is a non-negative integer no higher than the order high-water mark', () => {
    expect(OperationHistorySchema.safeParse({ ...history, cursor: 0 }).success).toBe(true);
    expect(OperationHistorySchema.safeParse(history).success).toBe(true);
    expect(OperationHistorySchema.safeParse({ ...history, cursor: 2 }).success).toBe(false);
    expect(OperationHistorySchema.safeParse({ ...history, cursor: -1 }).success).toBe(false);
    expect(OperationHistorySchema.safeParse({ ...history, cursor: 0.5 }).success).toBe(false);
    expect(OperationActionSchema.safeParse({ ...action, order: 0 }).success).toBe(false);
  });

  it('attributes a history to exactly one actor and expires an action after it is created', () => {
    const { actorUserId: _user, ...unattributed } = history;
    expect(OperationHistorySchema.safeParse(unattributed).success).toBe(false);
    expect(OperationHistorySchema.safeParse({ ...unattributed, actor: 'agent', actorAgentConnectionId: 'agent-1' }).success).toBe(true);
    expect(OperationActionSchema.safeParse({ ...action, expiresAt: createdAt }).success).toBe(false);
  });

  it('a summary carries no snapshot', () => {
    expect(OperationHistorySummarySchema.parse(summary)).toEqual(summary);
    expect(OperationHistorySummarySchema.safeParse({ ...summary, undo: { ...summary.undo, operationData: action.operation } }).success).toBe(false);
    expect(OperationHistorySummarySchema.safeParse({ ...summary, cursor: 1 }).success).toBe(false);
    // Each entry says whether **that step** is blocked (Slice 41): required, nullable and strict.
    const { blockedBy: _step, ...unblocked } = summary.undo;
    expect(OperationHistorySummarySchema.safeParse({ ...summary, undo: unblocked }).success).toBe(false);
    const blocked = { ...summary.undo, blockedBy: { projectId: 'project-1', title: 'Kitchen' } };
    expect(OperationHistorySummarySchema.parse({ ...summary, undo: blocked }).undo?.blockedBy?.title).toBe('Kitchen');
    expect(OperationHistorySummarySchema.safeParse({ ...summary, undo: { ...blocked, blockedBy: { ...blocked.blockedBy, since: expiresAt } } }).success).toBe(false);
    // An actor with no recorded write in the project has an empty summary, not a fabricated id.
    expect(OperationHistorySummarySchema.safeParse({ ...summary, historyId: null, revision: 0, undo: null }).success).toBe(true);
  });

  it('transition and step inputs are strict', () => {
    const input = { actionId: 'operation-1', direction: 'undo', expectedRevision: 4 };
    expect(OperationHistoryTransitionInputSchema.parse(input)).toEqual(input);
    expect(OperationHistoryTransitionInputSchema.safeParse({ ...input, force: true }).success).toBe(false);
    expect(OperationHistoryTransitionInputSchema.safeParse({ ...input, direction: 'sideways' }).success).toBe(false);
    expect(OperationHistoryTransitionInputSchema.safeParse({ ...input, expectedRevision: undefined }).success).toBe(false);
    expect(OperationHistoryStepInputSchema.safeParse({ historyId: 'history-1', actionId: 'operation-1', expectedRevision: 4 }).success).toBe(true);
    expect(OperationHistoryStepInputSchema.safeParse({ undoId: 'undo-1' }).success).toBe(false);
  });

  it('a transition result pairs its direction with that direction’s result', () => {
    const undone = {
      direction: 'undo',
      actionId: 'operation-1',
      result: { operation: 'section.add', outcome: 'removed', sectionId: 'section-1', projectId: 'project-1', pageId: 'page-1' },
      summary: { ...summary, undo: null },
    };
    expect(OperationHistoryTransitionResultSchema.parse(undone)).toEqual(undone);
    expect(OperationHistoryTransitionResultSchema.safeParse({ ...undone, direction: 'redo' }).success).toBe(false);
  });

  it('every refusal carries its history, the named action and the current summary', () => {
    const base = { historyId: 'history-1', actionId: 'operation-1', summary };
    const conflicts = [{ entityType: 'section', id: 'section-1', title: 'Backlog', problem: 'field-changed', nextStep: 'change-by-hand' }];
    for (const details of [
      { reason: 'history_not_next', ...base },
      { reason: 'history_revision_stale', ...base },
      { reason: 'history_expired', ...base, expiresAt },
      { reason: 'history_blocked', ...base, blockingProjectId: 'project-1', blockingProjectTitle: 'Kitchen' },
      { reason: 'history_conflict', ...base, conflicts },
      { reason: 'history_unavailable', ...base, problem: 'no-compatible-page' },
      { reason: 'history_retired', ...base, conflicts },
    ]) {
      expect(OperationHistoryRefusalDetailsSchema.parse(details)).toEqual(details);
    }
    expect(OperationHistoryRefusalDetailsSchema.safeParse({ reason: 'history_not_next', historyId: 'history-1', actionId: 'operation-1' }).success).toBe(false);
    expect(OperationHistoryRefusalDetailsSchema.safeParse({ reason: 'history_conflict', ...base, conflicts: [] }).success).toBe(false);
    expect(OperationHistoryRefusalDetailsSchema.safeParse({ reason: 'history_empty', ...base }).success).toBe(false);
    expect(OperationHistoryRefusalDetailsSchema.safeParse({ reason: 'undo_consumed', undoId: 'undo-1', consumedAt: createdAt }).success).toBe(false);
  });
});
