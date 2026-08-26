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
