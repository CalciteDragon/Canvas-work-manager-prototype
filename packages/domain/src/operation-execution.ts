import type { OperationHistoryDirection, UndoConflict } from '@cwm/contracts';
import type {
  OperationActionRepository,
  ProjectPageRepository,
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  SectionShortcutRepository,
  TaskRepository,
} from '@cwm/repositories';

/**
 * The seam between `OperationHistoryService` and the per-family executors in
 * `section-edit-undo.ts` and `section-removal-undo.ts`.
 *
 * Executors are shared functions, not services: they take repository interfaces and a clock,
 * run **inside the caller's unit of work**, open no unit, assert no grant and record no activity.
 * Every refusal is thrown before the first write, so a refused transition writes nothing.
 */

/** The repositories every section executor reads and writes. */
export interface SectionHistoryRepositories {
  /** Read only, for `generationFloor`: an executor never writes an action. */
  actions: OperationActionRepository;
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
  pages: ProjectPageRepository;
  projects: ProjectRepository;
  tasks: TaskRepository;
  reflections: ReflectionRepository;
}

/** Why an executor would not run, before the service turns it into a history refusal. */
export type OperationExecutionProblem =
  | {
      kind: 'conflict';
      conflicts: UndoConflict[];
      /**
       * The recorded state can never come back, so the action retires instead of blocking
       * (docs/decisions/2026-09-operation-history-retired-actions.md). Decided per conflict by the
       * executor that found it, from a fixed list — never inferred from the message.
       */
      permanent: boolean;
    }
  | { kind: 'unavailable'; problem: 'no-compatible-page' | 'shortcut-on-fallback-page' };

/** Thrown by an executor, caught only by `OperationHistoryService`. */
export class OperationExecutionRefused extends Error {
  constructor(
    readonly problem: OperationExecutionProblem,
    sentence: string,
  ) {
    super(sentence);
    this.name = 'OperationExecutionRefused';
  }
}

/** "Undo" or "Redo", for refusal sentences. */
export const directionWord = (direction: OperationHistoryDirection): string => (direction === 'undo' ? 'Undo' : 'Redo');

/**
 * Throws a conflict refusal when there is anything to report. `permanentProblems` names the
 * conflicts on `subjectId` that make this action unsatisfiable for good.
 */
export const refuseOnConflicts = (
  conflicts: readonly UndoConflict[],
  sentence: (shown: string) => string,
  permanent: (conflict: UndoConflict) => boolean,
): void => {
  if (conflicts.length === 0) return;
  const shown = conflicts
    .slice(0, 5)
    .map((conflict) => {
      const title = conflict.title === undefined ? '' : ` "${conflict.title}"`;
      return `${conflict.problem}: ${conflict.entityType}${title} [${conflict.id}]`;
    })
    .join('; ');
  const more = conflicts.length > 5 ? `; and ${conflicts.length - 5} more` : '';
  throw new OperationExecutionRefused(
    { kind: 'conflict', conflicts: [...conflicts], permanent: conflicts.some(permanent) },
    sentence(`${shown}${more}`),
  );
};

/**
 * The `archiveGeneration` a **recreated** section must carry: the higher of its snapshot's and
 * the highest generation any stored action captured for it. Undoing an add, or redoing a disposable
 * removal, deletes the row that held the generation; recreating it from an older snapshot would
 * move the generation backwards past an action some history still holds, and that action's Undo
 * or Redo would then misjudge which removal it is looking at.
 *
 * Two kinds of action carry that evidence, and both count. A `section.remove` records the
 * generation it *wrote*; a `section.restore` records the generation the section *had*, which
 * Restore leaves alone. They matter separately because retention prunes per history: another
 * actor's removal can be pruned while their later Restore survives, and the Restore is then the
 * only record that the section ever reached that generation.
 */
export const generationFloor = async (
  repositories: SectionHistoryRepositories,
  sectionId: string,
  snapshotGeneration: number,
): Promise<number> =>
  (await repositories.actions.list()).reduce((highest, action) => {
    const { operation } = action;
    if (operation.type === 'section.remove' && operation.section.id === sectionId) {
      return Math.max(highest, operation.archiveGeneration);
    }
    if (operation.type === 'section.restore' && operation.sectionId === sectionId) {
      return Math.max(highest, operation.archiveGeneration);
    }
    return highest;
  }, snapshotGeneration);

/** One placement reference compared with a live neighbour. */
export const isPlacementOf = (
  placement: { kind: 'section' | 'shortcut'; value: { id: string } } | undefined,
  ref: { kind: string; id: string },
): boolean => placement !== undefined && placement.kind === ref.kind && placement.value.id === ref.id;
