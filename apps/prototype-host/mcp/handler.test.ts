import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ProjectArchiveResultSchema, ProjectJournalResultSchema, ProjectTodosResultSchema, PrototypeDocumentSchema } from '@cwm/contracts';
import { createToolRegistry, requiredPermissions, SPEC_TOOL_NAMES } from '@cwm/mcp-tools';
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
  JsonSectionShortcutRepository,
  JsonTaskRepository,
  JsonUndoRecordRepository,
  JsonUserRepository,
  unitOfWorkFor,
} from '@cwm/repositories';
import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../api/services.ts';
import { createAuthenticatedMcpHandler, REQUIRED_PERMISSION_META_KEY, REQUIRED_PERMISSIONS_META_KEY } from './handler.ts';

const inMemoryPersistence = () => {
  const store = new InMemoryDataStore(PrototypeDocumentSchema.parse(buildSeed('agent-heavy')));
  return {
    path: 'in-memory://slice-15',
    store,
    projects: new JsonProjectRepository(store),
    pages: new JsonProjectPageRepository(store),
    sections: new JsonSectionRepository(store),
    shortcuts: new JsonSectionShortcutRepository(store),
    tasks: new JsonTaskRepository(store),
    milestones: new JsonMilestoneRepository(store),
    reflections: new JsonReflectionRepository(store),
    activities: new JsonActivityRepository(store),
    agents: new JsonAgentConnectionRepository(store),
    users: new JsonUserRepository(store),
    undoRecords: new JsonUndoRecordRepository(store),
    unitOfWork: unitOfWorkFor(store),
  };
};

const buildServer = () => {
  const persistence = inMemoryPersistence();
  const api = createApi(persistence);
  const registry = createToolRegistry({
    projects: api.projects,
    pages: api.pages,
    todos: api.todos,
    archive: api.archive,
    journal: api.journal,
    tasks: api.tasks,
    reflections: api.reflections,
    sections: api.sections,
    shortcuts: api.shortcuts,
    dashboard: api.dashboard,
    workspace: api.workspace,
    undo: api.undo,
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
          _meta: {
            [REQUIRED_PERMISSION_META_KEY]: tool.permission,
            [REQUIRED_PERMISSIONS_META_KEY]: requiredPermissions(tool),
          },
        });
        expect(listed.tools[index]?.inputSchema).toMatchObject({ type: 'object' });
      }
    } finally {
      await client.close();
      await handler.close();
    }
  });

  /**
   * §54's derived page over the transport: the shared result travels intact, and the tool that
   * needs two grants says so in its metadata rather than only inside the domain.
   */
  it('publishes both of the Todos tool’s grants and returns the shared projection', async () => {
    const { client, handler } = await build();

    try {
      const listed = await client.listTools();
      const todos = listed.tools.find(({ name }) => name === 'get_project_todos');
      expect(todos?._meta).toMatchObject({
        [REQUIRED_PERMISSION_META_KEY]: 'projects.read',
        [REQUIRED_PERMISSIONS_META_KEY]: ['projects.read', 'tasks.read'],
      });

      const result = await client.callTool({
        name: 'get_project_todos',
        arguments: { projectId: 'project-work-manager' },
      });

      expect(result.isError).not.toBe(true);
      const parsed = ProjectTodosResultSchema.parse(result.structuredContent);
      expect(parsed.projectId).toBe('project-work-manager');
      expect(parsed.items.length).toBeGreaterThan(0);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('publishes all Archive read grants and returns the whole-tree projection', async () => {
    const { client, handler } = await build();

    try {
      const listed = await client.listTools();
      const archive = listed.tools.find(({ name }) => name === 'get_project_archive');
      expect(archive?._meta).toMatchObject({
        [REQUIRED_PERMISSION_META_KEY]: 'projects.read',
        [REQUIRED_PERMISSIONS_META_KEY]: ['projects.read', 'tasks.read', 'reflections.read'],
      });

      const result = await client.callTool({
        name: 'get_project_archive',
        arguments: { projectId: 'project-work-manager' },
      });

      expect(result.isError).not.toBe(true);
      expect(ProjectArchiveResultSchema.parse(result.structuredContent).projectId).toBe('project-work-manager');
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('publishes all Journal read grants and returns the shared journal projection', async () => {
    const { client, handler } = await build();

    try {
      const listed = await client.listTools();
      const journal = listed.tools.find(({ name }) => name === 'get_project_journal');
      expect(journal?._meta).toMatchObject({
        [REQUIRED_PERMISSION_META_KEY]: 'projects.read',
        [REQUIRED_PERMISSIONS_META_KEY]: ['projects.read', 'tasks.read', 'reflections.read'],
      });

      const result = await client.callTool({
        name: 'get_project_journal',
        arguments: { projectId: 'project-work-manager' },
      });

      expect(result.isError).not.toBe(true);
      expect(ProjectJournalResultSchema.parse(result.structuredContent).projectId).toBe('project-work-manager');
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

  /** Slice 30. The token's connection is granted `projects.write` first; the seed does not hold it. */
  describe('remove_section receipts and undo_operation over the transport', () => {
    const PERSON = { actor: 'user' as const, workspaceId: 'workspace-demo' as never, userId: 'user-demo' as never };
    const SECTION = 'section-project-work-manager-activity';

    const grantProjectsWrite = (api: ReturnType<typeof buildServer>['api']) =>
      api.agents.updatePermissions(PERSON, 'agent-claude' as never, [
        'projects.read',
        'projects.write',
        'tasks.read',
        'tasks.write',
        'workspace.read',
      ]);

    const removeWithReceipt = async (client: Awaited<ReturnType<typeof build>>['client']) => {
      const removed = await client.callTool({ name: 'remove_section', arguments: { sectionId: SECTION } });
      expect(removed.isError).not.toBe(true);
      return (removed.structuredContent as { undo: { undoId: string } }).undo.undoId;
    };

    it('undoes once, then refuses the repeat with text starting undo_consumed:', async () => {
      const { api, client, handler, persistence } = await build();
      await grantProjectsWrite(api);

      try {
        const undoId = await removeWithReceipt(client);

        const undone = await client.callTool({ name: 'undo_operation', arguments: { undoId } });
        expect(undone.isError).not.toBe(true);
        expect(undone.structuredContent).toMatchObject({ outcome: 'restored', section: { id: SECTION } });
        expect(persistence.store.snapshot().sections.find(({ id }) => id === SECTION)?.archivedAt).toBeUndefined();

        const again = await client.callTool({ name: 'undo_operation', arguments: { undoId } });
        expect(again.isError).toBe(true);
        expect(again.content).toContainEqual(
          expect.objectContaining({ type: 'text', text: expect.stringMatching(/^undo_consumed: /) }),
        );
      } finally {
        await client.close();
        await handler.close();
      }
    });

    it('refuses a receipt once its connection is revoked, leaving the record unconsumed', async () => {
      const { api, client, handler, persistence } = await build();
      await grantProjectsWrite(api);

      try {
        const undoId = await removeWithReceipt(client);
        await api.agents.revoke(PERSON, 'agent-claude' as never);

        await expect(client.callTool({ name: 'undo_operation', arguments: { undoId } })).rejects.toThrow();
        expect(persistence.store.snapshot().undoRecords.find(({ id }) => id === undoId)?.consumedAt).toBeUndefined();
      } finally {
        await client.close();
        await handler.close();
      }
    });
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
