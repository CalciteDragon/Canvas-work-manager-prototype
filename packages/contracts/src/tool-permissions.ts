import { z } from 'zod';
import { AgentPermissionSchema } from './agent';
import { OperationFamilySchema } from './operation-receipt';

/**
 * **What `tools/list` publishes about a tool's grants** (§54;
 * docs/decisions/2026-08-mcp-tool-permission-metadata.md, amended by
 * docs/decisions/2026-09-operation-family-permissions.md).
 *
 * The shape lives in contracts, beside the `AgentPermission` it is built from, because **two
 * packages assert it**: `@cwm/mcp-tools`' contract suite checks what each tool declares, and the
 * host's discovery tests check what the server actually sends. The `_meta` **key** constants stay
 * in `apps/prototype-host/mcp/server.ts`, which is the only place that speaks the wire format.
 *
 * Two kinds, because two kinds of tool exist:
 *
 * - **static** — every tool whose grant does not depend on its input. It keeps the singular key
 *   and the plural one, so an existing client reading either is unchanged.
 * - **family** — `undo_operation` and `redo_operation`, whose grant comes from the **stored**
 *   action's family, not from the caller's input. A singular key would have to name one of the
 *   families' grants and a conjunctive plural key would claim all of them are needed, and both
 *   would be false, so these two tools publish the namespaced map instead and omit the other keys.
 */

/** A tool whose grant is fixed: the primary grant, then every grant it needs, in a stable order. */
export const StaticToolPermissionSchema = z.strictObject({
  kind: z.literal('static'),
  permission: AgentPermissionSchema,
  permissions: z.array(AgentPermissionSchema).min(1),
});
export type StaticToolPermission = z.infer<typeof StaticToolPermissionSchema>;

/** A tool whose grant depends on the stored operation's family: one grant per family, all named. */
export const FamilyToolPermissionSchema = z.strictObject({
  kind: z.literal('family'),
  families: z.strictObject({
    section: AgentPermissionSchema,
    task: AgentPermissionSchema,
    reflection: AgentPermissionSchema,
    shortcut: AgentPermissionSchema,
  }),
});
export type FamilyToolPermission = z.infer<typeof FamilyToolPermissionSchema>;

/** The declaration a tool carries and the metadata discovery publishes — one shape, not two. */
export const ToolPermissionSchema = z.discriminatedUnion('kind', [
  StaticToolPermissionSchema,
  FamilyToolPermissionSchema,
]);
export type ToolPermission = z.infer<typeof ToolPermissionSchema>;

/**
 * The one mapping from operation family to grant. The domain asserts through it and discovery
 * publishes it, so the two can never disagree about what `undo_operation` needs.
 */
export const OPERATION_FAMILY_PERMISSION = {
  section: 'projects.write',
  task: 'tasks.write',
  reflection: 'reflections.write',
  // A placement is part of the destination project's canvas, so it needs the canvas grant and no
  // grant on the source: reversing a shortcut write never reads or writes the source's rows.
  shortcut: 'projects.write',
} as const satisfies Record<z.infer<typeof OperationFamilySchema>, z.infer<typeof AgentPermissionSchema>>;

/** The family declaration both history tools publish, validated once here. */
export const historyToolPermission = (): FamilyToolPermission =>
  FamilyToolPermissionSchema.parse({ kind: 'family', families: OPERATION_FAMILY_PERMISSION });
