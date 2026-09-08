import { z } from 'zod';
import { ActivityActorSchema } from './activity';
import { IsoDateSchema, IsoDateTimeSchema, PositionSchema } from './common';
import { ProjectIdSchema, ProjectPageIdSchema, SectionIdSchema, TaskIdSchema, WorkspaceIdSchema } from './ids';
import { ProgressFormulaSchema, ProjectLayoutModeSchema, ProjectStatusSchema } from './project';
import { ProjectPageKindSchema } from './project-page';
import { ReflectionSubjectSchema } from './reflection';
import { SectionColumnSpanSchema, SectionConfigSchema } from './section';
import { TaskPrioritySchema, TaskStatusSchema } from './task';

/**
 * Write inputs carry only what a caller may set: ids and timestamps come from the domain
 * services and the clock (§45). In updates, `null` means clear and `undefined` means
 * leave alone — §11's `dueAt` example is the pattern.
 */

export const CreateTaskInputSchema = z.object({
  projectId: ProjectIdSchema,
  /**
   * The owning container. Optional on the way in: absent, the service resolves a `task-list`
   * on the page below and adds one when there is none, so an agent that knows nothing about
   * the canvas still produces a project that renders its work.
   */
  sectionId: SectionIdSchema.optional(),
  /**
   * §27's middle case: *"a page supplied — resolve there, but only if that page accepts that
   * kind of data. Otherwise refuse; do not fall back somewhere the caller did not name."*
   * Absent, resolution uses the project's canonical page. Supplied alongside a `sectionId` —
   * or alongside a `parentTaskId`, whose section the subtask inherits — the two must agree;
   * a mismatch is an error rather than a preference order.
   */
  pageId: ProjectPageIdSchema.optional(),
  parentTaskId: TaskIdSchema.optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  estimate: z.number().positive().optional(),
  startAt: IsoDateTimeSchema.nullable().optional(),
  dueAt: IsoDateTimeSchema.nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  estimate: z.number().positive().nullable().optional(),
  projectId: ProjectIdSchema.optional(),
  /** Moving a task between containers. Not nullable: a row is always owned by one. */
  sectionId: SectionIdSchema.optional(),
  parentTaskId: TaskIdSchema.nullable().optional(),
  startAt: IsoDateTimeSchema.nullable().optional(),
  dueAt: IsoDateTimeSchema.nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

/** Settable on either kind. Ids, timestamps and `completedAt` come from the service. */
const createProjectFields = {
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  status: ProjectStatusSchema.optional(),
  targetDate: IsoDateSchema.nullable().optional(),
  projectLayoutMode: ProjectLayoutModeSchema.optional(),
  progressFormula: ProgressFormulaSchema.optional(),
  manualProgress: z.number().min(0).max(100).optional(),
};

/**
 * Creating a workspace and creating a unit of work are **two operations**, not one whose
 * meaning depends on whether a parent happened to be passed (§26, §54). The discriminator is
 * required, so a caller cannot create the wrong thing by omission, and a body whose `kind` and
 * `parentProjectId` contradict each other is rejected by the parser rather than reinterpreted.
 */
/**
 * **Strict**, and that is what carries the rule: a plain `z.object` strips unknown keys, so a
 * root branch that merely omitted `parentProjectId` would parse `{ kind: 'root',
 * parentProjectId }` *successfully* with the parent silently dropped — the exact
 * reinterpretation this union exists to prevent. Strictness makes it an error instead.
 *
 * The storage schema states the same rule as `parentProjectId: z.undefined().optional()`
 * (`project.ts`). It cannot do that here: `z.undefined()` has no JSON Schema representation,
 * and this input is published to agents through `z.toJSONSchema` (§55) — which the tool
 * registry's contract test catches.
 */
export const CreateRootProjectInputSchema = z.strictObject({
  ...createProjectFields,
  kind: z.literal('root'),
});
export type CreateRootProjectInput = z.infer<typeof CreateRootProjectInputSchema>;

/** Strict for the same reason, and so a misspelled field is a refusal rather than a silent drop. */
export const CreateSubprojectInputSchema = z.strictObject({
  ...createProjectFields,
  kind: z.literal('subproject'),
  parentProjectId: ProjectIdSchema,
});
export type CreateSubprojectInput = z.infer<typeof CreateSubprojectInputSchema>;

export const CreateProjectInputSchema = z.discriminatedUnion('kind', [
  CreateRootProjectInputSchema,
  CreateSubprojectInputSchema,
]);
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  status: ProjectStatusSchema.optional(),
  targetDate: IsoDateSchema.nullable().optional(),
  projectLayoutMode: ProjectLayoutModeSchema.optional(),
  progressFormula: ProgressFormulaSchema.optional(),
  manualProgress: z.number().min(0).max(100).nullable().optional(),
  /**
   * Reparenting a sub-project. **Not nullable**: clearing it used to promote a sub-project to
   * a root, and root/sub-project conversion is not a thing the model allows any more (§26) —
   * the two kinds hold different things. A `null` here would have surfaced as a raw parse
   * failure deep in the service rather than as a refusal, so the input stops expressing it.
   *
   * `kind` is absent for the same reason: it is immutable, and an update input that accepted
   * it would be describing an operation that does not exist.
   */
  parentProjectId: ProjectIdSchema.optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

/**
 * §31's frame affordances, as writes. `projectId` is not a member of either input: it
 * comes from the route the section is created under, and a section never moves between
 * projects (§30 makes a section a property of its project's canvas).
 *
 * `config` is replaced whole rather than merged — the section definition owns its keys
 * (§29), so this package has no basis for deciding which of them a partial write meant to
 * keep. Absence means leave alone; there is no "clear", because an absent config and an
 * empty one are not different states.
 */
/**
 * One normalisation for every name a caller can write — a person through the frame, HTTP,
 * or `create_section`/`update_section` over MCP. Trimmed before the length check, so a
 * whitespace-only name is a refusal rather than a stored blank the canvas renders as nothing.
 */
export const SectionTitleSchema = z.string().trim().min(1);

export const CreateSectionInputSchema = z.object({
  /** A `SECTION_REGISTRY` key (§29). Open, for the same reason `ProjectSection.type` is. */
  type: z.string().min(1),
  /**
   * The page to add it to. Absent, the service resolves the project's canonical page — Home for
   * a root, the sole canvas for a sub-project (§27).
   *
   * Named, it must belong to the same project, hold sections *of this type* — a Reflections page
   * takes only a reflections container (§30) — and be enabled, because no write places content
   * behind navigation that is off. Each of those is a refusal rather than a fallback: §27 is
   * explicit that a write must not land somewhere the caller did not name.
   */
  pageId: ProjectPageIdSchema.optional(),
  title: SectionTitleSchema.optional(),
  columnSpan: SectionColumnSpanSchema.optional(),
  config: SectionConfigSchema.optional(),
});
export type CreateSectionInput = z.infer<typeof CreateSectionInputSchema>;

export const UpdateSectionInputSchema = z.object({
  /** Nullable because the title is an *override* — clearing it falls back to the default. */
  title: SectionTitleSchema.nullable().optional(),
  columnSpan: SectionColumnSpanSchema.optional(),
  collapsed: z.boolean().optional(),
  config: SectionConfigSchema.optional(),
});
export type UpdateSectionInput = z.infer<typeof UpdateSectionInputSchema>;

/**
 * Removing a section archives it — every section, container or view. A container that
 * still holds **live** rows takes a policy rather than a confirmation alone: `cascade`
 * archives the section and those rows together, `reassign` moves the rows to another
 * container of the same type and archives the emptied section. Absent, the service raises
 * with the live row count so the caller can offer the choice rather than guess. A view, an
 * empty container, and a container holding only already-archived rows need no policy —
 * there are no rows to settle, so there is no question to ask.
 */
export const RemoveSectionInputSchema = z.object({
  policy: z.enum(['cascade', 'reassign']).optional(),
  reassignToSectionId: SectionIdSchema.optional(),
});
export type RemoveSectionInput = z.infer<typeof RemoveSectionInputSchema>;

/** Reordering is its own operation: it renumbers siblings, which a field patch cannot. */
export const MoveSectionInputSchema = z.object({
  position: PositionSchema,
});
export type MoveSectionInput = z.infer<typeof MoveSectionInputSchema>;

/** §27: a shortcut input names its destination page and canonical source section only. */
export const CreateSectionShortcutInputSchema = z.strictObject({
  pageId: ProjectPageIdSchema,
  sourceSectionId: SectionIdSchema,
  columnSpan: SectionColumnSpanSchema.optional(),
});
export type CreateSectionShortcutInput = z.infer<typeof CreateSectionShortcutInputSchema>;

/** A shortcut's layout is local to the placement; it cannot patch the source section. */
export const UpdateSectionShortcutInputSchema = z.strictObject({
  columnSpan: SectionColumnSpanSchema.optional(),
  collapsed: z.boolean().optional(),
});
export type UpdateSectionShortcutInput = z.infer<typeof UpdateSectionShortcutInputSchema>;

/** Reordering a shortcut renumbers the combined section/shortcut canvas. */
export const MoveSectionShortcutInputSchema = z.strictObject({
  position: PositionSchema,
});
export type MoveSectionShortcutInput = z.infer<typeof MoveSectionShortcutInputSchema>;

export const CreateReflectionInputSchema = z.object({
  projectId: ProjectIdSchema,
  /** The owning container; resolved like `CreateTaskInput.sectionId` when absent. */
  sectionId: SectionIdSchema.optional(),
  /** The page to resolve on; see `CreateTaskInput.pageId`. */
  pageId: ProjectPageIdSchema.optional(),
  subject: ReflectionSubjectSchema.optional(),
  title: z.string().optional(),
  body: z.string().min(1),
  prompt: z.string().optional(),
});
export type CreateReflectionInput = z.infer<typeof CreateReflectionInputSchema>;

export const UpdateReflectionInputSchema = z.object({
  title: z.string().nullable().optional(),
  body: z.string().min(1).optional(),
  subject: ReflectionSubjectSchema.nullable().optional(),
});
export type UpdateReflectionInput = z.infer<typeof UpdateReflectionInputSchema>;

export const ReflectionQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
  /** Sections render what they own, so a reflections list reads by container, not project. */
  sectionId: SectionIdSchema.optional(),
  /** Archived reflections are excluded unless this is true, as for tasks. */
  includeArchived: z.boolean().optional(),
});
export type ReflectionQuery = z.infer<typeof ReflectionQuerySchema>;

export const MilestoneQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
});
export type MilestoneQuery = z.infer<typeof MilestoneQuerySchema>;

/** Filters for §61's `GET /api/tasks`, and for `TaskService.list`. */
export const TaskQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
  /** Sections render what they own, so a task list reads by container, not project. */
  sectionId: SectionIdSchema.optional(),
  parentTaskId: TaskIdSchema.optional(),
  status: z.array(TaskStatusSchema).optional(),
  priority: z.array(TaskPrioritySchema).optional(),
  dueBefore: IsoDateTimeSchema.optional(),
  dueAfter: IsoDateTimeSchema.optional(),
  /** Simple in-memory matching (§40). No ranking here — that is the search feature's job. */
  search: z.string().optional(),
  /** Archived tasks are excluded unless this is true. */
  includeArchived: z.boolean().optional(),
});
export type TaskQuery = z.infer<typeof TaskQuerySchema>;

/** Filters for §61's `GET /api/projects`. */
export const ProjectQuerySchema = z.object({
  workspaceId: WorkspaceIdSchema.optional(),
  parentProjectId: ProjectIdSchema.optional(),
  status: z.array(ProjectStatusSchema).optional(),
  search: z.string().optional(),
});
export type ProjectQuery = z.infer<typeof ProjectQuerySchema>;

/** Filters for `GET /api/projects/:projectId/sections`. */
export const SectionQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
  /**
   * Narrow the canvas to one page (§27). Absent, the read spans the project — which is what
   * every caller wants while a project has one section-bearing page, and what the Archive page
   * will keep wanting after that.
   *
   * `SectionService.list` **resolves** it rather than only passing it to the filter: a stale or
   * foreign page has to answer not-found, the way an unknown `parentTaskId` does on a task
   * list, instead of an empty array that reads as "this page is empty".
   */
  pageId: ProjectPageIdSchema.optional(),
  /** Archived sections are excluded unless this is true, as for tasks and reflections. */
  includeArchived: z.boolean().optional(),
});
export type SectionQuery = z.infer<typeof SectionQuerySchema>;

/** Filters for the shortcut placements on a destination page. */
export const SectionShortcutQuerySchema = z.strictObject({
  pageId: ProjectPageIdSchema.optional(),
});
export type SectionShortcutQuery = z.infer<typeof SectionShortcutQuerySchema>;

/** The picker must name its destination so the service can mark existing placements. */
export const ShortcutSourceQuerySchema = z.strictObject({
  pageId: ProjectPageIdSchema,
});
export type ShortcutSourceQuery = z.infer<typeof ShortcutSourceQuerySchema>;

/**
 * Filters for `ProjectPageRepository.list`. Written here rather than inline on the interface
 * because it was inline in **two** packages — the repository interface and its JSON
 * implementation — which is the parallel definition §11 forbids, just small enough to have gone
 * unnoticed.
 */
export const ProjectPageQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
  kind: ProjectPageKindSchema.optional(),
  enabled: z.boolean().optional(),
});
export type ProjectPageQuery = z.infer<typeof ProjectPageQuerySchema>;

/**
 * §26's optional tabs, as a write. The kind is the address rather than a page id: a root has at
 * most one page of each kind, and on the first enable there is no id yet to name — the record is
 * created then (see `ProjectPageService.setEnabled`).
 *
 * Both directions travel through one input because they are one operation to the person: the
 * control is a toggle. `home` and `work` are refused by the service, not by this schema — the
 * refusal wants to say *why*, and "cannot be disabled" is a different sentence from "is not a
 * kind".
 */
export const SetProjectPageEnabledInputSchema = z.object({
  kind: ProjectPageKindSchema,
  enabled: z.boolean(),
});
export type SetProjectPageEnabledInput = z.infer<typeof SetProjectPageEnabledInputSchema>;

/** Filters for the activity feed (§57). Capped because `limit` arrives off a query string. */
export const ActivityQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
  /**
   * Narrow the feed to one kind of actor (§57). Applied **before** `limit`, so §24's
   * Recent Agent Activity tile cannot go empty just because the newest events happen to be
   * a person's.
   */
  actor: ActivityActorSchema.optional(),
  limit: z.number().int().positive().max(200).optional(),
});
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;
