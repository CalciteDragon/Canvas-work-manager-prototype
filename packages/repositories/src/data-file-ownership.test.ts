import * as nodeFs from 'node:fs/promises';
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireDataFileOwnership,
  DataFileInUseError,
  DataFileOwnerUnavailableError,
  type AcquireDataFileOwnershipOptions,
  type DataFileOwnerRecord,
  type OwnershipFileOperations,
} from './data-file-ownership';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const scratch = async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'cwm-owner-')));
  temporaryDirectories.push(directory);
  return { directory, dataPath: join(directory, 'data.json'), ownerPath: join(directory, 'data.json.owner') };
};

const nodeOperations: OwnershipFileOperations = {
  mkdir: nodeFs.mkdir,
  realpath: nodeFs.realpath,
  writeFile: nodeFs.writeFile,
  readFile: nodeFs.readFile,
  link: nodeFs.link,
  unlink: nodeFs.unlink,
};

const errorWithCode = (code: string) => Object.assign(new Error(`${code}: injected`), { code });

/** Instant sleeps, counted: the deadline is the sum of the sleeps, so tests need no timers. */
const countingSleep = () => {
  const sleep = vi.fn(async (_ms: number) => undefined);
  return sleep;
};

const readRecord = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as DataFileOwnerRecord;

const writeRecord = async (path: string, record: Partial<DataFileOwnerRecord>) =>
  writeFile(path, JSON.stringify({ kind: 'stdio', acquiredAt: '2026-09-29T00:00:00.000Z', dataPath: 'x', ...record }));

const alive = (...pids: number[]) => (pid: number) => pids.includes(pid);

const options = (overrides: Partial<AcquireDataFileOwnershipOptions> = {}): AcquireDataFileOwnershipOptions => ({
  kind: 'seed',
  waitMs: 0,
  sleep: countingSleep(),
  ...overrides,
});

describe('acquireDataFileOwnership', () => {
  it('creates a missing directory and records pid, kind, nonce and path', async () => {
    const { directory } = await scratch();
    const dataPath = join(directory, 'new', 'data.json');

    const ownership = await acquireDataFileOwnership(dataPath, options({ kind: 'http-host', pid: 101 }));

    const record = await readRecord(join(directory, 'new', 'data.json.owner'));
    expect(record).toEqual({
      pid: 101,
      nonce: ownership.record.nonce,
      kind: 'http-host',
      acquiredAt: expect.any(String),
      dataPath,
    });
    expect(record.nonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(ownership.ownerPath).toBe(join(directory, 'new', 'data.json.owner'));
    expect((await readdir(join(directory, 'new'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses behind a live owner after waitMs without touching its record', async () => {
    const { dataPath, ownerPath } = await scratch();
    const first = await acquireDataFileOwnership(dataPath, options({ kind: 'stdio', pid: 201 }));
    const sleep = countingSleep();
    const onWait = vi.fn();

    const refusal = acquireDataFileOwnership(dataPath, options({ pid: 202, waitMs: 200, sleep, onWait, isAlive: alive(201) }));

    await expect(refusal).rejects.toBeInstanceOf(DataFileInUseError);
    const message = ((await refusal.catch((error: unknown) => error)) as Error).message;
    expect(message).toMatch(/^data_file_in_use: /);
    expect(message).toContain(dataPath);
    expect(message).toContain('stdio pid 201');
    expect(message).toContain(first.record.acquiredAt);
    expect(message).toContain(`if pid 201 is not a Canvas Work Manager process, delete this file: ${ownerPath}`);
    expect(sleep).toHaveBeenCalledTimes(4);
    expect(onWait).toHaveBeenCalledOnce();
    expect(onWait).toHaveBeenCalledWith(expect.objectContaining({ pid: 201, kind: 'stdio' }));
    expect((await readRecord(ownerPath)).nonce).toBe(first.record.nonce);
  });

  it('names the host remedy and does not wait on a live http-host owner when told to skip it', async () => {
    const { dataPath } = await scratch();
    await acquireDataFileOwnership(dataPath, options({ kind: 'http-host', pid: 301 }));
    const sleep = countingSleep();
    const onWait = vi.fn();

    const refusal = acquireDataFileOwnership(dataPath, options({
      kind: 'stdio', pid: 302, waitMs: 5_000, sleep, onWait, isAlive: alive(301), skipWaitForKinds: ['http-host'],
    }));

    await expect(refusal).rejects.toThrow(/^data_file_in_use: .*http-host pid 301.*stop the host, or use its HTTP MCP endpoint/);
    expect(sleep).not.toHaveBeenCalled();
    expect(onWait).not.toHaveBeenCalled();
  });

  it('reclaims a dead http-host owner even when told to skip waiting on hosts', async () => {
    const { dataPath, ownerPath } = await scratch();
    const dead = await acquireDataFileOwnership(dataPath, options({ kind: 'http-host', pid: 401 }));

    const ownership = await acquireDataFileOwnership(dataPath, options({
      kind: 'stdio', pid: 402, waitMs: 5_000, isAlive: alive(), skipWaitForKinds: ['http-host'],
    }));

    const record = await readRecord(ownerPath);
    expect(record).toMatchObject({ pid: 402, kind: 'stdio', nonce: ownership.record.nonce });
    expect(record.nonce).not.toBe(dead.record.nonce);
  });

  it('ends within waitMs with data_file_owner_unavailable when link keeps failing and no owner file exists', async () => {
    const { dataPath, ownerPath } = await scratch();
    const sleep = countingSleep();
    const fs: OwnershipFileOperations = {
      ...nodeOperations,
      link: async (_from, to) => {
        if (to === ownerPath) throw errorWithCode('EPERM');
        return nodeOperations.link(_from, to);
      },
    };

    const refusal = acquireDataFileOwnership(dataPath, options({ waitMs: 200, sleep, fs }));

    await expect(refusal).rejects.toBeInstanceOf(DataFileOwnerUnavailableError);
    await expect(refusal).rejects.toThrow(/^data_file_owner_unavailable: .*EPERM/);
    await expect(refusal).rejects.toThrow(ownerPath);
    expect(sleep).toHaveBeenCalledTimes(4);
  });

  it('throws data_file_owner_unavailable at once for an unexpected link code', async () => {
    const { dataPath } = await scratch();
    const sleep = countingSleep();
    const fs: OwnershipFileOperations = { ...nodeOperations, link: async () => { throw errorWithCode('ENOTSUP'); } };

    await expect(acquireDataFileOwnership(dataPath, options({ waitMs: 5_000, sleep, fs })))
      .rejects.toThrow(/^data_file_owner_unavailable: .*ENOTSUP/);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('succeeds when a live owner releases within waitMs', async () => {
    const { dataPath, ownerPath } = await scratch();
    const first = await acquireDataFileOwnership(dataPath, options({ kind: 'stdio', pid: 501 }));
    const onWait = vi.fn();
    let sleeps = 0;
    const sleep = vi.fn(async () => {
      sleeps += 1;
      if (sleeps === 2) await first.release();
    });

    const second = await acquireDataFileOwnership(dataPath, options({ pid: 502, waitMs: 5_000, sleep, onWait, isAlive: alive(501) }));

    expect(onWait).toHaveBeenCalledOnce();
    expect((await readRecord(ownerPath)).nonce).toBe(second.record.nonce);
  });

  it('never unlinks an owner whose pid is alive but unrelated, and names the file to delete', async () => {
    const { dataPath, ownerPath } = await scratch();
    await writeRecord(ownerPath, { pid: 601, nonce: 'foreign', kind: 'http-host' });
    const before = await readFile(ownerPath, 'utf8');

    await expect(acquireDataFileOwnership(dataPath, options({ pid: 602, isAlive: alive(601) })))
      .rejects.toThrow(`if pid 601 is not a Canvas Work Manager process, delete this file: ${ownerPath}`);
    expect(await readFile(ownerPath, 'utf8')).toBe(before);
  });

  it('reclaims a dead owner with a new nonce and leaves no reclaim file behind', async () => {
    const { directory, dataPath, ownerPath } = await scratch();
    await writeRecord(ownerPath, { pid: 701, nonce: 'dead' });

    const ownership = await acquireDataFileOwnership(dataPath, options({ pid: 702, isAlive: alive() }));

    expect(await readRecord(ownerPath)).toMatchObject({ pid: 702, nonce: ownership.record.nonce, kind: 'seed' });
    expect(ownership.record.nonce).not.toBe('dead');
    expect((await readdir(directory)).sort()).toEqual(['data.json.owner']);
  });

  it('never lets a reclaimer that read a dead record unlink the record a faster reclaimer published', async () => {
    const { dataPath, ownerPath } = await scratch();
    await writeRecord(ownerPath, { pid: 801, nonce: 'dead' });
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => { openGate = resolve; });
    let reachedGate!: () => void;
    const atGate = new Promise<void>((resolve) => { reachedGate = resolve; });
    let held = false;
    const unlinked: string[] = [];
    const slowFs: OwnershipFileOperations = {
      ...nodeOperations,
      readFile: async (path, encoding) => {
        const content = await nodeOperations.readFile(path, encoding);
        if (path === ownerPath && !held) {
          held = true;
          reachedGate();
          await gate;
        }
        return content;
      },
      unlink: async (path) => {
        unlinked.push(path);
        return nodeOperations.unlink(path);
      },
    };

    const slow = acquireDataFileOwnership(dataPath, options({ pid: 802, fs: slowFs, isAlive: alive(803) }));
    await atGate;
    const fast = await acquireDataFileOwnership(dataPath, options({ pid: 803, isAlive: alive(803) }));
    openGate();

    await expect(slow).rejects.toThrow(/^data_file_in_use: .*seed pid 803/);
    expect(await readRecord(ownerPath)).toMatchObject({ pid: 803, nonce: fast.record.nonce });
    expect(unlinked).not.toContain(ownerPath);
  });

  it('refuses behind a reclaim file whose pid is dead, naming it, and leaves it in place', async () => {
    const { dataPath, ownerPath } = await scratch();
    await writeRecord(ownerPath, { pid: 901, nonce: 'dead-owner' });
    await writeRecord(`${ownerPath}.reclaim`, { pid: 902, nonce: 'dead-reclaimer' });

    await expect(acquireDataFileOwnership(dataPath, options({ pid: 903, isAlive: alive() })))
      .rejects.toThrow(new RegExp(`^data_file_in_use: .*delete this file: ${escape(`${ownerPath}.reclaim`)}`));
    expect((await readRecord(`${ownerPath}.reclaim`)).nonce).toBe('dead-reclaimer');
    expect((await readRecord(ownerPath)).nonce).toBe('dead-owner');
  });

  it.each(['EPERM', 'EBUSY'])('treats %s from link as an occupied owner file', async (code) => {
    const { dataPath, ownerPath } = await scratch();
    await writeRecord(ownerPath, { pid: 1001, nonce: 'live', kind: 'http-host' });
    const fs: OwnershipFileOperations = {
      ...nodeOperations,
      link: async (from, to) => {
        if (to === ownerPath) throw errorWithCode(code);
        return nodeOperations.link(from, to);
      },
    };

    await expect(acquireDataFileOwnership(dataPath, options({ pid: 1002, fs, isAlive: alive(1001) })))
      .rejects.toThrow(/^data_file_in_use: .*http-host pid 1001/);
  });

  it('retries at once, even with no wait, when the owner file vanishes between a failed link and the read', async () => {
    const { dataPath, ownerPath } = await scratch();
    await writeRecord(ownerPath, { pid: 1101, nonce: 'leaving' });
    const sleep = countingSleep();
    const fs: OwnershipFileOperations = {
      ...nodeOperations,
      readFile: async (path, encoding) => {
        if (path === ownerPath) {
          await nodeOperations.unlink(ownerPath);
          throw errorWithCode('ENOENT');
        }
        return nodeOperations.readFile(path, encoding);
      },
    };

    const ownership = await acquireDataFileOwnership(dataPath, options({ pid: 1102, waitMs: 0, sleep, fs, isAlive: alive(1101) }));

    expect((await readRecord(ownerPath)).nonce).toBe(ownership.record.nonce);
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each(['EPERM', 'EBUSY'])('treats %s from reading an owner file pending deletion as a vanished owner', async (code) => {
    const { dataPath, ownerPath } = await scratch();
    await writeRecord(ownerPath, { pid: 1151, nonce: 'leaving' });
    const fs: OwnershipFileOperations = {
      ...nodeOperations,
      readFile: async (path, encoding) => {
        if (path === ownerPath) {
          await nodeOperations.unlink(ownerPath);
          throw errorWithCode(code);
        }
        return nodeOperations.readFile(path, encoding);
      },
    };

    const ownership = await acquireDataFileOwnership(dataPath, options({ pid: 1152, fs, isAlive: alive(1151) }));

    expect((await readRecord(ownerPath)).nonce).toBe(ownership.record.nonce);
  });

  it('reclaims a record naming its own pid that this process does not hold, as a reused pid', async () => {
    const { dataPath, ownerPath } = await scratch();
    await writeRecord(ownerPath, { pid: 1161, nonce: 'before-the-crash', kind: 'http-host' });

    const ownership = await acquireDataFileOwnership(dataPath, options({ pid: 1161, isAlive: alive(1161) }));

    expect(await readRecord(ownerPath)).toMatchObject({ pid: 1161, nonce: ownership.record.nonce });
  });

  it('still refuses a record this process holds under the same pid', async () => {
    const { dataPath } = await scratch();
    await acquireDataFileOwnership(dataPath, options({ pid: 1171, kind: 'http-host' }));

    await expect(acquireDataFileOwnership(dataPath, options({ pid: 1171, isAlive: alive(1171) })))
      .rejects.toThrow(/^data_file_in_use: .*http-host pid 1171/);
  });

  it('reports a failed temp-file write as data_file_owner_unavailable', async () => {
    const { dataPath } = await scratch();
    const fs: OwnershipFileOperations = { ...nodeOperations, writeFile: async () => { throw errorWithCode('EACCES'); } };

    await expect(acquireDataFileOwnership(dataPath, options({ fs }))).rejects.toThrow(/^data_file_owner_unavailable: .*EACCES/);
  });

  it('treats an owner file absent at the reclaim re-check as a mismatch', async () => {
    const { dataPath, ownerPath } = await scratch();
    await writeRecord(ownerPath, { pid: 1201, nonce: 'dead' });
    let reads = 0;
    const unlinked: string[] = [];
    const fs: OwnershipFileOperations = {
      ...nodeOperations,
      readFile: async (path, encoding) => {
        if (path === ownerPath && ++reads === 2) {
          await nodeOperations.unlink(ownerPath);
          throw errorWithCode('ENOENT');
        }
        return nodeOperations.readFile(path, encoding);
      },
      unlink: async (path) => {
        unlinked.push(path);
        return nodeOperations.unlink(path);
      },
    };

    const ownership = await acquireDataFileOwnership(dataPath, options({ pid: 1202, waitMs: 200, fs, isAlive: alive() }));

    expect(unlinked).not.toContain(ownerPath);
    expect((await readRecord(ownerPath)).nonce).toBe(ownership.record.nonce);
  });

  it('refuses behind an unparsable owner file and never unlinks it', async () => {
    const { dataPath, ownerPath } = await scratch();
    await writeFile(ownerPath, 'not a record');

    await expect(acquireDataFileOwnership(dataPath, options({ isAlive: alive() })))
      .rejects.toThrow(new RegExp(`^data_file_in_use: .*delete this file: ${escape(ownerPath)}`));
    expect(await readFile(ownerPath, 'utf8')).toBe('not a record');
  });

  it.each(['release', 'releaseSync'] as const)('%s leaves another owner in place and tolerates a missing file', async (method) => {
    const { dataPath, ownerPath } = await scratch();
    const ownership = await acquireDataFileOwnership(dataPath, options());
    await writeRecord(ownerPath, { pid: 1301, nonce: 'someone-else' });

    await ownership[method]();
    expect((await readRecord(ownerPath)).nonce).toBe('someone-else');

    await nodeOperations.unlink(ownerPath);
    await expect(Promise.resolve().then(() => ownership[method]())).resolves.toBeUndefined();
  });

  it.each(['release', 'releaseSync'] as const)('%s removes its own record, and running both is harmless', async (method) => {
    const { dataPath, ownerPath } = await scratch();
    const ownership = await acquireDataFileOwnership(dataPath, options());

    await ownership[method]();
    ownership.releaseSync();
    await ownership.release();

    await expect(readFile(ownerPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps different data paths independent and treats two spellings of one path as the same file', async () => {
    const { directory, dataPath } = await scratch();
    await acquireDataFileOwnership(dataPath, options({ pid: 1401 }));

    const other = await acquireDataFileOwnership(join(directory, 'other.json'), options({ pid: 1402, isAlive: alive(1401) }));
    expect(other.record.pid).toBe(1402);

    await expect(acquireDataFileOwnership(relative(process.cwd(), dataPath), options({ pid: 1403, isAlive: alive(1401) })))
      .rejects.toThrow(/^data_file_in_use: .*seed pid 1401/);
  });
});

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
