import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@cwm/contracts';
import { upgradeActivityIdentity } from './upgrade-activity-identity';
import { upgradeOperationHistory } from './upgrade-operation-history';
import { upgradeProjectPages } from './upgrade-project-pages';

/**
 * `pnpm prototype:upgrade <path>` — the explicit entry point for converting a data file to the
 * current schema (§14). Explicit on purpose: live data is never converted as a side effect of
 * starting the host, because a conversion that ran itself is a conversion nobody chose.
 *
 * It sniffs the version first and then runs the named steps in order — version 2 → 3
 * (`upgradeProjectPages`, frozen), version 3 → 4 (`upgradeOperationHistory`, frozen) and version
 * 4 → 5 (`upgradeActivityIdentity`). The sniff comes first because the frozen steps refuse
 * anything newer than the version they read, so the "already current" answer cannot be delegated
 * to them. The chain is explicit: a file at 2 runs 2 → 3 → 4 → 5, a file at 3 runs 3 → 4 → 5, a
 * file at 4 runs 4 → 5, and a file already at 5 is validated and nothing is written. Only the last
 * step validates, and it does so before a byte is written, which is what keeps a broken conversion
 * from destroying the file it exists to preserve.
 * See docs/decisions/2026-09-schema-version-4-conversion.md and
 * docs/decisions/2026-09-schema-version-5-conversion.md.
 */

/** Injected so the failure paths — and there are three — are testable without a disk. */
export interface UpgradeFileOperations {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export interface UpgradeDataFileOptions {
  fileOperations?: UpgradeFileOperations;
  /** The backup's timestamp. Injected so a test can name the file it expects. */
  now?: Date;
}

export interface UpgradeDataFileResult {
  changed: boolean;
  /** The version the file was at before, for the CLI's message. */
  fromVersion: number;
  /** Version-3 Undo receipts retired by the conversion. Only a file at version 3 or 2 has any. */
  retiredReceipts: number;
  /** Activity events that gained a captured target identity (version 5). */
  backfilledEvents: number;
}

const nodeFileOperations: UpgradeFileOperations = { readFile, writeFile, rename };

/** Colons are legal in an ISO string and not in a Windows filename. */
const backupPathFor = (path: string, now: Date): string =>
  `${path}.backup-${now.toISOString().replace(/[:.]/g, '-')}.json`;

/** The version a parsed file claims, before anything else is trusted about it. */
const versionOf = (parsed: unknown): number => {
  const version = typeof parsed === 'object' && parsed !== null ? (parsed as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (typeof version !== 'number') throw new TypeError('input is not a prototype document: it has no schemaVersion');
  return version;
};

export const upgradeDataFile = async (
  path: string,
  options: UpgradeDataFileOptions = {},
): Promise<UpgradeDataFileResult> => {
  const fileOperations = options.fileOperations ?? nodeFileOperations;
  const source = await fileOperations.readFile(path, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (cause) {
    throw new TypeError(`"${path}" is not valid JSON`, { cause });
  }

  const fromVersion = versionOf(parsed);
  if (![2, 3, 4, SCHEMA_VERSION].includes(fromVersion)) {
    throw new RangeError(
      `cannot convert schema version ${fromVersion}: this build reads versions 2, 3 and 4 and writes version ${SCHEMA_VERSION}`,
    );
  }

  // The whole conversion happens — and the final document is validated — before a single byte is
  // written. A converter that discovered its output was unloadable *after* replacing the original
  // would have destroyed the file it exists to preserve.
  const version3 = fromVersion === 2 ? upgradeProjectPages(parsed).document : parsed;
  const history = upgradeOperationHistory(version3);
  const { document, changed, backfilledEvents } = upgradeActivityIdentity(history.document);
  const retiredReceipts = history.changed ? history.retiredReceipts : 0;
  if (!changed && !history.changed) return { changed: false, fromVersion, retiredReceipts: 0, backfilledEvents: 0 };

  // The original, kept verbatim, before the target is touched. Not a rollback mechanism —
  // just the copy someone will be glad of.
  await fileOperations.writeFile(backupPathFor(path, options.now ?? new Date()), source, 'utf8');

  // Temp file and rename, the way `seed-cli.ts` writes: a torn write leaves the original.
  const temporaryPath = `${path}.tmp`;
  await fileOperations.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await fileOperations.rename(temporaryPath, path);
  return { changed: true, fromVersion, retiredReceipts, backfilledEvents };
};

/**
 * What the CLI prints for one result. Exported so the wording is tested, not only eyeballed.
 *
 * It no longer claims version-4 history starts empty, because from version 4 onward it does not:
 * only the version-3 step retires receipts, and a file already at 4 keeps every action it holds.
 */
export const upgradeMessage = (path: string, result: UpgradeDataFileResult): string => {
  if (!result.changed) return `"${path}" is already at schema version ${SCHEMA_VERSION}. Nothing was written.\n`;
  const sentences = [`Converted "${path}" from schema version ${result.fromVersion} to ${SCHEMA_VERSION}.`];
  if (result.retiredReceipts > 0) {
    const one = result.retiredReceipts === 1;
    sentences.push(
      `${result.retiredReceipts} Undo receipt${one ? '' : 's'} from version 3 ${one ? 'was' : 'were'} retired.`,
    );
  } else if (result.fromVersion <= 3) {
    sentences.push('Undo and Redo history starts empty.');
  } else {
    sentences.push('Every Undo and Redo action was preserved.');
  }
  if (result.backfilledEvents > 0) {
    const one = result.backfilledEvents === 1;
    sentences.push(
      `${result.backfilledEvents} activity event${one ? '' : 's'} gained the captured identity of ${one ? 'its' : 'their'} target.`,
    );
  }
  sentences.push('The original is beside it as a .backup-*.json file.');
  return `${sentences.join(' ')}\n`;
};

/**
 * `pnpm --filter` runs the script with the *package* as its cwd, so a path a person typed at
 * the repository root would silently resolve inside `packages/prototype-data` and fail as "not
 * found". pnpm records where the command was actually invoked in `INIT_CWD`; that is the
 * directory a typed path means.
 */
const resolveFromCaller = (path: string): string => resolve(process.env['INIT_CWD'] ?? process.cwd(), path);

const run = async (): Promise<void> => {
  const [path, ...extraArguments] = process.argv.slice(2);
  if (path === undefined || extraArguments.length > 0) {
    throw new RangeError('Expected one path. Usage: pnpm prototype:upgrade <path to data.json>');
  }
  process.stdout.write(upgradeMessage(path, await upgradeDataFile(resolveFromCaller(path))));
};

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
