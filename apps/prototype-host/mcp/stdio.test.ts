import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
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
