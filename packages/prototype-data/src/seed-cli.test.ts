import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireDataFileOwnership, DataFileInUseError } from '@cwm/repositories';
import { afterEach, describe, expect, it } from 'vitest';
import { seedDataFileOwned } from './seed-cli';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('seedDataFileOwned — the seed and reset CLIs are writers too', () => {
  it('refuses while another owner holds the file, with no side effects, and seeds after release', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cwm-seed-owned-'));
    temporaryDirectories.push(directory);
    const targetPath = join(directory, 'data.json');
    await writeFile(targetPath, 'the owner\'s bytes');
    const ownership = await acquireDataFileOwnership(targetPath, { kind: 'http-host' });
    const listing = await readdir(directory);

    await expect(seedDataFileOwned('agent-heavy', { targetPath })).rejects.toBeInstanceOf(DataFileInUseError);
    await expect(seedDataFileOwned('agent-heavy', { targetPath })).rejects.toThrow(/^data_file_in_use: .*http-host/);
    expect(await readFile(targetPath, 'utf8')).toBe('the owner\'s bytes');
    expect(await readdir(directory)).toEqual(listing);

    await ownership.release();
    await seedDataFileOwned('agent-heavy', { targetPath });

    expect(JSON.parse(await readFile(targetPath, 'utf8'))).toMatchObject({ schemaVersion: expect.any(Number) });
    expect(await readdir(directory)).toEqual(['data.json']);
  });
});
