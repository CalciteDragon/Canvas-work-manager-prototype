import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { OperationActionIdSchema, OperationHistoryIdSchema } from './ids';

/**
 * **What every undoable write hands back** (§31). Held here, beside `OperationKind`, rather than
 * in `undo.ts`, because `row-history.ts` declares the task and reflection write contracts that
 * carry it while `undo.ts` assembles the transition unions from `row-history.ts`. One small
 * module below both keeps that edge acyclic; `index.ts` re-exports it, so every existing
 * `@cwm/contracts` import is unchanged.
 */

/**
 * The operation kinds a history action can hold, as receipts and summaries name them.
 *
 * Four section kinds from Slice 35 and eight row kinds from Slice 36. Completion is not a kind
 * of its own: §34 makes it a `task.update` whose label and verb say `Completed`, so PATCH-to-done
 * and `complete` record one shape and one inverse.
 */
export const OperationKindSchema = z.enum([
  'section.remove',
  'section.add',
  'section.move',
  'section.update',
  'task.add',
  'task.update',
  'task.archive',
  'task.restore',
  'reflection.add',
  'reflection.update',
  'reflection.archive',
  'reflection.restore',
]);
export type OperationKind = z.infer<typeof OperationKindSchema>;

/**
 * The three families an operation kind belongs to, and the grant each one's transitions need
 * (docs/decisions/2026-09-operation-family-permissions.md). A caller never chooses the family:
 * it is read from the **stored** action, so an input cannot buy a grant it does not hold.
 */
export const OperationFamilySchema = z.enum(['section', 'task', 'reflection']);
export type OperationFamily = z.infer<typeof OperationFamilySchema>;

/** The family of one operation kind — the prefix, named rather than parsed at each call site. */
export const familyOfOperationKind = (kind: OperationKind): OperationFamily =>
  OperationFamilySchema.parse(kind.slice(0, kind.indexOf('.')));

/**
 * What a caller is handed after a committed undoable operation: the history and action it
 * recorded, and the history's `revision` after recording — the value a transition passes as
 * `expectedRevision`. Nothing of the captured footprint: no snapshot, actor or row ids.
 *
 * A client orders receipts from one history by `revision`; receipts from different histories are
 * not comparable, and never need to be, because one project's writes all record into its history.
 */
export const OperationReceiptSchema = z.strictObject({
  historyId: OperationHistoryIdSchema,
  actionId: OperationActionIdSchema,
  operation: OperationKindSchema,
  revision: z.number().int().positive(),
  label: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
});
export type OperationReceipt = z.infer<typeof OperationReceiptSchema>;
