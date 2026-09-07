import type { ActorContext } from '@cwm/domain';
import { requiredPermissions, type ToolRegistry } from '@cwm/mcp-tools';
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
        _meta: {
          [REQUIRED_PERMISSION_META_KEY]: tool.permission,
          [REQUIRED_PERMISSIONS_META_KEY]: requiredPermissions(tool),
        },
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
