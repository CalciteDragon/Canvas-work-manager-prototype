import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { PrototypeDocumentSchema } from '@cwm/contracts';
import { createToolRegistry, SPEC_TOOL_NAMES } from '@cwm/mcp-tools';
import { buildSeed } from '@cwm/prototype-data';
import {
  InMemoryDataStore,
  JsonActivityRepository,
  JsonAgentConnectionRepository,
  JsonMilestoneRepository,
  JsonProjectPageRepository,
  JsonProjectRepository,
  JsonReflectionRepository,
  JsonSectionRepository,
  JsonTaskRepository,
  JsonUserRepository,
  unitOfWorkFor,
} from '@cwm/repositories';
import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../api/services.ts';
import { createAuthenticatedMcpHandler, REQUIRED_PERMISSION_META_KEY } from './handler.ts';

const inMemoryPersistence = () => {
  const store = new InMemoryDataStore(PrototypeDocumentSchema.parse(buildSeed('agent-heavy')));
  return {
    path: 'in-memory://slice-15',
    store,
    projects: new JsonProjectRepository(store),
    pages: new JsonProjectPageRepository(store),
    sections: new JsonSectionRepository(store),
    tasks: new JsonTaskRepository(store),
    milestones: new JsonMilestoneRepository(store),
    reflections: new JsonReflectionRepository(store),
    activities: new JsonActivityRepository(store),
    agents: new JsonAgentConnectionRepository(store),
    users: new JsonUserRepository(store),
    unitOfWork: unitOfWorkFor(store),
  };
};

const buildServer = () => {
  const persistence = inMemoryPersistence();
  const api = createApi(persistence);
  const registry = createToolRegistry({
    projects: api.projects,
    pages: api.pages,
    tasks: api.tasks,
    reflections: api.reflections,
    sections: api.sections,
    dashboard: api.dashboard,
    workspace: api.workspace,
  });
  const authenticate = vi.spyOn(api.authenticator!, 'authenticate');
  const handler = createAuthenticatedMcpHandler({ registry, authenticator: api.authenticator! });
  return { api, authenticate, handler, persistence, registry };
};

const build = async (token = 'prototype-user-a-readwrite') => {
  const server = buildServer();
  const client = new Client(
    { name: 'slice-15-contract-test', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    authProvider: { token: async () => token },
    fetch: (url, init) => server.handler.fetch(new Request(url, init)),
  });

  await client.connect(transport);
  return { ...server, client };
};

describe('MCP HTTP handler (§49, §50, §60)', () => {
  it('lists the exact §54 registry through a modern in-process SDK handler', async () => {
    const { client, handler, registry } = await build();

    try {
      expect(client.getProtocolEra()).toBe('modern');
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).toEqual(SPEC_TOOL_NAMES);
      expect(listed.tools).toHaveLength(registry.list().length);
      for (const [index, tool] of registry.list().entries()) {
        expect(listed.tools[index]).toMatchObject({
          name: tool.name,
          description: tool.description,
          _meta: { [REQUIRED_PERMISSION_META_KEY]: tool.permission },
        });
        expect(listed.tools[index]?.inputSchema).toMatchObject({ type: 'object' });
      }
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('creates a task through the in-process handler as the authenticated agent', async () => {
    const { client, handler, persistence } = await build();

    try {
      const result = await client.callTool({
        name: 'create_task',
        arguments: { projectId: 'project-work-manager', title: 'Created over modern MCP' },
      });

      expect(result.isError).not.toBe(true);
      const task = result.structuredContent as { id: string; title: string };
      expect(task.title).toBe('Created over modern MCP');
      expect(persistence.store.snapshot().tasks).toContainEqual(expect.objectContaining({ id: task.id }));
      expect(persistence.store.snapshot().activityEvents).toContainEqual(
        expect.objectContaining({ actor: 'agent', actorAgentConnectionId: 'agent-claude', entityId: task.id }),
      );
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('returns a tool error when the live connection lacks tasks.write', async () => {
    const { client, handler, persistence } = await build('prototype-user-a-readonly');
    const before = persistence.store.snapshot().tasks.length;

    try {
      const result = await client.callTool({
        name: 'create_task',
        arguments: { projectId: 'project-work-manager', title: 'Must not persist' },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toContainEqual(
        expect.objectContaining({ type: 'text', text: expect.stringContaining('tasks.write') }),
      );
      expect(persistence.store.snapshot().tasks).toHaveLength(before);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('authenticates the modern probe and every later HTTP request, including after revocation', async () => {
    const { api, authenticate, client, handler } = await build();
    expect(authenticate).toHaveBeenCalledTimes(1);

    try {
      await client.listTools();
      expect(authenticate).toHaveBeenCalledTimes(2);

      await api.agents.revoke(
        { actor: 'user', workspaceId: 'workspace-demo' as never, userId: 'user-demo' as never },
        'agent-claude' as never,
      );
      await expect(client.listTools()).rejects.toThrow();
      expect(authenticate).toHaveBeenCalledTimes(3);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it.each([undefined, 'Basic nope', 'Bearer unknown'])(
    'requires a usable Bearer credential on the MCP endpoint (%s)',
    async (authorization) => {
      const { handler } = buildServer();
      const headers = authorization === undefined ? undefined : { authorization };

      try {
        const response = await handler.fetch(new Request('http://test.local/mcp', { method: 'POST', headers }));
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized' });
      } finally {
        await handler.close();
      }
    },
  );
});
