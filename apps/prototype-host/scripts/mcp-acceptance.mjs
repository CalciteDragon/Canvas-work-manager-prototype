/** Slice 15's two-transport acceptance check (§49, §50, §59). */
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { SPEC_TOOL_NAMES } from '@cwm/mcp-tools';

const here = dirname(fileURLToPath(import.meta.url));
const hostRoot = join(here, '..');
const workspaceRoot = join(hostRoot, '..', '..');
const seedPath = join(hostRoot, '..', '..', 'prototype', 'seeds', 'agent-heavy.json');
const TOKEN = 'prototype-user-a-readwrite';
const PROJECT = 'project-work-manager';

const check = (condition, description) => {
  if (!condition) throw new Error(`FAILED: ${description}`);
  console.log(`  ok  ${description}`);
};

const modernClient = (name) =>
  new Client(
    { name, version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );

const assertClient = async (client, title) => {
  check(client.getProtocolEra() === 'modern', `${title} negotiated 2026-07-28`);
  const listed = await client.listTools();
  check(
    JSON.stringify(listed.tools.map(({ name }) => name)) === JSON.stringify(SPEC_TOOL_NAMES),
    `${title} lists the exact registry`,
  );
  const result = await client.callTool({
    name: 'create_task',
    arguments: { projectId: PROJECT, title: `Created over ${title}` },
  });
  check(result.isError !== true, `${title} creates a task`);
  const task = result.structuredContent;
  const archive = await client.callTool({
    name: 'get_project_archive',
    arguments: { projectId: PROJECT },
  });
  check(archive.isError !== true && Array.isArray(archive.structuredContent?.items), `${title} reads the Archive projection`);
  const archived = await client.callTool({ name: 'archive_task', arguments: { taskId: task.id } });
  check(archived.isError !== true, `${title} archives a task through the canonical tool`);
  const restored = await client.callTool({ name: 'restore_task', arguments: { taskId: task.id } });
  check(restored.isError !== true, `${title} restores a task through the canonical tool`);
  return task;
};

const assertPersisted = async (path, task, title) => {
  const document = JSON.parse(await readFile(path, 'utf8'));
  check(
    document.tasks.some(({ id, title: taskTitle }) => id === task.id && taskTitle === task.title),
    `${title} task is present in data.json`,
  );
};

const waitForExit = (child, timeoutMs) => {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.off('exit', finish);
      resolve(false);
    }, timeoutMs);
    child.once('exit', finish);
  });
};

const stopHost = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!child.kill()) return;
  if (await waitForExit(child, 2_000)) return;
  child.kill('SIGKILL');
  if (!(await waitForExit(child, 2_000))) throw new Error('host did not exit after SIGKILL');
};

const startHost = async (dataFile) => {
  const child = spawn(process.execPath, ['--import', 'tsx', join(hostRoot, 'main.ts')], {
    cwd: hostRoot,
    env: { ...process.env, CWM_DATA_FILE: dataFile, CWM_HOST_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  return await new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      child.off('exit', onEarlyExit);
      child.stdout.off('data', onData);
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      void stopHost(child).then(
        () => reject(new Error('host did not start within 20s')),
        reject,
      );
    }, 20_000);
    const onEarlyExit = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`host exited early with code ${code}`));
    };
    child.once('exit', onEarlyExit);
    const onData = (chunk) => {
      output += chunk.toString();
      const matched = /prototype-host listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (matched === null) return;
      settled = true;
      cleanup();
      resolve({ child, url: `http://127.0.0.1:${matched[1]}/mcp` });
    };
    child.stdout.on('data', onData);
  });
};

const root = await mkdtemp(join(tmpdir(), 'cwm-mcp-acceptance-'));
const httpFile = join(root, 'http.json');
const stdioFile = join(root, 'stdio.json');
let host;
let httpClient;
let stdioClient;

try {
  await Promise.all([copyFile(seedPath, httpFile), copyFile(seedPath, stdioFile)]);

  console.log('1. Streamable HTTP');
  const started = await startHost(httpFile);
  host = started.child;
  httpClient = modernClient('slice-15-http-acceptance');
  await httpClient.connect(
    new StreamableHTTPClientTransport(new globalThis.URL(started.url), {
      authProvider: { token: async () => TOKEN },
    }),
  );
  const httpTask = await assertClient(httpClient, 'HTTP');
  await httpClient.close();
  httpClient = undefined;
  await stopHost(host);
  host = undefined;
  await assertPersisted(httpFile, httpTask, 'HTTP');

  console.log('\n2. stdio');
  stdioClient = modernClient('slice-15-stdio-acceptance');
  await stdioClient.connect(
    new StdioClientTransport({
      command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      args: ['--silent', '--dir', workspaceRoot, 'mcp:stdio'],
      cwd: workspaceRoot,
      env: { ...getDefaultEnvironment(), CWM_DATA_FILE: stdioFile, CWM_MCP_TOKEN: TOKEN },
      stderr: 'inherit',
    }),
  );
  const stdioTask = await assertClient(stdioClient, 'stdio');
  await stdioClient.close();
  stdioClient = undefined;
  await assertPersisted(stdioFile, stdioTask, 'stdio');

  console.log('\nMCP acceptance: both transports passed');
} catch (error) {
  console.error(`\nMCP acceptance: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (httpClient !== undefined) await httpClient.close();
  if (stdioClient !== undefined) await stdioClient.close();
  if (host !== undefined) await stopHost(host);
  await rm(root, { recursive: true, force: true });
}
