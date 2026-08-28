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

/**
 * §33's shape, plus `archivedAt`. §33 says "Start flexible", and archiving needs its own
 * field: folding it into `cancelled` would make the prototype unable to tell "the user
 * gave up on this" from "the user filed it away", which is exactly the signal §83 wants
 * about whether all five statuses earn their place.
 */
export const TaskSchema = z.object({
  id: TaskIdSchema,
  projectId: ProjectIdSchema,

  parentTaskId: TaskIdSchema.optional(),

  title: z.string().min(1),
  description: z.string().optional(),

  status: TaskStatusSchema,
  priority: TaskPrioritySchema,

  /** Optional relative effort used only by §39's weighted progress experiment. */
  estimate: z.number().positive().optional(),

  startAt: IsoDateTimeSchema.optional(),
  dueAt: IsoDateTimeSchema.optional(),
  completedAt: IsoDateTimeSchema.optional(),
  /** Set when the task is archived; archived tasks are excluded from lists by default. */
  archivedAt: IsoDateTimeSchema.optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Task = z.infer<typeof TaskSchema>;
