import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import {
  ProjectIdSchema,
  ReflectionIdSchema,
  SectionIdSchema,
  TaskIdSchema,
} from './ids';
import {
  assertRowsAreDistinct,
  PlacementSnapshotSchema,
  TransitionPlacementSchema,
  UndoRowChangeSchema,
} from './history-placement';
import { OperationReceiptSchema } from './operation-receipt';
import { ReflectionSchema, ReflectionSubjectSchema } from './reflection';
import { ProjectSectionSchema } from './section';
import { TaskPrioritySchema, TaskSchema, TaskStatusSchema } from './task';

/**
 * **Task and reflection operation payloads** (Slice 36, main §§31, 33–34, 36): the captured
 * footprint of one successful committed row write, held by an operation-history action beside
 * the canonical rows it reverses and reapplies.
 *
 * Every payload is typed and versioned, exactly as the section family is: an unknown `type` or
 * `version` fails parsing rather than executing arbitrary JSON, and no payload is ever exposed
 * through a receipt, a summary, a transition result or a refusal.
 *
 * Three rules shape the whole file.
 *
 * 1. **Field changes and structural changes are separate.** `changes` holds the scalar fields an
 *    edit wrote, so Undo can compare *only* those and preserve an unrelated actor's edit.
 *    `rows` holds the structural footprint — container, parent and archive markers — of every row
 *    the write actually moved or marked, the root included.
 * 2. **A creation captures the complete new entity**, so Redo rebuilds it from stable ids and
 *    captured values rather than replaying a create request.
 * 3. **An implicit container joins the row's own action.** A create that had to add its section
 *    records one action holding both, so Undo removes both and Redo restores both.
 */

/** The section a row write created on the way to writing the row, and where it put it. */
export const CreatedContainerSchema = z
  .strictObject({
    section: ProjectSectionSchema,
    placement: PlacementSnapshotSchema,
  })
  .superRefine((container, ctx) => {
    if (container.section.archivedAt !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['section', 'archivedAt'], message: 'a created container is live' });
    }
    if (container.placement.pageId !== container.section.pageId) {
      ctx.addIssue({ code: 'custom', path: ['placement', 'pageId'], message: 'the placement names the section’s own page' });
    }
  });
export type CreatedContainer = z.infer<typeof CreatedContainerSchema>;

/** A nullable scalar distinguishes "cleared" from "unchanged": absence never reaches a change. */
const nullableText = z.string().min(1).nullable();

/**
 * One typed field footprint for a task edit. `status` and `completedAt` are captured **together**
 * whenever either moves, because §34 stamps and clears the timestamp from the status transition:
 * reversing one without the other would leave a done task with no completion time.
 */
export const TaskFieldChangeSchema = z.discriminatedUnion('field', [
  z.strictObject({ field: z.literal('title'), before: z.string().min(1), after: z.string().min(1) }),
  z.strictObject({ field: z.literal('description'), before: nullableText, after: nullableText }),
  z.strictObject({ field: z.literal('status'), before: TaskStatusSchema, after: TaskStatusSchema }),
  z.strictObject({ field: z.literal('completedAt'), before: IsoDateTimeSchema.nullable(), after: IsoDateTimeSchema.nullable() }),
  z.strictObject({ field: z.literal('priority'), before: TaskPrioritySchema, after: TaskPrioritySchema }),
  z.strictObject({ field: z.literal('estimate'), before: z.number().positive().nullable(), after: z.number().positive().nullable() }),
  z.strictObject({ field: z.literal('startAt'), before: IsoDateTimeSchema.nullable(), after: IsoDateTimeSchema.nullable() }),
  z.strictObject({ field: z.literal('dueAt'), before: IsoDateTimeSchema.nullable(), after: IsoDateTimeSchema.nullable() }),
]);
export type TaskFieldChange = z.infer<typeof TaskFieldChangeSchema>;

/** One typed field footprint for a reflection edit. A subject is whole-object, like section config. */
export const ReflectionFieldChangeSchema = z.discriminatedUnion('field', [
  z.strictObject({ field: z.literal('title'), before: nullableText, after: nullableText }),
  z.strictObject({ field: z.literal('body'), before: z.string().min(1), after: z.string().min(1) }),
  z.strictObject({ field: z.literal('prompt'), before: nullableText, after: nullableText }),
  z.strictObject({ field: z.literal('subject'), before: ReflectionSubjectSchema.nullable(), after: ReflectionSubjectSchema.nullable() }),
]);
export type ReflectionFieldChange = z.infer<typeof ReflectionFieldChangeSchema>;

/** Rejects a duplicate field in a captured edit, so a payload cannot say two things about one field. */
const assertFieldsAreDistinct = (
  changes: readonly { field: string }[],
  ctx: z.RefinementCtx,
): void => {
  const seen = new Set<string>();
  for (const [index, change] of changes.entries()) {
    if (seen.has(change.field)) {
      ctx.addIssue({ code: 'custom', path: ['changes', index, 'field'], message: 'a field is recorded once' });
    }
    seen.add(change.field);
  }
};

/** Rejects a payload whose `changes` say nothing actually changed. */
const assertChangesAreReal = (
  changes: readonly { field: string; before: unknown; after: unknown }[],
  ctx: z.RefinementCtx,
): void => {
  for (const [index, change] of changes.entries()) {
    if (JSON.stringify(change.before) === JSON.stringify(change.after)) {
      ctx.addIssue({ code: 'custom', path: ['changes', index], message: 'a recorded field actually changed' });
    }
  }
};

/**
 * `task.add`, version 1: the complete created task and, when the create had to make one, the
 * container it created. Undo deletes exactly those; Redo recreates them with the same ids.
 */
export const TaskAddOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('task.add'),
    task: TaskSchema,
    container: CreatedContainerSchema.optional(),
  })
  .superRefine((operation, ctx) => {
    if (operation.task.archivedAt !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['task', 'archivedAt'], message: 'a created task is live' });
    }
    if (operation.container !== undefined) {
      if (operation.container.section.id !== operation.task.sectionId) {
        ctx.addIssue({ code: 'custom', path: ['container', 'section', 'id'], message: 'the created container holds the created task' });
      }
      if (operation.container.section.projectId !== operation.task.projectId) {
        ctx.addIssue({ code: 'custom', path: ['container', 'section', 'projectId'], message: 'the created container is in the task’s project' });
      }
    }
  });
export type TaskAddOperation = z.infer<typeof TaskAddOperationSchema>;

/**
 * `task.update`, version 1 — every committed edit, completion, move and reparent.
 *
 * `changes` are the scalar fields the write actually changed; `rows` is the structural footprint
 * it wrote, which for a move or a reparent includes the root and the descendants that followed
 * it, archived ones included. A pure field edit has an empty `rows`; a pure move has empty
 * `changes`. Both empty would be a no-op, which records nothing at all.
 */
export const TaskUpdateOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('task.update'),
    taskId: TaskIdSchema,
    projectId: ProjectIdSchema,
    /** `Completed` when the edit crossed into `done`; the label and the verb come from it. */
    completion: z.boolean(),
    changes: z.array(TaskFieldChangeSchema),
    rows: z.array(UndoRowChangeSchema),
  })
  .superRefine((operation, ctx) => {
    assertFieldsAreDistinct(operation.changes, ctx);
    assertChangesAreReal(operation.changes, ctx);
    assertRowsAreDistinct(operation.rows, ctx);
    if (operation.changes.length === 0 && operation.rows.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['changes'], message: 'an update records at least one change' });
    }
    for (const [index, row] of operation.rows.entries()) {
      if (row.kind !== 'task') ctx.addIssue({ code: 'custom', path: ['rows', index, 'kind'], message: 'a task update moves tasks' });
    }
    const statusChange = operation.changes.some((change) => change.field === 'status');
    const completedAtChange = operation.changes.some((change) => change.field === 'completedAt');
    if (operation.completion && !(statusChange && completedAtChange)) {
      ctx.addIssue({ code: 'custom', path: ['completion'], message: 'a completion records both status and completedAt' });
    }
  });
export type TaskUpdateOperation = z.infer<typeof TaskUpdateOperationSchema>;

/**
 * `task.archive` and `task.restore`, version 1: exactly the rows the transition wrote — the root
 * first, then the descendants the cascade actually touched. A descendant that was already
 * archived is absent, because archiving left it alone.
 */
const rowTransitionShape = {
  version: z.literal(1),
  taskId: TaskIdSchema,
  projectId: ProjectIdSchema,
  rows: z.array(UndoRowChangeSchema).min(1),
};

const assertTaskRows = (
  operation: { taskId: string; rows: readonly z.infer<typeof UndoRowChangeSchema>[] },
  ctx: z.RefinementCtx,
): void => {
  assertRowsAreDistinct(operation.rows, ctx);
  for (const [index, row] of operation.rows.entries()) {
    if (row.kind !== 'task') ctx.addIssue({ code: 'custom', path: ['rows', index, 'kind'], message: 'a task transition writes tasks' });
  }
  if (operation.rows[0]?.id !== operation.taskId) {
    ctx.addIssue({ code: 'custom', path: ['rows', 0, 'id'], message: 'the subject row is recorded first' });
  }
};

export const TaskArchiveOperationSchema = z
  .strictObject({ ...rowTransitionShape, type: z.literal('task.archive') })
  .superRefine(assertTaskRows);
export type TaskArchiveOperation = z.infer<typeof TaskArchiveOperationSchema>;

export const TaskRestoreOperationSchema = z
  .strictObject({ ...rowTransitionShape, type: z.literal('task.restore') })
  .superRefine(assertTaskRows);
export type TaskRestoreOperation = z.infer<typeof TaskRestoreOperationSchema>;

/** `reflection.add`, version 1 — the complete reflection and any container the create made. */
export const ReflectionAddOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('reflection.add'),
    reflection: ReflectionSchema,
    container: CreatedContainerSchema.optional(),
  })
  .superRefine((operation, ctx) => {
    if (operation.reflection.archivedAt !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['reflection', 'archivedAt'], message: 'a created reflection is live' });
    }
    if (operation.container !== undefined) {
      if (operation.container.section.id !== operation.reflection.sectionId) {
        ctx.addIssue({ code: 'custom', path: ['container', 'section', 'id'], message: 'the created container holds the created reflection' });
      }
      if (operation.container.section.projectId !== operation.reflection.projectId) {
        ctx.addIssue({ code: 'custom', path: ['container', 'section', 'projectId'], message: 'the created container is in the reflection’s project' });
      }
    }
  });
export type ReflectionAddOperation = z.infer<typeof ReflectionAddOperationSchema>;

/** `reflection.update`, version 1 — the fields one edit wrote. A reflection never moves here (§36). */
export const ReflectionUpdateOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('reflection.update'),
    reflectionId: ReflectionIdSchema,
    projectId: ProjectIdSchema,
    changes: z.array(ReflectionFieldChangeSchema).min(1),
  })
  .superRefine((operation, ctx) => {
    assertFieldsAreDistinct(operation.changes, ctx);
    assertChangesAreReal(operation.changes, ctx);
  });
export type ReflectionUpdateOperation = z.infer<typeof ReflectionUpdateOperationSchema>;

const reflectionTransitionShape = {
  version: z.literal(1),
  reflectionId: ReflectionIdSchema,
  projectId: ProjectIdSchema,
  rows: z.array(UndoRowChangeSchema).length(1),
};

const assertReflectionRows = (
  operation: { reflectionId: string; rows: readonly z.infer<typeof UndoRowChangeSchema>[] },
  ctx: z.RefinementCtx,
): void => {
  const row = operation.rows[0];
  if (row === undefined) return;
  if (row.kind !== 'reflection') {
    ctx.addIssue({ code: 'custom', path: ['rows', 0, 'kind'], message: 'a reflection transition writes a reflection' });
  } else if (row.id !== operation.reflectionId) {
    ctx.addIssue({ code: 'custom', path: ['rows', 0, 'id'], message: 'the recorded row is the subject' });
  }
};

export const ReflectionArchiveOperationSchema = z
  .strictObject({ ...reflectionTransitionShape, type: z.literal('reflection.archive') })
  .superRefine(assertReflectionRows);
export type ReflectionArchiveOperation = z.infer<typeof ReflectionArchiveOperationSchema>;

export const ReflectionRestoreOperationSchema = z
  .strictObject({ ...reflectionTransitionShape, type: z.literal('reflection.restore') })
  .superRefine(assertReflectionRows);
export type ReflectionRestoreOperation = z.infer<typeof ReflectionRestoreOperationSchema>;

/** Every row operation a history action can hold. */
export const RowUndoOperationSchema = z.discriminatedUnion('type', [
  TaskAddOperationSchema,
  TaskUpdateOperationSchema,
  TaskArchiveOperationSchema,
  TaskRestoreOperationSchema,
  ReflectionAddOperationSchema,
  ReflectionUpdateOperationSchema,
  ReflectionArchiveOperationSchema,
  ReflectionRestoreOperationSchema,
]);
export type RowUndoOperation = z.infer<typeof RowUndoOperationSchema>;
export type RowUndoOperationType = RowUndoOperation['type'];

/**
 * The write contracts. Every committed row write answers `{ entity, operation }`: a create
 * always carries its receipt, and an update, completion, archive or restore carries `null`
 * when normalization made it a no-op — the same shape `SectionWriteResult` already uses, so
 * callers have one rule for "did that record something?".
 */
export const TaskAddResultSchema = z.object({ task: TaskSchema, operation: OperationReceiptSchema });
export type TaskAddResult = z.infer<typeof TaskAddResultSchema>;

export const TaskWriteResultSchema = z.object({ task: TaskSchema, operation: OperationReceiptSchema.nullable() });
export type TaskWriteResult = z.infer<typeof TaskWriteResultSchema>;

export const ReflectionAddResultSchema = z.object({ reflection: ReflectionSchema, operation: OperationReceiptSchema });
export type ReflectionAddResult = z.infer<typeof ReflectionAddResultSchema>;

export const ReflectionWriteResultSchema = z.object({
  reflection: ReflectionSchema,
  operation: OperationReceiptSchema.nullable(),
});
export type ReflectionWriteResult = z.infer<typeof ReflectionWriteResultSchema>;

/** The container an add Undo removed or an add Redo restored, when the add created one. */
const RestoredContainerResultSchema = z.object({
  section: ProjectSectionSchema,
  placement: TransitionPlacementSchema,
});

/**
 * Undo of `task.add`: the row and any implicit container are gone, so there is **no live entity
 * to return**. It reports the ids it removed rather than a snapshot that would read as current.
 */
export const TaskAddUndoResultSchema = z.object({
  operation: z.literal('task.add'),
  outcome: z.literal('removed'),
  taskId: TaskIdSchema,
  projectId: ProjectIdSchema,
  /** Present when the add created its container and this Undo removed it too. */
  removedSectionId: SectionIdSchema.optional(),
});
export type TaskAddUndoResult = z.infer<typeof TaskAddUndoResultSchema>;

/** Redo of `task.add`: the same ids back, with the container restored first when there was one. */
export const TaskAddRedoResultSchema = z.object({
  operation: z.literal('task.add'),
  outcome: z.enum(['reapplied', 'partial']),
  task: TaskSchema,
  container: RestoredContainerResultSchema.optional(),
});
export type TaskAddRedoResult = z.infer<typeof TaskAddRedoResultSchema>;

/** Every non-creation task transition answers the current row and the rows it wrote. */
const taskTransitionResult = <T extends 'task.update' | 'task.archive' | 'task.restore', O extends string>(
  operation: T,
  outcome: O,
) =>
  z.object({
    operation: z.literal(operation),
    outcome: z.literal(outcome),
    task: TaskSchema,
    affectedTaskIds: z.array(TaskIdSchema),
  });

export const TaskUpdateUndoResultSchema = taskTransitionResult('task.update', 'restored');
export const TaskUpdateRedoResultSchema = taskTransitionResult('task.update', 'reapplied');
export const TaskArchiveUndoResultSchema = taskTransitionResult('task.archive', 'restored');
export const TaskArchiveRedoResultSchema = taskTransitionResult('task.archive', 'reapplied');
export const TaskRestoreUndoResultSchema = taskTransitionResult('task.restore', 'restored');
export const TaskRestoreRedoResultSchema = taskTransitionResult('task.restore', 'reapplied');

/** Undo of `reflection.add`: the created reflection and any implicit container are gone. */
export const ReflectionAddUndoResultSchema = z.object({
  operation: z.literal('reflection.add'),
  outcome: z.literal('removed'),
  reflectionId: ReflectionIdSchema,
  projectId: ProjectIdSchema,
  removedSectionId: SectionIdSchema.optional(),
});
export type ReflectionAddUndoResult = z.infer<typeof ReflectionAddUndoResultSchema>;

export const ReflectionAddRedoResultSchema = z.object({
  operation: z.literal('reflection.add'),
  outcome: z.enum(['reapplied', 'partial']),
  reflection: ReflectionSchema,
  container: RestoredContainerResultSchema.optional(),
});
export type ReflectionAddRedoResult = z.infer<typeof ReflectionAddRedoResultSchema>;

const reflectionTransitionResult = <
  T extends 'reflection.update' | 'reflection.archive' | 'reflection.restore',
  O extends string,
>(
  operation: T,
  outcome: O,
) =>
  z.object({
    operation: z.literal(operation),
    outcome: z.literal(outcome),
    reflection: ReflectionSchema,
  });

export const ReflectionUpdateUndoResultSchema = reflectionTransitionResult('reflection.update', 'restored');
export const ReflectionUpdateRedoResultSchema = reflectionTransitionResult('reflection.update', 'reapplied');
export const ReflectionArchiveUndoResultSchema = reflectionTransitionResult('reflection.archive', 'restored');
export const ReflectionArchiveRedoResultSchema = reflectionTransitionResult('reflection.archive', 'reapplied');
export const ReflectionRestoreUndoResultSchema = reflectionTransitionResult('reflection.restore', 'restored');
export const ReflectionRestoreRedoResultSchema = reflectionTransitionResult('reflection.restore', 'reapplied');

/** The eight row members of `UndoResultSchema`, in operation order. */
export const ROW_UNDO_RESULT_SCHEMAS = [
  TaskAddUndoResultSchema,
  TaskUpdateUndoResultSchema,
  TaskArchiveUndoResultSchema,
  TaskRestoreUndoResultSchema,
  ReflectionAddUndoResultSchema,
  ReflectionUpdateUndoResultSchema,
  ReflectionArchiveUndoResultSchema,
  ReflectionRestoreUndoResultSchema,
] as const;

/** The eight row members of `RedoResultSchema`, in the same order. */
export const ROW_REDO_RESULT_SCHEMAS = [
  TaskAddRedoResultSchema,
  TaskUpdateRedoResultSchema,
  TaskArchiveRedoResultSchema,
  TaskRestoreRedoResultSchema,
  ReflectionAddRedoResultSchema,
  ReflectionUpdateRedoResultSchema,
  ReflectionArchiveRedoResultSchema,
  ReflectionRestoreRedoResultSchema,
] as const;
