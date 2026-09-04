import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { ProjectIdSchema, SectionIdSchema, TaskIdSchema } from './ids';

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
  /**
   * The `task-list` container that owns this row. Required, so no task can exist in a
   * project without a section rendering it. `projectId` stays alongside it rather than
   * being derived through the section — the dashboard, upcoming work and search all filter
   * by project, and the pair is held together by one write-path assertion.
   */
  sectionId: SectionIdSchema,

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
  /**
   * Present means this task was archived as part of its container's removal, and names the
   * container it came down with. Absent means it was archived on its own, or is live.
   * Restoring a section brings back exactly the rows that name it; restoring a row clears
   * it. §33 does not declare this field, for the same "start flexible" reason `sectionId`
   * and `archivedAt` are not declared: a cascade with no marker is not undoable, and a
   * boolean would say less while asserting nothing the integrity pass could check.
   */
  archivedWithSectionId: SectionIdSchema.optional(),
  /**
   * The same idea one level down: present means this task came down with an ancestor's
   * archive, and names that ancestor. `TaskService.archive` cascades to descendants, so the
   * cascade needs the same marker its section-level counterpart does rather than a second
   * mechanism. A task carries **at most one** of the two markers.
   */
  archivedWithTaskId: TaskIdSchema.optional(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Task = z.infer<typeof TaskSchema>;
