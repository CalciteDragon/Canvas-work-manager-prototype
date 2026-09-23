import type {
  OperationHistoryDirection,
  OperationHistoryEntry,
  OperationHistoryRefusalDetails,
  ProjectId,
  RedoResult,
  UndoConflict,
  UndoConflictNextStep,
  UndoResult,
} from '@cwm/contracts';

/**
 * **Every sentence the header's Undo/Redo controls say** (Slice 41, §31), as pure functions over
 * the contract unions, so a new refusal reason or next step fails to compile until it is worded.
 * Moved here from the canvas store and the retired notice, and rewritten for both directions.
 */

/** One line of header feedback. `link` is the cross-owner "Open Kitchen" route. */
export interface HistoryFeedback {
  tone: 'status' | 'alert';
  message: string;
  /** One line per conflicting subject and its repair, for a `history_conflict`. */
  lines?: readonly string[];
  link?: { projectId: ProjectId; label: string };
}

const VERB: Record<OperationHistoryDirection, string> = { undo: 'Undo', redo: 'Redo' };
const PAST: Record<OperationHistoryDirection, string> = { undo: 'undone', redo: 'redone' };

/** The repair each conflict's `nextStep` asks for, ending in the direction's retry. */
export const nextStepCopy = (step: UndoConflictNextStep, direction: OperationHistoryDirection): string => {
  const verb = VERB[direction];
  switch (step) {
    case 'move-back-and-retry':
      return `Move it back to where it was, then try ${verb} again.`;
    case 'restore-state-and-retry':
      return `Restore its previous state, then try ${verb} again.`;
    case 'restore-or-move-dependent-and-retry':
      return `Restore or move the new dependent, then try ${verb} again.`;
    case 'remove-reference-and-retry':
      return `Remove the reference, then try ${verb} again.`;
    case 'change-by-hand':
      return 'Someone else changed it since. Make the change again by hand.';
    case 'change-by-hand-or-archive':
      return 'Someone else changed it since. Make the change again by hand, or check Archive for retained content.';
    case 'nothing-to-undo':
      return `It is already in that state, so there is nothing to ${direction} for this item.`;
    case 'nothing-to-restore':
      return 'It no longer exists. Use Archive if it still has a saved copy.';
    default: {
      const unknown: never = step;
      return String(unknown);
    }
  }
};

/** A conflict's subject as a person reads it: its current name and id. */
export const conflictSubject = (conflict: Pick<UndoConflict, 'entityType' | 'id' | 'title'>): string => {
  const name = conflict.title ?? (conflict.entityType === 'reflection' ? 'Untitled reflection' : conflict.entityType);
  return `${name} [${conflict.id}]`;
};

/** One line per entity and repair: the same section can conflict twice on one repair. */
export const conflictLines = (conflicts: readonly UndoConflict[], direction: OperationHistoryDirection): string[] => {
  const seen = new Set<string>();
  return conflicts.flatMap((conflict) => {
    const key = `${conflict.entityType}:${conflict.id}:${conflict.nextStep}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [`${conflictSubject(conflict)}: ${nextStepCopy(conflict.nextStep, direction)}`];
  });
};

/**
 * What a successful transition says. The label is the held entry's, so the sentence names the
 * step the person clicked. A removal Undo that could not return the section to its own place says
 * where it landed, because the header's changed label would not (the Slice 38 note).
 */
export const transitionResultFeedback = (
  direction: OperationHistoryDirection,
  label: string,
  result: UndoResult | RedoResult,
): HistoryFeedback => {
  const done = `${direction === 'undo' ? 'Undid' : 'Redid'}: ${label}.`;
  if (direction === 'undo' && result.operation === 'section.remove' && 'placement' in result) {
    const { placement } = result;
    if (!placement.pageEnabled) {
      return { tone: 'status', message: `${done} It is on a disabled page (${placement.pageId}); enable that page to see it.` };
    }
    if (result.outcome === 'partial' || placement.strategy === 'fallback-page') {
      return { tone: 'status', message: `${done} It landed on another available page (${placement.pageId}).` };
    }
  }
  return { tone: 'status', message: done };
};

/**
 * What a refused transition says. Every refusal carries the current summary, which the store adopts
 * before this sentence is shown, so "the controls now show…" is true when it is read.
 */
export const transitionRefusalFeedback = (
  direction: OperationHistoryDirection,
  label: string,
  refusal: OperationHistoryRefusalDetails,
): HistoryFeedback => {
  const verb = VERB[direction];
  switch (refusal.reason) {
    case 'history_revision_stale':
    case 'history_not_next':
      return { tone: 'status', message: 'This project’s history changed elsewhere. The controls now show the current step.' };
    case 'history_retired':
      return {
        tone: 'alert',
        message: `“${label}” can no longer be ${PAST[direction]} and was skipped. The controls now show the next step.`,
      };
    case 'history_expired':
      return { tone: 'status', message: `“${label}” expired at ${refusal.expiresAt}. The controls now show the current history.` };
    case 'history_blocked':
      return { tone: 'alert', message: `${verb} is blocked while ${refusal.blockingProjectTitle} is archived. Reactivate it, then try again.` };
    case 'history_conflict':
      return {
        tone: 'alert',
        message: `Could not ${direction} “${label}”: something it changed has changed since.`,
        lines: conflictLines(refusal.conflicts, direction),
      };
    case 'history_unavailable':
      return {
        tone: 'alert',
        message: refusal.problem === 'no-compatible-page'
          ? `No page can currently receive this section. Make a compatible page available and try ${verb} again; check Archive for retained content.`
          : `A shortcut on the fallback page prevents restoration there. Remove the shortcut and try ${verb} again; check Archive for retained content.`,
      };
    default: {
      const unknown: never = refusal;
      return { tone: 'alert', message: String(unknown) };
    }
  }
};

/** A 404: the history the controls cited is gone (a reset, a pruned history). */
export const historyGoneFeedback = (): HistoryFeedback => ({
  tone: 'status',
  message: 'That history is no longer available. The controls now show the current history.',
});

/** A transport failure or 5xx: the transition may have landed, so the store re-reads rather than guessing. */
export const transitionUncertainFeedback = (direction: OperationHistoryDirection): HistoryFeedback => ({
  tone: 'alert',
  message: `${VERB[direction]} may not have completed. The controls now show the current history; check the page before trying again.`,
});

/** A write that recorded into another project's history: the header here will not show it. */
export const crossOwnerFeedback = (label: string, projectId: ProjectId, projectName: string): HistoryFeedback => ({
  tone: 'status',
  message: `${label} was recorded in ${projectName}’s history.`,
  link: { projectId, label: `Open ${projectName}` },
});

/** The sentence a header archive leaves, on the page that stays (Slice 41). */
export const archivedHereFeedback = (projectName: string): HistoryFeedback => ({
  tone: 'status',
  message: `${projectName} is archived. Undo is available here.`,
});

/** Where the controls' read of the history stands. */
export type HistoryReadState = 'loading' | 'ready' | 'unavailable';

/** Everything a control's accessible name depends on. */
export interface HistoryControlInput {
  direction: OperationHistoryDirection;
  readState: HistoryReadState;
  entry: OperationHistoryEntry | null;
  /** The direction of the transition in flight, if any. */
  transitionPending: OperationHistoryDirection | null;
  /** A write, or the re-read it owes, has not settled. */
  writePending: boolean;
}

/** One control as the header renders it: its accessible name (also its `title`) and availability. */
export interface HistoryControlView {
  name: string;
  enabled: boolean;
}

/**
 * The accessible name and availability of one control, in precedence order: reading, unreadable,
 * this transition, another transition or a write, nothing there, a step-level blocker, the step.
 * A control is enabled only in the last case — never from the project-level `blockedBy`.
 */
export const historyControl = (input: HistoryControlInput): HistoryControlView => {
  const { direction, entry } = input;
  const verb = VERB[direction];
  const disabled = (name: string): HistoryControlView => ({ name, enabled: false });
  if (input.readState === 'loading') return disabled('Loading history…');
  if (input.readState === 'unavailable') return disabled('History unavailable');
  if (input.transitionPending === direction) return disabled(direction === 'undo' ? 'Undoing…' : 'Redoing…');
  if (input.transitionPending !== null || input.writePending) return disabled('Saving a change…');
  if (entry === null) return disabled(`Nothing to ${direction}`);
  if (entry.blockedBy !== null) return disabled(`${verb} unavailable while ${entry.blockedBy.title} is archived`);
  return { name: `${verb}: ${entry.label}`, enabled: true };
};
