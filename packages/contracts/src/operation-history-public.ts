import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { OperationActionIdSchema, OperationHistoryIdSchema, ProjectIdSchema } from './ids';
import { OperationKindSchema } from './operation-receipt';

/** `undo` and `redo` share the same cursor and ordering rules. */
export const OperationHistoryDirectionSchema = z.enum(['undo', 'redo']);
export type OperationHistoryDirection = z.infer<typeof OperationHistoryDirectionSchema>;

/** An archived project that refuses a transition, with its title for the sentence that names it. */
export const OperationHistoryBlockerSchema = z.strictObject({ projectId: ProjectIdSchema, title: z.string().min(1) });
export type OperationHistoryBlocker = z.infer<typeof OperationHistoryBlockerSchema>;

/**
 * The next action in one direction: what a control names and what a transition must cite.
 * `blockedBy` is **this step's** blocker — the archived project `transition` would refuse it for, or
 * `null` when it may run — so a control decides availability per step and never from the summary's
 * project-level `blockedBy` (an archive's own Undo runs while its project is archived).
 */
export const OperationHistoryEntrySchema = z.strictObject({
  actionId: OperationActionIdSchema,
  operation: OperationKindSchema,
  label: z.string().min(1),
  expiresAt: IsoDateTimeSchema,
  blockedBy: OperationHistoryBlockerSchema.nullable(),
});
export type OperationHistoryEntry = z.infer<typeof OperationHistoryEntrySchema>;

/**
 * The caller's snapshot-free cursor for one project. The top-level `blockedBy` is **project-level**:
 * the highest archived project on the chain from this one up, itself included. It describes the
 * project; whether a step may run is each entry's own `blockedBy`.
 */
export const OperationHistorySummarySchema = z.strictObject({
  projectId: ProjectIdSchema,
  historyId: OperationHistoryIdSchema.nullable(),
  revision: z.number().int().min(0),
  undo: OperationHistoryEntrySchema.nullable(),
  redo: OperationHistoryEntrySchema.nullable(),
  blockedBy: OperationHistoryBlockerSchema.nullable(),
});
export type OperationHistorySummary = z.infer<typeof OperationHistorySummarySchema>;

/** `get_operation_history`'s input. */
export const OperationHistorySummaryInputSchema = z.strictObject({ projectId: ProjectIdSchema });
export type OperationHistorySummaryInput = z.infer<typeof OperationHistorySummaryInputSchema>;

/** The strict body shared by the HTTP transition route. */
export const OperationHistoryTransitionInputSchema = z.strictObject({
  actionId: OperationActionIdSchema,
  direction: OperationHistoryDirectionSchema,
  expectedRevision: z.number().int().min(0),
});
export type OperationHistoryTransitionInput = z.infer<typeof OperationHistoryTransitionInputSchema>;

/** `undo_operation` and `redo_operation` name the history in addition to the transition cursor. */
export const OperationHistoryStepInputSchema = z.strictObject({
  historyId: OperationHistoryIdSchema,
  actionId: OperationActionIdSchema,
  expectedRevision: z.number().int().min(0),
});
export type OperationHistoryStepInput = z.infer<typeof OperationHistoryStepInputSchema>;
