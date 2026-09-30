import { describe, expect, it } from 'vitest';
import type { UndoConflict, UndoConflictNextStep } from '@cwm/contracts';
import { OperationExecutionRefused, refuseOnConflicts } from './operation-execution';

const conflict = (nextStep: UndoConflictNextStep, problem: UndoConflict['problem'] = 'moved', id = 'task-1'): UndoConflict => ({
  entityType: 'task', id, ...(problem === 'missing' ? {} : { title: 'Named task' }), problem, nextStep,
});

const refusal = (conflicts: UndoConflict[], permanent: (item: UndoConflict) => boolean = () => false) => {
  try {
    refuseOnConflicts(conflicts, (shown) => `Could not apply: ${shown}`, permanent);
  } catch (error) {
    if (error instanceof OperationExecutionRefused) return error;
    throw error;
  }
  throw new Error('expected conflict refusal');
};

describe('plain-language operation conflict text', () => {
  it.each([
    ['move-back-and-retry', 'moved', 'move it back, then retry'],
    ['restore-state-and-retry', 'archived-subject', 'restore its previous state, then retry'],
    ['restore-or-move-dependent-and-retry', 'new-dependent', 'restore or move the dependent, then retry'],
    ['remove-reference-and-retry', 'shortcut-reference', 'remove the reference, then retry'],
    ['change-by-hand', 'field-changed', 'make the change by hand'],
    ['change-by-hand-or-archive', 'archived-differently', 'make the change by hand or check Archive'],
    ['nothing-to-undo', 'missing', 'restore the missing item, then retry'],
    ['nothing-to-undo', 'not-archived', 'return it to its recorded archived state, then retry'],
    ['nothing-to-restore', 'missing', 'restore the missing item, then retry'],
    ['nothing-to-restore', 'already-exists', 'free the recorded id, then retry'],
  ] as const)('explains %s with %s', (nextStep, problem, words) => {
    const item = conflict(nextStep, problem);
    const error = refusal([item]);
    expect(error.message).toContain(`${problem}: task${problem === 'missing' ? '' : ' "Named task"'} [task-1]`);
    expect(error.message).toContain(words);
    expect(error.problem).toEqual({ kind: 'conflict', conflicts: [item], permanent: false });
  });

  it('uses current-state words throughout a retiring mixed list', () => {
    const items = [conflict('restore-state-and-retry', 'archived-subject'), conflict('nothing-to-undo', 'not-archived', 'section-1')];
    const error = refusal(items, (item) => item.id === 'section-1');
    expect(error.problem).toEqual({ kind: 'conflict', conflicts: items, permanent: true });
    expect(error.message).toContain('restore its previous state');
    expect(error.message).toContain('already live');
    expect(error.message).not.toContain('then retry');
  });

  it.each([
    ['nothing-to-undo', 'missing', 'missing'],
    ['nothing-to-restore', 'missing', 'missing'],
    ['nothing-to-restore', 'already-exists', 'recorded id occupied'],
  ] as const)('describes retired %s %s as current state', (nextStep, problem, words) => {
    expect(refusal([conflict(nextStep, problem)], () => true).message).toContain(words);
  });

  it('shows five conflicts, counts the rest, and retains the full typed list', () => {
    const items = Array.from({ length: 6 }, (_, index) => conflict('move-back-and-retry', 'moved', `task-${index + 1}`));
    const error = refusal(items, (item) => item.id === 'task-6');
    expect(error.message).toContain('task-5');
    expect(error.message).not.toContain('[task-6]');
    expect(error.message).toContain('and 1 more');
    expect(error.message).not.toContain('then retry');
    expect(error.problem).toEqual({ kind: 'conflict', conflicts: items, permanent: true });
  });
});
