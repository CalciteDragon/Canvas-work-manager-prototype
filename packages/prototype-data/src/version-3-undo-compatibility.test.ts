import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@cwm/contracts';
import { JsonDataStore, unitOfWorkFor, type FileOperations } from '@cwm/repositories';
import { describe, expect, it } from 'vitest';

/**
 * The committed `nested-projects` snapshot exactly as it was **before** Undo records existed:
 * schema version 3, no `undoRecords` key. Undo arrived as a defaulted collection with no version
 * bump and no converter (docs/decisions/2026-09-section-removal-undo-records.md, rule 1), so a
 * real file like this must load, persist and reload without losing anything.
 */
const fixturePath = fileURLToPath(new URL('../test/fixtures/nested-projects-v3.json', import.meta.url));

const memoryFiles = (initial: string) => {
  const files = new Map<string, string>([['data.json', initial]]);
  const operations: FileOperations = {
    readFile: async (path) => files.get(path)!,
    writeFile: async (path, data) => void files.set(path, data),
    rename: async (from, to) => void files.set(to, files.get(from)!),
  };
  return { files, operations };
};

describe('a version-3 file written before Undo records', () => {
  it('loads, persists and reloads with every collection intact and an empty undo history', async () => {
    const source = await readFile(fixturePath, 'utf8');
    const fixture = JSON.parse(source) as Record<string, unknown>;
    expect(fixture['schemaVersion']).toBe(SCHEMA_VERSION);
    expect(fixture).not.toHaveProperty('undoRecords');
    const { files, operations } = memoryFiles(source);

    const store = await JsonDataStore.load('data.json', operations);
    const loaded = store.snapshot();
    for (const [collection, value] of Object.entries(fixture)) {
      expect(loaded[collection as keyof typeof loaded], collection).toEqual(value);
    }
    expect(loaded.undoRecords).toEqual([]);

    await unitOfWorkFor(store).run(() => undefined);
    const written = JSON.parse(files.get('data.json')!) as Record<string, unknown>;
    expect(written).toEqual({ ...fixture, undoRecords: [] });

    const reloaded = await JsonDataStore.load('data.json', operations);
    expect(reloaded.snapshot()).toEqual(loaded);
  });
});
