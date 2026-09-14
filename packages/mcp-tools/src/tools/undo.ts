import { UndoInputSchema } from '@cwm/contracts';
import { defineTool, type WorkManagerTool } from '../tool';

/**
 * Receipt-based Undo (docs/decisions/2026-09-section-removal-undo-records.md), under
 * `projects.write` — the grant the removal it reverses needed.
 *
 * MCP carries no structured error details, so the description names the reason tokens every
 * refusal message starts with; an agent tells the refusals apart by that prefix.
 */
export const undoTools: readonly WorkManagerTool[] = [
  defineTool({
    name: 'undo_operation',
    description:
      'Undo one operation by the undoId from its receipt (remove_section returns one). It restores the section to the page and between the neighbours it left, with exactly the rows the removal archived or moved, and keeps later edits such as renamed tasks. Only the same agent connection that made the removal can undo it, within 24 hours, once. Refusals start with a reason: "undo_consumed:" (already undone), "undo_expired:", "undo_conflict:" (something the removal touched changed since — the message lists each entity and problem), "undo_blocked:" (the project or an ancestor is archived; reactivate it first) or "undo_unavailable:". An unknown or someone else’s undoId is not found. restore_section remains the durable way to recover an archived section after Undo is no longer possible.',
    permission: 'projects.write',
    inputSchema: UndoInputSchema,
    execute: ({ undoId }, { actor, services }) => services.undo.undo(actor, undoId),
  }),
];
