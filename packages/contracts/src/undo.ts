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
import { ownedKindOf, ProjectSectionSchema } from './section';

/**
 * **Undo records** (Refactor §§10–13, main §31): one scoped, expiring inverse per successful
 * section removal, stored beside the canonical records it reverses and never inside
 * `ActivityEvent` or a live frame. See docs/decisions/2026-09-section-removal-undo-records.md.
 *
 * Only section removal is undoable so far. The operation union below is the typed, versioned
 * extension point later operation types grow: an unknown `type` or `version` fails parsing
 * rather than executing arbitrary JSON.
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
 * There is deliberately no disposition field: hard deletion does not exist yet. The slice that
 * adds it must add an optional field or a `version: 2` and keep executing retained version-1
 * records.
 */
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

/** Every undoable operation, discriminated by `type`. One member today. */
export const UndoOperationSchema = z.discriminatedUnion('type', [SectionRemoveUndoOperationSchema]);
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
 * What a caller is handed after a committed removal: enough to offer and execute Undo, and
 * nothing of the inverse itself — no snapshot, actor or row ids.
 */
export const UndoReceiptSchema = z.strictObject({
  undoId: UndoRecordIdSchema,
  operation: z.enum(['section.remove']),
  label: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
});
export type UndoReceipt = z.infer<typeof UndoReceiptSchema>;

/** `DELETE /api/sections/:id` and `remove_section`: the archived section and its receipt. */
export const SectionRemovalResultSchema = z.object({
  section: ProjectSectionSchema,
  undo: UndoReceiptSchema,
});
export type SectionRemovalResult = z.infer<typeof SectionRemovalResultSchema>;

/** `POST /api/undo/:id` and `undo_operation`: the receipt id, and nothing a caller could steer. */
export const UndoInputSchema = z.strictObject({ undoId: UndoRecordIdSchema });
export type UndoInput = z.infer<typeof UndoInputSchema>;

/**
 * A completed Undo. `partial` means the section could not return to its original page and was
 * appended to the project's canonical page instead.
 */
export const UndoResultSchema = z.object({
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
export type UndoResult = z.infer<typeof UndoResultSchema>;

/** What changed since the removal, for one entity, that makes executing its inverse unsafe. */
export const UndoConflictProblemSchema = z.enum([
  'missing',
  'not-archived',
  'archived-differently',
  'superseded',
  'moved',
  'archive-state-changed',
  'reparented',
  'new-dependent',
]);
export type UndoConflictProblem = z.infer<typeof UndoConflictProblemSchema>;

/** One entity Undo would have overwritten, and how it changed. */
export const UndoConflictSchema = z.object({
  entityType: z.enum(['section', 'task', 'reflection']),
  id: z.string().min(1),
  problem: UndoConflictProblemSchema,
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
  z.object({ reason: z.literal('undo_blocked'), undoId: UndoRecordIdSchema, blockingProjectId: ProjectIdSchema }),
  z.object({
    reason: z.literal('undo_unavailable'),
    undoId: UndoRecordIdSchema,
    problem: z.enum(['no-compatible-page', 'shortcut-on-fallback-page']),
  }),
]);
export type UndoRefusalDetails = z.infer<typeof UndoRefusalDetailsSchema>;
