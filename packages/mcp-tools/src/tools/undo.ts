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
 * action's family — `projects.write` for a section, a Home shortcut placement, an optional page or
 * an existing project's own write, `tasks.write` for
 * a task, `reflections.write` for a reflection — so they declare `permissionsByFamily` rather than
 * a single grant, and `tools/list` publishes the namespaced map instead of a singular or
 * conjunctive key that would be false (docs/decisions/2026-09-operation-family-permissions.md).
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
      'Read this connection’s own Undo/Redo history for a project: { projectId, historyId, revision, undo, redo, blockedBy }. undo and redo name the next action in each direction — { actionId, operation, label, expiresAt, blockedBy } — or null at either end of the stack. Each entry’s blockedBy is that step’s own blocker, { projectId, title } of the archived project a transition would refuse it for, or null when it may run; the top-level blockedBy describes the project (the highest archived project on its chain) and does not decide a step — an archive’s own Undo runs while its project is archived. operation is one of section.add, section.move, section.update, section.remove, section.restore, task.add, task.update, task.archive, task.restore, reflection.add, reflection.update, reflection.archive, reflection.restore, shortcut.add, shortcut.update, shortcut.move, shortcut.remove, page.add, page.update, project.update, project.archive or project.reactivate. A project’s own writes join that project’s history, a sub-project’s included — not its root’s. historyId is null until this connection makes an undoable write in the project. Pass historyId, the action id and revision to undo_operation or redo_operation. This read needs projects.read; a write-only connection can skip it entirely, because every write receipt and every transition result carries what the next call needs. Another connection’s or a person’s history is never visible here.',
    permission: 'projects.read',
    inputSchema: OperationHistorySummaryInputSchema,
    execute: ({ projectId }, { actor, services }) => services.history.summary(actor, projectId),
  }),
  defineTool({
    name: 'undo_operation',
    description:
      `Undo the next operation in this connection’s history. Every undoable write returns an operation receipt { historyId, actionId, revision, … }: the five section tools including restore_section, add_section_shortcut and remove_section_shortcut, and create_task, update_task, complete_task, archive_task, restore_task, add_reflection, archive_reflection and restore_reflection, and set_project_page_enabled when it changed something (its first enable is page.add, a later toggle page.update; a no-op answers operation: null), and update_project, archive_project and restore_project when they changed something (project.archive when the status entered archived, project.reactivate when it left it, project.update otherwise). Section duplication and shortcut resizing, collapsing and reordering are HTTP-only here and record the same way. Pass historyId, actionId and expectedRevision (the history's current revision: the receipt's, or get_operation_history's when anything happened since). Undo deletes a row or section the create made — including a task list or reflections container that create had to add — restores changed fields without touching fields somebody else changed, puts a moved task and its subtree back, reopens a completed task, or reverses an archive with its exact cascade markers, re-archives exactly what a section restore revived, or removes a Home shortcut placement without touching the section it points at, flips a page toggle back, or removes the optional page a first enable created — only while nothing refers to it, or writes a project’s recorded fields back — its status, completion time and parent included — rechecking the parent, cycle, archived-ancestor and live-child rules first. A project’s own archive can be undone, its reactivation redone and an edit made while it was archived undone or redone while that project is still archived; an archived ancestor still blocks. Only the newest applied action can be undone; undo them in order. The grant needed is the one for that action's family: projects.write for a section, a shortcut, a page or a project, tasks.write for a task, reflections.write for a reflection. The result is { direction, actionId, result, summary } with the refreshed history. ${REFUSALS} restore_section and restore_task remain the durable way to recover archived content once Undo is no longer possible.`,
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
