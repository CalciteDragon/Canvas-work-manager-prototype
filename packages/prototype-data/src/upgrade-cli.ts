import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { upgradeProjectPages } from './upgrade-project-pages';

/**
 * `pnpm prototype:upgrade <path>` — the explicit entry point for the version-2 → version-3
 * conversion (§14). Explicit on purpose: live data is never converted as a side effect of
 * starting the host, because a conversion that ran itself is a conversion nobody chose.
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

const nodeFileOperations: UpgradeFileOperations = { readFile, writeFile, rename };

/** Colons are legal in an ISO string and not in a Windows filename. */
const backupPathFor = (path: string, now: Date): string =>
  `${path}.backup-${now.toISOString().replace(/[:.]/g, '-')}.json`;

export const upgradeDataFile = async (
  path: string,
  options: UpgradeDataFileOptions = {},
): Promise<{ changed: boolean }> => {
  const fileOperations = options.fileOperations ?? nodeFileOperations;
  const source = await fileOperations.readFile(path, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (cause) {
    throw new TypeError(`"${path}" is not valid JSON`, { cause });
  }

  // The whole conversion happens — and is validated — before a single byte is written. A
  // converter that discovered its output was unloadable *after* replacing the original would
  // have destroyed the file it exists to preserve.
  const { document, changed } = upgradeProjectPages(parsed);
  if (!changed) return { changed: false };

  // The original, kept verbatim, before the target is touched. Not a rollback mechanism —
  // just the copy someone will be glad of.
  await fileOperations.writeFile(backupPathFor(path, options.now ?? new Date()), source, 'utf8');

  // Temp file and rename, the way `seed-cli.ts` writes: a torn write leaves the original.
  const temporaryPath = `${path}.tmp`;
  await fileOperations.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await fileOperations.rename(temporaryPath, path);
  return { changed: true };
};

const run = async (): Promise<void> => {
  const [path, ...extraArguments] = process.argv.slice(2);
  if (path === undefined || extraArguments.length > 0) {
    throw new RangeError('Expected one path. Usage: pnpm prototype:upgrade <path to data.json>');
  }
  const { changed } = await upgradeDataFile(path);
  process.stdout.write(
    changed
      ? `Converted "${path}" to schema version 3. The original is beside it as a .backup-*.json file.\n`
      : `"${path}" is already at schema version 3. Nothing was written.\n`,
  );
};

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
