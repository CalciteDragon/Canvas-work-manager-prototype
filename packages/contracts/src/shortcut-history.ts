import { z } from 'zod';
import { PlacementSnapshotSchema, TransitionPlacementSchema } from './history-placement';
import { ProjectIdSchema, ProjectPageIdSchema, SectionShortcutIdSchema } from './ids';
import { SectionColumnSpanSchema } from './section';
import { SectionShortcutSchema } from './section-shortcut';

/**
 * **The four Home shortcut operation payloads** (Slice 37, main §§27, 31): the captured footprint
 * of one committed placement write, held by an operation-history action.
 *
 * A shortcut owns **only a placement** (docs/decisions/2026-09-a-shortcut-resolves-identity-not-content.md):
 * where a canonical section is shown on a root's Home page and how that frame looks. So every payload
 * here captures the placement record and nothing of the source — no config, no rows, not even the
 * source's title. Undoing an added shortcut deletes a reference; it never touches the section the
 * reference names, and a later edit to that section is therefore not a conflict.
 *
 * Each payload also names its **destination** project explicitly. The placement itself knows only
 * its `pageId`, but the action belongs to the Home project's history — never the source
 * sub-project's — and `operationProjectOf` has to answer that without a repository read.
 */

const shortcutSubject = {
  shortcutId: SectionShortcutIdSchema,
  /** The destination root project whose history owns this action — never the source's. */
  projectId: ProjectIdSchema,
  pageId: ProjectPageIdSchema,
};

/** Rejects a snapshot whose placement names the subject as its own neighbour. */
const assertNoSelfNeighbour = (
  subjectId: string,
  key: string,
  snapshot: z.infer<typeof PlacementSnapshotSchema>,
  ctx: z.RefinementCtx,
): void => {
  for (const side of ['previous', 'next'] as const) {
    const ref = snapshot[side];
    if (ref?.kind === 'shortcut' && ref.id === subjectId) {
      ctx.addIssue({ code: 'custom', path: [key, side], message: 'a placement cannot name itself as a neighbour' });
    }
  }
};

const placementShape = {
  version: z.literal(1),
  /** The destination root project whose history owns this action. */
  projectId: ProjectIdSchema,
  /** The canonical placement record, complete, so Redo recreates it with the same id. */
  shortcut: SectionShortcutSchema,
  /** Its neighbours in the page's combined section/shortcut order, taken while it was live. */
  placement: PlacementSnapshotSchema,
};

const assertPlacement = (
  operation: { shortcut: z.infer<typeof SectionShortcutSchema>; placement: z.infer<typeof PlacementSnapshotSchema> },
  ctx: z.RefinementCtx,
): void => {
  if (operation.placement.pageId !== operation.shortcut.pageId) {
    ctx.addIssue({ code: 'custom', path: ['placement', 'pageId'], message: 'the placement names the shortcut’s own page' });
  }
  assertNoSelfNeighbour(operation.shortcut.id, 'placement', operation.placement, ctx);
};

/** `shortcut.add`: Undo deletes just this placement; Redo recreates it with the same id. */
export const ShortcutAddOperationSchema = z
  .strictObject({ ...placementShape, type: z.literal('shortcut.add') })
  .superRefine(assertPlacement);
export type ShortcutAddOperation = z.infer<typeof ShortcutAddOperationSchema>;

/** `shortcut.remove`: the mirror image — Undo recreates the placement, Redo deletes it again. */
export const ShortcutRemoveOperationSchema = z
  .strictObject({ ...placementShape, type: z.literal('shortcut.remove') })
  .superRefine(assertPlacement);
export type ShortcutRemoveOperation = z.infer<typeof ShortcutRemoveOperationSchema>;

/** The two presentation fields a placement owns of its own; the source's are untouched. */
export const ShortcutFieldChangeSchema = z.discriminatedUnion('field', [
  z.strictObject({ field: z.literal('collapsed'), before: z.boolean(), after: z.boolean() }),
  z.strictObject({ field: z.literal('columnSpan'), before: SectionColumnSpanSchema, after: SectionColumnSpanSchema }),
]);
export type ShortcutFieldChange = z.infer<typeof ShortcutFieldChangeSchema>;

/** `shortcut.update`: exactly the presentation fields one committed gesture changed. */
export const ShortcutUpdateOperationSchema = z
  .strictObject({
    ...shortcutSubject,
    version: z.literal(1),
    type: z.literal('shortcut.update'),
    changes: z.array(ShortcutFieldChangeSchema).min(1),
  })
  .superRefine((operation, ctx) => {
    const seen = new Set<string>();
    for (const [index, change] of operation.changes.entries()) {
      if (seen.has(change.field)) {
        ctx.addIssue({ code: 'custom', path: ['changes', index, 'field'], message: 'a field is recorded once' });
      }
      seen.add(change.field);
      if (change.before === change.after) {
        ctx.addIssue({ code: 'custom', path: ['changes', index], message: 'a recorded field actually changed' });
      }
    }
  });
export type ShortcutUpdateOperation = z.infer<typeof ShortcutUpdateOperationSchema>;

/** `shortcut.move`: both stable-neighbour snapshots, like a section move. */
export const ShortcutMoveOperationSchema = z
  .strictObject({
    ...shortcutSubject,
    version: z.literal(1),
    type: z.literal('shortcut.move'),
    placementBefore: PlacementSnapshotSchema,
    placementAfter: PlacementSnapshotSchema,
  })
  .superRefine((operation, ctx) => {
    for (const key of ['placementBefore', 'placementAfter'] as const) {
      const snapshot = operation[key];
      if (snapshot.pageId !== operation.pageId) {
        ctx.addIssue({ code: 'custom', path: [key, 'pageId'], message: 'the placement is on the shortcut’s page' });
      }
      assertNoSelfNeighbour(operation.shortcutId, key, snapshot, ctx);
    }
  });
export type ShortcutMoveOperation = z.infer<typeof ShortcutMoveOperationSchema>;

/** Every shortcut operation a history action can hold. */
export const ShortcutUndoOperationSchema = z.discriminatedUnion('type', [
  ShortcutAddOperationSchema,
  ShortcutUpdateOperationSchema,
  ShortcutMoveOperationSchema,
  ShortcutRemoveOperationSchema,
]);
export type ShortcutUndoOperation = z.infer<typeof ShortcutUndoOperationSchema>;

/**
 * Every shortcut transition names its destination and subject. The canonical `shortcut` record
 * appears only when one exists afterwards — a deleted placement is reported by id, never by a
 * snapshot that would read as current.
 */
const shortcutResult = { ...shortcutSubject };

/** A placement that is gone: Undo of an add, Redo of a remove. */
const goneResult = <T extends 'shortcut.add' | 'shortcut.remove'>(operation: T) =>
  z.object({ ...shortcutResult, operation: z.literal(operation), outcome: z.literal('removed') });

/** A placement that exists again, at the placement this direction resolved. */
const placedResult = <T extends 'shortcut.add' | 'shortcut.remove' | 'shortcut.move', O extends string>(
  operation: T,
  outcomes: readonly [O, ...O[]],
) =>
  z.object({
    ...shortcutResult,
    operation: z.literal(operation),
    outcome: z.enum(outcomes),
    shortcut: SectionShortcutSchema,
    placement: TransitionPlacementSchema,
  });

export const ShortcutAddUndoResultSchema = goneResult('shortcut.add');
export type ShortcutAddUndoResult = z.infer<typeof ShortcutAddUndoResultSchema>;
export const ShortcutAddRedoResultSchema = placedResult('shortcut.add', ['reapplied', 'partial']);
export type ShortcutAddRedoResult = z.infer<typeof ShortcutAddRedoResultSchema>;

export const ShortcutRemoveUndoResultSchema = placedResult('shortcut.remove', ['restored', 'partial']);
export type ShortcutRemoveUndoResult = z.infer<typeof ShortcutRemoveUndoResultSchema>;
export const ShortcutRemoveRedoResultSchema = goneResult('shortcut.remove');
export type ShortcutRemoveRedoResult = z.infer<typeof ShortcutRemoveRedoResultSchema>;

/** A presentation change writes no position, so it answers the record without a placement. */
const updateResult = <O extends string>(outcome: O) =>
  z.object({
    ...shortcutResult,
    operation: z.literal('shortcut.update'),
    outcome: z.literal(outcome),
    shortcut: SectionShortcutSchema,
  });

export const ShortcutUpdateUndoResultSchema = updateResult('restored');
export const ShortcutUpdateRedoResultSchema = updateResult('reapplied');
export const ShortcutMoveUndoResultSchema = placedResult('shortcut.move', ['restored', 'partial']);
export const ShortcutMoveRedoResultSchema = placedResult('shortcut.move', ['reapplied', 'partial']);

/** The four shortcut members of `UndoResultSchema`, in operation order. */
export const SHORTCUT_UNDO_RESULT_SCHEMAS = [
  ShortcutAddUndoResultSchema,
  ShortcutUpdateUndoResultSchema,
  ShortcutMoveUndoResultSchema,
  ShortcutRemoveUndoResultSchema,
] as const;

/** The four shortcut members of `RedoResultSchema`, in the same order. */
export const SHORTCUT_REDO_RESULT_SCHEMAS = [
  ShortcutAddRedoResultSchema,
  ShortcutUpdateRedoResultSchema,
  ShortcutMoveRedoResultSchema,
  ShortcutRemoveRedoResultSchema,
] as const;
