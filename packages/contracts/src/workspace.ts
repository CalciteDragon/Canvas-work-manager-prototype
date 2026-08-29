import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema } from './common';
import { DashboardTaskSchema } from './dashboard';
import { ProjectIdSchema } from './ids';
import { ProjectStatusSchema } from './project';
import { TaskStatusSchema } from './task';

/**
 * What §54's three workspace tools ask for and answer. These are the only shapes in the
 * prototype whose first caller is an agent rather than a screen, which is why they are
 * **projections**: an agent asking "what is coming up?" wants a title, a project name and a
 * due date, not every field of a `Task`.
 */

export const SearchWorkspaceQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(20),
});
export type SearchWorkspaceQuery = z.infer<typeof SearchWorkspaceQuerySchema>;

/**
 * §40 also lists milestones. They have no service yet (Slice 19), so a fourth member here
 * would be a shape with nothing behind it.
 */
export const SearchHitKindSchema = z.enum(['project', 'task', 'reflection']);
export type SearchHitKind = z.infer<typeof SearchHitKindSchema>;

export const SearchHitSchema = z.object({
  kind: SearchHitKindSchema,
  id: z.string().min(1),
  /** Optional because a reflection need not have a title (`ReflectionSchema.title`). */
  title: z.string().min(1).optional(),
  /**
   * Where the hit lives. Both absent on a `kind: 'project'` hit — its own id is `id` and
   * its own name is `title`, and repeating them would let one hit disagree with itself.
   */
  projectId: ProjectIdSchema.optional(),
  projectName: z.string().min(1).optional(),
  /**
   * A union of the two status vocabularies that already exist, never a bare string: a third
   * spelling of "active" is exactly the drift §11 exists to stop. Reflections have none.
   */
  status: z.union([ProjectStatusSchema, TaskStatusSchema]).optional(),
  dueAt: IsoDateTimeSchema.optional(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

/**
 * One flat list rather than an array per kind. §40 describes *global* search, and an agent
 * asking "what do we have on retries?" does not know which entity type holds the answer —
 * so the shape should not make it choose before it can find out.
 */
export const SearchWorkspaceResultSchema = z.object({
  query: z.string().min(1),
  hits: z.array(SearchHitSchema),
});
export type SearchWorkspaceResult = z.infer<typeof SearchWorkspaceResultSchema>;

export const UpcomingWorkQuerySchema = z.object({
  /** Calendar days **including today**, so `7` is a week, not a week and a bit. */
  days: z.number().int().min(1).max(90).default(7),
  limit: z.number().int().min(1).max(200).default(50),
});
export type UpcomingWorkQuery = z.infer<typeof UpcomingWorkQuerySchema>;

/**
 * Two buckets, over `DashboardTaskSchema` — which is already this exact projection, down to
 * the `overdue` flag. A near-identical `UpcomingTask` would be a second row type to keep in
 * step with the first.
 *
 * Deliberately **not** the dashboard's own split: §24's `upcoming` is disjoint from three
 * other widgets and starts tomorrow, because a screen must not show one task twice. An
 * agent has no such constraint and does want today's work in "what is coming up".
 */
export const UpcomingWorkResultSchema = z.object({
  days: z.number().int().min(1).max(90),
  throughDate: IsoDateSchema,
  overdue: z.array(DashboardTaskSchema),
  upcoming: z.array(DashboardTaskSchema),
});
export type UpcomingWorkResult = z.infer<typeof UpcomingWorkResultSchema>;
