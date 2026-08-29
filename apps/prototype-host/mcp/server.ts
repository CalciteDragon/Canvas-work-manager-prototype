import type { ActorContext } from '@cwm/domain';
import type { ToolRegistry } from '@cwm/mcp-tools';
import { McpServer } from '@modelcontextprotocol/server';

/** Reverse-DNS-style local vendor metadata, per the 2026-07-28 MetaObject guidance. */
export const REQUIRED_PERMISSION_META_KEY = 'local.canvas-work-manager/requiredPermission';

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
        _meta: { [REQUIRED_PERMISSION_META_KEY]: tool.permission },
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
