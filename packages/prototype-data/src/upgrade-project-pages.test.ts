import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSeed } from './seeds';
import { upgradeProjectPages, V3_SCHEMA_VERSION } from './upgrade-project-pages';

/**
 * A real version-2 document, committed rather than reconstructed, so the corpus the converter
 * has to handle is something a test can name rather than something only git history holds.
 *
 * Read rather than imported — this package's tsconfig covers `src/**\/*.ts` only, and the base
 * config does not set `resolveJsonModule`, so an import assertion would fail `pnpm lint`.
 * `seeds.test.ts` reads its snapshots the same way.
 *
 * The chained path through version 4, its validation and the file writes are
 * `upgrade-cli.test.ts`'s; this suite is the frozen version-2 → version-3 step on its own.
 */
const v2FixturePath = fileURLToPath(new URL('../test/fixtures/nested-projects-v2.json', import.meta.url));
const v2Document = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(v2FixturePath, 'utf8')) as Record<string, unknown>;

type Row = Record<string, unknown>;
const rows = (document: unknown, collection: string): Row[] =>
  (document as Record<string, Row[]>)[collection] ?? [];

describe('upgradeProjectPages — the frozen version-2 → version-3 step', () => {
  it('the v3 intermediate is frozen at 3, whatever the current schema version is', async () => {
    const { document, changed } = upgradeProjectPages(await v2Document());

    expect(changed).toBe(true);
    expect(V3_SCHEMA_VERSION).toBe(3);
    expect(document.schemaVersion).toBe(3);
    // Nothing version 4 added: that is the next step's to add.
    expect(document).not.toHaveProperty('operationHistories');
    expect(rows(document, 'sections').every((section) => !('archiveGeneration' in section))).toBe(true);
  });

  it('gives every root a Home and every nested project a work canvas', async () => {
    const { document } = upgradeProjectPages(await v2Document());

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
    expect(rows(document, 'sectionShortcuts')).toEqual([]);
  });

  it('preserves ids, section order and every field it does not own', async () => {
    const before = await v2Document();
    const { document } = upgradeProjectPages(await v2Document());

    expect(rows(document, 'projects').map((project) => project['id'])).toEqual(rows(before, 'projects').map((project) => project['id']));
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

  it('is a no-op on a version-3 document, returning it untouched', async () => {
    const path = fileURLToPath(new URL('../test/fixtures/nested-projects-v3.json', import.meta.url));
    const before = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;

    expect(upgradeProjectPages(before)).toEqual({ document: before, changed: false });
  });

  it('converts twice to the same document', async () => {
    const once = upgradeProjectPages(await v2Document()).document;

    expect(upgradeProjectPages(once)).toEqual({ document: once, changed: false });
  });

  it('refuses a version it does not read — version 4 included, which the CLI sniffs before calling it', async () => {
    const older = { ...(await v2Document()), schemaVersion: 1 };
    expect(() => upgradeProjectPages(older)).toThrow(/version 1/);
    expect(() => upgradeProjectPages(buildSeed('nested-projects'))).toThrow(RangeError);
    expect(() => upgradeProjectPages('not a document')).toThrow(/document/);
  });
});
