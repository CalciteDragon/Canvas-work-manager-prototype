import { randomUUID } from 'node:crypto';
import type { ActorContext } from '@cwm/domain';
import type { ToolRegistry } from '@cwm/mcp-tools';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
  type FetchLikeMcpHandler,
} from '@modelcontextprotocol/node';
import { createMcpHandler, type AuthInfo, type McpHttpHandler } from '@modelcontextprotocol/server';
import { AgentAuthenticationError, type PrototypeAgentAuthenticator } from '../auth/prototype-agent-authenticator.ts';
import type { RawRouteHandler } from '../router.ts';
import { createWorkManagerMcpServer, REQUIRED_PERMISSION_META_KEY, REQUIRED_PERMISSIONS_META_KEY } from './server.ts';

export { REQUIRED_PERMISSION_META_KEY, REQUIRED_PERMISSIONS_META_KEY };

export interface AuthenticatedMcpDependencies {
  registry: ToolRegistry;
  authenticator: PrototypeAgentAuthenticator;
}

/** Official Node adaptation, with the two localhost guards the SDK requires in front. */
export const createMcpNodeHandler = (handler: FetchLikeMcpHandler): RawRouteHandler => {
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const nodeHandler = toNodeHandler(handler);

  return async (request, response) => {
    if (!validateHost(request, response) || !validateOrigin(request, response)) return;
    await nodeHandler(request, response);
  };
};

/**
 * §50's official fetch-shaped handler with §51 authentication in front of it.
 *
 * The SDK deliberately treats `authInfo` as pass-through. A short-lived opaque client id
 * bridges that standard SDK type to the domain's `ActorContext`; the actor itself is never
 * cast into an unrelated transport type.
 */
export const createAuthenticatedMcpHandler = ({
  registry,
  authenticator,
}: AuthenticatedMcpDependencies): McpHttpHandler => {
  const actors = new Map<string, ActorContext>();
  const sdk = createMcpHandler(({ authInfo }) => {
    const actor = authInfo === undefined ? undefined : actors.get(authInfo.clientId);
    if (actor === undefined) throw new AgentAuthenticationError();
    return createWorkManagerMcpServer(registry, async () => ({ registry, actor }));
  });

  return {
    bus: sdk.bus,
    notify: sdk.notify,
    close: sdk.close,
    fetch: async (request) => {
      try {
        const actor = await authenticator.authenticate(request.headers.get('authorization') ?? undefined);
        if (actor === null) throw new AgentAuthenticationError('a Bearer token is required');

        const clientId = `prototype-${randomUUID()}`;
        const authInfo: AuthInfo = { token: 'prototype-local', clientId, scopes: [] };
        actors.set(clientId, actor);
        try {
          return await sdk.fetch(request, { authInfo });
        } finally {
          actors.delete(clientId);
        }
      } catch (error) {
        if (!(error instanceof AgentAuthenticationError)) throw error;
        return new Response(JSON.stringify({ error: 'unauthorized', message: error.message }), {
          status: 401,
          headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
        });
      }
    },
  };
};
