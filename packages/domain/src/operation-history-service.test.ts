import {
  PrototypeDocumentSchema,
  type ActivityEvent,
  type OperationHistoryTransitionResult,
  type OperationReceipt,
  type SectionId,
  type UndoConflict,
  type UserId,
  type WorkspaceId,
} from '@cwm/contracts';
import { PERSONAS, SEED_NOW } from '@cwm/prototype-data';
import { InMemoryDataStore, JsonDataStore, unitOfWorkFor, type FileOperations } from '@cwm/repositories';
import { describe, expect, it, vi } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS, twoPersonaDocument } from '../test/test-support';
import type { ActorContext } from './actor';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';
import { PrototypeIdGenerator } from './ids';
import type { LivePublication } from './live-events';
import { listPlacements } from './page-placements';

type Harness = ReturnType<typeof buildHarness>;

const LATER = '2026-08-24T17:00:00.000Z';

/** Somebody else with write access in the same workspace: their writes never enter the person's history. */
const someoneElse = agentActorFor(0, ['projects.read', 'projects.write']);
/** The same workspace, a different actor, granted only what a row write needs. */
const someoneElsesRows = agentActorFor(0, ['tasks.write', 'reflections.write']);

/** Resolves to the refusal a promise rejects with, and fails the test if it resolves. */
const refusalOf = (promise: Promise<unknown>): Promise<DomainRuleError> =>
  promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (error: unknown) => error as DomainRuleError,
  );

/** Everything a transition could write, for "nothing changed" assertions. */
const state = (harness: Harness) => {
  const { sections, sectionShortcuts, tasks, reflections, activityEvents, operationHistories, operationActions } = harness.store.snapshot();
  return { sections, sectionShortcuts, tasks, reflections, activityEvents, operationHistories, operationActions };
};

/** The page's combined live order, as ids. */
const order = async (harness: Harness, pageId = `page-${MINE}`) =>
  (await listPlacements(harness, pageId as never)).map(({ value }) => value.id);

const transition = (harness: Harness, actor: ActorContext, receipt: OperationReceipt, direction: 'undo' | 'redo', expectedRevision: number) =>
  harness.operationHistoryService.transition(actor, receipt.historyId, { actionId: receipt.actionId, direction, expectedRevision });

const historyOf = async (harness: Harness, receipt: OperationReceipt) => (await harness.operationHistories.find(receipt.historyId))!;

describe('OperationHistoryService — the Stage A gate', () => {
  it('same-field A → B → Undo B → Undo A → Redo A → Redo B returns every intermediate state', async () => {
    const harness = buildHarness();
    const notes = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'Start' });
    const a = (await harness.sectionWriteService.update(harness.actor, notes.section.id, { title: 'A' })).operation!;
    const b = (await harness.sectionWriteService.update(harness.actor, notes.section.id, { title: 'B' })).operation!;
    const title = async () => (await harness.sections.find(notes.section.id))?.title;
    const start = await historyOf(harness, b);
    expect(start).toMatchObject({ cursor: 3, revision: 3 });

    const steps: Array<[OperationReceipt, 'undo' | 'redo', string]> = [
      [b, 'undo', 'A'],
      [a, 'undo', 'Start'],
      [a, 'redo', 'A'],
      [b, 'redo', 'B'],
    ];
    let revision = start.revision;
    for (const [receipt, direction, expected] of steps) {
      const result: OperationHistoryTransitionResult = await transition(harness, harness.actor, receipt, direction, revision);
      expect(result).toMatchObject({ direction, actionId: receipt.actionId, summary: { revision: revision + 1 } });
      revision = result.summary.revision;
      expect(await title()).toBe(expected);
    }

    const end = await historyOf(harness, b);
    expect(end).toMatchObject({ cursor: start.cursor, orderHighWaterMark: start.orderHighWaterMark, revision: start.revision + 4 });
    expect(await harness.operationHistoryService.summary(harness.actor, MINE)).toMatchObject({
      undo: { actionId: b.actionId, operation: 'section.update', label: 'Updated the A section' }, redo: null,
    });
  });

  it('the summary names the next entries, `null` at each end, and never an operation payload', async () => {
    const harness = buildHarness();
    expect(await harness.operationHistoryService.summary(harness.actor, MINE)).toEqual({
      projectId: MINE, historyId: null, revision: 0, undo: null, redo: null, blockedBy: null,
    });
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress' });
    await harness.undo(harness.actor, added.operation);

    const summary = await harness.operationHistoryService.summary(harness.actor, MINE);

    expect(summary).toEqual({
      projectId: MINE, historyId: added.operation.historyId, revision: 2, undo: null,
      redo: { actionId: added.operation.actionId, operation: 'section.add', label: 'Added the Progress section', expiresAt: added.operation.expiresAt },
      blockedBy: null,
    });
    expect(JSON.stringify(summary)).not.toMatch(/placement|section-|config/);
  });
});

describe('OperationHistoryService — branch invalidation', () => {
  it('a new write clears the redo branch from storage, and the stack below still undoes', async () => {
    const harness = buildHarness();
    const notes = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'Start' });
    const a = (await harness.sectionWriteService.update(harness.actor, notes.section.id, { title: 'A' })).operation!;
    const b = (await harness.sectionWriteService.update(harness.actor, notes.section.id, { title: 'B' })).operation!;
    await harness.undo(harness.actor, b);

    const c = (await harness.sectionWriteService.update(harness.actor, notes.section.id, { collapsed: true })).operation!;

    expect((await harness.operationHistoryService.summary(harness.actor, MINE)).redo).toBeNull();
    expect(await harness.operationActions.find(b.actionId)).toBeNull();
    await harness.undo(harness.actor, c);
    await harness.undo(harness.actor, a);
    expect(await harness.sections.find(notes.section.id)).toMatchObject({ title: 'Start', collapsed: false });
  });

  it('a no-op write, a refused transition and a failed write each leave redo untouched', async () => {
    const harness = buildHarness();
    const notes = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'Start' });
    const a = (await harness.sectionWriteService.update(harness.actor, notes.section.id, { title: 'A' })).operation!;
    await harness.undo(harness.actor, a);
    const redo = async () => (await harness.operationHistoryService.summary(harness.actor, MINE)).redo?.actionId;
    expect(await redo()).toBe(a.actionId);

    expect((await harness.sectionWriteService.update(harness.actor, notes.section.id, { title: 'Start' })).operation).toBeNull();
    expect(await redo()).toBe(a.actionId);

    await refusalOf(transition(harness, harness.actor, a, 'redo', 0));
    expect(await redo()).toBe(a.actionId);

    harness.store.persistFailure = new Error('disk full');
    await expect(harness.sectionWriteService.update(harness.actor, notes.section.id, { title: 'Lost' })).rejects.toThrow('disk full');
    harness.store.persistFailure = undefined;
    expect(await redo()).toBe(a.actionId);
    expect(await harness.operationActions.find(a.actionId)).toMatchObject({ state: 'undone' });
  });
});

describe('OperationHistoryService — every family in both directions', () => {
  it('add, move, update and remove each Undo and Redo to the exact prior and next state', async () => {
    const harness = buildHarness();
    const first = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', title: 'First' });
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'Added', config: { text: 'Prose' } });
    const moved = await harness.sectionWriteService.move(harness.actor, added.section.id, 0);
    const updated = await harness.sectionWriteService.update(harness.actor, added.section.id, { columnSpan: 6, title: 'Renamed' });
    const removed = await harness.sectionWriteService.remove(harness.actor, added.section.id);
    const snapshots: ReturnType<typeof state>['sections'][] = [];
    const record = async () => snapshots.push(structuredClone(harness.store.snapshot().sections.map(({ updatedAt: _u, ...rest }) => rest)) as never);

    await record();
    for (const receipt of [removed.operation, updated.operation!, moved.operation!, added.operation]) {
      await harness.undo(harness.actor, receipt);
      await record();
    }
    expect(await order(harness)).toEqual([first.section.id]);
    for (const receipt of [added.operation, moved.operation!, updated.operation!, removed.operation]) {
      await harness.redo(harness.actor, receipt);
      await record();
    }

    // Walking back up visits exactly the states walking down did, in reverse.
    expect(snapshots.slice(5)).toEqual(snapshots.slice(0, 4).reverse());
    expect(await harness.sections.find(added.section.id)).toMatchObject({ archivedAt: SEED_NOW, archiveGeneration: 1, title: 'Renamed' });
  });

  it('a reapply replays captured markers and the captured generation verbatim', async () => {
    const harness = buildHarness();
    const parent = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Parent' });
    const child = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Child', parentTaskId: parent.id });
    const removed = await harness.sectionWriteService.remove(harness.actor, parent.sectionId, { policy: 'cascade' });
    const archived = structuredClone(harness.store.snapshot());
    harness.clock.setNow(new Date(LATER));

    await harness.undo(harness.actor, removed.operation);
    expect((await harness.sections.find(parent.sectionId))?.archiveGeneration).toBe(1);
    await harness.redo(harness.actor, removed.operation);

    const strip = <T extends { updatedAt: string }>({ updatedAt: _u, ...rest }: T) => rest;
    expect(strip((await harness.sections.find(parent.sectionId))!)).toEqual(strip(archived.sections.find(({ id }) => id === parent.sectionId)!));
    for (const id of [parent.id, child.id]) {
      expect(strip((await harness.tasks.find(id))!)).toEqual(strip(archived.tasks.find((task) => task.id === id)!));
    }
    expect((await harness.sections.find(parent.sectionId))?.updatedAt).toBe(LATER);
    // So the next Undo of the same action does not refuse as archived differently.
    await expect(harness.undo(harness.actor, removed.operation)).resolves.toMatchObject({ outcome: 'restored' });
  });

  it('the removal re-archives exactly its rows, leaving an independently archived row untouched both ways', async () => {
    const harness = buildHarness();
    const live = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Live' });
    const filed = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed' });
    await harness.taskService.archive(harness.actor, filed.id);
    const filedBefore = await harness.tasks.find(filed.id);
    const removed = await harness.sectionWriteService.remove(harness.actor, live.sectionId, { policy: 'cascade' });

    await harness.undo(harness.actor, removed.operation);
    expect(await harness.tasks.find(filed.id)).toEqual(filedBefore);
    expect((await harness.tasks.find(live.id))?.archivedAt).toBeUndefined();

    await expect(harness.redo(harness.actor, removed.operation)).resolves.toEqual({
      operation: 'section.remove', outcome: 'removed', section: expect.objectContaining({ id: live.sectionId, archivedAt: SEED_NOW }),
      disposition: 'retained', settledRowCount: 1,
    });
    expect(await harness.tasks.find(live.id)).toMatchObject({ archivedAt: SEED_NOW, archivedWithSectionId: live.sectionId });
    expect(await harness.tasks.find(filed.id)).toEqual(filedBefore);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('Redo of a disposable removal deletes the section again', async () => {
    const harness = buildHarness();
    const view = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'timeline' });
    const removed = await harness.sectionWriteService.remove(harness.actor, view.section.id);
    expect(await harness.sections.find(view.section.id)).toBeNull();

    await harness.undo(harness.actor, removed.operation);
    expect(await harness.sections.find(view.section.id)).toMatchObject({ archiveGeneration: 1 });
    await expect(harness.redo(harness.actor, removed.operation)).resolves.toMatchObject({ disposition: 'deleted' });

    expect(await harness.sections.find(view.section.id)).toBeNull();
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('Redo of a removal refuses when new rows appeared, never absorbing them', async () => {
    const harness = buildHarness();
    const list = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'task-list', title: 'List' });
    const live = await harness.taskService.create(harness.actor, { projectId: MINE, sectionId: list.section.id, title: 'Live' });
    const removed = await harness.sectionWriteService.remove(harness.actor, list.section.id, { policy: 'cascade' });
    await harness.undo(harness.actor, removed.operation);
    const later = await harness.taskService.create(someoneElsesRows, { projectId: MINE, sectionId: list.section.id, title: 'Later' });
    const before = state(harness);

    const refusal = await refusalOf(harness.redo(harness.actor, removed.operation));

    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [{ entityType: 'task', id: later.id, title: 'Later', problem: 'new-dependent', nextStep: 'restore-or-move-dependent-and-retry' }],
    });
    expect(state(harness)).toEqual(before);
    expect((await harness.tasks.find(live.id))?.archivedAt).toBeUndefined();
  });
});

/**
 * Home: a Notes section, the Progress view under test, and a shortcut to a sub-project's
 * section — so the view sits between one placement of each kind.
 */
const homeWithShortcut = async (harness: Harness) => {
  const kitchen = await harness.projectService.create(harness.actor, {
    workspaceId: harness.actor.workspaceId, kind: 'subproject', parentProjectId: MINE, name: 'Kitchen',
  });
  const source = await harness.sectionService.add(harness.actor, kitchen.id, { type: 'rich-text' });
  const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', config: { text: 'Prose' } });
  const progress = await harness.sectionService.add(harness.actor, MINE, { type: 'progress', title: 'Burn-up', columnSpan: 6 });
  await harness.sectionService.update(harness.actor, progress.id, { collapsed: true, config: { milestoneIds: ['m-1'] } });
  const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
    pageId: `page-${MINE}` as never,
    sourceSectionId: source.id,
  });
  return { kitchen, notes, progress: (await harness.sections.find(progress.id))!, shortcut };
};

describe('OperationHistoryService — removal Undo placement', () => {
  it('recreates a deleted disposable view from its snapshot in its old placement', async () => {
    const harness = buildHarness();
    const before = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', config: { text: 'Keep' } });
    const progress = await harness.sectionService.add(harness.actor, MINE, {
      type: 'progress', title: 'Burn-up', columnSpan: 6, config: { milestoneIds: ['m-1'] },
    });
    const after = await harness.sectionService.add(harness.actor, MINE, { type: 'timeline' });
    await harness.sectionService.update(harness.actor, progress.id, { collapsed: true });

    const { operation } = await harness.sectionService.remove(harness.actor, progress.id);
    expect(await harness.sections.find(progress.id)).toBeNull();
    expect(harness.store.snapshot().operationActions.at(-1)?.operation).toMatchObject({ disposition: 'deleted' });

    const result = await harness.undo(harness.actor, operation);

    expect(result).toMatchObject({
      operation: 'section.remove',
      section: { id: progress.id, type: 'progress', title: 'Burn-up', config: { milestoneIds: ['m-1'] }, columnSpan: 6, collapsed: true, archiveGeneration: 1 },
    });
    expect(await order(harness)).toEqual([before.id, progress.id, after.id]);
  });

  it('restores a disposable view exactly, between the same neighbours', async () => {
    const harness = buildHarness();
    const { notes, progress, shortcut } = await homeWithShortcut(harness);
    const { operation } = await harness.sectionService.remove(harness.actor, progress.id);
    expect(await order(harness)).toEqual([notes.id, shortcut.id]);
    harness.clock.setNow(new Date(LATER));

    const result = await harness.undo(harness.actor, operation);

    expect(await order(harness)).toEqual([notes.id, progress.id, shortcut.id]);
    // Its generation stays where the removal left it: Undo never moves it back.
    const restored = { ...progress, archiveGeneration: 1, updatedAt: LATER };
    expect(await harness.sections.find(progress.id)).toEqual(restored);
    expect(result).toEqual({
      operation: 'section.remove',
      outcome: 'restored',
      section: restored,
      placement: { pageId: `page-${MINE}`, index: 1, strategy: 'previous', pageEnabled: true },
      restoredRowCount: 0,
    });
    expect((await harness.operationActions.find(operation.actionId))?.state).toBe('undone');
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('follows the previous neighbour past an interposed insert, leaving shifted siblings’ timestamps alone', async () => {
    const harness = buildHarness();
    const { notes, progress, shortcut } = await homeWithShortcut(harness);
    const { operation } = await harness.sectionService.remove(harness.actor, progress.id);
    const inserted = await harness.sectionService.add(someoneElse, MINE, { type: 'rich-text', position: 0 });
    const before = await harness.sectionShortcutService.list(harness.actor, MINE);
    harness.clock.setNow(new Date(LATER));

    const result = await harness.undo(harness.actor, operation);

    expect(await order(harness)).toEqual([inserted.id, notes.id, progress.id, shortcut.id]);
    expect(result).toMatchObject({ placement: { index: 2, strategy: 'previous' } });
    const moved = (await harness.shortcuts.find(shortcut.id))!;
    expect(moved.position).toBe(3);
    expect(moved.updatedAt).toBe(before[0]!.updatedAt);
    expect((await harness.sections.find(notes.id))?.updatedAt).toBe(SEED_NOW);
  });

  it('inserts before the next neighbour when the previous one is gone', async () => {
    const harness = buildHarness();
    const { notes, progress, shortcut } = await homeWithShortcut(harness);
    const { operation } = await harness.sectionService.remove(harness.actor, progress.id);
    await harness.sectionService.remove(someoneElse, notes.id);

    const result = await harness.undo(harness.actor, operation);

    expect(await order(harness)).toEqual([progress.id, shortcut.id]);
    expect(result).toMatchObject({ placement: { index: 0, strategy: 'next' } });
  });

  it('clamps the original index when both neighbours are gone', async () => {
    const harness = buildHarness();
    const { notes, progress, shortcut } = await homeWithShortcut(harness);
    const { operation } = await harness.sectionService.remove(harness.actor, progress.id);
    await harness.sectionService.remove(someoneElse, notes.id);
    await harness.sectionShortcutService.remove(someoneElse, shortcut.id);
    const x = await harness.sectionService.add(someoneElse, MINE, { type: 'timeline' });
    const y = await harness.sectionService.add(someoneElse, MINE, { type: 'timeline' });

    const result = await harness.undo(harness.actor, operation);

    expect(await order(harness)).toEqual([x.id, progress.id, y.id]);
    expect(result).toMatchObject({ placement: { index: 1, strategy: 'index' } });
  });

  it('restores onto a page that was disabled after the removal, and says so', async () => {
    const harness = buildHarness();
    const page = await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'reflections', enabled: true });
    const journal = await harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: page.id });
    const { operation } = await harness.sectionService.remove(harness.actor, journal.id);
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'reflections', enabled: false });

    const result = await harness.undo(harness.actor, operation);

    expect(result).toMatchObject({ outcome: 'restored', placement: { pageId: page.id, index: 0, pageEnabled: false } });
    expect((await harness.sections.find(journal.id))?.archivedAt).toBeUndefined();
  });
});

describe('OperationHistoryService — removal Undo rows', () => {
  it('reverses a cascade exactly, leaving independently archived rows and their subtrees as they were', async () => {
    const harness = buildHarness();
    const parent = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Parent' });
    const child = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Child', parentTaskId: parent.id });
    const filed = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed' });
    const filedChild = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed child', parentTaskId: filed.id });
    await harness.taskService.archive(harness.actor, filed.id);
    const filedBefore = [await harness.tasks.find(filed.id), await harness.tasks.find(filedChild.id)];
    const { operation } = await harness.sectionService.remove(harness.actor, parent.sectionId, { policy: 'cascade' });

    const result = await harness.undo(harness.actor, operation);

    expect(result).toMatchObject({ restoredRowCount: 2 });
    expect((await harness.sections.find(parent.sectionId))?.archivedAt).toBeUndefined();
    for (const id of [parent.id, child.id]) {
      const row = (await harness.tasks.find(id))!;
      expect(row.archivedAt).toBeUndefined();
      expect(row.archivedWithSectionId).toBeUndefined();
    }
    expect((await harness.tasks.find(child.id))?.parentTaskId).toBe(parent.id);
    expect([await harness.tasks.find(filed.id), await harness.tasks.find(filedChild.id)]).toEqual(filedBefore);
    expect(filedBefore[1]).toMatchObject({ archivedWithTaskId: filed.id });
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('reverses a reflections-container cascade, leaving a reflection archived on its own archived', async () => {
    const harness = buildHarness();
    const live = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'A quiet week' });
    const filed = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'Old news' });
    await harness.reflectionService.archive(harness.actor, filed.id);
    const filedBefore = await harness.reflections.find(filed.id);
    const { operation } = await harness.sectionService.remove(harness.actor, live.sectionId, { policy: 'cascade' });

    const result = await harness.undo(harness.actor, operation);

    expect(result).toMatchObject({ restoredRowCount: 1 });
    const restored = (await harness.reflections.find(live.id))!;
    expect(restored.archivedAt).toBeUndefined();
    expect(restored.archivedWithSectionId).toBeUndefined();
    expect(await harness.reflections.find(filed.id)).toEqual(filedBefore);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('reverses and reapplies a reassign after later title and status edits, preserving the edits', async () => {
    const harness = buildHarness();
    const live = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Live' });
    const filed = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed' });
    await harness.taskService.archive(harness.actor, filed.id);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    const own = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Own', sectionId: target.id });
    const source = live.sectionId;
    const { operation } = await harness.sectionService.remove(harness.actor, source, { policy: 'reassign', reassignToSectionId: target.id });
    await harness.taskService.update(someoneElsesRows, live.id, { title: 'Renamed', status: 'in_progress' });

    const result = await harness.undo(harness.actor, operation);

    expect(result).toMatchObject({ restoredRowCount: 2 });
    expect(await harness.tasks.find(live.id)).toMatchObject({ sectionId: source, title: 'Renamed', status: 'in_progress' });
    expect(await harness.tasks.find(filed.id)).toMatchObject({ sectionId: source, archivedAt: SEED_NOW });
    expect((await harness.tasks.find(own.id))?.sectionId).toBe(target.id);

    await harness.redo(harness.actor, operation);
    expect(await harness.tasks.find(live.id)).toMatchObject({ sectionId: target.id, title: 'Renamed' });
    expect(await harness.tasks.find(filed.id)).toMatchObject({ sectionId: target.id, archivedAt: SEED_NOW });
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });
});

describe('OperationHistoryService — conflicts and retirement', () => {
  /** Refuses with exactly these problems, and writes nothing — cursor, revision and activity included. */
  const expectConflict = async (harness: Harness, receipt: OperationReceipt, conflicts: UndoConflict[]) => {
    const before = state(harness);

    const refusal = await refusalOf(harness.undo(harness.actor, receipt));

    expect(refusal).toBeInstanceOf(DomainRuleError);
    expect(refusal.details).toMatchObject({ reason: 'history_conflict', historyId: receipt.historyId, actionId: receipt.actionId, conflicts });
    expect(refusal.message).toMatch(/^history_conflict: /);
    for (const conflict of conflicts) {
      expect(refusal.message).toContain(conflict.problem);
      expect(refusal.message).toContain(conflict.id);
      if (conflict.title !== undefined) expect(refusal.message).toContain(`"${conflict.title}"`);
    }
    expect(state(harness)).toEqual(before);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  };

  it('a not-archived removal after an out-of-band restore retires and refuses with a refreshed summary', async () => {
    const harness = buildHarness();
    const other = await harness.sectionService.add(harness.actor, MINE, { type: 'progress', title: 'Other' });
    const edited = (await harness.sectionWriteService.update(harness.actor, other.id, { collapsed: true })).operation!;
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', title: 'Notes', config: { text: 'Prose' } });
    const { operation } = await harness.sectionService.remove(harness.actor, notes.id);
    await harness.sectionService.restoreSection(someoneElse, notes.id);
    const before = state(harness);
    const revision = (await historyOf(harness, operation)).revision;

    const refusal = await refusalOf(transition(harness, harness.actor, operation, 'undo', revision));

    expect(refusal.message).toMatch(/^history_retired: /);
    expect(refusal.details).toMatchObject({
      reason: 'history_retired', actionId: operation.actionId,
      conflicts: [{ entityType: 'section', id: notes.id, title: 'Notes', problem: 'not-archived', nextStep: 'nothing-to-undo' }],
      // The next call reaches the action below: the add of Notes.
      summary: { revision: revision + 1, undo: { operation: 'section.add', label: 'Added the Notes section' }, redo: null },
    });
    // Exactly the retirement committed: nothing executed and no activity was recorded.
    const after = state(harness);
    expect({ ...after, operationHistories: before.operationHistories, operationActions: before.operationActions }).toEqual(before);
    expect(await harness.operationActions.find(operation.actionId)).toMatchObject({ state: 'retired' });
    expect(await historyOf(harness, operation)).toMatchObject({ revision: revision + 1 });

    // The retired action no longer wedges the actions beneath it — and Redo never selects it.
    await harness.step(harness.actor, MINE, 'undo');
    await harness.undo(harness.actor, edited);
    await harness.step(harness.actor, MINE, 'redo');
    expect((await harness.operationHistoryService.summary(harness.actor, MINE)).redo?.actionId).toBe(
      harness.store.snapshot().operationActions.find(({ operation: op }) => op.type === 'section.add' && op.section.title === 'Notes')?.id,
    );
  });

  it.each([
    ['with the clock advanced', 60_000],
    ['within the same frozen instant', 0],
    ['with the clock set backwards', -60_000],
  ])('two removals of one retained section %s cannot cross-reverse', async (_, shift) => {
    const harness = buildHarness();
    const notes = await harness.sectionService.add(someoneElse, MINE, { type: 'rich-text', title: 'Notes', config: { text: 'Prose' } });
    const { operation: mine } = await harness.sectionService.remove(harness.actor, notes.id);
    await harness.sectionService.restoreSection(someoneElse, notes.id);
    harness.clock.setNow(new Date(Date.parse(SEED_NOW) + shift));
    const { operation: theirs } = await harness.sectionService.remove(someoneElse, notes.id);
    expect((await harness.sections.find(notes.id))?.archiveGeneration).toBe(2);

    // Same `archivedAt` when the clock did not move — only the generation tells the removals apart.
    const refusal = await refusalOf(harness.undo(harness.actor, mine));

    expect(refusal.details).toMatchObject({
      reason: 'history_retired',
      conflicts: [{ entityType: 'section', id: notes.id, problem: 'archived-differently', nextStep: 'change-by-hand-or-archive' }],
    });
    expect((await harness.sections.find(notes.id))?.archivedAt).toBe(new Date(Date.parse(SEED_NOW) + shift).toISOString());
    await expect(harness.undo(someoneElse, theirs)).resolves.toMatchObject({ outcome: 'restored' });
  });

  it('a deleted section whose id is held again retires rather than overwriting it', async () => {
    const harness = buildHarness();
    const progress = await harness.sectionService.add(harness.actor, MINE, { type: 'progress', title: 'Old' });
    const { operation } = await harness.sectionService.remove(harness.actor, progress.id);
    const original = (await harness.operationActions.find(operation.actionId))!.operation;
    if (original.type !== 'section.remove') throw new Error('unexpected operation');
    await harness.store.runUnitOfWork(() => harness.sections.insert({ ...original.section, title: 'Replacement', position: 0, updatedAt: LATER }));

    const refusal = await refusalOf(harness.undo(harness.actor, operation));

    expect(refusal.details).toMatchObject({
      reason: 'history_retired',
      conflicts: [{ entityType: 'section', id: progress.id, title: 'Replacement', problem: 'already-exists', nextStep: 'nothing-to-restore' }],
    });
    expect((await harness.sections.find(progress.id))?.title).toBe('Replacement');
  });

  /** A live row and an archived one reassigned from their list to another. */
  const reassigned = async (harness: Harness) => {
    const live = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Live' });
    const filed = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed' });
    await harness.taskService.archive(harness.actor, filed.id);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    const { operation } = await harness.sectionService.remove(harness.actor, live.sectionId, { policy: 'reassign', reassignToSectionId: target.id });
    return { live, filed, target, operation };
  };

  it('refuses when a reassigned row has since moved', async () => {
    const harness = buildHarness();
    const { live, operation } = await reassigned(harness);
    const other = await harness.sectionService.add(someoneElse, MINE, { type: 'task-list' });
    await harness.taskService.update(someoneElsesRows, live.id, { sectionId: other.id });

    await expectConflict(harness, operation, [{ entityType: 'task', id: live.id, title: 'Live', problem: 'moved', nextStep: 'move-back-and-retry' }]);
  });

  it('refuses when a reassigned row has since been archived', async () => {
    const harness = buildHarness();
    const { live, operation } = await reassigned(harness);
    await harness.taskService.archive(someoneElsesRows, live.id);

    await expectConflict(harness, operation, [{
      entityType: 'task', id: live.id, title: 'Live', problem: 'archive-state-changed', nextStep: 'restore-state-and-retry',
    }]);
  });

  it('refuses when a subtask was created under a moved parent', async () => {
    const harness = buildHarness();
    const { live, operation } = await reassigned(harness);
    const subtask = await harness.taskService.create(someoneElsesRows, { projectId: MINE, title: 'Sub', parentTaskId: live.id });

    await expectConflict(harness, operation, [{
      entityType: 'task', id: subtask.id, title: 'Sub', problem: 'new-dependent', nextStep: 'restore-or-move-dependent-and-retry',
    }]);
  });

  it('refuses when a reassigned row was reparented, listing every problem at once', async () => {
    const harness = buildHarness();
    const { live, filed, target, operation } = await reassigned(harness);
    const sibling = await harness.taskService.create(someoneElsesRows, { projectId: MINE, title: 'Sibling', sectionId: target.id });
    await harness.taskService.update(someoneElsesRows, live.id, { parentTaskId: sibling.id });
    await harness.taskService.restore(someoneElsesRows, filed.id);

    await expectConflict(harness, operation, [
      { entityType: 'task', id: live.id, title: 'Live', problem: 'reparented', nextStep: 'move-back-and-retry' },
      { entityType: 'task', id: filed.id, title: 'Filed', problem: 'archive-state-changed', nextStep: 'change-by-hand-or-archive' },
    ]);
  });
});

describe('OperationHistoryService — archived projects', () => {
  it('an archived project blocks a transition, the summary says so, and reactivation unblocks it', async () => {
    const harness = buildHarness();
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text' });
    const { operation } = await harness.sectionService.remove(harness.actor, notes.id);
    await harness.projectService.update(harness.actor, MINE, { status: 'archived' });
    const before = state(harness);

    const refusal = await refusalOf(harness.undo(harness.actor, operation));

    expect(refusal.message).toMatch(/^history_blocked: /);
    expect(refusal.details).toMatchObject({
      reason: 'history_blocked', historyId: operation.historyId, actionId: operation.actionId,
      blockingProjectId: MINE, blockingProjectTitle: 'Project project-mine',
      summary: { blockedBy: { projectId: MINE, title: 'Project project-mine' } },
    });
    expect(state(harness)).toEqual(before);
    await harness.projectService.update(harness.actor, MINE, { status: 'active' });
    await expect(harness.undo(harness.actor, operation)).resolves.toMatchObject({ outcome: 'restored' });
  });

  it('an archived ancestor blocks a transition in both directions, naming the highest one', async () => {
    const harness = buildHarness();
    const kitchen = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId, kind: 'subproject', parentProjectId: MINE, name: 'Kitchen',
    });
    const notes = await harness.sectionService.add(harness.actor, kitchen.id, { type: 'rich-text' });
    const { operation } = await harness.sectionService.remove(harness.actor, notes.id);
    await harness.projectService.archive(harness.actor, kitchen.id);
    await harness.projectService.archive(harness.actor, MINE);

    const refusal = await refusalOf(harness.undo(harness.actor, operation));
    expect(refusal.details).toMatchObject({ reason: 'history_blocked', blockingProjectId: MINE });

    await harness.projectService.update(harness.actor, MINE, { status: 'active' });
    await harness.projectService.update(harness.actor, kitchen.id, { status: 'active' });
    await harness.undo(harness.actor, operation);
    await harness.projectService.archive(harness.actor, kitchen.id);
    await harness.projectService.archive(harness.actor, MINE);
    expect((await refusalOf(harness.redo(harness.actor, operation))).details).toMatchObject({ reason: 'history_blocked', blockingProjectId: MINE });
  });
});

describe('OperationHistoryService — scope and grants', () => {
  const removedNotes = async (harness: Harness, actor: ActorContext = harness.actor) => {
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text' });
    return (await harness.sectionService.remove(actor, notes.id)).operation;
  };

  it('a foreign or unknown history answers the same not-found and discloses nothing', async () => {
    const document = twoPersonaDocument();
    document.users.push(PrototypeDocumentSchema.shape.users.element.parse({ ...PERSONAS[0]!.user, id: 'user-guest', name: 'Guest' }));
    const harness = buildHarness(document);
    const operation = await removedNotes(harness);
    const workspaceId = harness.actor.workspaceId as WorkspaceId;
    const callers: ActorContext[] = [
      harness.other,
      { actor: 'user', workspaceId, userId: 'user-guest' as UserId },
      someoneElse,
      { actor: 'agent', workspaceId, agentConnectionId: 'agent-cursor' as never, permissions: ['projects.read', 'projects.write'] },
      { actor: 'system', workspaceId },
    ];
    const before = state(harness);

    for (const caller of callers) {
      const refusal = await refusalOf(harness.undo(caller, operation));
      expect(refusal).toBeInstanceOf(EntityNotFoundError);
      expect(refusal.message).toBe(`operationHistory "${operation.historyId}" was not found`);
    }
    const unknown = await refusalOf(harness.operationHistoryService.transition(harness.actor, 'history-unknown' as never, {
      actionId: operation.actionId, direction: 'undo', expectedRevision: 1,
    }));
    expect(unknown).toBeInstanceOf(EntityNotFoundError);
    expect(unknown.message).toBe('operationHistory "history-unknown" was not found');
    // A caller's summary is their own: another actor in the same project sees an empty history.
    expect(await harness.operationHistoryService.summary(someoneElse, MINE)).toMatchObject({ historyId: null, undo: null });
    await expect(harness.operationHistoryService.summary(harness.other, MINE)).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(harness.operationHistoryService.summary(harness.actor, 'project-unknown' as never)).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(state(harness)).toEqual(before);
  });

  it('records an agent’s writes into its own history, never the person’s, and lets it undo them', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['projects.write']);
    const operation = await removedNotes(harness, agent);

    expect((await harness.operationHistoryService.summary(harness.actor, MINE)).undo?.operation).toBe('section.add');
    await expect(harness.undo(agent, operation)).resolves.toMatchObject({ outcome: 'restored' });
  });

  it('summary needs read, transition needs write — and a missing write grant is refused before any read', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['projects.read', 'projects.write']);
    const operation = await removedNotes(harness, agent);
    const readOnly = agentActorFor(0, ['projects.read']);
    const find = vi.spyOn(harness.operationHistories, 'find');

    await expect(harness.operationHistoryService.summary(agentActorFor(0, ['tasks.write']), MINE)).rejects.toBeInstanceOf(PermissionDeniedError);
    // The same connection id with read only: the grant is checked on every call, so a revocation bites at once.
    expect(await harness.operationHistoryService.summary({ ...readOnly, agentConnectionId: agent.agentConnectionId } as ActorContext, MINE)).toMatchObject({
      historyId: operation.historyId,
    });
    const denied = await refusalOf(transition(harness, { ...readOnly, agentConnectionId: agent.agentConnectionId } as ActorContext, operation, 'undo', operation.revision));
    expect(denied).toBeInstanceOf(PermissionDeniedError);
    expect((denied as unknown as PermissionDeniedError).permission).toBe('projects.write');
    // Since Slice 36 the grant comes from the **stored** action's family, so the stack is read to
    // find out which grant to ask for. What the refusal must still not do is disclose any of it: a
    // `PermissionDeniedError` carries no summary, revision, label or conflict.
    expect(find).toHaveBeenCalled();
    expect(denied).not.toHaveProperty('details');
    expect((await harness.operationActions.find(operation.actionId))?.state).toBe('applied');
  });

  it('never confuses a foreign workspace’s history for its own', async () => {
    const harness = buildHarness();
    const theirs = await harness.sectionService.add(harness.other, THEIRS, { type: 'rich-text' });
    const { operation } = await harness.sectionService.remove(harness.other, theirs.id);

    await expect(harness.undo(harness.actor, operation)).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(harness.undo(harness.other, operation)).resolves.toMatchObject({ outcome: 'restored' });
  });
});

describe('OperationHistoryService — revision, order, expiry and atomicity', () => {
  const removedNotes = async (harness: Harness) => {
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', title: 'Kickoff', config: { text: 'Keep this prose' } });
    return { notes, operation: (await harness.sectionService.remove(harness.actor, notes.id)).operation };
  };

  it('a stale expectedRevision refuses and returns the current summary; nothing executes twice', async () => {
    const harness = buildHarness();
    const { notes, operation } = await removedNotes(harness);
    const first = await transition(harness, harness.actor, operation, 'undo', operation.revision);
    const before = state(harness);

    // The same request again — as a client whose response was lost would send it.
    const replay = await refusalOf(transition(harness, harness.actor, operation, 'undo', operation.revision));

    expect(replay.message).toMatch(/^history_revision_stale: /);
    expect(replay.details).toEqual({
      reason: 'history_revision_stale', historyId: operation.historyId, actionId: operation.actionId, summary: first.summary,
    });
    // The summary shows the revision advanced and the action waiting as Redo: the first call landed.
    expect(first.summary).toMatchObject({ revision: operation.revision + 1, redo: { actionId: operation.actionId } });
    expect(state(harness)).toEqual(before);
    expect((await harness.sections.find(notes.id))?.archivedAt).toBeUndefined();
  });

  it('an action that is not the cursor’s next step refuses as history_not_next', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'First' });
    const newer = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: 'Second' });
    const before = state(harness);

    const older = await refusalOf(transition(harness, harness.actor, added.operation, 'undo', newer.operation!.revision));
    expect(older.message).toMatch(new RegExp(`^history_not_next: "${added.operation.actionId}" is not the next undo step; the next is "${newer.operation!.actionId}"`));
    expect(older.details).toMatchObject({ reason: 'history_not_next', summary: { undo: { actionId: newer.operation!.actionId } } });

    const empty = await refusalOf(transition(harness, harness.actor, newer.operation!, 'redo', newer.operation!.revision));
    expect(empty.message).toBe('history_not_next: there is nothing to redo in this history');
    expect(state(harness)).toEqual(before);
  });

  it.each([
    ['at', 0],
    ['after', 1],
  ])('an action refuses as history_expired %s its expiry while retained, and is not offered', async (_, offset) => {
    const harness = buildHarness();
    const { operation } = await removedNotes(harness);
    harness.clock.setNow(new Date(Date.parse(operation.expiresAt) + offset));
    const before = state(harness);

    const refusal = await refusalOf(harness.undo(harness.actor, operation));

    expect(refusal.message).toMatch(/^history_expired: this removal expired at .*; Archive can still restore the section$/);
    expect(refusal.details).toMatchObject({ reason: 'history_expired', expiresAt: operation.expiresAt, summary: { undo: null } });
    expect(state(harness)).toEqual(before);
  });

  it('a pruned action is gone: a later record drops it and naming it refuses as history_not_next', async () => {
    const harness = buildHarness();
    const { operation } = await removedNotes(harness);
    harness.clock.setNow(new Date(Date.parse(operation.expiresAt) + 1));
    const fresh = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress' });

    expect(await harness.operationActions.find(operation.actionId)).toBeNull();
    const refusal = await refusalOf(transition(harness, harness.actor, operation, 'undo', fresh.operation.revision));
    expect(refusal.details).toMatchObject({ reason: 'history_not_next', summary: { undo: { actionId: fresh.operation.actionId } } });
  });

  it('each direction records its own activity verb and publishes exactly one frame', async () => {
    const frames: LivePublication[] = [];
    const harness = buildHarness(undefined, { events: { publish: (publication) => void frames.push(publication) } });
    const { operation } = await removedNotes(harness);
    const eventsBefore = harness.store.snapshot().activityEvents.length;
    frames.length = 0;

    await harness.undo(harness.actor, operation);
    await harness.redo(harness.actor, operation);

    const events: ActivityEvent[] = harness.store.snapshot().activityEvents.slice(eventsBefore);
    const base = {
      id: expect.any(String), workspaceId: harness.actor.workspaceId, actor: 'user', actorUserId: harness.actor.userId,
      entityType: 'project', entityId: MINE, projectId: MINE, createdAt: SEED_NOW,
      // Version 5: every event carries the captured identity of its target, which for a transition
      // is the project whose history ran it.
      context: { targetKind: 'project', targetId: MINE, targetLabel: 'Project project-mine', projectId: MINE, rootProjectId: MINE },
    };
    expect(events).toEqual([
      { ...base, action: 'project.section_removal_undone', summary: 'Undid removing the Kickoff section' },
      { ...base, action: 'project.section_removal_redone', summary: 'Redid removing the Kickoff section' },
    ]);
    expect(frames.map(({ event }) => event)).toEqual([
      { type: 'project.section_removal_undone', entityType: 'project', entityId: MINE, projectId: MINE, rootProjectId: MINE },
      { type: 'project.section_removal_redone', entityType: 'project', entityId: MINE, projectId: MINE, rootProjectId: MINE },
    ]);
  });

  it('a retirement commits without an event or a frame', async () => {
    const frames: LivePublication[] = [];
    const harness = buildHarness(undefined, { events: { publish: (publication) => void frames.push(publication) } });
    const { notes, operation } = await removedNotes(harness);
    await harness.sectionService.restoreSection(someoneElse, notes.id);
    const events = harness.store.snapshot().activityEvents.length;
    frames.length = 0;

    await refusalOf(harness.undo(harness.actor, operation));

    expect(harness.store.snapshot().activityEvents).toHaveLength(events);
    expect(frames).toEqual([]);
  });

  it('an injected activity failure rolls back content, history and cursor', async () => {
    const harness = buildHarness();
    const { notes, operation } = await removedNotes(harness);
    const before = state(harness);
    vi.spyOn(harness.activity, 'record').mockRejectedValueOnce(new Error('activity unavailable'));

    await expect(harness.undo(harness.actor, operation)).rejects.toThrow('activity unavailable');

    expect(state(harness)).toEqual(before);
    expect((await harness.sections.find(notes.id))?.archivedAt).toBe(SEED_NOW);
  });

  // The host's live hub holds frames until commit; `live-updates.test.ts` proves no frame escapes.
  it('an injected persist failure rolls back content, history, cursor and activity', async () => {
    const harness = buildHarness();
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Row' });
    const { operation } = await harness.sectionService.remove(harness.actor, task.sectionId, { policy: 'cascade' });
    const before = state(harness);
    harness.store.persistFailure = new Error('disk full');

    await expect(harness.undo(harness.actor, operation)).rejects.toThrow('disk full');

    harness.store.persistFailure = undefined;
    expect(state(harness)).toEqual(before);
    expect((await harness.operationActions.find(operation.actionId))?.state).toBe('applied');
  });

  it('an injected recorder failure rolls the forward write back and leaves the history as it was', async () => {
    let fail = false;
    const harness = buildHarness(undefined, {
      recorder: (real) => ({
        record: (actor, entry) => (fail ? Promise.reject(new Error('recorder unavailable')) : real.record(actor, entry)),
        outstandingRemovalFor: (actor, sectionId, section) => real.outstandingRemovalFor(actor, sectionId, section),
      }),
    });
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'Kept' });
    await harness.undo(harness.actor, added.operation);
    const before = state(harness);
    fail = true;

    await expect(harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress' })).rejects.toThrow('recorder unavailable');

    expect(state(harness)).toEqual(before);
    expect((await harness.operationHistoryService.summary(harness.actor, MINE)).redo?.actionId).toBe(added.operation.actionId);
  });

  it('cursor, revision and both entries survive a serialize and reload of the data file', async () => {
    const first = buildHarness();
    const notes = await first.sectionService.add(first.actor, MINE, { type: 'rich-text', config: { text: 'Prose' } });
    const updated = (await first.sectionWriteService.update(first.actor, notes.id, { title: 'Titled' })).operation!;
    const removed = (await first.sectionService.remove(first.actor, notes.id)).operation;
    await first.undo(first.actor, removed);
    const summary = await first.operationHistoryService.summary(first.actor, MINE);

    const files = new Map<string, string>([['data.json', `${JSON.stringify(first.store.snapshot(), null, 2)}\n`]]);
    const memory: FileOperations = {
      readFile: async (path) => files.get(path)!,
      writeFile: async (path, data) => void files.set(path, data),
      rename: async (from, to) => void files.set(to, files.get(from)!),
    };
    const reloaded = await JsonDataStore.load('data.json', memory);
    await unitOfWorkFor(reloaded).run(() => undefined);

    // Random ids, as a restarted host has: the counting generator would reuse the first session's.
    const second = buildHarness(JSON.parse(files.get('data.json')!), { ids: new PrototypeIdGenerator() });
    expect(await second.operationHistoryService.summary(second.actor, MINE)).toEqual(summary);
    expect(summary).toMatchObject({ undo: { actionId: updated.actionId }, redo: { actionId: removed.actionId } });
    expect(await second.operationHistoryService.summary(second.other, 'project-theirs' as never)).toMatchObject({ historyId: null });

    await second.redo(second.actor, removed);
    expect((await second.sections.find(notes.id as SectionId))?.archivedAt).toBe(SEED_NOW);
  });
});
