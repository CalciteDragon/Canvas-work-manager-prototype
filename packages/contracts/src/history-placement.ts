import { z } from 'zod';
import { IsoDateTimeSchema, PositionSchema } from './common';
import { ProjectPageIdSchema, ReflectionIdSchema, SectionIdSchema, TaskIdSchema } from './ids';

/**
 * **The placement and row-structure shapes every history family shares** (§31).
 *
 * They live here rather than in `undo.ts` for one mechanical reason: `row-history.ts` needs
 * them to describe a task or reflection operation, and `undo.ts` needs `row-history.ts` to
 * assemble the transition unions. Holding the shared half in a third module keeps that edge
 * acyclic. `index.ts` re-exports everything, so every existing `@cwm/contracts` import of
 * these names is unchanged.
 */

/** One entry of a page's combined section/shortcut order (§27). */
export const PlacementRefSchema = z.strictObject({
  kind: z.enum(['section', 'shortcut']),
  id: z.string().min(1),
});
export type PlacementRef = z.infer<typeof PlacementRefSchema>;

/**
 * Where the subject sat in its page's **live** combined order before the removal: its
 * neighbours, when it had them, and its index. Undo prefers a surviving neighbour to the index,
 * because the index means nothing once the page has changed around it.
 */
export const PlacementSnapshotSchema = z.strictObject({
  pageId: ProjectPageIdSchema,
  previous: PlacementRefSchema.optional(),
  next: PlacementRefSchema.optional(),
  index: PositionSchema,
});
export type PlacementSnapshot = z.infer<typeof PlacementSnapshotSchema>;

/** Where a transition put a section, and which placement rule decided it. */
export const TransitionPlacementSchema = z.object({
  pageId: ProjectPageIdSchema,
  index: PositionSchema,
  strategy: z.enum(['previous', 'next', 'index']),
  pageEnabled: z.boolean(),
});
export type TransitionPlacement = z.infer<typeof TransitionPlacementSchema>;

/**
 * The fields of a task an inverse writes, and therefore the only ones a later structural edit
 * can conflict with. A title or status edit is not structural and is preserved by Undo.
 */
export const TaskStructuralStateSchema = z.strictObject({
  sectionId: SectionIdSchema,
  parentTaskId: TaskIdSchema.optional(),
  archivedAt: IsoDateTimeSchema.optional(),
  archivedWithSectionId: SectionIdSchema.optional(),
  archivedWithTaskId: TaskIdSchema.optional(),
});
export type TaskStructuralState = z.infer<typeof TaskStructuralStateSchema>;

/** A reflection has no parent, so its structural state is its container and archive marker. */
export const ReflectionStructuralStateSchema = z.strictObject({
  sectionId: SectionIdSchema,
  archivedAt: IsoDateTimeSchema.optional(),
  archivedWithSectionId: SectionIdSchema.optional(),
});
export type ReflectionStructuralState = z.infer<typeof ReflectionStructuralStateSchema>;

/** One row an operation changed, as it was before and as the operation left it. */
export const UndoRowChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('task'),
    id: TaskIdSchema,
    before: TaskStructuralStateSchema,
    after: TaskStructuralStateSchema,
  }),
  z.strictObject({
    kind: z.literal('reflection'),
    id: ReflectionIdSchema,
    before: ReflectionStructuralStateSchema,
    after: ReflectionStructuralStateSchema,
  }),
]);
export type UndoRowChange = z.infer<typeof UndoRowChangeSchema>;

/**
 * Rejects a duplicate row id in a captured footprint. Shared by every operation that records
 * a set of changed rows, so "a row is recorded once" is one rule rather than four copies.
 */
export const assertRowsAreDistinct = (rows: readonly UndoRowChange[], ctx: z.RefinementCtx, path = 'rows'): void => {
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (seen.has(row.id)) ctx.addIssue({ code: 'custom', path: [path, index, 'id'], message: 'a row is recorded once' });
    seen.add(row.id);
  }
};
