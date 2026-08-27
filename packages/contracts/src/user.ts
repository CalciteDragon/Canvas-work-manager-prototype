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

/**
 * Who the application is acting as (§18). `IdentityProvider.getCurrentIdentity()` returns
 * this; the prototype host serves it from `GET /api/me`.
 *
 * A **response composite**, not a stored record: §14's document has no `identities`
 * collection and must not grow one. The workspace travels with the user because it is
 * derived from them — a caller cannot ask for another persona's workspace — and because
 * every write input that names a workspace (`CreateProjectInput`) needs it.
 */
export const IdentitySchema = z.object({
  user: UserSchema,
  workspace: WorkspaceSchema,
});
export type Identity = z.infer<typeof IdentitySchema>;
