import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema } from './common';
import { ProjectIdSchema, TaskIdSchema, WorkspaceIdSchema } from './ids';
import { ProjectLayoutModeSchema, ProjectStatusSchema } from './project';
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

/** Filters for the activity feed (§57). Capped because `limit` arrives off a query string. */
export const ActivityQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
  limit: z.number().int().positive().max(200).optional(),
});
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;
