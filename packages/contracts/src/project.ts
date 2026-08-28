import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema } from './common';
import { ProjectIdSchema, WorkspaceIdSchema } from './ids';

/**
 * A starting set. "What project statuses exist?" is an open question (§83) — these are
 * a guess to be tested, not an answer.
 */
export const ProjectStatusSchema = z.enum(['planning', 'active', 'on_hold', 'completed', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/** The two layouts the prototype compares (§27, §28). Not a third. */
export const ProjectLayoutModeSchema = z.enum(['flow', 'grid']);
export type ProjectLayoutMode = z.infer<typeof ProjectLayoutModeSchema>;

/** §39's deliberately unresolved experiment, persisted once per project. */
export const ProgressFormulaSchema = z.enum(['count', 'weighted', 'manual']);
export type ProgressFormula = z.infer<typeof ProgressFormulaSchema>;

export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  workspaceId: WorkspaceIdSchema,

  /** Set on a sub-project. Whether nesting is worth keeping is a §83 question. */
  parentProjectId: ProjectIdSchema.optional(),

  name: z.string().min(1),
  description: z.string().optional(),
  /** §26's header icon — an emoji in the prototype, not an asset reference. */
  icon: z.string().optional(),

  status: ProjectStatusSchema,
  targetDate: IsoDateSchema.optional(),
  projectLayoutMode: ProjectLayoutModeSchema,
  progressFormula: ProgressFormulaSchema.default('count'),
  manualProgress: z.number().min(0).max(100).optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Project = z.infer<typeof ProjectSchema>;
