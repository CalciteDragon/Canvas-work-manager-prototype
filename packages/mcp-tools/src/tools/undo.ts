import { UndoInputSchema } from '@cwm/contracts';
import { defineTool, type WorkManagerTool } from '../tool';

/**
 * Receipt-based Undo (docs/decisions/2026-09-section-edit-undo-boundaries.md), under
 * `projects.write` — the grant the removal it reverses needed.
 *
 * MCP carries no structured error details, so the description names the reason tokens every
 * refusal message starts with; an agent tells the refusals apart by that prefix.
 */
export const undoTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'undo_operation',
    description:
      'Undo one section operation by the undoId from its receipt (create_section, move_section, update_section or remove_section returns one). It removes a newly added section, restores changed fields, restores a move between surviving neighbours, or reverses the removal’s exact row and placement changes. Only the same agent connection that made the operation can undo it, within 24 hours, once. Refusals start with a reason: "undo_consumed:", "undo_expired:", "undo_conflict:", "undo_blocked:" (the project or an ancestor is archived; reactivate it first) or "undo_unavailable:". An unknown or someone else’s undoId is not found. restore_section remains the durable way to recover an archived section after Undo is no longer possible.',
    permission: 'projects.write',
    inputSchema: UndoInputSchema,
    execute: ({ undoId }, { actor, services }) => services.undo.undo(actor, undoId),
  }),
];
