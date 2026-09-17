import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@cwm/contracts';
import { upgradeOperationHistory } from './upgrade-operation-history';
import { upgradeProjectPages } from './upgrade-project-pages';

/**
 * `pnpm prototype:upgrade <path>` — the explicit entry point for converting a data file to the
 * current schema (§14). Explicit on purpose: live data is never converted as a side effect of
 * starting the host, because a conversion that ran itself is a conversion nobody chose.
 *
 * It sniffs the version first and then runs the named steps in order — version 2 → 3
 * (`upgradeProjectPages`, frozen) and version 3 → 4 (`upgradeOperationHistory`). The sniff comes
 * first because the frozen step refuses anything newer than version 3, so the "already current"
 * answer cannot be delegated to it. See docs/decisions/2026-09-schema-version-4-conversion.md.
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
  /** Version-3 Undo receipts retired by the conversion; history starts empty. */
  retiredReceipts: number;
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
  if (fromVersion !== 2 && fromVersion !== 3 && fromVersion !== SCHEMA_VERSION) {
    throw new RangeError(`cannot convert schema version ${fromVersion}: this build reads versions 2 and 3 and writes version ${SCHEMA_VERSION}`);
  }

  // The whole conversion happens — and the final document is validated — before a single byte is
  // written. A converter that discovered its output was unloadable *after* replacing the original
  // would have destroyed the file it exists to preserve.
  const version3 = fromVersion === 2 ? upgradeProjectPages(parsed).document : parsed;
  const { document, changed, retiredReceipts } = upgradeOperationHistory(version3);
  if (!changed) return { changed: false, fromVersion, retiredReceipts: 0 };

  // The original, kept verbatim, before the target is touched. Not a rollback mechanism —
  // just the copy someone will be glad of.
  await fileOperations.writeFile(backupPathFor(path, options.now ?? new Date()), source, 'utf8');

  // Temp file and rename, the way `seed-cli.ts` writes: a torn write leaves the original.
  const temporaryPath = `${path}.tmp`;
  await fileOperations.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await fileOperations.rename(temporaryPath, path);
  return { changed: true, fromVersion, retiredReceipts };
};

/** What the CLI prints for one result. Exported so the wording is tested, not only eyeballed. */
export const upgradeMessage = (path: string, result: UpgradeDataFileResult): string => {
  if (!result.changed) return `"${path}" is already at schema version ${SCHEMA_VERSION}. Nothing was written.\n`;
  const reset =
    result.retiredReceipts > 0
      ? ` ${result.retiredReceipts} Undo receipt${result.retiredReceipts === 1 ? '' : 's'} from version 3 ${result.retiredReceipts === 1 ? 'was' : 'were'} retired: Undo and Redo history starts empty.`
      : ' Undo and Redo history starts empty.';
  return `Converted "${path}" from schema version ${result.fromVersion} to ${SCHEMA_VERSION}.${reset} The original is beside it as a .backup-*.json file.\n`;
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
