import { z } from 'zod';
import { IsoDateSchema, IsoDateTimeSchema, PositionSchema } from './common';
import { ProjectIdSchema, TaskIdSchema } from './ids';
import { ProjectStatusSchema } from './project';
import { TaskPrioritySchema, TaskStatusSchema } from './task';

/** §25's preset sizes. No pixel resizing until the prototype shows resizing is useful. */
export const WidgetSizeSchema = z.enum(['small', 'medium', 'wide', 'full']);
export type WidgetSize = z.infer<typeof WidgetSizeSchema>;

/** §24's initial widgets. Which survive daily use is a §83 question. */
export const DashboardWidgetTypeSchema = z.enum([
  'today',
  'upcoming',
  'active_projects',
  'calendar',
  'recent_progress',
  'daily_digest',
  'work_summary',
  'fun_fact',
  'recent_agent_activity',
]);
export type DashboardWidgetType = z.infer<typeof DashboardWidgetTypeSchema>;

/** §25's model exactly. Widgets belong to a persona — they live on `UserPreferences`. */
export const DashboardWidgetSchema = z.object({
  id: z.string().min(1),
  type: DashboardWidgetTypeSchema,
  position: PositionSchema,
  size: WidgetSizeSchema,
  config: z.unknown(),
  hidden: z.boolean(),
});
export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

/**
 * The ranges §24 calls "configurable": Upcoming's horizon and Recent Progress's lookback.
 * Both are days, both are bounded — an unbounded range would make "upcoming" mean "every
 * task", which is the project list, not a dashboard.
 */
export const DashboardQuerySchema = z.object({
  upcomingDays: z.number().int().min(1).max(90).default(7),
  recentDays: z.number().int().min(1).max(90).default(7),
});
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;

/**
 * A task as a dashboard row. It carries its project's name because every widget shows
 * work from several projects at once, and a row that cannot say where it came from is
 * not an answer to "what should I do today?".
 */
export const DashboardTaskSchema = z.object({
  id: TaskIdSchema,
  projectId: ProjectIdSchema,
  projectName: z.string().min(1),
  projectIcon: z.string().optional(),
  title: z.string().min(1),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  dueAt: IsoDateTimeSchema.optional(),
  completedAt: IsoDateTimeSchema.optional(),
  /** Derived against the clock, not stored — a row is overdue relative to *now*. */
  overdue: z.boolean(),
});
export type DashboardTask = z.infer<typeof DashboardTaskSchema>;

export const DashboardProjectSchema = z.object({
  id: ProjectIdSchema,
  name: z.string().min(1),
  icon: z.string().optional(),
  status: ProjectStatusSchema,
  targetDate: IsoDateSchema.optional(),
  openTasks: z.number().int().nonnegative(),
  completedTasks: z.number().int().nonnegative(),
  /** Count-based, like the project header. `null` when there is nothing to measure. */
  percentage: z.number().min(0).max(100).nullable(),
  /** Whole days from today to the target date; negative when the date has passed. */
  daysToTarget: z.number().int().nullable(),
});
export type DashboardProject = z.infer<typeof DashboardProjectSchema>;

/**
 * §42's `GeneratedContent`, given a shape. `lines` rather than one blob because §43's
 * example is a short stack of independent sentences, and a widget wants to lay them out
 * rather than parse them back apart.
 *
 * No `title`: the widget frame heads every tile from the registry's `displayName`, so a
 * title here would be a member nothing renders — the same claim-no-test-backs rule that
 * keeps unimplemented methods off the gateway interfaces.
 */
export const GeneratedContentSchema = z.object({
  lines: z.array(z.string().min(1)).min(1),
  /** Which §44 provider composed this. The UI says so rather than implying real AI. */
  source: z.enum(['prototype', 'real']),
  generatedAt: IsoDateTimeSchema,
});
export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;

/**
 * Everything the dashboard renders, from one derivation over one clock reading. Widgets
 * overlap — the digest counts what Today and Recent Progress list — so deriving them
 * separately would let them disagree on screen.
 *
 * The *layout* is not here: §25's widgets live on the persona (`UserPreferences`), so
 * this is content only.
 */
export const DashboardResultSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  today: z.object({
    date: IsoDateSchema,
    overdue: z.array(DashboardTaskSchema),
    dueToday: z.array(DashboardTaskSchema),
    inProgress: z.array(DashboardTaskSchema),
  }),
  upcoming: z.object({
    days: z.number().int().min(1).max(90),
    throughDate: IsoDateSchema,
    tasks: z.array(DashboardTaskSchema),
  }),
  activeProjects: z.array(DashboardProjectSchema),
  recentProgress: z.object({
    days: z.number().int().min(1).max(90),
    sinceDate: IsoDateSchema,
    tasks: z.array(DashboardTaskSchema),
  }),
  dailyDigest: GeneratedContentSchema,
  /** §24's "low-priority optional daily content" — a fixture, not AI (see the decision log). */
  funFact: z.string().min(1),
});
export type DashboardResult = z.infer<typeof DashboardResultSchema>;
