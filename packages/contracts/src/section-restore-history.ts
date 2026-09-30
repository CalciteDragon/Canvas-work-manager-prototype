import { z } from 'zod';
import { IsoDateTimeSchema, PositionSchema } from './common';
import {
  assertRowsAreDistinct,
  PlacementSnapshotSchema,
  TransitionPlacementSchema,
  UndoRowChangeSchema,
} from './history-placement';
import { ProjectIdSchema, ProjectPageIdSchema, SectionIdSchema } from './ids';
import { ProjectSectionSchema } from './section';

/**
 * **The `section.restore` payload** (Slice 37, main §§27, 31–32): the captured footprint of one
 * Archive Restore that actually changed something, held by an operation-history action beside the
 * canonical records it reverses and reapplies.
 *
 * Restore is a **new action, not a removal replayed backwards**. It stays durable — no receipt is
 * needed to invoke it, it survives the 24-hour expiry of every history action, and the first one
 * appends the section to the end of its page — and recording it simply means the same actor can
 * take it back before undoing the removal beneath it
 * (docs/decisions/2026-09-section-restore-and-shortcut-history.md).
 *
 * Two rules shape the shape:
 *
 * 1. **Exact markers, not a recomputed cascade.** `rows` holds only the rows this Restore actually
 *    revived — the ones whose `archivedWithSectionId` named the section — each with the markers it
 *    cleared. A row archived independently beforehand is absent, because Restore left it alone, and
 *    Undo must leave it alone too rather than infer the set from the container's contents later.
 * 2. **The generation is the section's, unchanged.** Restore never advances `archiveGeneration`;
 *    capturing it is how both directions tell this Restore from one that a later removal superseded.
 */
export const SectionRestoreOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('section.restore'),
    sectionId: SectionIdSchema,
    projectId: ProjectIdSchema,
    pageId: ProjectPageIdSchema,
    /** The `archivedAt` the tombstone carried, which Undo writes back and Redo compares against. */
    archivedAt: IsoDateTimeSchema,
    /** The section's generation, which Restore leaves alone; a later removal advances it. */
    archiveGeneration: z.number().int().min(0),
    /** The stale position the tombstone kept, so Undo puts the record back exactly as it was. */
    oldPosition: PositionSchema,
    /** Where this Restore actually left the section in the page's combined live order. */
    placement: PlacementSnapshotSchema,
    /** Exactly the rows this Restore revived; an independently archived row is absent. */
    rows: z.array(UndoRowChangeSchema),
  })
  .superRefine((operation, ctx) => {
    if (operation.placement.pageId !== operation.pageId) {
      ctx.addIssue({ code: 'custom', path: ['placement', 'pageId'], message: 'the placement names the section’s own page' });
    }
    for (const side of ['previous', 'next'] as const) {
      const ref = operation.placement[side];
      if (ref?.kind === 'section' && ref.id === operation.sectionId) {
        ctx.addIssue({ code: 'custom', path: ['placement', side], message: 'a placement cannot name itself as a neighbour' });
      }
    }
    assertRowsAreDistinct(operation.rows, ctx);
    for (const [index, row] of operation.rows.entries()) {
      if (row.before.archivedWithSectionId !== operation.sectionId) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', index, 'before', 'archivedWithSectionId'],
          message: 'a restored row came down with this section',
        });
      }
      if (row.after.archivedAt !== undefined || row.after.archivedWithSectionId !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['rows', index, 'after'], message: 'a restored row is live and unmarked' });
      }
      if (row.after.sectionId !== operation.sectionId) {
        ctx.addIssue({ code: 'custom', path: ['rows', index, 'after', 'sectionId'], message: 'a restored row stays in this section' });
      }
    }
  });
export type SectionRestoreOperation = z.infer<typeof SectionRestoreOperationSchema>;

/** The rows a Restore transition wrote, named rather than snapshotted: a result carries no footprint. */
const affectedRowIds = z.array(z.string().min(1));

/**
 * Undo of a Restore: the section is archived again at its captured marker and old position, and
 * exactly the recorded rows went back down with it. The section is retained, so there is one to
 * return — this never deletes, never advances the generation and never runs removal policy.
 */
export const SectionRestoreUndoResultSchema = z.object({
  operation: z.literal('section.restore'),
  outcome: z.literal('restored'),
  section: ProjectSectionSchema,
  affectedRowIds,
});
export type SectionRestoreUndoResult = z.infer<typeof SectionRestoreUndoResultSchema>;

/**
 * Redo of a Restore: the section is live again at its **recorded** placement rather than appended,
 * because that placement is what this actor committed. `partial` means neither recorded neighbour
 * survived, so the recorded index decided.
 */
export const SectionRestoreRedoResultSchema = z.object({
  operation: z.literal('section.restore'),
  outcome: z.enum(['reapplied', 'partial']),
  section: ProjectSectionSchema,
  placement: TransitionPlacementSchema,
  affectedRowIds,
});
export type SectionRestoreRedoResult = z.infer<typeof SectionRestoreRedoResultSchema>;
