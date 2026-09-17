import { OperationHistorySchema, type OperationAction } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import {
  OPERATION_HISTORY_LIMIT,
  nextOperationAction,
  pruneOperationHistory,
  recordOperationAction,
  retireOperationAction,
  transitionOperationHistory,
  type NewOperationAction,
  type OperationHistoryState,
} from './operation-history';

const createdAt = '2026-09-16T10:00:00.000Z';
const expiresAt = '2026-09-17T10:00:00.000Z';
const NOW = Date.parse(createdAt);

const empty = (): OperationHistoryState => ({
  history: OperationHistorySchema.parse({
    id: 'history-1', workspaceId: 'workspace-1', projectId: 'project-1', actor: 'user', actorUserId: 'user-1',
    cursor: 0, orderHighWaterMark: 0, revision: 0,
  }),
  actions: [],
});

const action = (id: string, expires: string = expiresAt): NewOperationAction => ({
  id: id as OperationAction['id'],
  historyId: 'history-1' as OperationAction['historyId'],
  label: id,
  createdAt,
  expiresAt: expires,
  operation: {
    version: 1, type: 'section.update', sectionId: 'section-1' as never, projectId: 'project-1' as never, pageId: 'page-1' as never,
    changes: [{ field: 'collapsed', before: false, after: true }],
  },
});

const record = (state: OperationHistoryState, ...ids: string[]): OperationHistoryState =>
  ids.reduce((next, id) => recordOperationAction(next, action(id)), state);

const compact = (state: OperationHistoryState) => ({
  cursor: state.history.cursor,
  high: state.history.orderHighWaterMark,
  revision: state.history.revision,
  actions: [...state.actions].sort((a, b) => a.order - b.order).map(({ id, order, state: status }) => `${id}:${order}:${status}`),
});

const undo = (state: OperationHistoryState) => transitionOperationHistory(state, 'undo').state;
const redo = (state: OperationHistoryState) => transitionOperationHistory(state, 'redo').state;

describe('operation history state machine', () => {
  it('A → B → undo → undo → redo → redo returns the exact four intermediate states and a monotonic revision', () => {
    let state = record(empty(), 'A', 'B');
    expect(compact(state)).toEqual({ cursor: 2, high: 2, revision: 2, actions: ['A:1:applied', 'B:2:applied'] });

    state = undo(state);
    expect(compact(state)).toEqual({ cursor: 1, high: 2, revision: 3, actions: ['A:1:applied', 'B:2:undone'] });
    state = undo(state);
    expect(compact(state)).toEqual({ cursor: 0, high: 2, revision: 4, actions: ['A:1:undone', 'B:2:undone'] });
    expect(nextOperationAction(state, 'undo')).toBeNull();
    state = redo(state);
    expect(compact(state)).toEqual({ cursor: 1, high: 2, revision: 5, actions: ['A:1:applied', 'B:2:undone'] });
    state = redo(state);
    expect(compact(state)).toEqual({ cursor: 2, high: 2, revision: 6, actions: ['A:1:applied', 'B:2:applied'] });
    expect(nextOperationAction(state, 'redo')).toBeNull();
    expect(transitionOperationHistory(state, 'redo')).toEqual({ state, action: null });
  });

  it('a new action clears only the redo branch', () => {
    let state = undo(record(empty(), 'A', 'B'));
    state = recordOperationAction(state, action('C'));

    expect(compact(state)).toEqual({ cursor: 3, high: 3, revision: 4, actions: ['A:1:applied', 'C:3:applied'] });
    expect(nextOperationAction(state, 'redo')).toBeNull();
    state = undo(undo(state));
    expect(compact(state)).toEqual({ cursor: 0, high: 3, revision: 6, actions: ['A:1:undone', 'C:3:undone'] });
  });

  it('a no-op, a refusal and a failure preserve redo — only recording clears the branch', () => {
    // The pure machine has exactly one branch-clearing function; a no-op write never calls it, and a
    // refused or failed transition never commits the state it computed.
    const undone = undo(record(empty(), 'A', 'B'));
    const discarded = transitionOperationHistory(undone, 'redo');
    expect(discarded.action?.id).toBe('B');
    expect(nextOperationAction(undone, 'redo')?.id).toBe('B');
    expect(compact(undone).actions).toEqual(['A:1:applied', 'B:2:undone']);
    expect(nextOperationAction(retireOperationAction(undone, 'A' as never), 'redo')?.id).toBe('B');
  });

  it('only the next action is executable, in either direction', () => {
    let state = record(empty(), 'A', 'B');
    expect(nextOperationAction(state, 'undo')?.id).toBe('B');
    expect(nextOperationAction(state, 'redo')).toBeNull();
    state = undo(state);
    expect(nextOperationAction(state, 'redo')?.id).toBe('B');
    expect(nextOperationAction(state, 'undo')?.id).toBe('A');
  });

  it('refuses to record an action for another history', () => {
    expect(() => recordOperationAction(empty(), { ...action('A'), historyId: 'history-2' as never })).toThrow(RangeError);
  });

  it('revision increments on record, transition and retirement, never on pruning', () => {
    let state = record(empty(), 'A', 'B');
    expect(state.history.revision).toBe(2);
    state = undo(state);
    expect(state.history.revision).toBe(3);
    state = retireOperationAction(state, 'B' as never);
    expect(state.history.revision).toBe(4);
    const pruned = pruneOperationHistory(state, Date.parse('2026-09-20T00:00:00.000Z'));
    expect(pruned.actions).toEqual([]);
    expect(pruned.history).toEqual(state.history);
  });

  describe('retention', () => {
    it('an expired applied action discards itself and everything below it, contiguously', () => {
      let state = recordOperationAction(empty(), action('A'));
      state = recordOperationAction(state, action('B', '2026-09-16T09:00:00.000Z'));
      state = recordOperationAction(state, action('C'));
      // B expired out of order — the clock is settable — so A below it goes too, and C stays.
      expect(compact(pruneOperationHistory(state, NOW)).actions).toEqual(['C:3:applied']);
    });

    it('an expired action anywhere in the undone branch discards the whole branch', () => {
      let state = recordOperationAction(empty(), action('A'));
      state = recordOperationAction(state, action('B'));
      state = recordOperationAction(state, action('C', '2026-09-16T09:00:00.000Z'));
      state = undo(undo(state));
      const pruned = pruneOperationHistory(state, NOW);
      expect(compact(pruned).actions).toEqual(['A:1:applied']);
      // A pruned action never resurrects a redo branch.
      expect(nextOperationAction(pruned, 'redo')).toBeNull();
    });

    it('the 51st action prunes the oldest, and order is never reused after pruning', () => {
      let state = empty();
      for (let index = 1; index <= OPERATION_HISTORY_LIMIT + 1; index += 1) {
        state = pruneOperationHistory(recordOperationAction(state, action(`A${index}`)), NOW);
      }
      expect(state.actions).toHaveLength(OPERATION_HISTORY_LIMIT);
      expect(state.actions.map(({ order }) => order)).toEqual(Array.from({ length: OPERATION_HISTORY_LIMIT }, (_, index) => index + 2));
      expect(compact(state)).toMatchObject({ cursor: 51, high: 51, revision: 51 });

      state = pruneOperationHistory(recordOperationAction(state, action('next')), NOW);
      expect(state.actions.at(-1)).toMatchObject({ id: 'next', order: 52 });
      expect(state.actions[0]).toMatchObject({ order: 3 });
    });

    it('the cursor survives pruning every action beneath it', () => {
      const state = pruneOperationHistory(undo(record(empty(), 'A', 'B')), Date.parse('2026-09-20T00:00:00.000Z'));
      expect(compact(state)).toEqual({ cursor: 1, high: 2, revision: 3, actions: [] });
      expect(() => OperationHistorySchema.parse(state.history)).not.toThrow();
    });

    it('rejects a non-positive limit', () => {
      expect(() => pruneOperationHistory(empty(), NOW, 0)).toThrow(RangeError);
    });
  });

  describe('retirement', () => {
    it('a retired action is skipped in both directions', () => {
      let state = record(empty(), 'A', 'B');
      state = retireOperationAction(state, 'B' as never);
      expect(compact(state)).toEqual({ cursor: 1, high: 2, revision: 3, actions: ['A:1:applied', 'B:2:retired'] });
      expect(nextOperationAction(state, 'redo')).toBeNull();
      expect(nextOperationAction(state, 'undo')?.id).toBe('A');

      state = undo(state);
      expect(compact(state)).toEqual({ cursor: 0, high: 2, revision: 4, actions: ['A:1:undone', 'B:2:retired'] });
      expect(nextOperationAction(state, 'redo')?.id).toBe('A');
      state = redo(state);
      expect(nextOperationAction(state, 'redo')).toBeNull();
      expect(nextOperationAction(state, 'undo')?.id).toBe('A');
    });

    it('a retirement on the redo side leaves the cursor and unwedges the branch beyond it', () => {
      let state = undo(undo(record(empty(), 'A', 'B')));
      state = redo(state);
      state = retireOperationAction(state, 'B' as never);
      expect(compact(state)).toEqual({ cursor: 1, high: 2, revision: 6, actions: ['A:1:applied', 'B:2:retired'] });
      expect(nextOperationAction(state, 'redo')).toBeNull();

      let deeper = undo(undo(undo(record(empty(), 'A', 'B', 'C'))));
      deeper = retireOperationAction(redo(deeper), 'B' as never);
      expect(nextOperationAction(deeper, 'redo')?.id).toBe('C');
      deeper = redo(deeper);
      expect(compact(deeper)).toMatchObject({ cursor: 3, actions: ['A:1:applied', 'B:2:retired', 'C:3:applied'] });
      expect(nextOperationAction(deeper, 'undo')?.id).toBe('C');
    });

    it('retiring twice is a no-op and a foreign action throws', () => {
      const state = retireOperationAction(record(empty(), 'A'), 'A' as never);
      expect(retireOperationAction(state, 'A' as never)).toBe(state);
      expect(() => retireOperationAction(state, 'Z' as never)).toThrow(RangeError);
    });

    it('recording discards retired actions above the cursor with the rest of the redo branch', () => {
      let state = retireOperationAction(undo(record(empty(), 'A', 'B')), 'B' as never);
      state = recordOperationAction(state, action('C'));
      expect(compact(state).actions).toEqual(['A:1:applied', 'C:3:applied']);
    });
  });
});
