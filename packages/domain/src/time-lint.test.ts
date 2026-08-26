import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const scannerPath = fileURLToPath(new URL('../scripts/check-no-direct-date.mjs', import.meta.url));
const temporaryRoots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'cwm-domain-time-lint-'));
  temporaryRoots.push(root);
  return root;
};

const scan = (root: string) => spawnSync(process.execPath, [scannerPath, '--root', root], { encoding: 'utf8' });

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('domain direct-time lint guard', () => {
  it('allows direct Date construction only in clock.ts', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'clock.ts'), 'export const copy = (value: Date) => new Date(value.getTime());\n');
    await writeFile(join(root, 'service.ts'), 'export const value = Date.now();\n');

    const result = scan(root);

    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects direct Date construction in other domain source', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'service.ts'), `export const value = new ${'Date'}();\n`);

    const result = scan(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('service.ts');
    expect(result.stderr).toContain('Clock');
  });
});
