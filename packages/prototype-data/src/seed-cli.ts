import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrototypeDocumentSchema } from '@cwm/contracts';
import { SEED_NAMES, buildSeed, isSeedName } from './seeds';

export interface SeedFileOperations {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export interface WriteSeedOptions {
  targetPath?: string;
  fileOperations?: SeedFileOperations;
}

export const DEFAULT_SEED_NAME = 'personal-workspace';
export const DEFAULT_DATA_PATH = fileURLToPath(new URL('../../../.prototype/data.json', import.meta.url));

const nodeFileOperations: SeedFileOperations = { mkdir, writeFile, rename };

const resolveSeedName = (value: string | undefined) => {
  const seedName = value ?? DEFAULT_SEED_NAME;
  if (!isSeedName(seedName)) {
    throw new RangeError(`Unknown seed "${seedName}". Valid seeds: ${SEED_NAMES.join(', ')}`);
  }
  return seedName;
};

export const writeSeedFile = async (seedNameInput?: string, options: WriteSeedOptions = {}): Promise<void> => {
  const seedName = resolveSeedName(seedNameInput);
  const targetPath = options.targetPath ?? DEFAULT_DATA_PATH;
  const fileOperations = options.fileOperations ?? nodeFileOperations;
  const document = PrototypeDocumentSchema.parse(buildSeed(seedName));
  const temporaryPath = `${targetPath}.tmp`;

  await fileOperations.mkdir(dirname(targetPath), { recursive: true });
  await fileOperations.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await fileOperations.rename(temporaryPath, targetPath);
};

const run = async (): Promise<void> => {
  const [seedName, ...extraArguments] = process.argv.slice(2);
  if (extraArguments.length > 0) {
    throw new RangeError(`Expected one seed name. Valid seeds: ${SEED_NAMES.join(', ')}`);
  }
  await writeSeedFile(seedName);
  process.stdout.write(`Loaded seed "${seedName ?? DEFAULT_SEED_NAME}" into ${DEFAULT_DATA_PATH}\n`);
};

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
