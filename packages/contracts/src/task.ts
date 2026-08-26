import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { ProjectIdSchema, TaskIdSchema } from './ids';

/**
 * §33's five statuses, in §33's order. Whether all five earn their place is one of the
 * questions the prototype exists to answer (§83) — do not prune them early.
 */
export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * §33 names `priority` without values. Three is the smallest set that supports the one
 * task-row state §4 actually names ("high priority"); revisit once real use argues for
 * more (see the plan's open question 2).
 */
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

/** Exactly §33's shape. Nothing §33 does not name. */
export const TaskSchema = z.object({
  id: TaskIdSchema,
  projectId: ProjectIdSchema,

  parentTaskId: TaskIdSchema.optional(),

  title: z.string().min(1),
  description: z.string().optional(),

  status: TaskStatusSchema,
  priority: TaskPrioritySchema,

  startAt: IsoDateTimeSchema.optional(),
  dueAt: IsoDateTimeSchema.optional(),
  completedAt: IsoDateTimeSchema.optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Task = z.infer<typeof TaskSchema>;
