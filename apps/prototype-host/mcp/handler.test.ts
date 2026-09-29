import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { readFileSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchivedProjectsResultSchema, ProjectArchiveResultSchema, ProjectJournalResultSchema, ProjectTodosResultSchema, PrototypeDocumentSchema, TaskWriteResultSchema } from '@cwm/contracts';
import { createToolRegistry, toolPermission, SPEC_TOOL_NAMES } from '@cwm/mcp-tools';
import { buildSeed, writeSeedFile } from '@cwm/prototype-data';
import { SimulatedClock } from '@cwm/domain';
import {
  InMemoryDataStore,
  JsonActivityRepository,
  JsonAgentConnectionRepository,
  JsonMilestoneRepository,
  JsonOperationActionRepository,
  JsonOperationHistoryRepository,
  JsonProjectPageRepository,
  JsonProjectRepository,
  JsonReflectionRepository,
  JsonSectionRepository,
  JsonSectionShortcutRepository,
  JsonTaskRepository,
  JsonUserRepository,
  unitOfWorkFor,
} from '@cwm/repositories';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../api/services.ts';
import { LiveEventHub } from '../events/hub.ts';
import { loadPersistence } from '../persistence/store.ts';
import {
  createAuthenticatedMcpHandler,
  REQUIRED_PERMISSION_META_KEY,
  REQUIRED_PERMISSIONS_BY_FAMILY_META_KEY,
  REQUIRED_PERMISSIONS_META_KEY,
} from './handler.ts';

const inMemoryPersistence = (projectWrite = false) => {
  const seed = buildSeed('agent-heavy');
  if (projectWrite) {
    seed.agentConnections = seed.agentConnections.map((connection) =>
      connection.id === 'agent-claude'
        ? { ...connection, permissions: [...connection.permissions, 'projects.write' as const] }
        : connection,
    );
  }
  const store = new InMemoryDataStore(PrototypeDocumentSchema.parse(seed));
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
    operationHistories: new JsonOperationHistoryRepository(store),
    operationActions: new JsonOperationActionRepository(store),
    unitOfWork: unitOfWorkFor(store),
  };
};

const buildServer = (projectWrite = false) => {
  const persistence = inMemoryPersistence(projectWrite);
  const api = createApi(persistence);
  const registry = createToolRegistry({
    projects: api.projects,
    pages: api.pages,
    todos: api.todos,
    archive: api.archive,
    archivedProjects: api.archivedProjects,
    journal: api.journal,
    tasks: api.tasks,
    reflections: api.reflections,
    sections: api.sections,
    shortcuts: api.shortcuts,
    dashboard: api.dashboard,
    workspace: api.workspace,
    history: api.history,
  });
  const authenticate = vi.spyOn(api.authenticator!, 'authenticate');
  const handler = createAuthenticatedMcpHandler({ registry, authenticator: api.authenticator! });
  return { api, authenticate, handler, persistence, registry };
};

const build = async (token = 'prototype-user-a-readwrite', projectWrite = false) => {
  const server = buildServer(projectWrite);
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

const failureDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(failureDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('SDK HTTP commit and uncertain-response evidence (Slice 52)', () => {
  const PROJECT = 'project-work-manager';
  const createArgs = { projectId: PROJECT, title: 'SDK failure row' };
  const receipt = (result: { structuredContent?: unknown }) =>
    (result.structuredContent as { operation: { historyId: string; actionId: string; revision: number } }).operation;
  const errorText = (result: { content?: Array<{ type: string; text?: string }> }) =>
    result.content?.find((item) => item.type === 'text')?.text ?? '';

  const warm = async (client: Client, bytes: () => Promise<string>) => {
    await client.callTool({ name: 'list_tasks', arguments: { projectId: PROJECT } });
    const before = await bytes();
    await client.callTool({ name: 'list_tasks', arguments: { projectId: PROJECT } });
    expect(await bytes()).toBe(before);
  };

  it.each(['create_task', 'undo_operation'] as const)('%s failed persist is atomic, silent, and retryable through the SDK', async (target) => {
    const host = await diskHarness();
    const client = await host.connect();
    try {
      await warm(client, host.bytes);
      let args: Record<string, unknown> = createArgs;
      let createdId: string | undefined;
      if (target === 'undo_operation') {
        const created = await client.callTool({ name: 'create_task', arguments: createArgs });
        expect(created.isError).not.toBe(true);
        createdId = (created.structuredContent as { task: { id: string } }).task.id;
        const operation = receipt(created);
        args = { historyId: operation.historyId, actionId: operation.actionId, expectedRevision: operation.revision };
      }
      host.frames.length = 0;
      const beforeBytes = await host.bytes();
      const before = await host.document();
      const persist = host.persistence.store.persist;
      host.persistence.store.persist = async () => { throw new Error('slice-52 one-shot disk failure'); };
      const failed = await client.callTool({ name: target, arguments: args });
      expect(failed.isError).toBe(true);
      expect(errorText(failed)).toContain('slice-52 one-shot disk failure');
      expect(await host.bytes()).toBe(beforeBytes);
      expect(await host.document()).toEqual(before);
      expect(host.persistence.store.snapshot()).toEqual(before);
      expect(host.frames).toEqual([]);
      host.persistence.store.persist = persist;

      const retried = await client.callTool({ name: target, arguments: args });
      expect(retried.isError).not.toBe(true);
      const after = await host.document();
      expect(after.activityEvents).toHaveLength(before.activityEvents.length + 1);
      expect(host.frames).toHaveLength(1);
      expect(host.frames[0]!.disk).toEqual(after);
      if (target === 'create_task') {
        const task = (retried.structuredContent as { task: { id: string } }).task;
        expect(after.tasks.filter(({ id }) => id === task.id)).toHaveLength(1);
        expect(after.operationActions.filter(({ id }) => id === receipt(retried).actionId)).toHaveLength(1);
      } else {
        expect(after.tasks.some(({ id }) => id === createdId)).toBe(false);
        expect(after.operationActions.find(({ id }) => id === args['actionId'])?.state).toBe('undone');
      }
    } finally {
      await client.close();
      await host.handler.close();
    }
  });

  it('drops a committed Undo response, then refuses the same revision after reconnect without another transition', async () => {
    const host = await diskHarness();
    let dropUndo = false;
    let sawCommittedBeforeDrop = false;
    const client = await host.connect(async (request, response) => {
      if (dropUndo && request.method === 'POST' && (await request.clone().text()).includes('undo_operation')) {
        const committed = await host.document();
        expect(committed.operationActions.at(-1)?.state).toBe('undone');
        expect(committed.operationHistories.at(-1)?.revision).toBe(2);
        expect(response.ok).toBe(true);
        expect(await response.clone().text()).toContain('"direction":"undo"');
        sawCommittedBeforeDrop = true;
        throw new Error('slice-52 response lost after commit');
      }
      return response;
    });
    try {
      await warm(client, host.bytes);
      const created = await client.callTool({ name: 'create_task', arguments: createArgs });
      const action = receipt(created);
      const taskId = (created.structuredContent as { task: { id: string } }).task.id;
      host.frames.length = 0;
      const before = await host.document();
      dropUndo = true;
      const args = { historyId: action.historyId, actionId: action.actionId, expectedRevision: action.revision };
      await expect(client.callTool({ name: 'undo_operation', arguments: args })).rejects.toThrow();
      expect(sawCommittedBeforeDrop).toBe(true);
      const committed = await host.document();
      expect(committed.tasks.some(({ id }) => id === taskId)).toBe(false);
      expect(committed.operationActions.find(({ id }) => id === action.actionId)?.state).toBe('undone');
      expect(committed.operationHistories.find(({ id }) => id === action.historyId)?.revision).toBe(action.revision + 1);
      expect(committed.activityEvents).toHaveLength(before.activityEvents.length + 1);
      expect(host.frames).toHaveLength(1);
      expect(host.frames[0]!.disk).toEqual(committed);
      expect((await loadPersistence(host.persistence.path)).store.snapshot()).toEqual(committed);

      const reconnected = await host.connect();
      try {
        const stale = await reconnected.callTool({ name: 'undo_operation', arguments: args });
        expect(stale.isError).toBe(true);
        expect(errorText(stale)).toMatch(/^history_revision_stale:/);
        expect(errorText(stale)).toContain(`revision ${action.revision + 1}`);
        const summary = await reconnected.callTool({ name: 'get_operation_history', arguments: { projectId: PROJECT } });
        expect(summary.structuredContent).toMatchObject({ revision: action.revision + 1, redo: { actionId: action.actionId } });
        expect(await host.document()).toEqual(committed);
        expect(host.frames).toHaveLength(1);
      } finally {
        await reconnected.close();
      }
    } finally {
      await client.close();
      await host.handler.close();
    }
  });
});

const diskHarness = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cwm-mcp-http-failure-'));
  failureDirectories.push(directory);
  const path = join(directory, 'data.json');
  await writeSeedFile('agent-heavy', { targetPath: path });
  const persistence = await loadPersistence(path);
  const events = new LiveEventHub();
  const clock = new SimulatedClock();
  const api = createApi(persistence, { events, clock });
  const registry = createToolRegistry({
    projects: api.projects, pages: api.pages, todos: api.todos, archive: api.archive,
    archivedProjects: api.archivedProjects, journal: api.journal, tasks: api.tasks,
    reflections: api.reflections, sections: api.sections, shortcuts: api.shortcuts,
    dashboard: api.dashboard, workspace: api.workspace, history: api.history,
  });
  const handler = createAuthenticatedMcpHandler({ registry, authenticator: api.authenticator! });
  const bytes = () => readFile(path, 'utf8');
  const document = async () => PrototypeDocumentSchema.parse(JSON.parse(await bytes()));
  const frames: Array<{ event: string; disk: Awaited<ReturnType<typeof document>> }> = [];
  events.subscribe((event) => frames.push({ event: event.type, disk: PrototypeDocumentSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) }));
  const connect = async (deliver?: (request: Request, response: Response) => Promise<Response>) => {
    const client = new Client({ name: 'slice-52-http-failure', version: '0.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    await client.connect(new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      authProvider: { token: async () => 'prototype-user-a-readwrite' },
      fetch: async (url, init) => {
        const request = new Request(url, init);
        const observation = request.clone();
        const response = await handler.fetch(request);
        return deliver === undefined ? response : deliver(observation, response);
      },
    }));
    return client;
  };
  return { persistence, handler, bytes, document, frames, connect };
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
        const listedTool = listed.tools[index]!;
        expect(listedTool).toMatchObject({ name: tool.name, description: tool.description });
        const declaration = toolPermission(tool);
        if (declaration.kind === 'static') {
          expect(listedTool._meta).toMatchObject({
            [REQUIRED_PERMISSION_META_KEY]: declaration.permission,
            [REQUIRED_PERMISSIONS_META_KEY]: declaration.permissions,
          });
        } else {
          expect(listedTool._meta).toMatchObject({ [REQUIRED_PERMISSIONS_BY_FAMILY_META_KEY]: declaration.families });
          // The exact map, written out rather than derived, so a family the domain gained and
          // discovery forgot to publish fails here instead of passing by agreeing with itself.
          expect(listedTool._meta?.[REQUIRED_PERMISSIONS_BY_FAMILY_META_KEY]).toEqual({
            section: 'projects.write',
            task: 'tasks.write',
            reflection: 'reflections.write',
            shortcut: 'projects.write',
            page: 'projects.write',
            project: 'projects.write',
          });
          expect(listedTool._meta).not.toHaveProperty(REQUIRED_PERMISSION_META_KEY);
          expect(listedTool._meta).not.toHaveProperty(REQUIRED_PERMISSIONS_META_KEY);
        }
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

  it('lists restorable archived projects and restores one through MCP', async () => {
    const { client, handler } = await build('prototype-user-a-readwrite', true);
    try {
      const listed = await client.listTools();
      expect(listed.tools.find(({ name }) => name === 'list_archived_projects')?._meta).toMatchObject({
        [REQUIRED_PERMISSION_META_KEY]: 'projects.read',
      });
      const archived = await client.callTool({ name: 'archive_project', arguments: { projectId: 'project-agent-ops' } });
      expect(archived.isError).not.toBe(true);
      const result = await client.callTool({ name: 'list_archived_projects', arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(ArchivedProjectsResultSchema.parse(result.structuredContent).items.map(({ project }) => project.id)).toContain('project-agent-ops');
      const restored = await client.callTool({ name: 'restore_project', arguments: { projectId: 'project-agent-ops', status: 'active' } });
      expect(restored.isError).not.toBe(true);
      const after = await client.callTool({ name: 'list_archived_projects', arguments: {} });
      expect(ArchivedProjectsResultSchema.parse(after.structuredContent).items.map(({ project }) => project.id)).not.toContain('project-agent-ops');
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('lets a read-only MCP connection list archived projects but refuses Restore', async () => {
    const { client, handler } = await build('prototype-user-a-readonly');
    try {
      const listed = await client.callTool({ name: 'list_archived_projects', arguments: {} });
      expect(listed.isError).not.toBe(true);
      expect(ArchivedProjectsResultSchema.parse(listed.structuredContent).items).toEqual([]);
      const restore = await client.callTool({ name: 'restore_project', arguments: { projectId: 'project-agent-ops', status: 'active' } });
      expect(restore.isError).toBe(true);
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
      const { task, operation } = TaskWriteResultSchema.parse(result.structuredContent);
      expect(task.title).toBe('Created over modern MCP');
      expect(operation).toMatchObject({ historyId: expect.any(String), actionId: expect.any(String), operation: 'task.add' });
      expect(persistence.store.snapshot().tasks).toContainEqual(expect.objectContaining({ id: task.id }));
      expect(persistence.store.snapshot().activityEvents).toContainEqual(
        expect.objectContaining({ actor: 'agent', actorAgentConnectionId: 'agent-claude', entityId: task.id }),
      );
    } finally {
      await client.close();
      await handler.close();
    }
  });

  /** Slices 30 and 35. The token's connection is granted `projects.write` first; the seed does not hold it. */
  describe('operation receipts, history and undo/redo over the transport', () => {
    const PERSON = { actor: 'user' as const, workspaceId: 'workspace-demo' as never, userId: 'user-demo' as never };
    const SECTION = 'section-project-work-manager-activity';
    const PROJECT = 'project-work-manager';
    type Client = Awaited<ReturnType<typeof build>>['client'];
    type Receipt = { historyId: string; actionId: string; revision: number; expiresAt: string };

    const grantProjectsWrite = (api: ReturnType<typeof buildServer>['api']) =>
      api.agents.updatePermissions(PERSON, 'agent-claude' as never, [
        'projects.read',
        'projects.write',
        'tasks.read',
        'tasks.write',
        'workspace.read',
      ]);

    const receiptOf = (result: { structuredContent?: unknown }) => (result.structuredContent as { operation: Receipt }).operation;

    const removeWithReceipt = async (client: Client) => {
      const removed = await client.callTool({ name: 'remove_section', arguments: { sectionId: SECTION } });
      expect(removed.isError).not.toBe(true);
      return receiptOf(removed);
    };

    const history = async (client: Client) => {
      const result = await client.callTool({ name: 'get_operation_history', arguments: { projectId: PROJECT } });
      expect(result.isError).not.toBe(true);
      return result.structuredContent as { historyId: string | null; revision: number; undo: { actionId: string } | null; redo: { actionId: string } | null };
    };

    const stepNext = async (client: Client, direction: 'undo' | 'redo') => {
      const summary = await history(client);
      return client.callTool({
        name: `${direction}_operation`,
        arguments: { historyId: summary.historyId, actionId: summary[direction]!.actionId, expectedRevision: summary.revision },
      });
    };

    it('runs the add → update → Undo → Undo → Redo → Redo chain, and a revoked grant fails the next transition', async () => {
      const { api, client, handler, persistence } = await build();
      await grantProjectsWrite(api);

      try {
        const created = await client.callTool({
          name: 'create_section',
          arguments: { projectId: PROJECT, type: 'rich-text', title: 'Handler original', config: { text: 'before' } },
        });
        expect(created.isError).not.toBe(true);
        const section = (created.structuredContent as { section: { id: string } }).section;
        const updated = await client.callTool({ name: 'update_section', arguments: { sectionId: section.id, title: 'Handler changed' } });
        expect(receiptOf(updated)).toMatchObject({ historyId: receiptOf(created).historyId, revision: 2 });
        const title = () => persistence.store.snapshot().sections.find(({ id }) => id === section.id)?.title;

        const undoUpdate = await stepNext(client, 'undo');
        expect(undoUpdate.structuredContent).toMatchObject({ direction: 'undo', result: { operation: 'section.update', section: { title: 'Handler original' } } });
        const undoAdd = await stepNext(client, 'undo');
        expect(undoAdd.isError).not.toBe(true);
        expect(title()).toBeUndefined();
        expect((await history(client)).undo).toBeNull();
        expect((await stepNext(client, 'redo')).structuredContent).toMatchObject({ direction: 'redo', result: { operation: 'section.add' } });
        expect(title()).toBe('Handler original');
        await stepNext(client, 'redo');
        expect(title()).toBe('Handler changed');
        expect(await history(client)).toMatchObject({ undo: { actionId: receiptOf(updated).actionId }, redo: null });

        const summary = await history(client);
        await api.agents.revoke(PERSON, 'agent-claude' as never);
        await expect(client.callTool({
          name: 'undo_operation',
          arguments: { historyId: summary.historyId, actionId: summary.undo!.actionId, expectedRevision: summary.revision },
        })).rejects.toThrow();
        expect(persistence.store.snapshot().operationActions.find(({ id }) => id === summary.undo!.actionId)?.state).toBe('applied');
      } finally {
        await client.close();
        await handler.close();
      }
    });

    it('a stale expectedRevision refuses through undo_operation with text starting history_revision_stale:', async () => {
      const { api, client, handler, persistence } = await build();
      await grantProjectsWrite(api);

      try {
        const receipt = await removeWithReceipt(client);
        const args = { historyId: receipt.historyId, actionId: receipt.actionId, expectedRevision: receipt.revision };

        const undone = await client.callTool({ name: 'undo_operation', arguments: args });
        expect(undone.isError).not.toBe(true);
        expect(undone.structuredContent).toMatchObject({ result: { outcome: 'restored', section: { id: SECTION } } });
        expect(persistence.store.snapshot().sections.find(({ id }) => id === SECTION)?.archivedAt).toBeUndefined();

        const again = await client.callTool({ name: 'undo_operation', arguments: args });
        expect(again.isError).toBe(true);
        expect(again.content).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringMatching(/^history_revision_stale: /) }));
      } finally {
        await client.close();
        await handler.close();
      }
    });

    it('recovers a lost receipt after hard deletion on the same connection without a second write', async () => {
      const { api, client, handler, persistence } = await build();
      await grantProjectsWrite(api);

      try {
        const receipt = await removeWithReceipt(client);
        expect(persistence.store.snapshot().sections.some(({ id }) => id === SECTION)).toBe(false);
        const beforeRepeat = persistence.store.snapshot();

        const repeated = await client.callTool({ name: 'remove_section', arguments: { sectionId: SECTION } });
        const text = repeated.content?.find((item) => item.type === 'text')?.text ?? '';
        expect(repeated.isError).toBe(true);
        expect(text).toMatch(/^section_already_removed:/);
        expect(text).toContain(receipt.historyId);
        expect(text).toContain(receipt.actionId);
        expect(text).toContain(receipt.expiresAt);
        expect(persistence.store.snapshot()).toEqual(beforeRepeat);

        const undone = await client.callTool({
          name: 'undo_operation',
          arguments: { historyId: receipt.historyId, actionId: receipt.actionId, expectedRevision: receipt.revision },
        });
        expect(undone.isError).not.toBe(true);
        const restored = persistence.store.snapshot().sections.find(({ id }) => id === SECTION);
        expect(restored).toBeDefined();
        expect(restored).not.toHaveProperty('archivedAt');
      } finally {
        await client.close();
        await handler.close();
      }
    });

    it('refuses a transition once its connection is revoked, leaving the action applied', async () => {
      const { api, client, handler, persistence } = await build();
      await grantProjectsWrite(api);

      try {
        const receipt = await removeWithReceipt(client);
        await api.agents.revoke(PERSON, 'agent-claude' as never);

        await expect(client.callTool({
          name: 'undo_operation',
          arguments: { historyId: receipt.historyId, actionId: receipt.actionId, expectedRevision: receipt.revision },
        })).rejects.toThrow();
        expect(persistence.store.snapshot().operationActions.find(({ id }) => id === receipt.actionId)?.state).toBe('applied');
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
