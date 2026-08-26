import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { DashboardWidgetSchema } from './dashboard';
import { UserIdSchema, WorkspaceIdSchema } from './ids';

export const WorkspaceSchema = z.object({
  id: WorkspaceIdSchema,
  name: z.string().min(1),
  ownerUserId: UserIdSchema,
  createdAt: IsoDateTimeSchema,
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** §22's two themes. The Design Lab is development tooling, not a persona choice. */
export const ThemeSchema = z.enum(['dark', 'light']);
export type Theme = z.infer<typeof ThemeSchema>;

/**
 * §17 gives each persona preferences; §25's widgets have no collection of their own in
 * §14 and no owner field, so the dashboard layout lives here — per person, which is what
 * "switch persona" has to change.
 */
export const UserPreferencesSchema = z.object({
  theme: ThemeSchema,
  dashboardWidgets: z.array(DashboardWidgetSchema),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const UserSchema = z.object({
  id: UserIdSchema,
  name: z.string().min(1),
  avatar: z.string().optional(),
  workspaceId: WorkspaceIdSchema,
  preferences: UserPreferencesSchema,
  createdAt: IsoDateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;
