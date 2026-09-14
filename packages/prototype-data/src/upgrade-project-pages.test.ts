import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@cwm/contracts';
import { InMemoryDataStore } from '@cwm/repositories';
import { describe, expect, it, vi } from 'vitest';
import { buildSeed } from './seeds';
import { upgradeProjectPages } from './upgrade-project-pages';
import { type UpgradeFileOperations, upgradeDataFile } from './upgrade-cli';

/**
 * A real version-2 document, committed rather than reconstructed: this same slice regenerates
 * `prototype/seeds/*.json` to version 3, so the corpus the converter has to handle would
 * otherwise exist only in git history where no test can name it.
 *
 * Read rather than imported — this package's tsconfig covers `src/**\/*.ts` only, and the base
 * config does not set `resolveJsonModule`, so an import assertion would fail `pnpm lint`.
 * `seeds.test.ts` reads its snapshots the same way.
 */
const v2FixturePath = fileURLToPath(new URL('../test/fixtures/nested-projects-v2.json', import.meta.url));
const v2Document = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(v2FixturePath, 'utf8')) as Record<string, unknown>;

type Row = Record<string, unknown>;
const rows = (document: unknown, collection: string): Row[] =>
  (document as Record<string, Row[]>)[collection] ?? [];

describe('upgradeProjectPages', () => {
  it('gives every root a Home and every nested project a work canvas', async () => {
    const { document, changed } = upgradeProjectPages(await v2Document());

    expect(changed).toBe(true);
    const projects = rows(document, 'projects');
    const pages = rows(document, 'projectPages');
    expect(projects.filter((project) => project['kind'] === 'root')).toHaveLength(1);
    expect(projects.filter((project) => project['kind'] === 'subproject')).toHaveLength(3);
    expect(pages.filter((page) => page['kind'] === 'home')).toHaveLength(1);
    expect(pages.filter((page) => page['kind'] === 'work')).toHaveLength(3);
    // One page each, including the project that has no sections at all — a canvas is a
    // property of the project, not something its content earns.
    expect(pages).toHaveLength(projects.length);
    expect(pages.every((page) => page['enabled'] === true)).toBe(true);
  });

  it('produces a document the store accepts', async () => {
    const { document } = upgradeProjectPages(await v2Document());

    expect(() => new InMemoryDataStore(document)).not.toThrow();
    expect((document as { schemaVersion: number }).schemaVersion).toBe(SCHEMA_VERSION);
    // Version 3 gained a defaulted Undo collection; a converted file starts with no history.
    expect(rows(document, 'undoRecords')).toEqual([]);
  });

  it('leaves a version-3 file written before Undo records unchanged, apart from the defaulted collection', async () => {
    const path = fileURLToPath(new URL('../test/fixtures/nested-projects-v3.json', import.meta.url));
    const before = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;

    const { document, changed } = upgradeProjectPages(before);

    expect(changed).toBe(false);
    expect(document).toEqual({ ...before, undoRecords: [] });
  });

  it('preserves ids, section order and every field it does not own', async () => {
    const before = await v2Document();
    const { document } = upgradeProjectPages(await v2Document());

    expect(rows(document, 'projects').map((project) => project['id'])).toEqual(
      rows(before, 'projects').map((project) => project['id']),
    );
    expect(rows(document, 'sections').map((section) => [section['id'], section['position'], section['config']])).toEqual(
      rows(before, 'sections').map((section) => [section['id'], section['position'], section['config']]),
    );
    expect(rows(document, 'tasks')).toEqual(rows(before, 'tasks'));
    expect(rows(document, 'activityEvents')).toEqual(rows(before, 'activityEvents'));
  });

  /**
   * The markers are what make a restore put back exactly what a removal took
   * (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md). A converter that dropped
   * them would leave archived work that could never be restored correctly.
   */
  it('carries archived sections and their cascade markers across unchanged', async () => {
    const { document } = upgradeProjectPages(await v2Document());

    const archived = rows(document, 'sections').find((section) => section['id'] === 'section-project-garden-tasks');
    expect(archived?.['archivedAt']).toBe('2026-08-22T09:15:00.000Z');
    expect(rows(document, 'tasks').find((task) => task['id'] === 'task-garden-plan')).toMatchObject({
      archivedAt: '2026-08-22T09:15:00.000Z',
      archivedWithSectionId: 'section-project-garden-tasks',
    });
    // Archived on its own beforehand, so it stays that way and gains no cascade marker —
    // the distinction a restore depends on.
    const independent = rows(document, 'tasks').find((task) => task['id'] === 'task-renovation-budget');
    expect(independent?.['archivedAt']).toBe('2026-08-20T09:15:00.000Z');
    expect(independent?.['archivedWithSectionId']).toBeUndefined();
  });

  it('puts every section on a page of its own project', async () => {
    const { document } = upgradeProjectPages(await v2Document());

    const pageOwner = new Map(rows(document, 'projectPages').map((page) => [page['id'], page['projectId']]));
    for (const section of rows(document, 'sections')) {
      expect(pageOwner.get(section['pageId'] as string)).toBe(section['projectId']);
    }
  });

  it('is a no-op on a document that is already converted', async () => {
    const already = buildSeed('nested-projects');

    const { document, changed } = upgradeProjectPages(already);

    expect(changed).toBe(false);
    expect(document).toEqual(already);
  });

  it('converts twice to the same document', async () => {
    const once = upgradeProjectPages(await v2Document()).document;

    expect(upgradeProjectPages(once)).toEqual({ document: once, changed: false });
  });

  it('fails clearly on a version it does not know', async () => {
    const older = { ...(await v2Document()), schemaVersion: 1 };

    expect(() => upgradeProjectPages(older)).toThrow(/version 1/);
    expect(() => upgradeProjectPages('not a document')).toThrow(/document/);
  });

  it('rejects a conversion whose result would not validate', async () => {
    const broken = await v2Document();
    // A section naming a project that does not exist: version 2 tolerated it no better, but
    // this is the shape of every reason a conversion might produce an invalid document.
    (broken['sections'] as Row[])[0]!['projectId'] = 'project-gone';

    expect(() => upgradeProjectPages(broken)).toThrow();
  });
});

describe('upgradeDataFile', () => {
  const operations = (
    source: string,
  ): UpgradeFileOperations & { written: Map<string, string>; order: string[] } => {
    const written = new Map<string, string>();
    // Every write in the order it happened. A set of paths cannot tell "backed up first" from
    // "backed up last", and the whole point of the backup is that it exists *before* the
    // target is touched.
    const order: string[] = [];
    return {
      written,
      order,
      readFile: vi.fn(async () => source),
      writeFile: vi.fn(async (path: string, data: string) => {
        order.push(`write ${path}`);
        written.set(path, data);
      }),
      rename: vi.fn(async (from: string, to: string) => {
        order.push(`rename ${from} -> ${to}`);
        written.set(to, written.get(from) ?? '');
        written.delete(from);
      }),
    };
  };

  it('backs the original up before writing the converted file', async () => {
    const source = await readFile(v2FixturePath, 'utf8');
    const fileOperations = operations(source);

    await upgradeDataFile('data.json', { fileOperations, now: new Date('2026-09-04T12:00:00.000Z') });

    expect(fileOperations.order).toEqual([
      'write data.json.backup-2026-09-04T12-00-00-000Z.json',
      'write data.json.tmp',
      'rename data.json.tmp -> data.json',
    ]);
    expect(fileOperations.written.get('data.json.backup-2026-09-04T12-00-00-000Z.json')).toBe(source);
    expect(JSON.parse(fileOperations.written.get('data.json')!)).toMatchObject({ schemaVersion: SCHEMA_VERSION });
  });

  /**
   * Validate, then back up, then write. A converter that had already replaced the file when it
   * discovered the result was invalid would be worse than one that refused.
   */
  it('writes nothing at all when the conversion fails', async () => {
    const broken = JSON.parse(await readFile(v2FixturePath, 'utf8')) as Record<string, Row[]>;
    broken['sections'][0]!['projectId'] = 'project-gone';
    const fileOperations = operations(JSON.stringify(broken));

    await expect(upgradeDataFile('data.json', { fileOperations })).rejects.toThrow();

    expect(fileOperations.writeFile).not.toHaveBeenCalled();
    expect(fileOperations.rename).not.toHaveBeenCalled();
  });

  it('leaves the target alone when the backup cannot be written', async () => {
    const fileOperations = operations(await readFile(v2FixturePath, 'utf8'));
    fileOperations.writeFile = vi.fn(async () => {
      throw new Error('disk full');
    });

    await expect(upgradeDataFile('data.json', { fileOperations })).rejects.toThrow('disk full');

    expect(fileOperations.rename).not.toHaveBeenCalled();
  });

  it('reports an already-converted file as unchanged and writes nothing', async () => {
    const fileOperations = operations(`${JSON.stringify(buildSeed('nested-projects'), null, 2)}\n`);

    await expect(upgradeDataFile('data.json', { fileOperations })).resolves.toEqual({ changed: false });

    expect(fileOperations.writeFile).not.toHaveBeenCalled();
  });
});
