import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrototypeDocumentSchema, type OperationReceipt, type PrototypeDocument, type SectionId } from '@cwm/contracts';
import { DomainRuleError, EntityNotFoundError, SimulatedClock, type ActorContext } from '@cwm/domain';
import { SEED_NOW } from '@cwm/prototype-data';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from './api/services.ts';
import { loadPersistence } from './persistence/store.ts';

/**
 * Slices 33 and 35 (Refactor §26.3, §26.5, §26.11): recovery, conversion and history over real files on disk.
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

/** Runs the next step in `direction` for `actor` at the history's current revision, the way a client does. */
const step = async (api: ReturnType<typeof createApi>, actor: ActorContext, direction: 'undo' | 'redo', projectId = ROOT) => {
  const summary = await api.history.summary(actor, projectId);
  const next = summary[direction];
  if (summary.historyId === null || next === null) throw new Error(`nothing to ${direction}`);
  return api.history.transition(actor, summary.historyId, { actionId: next.actionId, direction, expectedRevision: summary.revision });
};

/** A transition naming exactly this receipt's action, at the history's current revision. */
const transitionOf = async (api: ReturnType<typeof createApi>, actor: ActorContext, receipt: OperationReceipt, direction: 'undo' | 'redo' = 'undo') => {
  const summary = await api.history.summary(actor, ROOT);
  return api.history.transition(actor, receipt.historyId, { actionId: receipt.actionId, direction, expectedRevision: summary.revision });
};

/** Version-3 Undo records as a real version-3 file held them: one consumed, one outstanding. */
const legacyReceipts = (document: Record<string, unknown[]>) => {
  const section = document['sections']!.find((candidate) => (candidate as { id: string }).id === 'section-project-renovation-brief');
  const base = { workspaceId: 'workspace-demo', projectId: 'project-renovation', actor: 'user', actorUserId: 'user-demo', label: 'Removed the Brief section', createdAt: SEED_NOW, expiresAt: '2026-08-25T16:00:00.000Z' };
  document['undoRecords'] = [
    { ...base, id: 'undo-consumed', sequence: 1, consumedAt: SEED_NOW, operation: { version: 1, type: 'section.add', section } },
    { ...base, id: 'undo-outstanding', sequence: 2, operation: { version: 1, type: 'section.remove', section, placement: { pageId: 'page-project-renovation', index: 0 }, appliedPolicy: 'none', rows: [], postSectionArchivedAt: SEED_NOW } },
  ];
};

describe('recovery, conversion and history over persisted files (Slices 33, 35)', () => {
  it('v2 and v3 files convert through the real CLI to version 4 and reopen with content and references intact', async () => {
    // ---- version 2, through the real CLI and the frozen version-3 intermediate.
    const v2 = await tempCopy('nested-projects-v2.json', (document) => document['sections']!.push(legacyTombstone(false)));
    const { stdout } = await upgrade(v2.path);
    expect(stdout).toMatch(/Converted .* from schema version 2 to 4\. Undo and Redo history starts empty\./);
    const backups = (await readdir(v2.directory)).filter((name) => name.startsWith('data.json.backup-'));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(v2.directory, backups[0]!), 'utf8')).toBe(v2.source);

    const original = JSON.parse(v2.source) as PrototypeDocument;
    const converted = await reopen(v2.path);
    expect(converted.document().schemaVersion).toBe(4);
    expectReferentialIntegrity(converted.document());
    expect(converted.document().users).toEqual(original.users);
    expect(converted.document().milestones).toEqual(original.milestones);
    expect(converted.document().activityEvents).toEqual(original.activityEvents);
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
    await transitionOf(converted.api, DEMO, removed.operation);
    const afterUndo = await reopen(v2.path);
    expectReferentialIntegrity(await onDisk(v2.path));
    expect(afterUndo.document().sections.find(({ id }) => id === brief)).toMatchObject({ position: 0, archiveGeneration: 1, config: { text: 'Whole-house plan. Kitchen first, garden in the spring.' } });
    expect(afterUndo.document().sections.find(({ id }) => id === brief)?.archivedAt).toBeUndefined();
    expect(afterUndo.document().operationActions).toEqual([expect.objectContaining({ id: removed.operation.actionId, state: 'undone' })]);

    // ---- version 3 holding legacy receipts: converted once, receipts retired, then a no-op.
    const v3 = await tempCopy('nested-projects-v3.json', (document) => {
      document['sections']!.push(legacyTombstone(true));
      legacyReceipts(document);
    });
    expect((await upgrade(v3.path)).stdout).toMatch(/from schema version 3 to 4\. 2 Undo receipts from version 3 were retired: Undo and Redo history starts empty\./);
    expect((await readdir(v3.directory)).filter((name) => name.includes('backup'))).toHaveLength(1);
    expect((await upgrade(v3.path)).stdout).toMatch(/already at schema version 4\. Nothing was written/);
    expect((await readdir(v3.directory)).filter((name) => name.includes('backup'))).toHaveLength(1);

    const loaded = await reopen(v3.path);
    expectReferentialIntegrity(loaded.document());
    expect(loaded.document()).not.toHaveProperty('undoRecords');
    expect(JSON.parse(await readFile(v3.path, 'utf8'))).not.toHaveProperty('undoRecords');
    expect(await loaded.api.history.summary(DEMO, ROOT)).toMatchObject({ historyId: null, undo: null, redo: null });
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
    await removedOnDisk.api.history.transition(DEMO, cascade.operation.historyId, {
      actionId: cascade.operation.actionId, direction: 'undo', expectedRevision: cascade.operation.revision,
    });

    const restored = await reopen(v3.path);
    expectReferentialIntegrity(restored.document());
    expect(restored.document().sections.find(({ id }) => id === source)?.archivedAt).toBeUndefined();
    for (const id of kitchenTasks) {
      expect(restored.document().tasks.find((task) => task.id === id)).toMatchObject({ sectionId: source });
      expect(restored.document().tasks.find((task) => task.id === id)?.archivedAt).toBeUndefined();
    }
  });

  it('cursor, revision and both entries survive a restart for the owning actor, and nothing for another', async () => {
    const file = await tempCopy('nested-projects-v3.json');
    await upgrade(file.path);
    const host = await reopen(file.path);
    const activity = 'section-project-renovation-recent-activity' as SectionId;
    const before = host.document().sections.find(({ id }) => id === activity)!;
    const beforeOrder = homeOrder(host.document());
    const beforeProgress = host.document().sections.find(({ id }) => id === 'section-project-renovation-progress')!;

    const added = await host.api.sections.add(DEMO, ROOT, { type: 'rich-text', title: 'Scratch' });
    const updated = await host.api.sections.update(DEMO, 'section-project-renovation-progress' as SectionId, { title: 'Burn-up' });
    const moved = await host.api.sections.move(DEMO, 'section-project-renovation-timeline' as SectionId, 0);
    const removed = await host.api.sections.remove(DEMO, activity);
    const receipts = [added.operation, updated.operation!, moved.operation!, removed.operation];
    expect(receipts.map(({ operation }) => operation)).toEqual(['section.add', 'section.update', 'section.move', 'section.remove']);
    expect(new Set(receipts.map(({ historyId }) => historyId)).size).toBe(1);
    const afterWrites = homeOrder(host.document());

    // Undo the two newest, so the reopened history has both an Undo and a Redo waiting.
    await step(host.api, DEMO, 'undo');
    await step(host.api, DEMO, 'undo');
    const summary = await host.api.history.summary(DEMO, ROOT);
    expect(summary).toMatchObject({ revision: 6, undo: { actionId: updated.operation!.actionId }, redo: { actionId: moved.operation!.actionId } });

    const reopened = await reopen(file.path);
    expectReferentialIntegrity(await onDisk(file.path));
    expect(await reopened.api.history.summary(DEMO, ROOT)).toEqual(summary);
    expect((await onDisk(file.path)).operationHistories).toEqual([
      expect.objectContaining({ id: summary.historyId, actor: 'user', actorUserId: 'user-demo', cursor: 2, orderHighWaterMark: 4, revision: 6 }),
    ]);
    // Another actor: an agent of the same workspace has no history here, and another workspace cannot see the project.
    const agent: ActorContext = { actor: 'agent', workspaceId: DEMO.workspaceId, agentConnectionId: 'agent-claude' as never, permissions: ['projects.read', 'projects.write'] };
    expect(await reopened.api.history.summary(agent, ROOT)).toMatchObject({ historyId: null });
    expect(await refusalReason(reopened.api.history.summary(ALEX, ROOT))).toBe('not-found');
    expect(await refusalReason(reopened.api.history.transition(agent, summary.historyId!, { actionId: summary.undo!.actionId, direction: 'undo', expectedRevision: summary.revision }))).toBe('not-found');

    // Redo both on the reopened host, then Undo all four: every intermediate state is on disk.
    await step(reopened.api, DEMO, 'redo');
    await step(reopened.api, DEMO, 'redo');
    expect(homeOrder(await onDisk(file.path))).toEqual(afterWrites);
    for (let index = 0; index < 4; index += 1) await step(reopened.api, DEMO, 'undo');

    const final = await reopen(file.path);
    const document = await onDisk(file.path);
    expectReferentialIntegrity(document);
    expect(document.sections.find(({ id }) => id === activity)).toMatchObject({
      id: activity, pageId: before.pageId, position: before.position, columnSpan: before.columnSpan, collapsed: before.collapsed, config: before.config,
    });
    expect(document.sections.find(({ id }) => id === added.section.id)).toBeUndefined();
    expect(document.sections.find(({ id }) => id === beforeProgress.id)?.title).toBe(beforeProgress.title);
    expect(homeOrder(document)).toEqual(beforeOrder);
    expect(document.operationActions.map(({ id, state }) => [id, state])).toEqual(receipts.map(({ actionId }) => [actionId, 'undone']));
    expect(await final.api.history.summary(DEMO, ROOT)).toMatchObject({ undo: null, redo: { actionId: added.operation.actionId } });
  });

  it('Archive outlives expired and pruned actions', async () => {
    const file = await tempCopy('nested-projects-v3.json');
    await upgrade(file.path);
    const host = await reopen(file.path);
    const prose = 'section-project-renovation-brief' as SectionId;
    const container = 'section-project-kitchen-tasks' as SectionId;
    const cascaded = host.document().tasks.filter((task) => task.sectionId === container && task.archivedAt === undefined).map(({ id }) => id);

    const proseRemoval = await host.api.sections.remove(DEMO, prose);
    const containerRemoval = await host.api.sections.remove(DEMO, container, { policy: 'cascade' });
    const theirs = await host.api.sections.add(ALEX, 'project-alex-private' as never, { type: 'rich-text', title: 'Alex scratch' });
    const theirAction = host.document().operationActions.find(({ id }) => id === theirs.operation.actionId);

    // All four families in the renovation root's history, well past the 50-action limit.
    const receipts: OperationReceipt[] = [proseRemoval.operation];
    for (let index = 0; index < 50; index += 1) {
      receipts.push((await host.api.sections.add(DEMO, ROOT, { type: 'rich-text', title: `Scratch ${index}` })).operation);
    }
    for (const id of ['section-project-renovation-progress', 'section-project-renovation-timeline']) {
      receipts.push((await host.api.sections.update(DEMO, id as SectionId, { collapsed: true })).operation!);
    }
    for (const id of ['section-project-renovation-sub-projects', 'section-project-renovation-progress']) {
      receipts.push((await host.api.sections.move(DEMO, id as SectionId, 0)).operation!);
    }
    receipts.push((await host.api.sections.remove(DEMO, 'section-project-renovation-recent-activity' as SectionId)).operation);
    expect(new Set(receipts.map(({ operation }) => operation))).toEqual(new Set(['section.add', 'section.update', 'section.move', 'section.remove']));
    expect(receipts).toHaveLength(56);

    const rootHistory = receipts[0]!.historyId;
    const rootActions = host.document().operationActions.filter(({ historyId }) => historyId === rootHistory);
    expect(rootActions).toHaveLength(50);
    expect(rootActions.map(({ id }) => id)).toEqual(receipts.slice(-50).map(({ actionId }) => actionId));
    // The kitchen removal records in the kitchen's own history, and Alex's in Alex's: pruning one history touches neither.
    expect(containerRemoval.operation.historyId).not.toBe(rootHistory);
    expect(host.document().operationActions.find(({ id }) => id === containerRemoval.operation.actionId)).toBeDefined();
    expect(host.document().operationActions.find(({ id }) => id === theirs.operation.actionId)).toEqual(theirAction);

    // A pruned action is gone and never the next step; the newest refuses once it expires.
    expect(await refusalReason(transitionOf(host.api, DEMO, proseRemoval.operation))).toBe('history_not_next');
    host.clock.setNow(new Date(Date.parse(SEED_NOW) + DAY_MS + 60_000));
    expect(await host.api.history.summary(DEMO, ROOT)).toMatchObject({ undo: null });
    expect(await refusalReason(transitionOf(host.api, DEMO, receipts.at(-1)!))).toBe('history_expired');

    // Archive, not history, is the durable path — and it survives a reopen.
    const later = await reopen(file.path, new Date(Date.parse(SEED_NOW) + DAY_MS + 60_000).toISOString());
    expect(await archivedSectionIds(later.api)).toEqual(expect.arrayContaining([prose, container]));
    await later.api.sections.restoreSection(DEMO, prose);
    await later.api.sections.restoreSection(DEMO, container);

    const final = await reopen(file.path);
    expectReferentialIntegrity(final.document());
    expect(final.document().sections.find(({ id }) => id === prose)).toMatchObject({ archiveGeneration: 1, config: { text: 'Whole-house plan. Kitchen first, garden in the spring.' } });
    expect(final.document().sections.find(({ id }) => id === prose)?.archivedAt).toBeUndefined();
    expect(final.document().sections.find(({ id }) => id === container)?.archivedAt).toBeUndefined();
    for (const id of cascaded) expect(final.document().tasks.find((task) => task.id === id)?.archivedAt).toBeUndefined();
  });
});
