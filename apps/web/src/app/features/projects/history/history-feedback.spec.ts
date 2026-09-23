import {
  UndoConflictNextStepSchema,
  type OperationHistoryDirection,
  type OperationHistoryEntry,
  type OperationHistoryRefusalDetails,
  type OperationHistorySummary,
  type ProjectId,
  type UndoResult,
} from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import {
  archivedHereFeedback,
  conflictLines,
  crossOwnerFeedback,
  historyControl,
  nextStepCopy,
  transitionRefusalFeedback,
  transitionResultFeedback,
  type HistoryControlInput,
} from './history-feedback';

const expiresAt = '2026-09-23T10:00:00.000Z';
const entry = (label: string, blockedBy: OperationHistoryEntry['blockedBy'] = null): OperationHistoryEntry => ({
  actionId: 'operation-1' as OperationHistoryEntry['actionId'], operation: 'section.update', label, expiresAt, blockedBy,
});
const summary: OperationHistorySummary = {
  projectId: 'project-1' as ProjectId, historyId: null, revision: 0, undo: null, redo: null, blockedBy: null,
};
const base = { historyId: 'history-1', actionId: 'operation-1', summary } as const;
const conflict = { entityType: 'section', id: 'section-1', title: 'Notes', problem: 'field-changed', nextStep: 'change-by-hand' } as const;

const REFUSALS: OperationHistoryRefusalDetails[] = [
  { reason: 'history_not_next', ...base },
  { reason: 'history_revision_stale', ...base },
  { reason: 'history_expired', ...base, expiresAt },
  { reason: 'history_blocked', ...base, blockingProjectId: 'project-9' as ProjectId, blockingProjectTitle: 'Legacy attic' },
  { reason: 'history_conflict', ...base, conflicts: [conflict] },
  { reason: 'history_unavailable', ...base, problem: 'no-compatible-page' },
  { reason: 'history_retired', ...base, conflicts: [conflict] },
] as OperationHistoryRefusalDetails[];

describe('history feedback (Slice 41)', () => {
  it('words every refusal reason in both directions', () => {
    for (const direction of ['undo', 'redo'] as OperationHistoryDirection[]) {
      const verb = direction === 'undo' ? 'Undo' : 'Redo';
      const said = Object.fromEntries(REFUSALS.map((refusal) => [refusal.reason, transitionRefusalFeedback(direction, 'Renamed "A" to "B"', refusal)]));
      expect(said['history_revision_stale']!.message).toMatch(/history changed elsewhere/);
      expect(said['history_not_next']!.message).toMatch(/history changed elsewhere/);
      expect(said['history_expired']!.message).toContain(expiresAt);
      expect(said['history_blocked']!.message).toBe(`${verb} is blocked while Legacy attic is archived. Reactivate it, then try again.`);
      expect(said['history_conflict']!.lines).toEqual([`Notes [section-1]: Someone else changed it since. Make the change again by hand.`]);
      expect(said['history_unavailable']!.message).toMatch(new RegExp(`try ${verb} again`));
      expect(said['history_retired']!.message).toBe(`“Renamed "A" to "B"” can no longer be ${direction === 'undo' ? 'undone' : 'redone'} and was skipped. The controls now show the next step.`);
    }
    expect(transitionRefusalFeedback('undo', 'x', { ...REFUSALS[5], problem: 'shortcut-on-fallback-page' } as OperationHistoryRefusalDetails).message)
      .toMatch(/^A shortcut on the fallback page/);
  });

  it('gives every next step a sentence that retries in the right direction', () => {
    for (const step of UndoConflictNextStepSchema.options) {
      expect(nextStepCopy(step, 'redo')).not.toMatch(/try Undo/);
      expect(nextStepCopy(step, 'undo').length).toBeGreaterThan(10);
    }
    expect(nextStepCopy('move-back-and-retry', 'redo')).toBe('Move it back to where it was, then try Redo again.');
  });

  it('deduplicates conflict lines by entity and repair', () => {
    expect(conflictLines([conflict, conflict, { ...conflict, nextStep: 'restore-state-and-retry' }], 'undo')).toHaveLength(2);
  });

  it('says where a removal Undo landed when it was not its own place', () => {
    const removal = (outcome: 'restored' | 'partial', strategy: string, pageEnabled = true) => ({
      operation: 'section.remove', outcome, section: {}, restoredRowCount: 0,
      placement: { pageId: 'page-2', index: 0, pageEnabled, strategy },
    }) as unknown as UndoResult;
    expect(transitionResultFeedback('undo', 'Removed the Notes section', removal('restored', 'previous')).message)
      .toBe('Undid: Removed the Notes section.');
    expect(transitionResultFeedback('undo', 'Removed the Notes section', removal('partial', 'fallback-page')).message)
      .toBe('Undid: Removed the Notes section. It landed on another available page (page-2).');
    expect(transitionResultFeedback('undo', 'Removed the Notes section', removal('restored', 'previous', false)).message)
      .toMatch(/disabled page \(page-2\)/);
    expect(transitionResultFeedback('redo', 'Renamed "A" to "B"', { operation: 'project.update' } as never).message).toBe('Redid: Renamed "A" to "B".');
  });

  it('words cross-owner guidance with its link, and the archive that stays', () => {
    expect(crossOwnerFeedback('Completed "Tile"', 'project-kitchen' as ProjectId, 'Kitchen')).toEqual({
      tone: 'status',
      message: 'Completed "Tile" was recorded in Kitchen’s history.',
      link: { projectId: 'project-kitchen', label: 'Open Kitchen' },
    });
    expect(archivedHereFeedback('Garden').message).toBe('Garden is archived. Undo is available here.');
  });

  it('names each control state, enabled only for an unblocked step', () => {
    const control = (overrides: Partial<HistoryControlInput>) => historyControl({
      direction: 'undo', readState: 'ready', entry: entry('Collapsed the Tasks shortcut'), transitionPending: null, writePending: false, ...overrides,
    });
    expect(control({})).toEqual({ name: 'Undo: Collapsed the Tasks shortcut', enabled: true });
    expect(control({ direction: 'redo' })).toEqual({ name: 'Redo: Collapsed the Tasks shortcut', enabled: true });
    expect(control({ entry: null })).toEqual({ name: 'Nothing to undo', enabled: false });
    expect(control({ direction: 'redo', entry: null })).toEqual({ name: 'Nothing to redo', enabled: false });
    expect(control({ readState: 'loading' })).toEqual({ name: 'Loading history…', enabled: false });
    expect(control({ readState: 'unavailable' })).toEqual({ name: 'History unavailable', enabled: false });
    expect(control({ writePending: true })).toEqual({ name: 'Saving a change…', enabled: false });
    expect(control({ transitionPending: 'undo' })).toEqual({ name: 'Undoing…', enabled: false });
    expect(control({ direction: 'redo', transitionPending: 'redo' })).toEqual({ name: 'Redoing…', enabled: false });
    expect(control({ direction: 'redo', transitionPending: 'undo' })).toEqual({ name: 'Saving a change…', enabled: false });
    const blocker = { projectId: 'project-legacy' as ProjectId, title: 'Legacy attic' };
    expect(control({ entry: entry('x', blocker) })).toEqual({ name: 'Undo unavailable while Legacy attic is archived', enabled: false });
    expect(control({ direction: 'redo', entry: entry('x', blocker) })).toEqual({ name: 'Redo unavailable while Legacy attic is archived', enabled: false });
  });
});
