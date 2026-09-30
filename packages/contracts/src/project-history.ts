import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema } from './common';
import { ProjectIdSchema } from './ids';
import { ProjectPageSchema, canonicalPageKindFor } from './project-page';
import { ProgressFormulaSchema, ProjectLayoutModeSchema, ProjectSchema, ProjectStatusSchema } from './project';

/**
 * **Project operation payloads** (main §§26, 31, 39): creation and the three existing-project
 * writes, held by an operation-history action in the **subject project's own** history
 * (docs/decisions/2026-09-project-creation-history.md,
 * docs/decisions/2026-09-project-update-operation-history.md).
 *
 * `project.add` captures the new project and its canonical page as one action. Its Undo removes
 * the pair only while the project is still untouched; Redo recreates both with their original ids.
 *
 * The existing-project payloads capture the footprint of one committed `ProjectService.update`
 * or `archive`.
 *
 * One service path writes name, description, icon, target date, status, parent, layout and progress
 * settings, and archive calls the same commit, so one shape covers all of them. The `type` only says
 * which way the status crossed the archive boundary — `project.archive` into it, `project.reactivate`
 * out of it, `project.update` for everything else, completion, reopening and reparenting included —
 * because those two transitions are the ones the history executor lets run while the subject itself
 * is archived, and a label must say which one a step is.
 *
 */

/** A cleared optional field is `null`, so a change can say "there was a value, now there is none". */
const optionalText = z.string().nullable();

/**
 * One typed field footprint. `status` and `completedAt` are separate fields recorded exactly as the
 * commit moved them. The service derives the timestamp from the status, but not always in step:
 * `archive()` keeps a completed project's time while a later ordinary edit clears it, and a
 * completion at a frozen clock can re-stamp the time already stored. So either may appear without
 * the other, and Undo writes each back exactly — never a regenerated time.
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

/** The footprint rules every project payload shares: each field once, and each one really moved. */
const assertFootprint = (changes: Changes, ctx: z.RefinementCtx): void => {
  const seen = new Set<string>();
  for (const [index, change] of changes.entries()) {
    if (seen.has(change.field)) ctx.addIssue({ code: 'custom', path: ['changes', index, 'field'], message: 'a field is recorded once' });
    seen.add(change.field);
    if (JSON.stringify(change.before) === JSON.stringify(change.after)) {
      ctx.addIssue({ code: 'custom', path: ['changes', index], message: 'a recorded field actually changed' });
    }
  }
};

const projectShape = {
  version: z.literal(1),
  /** The subject, and the project whose history owns this action — never its root. */
  projectId: ProjectIdSchema,
  changes: z.array(ProjectFieldChangeSchema).min(1),
};

/** The creation write: its captured project and canonical page are removed and restored together. */
export const ProjectAddOperationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('project.add'),
    project: ProjectSchema,
    page: ProjectPageSchema,
  })
  .superRefine((operation, ctx) => {
    if (operation.page.projectId !== operation.project.id) {
      ctx.addIssue({ code: 'custom', path: ['page', 'projectId'], message: 'the canonical page belongs to the captured project' });
    }
    if (operation.page.kind !== canonicalPageKindFor(operation.project.kind)) {
      ctx.addIssue({ code: 'custom', path: ['page', 'kind'], message: 'the page is canonical for the captured project kind' });
    }
    if (!operation.page.enabled) {
      ctx.addIssue({ code: 'custom', path: ['page', 'enabled'], message: 'a canonical page is enabled' });
    }
  });
export type ProjectAddOperation = z.infer<typeof ProjectAddOperationSchema>;

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
  ProjectAddOperationSchema,
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

/** Undo of creation has removed the project and canonical page, so it returns the absent id. */
export const ProjectAddUndoResultSchema = z.object({
  operation: z.literal('project.add'),
  outcome: z.literal('removed'),
  projectId: ProjectIdSchema,
});

/** Redo of creation returns the recreated project and its canonical page. */
export const ProjectAddRedoResultSchema = z.object({
  operation: z.literal('project.add'),
  outcome: z.literal('reapplied'),
  project: ProjectSchema,
  page: ProjectPageSchema,
});

/** The four project members of `UndoResultSchema`, in operation order. */
export const PROJECT_UNDO_RESULT_SCHEMAS = [
  ProjectAddUndoResultSchema,
  ProjectUpdateUndoResultSchema,
  ProjectArchiveUndoResultSchema,
  ProjectReactivateUndoResultSchema,
] as const;

/** The four project members of `RedoResultSchema`, in the same order. */
export const PROJECT_REDO_RESULT_SCHEMAS = [
  ProjectAddRedoResultSchema,
  ProjectUpdateRedoResultSchema,
  ProjectArchiveRedoResultSchema,
  ProjectReactivateRedoResultSchema,
] as const;
