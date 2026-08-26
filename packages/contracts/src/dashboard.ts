import { z } from 'zod';
import { PositionSchema } from './common';

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
