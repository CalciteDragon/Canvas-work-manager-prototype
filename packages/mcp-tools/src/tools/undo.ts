import { OperationHistoryStepInputSchema, OperationHistorySummaryInputSchema } from '@cwm/contracts';
import { defineTool, type WorkManagerTool } from '../tool';

const REFUSALS =
  'Refusals start with a reason token: "history_not_next:" (that action is not the next step — read get_operation_history), ' +
  '"history_revision_stale:" (the history moved on; a retried call whose first attempt landed also refuses here), ' +
  '"history_expired:" (older than 24 hours), "history_blocked:" (the project or an ancestor is archived; reactivate it first), ' +
  '"history_conflict:" (a later change to the same entity, its rows or its dependents; nothing was written), ' +
  '"history_unavailable:" (no page to return the section to) or ' +
  '"history_retired:" (the action can never succeed again and was retired, so the next call can reach the one below it). ' +
  'An unknown history or one belonging to another connection is not found.';

/**
 * Per-connection operation history (docs/decisions/2026-09-operation-history-scope.md).
 *
 * The read needs `projects.read`. The two transitions need the write grant of the **stored**
 * action's family — `projects.write` for a section, `tasks.write` for a task,
 * `reflections.write` for a reflection — so they declare `permissionsByFamily` rather than a
 * single grant, and `tools/list` publishes the namespaced map instead of a singular or conjunctive
 * key that would be false (docs/decisions/2026-09-operation-family-permissions.md).
 *
 * A write-only connection is not shut out by `get_operation_history` needing `projects.read`: every
 * transition result **and** every refusal carries the refreshed summary, so an agent holding only
 * `tasks.write` starts from its create receipt and chains from the summary each transition hands
 * back. That is the deliberate write-only workflow, not a gap.
 *
 * MCP clients receive a refusal's message only, so each message starts with its reason token.
 */
export const undoTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'get_operation_history',
    description:
      'Read this connection’s own Undo/Redo history for a project: { projectId, historyId, revision, undo, redo, blockedBy }. undo and redo name the next action in each direction — { actionId, operation, label, expiresAt } — or null at either end of the stack. operation is one of section.add, section.move, section.update, section.remove, task.add, task.update, task.archive, task.restore, reflection.add, reflection.update, reflection.archive or reflection.restore. historyId is null until this connection makes an undoable write in the project. Pass historyId, the action id and revision to undo_operation or redo_operation. This read needs projects.read; a write-only connection can skip it entirely, because every write receipt and every transition result carries what the next call needs. Another connection’s or a person’s history is never visible here.',
    permission: 'projects.read',
    inputSchema: OperationHistorySummaryInputSchema,
    execute: ({ projectId }, { actor, services }) => services.history.summary(actor, projectId),
  }),
  defineTool({
    name: 'undo_operation',
    description:
      `Undo the next operation in this connection’s history. Every undoable write returns an operation receipt { historyId, actionId, revision, … }: the four section tools, and create_task, update_task, complete_task, archive_task, restore_task, add_reflection, archive_reflection and restore_reflection. Pass historyId, actionId and expectedRevision (the history's current revision: the receipt's, or get_operation_history's when anything happened since). Undo deletes a row or section the create made — including a task list or reflections container that create had to add — restores changed fields without touching fields somebody else changed, puts a moved task and its subtree back, reopens a completed task, or reverses an archive with its exact cascade markers. Only the newest applied action can be undone; undo them in order. The grant needed is the one for that action's family: projects.write for a section, tasks.write for a task, reflections.write for a reflection. The result is { direction, actionId, result, summary } with the refreshed history. ${REFUSALS} restore_section and restore_task remain the durable way to recover archived content once Undo is no longer possible.`,
    permissionsByFamily: true,
    inputSchema: OperationHistoryStepInputSchema,
    execute: ({ historyId, ...input }, { actor, services }) => services.history.transition(actor, historyId, { ...input, direction: 'undo' }),
  }),
  defineTool({
    name: 'redo_operation',
    description:
      `Redo the most recently undone operation in this connection’s history, reapplying exactly what the original write did — the same ids and the same captured values, never a fresh create. Read get_operation_history and pass its historyId, redo.actionId and revision as expectedRevision, or chain from the summary the last transition returned. Any new undoable write in the project discards what was waiting to be redone. The grant needed is the one for that action's family. The result is { direction, actionId, result, summary }. ${REFUSALS}`,
    permissionsByFamily: true,
    inputSchema: OperationHistoryStepInputSchema,
    execute: ({ historyId, ...input }, { actor, services }) => services.history.transition(actor, historyId, { ...input, direction: 'redo' }),
  }),
];
