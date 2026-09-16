import { z } from 'zod';
import { ActivityActorSchema, assertActorIsAttributable } from './activity';
import { IsoDateTimeSchema, PositionSchema } from './common';
import {
  AgentConnectionIdSchema,
  ProjectIdSchema,
  ProjectPageIdSchema,
  ReflectionIdSchema,
  SectionIdSchema,
  TaskIdSchema,
  UndoRecordIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from './ids';
import { ownedKindOf, ProjectSectionSchema, SectionColumnSpanSchema, SectionConfigSchema } from './section';

/**
 * **Undo records** (Refactor §§10–13, main §31): one scoped, expiring inverse per successful
 * explicit section operation, stored beside the canonical records it reverses and never inside
 * `ActivityEvent` or a live frame. See docs/decisions/2026-09-section-edit-undo-boundaries.md.
 *
 * The operation union is typed and versioned: an unknown `type` or `version` fails parsing
 * rather than executing arbitrary JSON. Automatic row-container creation and shortcut-only
 * writes deliberately do not produce members here.
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

/**
 * The fields of a task an inverse writes, and therefore the only ones a later edit can
 * conflict with. A title or status edit is not structural and is preserved by Undo.
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

/** One row a removal changed, as it was before and as the removal left it. */
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
 * `disposition` is optional for compatibility with records written before Slice 31; an absent
 * value means the section was retained. New records state whether the section was retained or
 * deleted. Only a recorded deletion allows Undo to recreate a missing section.
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
    disposition: SectionRemovalDispositionSchema.optional(),
    /** The `archivedAt` removal wrote, which Undo compares against to detect a later restore. */
    postSectionArchivedAt: IsoDateTimeSchema,
  })
  .superRefine((operation, ctx) => {
    if (operation.section.archivedAt !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['section', 'archivedAt'], message: 'a removed section was live before removal' });
    }
    if (operation.placement.pageId !== operation.section.pageId) {
      ctx.addIssue({ code: 'custom', path: ['placement', 'pageId'], message: 'the placement names the section’s own page' });
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
    const seen = new Set<string>();
    for (const [index, row] of operation.rows.entries()) {
      if (seen.has(row.id)) ctx.addIssue({ code: 'custom', path: ['rows', index, 'id'], message: 'a row is recorded once' });
      seen.add(row.id);
      if (owned === undefined || row.kind !== ROW_KIND_FOR_OWNED[owned]) {
        ctx.addIssue({ code: 'custom', path: ['rows', index, 'kind'], message: 'a row is of the kind its section owns' });
      }
    }
  });
export type SectionRemoveUndoOperation = z.infer<typeof SectionRemoveUndoOperationSchema>;

/** The inverse of an explicit section add: delete only the created section. */
export const SectionAddUndoOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('section.add'),
    section: ProjectSectionSchema,
  })
  .superRefine((operation, ctx) => {
    if (operation.section.archivedAt !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['section', 'archivedAt'], message: 'an added section is live' });
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

/** Every undoable operation, discriminated by `type`. */
export const UndoOperationSchema = z.discriminatedUnion('type', [
  SectionRemoveUndoOperationSchema,
  SectionAddUndoOperationSchema,
  SectionMoveUndoOperationSchema,
  SectionUpdateUndoOperationSchema,
]);
export type UndoOperation = z.infer<typeof UndoOperationSchema>;
export type UndoOperationType = UndoOperation['type'];

/**
 * One stored record. `sequence` is one more than the highest sequence among the workspace's
 * records and is the **only** order between records: `createdAt` can go backwards when the dev
 * panel sets the clock, ties within an instant, and ids are random.
 */
export const UndoRecordSchema = z
  .object({
    id: UndoRecordIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    actor: ActivityActorSchema,
    actorUserId: UserIdSchema.optional(),
    actorAgentConnectionId: AgentConnectionIdSchema.optional(),
    sequence: z.number().int().positive(),
    label: z.string().min(1),
    createdAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
    consumedAt: IsoDateTimeSchema.optional(),
    operation: UndoOperationSchema,
  })
  .superRefine((record, ctx) => {
    assertActorIsAttributable(record, ctx);
    if (Date.parse(record.expiresAt) <= Date.parse(record.createdAt)) {
      ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'a record expires after it is created' });
    }
  });
export type UndoRecord = z.infer<typeof UndoRecordSchema>;

/** The repository's query shape. */
export const UndoRecordQuerySchema = z.object({ workspaceId: WorkspaceIdSchema.optional() });
export type UndoRecordQuery = z.infer<typeof UndoRecordQuerySchema>;

/**
 * What a caller is handed after a committed explicit section operation: enough to offer and execute Undo, and
 * nothing of the inverse itself — no snapshot, actor or row ids.
 */
export const UndoReceiptSchema = z.strictObject({
  undoId: UndoRecordIdSchema,
  operation: z.enum(['section.remove', 'section.add', 'section.move', 'section.update']),
  /** Workspace-local high-water mark; timestamps are presentation data, not ordering. */
  sequence: z.number().int().positive(),
  label: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
});
export type UndoReceipt = z.infer<typeof UndoReceiptSchema>;

/** A repeat remove can recover only the latest outstanding receipt owned by the exact actor. */
export const SectionAlreadyRemovedDetailsSchema = z.strictObject({
  reason: z.literal('section_already_removed'),
  sectionId: SectionIdSchema,
  undo: UndoReceiptSchema,
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
  undo: UndoReceiptSchema,
  archiveListed: z.boolean(),
});
export type SectionRemovalResult = z.infer<typeof SectionRemovalResultSchema>;

/** `POST /api/projects/:projectId/sections`: the created section and its add Undo receipt. */
export const SectionAddResultSchema = z.object({
  section: ProjectSectionSchema,
  undo: UndoReceiptSchema,
});
export type SectionAddResult = z.infer<typeof SectionAddResultSchema>;

/** `PATCH` and section move: the updated section and a receipt, or `null` for a true no-op. */
export const SectionWriteResultSchema = z.object({
  section: ProjectSectionSchema,
  undo: UndoReceiptSchema.nullable(),
});
export type SectionWriteResult = z.infer<typeof SectionWriteResultSchema>;

/** `POST /api/undo/:id` and `undo_operation`: the receipt id, and nothing a caller could steer. */
export const UndoInputSchema = z.strictObject({ undoId: UndoRecordIdSchema });
export type UndoInput = z.infer<typeof UndoInputSchema>;

/** A completed removal Undo. `partial` means it used the canonical fallback page. */
export const SectionRemovalUndoResultSchema = z.object({
  undoId: UndoRecordIdSchema,
  operation: z.enum(['section.remove']),
  outcome: z.enum(['restored', 'partial']),
  section: ProjectSectionSchema,
  placement: z.object({
    pageId: ProjectPageIdSchema,
    index: PositionSchema,
    strategy: z.enum(['previous', 'next', 'index', 'fallback-page']),
    pageEnabled: z.boolean(),
  }),
  restoredRowCount: z.number().int().min(0),
});
export type SectionRemovalUndoResult = z.infer<typeof SectionRemovalUndoResultSchema>;

/** A completed add Undo removes the created section and has no live section to return. */
export const SectionAddUndoResultSchema = z.object({
  undoId: UndoRecordIdSchema,
  operation: z.literal('section.add'),
  outcome: z.literal('removed'),
  sectionId: SectionIdSchema,
  projectId: ProjectIdSchema,
  pageId: ProjectPageIdSchema,
});
export type SectionAddUndoResult = z.infer<typeof SectionAddUndoResultSchema>;

/** A completed move Undo returns the section and the placement strategy used. */
export const SectionMoveUndoResultSchema = z.object({
  undoId: UndoRecordIdSchema,
  operation: z.literal('section.move'),
  outcome: z.literal('restored'),
  section: ProjectSectionSchema,
  placement: z.object({
    pageId: ProjectPageIdSchema,
    index: PositionSchema,
    strategy: z.enum(['previous', 'next', 'index']),
    pageEnabled: z.boolean(),
  }),
});
export type SectionMoveUndoResult = z.infer<typeof SectionMoveUndoResultSchema>;

/** A completed settings Undo returns the section with untouched fields preserved. */
export const SectionUpdateUndoResultSchema = z.object({
  undoId: UndoRecordIdSchema,
  operation: z.literal('section.update'),
  outcome: z.literal('restored'),
  section: ProjectSectionSchema,
});
export type SectionUpdateUndoResult = z.infer<typeof SectionUpdateUndoResultSchema>;

/** A completed Undo, discriminated by the inverse operation. */
export const UndoResultSchema = z.discriminatedUnion('operation', [
  SectionRemovalUndoResultSchema,
  SectionAddUndoResultSchema,
  SectionMoveUndoResultSchema,
  SectionUpdateUndoResultSchema,
]);
export type UndoResult = z.infer<typeof UndoResultSchema>;

/** What changed since the removal, for one entity, that makes executing its inverse unsafe. */
export const UndoConflictProblemSchema = z.enum([
  'missing',
  'not-archived',
  'archived-differently',
  'superseded',
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

/** Server-selected repair guidance; the UI renders this field and never parses refusal text. */
export const UndoConflictNextStepSchema = z.enum([
  'move-back-and-retry',
  'restore-state-and-retry',
  'restore-or-move-dependent-and-retry',
  'use-later-receipt-or-archive',
  /** Edit operations only: Archive holds nothing an add, move or settings Undo could recover. */
  'use-later-receipt',
  /**
   * The later change belongs to somebody else, so its receipt is not the caller's to use — Undo
   * records are scoped to the exact actor that made them. Redoing the change by hand is the only
   * repair left. The `-or-archive` twin adds the removal case, where Archive may still hold
   * retained content (`note-2026-09-15-005`).
   */
  'redo-by-hand',
  'redo-by-hand-or-archive',
  'remove-reference-and-retry',
  'nothing-to-undo',
  'nothing-to-restore',
]);
export type UndoConflictNextStep = z.infer<typeof UndoConflictNextStepSchema>;

/** One entity Undo would have overwritten, and how it changed. */
export const UndoConflictSchema = z
  .strictObject({
  entityType: z.enum(['section', 'task', 'reflection', 'shortcut']),
  id: z.string().min(1),
  /** The current display name, omitted when the entity no longer exists. */
  title: z.string().min(1).optional(),
  problem: UndoConflictProblemSchema,
  nextStep: UndoConflictNextStepSchema,
  /**
   * Who made the later change, for a `superseded` conflict only. `self` means the caller's own
   * later receipt can repair this; every other value means the receipt belongs to another
   * connection and the caller cannot reach it, which is what `redo-by-hand` says. Surfaces use
   * it to name the other party rather than to decide the repair — `nextStep` already did that.
   */
  supersededBy: z.enum(['self', 'user', 'agent', 'system']).optional(),
})
  .superRefine((conflict, ctx) => {
    if (conflict.problem === 'missing' && conflict.title !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'a missing entity has no current title' });
    }
    if ((conflict.supersededBy !== undefined) !== (conflict.problem === 'superseded')) {
      ctx.addIssue({
        code: 'custom',
        path: ['supersededBy'],
        message: 'a superseding actor is named exactly for a superseded conflict',
      });
    }
  });
export type UndoConflict = z.infer<typeof UndoConflictSchema>;

/**
 * The typed half of an Undo refusal, carried by the 409 envelope's `details`. MCP clients get
 * the message text only, so every refusal message also starts with its `reason` token.
 */
export const UndoRefusalDetailsSchema = z.discriminatedUnion('reason', [
  z.object({ reason: z.literal('undo_consumed'), undoId: UndoRecordIdSchema, consumedAt: IsoDateTimeSchema }),
  z.object({ reason: z.literal('undo_expired'), undoId: UndoRecordIdSchema, expiresAt: IsoDateTimeSchema }),
  z.object({ reason: z.literal('undo_conflict'), undoId: UndoRecordIdSchema, conflicts: z.array(UndoConflictSchema).min(1) }),
  z.object({
    reason: z.literal('undo_blocked'),
    undoId: UndoRecordIdSchema,
    blockingProjectId: ProjectIdSchema,
    blockingProjectTitle: z.string().min(1),
  }),
  z.object({
    reason: z.literal('undo_unavailable'),
    undoId: UndoRecordIdSchema,
    problem: z.enum(['no-compatible-page', 'shortcut-on-fallback-page']),
  }),
]);
export type UndoRefusalDetails = z.infer<typeof UndoRefusalDetailsSchema>;
