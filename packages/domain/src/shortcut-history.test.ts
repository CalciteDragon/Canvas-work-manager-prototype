import { describe, expect, it } from 'vitest';
import type { OperationHistoryDirection, OperationReceipt, ProjectPageId } from '@cwm/contracts';
import { agentActorFor, buildHarness, MINE } from '../test/test-support';
import { listPlacements } from './page-placements';
import { shortcutWriteLabel } from './shortcut-history';

type Harness = ReturnType<typeof buildHarness>;

const HOME = `page-${MINE}` as ProjectPageId;

const step = async (
  h: Harness,
  receipt: OperationReceipt,
  direction: OperationHistoryDirection = 'undo',
  actor = h.actor,
) => {
  const history = (await h.operationHistories.find(receipt.historyId))!;
  return h.operationHistoryService.transition(actor, receipt.historyId, {
    actionId: receipt.actionId,
    expectedRevision: history.revision,
    direction,
  });
};

const order = async (h: Harness) => (await listPlacements(h, HOME)).map(({ value }) => value.id);

/** A child project with one section, which is the only thing a root's Home may point at. */
const withSource = async (h: Harness) => {
  const child = await h.projectService.create(h.actor, {
    workspaceId: h.actor.workspaceId,
    kind: 'subproject',
    parentProjectId: MINE,
    name: 'Kitchen',
  });
  const source = await h.sectionWriteService.add(h.actor, child.id, { type: 'task-list', title: 'Prep' });
  return { child, source: source.section };
};

describe('shortcut placement history (§§27, 31)', () => {
  it('records every placement write in the destination root and never in the source project', async () => {
    const h = buildHarness();
    const { child, source } = await withSource(h);
    const created = await h.sectionShortcutWriteService.create(h.actor, MINE, { pageId: HOME, sourceSectionId: source.id });

    expect(created.operation.operation).toBe('shortcut.add');
    const action = (await h.operationActions.list()).find((candidate) => candidate.id === created.operation.actionId)!;
    const history = (await h.operationHistories.find(action.historyId))!;
    expect(history.projectId).toBe(MINE);
    // The child's own history exists — its section was added there — but no placement action
    // ever enters it: the source project is not where this write happened.
    const childHistories = await h.operationHistories.list({ projectId: child.id });
    const childActions = (await Promise.all(childHistories.map((candidate) => h.operationActions.list({ historyId: candidate.id })))).flat();
    expect(childActions.map((candidate) => candidate.operation.type)).toEqual(['section.add']);
  });

  it('reverses and replays add, resize, collapse, move and remove in one stack', async () => {
    const h = buildHarness();
    const { source } = await withSource(h);
    const local = await h.sectionWriteService.add(h.actor, MINE, { type: 'progress', title: 'Progress' });
    const created = await h.sectionShortcutWriteService.create(h.actor, MINE, { pageId: HOME, sourceSectionId: source.id });
    const id = created.shortcut.id;
    const resize = await h.sectionShortcutWriteService.update(h.actor, id, { columnSpan: 6 });
    const collapse = await h.sectionShortcutWriteService.update(h.actor, id, { collapsed: true });
    const moved = await h.sectionShortcutWriteService.move(h.actor, id, 0);
    expect(await order(h)).toEqual([id, local.section.id]);
    const removed = await h.sectionShortcutWriteService.remove(h.actor, id);
    expect(removed.projectId).toBe(MINE);

    for (const receipt of [removed.operation, moved.operation!, collapse.operation!, resize.operation!, created.operation]) {
      await step(h, receipt);
    }
    expect(await h.shortcuts.find(id)).toBeNull();
    expect(await order(h)).toEqual([local.section.id]);

    for (const receipt of [created.operation, resize.operation!, collapse.operation!, moved.operation!, removed.operation]) {
      await step(h, receipt, 'redo');
    }
    expect(await h.shortcuts.find(id)).toBeNull();

    // One more Undo of the removal brings the same id back, with the same createdAt and the same
    // presentation fields the last committed update left.
    await step(h, removed.operation);
    const back = (await h.shortcuts.find(id))!;
    expect(back).toMatchObject({ id, createdAt: created.shortcut.createdAt, columnSpan: 6, collapsed: true });
    expect(await order(h)).toEqual([id, local.section.id]);
  });

  it('writes nothing about the source, and a source content edit is never a placement conflict', async () => {
    const h = buildHarness();
    const { source } = await withSource(h);
    const task = await h.taskWriteService.create(h.actor, { projectId: source.projectId, sectionId: source.id, title: 'Chop' });
    const created = await h.sectionShortcutWriteService.create(h.actor, MINE, { pageId: HOME, sourceSectionId: source.id });
    const sourceBefore = JSON.stringify([await h.sections.find(source.id), await h.tasks.find(task.task.id)]);

    await h.sectionWriteService.update(h.actor, source.id, { title: 'Renamed' });
    await h.taskWriteService.update(h.actor, task.task.id, { title: 'Dice' });
    await step(h, created.operation);
    await step(h, created.operation, 'redo');

    expect(JSON.stringify([await h.sections.find(source.id), await h.tasks.find(task.task.id)])).not.toBe(sourceBefore);
    expect(await h.sections.find(source.id)).toMatchObject({ title: 'Renamed' });
    expect(await h.tasks.find(task.task.id)).toMatchObject({ title: 'Dice' });
    expect((await h.shortcuts.find(created.shortcut.id))?.sourceSectionId).toBe(source.id);
  });

  it('recreates a reference onto a source that is now archived or hidden, but not onto a missing one', async () => {
    const h = buildHarness();
    const { child, source } = await withSource(h);
    // A row keeps the source retained once it is removed, which is what makes "archived" a state
    // the reference can still point at rather than a deletion.
    await h.taskWriteService.create(h.actor, { projectId: child.id, sectionId: source.id, title: 'Chop' });
    const created = await h.sectionShortcutWriteService.create(h.actor, MINE, { pageId: HOME, sourceSectionId: source.id });
    await step(h, created.operation);

    // Archived and hidden sources are the existing unavailable placeholder, not a reason to refuse:
    // recovering a reference is not an ordinary Add and never unarchives the source.
    await h.sectionWriteService.remove(h.actor, source.id, { policy: 'cascade' });
    await h.projectService.update(h.actor, child.id, { status: 'archived' });
    await step(h, created.operation, 'redo');
    expect((await h.shortcuts.find(created.shortcut.id))?.sourceSectionId).toBe(source.id);
    expect((await h.sections.find(source.id))?.archivedAt).toBeDefined();

    await step(h, created.operation);
    await h.projectService.update(h.actor, child.id, { status: 'active' });
    // A source that is gone leaves the reference with nothing to point at, so integrity refuses —
    // repairably, because restoring or recreating the section is exactly the repair.
    await h.sections.remove(source.id);
    await expect(step(h, created.operation, 'redo')).rejects.toThrow('history_conflict');
  });

  it('retires a recreation whose placement id is occupied, and refuses a foreign or same-page source', async () => {
    const h = buildHarness();
    const { source } = await withSource(h);
    const created = await h.sectionShortcutWriteService.create(h.actor, MINE, { pageId: HOME, sourceSectionId: source.id });
    await step(h, created.operation);
    await h.shortcuts.insert({ ...created.shortcut, position: 0 });

    await expect(step(h, created.operation, 'redo')).rejects.toThrow('history_retired');
    expect((await h.operationHistoryService.summary(h.actor, MINE)).redo).toBeNull();

    // A source that has moved onto the destination page itself can never be referenced from it.
    const other = buildHarness();
    const moved = await withSource(other);
    const second = await other.sectionShortcutWriteService.create(other.actor, MINE, { pageId: HOME, sourceSectionId: moved.source.id });
    await step(other, second.operation);
    await other.sections.update({ ...(await other.sections.find(moved.source.id))!, projectId: MINE, pageId: HOME });
    await expect(step(other, second.operation, 'redo')).rejects.toThrow('history_conflict');
  });

  it('refuses an update whose field changed underneath it and a move whose neighbours moved', async () => {
    const h = buildHarness();
    const { source } = await withSource(h);
    const local = await h.sectionWriteService.add(h.actor, MINE, { type: 'progress', title: 'Progress' });
    const created = await h.sectionShortcutWriteService.create(h.actor, MINE, { pageId: HOME, sourceSectionId: source.id });
    const id = created.shortcut.id;
    const resize = await h.sectionShortcutWriteService.update(h.actor, id, { columnSpan: 6 });

    const agent = agentActorFor(0, ['projects.write']);
    await h.sectionShortcutWriteService.update(agent, id, { columnSpan: 4 });
    const before = JSON.stringify(h.store.snapshot().sectionShortcuts);
    await expect(step(h, resize.operation!)).rejects.toThrow('history_conflict');
    expect(JSON.stringify(h.store.snapshot().sectionShortcuts)).toBe(before);
    // A collapse by someone else is a different field, so it survives this Undo untouched.
    await h.sectionShortcutWriteService.update(agent, id, { columnSpan: 6, collapsed: true });
    await step(h, resize.operation!);
    expect(await h.shortcuts.find(id)).toMatchObject({ columnSpan: 12, collapsed: true });

    const move = await h.sectionShortcutWriteService.move(h.actor, id, 0);
    expect(await order(h)).toEqual([id, local.section.id]);
    await h.sectionShortcutWriteService.move(agent, id, 1);
    await expect(step(h, move.operation!)).rejects.toThrow('history_conflict');
  });

  it('treats a clamped or unchanged move as a true no-op that writes nothing', async () => {
    const h = buildHarness();
    const { source } = await withSource(h);
    const local = await h.sectionWriteService.add(h.actor, MINE, { type: 'progress', title: 'Progress' });
    const created = await h.sectionShortcutWriteService.create(h.actor, MINE, { pageId: HOME, sourceSectionId: source.id });
    const id = created.shortcut.id;
    // Hand-edit the page into a sparse order, which §14 permits; a no-op must not normalize it.
    await h.sections.update({ ...(await h.sections.find(local.section.id))!, position: 0 });
    await h.shortcuts.update({ ...(await h.shortcuts.find(id))!, position: 9 });
    const before = JSON.stringify(h.store.snapshot());

    expect((await h.sectionShortcutWriteService.move(h.actor, id, 1)).operation).toBeNull();
    expect((await h.sectionShortcutWriteService.move(h.actor, id, 99)).operation).toBeNull();
    expect(JSON.stringify(h.store.snapshot())).toBe(before);

    // And the Redo branch the earlier add left is still reachable, which a recorded no-op would
    // have discarded.
    await step(h, created.operation);
    expect((await h.operationHistoryService.summary(h.actor, MINE)).redo?.operation).toBe('shortcut.add');
  });

  it('keeps each actor’s placement history to themselves and needs only the canvas grant', async () => {
    const h = buildHarness();
    const { source } = await withSource(h);
    const agent = agentActorFor(0, ['projects.write']);
    const created = await h.sectionShortcutWriteService.create(agent, MINE, { pageId: HOME, sourceSectionId: source.id });

    // `projects.write` alone runs the transition; the summary is a read and still needs `projects.read`.
    await expect(h.operationHistoryService.summary(agent, MINE)).rejects.toThrow();
    await step(h, created.operation, 'undo', agent);
    // Another family's grant is not this one's, even though both are writes.
    await expect(step(h, created.operation, 'redo', agentActorFor(0, ['tasks.write']))).rejects.toThrow();
    // And the person's own history never saw the agent's placement at all.
    expect((await h.operationHistoryService.summary(h.actor, MINE)).historyId).toBeNull();
  });
});

describe('shortcutWriteLabel (Slice 41)', () => {
  it('names the source section for each kind, and the one changed field for an update', () => {
    expect(shortcutWriteLabel('shortcut.add', [], 'Tasks')).toBe('Added the Tasks shortcut');
    expect(shortcutWriteLabel('shortcut.update', [{ field: 'collapsed', before: false, after: true }], 'Tasks')).toBe('Collapsed the Tasks shortcut');
    expect(shortcutWriteLabel('shortcut.update', [{ field: 'collapsed', before: true, after: false }], 'Tasks')).toBe('Expanded the Tasks shortcut');
    expect(shortcutWriteLabel('shortcut.update', [{ field: 'columnSpan', before: 12, after: 6 }], 'Tasks')).toBe('Resized the Tasks shortcut');
    expect(shortcutWriteLabel('shortcut.update', [
      { field: 'columnSpan', before: 12, after: 6 },
      { field: 'collapsed', before: false, after: true },
    ], 'Tasks')).toBe('Updated the Tasks shortcut');
    expect(shortcutWriteLabel('shortcut.move', [], 'Tasks')).toBe('Moved the Tasks shortcut');
    expect(shortcutWriteLabel('shortcut.remove', [], 'Tasks')).toBe('Removed the Tasks shortcut');
  });

  it('falls back to "a shortcut" when the source cannot be read', () => {
    expect(shortcutWriteLabel('shortcut.remove', [], null)).toBe('Removed a shortcut');
    expect(shortcutWriteLabel('shortcut.move', [], null)).toBe('Moved a shortcut');
  });
});

