import { OperationHistoryStepInputSchema, OperationHistorySummaryInputSchema } from '@cwm/contracts';
import { defineTool, type WorkManagerTool } from '../tool';

const REFUSALS =
  'Refusals start with a reason token: "history_not_next:" (that action is not the next step — read get_operation_history), ' +
  '"history_revision_stale:" (the history moved on; a retried call whose first attempt landed also refuses here), ' +
  '"history_expired:" (older than 24 hours), "history_blocked:" (the project or an ancestor is archived; reactivate it first), ' +
  '"history_conflict:" (a later change to the same section or its rows; nothing was written), ' +
  '"history_unavailable:" (no page to return the section to) or ' +
  '"history_retired:" (the action can never succeed again and was retired, so the next call can reach the one below it). ' +
  'An unknown history or one belonging to another connection is not found.';

/**
 * Per-connection operation history (docs/decisions/2026-09-operation-history-scope.md). The read
 * needs `projects.read`; the two transitions need `projects.write`, the grant every Stage A family
 * — the section writes — already needed. The grant stays a static field per tool until Stage B,
 * when a task action's `tasks.write` first differs from it.
 *
 * MCP clients receive a refusal's message only, so each message starts with its reason token.
 */
export const undoTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'get_operation_history',
    description:
      'Read this connection’s own Undo/Redo history for a project: { projectId, historyId, revision, undo, redo, blockedBy }. undo and redo name the next action in each direction — { actionId, operation, label, expiresAt } — or null at either end of the stack. historyId is null until this connection makes an undoable section write in the project. Pass historyId, the action id and revision to undo_operation or redo_operation. Another connection’s or a person’s history is never visible here.',
    permission: 'projects.read',
    inputSchema: OperationHistorySummaryInputSchema,
    execute: ({ projectId }, { actor, services }) => services.history.summary(actor, projectId),
  }),
  defineTool({
    name: 'undo_operation',
    description:
      `Undo the next section operation in this connection’s history: create_section, move_section, update_section and remove_section each return an operation receipt { historyId, actionId, revision, … }. Pass historyId, actionId and expectedRevision (the history's current revision: the receipt's, or get_operation_history's when anything happened since). Undo removes a newly added section, restores changed fields, puts a moved section back between its surviving neighbours, or reverses a removal's exact row and placement changes. Only the newest applied action can be undone; undo them in order. The result is { direction, actionId, result, summary } with the refreshed history. ${REFUSALS} restore_section remains the durable way to recover an archived section once Undo is no longer possible.`,
    permission: 'projects.write',
    inputSchema: OperationHistoryStepInputSchema,
    execute: ({ historyId, ...input }, { actor, services }) => services.history.transition(actor, historyId, { ...input, direction: 'undo' }),
  }),
  defineTool({
    name: 'redo_operation',
    description:
      `Redo the most recently undone section operation in this connection’s history, reapplying exactly what the original write did. Read get_operation_history and pass its historyId, redo.actionId and revision as expectedRevision. Any new undoable write in the project discards what was waiting to be redone. The result is { direction, actionId, result, summary }. ${REFUSALS}`,
    permission: 'projects.write',
    inputSchema: OperationHistoryStepInputSchema,
    execute: ({ historyId, ...input }, { actor, services }) => services.history.transition(actor, historyId, { ...input, direction: 'redo' }),
  }),
];
