import {
  OperationActionIdSchema,
  OperationActionSchema,
  OperationHistoryIdSchema,
  OperationHistorySchema,
  OperationReceiptSchema,
  type OperationAction,
  type OperationHistory,
  type OperationReceipt,
  type ProjectId,
  type ProjectSection,
  type UndoOperation,
} from '@cwm/contracts';
import type { OperationActionRepository, OperationHistoryRepository } from '@cwm/repositories';
import type { ActorContext } from './actor';
import type { Clock } from './clock';
import type { IdGenerator } from './ids';
import { pruneOperationHistory, recordOperationAction, type NewOperationAction } from './operation-history';

/** An action can be undone or redone for 24 hours after the write that recorded it. */
export const OPERATION_ACTION_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** What an undoable write hands the recorder; the history, order, actor and times are the recorder's. */
export interface OperationRecordEntry {
  /** The project that owns the subject, and so the history the action joins. */
  projectId: ProjectId;
  /** What the receipt and the summary call the operation, e.g. `Removed the Backlog section`. */
  label: string;
  operation: UndoOperation;
}

/**
 * **The one seam a mutation uses to become undoable.** Called from inside the mutation's own unit
 * of work, exactly as `ActivityService.record` is: it never opens a unit and asserts no grant — its
 * caller already did — so the action, the cursor move and the canonical writes commit or roll back
 * together, and the receipt is only real once the caller's unit resolves.
 *
 * Since Slice 36 three services record through it: `SectionService`, `TaskService` and
 * `ReflectionService`. The interface is unchanged by that — the recorder knows nothing about which
 * family an operation belongs to, which is why adding two of them cost it nothing.
 */
export interface OperationRecorder {
  record(actor: ActorContext, entry: OperationRecordEntry): Promise<OperationReceipt>;
  /**
   * The removal receipt a repeated `remove` may recover: the exact actor's newest action for this
   * section when it is a `section.remove` that is still applied, unexpired, and whose captured
   * generation is still the section's — so another actor's later removal is never mistaken for
   * this one. Read-only; it never prunes. `section` is `null` when a disposable removal deleted it,
   * which is why the lookup spans the actor's histories rather than one project's.
   */
  outstandingRemovalFor(actor: ActorContext, sectionId: string, section: ProjectSection | null): Promise<OperationReceipt | null>;
}

/** Two repositories, a clock and ids — never a unit of work, which the caller owns. */
export interface RepositoryOperationRecorderDependencies {
  histories: OperationHistoryRepository;
  actions: OperationActionRepository;
  clock: Clock;
  ids: IdGenerator;
}

/** Whether a history belongs to exactly this actor: the same user, the same agent connection, or the system. */
export const historyBelongsToActor = (history: OperationHistory, actor: ActorContext): boolean => {
  if (history.workspaceId !== actor.workspaceId || history.actor !== actor.actor) return false;
  if (actor.actor === 'user') return history.actorUserId === actor.userId;
  if (actor.actor === 'agent') return history.actorAgentConnectionId === actor.agentConnectionId;
  return true;
};

/**
 * The section an action's operation is about, or `undefined` for an operation about a row.
 *
 * Slice 35 could assume every action was a section's; Slice 36 cannot. This is deliberately not
 * `operationSubjectOf` — that answers "which entity", while this answers "is this action about *this
 * section*", and `outstandingRemovalFor` needs a row's action to answer "no" rather than to compare
 * a task id against a section id and happen to differ.
 */
export const subjectSectionOf = (operation: UndoOperation): string | undefined => {
  switch (operation.type) {
    case 'section.remove':
    case 'section.add':
      return operation.section.id;
    case 'section.move':
    case 'section.update':
      return operation.sectionId;
    default:
      return undefined;
  }
};

/** The receipt for one stored action, at the history's current revision. */
export const receiptFor = (history: OperationHistory, action: OperationAction): OperationReceipt =>
  OperationReceiptSchema.parse({
    historyId: history.id,
    actionId: action.id,
    operation: action.operation.type,
    revision: history.revision,
    label: action.label,
    createdAt: action.createdAt,
    expiresAt: action.expiresAt,
  });

/**
 * Records into the acting actor's own history for the subject's project, creating it on first use
 * (docs/decisions/2026-09-operation-history-scope.md): an agent's writes never enter a person's
 * stack, and a descendant project's write enters the descendant's history.
 */
export class RepositoryOperationRecorder implements OperationRecorder {
  constructor(private readonly dependencies: RepositoryOperationRecorderDependencies) {}

  /** Finds the exact actor's history for a project, or `undefined` before their first write there. */
  static async historyFor(
    histories: OperationHistoryRepository,
    actor: ActorContext,
    projectId: ProjectId,
  ): Promise<OperationHistory | undefined> {
    return (await histories.list({ workspaceId: actor.workspaceId, projectId })).find((history) => historyBelongsToActor(history, actor));
  }

  async record(actor: ActorContext, entry: OperationRecordEntry): Promise<OperationReceipt> {
    const { histories, actions, clock, ids } = this.dependencies;
    let history = await RepositoryOperationRecorder.historyFor(histories, actor, entry.projectId);
    const isNew = history === undefined;
    history ??= OperationHistorySchema.parse({
      id: OperationHistoryIdSchema.parse(ids.next('history')),
      workspaceId: actor.workspaceId,
      projectId: entry.projectId,
      actor: actor.actor,
      // Omitted rather than `undefined`, so the history in memory is the history written to disk.
      ...(actor.actor === 'user' ? { actorUserId: actor.userId } : {}),
      ...(actor.actor === 'agent' ? { actorAgentConnectionId: actor.agentConnectionId } : {}),
      cursor: 0,
      orderHighWaterMark: 0,
      revision: 0,
    });

    const now = clock.now();
    const expires = clock.now();
    expires.setTime(now.getTime() + OPERATION_ACTION_LIFETIME_MS);
    const pending: NewOperationAction = {
      id: OperationActionIdSchema.parse(ids.next('operation')),
      historyId: history.id,
      label: entry.label,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      operation: entry.operation,
    };

    const existing = isNew ? [] : await actions.list({ historyId: history.id });
    // Record first — which discards the redo branch — then prune, so the cap counts the new action
    // and the 51st write in a history is the one that drops the oldest.
    const recorded = pruneOperationHistory(recordOperationAction({ history, actions: existing }, pending), now.getTime());
    const kept = new Set(recorded.actions.map((action) => action.id));
    for (const action of existing) if (!kept.has(action.id)) await actions.remove(action.id);

    const action = recorded.actions.find((candidate) => candidate.id === pending.id);
    if (action === undefined) throw new TypeError('a newly recorded action must survive its own pruning');
    await actions.insert(OperationActionSchema.parse(action));
    if (isNew) await histories.insert(recorded.history);
    else await histories.update(recorded.history);
    return receiptFor(recorded.history, action);
  }

  async outstandingRemovalFor(
    actor: ActorContext,
    sectionId: string,
    section: ProjectSection | null,
  ): Promise<OperationReceipt | null> {
    const { histories, actions, clock } = this.dependencies;
    const history = (await histories.list({ workspaceId: actor.workspaceId, ...(section === null ? {} : { projectId: section.projectId }) }))
      .filter((candidate) => historyBelongsToActor(candidate, actor));
    let owner: OperationHistory | undefined;
    let latest: OperationAction | undefined;
    for (const candidate of history) {
      for (const action of await actions.list({ historyId: candidate.id })) {
        if (subjectSectionOf(action.operation) !== sectionId) continue;
        // A section's writes all record into its project's one history, so orders compare.
        if (latest === undefined || action.order > latest.order) {
          latest = action;
          owner = candidate;
        }
      }
    }
    if (
      owner === undefined ||
      latest === undefined ||
      latest.operation.type !== 'section.remove' ||
      latest.state !== 'applied' ||
      clock.now().getTime() >= Date.parse(latest.expiresAt)
    ) {
      return null;
    }
    // A retained section must still carry this removal's generation: a later removal by anyone
    // makes this receipt the wrong answer to "which removal already committed?".
    if (section !== null && section.archiveGeneration !== latest.operation.archiveGeneration) return null;
    if (section === null && latest.operation.disposition !== 'deleted') return null;
    return receiptFor(owner, latest);
  }
}
