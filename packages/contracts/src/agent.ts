import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { AgentConnectionIdSchema, UserIdSchema } from './ids';

/**
 * One permission per §54 tool family, read and write kept apart. §53's UI displays five
 * of these; `reflections.read` backs `list_reflections`, and `workspace.read` backs
 * `search_workspace`, `get_upcoming_work` and `get_dashboard_context`.
 */
export const AgentPermissionSchema = z.enum([
  'projects.read',
  'projects.write',
  'tasks.read',
  'tasks.write',
  'reflections.read',
  'reflections.write',
  'workspace.read',
]);
export type AgentPermission = z.infer<typeof AgentPermissionSchema>;

/**
 * §52's shape. Connections are modelled realistically so the permission model can be
 * tested without OAuth (§51, §80) — the tokens behind them have no security value.
 */
export const AgentConnectionSchema = z.object({
  id: AgentConnectionIdSchema,
  userId: UserIdSchema,
  name: z.string().min(1),
  permissions: z.array(AgentPermissionSchema),
  revoked: z.boolean(),

  createdAt: IsoDateTimeSchema,
  /** §53 displays "Last used"; absent until the connection makes its first call. */
  lastUsedAt: IsoDateTimeSchema.optional(),
});
export type AgentConnection = z.infer<typeof AgentConnectionSchema>;

/**
 * What §53's grid sends back. The whole set, never a delta: a permission grid is a
 * *statement of the grant*, and a patch of individual toggles would make two checkboxes
 * clicked in quick succession race each other into different final states.
 */
export const UpdateAgentPermissionsInputSchema = z.object({
  // Unique, because a grant is a set. The UI cannot send a duplicate — its checkboxes
  // reflect held state — but the route is reachable directly, and a stored
  // `['tasks.read', 'tasks.read']` would render §53's grid correctly while quietly making
  // the record disagree with itself.
  permissions: z
    .array(AgentPermissionSchema)
    .refine((permissions) => new Set(permissions).size === permissions.length, 'permissions must be unique'),
});
export type UpdateAgentPermissionsInput = z.infer<typeof UpdateAgentPermissionsInputSchema>;

/**
 * A connection plus the bearer token that reaches it — **only** for §46's development
 * panel, over `/prototype/state`.
 *
 * The token is not a field on `AgentConnectionSchema`: §52's example has none, and a
 * secret-shaped member on the shared record would invite production thinking about
 * something §51 says has no security value. `GET /api/agent-connections`, which is the
 * product-shaped route §53 renders, answers bare connections.
 */
export const AgentConnectionViewSchema = AgentConnectionSchema.extend({
  token: z.string().min(1),
});
export type AgentConnectionView = z.infer<typeof AgentConnectionViewSchema>;
