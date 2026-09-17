import {
  OperationHistorySummarySchema,
  OperationHistoryTransitionResultSchema,
  nameOf,
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
import { reapplySectionAdd, reapplySectionMove, reapplySectionUpdate, revertSectionAdd, revertSectionMove, revertSectionUpdate } from './section-edit-undo';
import { reapplySectionRemoval, revertSectionRemoval } from './section-removal-undo';

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
 * one direction under the write grant of the action's family — `projects.write` for every Stage A
 * family — in one unit of work with the executor's writes, the cursor move and the activity event,
 * so a live frame is published only after all of it commits.
 *
 * Composes only `ActivityService` — the ordinary writing-service edge — and repository interfaces.
 * It depends on no section, task or reflection service and never calls a public method that opens
 * a unit: executors live in shared function modules, so the service graph stays acyclic and a
 * transition can never record the inverse of its own inverse.
 *
 * This is not Archive Restore, which stays durable, receipt-free and outside every history.
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
   * before anything is written: the history exists and is the caller's (not found otherwise), the
   * revision is current (`history_revision_stale`), the action is the next step
   * (`history_not_next`), it has not expired (`history_expired`), no ancestor is archived
   * (`history_blocked`), and the executor's applied-state checks pass (`history_conflict`,
   * `history_unavailable`). An executor conflict that can never be repaired instead commits a
   * retirement and then refuses `history_retired` — the one refusal that moves the cursor.
   */
  async transition(
    actor: ActorContext,
    historyId: OperationHistoryId,
    input: OperationHistoryTransitionInput,
  ): Promise<OperationHistoryTransitionResult> {
    assertValidActor(actor);
    // Before any read, so a connection without the grant learns nothing about the history.
    assertPermitted(actor, 'projects.write');

    const outcome = await this.dependencies.unitOfWork.run(async (): Promise<TransitionOutcome> => {
      const history = await this.dependencies.histories.find(historyId);
      // One not-found for absent and someone else's: anything else would confirm the id.
      if (history === null || !historyBelongsToActor(history, actor)) throw new EntityNotFoundError('operationHistory', historyId);
      const state: OperationHistoryState = { history, actions: await this.dependencies.actions.list({ historyId }) };
      const refusal = async (details: Record<string, unknown>) => ({
        historyId, actionId: input.actionId, summary: await this.summaryOf(state), ...details,
      }) as OperationHistoryRefusalDetails;

      if (input.expectedRevision !== history.revision) {
        throw historyRefusal(
          await refusal({ reason: 'history_revision_stale' }),
          `this history is at revision ${history.revision}, not ${input.expectedRevision}; read the summary and try again`,
        );
      }
      const action = nextOperationAction(state, input.direction);
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
      await this.dependencies.activity.record(actor, {
        action: activityActionFor(action.operation.type, input.direction),
        entityType: 'project',
        entityId: history.projectId,
        projectId: history.projectId,
        summary: activitySummary(action.operation, result, input.direction),
      });
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

/** The activity verb for one operation in one direction, so a feed row and a live frame say which ran. */
export const activityActionFor = (operation: UndoOperation['type'], direction: OperationHistoryDirection): string => {
  const noun = { 'section.remove': 'removal', 'section.add': 'addition', 'section.move': 'move', 'section.update': 'update' }[operation];
  return `project.section_${noun}_${direction === 'undo' ? 'undone' : 'redone'}`;
};

/** The feed line, e.g. `Undid removing the Kickoff section`, named from the section as it now is. */
const activitySummary = (operation: UndoOperation, result: UndoResult | RedoResult, direction: OperationHistoryDirection): string => {
  const verb = { 'section.remove': 'removing', 'section.add': 'adding', 'section.move': 'moving', 'section.update': 'updating' }[operation.type];
  const section = 'section' in result ? result.section : operation.type === 'section.add' ? operation.section : undefined;
  return `${direction === 'undo' ? 'Undid' : 'Redid'} ${verb} the ${section === undefined ? 'section' : nameOf(section)} section`;
};
