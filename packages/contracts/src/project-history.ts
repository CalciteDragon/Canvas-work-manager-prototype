import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema } from './common';
import { ProjectIdSchema } from './ids';
import { ProgressFormulaSchema, ProjectLayoutModeSchema, ProjectSchema, ProjectStatusSchema } from './project';

/**
 * **The three existing-project operation payloads** (Slice 39, main §§26, 31, 39): the captured
 * footprint of one committed `ProjectService.update` or `archive`, held by an operation-history
 * action in the **subject project's own** history
 * (docs/decisions/2026-09-project-update-operation-history.md).
 *
 * One service path writes name, description, icon, target date, status, parent, layout and progress
 * settings, and archive calls the same commit, so one shape covers all of them. The `type` only says
 * which way the status crossed the archive boundary — `project.archive` into it, `project.reactivate`
 * out of it, `project.update` for everything else, completion, reopening and reparenting included —
 * because those two transitions are the ones the history executor lets run while the subject itself
 * is archived, and a label must say which one a step is.
 *
 * Creation is deliberately absent: `create` and its canonical page stay unrecorded until the
 * creation and missing-project recovery phase.
 */

/** A cleared optional field is `null`, so a change can say "there was a value, now there is none". */
const optionalText = z.string().nullable();

/**
 * One typed field footprint. `status` and `completedAt` travel **together** whenever the timestamp
 * moves, because the service derives it from the status: reversing one without the other would
 * leave a completed project with no completion time, or a reopened one still claiming a finish.
 *
 * `parentProjectId` never clears. Only a sub-project records a reparent, and a sub-project always
 * has a parent (§26); a `null` here would describe a conversion to a root no service can perform.
 */
export const ProjectFieldChangeSchema = z.discriminatedUnion('field', [
  z.strictObject({ field: z.literal('name'), before: z.string().min(1), after: z.string().min(1) }),
  z.strictObject({ field: z.literal('description'), before: optionalText, after: optionalText }),
  z.strictObject({ field: z.literal('icon'), before: optionalText, after: optionalText }),
  z.strictObject({ field: z.literal('status'), before: ProjectStatusSchema, after: ProjectStatusSchema }),
  z.strictObject({ field: z.literal('completedAt'), before: IsoDateTimeSchema.nullable(), after: IsoDateTimeSchema.nullable() }),
  z.strictObject({ field: z.literal('targetDate'), before: IsoDateSchema.nullable(), after: IsoDateSchema.nullable() }),
  z.strictObject({ field: z.literal('projectLayoutMode'), before: ProjectLayoutModeSchema, after: ProjectLayoutModeSchema }),
  z.strictObject({ field: z.literal('progressFormula'), before: ProgressFormulaSchema, after: ProgressFormulaSchema }),
  z.strictObject({
    field: z.literal('manualProgress'),
    before: z.number().min(0).max(100).nullable(),
    after: z.number().min(0).max(100).nullable(),
  }),
  z.strictObject({ field: z.literal('parentProjectId'), before: ProjectIdSchema, after: ProjectIdSchema }),
]);
export type ProjectFieldChange = z.infer<typeof ProjectFieldChangeSchema>;
export type ProjectRecordedField = ProjectFieldChange['field'];

type Changes = readonly ProjectFieldChange[];

const statusChangeOf = (changes: Changes) =>
  changes.find((change): change is Extract<ProjectFieldChange, { field: 'status' }> => change.field === 'status');

/** The footprint rules every project payload shares: distinct, real, and a coherent completion pair. */
const assertFootprint = (changes: Changes, ctx: z.RefinementCtx): void => {
  const seen = new Set<string>();
  for (const [index, change] of changes.entries()) {
    if (seen.has(change.field)) ctx.addIssue({ code: 'custom', path: ['changes', index, 'field'], message: 'a field is recorded once' });
    seen.add(change.field);
    if (JSON.stringify(change.before) === JSON.stringify(change.after)) {
      ctx.addIssue({ code: 'custom', path: ['changes', index], message: 'a recorded field actually changed' });
    }
  }
  const status = statusChangeOf(changes);
  if (seen.has('completedAt') && status === undefined) {
    ctx.addIssue({ code: 'custom', path: ['changes'], message: 'a completion time moves only with its status' });
  }
  if (status !== undefined && status.after === 'completed' && !seen.has('completedAt')) {
    ctx.addIssue({ code: 'custom', path: ['changes'], message: 'a completion records its completion time' });
  }
};

const projectShape = {
  version: z.literal(1),
  /** The subject, and the project whose history owns this action — never its root. */
  projectId: ProjectIdSchema,
  changes: z.array(ProjectFieldChangeSchema).min(1),
};

/**
 * `project.update`: every committed change that does not cross the archive boundary.
 *
 * `archivedThroughout` says the subject was archived before **and** after the write. The service
 * permits editing an archived project's metadata and moving it, and without this flag the history
 * executor's archived-project blocker would strand that edit — and every action below it — until
 * someone reactivated the project. It is the only evidence the flag-free footprint cannot carry,
 * because an unchanged status is, by the footprint rule, not recorded.
 */
export const ProjectUpdateOperationSchema = z
  .strictObject({ ...projectShape, type: z.literal('project.update'), archivedThroughout: z.boolean() })
  .superRefine((operation, ctx) => {
    assertFootprint(operation.changes, ctx);
    const status = statusChangeOf(operation.changes);
    if (status !== undefined && (status.before === 'archived' || status.after === 'archived')) {
      ctx.addIssue({ code: 'custom', path: ['changes'], message: 'crossing the archive boundary is an archive or a reactivation' });
    }
    if (operation.archivedThroughout && status !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['archivedThroughout'], message: 'a project archived throughout kept its status' });
    }
  });
export type ProjectUpdateOperation = z.infer<typeof ProjectUpdateOperationSchema>;

/** `project.archive`: the status crossed into `archived`, with whatever else the same write changed. */
export const ProjectArchiveOperationSchema = z
  .strictObject({ ...projectShape, type: z.literal('project.archive') })
  .superRefine((operation, ctx) => {
    assertFootprint(operation.changes, ctx);
    const status = statusChangeOf(operation.changes);
    if (status === undefined || status.after !== 'archived' || status.before === 'archived') {
      ctx.addIssue({ code: 'custom', path: ['changes'], message: 'an archive moves the status into archived' });
    }
  });
export type ProjectArchiveOperation = z.infer<typeof ProjectArchiveOperationSchema>;

/** `project.reactivate`: the status came out of `archived` to the explicit status the caller chose. */
export const ProjectReactivateOperationSchema = z
  .strictObject({ ...projectShape, type: z.literal('project.reactivate') })
  .superRefine((operation, ctx) => {
    assertFootprint(operation.changes, ctx);
    const status = statusChangeOf(operation.changes);
    if (status === undefined || status.before !== 'archived' || status.after === 'archived') {
      ctx.addIssue({ code: 'custom', path: ['changes'], message: 'a reactivation moves the status out of archived' });
    }
  });
export type ProjectReactivateOperation = z.infer<typeof ProjectReactivateOperationSchema>;

/** Every project operation a history action can hold. */
export const ProjectUndoOperationSchema = z.discriminatedUnion('type', [
  ProjectUpdateOperationSchema,
  ProjectArchiveOperationSchema,
  ProjectReactivateOperationSchema,
]);
export type ProjectUndoOperation = z.infer<typeof ProjectUndoOperationSchema>;

/** Every project transition answers the project as the direction left it: it always still exists. */
const projectResult = <T extends ProjectUndoOperation['type'], O extends 'restored' | 'reapplied'>(operation: T, outcome: O) =>
  z.object({ operation: z.literal(operation), outcome: z.literal(outcome), project: ProjectSchema });

export const ProjectUpdateUndoResultSchema = projectResult('project.update', 'restored');
export const ProjectUpdateRedoResultSchema = projectResult('project.update', 'reapplied');
export const ProjectArchiveUndoResultSchema = projectResult('project.archive', 'restored');
export const ProjectArchiveRedoResultSchema = projectResult('project.archive', 'reapplied');
export const ProjectReactivateUndoResultSchema = projectResult('project.reactivate', 'restored');
export const ProjectReactivateRedoResultSchema = projectResult('project.reactivate', 'reapplied');

/** The three project members of `UndoResultSchema`, in operation order. */
export const PROJECT_UNDO_RESULT_SCHEMAS = [
  ProjectUpdateUndoResultSchema,
  ProjectArchiveUndoResultSchema,
  ProjectReactivateUndoResultSchema,
] as const;

/** The three project members of `RedoResultSchema`, in the same order. */
export const PROJECT_REDO_RESULT_SCHEMAS = [
  ProjectUpdateRedoResultSchema,
  ProjectArchiveRedoResultSchema,
  ProjectReactivateRedoResultSchema,
] as const;
