import { fileURLToPath } from 'node:url';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ProjectArchiveResultSchema, ProjectJournalResultSchema, ProjectTodosResultSchema } from '@cwm/contracts';
import { SPEC_TOOL_NAMES } from '@cwm/mcp-tools';
import { writeSeedFile } from '@cwm/prototype-data';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '../api/services.ts';
import { loadPersistence } from '../persistence/store.ts';

const temporaryDirectories: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('MCP stdio entry (§59)', () => {
  const connect = async (path: string, mode?: string) => {
    const client = new Client(
      { name: 'slice-52-stdio', version: '0.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', join(here, mode ? 'test/fault-stdio.ts' : 'stdio.ts'), ...(mode ? [mode] : [])],
      cwd: join(here, '..'),
      env: { ...getDefaultEnvironment(), CWM_DATA_FILE: path, CWM_MCP_TOKEN: 'prototype-user-a-readwrite' },
      stderr: 'pipe',
    }));
    return client;
  };

  const fixture = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-mcp-stdio-fault-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeSeedFile('agent-heavy', { targetPath: path });
    const document = JSON.parse(await readFile(path, 'utf8')) as { agentConnections: Array<{ id: string; lastUsedAt?: string }> };
    document.agentConnections.find(({ id }) => id === 'agent-claude')!.lastUsedAt = new Date().toISOString();
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
    return path;
  };

  const receipt = (result: { structuredContent?: unknown }) =>
    (result.structuredContent as { operation: { historyId: string; actionId: string; revision: number } }).operation;

  it.each(['create_task', 'undo_operation'] as const)('rolls back a failed %s commit and retries once', async (tool) => {
    const path = await fixture();
    const normal = await connect(path);
    let args: Record<string, unknown> = { projectId: 'project-work-manager', title: 'Faulted task' };
    let createdId: string | undefined;
    try {
      const warmed = await normal.callTool({ name: 'list_tasks', arguments: { projectId: 'project-work-manager' } });
      expect(warmed.isError).not.toBe(true);
      const warmBytes = await readFile(path, 'utf8');
      expect((await normal.callTool({ name: 'list_tasks', arguments: { projectId: 'project-work-manager' } })).isError).not.toBe(true);
      expect(await readFile(path, 'utf8')).toBe(warmBytes);
      if (tool === 'undo_operation') {
        const created = await normal.callTool({ name: 'create_task', arguments: args });
        createdId = (created.structuredContent as { task: { id: string } }).task.id;
        const { historyId, actionId, revision } = receipt(created);
        args = { historyId, actionId, expectedRevision: revision };
      }
      const before = await readFile(path, 'utf8');
      const beforeState = JSON.parse(before) as Record<string, unknown>;
      await normal.close();
      const faulted = await connect(path, `fail-${tool}`);
      try {
        const failed = await faulted.callTool({ name: tool, arguments: args });
        expect(failed.isError).toBe(true);
        expect(failed.content).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('slice52 persist fault') }));
      } finally {
        await faulted.close();
      }
      const after = await readFile(path, 'utf8');
      expect(after).toBe(before);
      const afterState = JSON.parse(after) as Record<string, unknown>;
      for (const key of ['tasks', 'sections', 'projects', 'operationHistories', 'operationActions', 'activityEvents']) {
        expect(afterState[key]).toEqual(beforeState[key]);
      }
      const retryClient = await connect(path);
      let retried: Awaited<ReturnType<typeof retryClient.callTool>>;
      try {
        retried = await retryClient.callTool({ name: tool, arguments: args });
      } finally {
        await retryClient.close();
      }
      expect(retried.isError).not.toBe(true);
      const committed = JSON.parse(await readFile(path, 'utf8')) as { activityEvents: unknown[]; tasks: Array<{ id: string; title: string }>; operationActions: Array<{ id: string; state: string }>; operationHistories: Array<{ id: string; revision: number }> };
      expect(committed.activityEvents).toHaveLength((beforeState['activityEvents'] as unknown[]).length + 1);
      if (tool === 'create_task') {
        const taskId = (retried.structuredContent as { task: { id: string } }).task.id;
        expect(committed.tasks.filter(({ id }) => id === taskId)).toEqual([expect.objectContaining({ id: taskId, title: 'Faulted task' })]);
        expect(committed.operationActions.find(({ id }) => id === receipt(retried).actionId)?.state).toBe('applied');
      } else {
        expect(committed.tasks.some(({ id }) => id === createdId)).toBe(false);
        expect(committed.operationActions.find(({ id }) => id === args['actionId'])?.state).toBe('undone');
        expect(committed.operationHistories.find(({ id }) => id === args['historyId'])?.revision).toBe((args['expectedRevision'] as number) + 1);
      }
    } finally {
      await normal.close();
    }
  }, 20_000);

  it('reconnects after a committed Undo loses its response and rejects the same revision', async () => {
    const path = await fixture();
    const initial = await connect(path);
    const created = await initial.callTool({ name: 'create_task', arguments: { projectId: 'project-work-manager', title: 'Lost response task' } });
    const { historyId, actionId, revision } = receipt(created);
    const createdId = (created.structuredContent as { task: { id: string } }).task.id;
    await initial.close();
    const before = JSON.parse(await readFile(path, 'utf8')) as { activityEvents: unknown[]; tasks: Array<{ id: string }> };
    const interrupted = await connect(path, 'drop-undo_operation');
    await expect(interrupted.callTool({ name: 'undo_operation', arguments: { historyId, actionId, expectedRevision: revision } })).rejects.toThrow();
    await interrupted.close();
    const after = JSON.parse(await readFile(path, 'utf8')) as { activityEvents: unknown[]; tasks: Array<{ id: string }>; operationHistories: Array<{ id: string; revision: number }>; operationActions: Array<{ id: string; state: string }> };
    expect(after.operationHistories.find(({ id }) => id === historyId)?.revision).toBe(revision + 1);
    expect(after.operationActions.find(({ id }) => id === actionId)?.state).toBe('undone');
    expect(after.activityEvents).toHaveLength(before.activityEvents.length + 1);
    expect(after.tasks).toHaveLength(before.tasks.length - 1);
    expect(after.tasks.some(({ id }) => id === createdId)).toBe(false);
    const committedBytes = await readFile(path, 'utf8');
    const reconnect = await connect(path);
    try {
      const retry = await reconnect.callTool({ name: 'undo_operation', arguments: { historyId, actionId, expectedRevision: revision } });
      expect(retry.isError).toBe(true);
      expect(retry.content).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('history_revision_stale:') }));
      expect(retry.content).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining(`revision ${revision + 1}`) }));
      const history = await reconnect.callTool({ name: 'get_operation_history', arguments: { projectId: 'project-work-manager' } });
      expect(history.structuredContent).toMatchObject({ revision: revision + 1, redo: { actionId } });
      const final = JSON.parse(await readFile(path, 'utf8')) as { activityEvents: unknown[] };
      expect(final.activityEvents).toHaveLength(after.activityEvents.length);
      expect(await readFile(path, 'utf8')).toBe(committedBytes);
    } finally {
      await reconnect.close();
    }
  }, 20_000);
  it('reloads and refuses the next tool call after an external live revocation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-mcp-stdio-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeSeedFile('agent-heavy', { targetPath: path });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', join(here, 'stdio.ts')],
      cwd: join(here, '..'),
      env: {
        ...getDefaultEnvironment(),
        CWM_DATA_FILE: path,
        CWM_MCP_TOKEN: 'prototype-user-a-readwrite',
      },
      stderr: 'pipe',
    });
    const client = new Client(
      { name: 'slice-15-stdio-test', version: '0.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );

    await client.connect(transport);
    try {
      expect(client.getProtocolEra()).toBe('modern');
      const before = await client.callTool({ name: 'list_tasks', arguments: { projectId: 'project-work-manager' } });
      expect(before.isError).not.toBe(true);

      // §54's derived page, over the other transport: discovered with both of its grants, and
      // answering the same shared result the HTTP handler does.
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).toEqual(SPEC_TOOL_NAMES);
      expect(listed.tools.find(({ name }) => name === 'get_project_todos')?._meta).toMatchObject({
        'local.canvas-work-manager/requiredPermission': 'projects.read',
        'local.canvas-work-manager/requiredPermissions': ['projects.read', 'tasks.read'],
      });
      expect(listed.tools.find(({ name }) => name === 'get_project_archive')?._meta).toMatchObject({
        'local.canvas-work-manager/requiredPermission': 'projects.read',
        'local.canvas-work-manager/requiredPermissions': ['projects.read', 'tasks.read', 'reflections.read'],
      });
      expect(listed.tools.find(({ name }) => name === 'get_project_journal')?._meta).toMatchObject({
        'local.canvas-work-manager/requiredPermission': 'projects.read',
        'local.canvas-work-manager/requiredPermissions': ['projects.read', 'tasks.read', 'reflections.read'],
      });
      for (const name of ['undo_operation', 'redo_operation']) {
        const metadata = listed.tools.find((tool) => tool.name === name)?._meta;
        // `toEqual` on the map itself, not `toMatchObject`: a new family that discovery forgot to
        // publish — or published wrongly — has to fail here rather than pass by omission.
        expect(metadata?.['local.canvas-work-manager/requiredPermissionsByOperationFamily']).toEqual({
          section: 'projects.write',
          task: 'tasks.write',
          reflection: 'reflections.write',
          shortcut: 'projects.write',
          page: 'projects.write',
          project: 'projects.write',
        });
        expect(metadata).not.toHaveProperty('local.canvas-work-manager/requiredPermission');
        expect(metadata).not.toHaveProperty('local.canvas-work-manager/requiredPermissions');
      }
      const todos = await client.callTool({
        name: 'get_project_todos',
        arguments: { projectId: 'project-work-manager' },
      });
      expect(todos.isError).not.toBe(true);
      expect(ProjectTodosResultSchema.parse(todos.structuredContent).projectId).toBe('project-work-manager');
      const archive = await client.callTool({
        name: 'get_project_archive',
        arguments: { projectId: 'project-work-manager' },
      });
      expect(archive.isError).not.toBe(true);
      expect(ProjectArchiveResultSchema.parse(archive.structuredContent).projectId).toBe('project-work-manager');
      const journal = await client.callTool({
        name: 'get_project_journal',
        arguments: { projectId: 'project-work-manager' },
      });
      expect(journal.isError).not.toBe(true);
      expect(ProjectJournalResultSchema.parse(journal.structuredContent).projectId).toBe('project-work-manager');

      const external = createApi(await loadPersistence(path));
      await external.agents.revoke(
        { actor: 'user', workspaceId: 'workspace-demo' as never, userId: 'user-demo' as never },
        'agent-claude' as never,
      );

      const after = await client.callTool({ name: 'list_tasks', arguments: { projectId: 'project-work-manager' } });
      expect(after.isError).toBe(true);
      expect(after.content).toContainEqual(
        expect.objectContaining({ type: 'text', text: expect.stringContaining('not a usable agent connection') }),
      );
    } finally {
      await client.close();
    }
  }, 15_000);

  /**
   * Slice 45 (defect D2): each call reloads the file, so without serialization two calls could each
   * read the same revision. Several transitions at one expected revision: exactly one lands.
   */
  it('lets exactly one of several concurrent transitions at one revision land', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-mcp-stdio-race-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeSeedFile('agent-heavy', { targetPath: path });
    const client = new Client(
      { name: 'slice-45-stdio-race', version: '0.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', join(here, 'stdio.ts')],
      cwd: join(here, '..'),
      env: { ...getDefaultEnvironment(), CWM_DATA_FILE: path, CWM_MCP_TOKEN: 'prototype-user-a-readwrite' },
      stderr: 'pipe',
    }));
    try {
      const created = await client.callTool({ name: 'create_task', arguments: { projectId: 'project-work-manager', title: 'Raced' } });
      const { historyId, actionId, revision } = (created.structuredContent as { operation: { historyId: string; actionId: string; revision: number } }).operation;
      const eventsBefore = (await loadPersistence(path)).store.snapshot().activityEvents.length;

      const results = await Promise.all([0, 1, 2].map(() =>
        client.callTool({ name: 'undo_operation', arguments: { historyId, actionId, expectedRevision: revision } })));
      const texts = results.map((result) => result.isError === true
        ? (result.content as Array<{ text?: string }>)[0]?.text ?? '' : 'ok');

      expect(texts.filter((text) => text === 'ok')).toHaveLength(1);
      expect(texts.filter((text) => text.startsWith('history_revision_stale:'))).toHaveLength(2);
      const after = (await loadPersistence(path)).store.snapshot();
      expect(after.activityEvents).toHaveLength(eventsBefore + 1);
      expect(after.operationHistories.find(({ id }) => id === historyId)?.revision).toBe(revision + 1);
    } finally {
      await client.close();
    }
  }, 20_000);

  /** Slice 54: per-call ownership registers one exit listener for the process, not one per call. */
  it('takes ownership per call without leaking an exit listener per call', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-mcp-stdio-listeners-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    await writeSeedFile('agent-heavy', { targetPath: path });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', join(here, 'stdio.ts')],
      cwd: join(here, '..'),
      env: { ...getDefaultEnvironment(), CWM_DATA_FILE: path, CWM_MCP_TOKEN: 'prototype-user-a-readwrite' },
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const client = new Client(
      { name: 'slice-54-stdio-listeners', version: '0.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    await client.connect(transport);
    try {
      for (let call = 0; call < 12; call += 1) {
        const result = await client.callTool({ name: 'list_tasks', arguments: { projectId: 'project-work-manager' } });
        expect(result.isError).not.toBe(true);
      }
      expect(stderr).not.toContain('MaxListenersExceededWarning');
      expect(await readdir(directory)).not.toContain('data.json.owner');
    } finally {
      await client.close();
    }
  }, 20_000);

  it('expires a removal over SDK stdio but restores retained prose and Activity after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-mcp-stdio-expiry-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'data.json');
    const sidecar = join(directory, 'expiry.txt');
    const projectId = 'project-work-manager';
    const prose = 'The exact retained words outlive the undo window.';
    await writeSeedFile('agent-heavy', { targetPath: path });
    const seed = JSON.parse(await readFile(path, 'utf8')) as {
      agentConnections: Array<{ id: string; permissions: string[]; lastUsedAt?: string }>;
    };
    const connection = seed.agentConnections.find(({ id }) => id === 'agent-claude')!;
    connection.permissions = [...new Set([...connection.permissions, 'projects.write'])];
    connection.lastUsedAt = new Date().toISOString();
    await writeFile(path, `${JSON.stringify(seed, null, 2)}\n`);

    const clockClient = async (mode: 'first' | 'reopen') => {
      const client = new Client(
        { name: 'slice-53-stdio-expiry', version: '0.0.0' },
        { versionNegotiation: { mode: { pin: '2026-07-28' } } },
      );
      await client.connect(new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', join(here, 'test/clock-stdio.ts'), sidecar, mode],
        cwd: join(here, '..'),
        env: { ...getDefaultEnvironment(), CWM_DATA_FILE: path, CWM_MCP_TOKEN: 'prototype-user-a-readwrite' },
        stderr: 'pipe',
      }));
      return client;
    };
    const state = async () => JSON.parse(await readFile(path, 'utf8')) as {
      sections: Array<{ id: string; archivedAt?: string; config: { text?: string } }>;
      operationHistories: Array<{ id: string; revision: number }>;
      operationActions: Array<{ id: string; state: string }>;
      activityEvents: Array<{ id: string; action: string; entityId: string; actor: string; actorAgentConnectionId?: string }>;
      agentConnections: Array<{ id: string; lastUsedAt?: string }>;
    };
    const archive = async (client: Client, sectionId: string) => {
      const result = await client.callTool({ name: 'get_project_archive', arguments: { projectId } });
      expect(result.isError).not.toBe(true);
      expect((result.structuredContent as { items: Array<{ section?: { id: string; config: { text?: string } } }> }).items)
        .toContainEqual(expect.objectContaining({ section: expect.objectContaining({ id: sectionId, config: { text: prose } }) }));
    };
    const history = async (client: Client) => {
      const result = await client.callTool({ name: 'get_operation_history', arguments: { projectId } });
      expect(result.isError).not.toBe(true);
      return result.structuredContent as { historyId: string; revision: number; undo: { actionId: string } | null };
    };
    const activityRead = async (eventId: string) => {
      const api = createApi(await loadPersistence(path));
      const events = await api.activity.list({ actor: 'user', workspaceId: 'workspace-demo', userId: 'user-demo' } as never);
      expect(events).toContainEqual(expect.objectContaining({ id: eventId, entityId: projectId, actor: 'agent', actorAgentConnectionId: 'agent-claude' }));
    };

    let sectionId!: string;
    let removal!: { historyId: string; actionId: string; revision: number; createdAt: string; expiresAt: string };
    let removalEventId!: string;
    const first = await clockClient('first');
    try {
      const created = await first.callTool({ name: 'create_section', arguments: { projectId, type: 'rich-text', title: 'Retained prose', config: { text: prose } } });
      expect(created.isError).not.toBe(true);
      sectionId = (created.structuredContent as { section: { id: string; config: { text: string } } }).section.id;
      expect((created.structuredContent as { section: { config: { text: string } } }).section.config.text).toBe(prose);
      const removed = await first.callTool({ name: 'remove_section', arguments: { sectionId } });
      expect(removed.isError).not.toBe(true);
      expect(removed.structuredContent).toMatchObject({ archiveListed: true, section: { id: sectionId, config: { text: prose } } });
      removal = (removed.structuredContent as { operation: typeof removal }).operation;
      expect(removal).toMatchObject({ operation: 'section.remove', expiresAt: expect.any(String) });
      expect(Date.parse(removal.expiresAt) - Date.parse(removal.createdAt)).toBe(86_400_000);
      const removedState = await state();
      expect(removedState.sections.find(({ id }) => id === sectionId)?.archivedAt).toEqual(expect.any(String));
      removalEventId = removedState.activityEvents.at(-1)!.id;
      expect(removedState.activityEvents.at(-1)).toMatchObject({ id: removalEventId, action: 'project.section_archived', entityId: projectId, actor: 'agent', actorAgentConnectionId: 'agent-claude' });
      await writeFile(sidecar, removal.expiresAt);
      // The child advances only after this call has produced its pre-expiry summary.
      expect(await history(first)).toMatchObject({ historyId: removal.historyId, revision: removal.revision,
        undo: { actionId: removal.actionId } });
      // Warm auth at the advanced clock, then prove another read no longer touches lastUsedAt.
      await history(first);
      const settled = await readFile(path, 'utf8');
      const expired = await history(first);
      expect(expired.undo).toBeNull();
      expect(await readFile(path, 'utf8')).toBe(settled);
      const baseline = await state();
      const refused = await first.callTool({ name: 'undo_operation', arguments: {
        historyId: removal.historyId, actionId: removal.actionId, expectedRevision: expired.revision,
      } });
      expect(refused.isError).toBe(true);
      expect(refused.content).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringMatching(/^history_expired:/) }));
      expect(refused.content).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining(removal.expiresAt) }));
      expect(await readFile(path, 'utf8')).toBe(settled);
      const after = await state();
      for (const key of ['sections', 'operationHistories', 'operationActions', 'activityEvents'] as const) expect(after[key]).toEqual(baseline[key]);
      await archive(first, sectionId);
    } finally {
      await first.close();
    }
    await activityRead(removalEventId);

    const second = await clockClient('reopen');
    let restoreEventId!: string;
    let restoreActionId!: string;
    try {
      await history(second); // settle authentication at the advanced clock
      expect((await history(second)).undo).toBeNull();
      await archive(second, sectionId);
      expect((await state()).activityEvents.some(({ id }) => id === removalEventId)).toBe(true);
      const before = await state();
      const restored = await second.callTool({ name: 'restore_section', arguments: { sectionId } });
      expect(restored.isError).not.toBe(true);
      expect(restored.structuredContent).toMatchObject({ section: { id: sectionId, config: { text: prose } }, operation: { operation: 'section.restore' } });
      restoreActionId = (restored.structuredContent as { operation: { actionId: string } }).operation.actionId;
      const after = await state();
      expect(after.sections.find(({ id }) => id === sectionId)?.archivedAt).toBeUndefined();
      expect(after.activityEvents).toHaveLength(before.activityEvents.length + 1);
      expect(after.operationActions.filter(({ id }) => !before.operationActions.some((old) => old.id === id)))
        .toEqual([expect.objectContaining({ id: restoreActionId, state: 'applied' })]);
      expect(after.operationHistories.find(({ id }) => id === removal.historyId)?.revision)
        .toBe(before.operationHistories.find(({ id }) => id === removal.historyId)!.revision + 1);
      restoreEventId = after.activityEvents.at(-1)!.id;
      expect(after.activityEvents.at(-1)).toMatchObject({ id: restoreEventId, action: 'project.section_restored', entityId: projectId, actor: 'agent', actorAgentConnectionId: 'agent-claude' });
      expect(after.operationActions.find(({ id }) => id === restoreActionId)).toMatchObject({ state: 'applied' });
    } finally {
      await second.close();
    }
    await activityRead(removalEventId);
    await activityRead(restoreEventId);

    const third = await clockClient('reopen');
    try {
      const final = await third.callTool({ name: 'list_sections', arguments: { projectId } });
      expect((final.structuredContent as Array<{ id: string; config: { text?: string } }>)).toContainEqual(expect.objectContaining({ id: sectionId, config: { text: prose } }));
      expect((await history(third)).undo?.actionId).toBe(restoreActionId);
      expect((await state()).activityEvents.map(({ id }) => id)).toEqual(expect.arrayContaining([removalEventId, restoreEventId]));
    } finally {
      await third.close();
    }
    await activityRead(removalEventId);
    await activityRead(restoreEventId);
  }, 30_000);
});
