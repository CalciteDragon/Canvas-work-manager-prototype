import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { ProjectIdSchema, ProjectPageIdSchema, SectionIdSchema } from './ids';
import {
  assertRowsAreDistinct,
  PlacementSnapshotSchema,
  TransitionPlacementSchema,
  UndoRowChangeSchema,
} from './history-placement';
import { OperationReceiptSchema } from './operation-receipt';
import {
  PAGE_REDO_RESULT_SCHEMAS,
  PAGE_UNDO_RESULT_SCHEMAS,
  PageUndoOperationSchema,
} from './page-history';
import {
  PROJECT_REDO_RESULT_SCHEMAS,
  PROJECT_UNDO_RESULT_SCHEMAS,
  ProjectUndoOperationSchema,
} from './project-history';
import { ROW_REDO_RESULT_SCHEMAS, ROW_UNDO_RESULT_SCHEMAS, RowUndoOperationSchema } from './row-history';
import {
  SectionRestoreOperationSchema,
  SectionRestoreRedoResultSchema,
  SectionRestoreUndoResultSchema,
} from './section-restore-history';
import {
  SHORTCUT_REDO_RESULT_SCHEMAS,
  SHORTCUT_UNDO_RESULT_SCHEMAS,
  ShortcutUndoOperationSchema,
} from './shortcut-history';
import { ownedKindOf, ProjectSectionSchema, SectionColumnSpanSchema, SectionConfigSchema } from './section';

/**
 * **Section operation payloads** (Refactor §§10–13, main §31): the captured footprint of one
 * successful explicit section operation, held by an operation-history action
 * (`operation-history.ts`) beside the canonical records it reverses and reapplies, and never
 * inside `ActivityEvent` or a live frame. See docs/decisions/2026-09-section-edit-undo-boundaries.md
 * and docs/decisions/2026-09-operation-history-scope.md.
 *
 * The operation union is typed and versioned: an unknown `type` or `version` fails parsing
 * rather than executing arbitrary JSON. Slice 36 adds the eight task and reflection members from
 * `row-history.ts`; Slice 37 adds `section.restore` from `section-restore-history.ts` and the four
 * placement members from `shortcut-history.ts`; Slice 38 adds the two optional-page toggles from
 * `page-history.ts`; Slice 39 adds the three existing-project writes from `project-history.ts`. The placement and row-structure shapes every family shares live in
 * `history-placement.ts`.
 */

/** The policy removal actually **applied** — not the one the caller sent. */
export const AppliedRemovalPolicySchema = z.enum(['none', 'cascade', 'reassign']);
export type AppliedRemovalPolicy = z.infer<typeof AppliedRemovalPolicySchema>;

const ROW_KIND_FOR_OWNED = { tasks: 'task', reflections: 'reflection' } as const;

/**
 * The inverse of one `SectionService.remove`, version 1.
 *
 * `appliedPolicy` is what removal *did*: `RemoveSectionInput` accepts `policy: 'reassign'` with
 * no target, and removal never inspects it when nothing is live, so such a removal records
 * `none`. `rows` holds exactly the rows the removal wrote — for cascade the live rows it archived,
 * for reassign every row it moved, pre-archived ones included.
 *
 * `disposition` says whether the section was retained or deleted. Only a recorded deletion allows
 * Undo to recreate a missing section, and only a recorded deletion makes Redo delete it again.
 *
 * `archiveGeneration` is the section's generation *after* this removal. It replaces the
 * workspace-wide supersession scan: two removals of one retained section can land in one clock
 * instant, so `archivedAt` alone cannot tell them apart, but the generation — bumped by every
 * removal and by nothing else — can (docs/decisions/2026-09-operation-history-retired-actions.md).
 */
export const SectionRemovalDispositionSchema = z.enum(['retained', 'deleted']);
export type SectionRemovalDisposition = z.infer<typeof SectionRemovalDispositionSchema>;

export const SectionRemoveUndoOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('section.remove'),
    /** The complete pre-removal section, config included. */
    section: ProjectSectionSchema,
    placement: PlacementSnapshotSchema,
    appliedPolicy: AppliedRemovalPolicySchema,
    reassignToSectionId: SectionIdSchema.optional(),
    rows: z.array(UndoRowChangeSchema),
    disposition: SectionRemovalDispositionSchema,
    /** The `archivedAt` removal wrote, which Undo compares against to detect a later restore. */
    postSectionArchivedAt: IsoDateTimeSchema,
    /** The section's `archiveGeneration` as this removal left it; Redo replays it verbatim. */
    archiveGeneration: z.number().int().positive(),
  })
  .superRefine((operation, ctx) => {
    if (operation.section.archivedAt !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['section', 'archivedAt'], message: 'a removed section was live before removal' });
    }
    if (operation.placement.pageId !== operation.section.pageId) {
      ctx.addIssue({ code: 'custom', path: ['placement', 'pageId'], message: 'the placement names the section’s own page' });
    }
    if (operation.archiveGeneration !== operation.section.archiveGeneration + 1) {
      ctx.addIssue({ code: 'custom', path: ['archiveGeneration'], message: 'a removal advances the section generation by one' });
    }
    if ((operation.reassignToSectionId !== undefined) !== (operation.appliedPolicy === 'reassign')) {
      ctx.addIssue({
        code: 'custom',
        path: ['reassignToSectionId'],
        message: 'a reassign target is present exactly when reassign was applied',
      });
    }
    if ((operation.rows.length === 0) !== (operation.appliedPolicy === 'none')) {
      ctx.addIssue({ code: 'custom', path: ['rows'], message: 'rows are recorded exactly when a policy was applied' });
    }
    const owned = ownedKindOf(operation.section.type);
    assertRowsAreDistinct(operation.rows, ctx);
    for (const [index, row] of operation.rows.entries()) {
      if (owned === undefined || row.kind !== ROW_KIND_FOR_OWNED[owned]) {
        ctx.addIssue({ code: 'custom', path: ['rows', index, 'kind'], message: 'a row is of the kind its section owns' });
      }
    }
  });
export type SectionRemoveUndoOperation = z.infer<typeof SectionRemoveUndoOperationSchema>;

/**
 * An explicit section add: Undo deletes only the created section; Redo recreates it with the same
 * id at `placement`, the live combined-order snapshot taken right after the add.
 */
export const SectionAddUndoOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('section.add'),
    section: ProjectSectionSchema,
    placement: PlacementSnapshotSchema,
  })
  .superRefine((operation, ctx) => {
    if (operation.section.archivedAt !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['section', 'archivedAt'], message: 'an added section is live' });
    }
    if (operation.placement.pageId !== operation.section.pageId) {
      ctx.addIssue({ code: 'custom', path: ['placement', 'pageId'], message: 'the placement names the section’s own page' });
    }
  });
export type SectionAddUndoOperation = z.infer<typeof SectionAddUndoOperationSchema>;

/** The inverse of one explicit section move, with both stable-neighbour snapshots. */
export const SectionMoveUndoOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('section.move'),
    sectionId: SectionIdSchema,
    projectId: ProjectIdSchema,
    pageId: ProjectPageIdSchema,
    placementBefore: PlacementSnapshotSchema,
    placementAfter: PlacementSnapshotSchema,
  })
  .superRefine((operation, ctx) => {
    if (operation.placementBefore.pageId !== operation.pageId) {
      ctx.addIssue({ code: 'custom', path: ['placementBefore', 'pageId'], message: 'the before placement is on the section page' });
    }
    if (operation.placementAfter.pageId !== operation.pageId) {
      ctx.addIssue({ code: 'custom', path: ['placementAfter', 'pageId'], message: 'the after placement is on the section page' });
    }
    for (const [key, placement] of [['placementBefore', operation.placementBefore], ['placementAfter', operation.placementAfter]] as const) {
      if (placement.previous?.kind === 'section' && placement.previous.id === operation.sectionId) {
        ctx.addIssue({ code: 'custom', path: [key, 'previous'], message: 'a placement cannot name itself as previous' });
      }
      if (placement.next?.kind === 'section' && placement.next.id === operation.sectionId) {
        ctx.addIssue({ code: 'custom', path: [key, 'next'], message: 'a placement cannot name itself as next' });
      }
    }
  });
export type SectionMoveUndoOperation = z.infer<typeof SectionMoveUndoOperationSchema>;

/** A raw title before a write may be a legacy blank value; a forward value is normalized. */
const UndoTitleValueSchema = z.string().nullable();
const NormalizedUndoTitleValueSchema = z
  .string()
  .refine((value) => value.trim().length > 0, 'an updated title is normalized and non-empty')
  .nullable();

/** One typed field footprint for a settings update. Config is intentionally whole-object. */
export const SectionFieldChangeSchema = z.discriminatedUnion('field', [
  z.strictObject({ field: z.literal('title'), before: UndoTitleValueSchema, after: NormalizedUndoTitleValueSchema }),
  z.strictObject({ field: z.literal('config'), before: SectionConfigSchema, after: SectionConfigSchema }),
  z.strictObject({ field: z.literal('collapsed'), before: z.boolean(), after: z.boolean() }),
  z.strictObject({ field: z.literal('columnSpan'), before: SectionColumnSpanSchema, after: SectionColumnSpanSchema }),
]);
export type SectionFieldChange = z.infer<typeof SectionFieldChangeSchema>;

/** The inverse of a settings write, limited to the fields that write actually changed. */
export const SectionUpdateUndoOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('section.update'),
    sectionId: SectionIdSchema,
    projectId: ProjectIdSchema,
    pageId: ProjectPageIdSchema,
    changes: z.array(SectionFieldChangeSchema).min(1),
  })
  .superRefine((operation, ctx) => {
    const seen = new Set<string>();
    for (const [index, change] of operation.changes.entries()) {
      if (seen.has(change.field)) {
        ctx.addIssue({ code: 'custom', path: ['changes', index, 'field'], message: 'a field is recorded once' });
      }
      seen.add(change.field);
    }
  });
export type SectionUpdateUndoOperation = z.infer<typeof SectionUpdateUndoOperationSchema>;

/** Every operation a history action can hold, discriminated by `type`. */
export const UndoOperationSchema = z.discriminatedUnion('type', [
  SectionRemoveUndoOperationSchema,
  SectionAddUndoOperationSchema,
  SectionMoveUndoOperationSchema,
  SectionUpdateUndoOperationSchema,
  SectionRestoreOperationSchema,
  ...RowUndoOperationSchema.options,
  ...ShortcutUndoOperationSchema.options,
  ...PageUndoOperationSchema.options,
  ...ProjectUndoOperationSchema.options,
]);
export type UndoOperation = z.infer<typeof UndoOperationSchema>;
export type UndoOperationType = UndoOperation['type'];

/**
 * **The project whose history owns an action.** One function rather than a conditional at each
 * call site: document integrity, the recorder and every executor ask the same question, and a
 * family added later must answer it here or fail to compile.
 */
export const operationProjectOf = (operation: UndoOperation): string => {
  switch (operation.type) {
    case 'section.remove':
    case 'section.add':
      return operation.section.projectId;
    case 'task.add':
      return operation.task.projectId;
    case 'reflection.add':
      return operation.reflection.projectId;
    // A created page carries its owner in the record Redo recreates, exactly as a created
    // section does.
    case 'page.add':
      return operation.page.projectId;
    // Every remaining member names its own project, including a shortcut, whose `projectId` is
    // the **destination** Home project rather than the source sub-project the placement points at,
    // and a project write, whose `projectId` is the subject itself — never its root, so a reparent
    // that changes the root never moves the action between histories.
    default:
      return operation.projectId;
  }
};

/** The subject an action is about, for a receipt lookup or a refusal sentence. */
export const operationSubjectOf = (operation: UndoOperation): string => {
  switch (operation.type) {
    case 'section.remove':
    case 'section.add':
      return operation.section.id;
    case 'section.move':
    case 'section.update':
      return operation.sectionId;
    case 'task.add':
      return operation.task.id;
    case 'task.update':
    case 'task.archive':
    case 'task.restore':
      return operation.taskId;
    case 'reflection.add':
      return operation.reflection.id;
    case 'reflection.update':
    case 'reflection.archive':
    case 'reflection.restore':
      return operation.reflectionId;
    case 'section.restore':
      return operation.sectionId;
    case 'shortcut.add':
    case 'shortcut.remove':
      return operation.shortcut.id;
    case 'shortcut.update':
    case 'shortcut.move':
      return operation.shortcutId;
    case 'page.add':
      return operation.page.id;
    case 'page.update':
      return operation.pageId;
    default:
      return operation.projectId;
  }
};

/**
 * A repeat remove can recover the removal receipt while it is still the exact actor's applied,
 * unexpired action for this section and no later removal has advanced the section's generation.
 */
export const SectionAlreadyRemovedDetailsSchema = z.strictObject({
  reason: z.literal('section_already_removed'),
  sectionId: SectionIdSchema,
  operation: OperationReceiptSchema,
});
export type SectionAlreadyRemovedDetails = z.infer<typeof SectionAlreadyRemovedDetailsSchema>;

/**
 * `DELETE /api/sections/:id` and `remove_section`: the final archived-shaped removal result and
 * its receipt. A disposable deleted section appears here as a result snapshot, not as a claim
 * that the section is still stored.
 *
 * `archiveListed` is the removal's own answer to "will the person find this in Archive?" — the
 * domain's `sectionRecoveryOf` verdict, not a re-derivation a caller could get wrong. It is
 * **not** the same as being retained: a section kept only because a shortcut or an archived row
 * still names it holds nothing recoverable, so it stays out of Archive while remaining stored.
 * Surfaces offer an Archive route on this field rather than on the operation being a removal,
 * which is what stopped the canvas sending someone to a page with no entry for their section
 * (`note-2026-09-15-006`).
 */
export const SectionRemovalResultSchema = z.object({
  section: ProjectSectionSchema,
  operation: OperationReceiptSchema,
  archiveListed: z.boolean(),
});
export type SectionRemovalResult = z.infer<typeof SectionRemovalResultSchema>;

/** `POST /api/projects/:projectId/sections`: the created section and its add receipt. */
export const SectionAddResultSchema = z.object({
  section: ProjectSectionSchema,
  operation: OperationReceiptSchema,
});
export type SectionAddResult = z.infer<typeof SectionAddResultSchema>;

/** `PATCH` and section move: the updated section and a receipt, or `null` for a true no-op. */
export const SectionWriteResultSchema = z.object({
  section: ProjectSectionSchema,
  operation: OperationReceiptSchema.nullable(),
});
export type SectionWriteResult = z.infer<typeof SectionWriteResultSchema>;

/** A completed removal Undo. `partial` means it used the canonical fallback page. */
export const SectionRemovalUndoResultSchema = z.object({
  operation: z.enum(['section.remove']),
  outcome: z.enum(['restored', 'partial']),
  section: ProjectSectionSchema,
  placement: TransitionPlacementSchema.extend({ strategy: z.enum(['previous', 'next', 'index', 'fallback-page']) }),
  restoredRowCount: z.number().int().min(0),
});
export type SectionRemovalUndoResult = z.infer<typeof SectionRemovalUndoResultSchema>;

/** A completed add Undo removes the created section and has no live section to return. */
export const SectionAddUndoResultSchema = z.object({
  operation: z.literal('section.add'),
  outcome: z.literal('removed'),
  sectionId: SectionIdSchema,
  projectId: ProjectIdSchema,
  pageId: ProjectPageIdSchema,
});
export type SectionAddUndoResult = z.infer<typeof SectionAddUndoResultSchema>;

/**
 * A completed move Undo returns the section and the placement rule used. `partial` means neither
 * recorded neighbour survived, so the recorded index decided — Slice 34's deterministic fallback.
 */
export const SectionMoveUndoResultSchema = z.object({
  operation: z.literal('section.move'),
  outcome: z.enum(['restored', 'partial']),
  section: ProjectSectionSchema,
  placement: TransitionPlacementSchema,
});
export type SectionMoveUndoResult = z.infer<typeof SectionMoveUndoResultSchema>;

/** A completed settings Undo returns the section with untouched fields preserved. */
export const SectionUpdateUndoResultSchema = z.object({
  operation: z.literal('section.update'),
  outcome: z.literal('restored'),
  section: ProjectSectionSchema,
});
export type SectionUpdateUndoResult = z.infer<typeof SectionUpdateUndoResultSchema>;

/** A completed Undo, discriminated by the operation it reversed. */
export const UndoResultSchema = z.discriminatedUnion('operation', [
  SectionRemovalUndoResultSchema,
  SectionAddUndoResultSchema,
  SectionMoveUndoResultSchema,
  SectionUpdateUndoResultSchema,
  SectionRestoreUndoResultSchema,
  ...ROW_UNDO_RESULT_SCHEMAS,
  ...SHORTCUT_UNDO_RESULT_SCHEMAS,
  ...PAGE_UNDO_RESULT_SCHEMAS,
  ...PROJECT_UNDO_RESULT_SCHEMAS,
]);
export type UndoResult = z.infer<typeof UndoResultSchema>;

/** A completed removal Redo: the section as the removal left it, archived or deleted again. */
export const SectionRemovalRedoResultSchema = z.object({
  operation: z.literal('section.remove'),
  outcome: z.literal('removed'),
  section: ProjectSectionSchema,
  disposition: SectionRemovalDispositionSchema,
  settledRowCount: z.number().int().min(0),
});
export type SectionRemovalRedoResult = z.infer<typeof SectionRemovalRedoResultSchema>;

/** A completed add Redo: the same section id, back at its recorded placement. */
export const SectionAddRedoResultSchema = z.object({
  operation: z.literal('section.add'),
  outcome: z.enum(['reapplied', 'partial']),
  section: ProjectSectionSchema,
  placement: TransitionPlacementSchema,
});
export type SectionAddRedoResult = z.infer<typeof SectionAddRedoResultSchema>;

/** A completed move Redo: the section at `placementAfter`, or its index when both neighbours went. */
export const SectionMoveRedoResultSchema = z.object({
  operation: z.literal('section.move'),
  outcome: z.enum(['reapplied', 'partial']),
  section: ProjectSectionSchema,
  placement: TransitionPlacementSchema,
});
export type SectionMoveRedoResult = z.infer<typeof SectionMoveRedoResultSchema>;

/** A completed settings Redo: the recorded `after` values written back, other fields untouched. */
export const SectionUpdateRedoResultSchema = z.object({
  operation: z.literal('section.update'),
  outcome: z.literal('reapplied'),
  section: ProjectSectionSchema,
});
export type SectionUpdateRedoResult = z.infer<typeof SectionUpdateRedoResultSchema>;

/** A completed Redo, discriminated by the operation it reapplied. */
export const RedoResultSchema = z.discriminatedUnion('operation', [
  SectionRemovalRedoResultSchema,
  SectionAddRedoResultSchema,
  SectionMoveRedoResultSchema,
  SectionUpdateRedoResultSchema,
  SectionRestoreRedoResultSchema,
  ...ROW_REDO_RESULT_SCHEMAS,
  ...SHORTCUT_REDO_RESULT_SCHEMAS,
  ...PAGE_REDO_RESULT_SCHEMAS,
  ...PROJECT_REDO_RESULT_SCHEMAS,
]);
export type RedoResult = z.infer<typeof RedoResultSchema>;

/** What changed since the operation, for one entity, that makes executing its transition unsafe. */
export const UndoConflictProblemSchema = z.enum([
  'missing',
  'not-archived',
  'archived-differently',
  /** Redo of an add only: a section already holds the recorded id. */
  'already-exists',
  'moved',
  'page-changed',
  'field-changed',
  'archived-subject',
  'shortcut-reference',
  'archive-state-changed',
  'reparented',
  'new-dependent',
]);
export type UndoConflictProblem = z.infer<typeof UndoConflictProblemSchema>;

/**
 * Server-selected repair guidance; the UI renders this field and never parses refusal text.
 * There is no "use the later receipt" step any more: under a cursor, the caller's own later
 * action is reached by undoing it first, which `history_not_next` already says, so a conflict
 * only ever describes a change that is not in the caller's history.
 */
export const UndoConflictNextStepSchema = z.enum([
  'move-back-and-retry',
  'restore-state-and-retry',
  'restore-or-move-dependent-and-retry',
  'remove-reference-and-retry',
  /** The later change is not in the caller's history, so making the change by hand is the repair. */
  'change-by-hand',
  /** As above, and Archive may still hold retained content. */
  'change-by-hand-or-archive',
  'nothing-to-undo',
  'nothing-to-restore',
]);
export type UndoConflictNextStep = z.infer<typeof UndoConflictNextStepSchema>;

/** One entity a transition would have overwritten, and how it changed. */
export const UndoConflictSchema = z
  .strictObject({
    entityType: z.enum(['section', 'task', 'reflection', 'shortcut', 'page', 'project']),
    id: z.string().min(1),
    /** The current display name, omitted when the entity no longer exists. */
    title: z.string().min(1).optional(),
    problem: UndoConflictProblemSchema,
    nextStep: UndoConflictNextStepSchema,
  })
  .superRefine((conflict, ctx) => {
    if (conflict.problem === 'missing' && conflict.title !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'a missing entity has no current title' });
    }
  });
export type UndoConflict = z.infer<typeof UndoConflictSchema>;
