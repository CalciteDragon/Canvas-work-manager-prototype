import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
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
});
