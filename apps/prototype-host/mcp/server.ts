import type { ActorContext } from '@cwm/domain';
import { toolPermission, type ToolRegistry } from '@cwm/mcp-tools';
import { McpServer } from '@modelcontextprotocol/server';

/** Reverse-DNS-style local vendor metadata, per the 2026-07-28 MetaObject guidance. */
export const REQUIRED_PERMISSION_META_KEY = 'local.canvas-work-manager/requiredPermission';

/**
 * The **complete** grant list, beside the singular key rather than instead of it.
 *
 * §54's derived pages need more than one grant, and a client reading only `requiredPermission`
 * would be told half the answer. The singular key stays exactly as it was — it is published
 * metadata, and every tool that needs one grant still says so there — so a client written
 * against the old key keeps working and a client that understands this one is never surprised.
 */
export const REQUIRED_PERMISSIONS_META_KEY = 'local.canvas-work-manager/requiredPermissions';

/**
 * **The grant a transition needs, per operation family.** Published by `undo_operation` and
 * `redo_operation` **instead of** the two keys above, not beside them: their grant comes from the
 * stored action's family, so a singular key would have to name one of three and a conjunctive
 * plural key would claim all three are needed. Both would be false, and honest discovery metadata
 * is the whole point of publishing any of this
 * (docs/decisions/2026-08-mcp-tool-permission-metadata.md, amended by
 * docs/decisions/2026-09-operation-family-permissions.md).
 *
 * The value is `{ section, shortcut, page, project, task, reflection }`, each naming one `AgentPermission`. The shape is
 * defined in contracts, beside the permission it is built from, because this host and
 * `@cwm/mcp-tools` both assert it; only the key is this file's.
 */
export const REQUIRED_PERMISSIONS_BY_FAMILY_META_KEY = 'local.canvas-work-manager/requiredPermissionsByOperationFamily';

/** A tool's `_meta` grant keys: the static pair, or the family map — never a mixture. */
const permissionMeta = (tool: ToolRegistry extends { list(): readonly (infer T)[] } ? T : never): Record<string, unknown> => {
  const declaration = toolPermission(tool);
  return declaration.kind === 'static'
    ? {
        [REQUIRED_PERMISSION_META_KEY]: declaration.permission,
        [REQUIRED_PERMISSIONS_META_KEY]: declaration.permissions,
      }
    : { [REQUIRED_PERMISSIONS_BY_FAMILY_META_KEY]: declaration.families };
};

export interface McpInvocation {
  actor: ActorContext;
  registry: ToolRegistry;
}

export type ResolveMcpInvocation = () => Promise<McpInvocation>;

/**
 * The one §59 tool adapter shared by HTTP and stdio.
 *
 * `definitions` supplies the stable list and schemas. Execution resolves a fresh registry
 * and actor so the stdio transport can observe a permission change made by another process
 * without teaching this SDK adapter anything about JSON storage or authentication.
 */
export const createWorkManagerMcpServer = (
  definitions: ToolRegistry,
  resolveInvocation: ResolveMcpInvocation,
): McpServer => {
  const server = new McpServer({ name: 'canvas-work-manager', version: '0.0.0' });

  for (const tool of definitions.list()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        _meta: permissionMeta(tool),
      },
      async (input) => {
        const { registry, actor } = await resolveInvocation();
        const result = await registry.call(tool.name, input, actor);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) ?? 'null' }],
          structuredContent: result,
        };
      },
    );
  }

  return server;
};
