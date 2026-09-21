import {
  OPERATION_FAMILY_PERMISSION,
  OperationHistorySummarySchema,
  OperationHistoryTransitionResultSchema,
  familyOfOperationKind,
  nameOf,
  operationSubjectOf,
  type OperationAction,
  type OperationHistoryDirection,
  type OperationHistoryId,
  type OperationHistoryRefusalDetails,
  type OperationHistorySummary,
  type OperationHistoryTransitionInput,
  type OperationHistoryTransitionResult,
  type ProjectId,
  type RedoResult,
  type UndoOperation,
  type UndoResult,
} from '@cwm/contracts';
import type {
  OperationActionRepository,
  OperationHistoryRepository,
  ProjectPageRepository,
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  SectionShortcutRepository,
  TaskRepository,
  UnitOfWork,
} from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { EntityNotFoundError, historyRefusal } from './errors';
import { OperationExecutionRefused } from './operation-execution';
import {
  nextOperationAction,
  retireOperationAction,
  transitionOperationHistory,
  type OperationHistoryState,
} from './operation-history';
import { RepositoryOperationRecorder, historyBelongsToActor } from './operation-recorder';
import { findHighestWriteBlocker } from './project-visibility';
import {
  reapplyReflectionAdd,
  reapplyReflectionArchive,
  reapplyReflectionRestore,
  reapplyReflectionUpdate,
  revertReflectionAdd,
  revertReflectionArchive,
  revertReflectionRestore,
  revertReflectionUpdate,
} from './reflection-history';
import { reapplySectionAdd, reapplySectionMove, reapplySectionUpdate, revertSectionAdd, revertSectionMove, revertSectionUpdate } from './section-edit-undo';
import { reapplySectionRemoval, revertSectionRemoval } from './section-removal-undo';
import { reapplySectionRestore, revertSectionRestore } from './section-restore-history';
import {
  reapplyShortcutAdd,
  reapplyShortcutMove,
  reapplyShortcutRemove,
  reapplyShortcutUpdate,
  revertShortcutAdd,
  revertShortcutMove,
  revertShortcutRemove,
  revertShortcutUpdate,
} from './shortcut-history';
import {
  reapplyTaskAdd,
  reapplyTaskArchive,
  reapplyTaskRestore,
  reapplyTaskUpdate,
  revertTaskAdd,
  revertTaskArchive,
  revertTaskRestore,
  revertTaskUpdate,
} from './task-history';

/** Repository interfaces, `ActivityService` and a clock — deliberately no section, task or reflection service. */
export interface OperationHistoryServiceDependencies {
  histories: OperationHistoryRepository;
  actions: OperationActionRepository;
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
  pages: ProjectPageRepository;
  projects: ProjectRepository;
  tasks: TaskRepository;
  reflections: ReflectionRepository;
  activity: ActivityService;
  clock: Clock;
  unitOfWork: UnitOfWork;
}

/** What a transition did inside its unit: executed, or retired and must refuse once committed. */
type TransitionOutcome =
  | { kind: 'executed'; result: OperationHistoryTransitionResult }
  | { kind: 'retired'; details: OperationHistoryRefusalDetails; sentence: string };

/**
 * **One actor's Undo and Redo, per project** (§31; docs/decisions/2026-09-operation-history-scope.md).
 *
 * `summary` reads the caller's cursor under `projects.read`; `transition` runs the next action in
 * one direction under the write grant of the **stored** action's family — `projects.write` for a
 * section, `tasks.write` for a task, `reflections.write` for a reflection
 * (docs/decisions/2026-09-operation-family-permissions.md) — in one unit of work with the executor's
 * writes, the cursor move and the activity event, so a live frame is published only after all of it
 * commits.
 *
 * Composes only `ActivityService` — the ordinary writing-service edge — and repository interfaces.
 * It depends on no section, task or reflection service and never calls a public method that opens
 * a unit: executors live in shared function modules, so the service graph stays acyclic and a
 * transition can never record the inverse of its own inverse.
 *
 * **Archive Restore** — of a section since Slice 37, of a row since Slice 36 — records an action
 * of its own while staying durable: available after every action has expired, needing no receipt to
 * invoke, and clearing its own Redo branch like any other write
 * (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md,
 * docs/decisions/2026-09-section-restore-and-shortcut-history.md). Undoing a recorded Restore
 * re-archives exactly what it revived; it is not the removal beneath it, which stays a separate
 * step in the same stack.
 */
export class OperationHistoryService {
  constructor(private readonly dependencies: OperationHistoryServiceDependencies) {}

  /**
   * The caller's own history for `projectId`: the next action in each direction and the revision a
   * transition must cite. An unknown or invisible project is not found; a visible project with no
   * recorded write yet answers an empty summary with a `null` history id.
   */
  async summary(actor: ActorContext, projectId: ProjectId): Promise<OperationHistorySummary> {
    assertValidActor(actor);
    assertPermitted(actor, 'projects.read');
    const project = await this.dependencies.projects.find(projectId);
    if (project === null || project.workspaceId !== actor.workspaceId) throw new EntityNotFoundError('project', projectId);
    const history = await RepositoryOperationRecorder.historyFor(this.dependencies.histories, actor, projectId);
    if (history === undefined) {
      return OperationHistorySummarySchema.parse({
        projectId, historyId: null, revision: 0, undo: null, redo: null, blockedBy: await this.blockedBy(projectId),
      });
    }
    return this.summaryOf({ history, actions: await this.dependencies.actions.list({ historyId: history.id }) });
  }

  /**
   * Runs the action `input.actionId` in `input.direction`, or refuses. Checked in this order, each
   * before anything is written: the history exists and is the caller's (not found otherwise — a
   * foreign history and an absent one are one answer, because anything else would confirm the id);
   * the caller holds the write grant of the **stored** next action's family (forbidden otherwise);
   * then the revision is current (`history_revision_stale`), the named action is that next step
   * (`history_not_next`), it has not expired (`history_expired`), no ancestor is archived
   * (`history_blocked`), and the executor's applied-state checks pass (`history_conflict`,
   * `history_unavailable`). An executor conflict that can never be repaired instead commits a
   * retirement and then refuses `history_retired` — the one refusal that moves the cursor.
   *
   * The grant sits **before** every reason a caller could learn something from: a connection that
   * may not write tasks is told it is forbidden and nothing else — not the revision, not the label
   * of the next action, not which rows conflict. And the family comes from the stored stack, never
   * from the request, so no input can buy a grant the connection does not hold, and a mixed history
   * never lets an unauthorized top action be stepped over.
   */
  async transition(
    actor: ActorContext,
    historyId: OperationHistoryId,
    input: OperationHistoryTransitionInput,
  ): Promise<OperationHistoryTransitionResult> {
    assertValidActor(actor);

    const outcome = await this.dependencies.unitOfWork.run(async (): Promise<TransitionOutcome> => {
      const history = await this.dependencies.histories.find(historyId);
      // One not-found for absent and someone else's: anything else would confirm the id.
      if (history === null || !historyBelongsToActor(history, actor)) throw new EntityNotFoundError('operationHistory', historyId);
      const state: OperationHistoryState = { history, actions: await this.dependencies.actions.list({ historyId }) };
      const refusal = async (details: Record<string, unknown>) => ({
        historyId, actionId: input.actionId, summary: await this.summaryOf(state), ...details,
      }) as OperationHistoryRefusalDetails;

      // **The family grant, read from the stored stack and asserted before any detail.**
      //
      // It is the grant of the action this transition would actually run — the next one in this
      // direction — not of the id the caller sent, so no input can buy a grant the connection does
      // not hold. It comes first because every refusal below discloses something: the revision, the
      // next action's id and label, which rows conflict. When the stack is empty in this direction
      // there is nothing to disclose and nothing to authorize, so `history_not_next` answers
      // "nothing to undo" without a grant — which is also what keeps a pruned or unknown action id
      // answering that same repairable refusal rather than a not-found.
      const action = nextOperationAction(state, input.direction);
      if (action !== null) {
        assertPermitted(actor, OPERATION_FAMILY_PERMISSION[familyOfOperationKind(action.operation.type)]);
      }

      if (input.expectedRevision !== history.revision) {
        throw historyRefusal(
          await refusal({ reason: 'history_revision_stale' }),
          `this history is at revision ${history.revision}, not ${input.expectedRevision}; read the summary and try again`,
        );
      }
      if (action === null || action.id !== input.actionId) {
        throw historyRefusal(
          await refusal({ reason: 'history_not_next' }),
          action === null
            ? `there is nothing to ${input.direction} in this history`
            : `"${input.actionId}" is not the next ${input.direction} step; the next is "${action.id}" (${action.label})`,
        );
      }
      if (this.dependencies.clock.now().getTime() >= Date.parse(action.expiresAt)) {
        throw historyRefusal(
          await refusal({ reason: 'history_expired', expiresAt: action.expiresAt }),
          action.operation.type === 'section.remove' && input.direction === 'undo'
            ? `this removal expired at ${action.expiresAt}; Archive can still restore the section`
            : `this action expired at ${action.expiresAt}; make the change again by hand instead`,
        );
      }
      const blocker = await findHighestWriteBlocker(this.dependencies.projects, history.projectId);
      if (blocker !== undefined) {
        const title = (await this.dependencies.projects.find(blocker))?.name ?? blocker;
        throw historyRefusal(
          await refusal({ reason: 'history_blocked', blockingProjectId: blocker, blockingProjectTitle: title }),
          `project "${title}" [${blocker}] is archived; reactivate it before ${input.direction === 'undo' ? 'undoing' : 'redoing'} this operation`,
        );
      }

      let result: UndoResult | RedoResult;
      const recordsBeforeRemoval = input.direction === 'undo' &&
        (action.operation.type === 'task.add' || action.operation.type === 'reflection.add');
      // Undo Add removes the canonical row, so Activity must capture its durable identity while
      // the target still exists. The surrounding unit rolls this event/frame back if execution or
      // either history write fails; successful publication still happens only after commit.
      if (recordsBeforeRemoval) {
        await this.dependencies.activity.record(
          actor,
          activityEntryFor(action.operation, input.direction, undefined),
        );
      }
      try {
        result = await this.execute(action.operation, input.direction);
      } catch (error) {
        if (!(error instanceof OperationExecutionRefused)) throw error;
        const { problem } = error;
        if (problem.kind === 'unavailable') {
          throw historyRefusal(await refusal({ reason: 'history_unavailable', problem: problem.problem }), error.message);
        }
        if (!problem.permanent) {
          throw historyRefusal(await refusal({ reason: 'history_conflict', conflicts: problem.conflicts }), error.message);
        }
        // Nothing executed. Commit exactly the retirement, then refuse outside the unit so the
        // caller's next call — against the refreshed summary — reaches the action below.
        const retired = retireOperationAction(state, action.id);
        await this.dependencies.actions.update(retired.actions.find((candidate) => candidate.id === action.id)!);
        await this.dependencies.histories.update(retired.history);
        return {
          kind: 'retired',
          details: {
            reason: 'history_retired', historyId, actionId: action.id,
            summary: await this.summaryOf(retired), conflicts: problem.conflicts,
          },
          sentence: `${error.message}; this action can never ${input.direction} again and was retired, so the next step is now reachable`,
        };
      }

      const moved = transitionOperationHistory(state, input.direction);
      if (moved.action === null) throw new TypeError('the selected action vanished inside its own transition');
      await this.dependencies.actions.update(moved.action);
      await this.dependencies.histories.update(moved.state.history);
      if (!recordsBeforeRemoval) {
        await this.dependencies.activity.record(
          actor,
          activityEntryFor(action.operation, input.direction, result),
        );
      }
      return {
        kind: 'executed',
        result: OperationHistoryTransitionResultSchema.parse({
          direction: input.direction, actionId: action.id, result, summary: await this.summaryOf(moved.state),
        }),
      };
    });

    if (outcome.kind === 'retired') throw historyRefusal(outcome.details, outcome.sentence);
    return outcome.result;
  }

  /** Per-type, per-direction dispatch. A `switch` with an exhaustive default, not a registry. */
  private execute(operation: UndoOperation, direction: OperationHistoryDirection): Promise<UndoResult | RedoResult> {
    const { clock } = this.dependencies;
    const repositories = this.dependencies;
    switch (operation.type) {
      case 'section.remove':
        return direction === 'undo' ? revertSectionRemoval(repositories, clock, operation) : reapplySectionRemoval(repositories, clock, operation);
      case 'section.add':
        return direction === 'undo' ? revertSectionAdd(repositories, clock, operation) : reapplySectionAdd(repositories, clock, operation);
      case 'section.move':
        return direction === 'undo' ? revertSectionMove(repositories, clock, operation) : reapplySectionMove(repositories, clock, operation);
      case 'section.update':
        return direction === 'undo' ? revertSectionUpdate(repositories, clock, operation) : reapplySectionUpdate(repositories, clock, operation);
      case 'task.add':
        return direction === 'undo' ? revertTaskAdd(repositories, clock, operation) : reapplyTaskAdd(repositories, clock, operation);
      case 'task.update':
        return direction === 'undo' ? revertTaskUpdate(repositories, clock, operation) : reapplyTaskUpdate(repositories, clock, operation);
      case 'task.archive':
        return direction === 'undo' ? revertTaskArchive(repositories, clock, operation) : reapplyTaskArchive(repositories, clock, operation);
      case 'task.restore':
        return direction === 'undo' ? revertTaskRestore(repositories, clock, operation) : reapplyTaskRestore(repositories, clock, operation);
      case 'reflection.add':
        return direction === 'undo' ? revertReflectionAdd(repositories, clock, operation) : reapplyReflectionAdd(repositories, clock, operation);
      case 'reflection.update':
        return direction === 'undo' ? revertReflectionUpdate(repositories, clock, operation) : reapplyReflectionUpdate(repositories, clock, operation);
      case 'reflection.archive':
        return direction === 'undo' ? revertReflectionArchive(repositories, clock, operation) : reapplyReflectionArchive(repositories, clock, operation);
      case 'reflection.restore':
        return direction === 'undo' ? revertReflectionRestore(repositories, clock, operation) : reapplyReflectionRestore(repositories, clock, operation);
      case 'section.restore':
        return direction === 'undo' ? revertSectionRestore(repositories, clock, operation) : reapplySectionRestore(repositories, clock, operation);
      case 'shortcut.add':
        return direction === 'undo' ? revertShortcutAdd(repositories, clock, operation) : reapplyShortcutAdd(repositories, clock, operation);
      case 'shortcut.update':
        return direction === 'undo' ? revertShortcutUpdate(repositories, clock, operation) : reapplyShortcutUpdate(repositories, clock, operation);
      case 'shortcut.move':
        return direction === 'undo' ? revertShortcutMove(repositories, clock, operation) : reapplyShortcutMove(repositories, clock, operation);
      case 'shortcut.remove':
        return direction === 'undo' ? revertShortcutRemove(repositories, clock, operation) : reapplyShortcutRemove(repositories, clock, operation);
      default: {
        const unknown: never = operation;
        throw new TypeError(`no history executor for "${String(unknown)}"`);
      }
    }
  }

  /** The snapshot-free projection of one history. An expired next action is not offered. */
  private async summaryOf(state: OperationHistoryState): Promise<OperationHistorySummary> {
    const now = this.dependencies.clock.now().getTime();
    const entry = (action: OperationAction | null) =>
      action === null || now >= Date.parse(action.expiresAt)
        ? null
        : { actionId: action.id, operation: action.operation.type, label: action.label, expiresAt: action.expiresAt };
    return OperationHistorySummarySchema.parse({
      projectId: state.history.projectId,
      historyId: state.history.id,
      revision: state.history.revision,
      undo: entry(nextOperationAction(state, 'undo')),
      redo: entry(nextOperationAction(state, 'redo')),
      blockedBy: await this.blockedBy(state.history.projectId),
    });
  }

  /** The one pre-validation the summary does: the archived ancestor that blocks every transition. */
  private async blockedBy(projectId: ProjectId): Promise<OperationHistorySummary['blockedBy']> {
    const blocker = await findHighestWriteBlocker(this.dependencies.projects, projectId);
    if (blocker === undefined) return null;
    return { projectId: blocker, title: (await this.dependencies.projects.find(blocker))?.name ?? blocker };
  }
}

/**
 * The activity verb for one operation in one direction, so a feed row and a live frame say which ran.
 *
 * Section transitions keep the project target chosen for section events
 * (docs/decisions/2026-08-section-activity-targets-the-project.md). Row transitions target their
 * task or reflection and retain that family's prefix, so the same projections refresh for an
 * ordinary write and its reversal/replay. Compound Add frames also cause the project canvas to
 * re-read section existence.
 */
export const activityActionFor = (operation: UndoOperation['type'], direction: OperationHistoryDirection): string => {
  const noun = {
    'section.remove': 'section_removal',
    'section.add': 'section_addition',
    'section.move': 'section_move',
    'section.update': 'section_update',
    'task.add': 'task_addition',
    'task.update': 'task_update',
    'task.archive': 'task_archive',
    'task.restore': 'task_restore',
    'reflection.add': 'reflection_addition',
    'reflection.update': 'reflection_update',
    'reflection.archive': 'reflection_archive',
    'reflection.restore': 'reflection_restore',
    'section.restore': 'section_restoration',
    'shortcut.add': 'shortcut_addition',
    'shortcut.update': 'shortcut_update',
    'shortcut.move': 'shortcut_move',
    'shortcut.remove': 'shortcut_removal',
  }[operation];
  const family = familyOfOperationKind(operation);
  // A shortcut event targets the destination **project**, exactly as the ordinary
  // `project.shortcut_added` does, so no Activity target exception is needed for the new verbs.
  const prefix = family === 'section' || family === 'shortcut' ? 'project' : family;
  return `${prefix}.${noun}_${direction === 'undo' ? 'undone' : 'redone'}`;
};

/** The canonical target an Activity row and its live frame describe. */
const activityTargetFor = (operation: UndoOperation): {
  entityType: 'project' | 'task' | 'reflection';
  entityId: string;
  projectId: ProjectId;
} => {
  switch (operation.type) {
    case 'section.remove':
    case 'section.add':
      return { entityType: 'project', entityId: operation.section.projectId, projectId: operation.section.projectId };
    case 'section.move':
    case 'section.update':
    case 'section.restore':
    // A placement's event names the destination project, never the source sub-project: the
    // change is to that root's Home canvas, and the source was not written at all.
    case 'shortcut.add':
    case 'shortcut.update':
    case 'shortcut.move':
    case 'shortcut.remove':
      return { entityType: 'project', entityId: operation.projectId, projectId: operation.projectId };
    case 'task.add':
      return { entityType: 'task', entityId: operation.task.id, projectId: operation.task.projectId };
    case 'task.update':
    case 'task.archive':
    case 'task.restore':
      return { entityType: 'task', entityId: operation.taskId, projectId: operation.projectId };
    case 'reflection.add':
      return { entityType: 'reflection', entityId: operation.reflection.id, projectId: operation.reflection.projectId };
    case 'reflection.update':
    case 'reflection.archive':
    case 'reflection.restore':
      return { entityType: 'reflection', entityId: operation.reflectionId, projectId: operation.projectId };
  }
};

/** Build the event after execution, except for Undo Add where `result` is deliberately absent. */
const activityEntryFor = (
  operation: UndoOperation,
  direction: OperationHistoryDirection,
  result: UndoResult | RedoResult | undefined,
) => ({
  action: activityActionFor(operation.type, direction),
  ...activityTargetFor(operation),
  summary: result === undefined
    ? activitySummaryForRemovedAdd(operation)
    : activitySummary(operation, result, direction),
});

/** Undo Add is the only transition that must compose its line before execution deletes the row. */
const activitySummaryForRemovedAdd = (operation: UndoOperation): string => {
  if (operation.type === 'task.add') return `Undid creating "${operation.task.title}"`;
  if (operation.type === 'reflection.add') {
    const title = operation.reflection.title?.trim();
    return `Undid writing ${title === undefined || title.length === 0 ? 'a reflection' : `"${title}"`}`;
  }
  throw new TypeError(`cannot record ${operation.type} before removing its target`);
};

/** What the operation did, in the gerund a feed line reads with. */
const OPERATION_GERUND: Record<UndoOperation['type'], string> = {
  'section.remove': 'removing the',
  'section.add': 'adding the',
  'section.move': 'moving the',
  'section.update': 'updating the',
  'task.add': 'creating',
  'task.update': 'updating',
  'task.archive': 'archiving',
  'task.restore': 'restoring',
  'reflection.add': 'writing',
  'reflection.update': 'editing',
  'reflection.archive': 'archiving',
  'reflection.restore': 'restoring',
  'section.restore': 'restoring the',
  'shortcut.add': 'adding a shortcut to',
  'shortcut.update': 'updating a shortcut on',
  'shortcut.move': 'moving a shortcut on',
  'shortcut.remove': 'removing a shortcut from',
};

/**
 * The feed line, e.g. `Undid removing the Kickoff section` or `Redid completing "Ship the beta"`,
 * named from the entity as it now is and from the captured snapshot when the entity is gone.
 */
const activitySummary = (operation: UndoOperation, result: UndoResult | RedoResult, direction: OperationHistoryDirection): string => {
  const did = direction === 'undo' ? 'Undid' : 'Redid';
  const gerund = OPERATION_GERUND[operation.type];
  // A shortcut is named by the canvas it sits on: the placement has no title of its own, and the
  // source section's title is content this result deliberately does not carry.
  if (operation.type.startsWith('shortcut.')) return `${did} ${gerund} this canvas`;
  if (operation.type.startsWith('section.')) {
    const section = 'section' in result ? result.section : operation.type === 'section.add' ? operation.section : undefined;
    return `${did} ${gerund} ${section === undefined ? 'section' : nameOf(section)} section`;
  }
  if (operation.type === 'task.update' && operation.completion) {
    return `${did} completing "${'task' in result ? result.task.title : operationSubjectOf(operation)}"`;
  }
  if ('task' in result) return `${did} ${gerund} "${result.task.title}"`;
  if ('reflection' in result) {
    const title = result.reflection.title?.trim();
    return `${did} ${gerund} ${title === undefined || title.length === 0 ? 'a reflection' : `"${title}"`}`;
  }
  // An Undo of a creation has no live entity to name, so the captured one names it.
  if (operation.type === 'task.add') return `${did} ${gerund} "${operation.task.title}"`;
  if (operation.type === 'reflection.add') {
    const title = operation.reflection.title?.trim();
    return `${did} ${gerund} ${title === undefined || title.length === 0 ? 'a reflection' : `"${title}"`}`;
  }
  return `${did} ${gerund} ${operationSubjectOf(operation)}`;
};
