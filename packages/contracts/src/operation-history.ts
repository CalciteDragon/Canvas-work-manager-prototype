import { z } from 'zod';
import { ActivityActorSchema, assertActorIsAttributable } from './activity';
import { IsoDateTimeSchema } from './common';
import {
  AgentConnectionIdSchema,
  OperationActionIdSchema,
  OperationHistoryIdSchema,
  ProjectIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from './ids';
import {
  OperationHistorySummarySchema,
} from './operation-history-public';
export * from './operation-history-public';
import {
  RedoResultSchema,
  UndoConflictSchema,
  UndoOperationSchema,
  UndoResultSchema,
} from './undo';

/**
 * **Operation history** (§31, Slice 35): one exact actor's bidirectional Undo/Redo stack in one
 * project, persisted as two collections of the §14 document. See
 * docs/decisions/2026-09-operation-history-scope.md for the scope and ownership rules and
 * docs/decisions/2026-09-operation-history-retention.md for the retention bounds.
 *
 * A history never exposes an action's captured footprint: the summary, the receipt, the
 * transition result and every refusal carry ids, labels and revisions, never `operation`.
 */

/**
 * An action's lifecycle. `applied` and `undone` are the two directions; `retired` is the third
 * state an action enters when a transition discovers it can never succeed again, so it stops
 * wedging the actions below it (docs/decisions/2026-09-operation-history-retired-actions.md).
 */
export const OperationActionStateSchema = z.enum(['applied', 'undone', 'retired']);
export type OperationActionState = z.infer<typeof OperationActionStateSchema>;

/**
 * One actor's cursor through the actions they made in one project.
 *
 * `cursor` is an **order value**, not an action id: `0` means nothing is applied, and Undo/Redo
 * step it across the stored orders. `orderHighWaterMark` is the highest order ever allocated —
 * never reused, even after pruning — so a cursor is valid exactly when it is no higher than it.
 * `revision` increments on every committed history mutation (record, transition, retirement) and
 * never on pruning, so a background prune cannot refuse an innocent caller holding a revision.
 */
export const OperationHistorySchema = z
  .object({
    id: OperationHistoryIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    actor: ActivityActorSchema,
    actorUserId: UserIdSchema.optional(),
    actorAgentConnectionId: AgentConnectionIdSchema.optional(),
    cursor: z.number().int().min(0),
    orderHighWaterMark: z.number().int().min(0),
    revision: z.number().int().min(0),
  })
  .superRefine((history, ctx) => {
    assertActorIsAttributable(history, ctx);
    if (history.cursor > history.orderHighWaterMark) {
      ctx.addIssue({ code: 'custom', path: ['cursor'], message: 'a cursor cannot exceed its order high-water mark' });
    }
  });
export type OperationHistory = z.infer<typeof OperationHistorySchema>;

/**
 * One typed, versioned operation held by a history. `order` is its permanent position in the
 * stack; `createdAt` is presentation only, because the dev-panel clock can move backwards.
 */
export const OperationActionSchema = z
  .object({
    id: OperationActionIdSchema,
    historyId: OperationHistoryIdSchema,
    order: z.number().int().positive(),
    state: OperationActionStateSchema,
    label: z.string().min(1),
    createdAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
    operation: UndoOperationSchema,
  })
  .superRefine((action, ctx) => {
    if (Date.parse(action.expiresAt) <= Date.parse(action.createdAt)) {
      ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'an action expires after it is created' });
    }
  });
export type OperationAction = z.infer<typeof OperationActionSchema>;

/** Repository filter for histories. */
export const OperationHistoryQuerySchema = z.object({
  workspaceId: WorkspaceIdSchema.optional(),
  projectId: ProjectIdSchema.optional(),
});
export type OperationHistoryQuery = z.infer<typeof OperationHistoryQuerySchema>;

/** Repository filter for one history's actions. */
export const OperationActionQuerySchema = z.object({ historyId: OperationHistoryIdSchema.optional() });
export type OperationActionQuery = z.infer<typeof OperationActionQuerySchema>;

/** A completed transition: which action ran, what it did, and the refreshed summary. */
export const OperationHistoryTransitionResultSchema = z.discriminatedUnion('direction', [
  z.strictObject({
    direction: z.literal('undo'),
    actionId: OperationActionIdSchema,
    result: UndoResultSchema,
    summary: OperationHistorySummarySchema,
  }),
  z.strictObject({
    direction: z.literal('redo'),
    actionId: OperationActionIdSchema,
    result: RedoResultSchema,
    summary: OperationHistorySummarySchema,
  }),
]);
export type OperationHistoryTransitionResult = z.infer<typeof OperationHistoryTransitionResultSchema>;

/** Every refusal names its history and the caller's current summary, so a client reconciles at once. */
const refusalBase = {
  historyId: OperationHistoryIdSchema,
  actionId: OperationActionIdSchema,
  summary: OperationHistorySummarySchema,
};

/**
 * The typed half of a history refusal, carried by the 409 envelope's `details`. MCP clients get
 * the message only, so every refusal message also starts with its `reason` token.
 *
 * - `history_not_next` — the named action is not the next step in that direction (it is below a
 *   newer action, already transitioned, or not in this history). Repairable: undo the newer one.
 * - `history_revision_stale` — `expectedRevision` is not the history's revision. A retried
 *   request whose first attempt landed refuses here, and its `summary` shows the advance.
 * - `history_expired` — the next action is past its 24-hour lifetime but not yet pruned.
 * - `history_blocked` — the project or an ancestor is archived.
 * - `history_conflict` — a later change to the recorded footprint; nothing was written.
 * - `history_unavailable` — a removal Undo has no page to return to.
 * - `history_retired` — the action can never succeed again. The one refusal that **commits**:
 *   the action became `retired`, the cursor stepped past it and the revision advanced; nothing
 *   executed, and the `summary` names the next reachable action.
 */
export const OperationHistoryRefusalDetailsSchema = z.discriminatedUnion('reason', [
  z.strictObject({ reason: z.literal('history_not_next'), ...refusalBase }),
  z.strictObject({ reason: z.literal('history_revision_stale'), ...refusalBase }),
  z.strictObject({ reason: z.literal('history_expired'), ...refusalBase, expiresAt: IsoDateTimeSchema }),
  z.strictObject({
    reason: z.literal('history_blocked'),
    ...refusalBase,
    blockingProjectId: ProjectIdSchema,
    blockingProjectTitle: z.string().min(1),
  }),
  z.strictObject({ reason: z.literal('history_conflict'), ...refusalBase, conflicts: z.array(UndoConflictSchema).min(1) }),
  z.strictObject({
    reason: z.literal('history_unavailable'),
    ...refusalBase,
    problem: z.enum(['no-compatible-page', 'shortcut-on-fallback-page']),
  }),
  z.strictObject({ reason: z.literal('history_retired'), ...refusalBase, conflicts: z.array(UndoConflictSchema).min(1) }),
]);
export type OperationHistoryRefusalDetails = z.infer<typeof OperationHistoryRefusalDetailsSchema>;
export type OperationHistoryRefusalReason = OperationHistoryRefusalDetails['reason'];
