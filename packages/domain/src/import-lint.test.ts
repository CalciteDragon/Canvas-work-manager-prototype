import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const scannerPath = fileURLToPath(new URL('../../../scripts/check-package-imports.mjs', import.meta.url));
const temporaryRoots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'cwm-domain-import-lint-'));
  temporaryRoots.push(root);
  return root;
};

const scan = (root: string) => spawnSync(process.execPath, [scannerPath, '--root', root], { encoding: 'utf8' });

const write = (root: string, name: string, source: string) => writeFile(join(root, name), `${source}\n`);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('domain import lint guard', () => {
  it('allows contracts and the repository interfaces the domain is built on', async () => {
    const root = await makeRoot();
    await write(root, 'service.ts', "import type { Task } from '@cwm/contracts';\nexport type T = Task;");
    await write(
      root,
      'other.ts',
      "import type { TaskRepository, UnitOfWork } from '@cwm/repositories';\nexport type R = TaskRepository | UnitOfWork;",
    );

    const result = scan(root);

    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects a store or a concrete repository imported from @cwm/repositories', async () => {
    const root = await makeRoot();
    await write(root, 'service.ts', "import { JsonTaskRepository } from '@cwm/repositories';\nexport const R = JsonTaskRepository;");
    await write(root, 'store.ts', "import type { DataStore } from '@cwm/repositories';\nexport type S = DataStore;");

    const result = scan(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JsonTaskRepository');
    expect(result.stderr).toContain('DataStore');
  });

  it('rejects node builtins, filesystem and transport modules, and seed fixtures', async () => {
    const root = await makeRoot();
    await write(root, 'a.ts', "import { readFile } from 'node:fs/promises';\nexport const r = readFile;");
    await write(root, 'b.ts', "import { join } from 'path';\nexport const j = join;");
    await write(root, 'c.ts', "import { SEED_NOW } from '@cwm/prototype-data';\nexport const n = SEED_NOW;");

    const result = scan(root);

    expect(result.status).toBe(1);
    for (const file of ['a.ts', 'b.ts', 'c.ts']) expect(result.stderr).toContain(file);
  });

  it('rejects a relative import that escapes the domain source root', async () => {
    const root = await makeRoot();
    await write(root, 'escape.ts', "import { thing } from '../../repositories/src/data-store';\nexport const t = thing;");

    const result = scan(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('escape.ts');
  });

  it('rejects a store smuggled in through a re-export', async () => {
    const root = await makeRoot();
    // The hole the first version of this lint had: re-export a store under a relative
    // specifier and every sibling can then import it "cleanly".
    await write(root, 'barrel.ts', "export { JsonDataStore } from '@cwm/repositories';");
    await write(root, 'star.ts', "export * from '@cwm/repositories';");

    const result = scan(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('barrel.ts');
    expect(result.stderr).toContain('star.ts');
  });

  it('rejects a dynamic import and a require', async () => {
    const root = await makeRoot();
    await write(root, 'dynamic.ts', "export const load = async () => import('node:fs/promises');");
    await write(root, 'required.ts', "declare const require: (id: string) => unknown; export const fs = require('fs/promises');");

    const result = scan(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dynamic.ts');
    expect(result.stderr).toContain('required.ts');
  });

  it('rejects a builtin reached by a submodule or unprefixed name', async () => {
    const root = await makeRoot();
    // `fs/promises` and `crypto` slipped past a ban list that named only `fs`.
    await write(root, 'a.ts', "import { readFile } from 'fs/promises';");
    await write(root, 'b.ts', "import { randomUUID } from 'crypto';");
    await write(root, 'c.ts', "import { AsyncLocalStorage } from 'async_hooks';");

    const result = scan(root);

    expect(result.status).toBe(1);
    for (const file of ['a.ts', 'b.ts', 'c.ts']) expect(result.stderr).toContain(file);
  });

  it('rejects an unknown third-party package rather than waiting to be told about it', async () => {
    const root = await makeRoot();
    await write(root, 'x.ts', "import express from 'express';");

    const result = scan(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('x.ts');
  });

  it('allows a re-export of the repository interfaces by name', async () => {
    const root = await makeRoot();
    await write(root, 'barrel.ts', "export type { TaskRepository, UnitOfWork } from '@cwm/repositories';");

    const result = scan(root);

    expect(result.status, result.stderr).toBe(0);
  });

  it('ignores test files', async () => {
    const root = await makeRoot();
    await write(root, 'service.test.ts', "import { JsonTaskRepository } from '@cwm/repositories';\nexport const R = JsonTaskRepository;");

    const result = scan(root);

    expect(result.status, result.stderr).toBe(0);
  });
});
