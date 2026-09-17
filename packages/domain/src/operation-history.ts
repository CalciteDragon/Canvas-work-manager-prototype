import type {
  OperationAction,
  OperationActionId,
  OperationHistory,
  OperationHistoryDirection,
} from '@cwm/contracts';

/**
 * **The operation-history state machine** (Slice 35; docs/decisions/2026-09-operation-history-scope.md).
 *
 * Pure: no repository, no clock read, no id generation. Every function takes one history and its
 * actions and returns the next state, so the rules below are provable without a store:
 *
 * - The cursor is an **order value**. Every action at or below it is `applied` or `retired`; every
 *   action above it is `undone` or `retired`.
 * - Undo selects the highest `applied` action at or below the cursor and moves the cursor just
 *   below it. Redo selects the lowest `undone` action above the cursor and moves the cursor to it.
 *   Both skip `retired` actions.
 * - `revision` increments on every committed mutation — record, transition, retirement — and never
 *   on pruning.
 * - Pruning is contiguous from the ends, because the dev-panel clock is settable and so expiry
 *   order is not stack order: a gap in the middle would make "the next action" meaningless.
 */

/** One history and every action it holds. */
export interface OperationHistoryState {
  history: OperationHistory;
  actions: readonly OperationAction[];
}

/** An action before recording assigns its order and its initial `applied` state. */
export type NewOperationAction = Omit<OperationAction, 'order' | 'state'>;

/** A transition's state change and the action it moved, or `null` when that direction is empty. */
export interface OperationHistoryStep {
  state: OperationHistoryState;
  action: OperationAction | null;
}

/** Actions retained per history, applied and undone combined. */
export const OPERATION_HISTORY_LIMIT = 50;

const byOrder = (actions: readonly OperationAction[]): OperationAction[] =>
  [...actions].sort((left, right) => left.order - right.order);

/**
 * The only action a transition in `direction` may target, or `null`. Expiry is not considered
 * here: an expired action is still the next step, and refuses as expired rather than letting a
 * caller skip past it.
 */
export const nextOperationAction = (
  state: OperationHistoryState,
  direction: OperationHistoryDirection,
): OperationAction | null => {
  const ordered = byOrder(state.actions);
  const { cursor } = state.history;
  return direction === 'undo'
    ? ordered.filter((action) => action.state === 'applied' && action.order <= cursor).at(-1) ?? null
    : ordered.find((action) => action.state === 'undone' && action.order > cursor) ?? null;
};

/**
 * Appends a successful new write. The redo branch — everything above the cursor, retired actions
 * included — is discarded, so a new write can never be followed by a Redo of an older branch. The
 * new action takes the next order after the high-water mark, never a pruned one.
 */
export const recordOperationAction = (state: OperationHistoryState, action: NewOperationAction): OperationHistoryState => {
  if (action.historyId !== state.history.id) throw new RangeError('an action must name its own history');
  const order = state.history.orderHighWaterMark + 1;
  return {
    history: { ...state.history, cursor: order, orderHighWaterMark: order, revision: state.history.revision + 1 },
    actions: [
      ...byOrder(state.actions).filter((existing) => existing.order <= state.history.cursor),
      { ...action, order, state: 'applied' },
    ],
  };
};

/**
 * Moves the cursor one step in `direction` and flips the selected action's state. It does not
 * execute anything: the caller runs the executor first and commits this only if it succeeded.
 */
export const transitionOperationHistory = (
  state: OperationHistoryState,
  direction: OperationHistoryDirection,
): OperationHistoryStep => {
  const action = nextOperationAction(state, direction);
  if (action === null) return { state, action: null };
  const moved: OperationAction = { ...action, state: direction === 'undo' ? 'undone' : 'applied' };
  return {
    state: {
      history: {
        ...state.history,
        cursor: direction === 'undo' ? action.order - 1 : action.order,
        revision: state.history.revision + 1,
      },
      actions: state.actions.map((existing) => (existing.id === action.id ? moved : existing)),
    },
    action: moved,
  };
};

/**
 * Retires an action that can never succeed again. The cursor steps below it when it was on the
 * applied side and stays put when it was on the redo side, so in both cases the action is on
 * neither path any more and the actions beyond it are reachable. Nothing executes.
 */
export const retireOperationAction = (state: OperationHistoryState, actionId: OperationActionId): OperationHistoryState => {
  const action = state.actions.find((candidate) => candidate.id === actionId);
  if (action === undefined) throw new RangeError('a retired action must belong to its history');
  if (action.state === 'retired') return state;
  return {
    history: {
      ...state.history,
      cursor: action.order <= state.history.cursor ? action.order - 1 : state.history.cursor,
      revision: state.history.revision + 1,
    },
    actions: state.actions.map((candidate) => (candidate.id === actionId ? { ...candidate, state: 'retired' } : candidate)),
  };
};

/**
 * Discards expired and over-cap actions without touching the cursor, the high-water mark or the
 * revision.
 *
 * - An expired action at or below the cursor discards itself and **everything below it**.
 * - An expired action above the cursor discards the **whole redo branch**, so a Redo can never
 *   jump a hole.
 * - Past `limit`, the lowest orders go first — from the bottom, never the middle.
 *
 * Expiry is lazy: the recorder prunes only after its next record, so an expired action can still be the
 * next step and refuse `history_expired` until then.
 */
export const pruneOperationHistory = (state: OperationHistoryState, nowMs: number, limit = OPERATION_HISTORY_LIMIT): OperationHistoryState => {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('history retention limit must be a positive integer');
  const { cursor } = state.history;
  const expired = (action: OperationAction): boolean => nowMs >= Date.parse(action.expiresAt);
  let actions = byOrder(state.actions);

  const lowestKept = actions.filter((action) => action.order <= cursor && expired(action)).at(-1)?.order;
  if (lowestKept !== undefined) actions = actions.filter((action) => action.order > lowestKept);
  if (actions.some((action) => action.order > cursor && expired(action))) {
    actions = actions.filter((action) => action.order <= cursor);
  }
  if (actions.length > limit) actions = actions.slice(actions.length - limit);
  return { history: state.history, actions };
};
