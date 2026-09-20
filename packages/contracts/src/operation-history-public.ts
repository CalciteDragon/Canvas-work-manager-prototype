import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { OperationActionIdSchema, OperationHistoryIdSchema, ProjectIdSchema } from './ids';
import { OperationKindSchema } from './operation-receipt';

/** `undo` and `redo` share the same cursor and ordering rules. */
export const OperationHistoryDirectionSchema = z.enum(['undo', 'redo']);
export type OperationHistoryDirection = z.infer<typeof OperationHistoryDirectionSchema>;

/** The next action in one direction: what a control names and what a transition must cite. */
export const OperationHistoryEntrySchema = z.strictObject({
  actionId: OperationActionIdSchema,
  operation: OperationKindSchema,
  label: z.string().min(1),
  expiresAt: IsoDateTimeSchema,
});
export type OperationHistoryEntry = z.infer<typeof OperationHistoryEntrySchema>;

/** The caller's snapshot-free cursor for one project. */
export const OperationHistorySummarySchema = z.strictObject({
  projectId: ProjectIdSchema,
  historyId: OperationHistoryIdSchema.nullable(),
  revision: z.number().int().min(0),
  undo: OperationHistoryEntrySchema.nullable(),
  redo: OperationHistoryEntrySchema.nullable(),
  blockedBy: z.strictObject({ projectId: ProjectIdSchema, title: z.string().min(1) }).nullable(),
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
