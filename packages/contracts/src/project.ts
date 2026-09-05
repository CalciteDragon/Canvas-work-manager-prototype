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

/**
 * §26's two kinds of project. A **root** is a configurable workspace with pages; a
 * **sub-project** is a nestable unit of work with one canvas.
 *
 * This is the discriminator of a real union rather than a label beside an optional
 * `parentProjectId`, because the difference is what each may *hold*. Under a single schema
 * every capability difference is a convention that every call site has to remember; here the
 * parser is what says no. Neither kind converts into the other.
 */
export const ProjectKindSchema = z.enum(['root', 'subproject']);
export type ProjectKind = z.infer<typeof ProjectKindSchema>;

/** Everything both kinds carry. Split out so the two branches cannot drift apart. */
const projectFields = {
  id: ProjectIdSchema,
  workspaceId: WorkspaceIdSchema,

  name: z.string().min(1),
  description: z.string().optional(),
  /** §26's header icon — an emoji in the prototype, not an asset reference. */
  icon: z.string().optional(),

  status: ProjectStatusSchema,
  /**
   * §26 labels this **Due date** on a sub-project. Still date-only, still the same field:
   * relabelling a unit of work's deadline is not a reason to store a second one
   * (docs/decisions/2026-08-task-date-only-due-time.md).
   */
  targetDate: IsoDateSchema.optional(),
  /**
   * When the project's status became `completed`, from the injected `Clock` (§45). Cleared
   * when it leaves that status, so reopening work does not leave a stale finish time behind.
   *
   * On **both** kinds. §26 asks for it on sub-projects, but a root already has a `completed`
   * status, and letting that status mean "and we recorded when" on one kind and not the other
   * would be a worse rule than the one it replaces. It is a timestamp, not a capability.
   */
  completedAt: IsoDateTimeSchema.optional(),
  projectLayoutMode: ProjectLayoutModeSchema,
  progressFormula: ProgressFormulaSchema.default('count'),
  manualProgress: z.number().min(0).max(100).optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
};

/**
 * `parentProjectId` is declared here as *explicitly absent* rather than omitted from the
 * branch. Omitting it would make `project.parentProjectId` a type error on the union at every
 * existing read — the repositories, the ancestor walk, the timeline, the sidebar — none of
 * which this distinction is about. Declared as `undefined`, those reads keep compiling while a
 * root carrying a parent still fails to parse, which is the invariant that matters.
 */
export const RootProjectSchema = z.object({
  ...projectFields,
  kind: z.literal('root'),
  parentProjectId: z.undefined().optional(),
});
export type RootProject = z.infer<typeof RootProjectSchema>;

export const SubprojectSchema = z.object({
  ...projectFields,
  kind: z.literal('subproject'),
  /** Required, and to any depth: a unit of work always belongs to something (§26). */
  parentProjectId: ProjectIdSchema,
});
export type Subproject = z.infer<typeof SubprojectSchema>;

/**
 * No default for `kind`. A version-2 record reaching this parser is a *file to convert*, and
 * guessing its kind here would hide that from whoever has to run `pnpm prototype:upgrade`.
 */
export const ProjectSchema = z.discriminatedUnion('kind', [RootProjectSchema, SubprojectSchema]);
export type Project = z.infer<typeof ProjectSchema>;

export const isRootProject = (project: Project): project is RootProject => project.kind === 'root';
export const isSubproject = (project: Project): project is Subproject => project.kind === 'subproject';
