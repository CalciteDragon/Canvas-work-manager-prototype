import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrototypeDocumentSchema, type PrototypeDocument, type SectionId, type UndoReceipt } from '@cwm/contracts';
import { DomainRuleError, EntityNotFoundError, SimulatedClock, type ActorContext } from '@cwm/domain';
import { SEED_NOW } from '@cwm/prototype-data';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from './api/services.ts';
import { loadPersistence } from './persistence/store.ts';

/**
 * Slice 33 (Refactor §26.3, §26.5, §26.11): recovery and Undo over real files on disk.
 *
 * The host is the one package allowed to compose the converter, the domain services and the
 * JSON store, so this is where a converted or post-Undo file is proven reopenable. Every
 * "reopen" builds a fresh store from the bytes on disk; nothing is carried over in memory.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, '../../packages/prototype-data/test/fixtures', name);
const upgradeCli = join(here, '../../packages/prototype-data/src/upgrade-cli.ts');
const run = promisify(execFile);

const DEMO: ActorContext = { actor: 'user', workspaceId: 'workspace-demo' as never, userId: 'user-demo' as never };
const ALEX: ActorContext = { actor: 'user', workspaceId: 'workspace-alex' as never, userId: 'user-alex' as never };
const ROOT = 'project-renovation' as never;
const DAY_MS = 24 * 60 * 60 * 1000;

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const tempCopy = async (name: string, edit: (document: Record<string, unknown[]>) => void = () => undefined) => {
  const directory = await mkdtemp(join(tmpdir(), 'cwm-recovery-'));
  directories.push(directory);
  const path = join(directory, 'data.json');
  const document = JSON.parse(await readFile(fixture(name), 'utf8')) as Record<string, unknown[]>;
  edit(document);
  const source = `${JSON.stringify(document, null, 2)}\n`;
  await writeFile(path, source, 'utf8');
  return { directory, path, source };
};

/** A fresh store and service graph over whatever is on disk now. */
const reopen = async (path: string, now = SEED_NOW) => {
  const clock = new SimulatedClock();
  clock.setNow(new Date(now));
  const persistence = await loadPersistence(path);
  const api = createApi(persistence, { clock });
  return { persistence, api, clock, document: () => persistence.store.snapshot() };
};

const onDisk = async (path: string) => PrototypeDocumentSchema.parse(JSON.parse(await readFile(path, 'utf8')));

/** §26.11: nothing on disk points at a row, page, project or source that does not exist. */
const expectReferentialIntegrity = (document: PrototypeDocument) => {
  const projects = new Set(document.projects.map(({ id }) => id));
  const pages = new Set(document.projectPages.map(({ id }) => id));
  const sections = new Set(document.sections.map(({ id }) => id));
  const tasks = new Set(document.tasks.map(({ id }) => id));
  const dangling: string[] = [];
  const check = (owner: string, field: string, value: string | undefined, known: Set<string>) => {
    if (value !== undefined && !known.has(value)) dangling.push(`${owner}.${field} -> ${value}`);
  };
  for (const page of document.projectPages) check(page.id, 'projectId', page.projectId, projects);
  for (const section of document.sections) {
    check(section.id, 'projectId', section.projectId, projects);
    check(section.id, 'pageId', section.pageId, pages);
  }
  for (const shortcut of document.sectionShortcuts) {
    check(shortcut.id, 'pageId', shortcut.pageId, pages);
    check(shortcut.id, 'sourceSectionId', shortcut.sourceSectionId, sections);
  }
  for (const task of document.tasks) {
    check(task.id, 'projectId', task.projectId, projects);
    check(task.id, 'sectionId', task.sectionId, sections);
    check(task.id, 'parentTaskId', task.parentTaskId, tasks);
    check(task.id, 'archivedWithSectionId', task.archivedWithSectionId, sections);
    check(task.id, 'archivedWithTaskId', task.archivedWithTaskId, tasks);
  }
  for (const reflection of document.reflections) {
    check(reflection.id, 'projectId', reflection.projectId, projects);
    check(reflection.id, 'sectionId', reflection.sectionId, sections);
    check(reflection.id, 'archivedWithSectionId', reflection.archivedWithSectionId, sections);
  }
  expect(dangling).toEqual([]);
};

/** Home's combined live section and shortcut order, as ids. */
const homeOrder = (document: PrototypeDocument, pageId = 'page-project-renovation') =>
  [
    ...document.sections.filter((section) => section.pageId === pageId && section.archivedAt === undefined),
    ...document.sectionShortcuts.filter((shortcut) => shortcut.pageId === pageId),
  ]
    .sort((left, right) => left.position - right.position)
    .map(({ id }) => id);

const archivedSectionIds = async (api: ReturnType<typeof createApi>) =>
  (await api.archive.derive(DEMO, ROOT)).items.flatMap((item) => (item.kind === 'section' ? [item.section.id] : []));

const refusalReason = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof DomainRuleError ? (error.details as { reason: string }).reason : error instanceof EntityNotFoundError ? 'not-found' : String(error)),
  );

/** A progress view removed before Slice 31 made disposable removal a deletion. */
const legacyTombstone = (withPage: boolean) => ({
  id: 'section-legacy-progress-tombstone',
  projectId: 'project-renovation',
  ...(withPage ? { pageId: 'page-project-renovation' } : {}),
  type: 'progress',
  position: 20,
  columnSpan: 6,
  collapsed: false,
  config: {},
  createdAt: '2026-08-01T16:00:00.000Z',
  updatedAt: '2026-08-10T16:00:00.000Z',
  archivedAt: '2026-08-10T16:00:00.000Z',
});

const upgrade = (path: string) =>
  run(process.execPath, ['--import', 'tsx', upgradeCli, path], { cwd: here, env: { ...process.env, INIT_CWD: here } });

describe('recovery and Undo over persisted files (Slice 33)', () => {
  it('converted v2 and pre-Undo v3 files reopen with content and references intact', async () => {
    // ---- version 2, through the real CLI.
    const v2 = await tempCopy('nested-projects-v2.json', (document) => document['sections']!.push(legacyTombstone(false)));
    const { stdout } = await upgrade(v2.path);
    expect(stdout).toMatch(/Converted/);
    const backups = (await readdir(v2.directory)).filter((name) => name.startsWith('data.json.backup-'));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(v2.directory, backups[0]!), 'utf8')).toBe(v2.source);

    const original = JSON.parse(v2.source) as PrototypeDocument;
    const converted = await reopen(v2.path);
    expectReferentialIntegrity(converted.document());
    expect(converted.document().users).toEqual(original.users);
    expect(converted.document().milestones).toEqual(original.milestones);
    expect(converted.document().tasks.map(({ id }) => id)).toEqual(original.tasks.map(({ id }) => id));
    expect(converted.document().reflections.map(({ id, body }) => [id, body])).toEqual(original.reflections.map(({ id, body }) => [id, body]));
    // Stored, never projected: the old disposable tombstone stays in the file and out of Archive.
    expect(converted.document().sections.find(({ id }) => id === 'section-legacy-progress-tombstone')?.archivedAt).toBeDefined();
    const v2Archive = await archivedSectionIds(converted.api);
    expect(v2Archive).toContain('section-project-garden-tasks');
    expect(v2Archive).not.toContain('section-legacy-progress-tombstone');

    // A write and its Undo on the converted file, then a fresh reopen.
    const brief = 'section-project-renovation-brief' as SectionId;
    const removed = await converted.api.sections.remove(DEMO, brief);
    expect(removed.section.archivedAt).toBeDefined();
    await converted.api.undo.undo(DEMO, removed.undo.undoId);
    const afterUndo = await reopen(v2.path);
    expectReferentialIntegrity(await onDisk(v2.path));
    expect(afterUndo.document().sections.find(({ id }) => id === brief)).toMatchObject({ position: 0, config: { text: 'Whole-house plan. Kitchen first, garden in the spring.' } });
    expect(afterUndo.document().sections.find(({ id }) => id === brief)?.archivedAt).toBeUndefined();
    expect(afterUndo.document().undoRecords[0]?.consumedAt).toBeDefined();

    // ---- version 3 written before Undo records existed: no conversion, no backup.
    const v3 = await tempCopy('nested-projects-v3.json', (document) => document['sections']!.push(legacyTombstone(true)));
    expect(JSON.parse(v3.source)).not.toHaveProperty('undoRecords');
    expect((await upgrade(v3.path)).stdout).toMatch(/Nothing was written/);
    expect((await readdir(v3.directory)).filter((name) => name.includes('backup'))).toEqual([]);

    const loaded = await reopen(v3.path);
    expectReferentialIntegrity(loaded.document());
    expect(loaded.document().undoRecords).toEqual([]);
    const v3Archive = await archivedSectionIds(loaded.api);
    expect(v3Archive).toContain('section-project-renovation-archived-notes');
    expect(v3Archive).not.toContain('section-legacy-progress-tombstone');

    // A shortcut-backed source is retained under its id, then Undo returns the same id.
    const source = 'section-project-kitchen-tasks' as SectionId;
    const kitchenTasks = loaded.document().tasks.filter((task) => task.sectionId === source && task.archivedAt === undefined).map(({ id }) => id);
    expect(kitchenTasks.length).toBeGreaterThan(0);
    const cascade = await loaded.api.sections.remove(DEMO, source, { policy: 'cascade' });
    expect(cascade.section).toMatchObject({ id: source, archivedAt: expect.any(String) });

    const removedOnDisk = await reopen(v3.path);
    expectReferentialIntegrity(removedOnDisk.document());
    expect(removedOnDisk.document().sectionShortcuts.find(({ sourceSectionId }) => sourceSectionId === source)).toBeDefined();
    expect(await archivedSectionIds(removedOnDisk.api)).toContain(source);
    await removedOnDisk.api.undo.undo(DEMO, cascade.undo.undoId);

    const restored = await reopen(v3.path);
    expectReferentialIntegrity(restored.document());
    expect(restored.document().sections.find(({ id }) => id === source)?.archivedAt).toBeUndefined();
    for (const id of kitchenTasks) {
      expect(restored.document().tasks.find((task) => task.id === id)).toMatchObject({ sectionId: source });
      expect(restored.document().tasks.find((task) => task.id === id)?.archivedAt).toBeUndefined();
    }
  });

  it('post-Undo files preserve canonical state and consumed receipts', async () => {
    const file = await tempCopy('nested-projects-v3.json');
    const host = await reopen(file.path);
    const activity = 'section-project-renovation-recent-activity' as SectionId;
    const before = host.document().sections.find(({ id }) => id === activity)!;
    const beforeOrder = homeOrder(host.document());
    const beforeProgress = host.document().sections.find(({ id }) => id === 'section-project-renovation-progress')!;

    const added = await host.api.sections.add(DEMO, ROOT, { type: 'rich-text', title: 'Scratch' });
    const updated = await host.api.sections.update(DEMO, 'section-project-renovation-progress' as SectionId, { title: 'Burn-up' });
    const moved = await host.api.sections.move(DEMO, 'section-project-renovation-timeline' as SectionId, 0);
    const removed = await host.api.sections.remove(DEMO, activity);
    const receipts = [added.undo, updated.undo!, moved.undo!, removed.undo];
    expect(receipts.map(({ operation }) => operation)).toEqual(['section.add', 'section.update', 'section.move', 'section.remove']);
    // Newest first, as the notice offers them. Out of order, two inverses can both claim the same
    // surviving previous neighbour, which is placement working as designed rather than the original order.
    for (const receipt of [...receipts].reverse()) await host.api.undo.undo(DEMO, receipt.undoId);
    expect(homeOrder(host.document())).toEqual(beforeOrder);
    // Deleted and left deleted: its receipt snapshot names an id that no longer resolves.
    const leftDeleted = 'section-project-kitchen-progress' as SectionId;
    const pending = await host.api.sections.remove(DEMO, leftDeleted);

    const reopened = await reopen(file.path);
    const document = await onDisk(file.path);
    expectReferentialIntegrity(document);
    expect(document.sections.find(({ id }) => id === leftDeleted)).toBeUndefined();
    expect(await archivedSectionIds(reopened.api)).not.toContain(leftDeleted);
    expect(document.sections.find(({ id }) => id === activity)).toMatchObject({
      id: activity, pageId: before.pageId, position: before.position, columnSpan: before.columnSpan, collapsed: before.collapsed, config: before.config,
    });
    expect(document.sections.find(({ id }) => id === added.section.id)).toBeUndefined();
    expect(document.sections.find(({ id }) => id === beforeProgress.id)?.title).toBe(beforeProgress.title);
    expect(homeOrder(document)).toEqual(beforeOrder);
    expect(document.undoRecords.map(({ id, consumedAt }) => [id, consumedAt !== undefined])).toEqual([
      ...receipts.map(({ undoId }) => [undoId, true]),
      [pending.undo.undoId, false],
    ]);

    for (const receipt of receipts) expect(await refusalReason(reopened.api.undo.undo(DEMO, receipt.undoId))).toBe('undo_consumed');
    expect((await onDisk(file.path)).undoRecords).toEqual(document.undoRecords);

    await reopened.api.undo.undo(DEMO, pending.undo.undoId);
    const final = await onDisk(file.path);
    expectReferentialIntegrity(final);
    expect(final.sections.find(({ id }) => id === leftDeleted)?.archivedAt).toBeUndefined();
  });

  it('Archive outlives expired and pruned receipts', async () => {
    const file = await tempCopy('nested-projects-v3.json');
    const host = await reopen(file.path);
    const prose = 'section-project-renovation-brief' as SectionId;
    const container = 'section-project-kitchen-tasks' as SectionId;
    const cascaded = host.document().tasks.filter((task) => task.sectionId === container && task.archivedAt === undefined).map(({ id }) => id);

    const proseRemoval = await host.api.sections.remove(DEMO, prose);
    const containerRemoval = await host.api.sections.remove(DEMO, container, { policy: 'cascade' });
    const theirs = await host.api.sections.add(ALEX, 'project-alex-private' as never, { type: 'rich-text', title: 'Alex scratch' });
    const theirRecord = host.document().undoRecords.find(({ id }) => id === theirs.undo.undoId);

    // Independent subjects across all four families, well past the 50-record limit.
    const receipts: UndoReceipt[] = [proseRemoval.undo, containerRemoval.undo];
    for (let index = 0; index < 50; index += 1) {
      receipts.push((await host.api.sections.add(DEMO, ROOT, { type: 'rich-text', title: `Scratch ${index}` })).undo);
    }
    for (const id of ['section-project-renovation-progress', 'section-project-renovation-timeline', 'section-project-kitchen-brief']) {
      receipts.push((await host.api.sections.update(DEMO, id as SectionId, { collapsed: true })).undo!);
    }
    for (const id of ['section-project-renovation-sub-projects', 'section-project-kitchen-timeline', 'section-project-kitchen-recent-activity']) {
      receipts.push((await host.api.sections.move(DEMO, id as SectionId, 0)).undo!);
    }
    receipts.push((await host.api.sections.remove(DEMO, 'section-project-renovation-recent-activity' as SectionId)).undo);
    expect(new Set(receipts.map(({ operation }) => operation))).toEqual(new Set(['section.add', 'section.update', 'section.move', 'section.remove']));
    expect(receipts).toHaveLength(59);

    const demoRecords = host.document().undoRecords.filter(({ workspaceId }) => workspaceId === DEMO.workspaceId);
    expect(demoRecords).toHaveLength(50);
    expect(demoRecords.map(({ id }) => id)).toEqual(receipts.slice(-50).map(({ undoId }) => undoId));
    expect(host.document().undoRecords.find(({ id }) => id === theirs.undo.undoId)).toEqual(theirRecord);

    // Pruned receipts are gone; the newest one is refused once it expires.
    expect(await refusalReason(host.api.undo.undo(DEMO, proseRemoval.undo.undoId))).toBe('not-found');
    expect(await refusalReason(host.api.undo.undo(DEMO, containerRemoval.undo.undoId))).toBe('not-found');
    host.clock.setNow(new Date(Date.parse(SEED_NOW) + DAY_MS + 60_000));
    expect(await refusalReason(host.api.undo.undo(DEMO, receipts.at(-1)!.undoId))).toBe('undo_expired');

    // Archive, not the receipt, is the durable path — and it survives a reopen.
    const later = await reopen(file.path, new Date(Date.parse(SEED_NOW) + DAY_MS + 60_000).toISOString());
    expect(await archivedSectionIds(later.api)).toEqual(expect.arrayContaining([prose, container]));
    await later.api.sections.restoreSection(DEMO, prose);
    await later.api.sections.restoreSection(DEMO, container);

    const final = await reopen(file.path);
    expectReferentialIntegrity(final.document());
    expect(final.document().sections.find(({ id }) => id === prose)).toMatchObject({ config: { text: 'Whole-house plan. Kitchen first, garden in the spring.' } });
    expect(final.document().sections.find(({ id }) => id === prose)?.archivedAt).toBeUndefined();
    expect(final.document().sections.find(({ id }) => id === container)?.archivedAt).toBeUndefined();
    for (const id of cascaded) expect(final.document().tasks.find((task) => task.id === id)?.archivedAt).toBeUndefined();
  });
});
