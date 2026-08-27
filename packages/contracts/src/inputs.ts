import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, PositionSchema } from './common';
import { ProjectIdSchema, TaskIdSchema, WorkspaceIdSchema } from './ids';
import { ProjectLayoutModeSchema, ProjectStatusSchema } from './project';
import { SectionColumnSpanSchema, SectionConfigSchema } from './section';
import { TaskPrioritySchema, TaskStatusSchema } from './task';

/**
 * Write inputs carry only what a caller may set: ids and timestamps come from the domain
 * services and the clock (§45). In updates, `null` means clear and `undefined` means
 * leave alone — §11's `dueAt` example is the pattern.
 */

export const CreateTaskInputSchema = z.object({
  projectId: ProjectIdSchema,
  parentTaskId: TaskIdSchema.optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  startAt: IsoDateTimeSchema.nullable().optional(),
  dueAt: IsoDateTimeSchema.nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  projectId: ProjectIdSchema.optional(),
  parentTaskId: TaskIdSchema.nullable().optional(),
  startAt: IsoDateTimeSchema.nullable().optional(),
  dueAt: IsoDateTimeSchema.nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const CreateProjectInputSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  parentProjectId: ProjectIdSchema.optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  status: ProjectStatusSchema.optional(),
  targetDate: IsoDateSchema.nullable().optional(),
  projectLayoutMode: ProjectLayoutModeSchema.optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  status: ProjectStatusSchema.optional(),
  targetDate: IsoDateSchema.nullable().optional(),
  projectLayoutMode: ProjectLayoutModeSchema.optional(),
  parentProjectId: ProjectIdSchema.nullable().optional(),
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
export const CreateSectionInputSchema = z.object({
  /** A `SECTION_REGISTRY` key (§29). Open, for the same reason `ProjectSection.type` is. */
  type: z.string().min(1),
  title: z.string().min(1).optional(),
  columnSpan: SectionColumnSpanSchema.optional(),
  config: SectionConfigSchema.optional(),
});
export type CreateSectionInput = z.infer<typeof CreateSectionInputSchema>;

export const UpdateSectionInputSchema = z.object({
  /** Nullable because the title is an *override* — clearing it falls back to the registry. */
  title: z.string().min(1).nullable().optional(),
  columnSpan: SectionColumnSpanSchema.optional(),
  collapsed: z.boolean().optional(),
  config: SectionConfigSchema.optional(),
});
export type UpdateSectionInput = z.infer<typeof UpdateSectionInputSchema>;

/** Reordering is its own operation: it renumbers siblings, which a field patch cannot. */
export const MoveSectionInputSchema = z.object({
  position: PositionSchema,
});
export type MoveSectionInput = z.infer<typeof MoveSectionInputSchema>;

export const CreateReflectionInputSchema = z.object({
  projectId: ProjectIdSchema,
  title: z.string().optional(),
  body: z.string().min(1),
  prompt: z.string().optional(),
});
export type CreateReflectionInput = z.infer<typeof CreateReflectionInputSchema>;

export const UpdateReflectionInputSchema = z.object({
  title: z.string().nullable().optional(),
  body: z.string().min(1).optional(),
});
export type UpdateReflectionInput = z.infer<typeof UpdateReflectionInputSchema>;

/** Filters for §61's `GET /api/tasks`, and for `TaskService.list`. */
export const TaskQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
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
});
export type SectionQuery = z.infer<typeof SectionQuerySchema>;

/** Filters for the activity feed (§57). Capped because `limit` arrives off a query string. */
export const ActivityQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
  limit: z.number().int().positive().max(200).optional(),
});
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;
