import { randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import { link, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * One writer per data file (§14, §15; docs/decisions/2026-09-one-writer-per-data-file.md).
 *
 * Every process that writes a canonical JSON file — the HTTP host for its lifetime, a stdio call
 * for its turn, the seed, reset and upgrade CLIs, the e2e preparation — first publishes an owner
 * record beside it, `<data file>.owner`. A second writer waits for its turn up to a bound, then is
 * refused with `data_file_in_use:` naming the owner and the file to delete by hand.
 *
 * Advisory and deliberately small: one file per data path on one machine, no lease, heartbeat or
 * lock service (§71, §80). It is disposable with the JSON store it guards. Only entrypoints
 * acquire; the library functions (`loadPersistence`, `writeSeedFile`, `upgradeDataFile`) do not.
 */

/** Who holds the file. The kind picks the remedy a refusal names. */
export type DataFileOwnerKind = 'http-host' | 'stdio' | 'seed' | 'upgrade' | 'e2e-prepare';

/** The owner file's content. Internal to this package: no contract, no reader outside it. */
export interface DataFileOwnerRecord {
  pid: number;
  /** Tells this acquisition apart from any other by the same pid; release and reclaim check it. */
  nonce: string;
  kind: DataFileOwnerKind;
  /** Operator metadata for the refusal message, not a domain timestamp. */
  acquiredAt: string;
  dataPath: string;
}

/** Injected so tests can produce Windows error codes and gate the reclaim interleaving. */
export interface OwnershipFileOperations {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  realpath(path: string): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  link(existingPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface AcquireDataFileOwnershipOptions {
  kind: DataFileOwnerKind;
  /** How long to wait for a live owner, in total across every retry. Defaults to 0: refuse at once. */
  waitMs?: number;
  /** Called once, when the acquirer starts waiting on a live owner. */
  onWait?: (owner: DataFileOwnerRecord) => void;
  /**
   * Refuse a live owner of these kinds at once instead of waiting. A stdio call passes
   * `['http-host']`: a host never releases soon. A dead owner of any kind is still reclaimed.
   */
  skipWaitForKinds?: readonly DataFileOwnerKind[];
  fs?: OwnershipFileOperations;
  isAlive?: (pid: number) => boolean;
  pid?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** A held owner file. Both releases are nonce-checked and idempotent. */
export interface DataFileOwnership {
  readonly ownerPath: string;
  readonly record: DataFileOwnerRecord;
  /** Removes the owner file only while it still holds this acquisition's nonce. */
  release(): Promise<void>;
  /** The same, synchronously, for a `process.on('exit')` listener. */
  releaseSync(): void;
}

/** Another live process owns the file, or a record nobody can vouch for sits in the way. */
export class DataFileInUseError extends Error {
  constructor(message: string, readonly ownerPath: string, readonly owner?: DataFileOwnerRecord) {
    super(message);
    this.name = 'DataFileInUseError';
  }
}

/** Publishing the owner file failed with no owner to name: a filesystem that refuses the link. */
export class DataFileOwnerUnavailableError extends Error {
  constructor(readonly code: string, readonly ownerPath: string) {
    super(`data_file_owner_unavailable: could not publish the owner file ${ownerPath} (${code})`);
    this.name = 'DataFileOwnerUnavailableError';
  }
}

const RETRY_MS = 50;

/** `EPERM` and `EBUSY` are what Windows reports for a file that is pending deletion. */
const OCCUPIED = new Set(['EEXIST', 'EPERM', 'EBUSY']);

const nodeOperations: OwnershipFileOperations = { mkdir, realpath, writeFile, readFile, link, unlink };

const codeOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : 'UNKNOWN';

/** `EPERM` means the pid exists but belongs to someone else: alive. */
const pidIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return codeOf(error) === 'EPERM';
  }
};

const REMEDIES: Record<DataFileOwnerKind, string> = {
  'http-host': 'stop the host, or use its HTTP MCP endpoint',
  stdio: 'wait for its tool call to finish, then retry',
  seed: 'wait for the seed or reset to finish, then retry',
  upgrade: 'wait for the upgrade to finish, then retry',
  'e2e-prepare': 'wait for the e2e preparation to finish, then retry',
};

const parseRecord = (source: string): DataFileOwnerRecord | undefined => {
  try {
    const parsed = JSON.parse(source) as Partial<DataFileOwnerRecord>;
    if (typeof parsed.pid !== 'number' || typeof parsed.nonce !== 'string' || typeof parsed.kind !== 'string') return undefined;
    return parsed as DataFileOwnerRecord;
  } catch {
    return undefined;
  }
};

const inUse = (dataPath: string, path: string, owner: DataFileOwnerRecord | undefined): DataFileInUseError =>
  owner === undefined
    ? new DataFileInUseError(
      `data_file_in_use: ${dataPath} is guarded by an unreadable owner file; ` +
        `if no Canvas Work Manager process is using this data file, delete this file: ${path}`,
      path,
    )
    : new DataFileInUseError(
      `data_file_in_use: ${dataPath} is owned by ${owner.kind} pid ${owner.pid} since ${owner.acquiredAt}; ` +
        `${REMEDIES[owner.kind] ?? 'wait for it to finish, then retry'}. ` +
        `if pid ${owner.pid} is not a Canvas Work Manager process, delete this file: ${path}`,
      path,
      owner,
    );

type Read = { state: 'absent' } | { state: 'unreadable' } | { state: 'record'; record: DataFileOwnerRecord };

/**
 * Take ownership of `dataPath`, waiting at most `waitMs` for a live owner.
 *
 * The record is written whole to a temp file and published with `link`, so a reader never sees a
 * partial record. A dead owner is reclaimed under a second linked file, `<owner>.reclaim`, and
 * only when the owner file still holds the dead record's nonce — so a slower reclaimer can never
 * unlink the record a faster one just published. A live owner, an unreadable record or a reclaim
 * file left by a dead pid is never removed: the refusal names the file to delete by hand.
 *
 * @throws DataFileInUseError when the file stays owned past `waitMs` (message `data_file_in_use:`).
 * @throws DataFileOwnerUnavailableError when publishing fails with no owner to name.
 */
export const acquireDataFileOwnership = async (
  dataPath: string,
  options: AcquireDataFileOwnershipOptions,
): Promise<DataFileOwnership> => {
  const fs = options.fs ?? nodeOperations;
  const isAlive = options.isAlive ?? pidIsAlive;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const waitMs = options.waitMs ?? 0;
  const skip = new Set(options.skipWaitForKinds ?? []);

  const absolute = resolve(dataPath);
  await fs.mkdir(dirname(absolute), { recursive: true });
  const canonical = join(await fs.realpath(dirname(absolute)), basename(absolute));
  const ownerPath = `${canonical}.owner`;
  const reclaimPath = `${ownerPath}.reclaim`;
  const record: DataFileOwnerRecord = {
    pid: options.pid ?? process.pid,
    nonce: randomUUID(),
    kind: options.kind,
    acquiredAt: new Date().toISOString(),
    dataPath: canonical,
  };
  const serialized = JSON.stringify(record);

  let lastCode = 'EEXIST';
  /** Publish `serialized` at `target` by link; true when published, false when occupied. */
  const publish = async (target: string): Promise<boolean> => {
    const temporary = `${target}.${record.nonce}.tmp`;
    await fs.writeFile(temporary, serialized, 'utf8');
    try {
      await fs.link(temporary, target);
      return true;
    } catch (error) {
      const code = codeOf(error);
      if (!OCCUPIED.has(code)) throw new DataFileOwnerUnavailableError(code, target);
      lastCode = code;
      return false;
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
  };

  const read = async (path: string): Promise<Read> => {
    try {
      const parsed = parseRecord(await fs.readFile(path, 'utf8'));
      return parsed === undefined ? { state: 'unreadable' } : { state: 'record', record: parsed };
    } catch (error) {
      if (codeOf(error) === 'ENOENT') return { state: 'absent' };
      throw error;
    }
  };

  const release = async (): Promise<void> => {
    const current = await read(ownerPath);
    if (current.state !== 'record' || current.record.nonce !== record.nonce) return;
    await fs.unlink(ownerPath).catch((error: unknown) => {
      if (codeOf(error) !== 'ENOENT') throw error;
    });
  };
  const releaseSync = (): void => {
    try {
      if (parseRecord(readFileSync(ownerPath, 'utf8'))?.nonce !== record.nonce) return;
      unlinkSync(ownerPath);
    } catch (error) {
      if (codeOf(error) !== 'ENOENT') throw error;
    }
  };
  const owned: DataFileOwnership = { ownerPath, record, release, releaseSync };

  /**
   * Holding the reclaim file, replace `dead` only if the owner file still holds its nonce.
   * Returns the ownership, or what now stands in the way.
   */
  const reclaim = async (dead: DataFileOwnerRecord): Promise<{ owned: true } | { blocker: Read; path: string }> => {
    if (!(await publish(reclaimPath))) {
      const reclaimer = await read(reclaimPath);
      if (reclaimer.state === 'record' && !isAlive(reclaimer.record.pid)) {
        // Never stolen, not even from a dead reclaimer: the operator removes it by hand.
        throw inUse(canonical, reclaimPath, reclaimer.record);
      }
      if (reclaimer.state === 'unreadable') throw inUse(canonical, reclaimPath, undefined);
      // Another reclaimer is at work, or has just finished: start over within the deadline.
      return reclaimer.state === 'record'
        ? { blocker: reclaimer, path: reclaimPath }
        : { blocker: { state: 'record', record: dead }, path: ownerPath };
    }
    try {
      const current = await read(ownerPath);
      if (current.state !== 'record' || current.record.nonce !== dead.nonce) return { blocker: current, path: ownerPath };
      await fs.unlink(ownerPath);
      if (await publish(ownerPath)) return { owned: true };
      return { blocker: await read(ownerPath), path: ownerPath };
    } finally {
      await fs.unlink(reclaimPath).catch(() => undefined);
    }
  };

  let waited = 0;
  let announced = false;
  let vanishedOnce = false;
  /** Every retry, of any cause, sleeps and counts against the one deadline. */
  const retry = async (blocker: Read, path: string): Promise<void> => {
    if (waited + RETRY_MS > waitMs) {
      if (blocker.state === 'absent') throw new DataFileOwnerUnavailableError(lastCode, ownerPath);
      throw inUse(canonical, path, blocker.state === 'record' ? blocker.record : undefined);
    }
    await sleep(RETRY_MS);
    waited += RETRY_MS;
  };

  for (;;) {
    if (await publish(ownerPath)) return owned;

    const current = await read(ownerPath);
    if (current.state === 'absent') {
      // The owner vanished between the link and the read — or `link` refused with no owner at all.
      // The first time, retry at once: a zero-wait command must not be refused for a race it lost
      // by microseconds. After that, only within the deadline, so a persistent refusal ends.
      if (!vanishedOnce) {
        vanishedOnce = true;
        continue;
      }
      await retry(current, ownerPath);
      continue;
    }
    if (current.state === 'unreadable') {
      await retry(current, ownerPath);
      continue;
    }

    const owner = current.record;
    // Liveness first: a dead owner of any kind is reclaimed, including a skipped kind.
    if (!isAlive(owner.pid)) {
      const outcome = await reclaim(owner);
      if ('owned' in outcome) return owned;
      await retry(outcome.blocker, outcome.path);
      continue;
    }
    if (skip.has(owner.kind)) throw inUse(canonical, ownerPath, owner);
    if (!announced && waitMs >= RETRY_MS) {
      announced = true;
      options.onWait?.(owner);
    }
    await retry(current, ownerPath);
  }
};
