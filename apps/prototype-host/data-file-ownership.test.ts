import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { SPEC_TOOL_NAMES } from '@cwm/mcp-tools';
import { seedDataFileOwned, upgradeDataFileOwned, writeSeedFile } from '@cwm/prototype-data';
import { acquireDataFileOwnership, type DataFileOwnerRecord } from '@cwm/repositories';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Slice 54 — one writer per data file, across real processes: the host owns its file for life,
 * stdio per call, and the seed and upgrade CLIs are refused while either holds it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const directories: string[] = [];
const children: ChildProcess[] = [];
const clients: Client[] = [];
const isWindows = process.platform === 'win32';

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const scratch = async (seed = true) => {
  const directory = await mkdtemp(join(tmpdir(), 'cwm-ownership-'));
  directories.push(directory);
  const path = join(directory, 'data.json');
  if (seed) await writeSeedFile('agent-heavy', { targetPath: path });
  return { directory, path, ownerPath: `${path}.owner` };
};

/** A spawned child with its output collected and a way to wait for a line. */
const watch = (child: ChildProcess) => {
  children.push(child);
  const output = { stdout: '', stderr: '' };
  const waiters: Array<() => void> = [];
  const notify = () => waiters.splice(0).forEach((wake) => wake());
  child.stdout?.on('data', (chunk: Buffer) => { output.stdout += chunk.toString(); notify(); });
  child.stderr?.on('data', (chunk: Buffer) => { output.stderr += chunk.toString(); notify(); });
  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => { notify(); resolve(code); }));
  const waitFor = async (pattern: RegExp, stream: 'stdout' | 'stderr' = 'stdout'): Promise<RegExpMatchArray> => {
    for (;;) {
      const match = output[stream].match(pattern);
      if (match !== null) return match;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`child exited before ${pattern}: ${output.stdout}\n${output.stderr}`);
      }
      await new Promise<void>((wake) => waiters.push(wake));
    }
  };
  return { child, output, exited, waitFor };
};

const spawnHost = (path: string, port = 0) =>
  watch(spawn(process.execPath, ['--import', 'tsx', join(here, 'main.ts')], {
    cwd: here,
    env: { ...process.env, CWM_DATA_FILE: path, CWM_HOST_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  }));

const startHost = async (path: string) => {
  const host = spawnHost(path);
  const [, port] = await host.waitFor(/prototype-host listening on http:\/\/127\.0\.0\.1:(\d+)/);
  return { ...host, origin: `http://127.0.0.1:${port}` };
};

const ownerChild = (path: string, kind: string) =>
  watch(spawn(process.execPath, ['--import', 'tsx', join(here, 'test/owner-child.ts'), path, kind], {
    cwd: here,
    stdio: ['pipe', 'pipe', 'pipe'],
  }));

const stdioParameters = (path: string) => ({
  command: process.execPath,
  args: ['--import', 'tsx', join(here, 'mcp/stdio.ts')],
  cwd: here,
  env: { ...getDefaultEnvironment(), CWM_DATA_FILE: path, CWM_MCP_TOKEN: 'prototype-user-a-readwrite' },
  stderr: 'pipe' as const,
});

const newClient = () => {
  const client = new Client(
    { name: 'slice-54-ownership', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  clients.push(client);
  return client;
};

const connectStdio = async (path: string) => {
  const client = newClient();
  await client.connect(new StdioClientTransport(stdioParameters(path)));
  return client;
};

const createTask = (client: Client, title: string) =>
  client.callTool({ name: 'create_task', arguments: { projectId: 'project-work-manager', title } });

const textOf = (result: { content?: unknown }) => ((result.content as Array<{ text?: string }>)[0]?.text ?? '');

const taskIdOf = (result: { structuredContent?: unknown }) => (result.structuredContent as { task: { id: string } }).task.id;

const readRecord = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as DataFileOwnerRecord;

const pidIsAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The directory, less the owner file and its transient link temp files. */
const listing = async (directory: string) =>
  (await readdir(directory)).filter((name) => !name.startsWith('data.json.owner')).sort();

type State = { tasks: Array<{ id: string; title: string }>; activityEvents: Array<{ action: string; entityId: string }> };
const state = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as State;

describe('one writer per data file (Slice 54)', () => {
  it('refuses stdio and the CLIs while the host owns the file, and hands over when it stops', async () => {
    const { directory, path, ownerPath } = await scratch();
    const host = await startHost(path);
    const hostPid = host.child.pid!;

    // Stdio still starts and lists tools: definitions come from a plain read.
    const client = await connectStdio(path);
    expect((await client.listTools()).tools).toHaveLength(SPEC_TOOL_NAMES.length);

    const before = await readFile(path, 'utf8');
    const refused = await createTask(client, 'Refused behind the host');
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toMatch(/^data_file_in_use: /);
    expect(textOf(refused)).toContain(`http-host pid ${hostPid}`);
    expect(textOf(refused)).toContain(ownerPath);
    expect(await readFile(path, 'utf8')).toBe(before);

    // The seed, reset and upgrade CLIs are writers too.
    const files = await listing(directory);
    await expect(seedDataFileOwned('agent-heavy', { targetPath: path })).rejects.toThrow(/^data_file_in_use: .*http-host/);
    await expect(upgradeDataFileOwned(path)).rejects.toThrow(/^data_file_in_use: .*http-host/);
    expect(await readFile(path, 'utf8')).toBe(before);
    expect(await listing(directory)).toEqual(files);

    // The owner's own writes still land.
    const response = await fetch(`${host.origin}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' },
      body: JSON.stringify({ projectId: 'project-work-manager', title: 'Written by the host' }),
    });
    expect(response.status).toBe(201);
    expect((await state(path)).tasks.map(({ title }) => title)).toContain('Written by the host');

    // A second host on the same file is refused and leaves the record alone.
    const nonce = (await readRecord(ownerPath)).nonce;
    const second = spawnHost(path);
    expect(await second.exited).toBe(1);
    expect(second.output.stderr).toContain('data_file_in_use:');
    expect((await readRecord(ownerPath)).nonce).toBe(nonce);

    host.child.kill('SIGTERM');
    await host.exited;
    if (isWindows) {
      // `kill` is TerminateProcess on Windows: no handler runs, so the record is left for reclaim.
      expect(pidIsAlive((await readRecord(ownerPath)).pid)).toBe(false);
    } else {
      await expect(readFile(ownerPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    }

    // The same stdio process now writes, on top of the host's write.
    const landed = await createTask(client, 'Written by stdio');
    expect(landed.isError).not.toBe(true);
    const titles = (await state(path)).tasks.map(({ title }) => title);
    expect(titles.indexOf('Written by the host')).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf('Written by stdio')).toBeGreaterThan(titles.indexOf('Written by the host'));

    // An idle stdio client holds nothing: the host restarts, and stdio is refused again.
    const restarted = await startHost(path);
    const again = await createTask(client, 'Refused again');
    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain(`http-host pid ${restarted.child.pid}`);
    restarted.child.kill('SIGTERM');
    await restarted.exited;
  }, 60_000);

  it('makes the host wait for a stdio turn, and refuses it when the turn does not end', async () => {
    const { path } = await scratch();
    const owner = ownerChild(path, 'stdio');
    await owner.waitFor(/^owned$/m);

    const host = spawnHost(path);
    await host.waitFor(new RegExp(`prototype-host waiting for data file owned by stdio pid ${owner.child.pid}`));
    owner.child.stdin!.write('release\n');
    await host.waitFor(/prototype-host listening on/);
    host.child.kill('SIGTERM');
    await host.exited;

    const stuck = ownerChild(path, 'stdio');
    await stuck.waitFor(/^owned$/m);
    const refused = spawnHost(path);
    await refused.waitFor(new RegExp(`prototype-host waiting for data file owned by stdio pid ${stuck.child.pid}`));
    expect(await refused.exited).toBe(1);
    expect(refused.output.stderr).toContain('data_file_in_use:');
  }, 60_000);

  it('lets two stdio processes take turns so both concurrent writes land', async () => {
    const { path } = await scratch();
    const [first, second] = await Promise.all([connectStdio(path), connectStdio(path)]);
    const before = await state(path);

    const results = await Promise.all([createTask(first, 'From the first'), createTask(second, 'From the second')]);

    for (const result of results) expect(result.isError).not.toBe(true);
    const ids = results.map(taskIdOf);
    const after = await state(path);
    expect(after.tasks.map(({ id }) => id)).toEqual(expect.arrayContaining(ids));
    const created = after.activityEvents.slice(before.activityEvents.length);
    expect(created.filter(({ action }) => action === 'task.created').map(({ entityId }) => entityId).sort()).toEqual([...ids].sort());
    const revisions = results.map((result) => (result.structuredContent as { operation: { revision: number } }).operation.revision);
    expect(new Set(revisions).size).toBe(2);
  }, 60_000);

  it('reclaims the record of a hard-killed owner without manual steps', async () => {
    const { path, ownerPath } = await scratch();
    const owner = ownerChild(path, 'stdio');
    await owner.waitFor(/^owned$/m);
    const dead = await readRecord(ownerPath);
    owner.child.kill('SIGKILL');
    await owner.exited;

    const ownership = await acquireDataFileOwnership(path, { kind: 'seed', waitMs: 0 });

    expect(await readRecord(ownerPath)).toMatchObject({ pid: process.pid, nonce: ownership.record.nonce });
    expect(ownership.record.nonce).not.toBe(dead.nonce);
    await ownership.release();
  }, 30_000);

  it('releases the file when the host fails to start after acquiring it', async () => {
    const { path, ownerPath } = await scratch();
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    try {
      const host = spawnHost(path, (blocker.address() as AddressInfo).port);
      expect(await host.exited).toBe(1);
      expect(host.output.stderr).toContain('EADDRINUSE');
      await expect(readFile(ownerPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  }, 30_000);

  it('survives a seeding race at stdio start-up by loading the file the winner wrote', async () => {
    const { path } = await scratch(false);
    const owner = ownerChild(path, 'http-host');
    await owner.waitFor(/^owned$/m);
    // A subclass probes in place: the SDK's base transport would run start-up on a throwaway
    // sibling whose stderr is discarded, hiding the waiting line this test is sequenced on.
    const transport = new (class InPlaceStdioTransport extends StdioClientTransport {})(stdioParameters(path));
    let stderr = '';
    let sawWait!: () => void;
    const waiting = new Promise<void>((resolve) => { sawWait = resolve; });
    transport.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes(`canvas-work-manager stdio waiting for data file owned by http-host pid ${owner.child.pid}`)) sawWait();
    });
    const client = newClient();
    const connected = client.connect(transport);

    await waiting;
    owner.child.stdin!.write('seed\n');
    await owner.waitFor(/^seeded$/m);
    await connected;

    expect((await client.listTools()).tools).toHaveLength(SPEC_TOOL_NAMES.length);
    const refused = await createTask(client, 'Refused behind the seeding host');
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toMatch(/^data_file_in_use: .*http-host/);
  }, 60_000);

  it('keeps an owner of one file from blocking another file', async () => {
    const first = await scratch();
    const second = await scratch();
    const host = await startHost(first.path);
    const client = await connectStdio(second.path);

    const landed = await createTask(client, 'On the other file');

    expect(landed.isError).not.toBe(true);
    expect((await state(second.path)).tasks.some(({ id }) => id === taskIdOf(landed))).toBe(true);
    expect((await fetch(`${host.origin}/prototype/health`)).ok).toBe(true);
    host.child.kill('SIGTERM');
    await host.exited;
  }, 60_000);
});
