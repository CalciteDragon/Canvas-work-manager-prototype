import { describe, expect, it } from 'vitest';
import type { OperationHistoryDirection, OperationReceipt, SectionId } from '@cwm/contracts';
import { buildHarness, MINE, agentActorFor } from '../test/test-support';
import { listPlacements } from './page-placements';

type Harness = ReturnType<typeof buildHarness>;

const advance = (h: Harness, milliseconds: number): void =>
  h.clock.setNow(new Date(h.clock.now().getTime() + milliseconds));

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

/** The archive footprint of one container: the section's marker and each row's. */
const footprint = async (h: Harness, sectionId: SectionId) => ({
  section: (await h.sections.find(sectionId))?.archivedAt ?? null,
  generation: (await h.sections.find(sectionId))?.archiveGeneration ?? null,
  tasks: (await h.tasks.list({ sectionId, includeArchived: true }))
    .map((task) => [task.id, task.archivedAt ?? null, task.archivedWithSectionId ?? null] as const)
    .sort(),
});

describe('section restore history (§§27, 31–32)', () => {
  it('reverses and replays a cascade restore, touching only the rows it revived', async () => {
    const h = buildHarness();
    const add = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'Backlog' });
    const kept = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: add.section.id, title: 'Kept' });
    const alone = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: add.section.id, title: 'Alone' });
    // Archived on its own beforehand, so the removal's cascade never touches it and the Restore
    // must leave it archived in both directions.
    await h.taskWriteService.archive(h.actor, alone.task.id);
    await h.sectionWriteService.remove(h.actor, add.section.id, { policy: 'cascade' });
    const archived = await footprint(h, add.section.id);

    const restore = await h.sectionWriteService.restoreSection(h.actor, add.section.id);
    expect(restore.operation).not.toBeNull();
    expect(restore.operation!.operation).toBe('section.restore');
    const restored = await footprint(h, add.section.id);
    expect(restored.section).toBeNull();
    expect((await h.tasks.find(kept.task.id))?.archivedAt).toBeUndefined();
    expect((await h.tasks.find(alone.task.id))?.archivedAt).toBeDefined();

    const undone = await step(h, restore.operation!);
    expect(undone.result).toMatchObject({ operation: 'section.restore', outcome: 'restored', affectedRowIds: [kept.task.id] });
    expect(await footprint(h, add.section.id)).toEqual(archived);

    const redone = await step(h, restore.operation!, 'redo');
    expect(redone.result).toMatchObject({ operation: 'section.restore', outcome: 'reapplied' });
    expect(await footprint(h, add.section.id)).toEqual(restored);
  });

  it('records nothing for a live-section retry, and a retry never buries the Redo branch', async () => {
    const h = buildHarness();
    // Prose with content is the retained case: a disposable view or an empty container is deleted
    // by removal, so there is no tombstone for Restore to act on at all.
    const empty = await h.sectionWriteService.add(h.actor, MINE, { type: 'rich-text', title: 'Notes' });
    await h.sectionWriteService.update(h.actor, empty.section.id, { config: { text: 'Worth keeping' } });
    await h.sectionWriteService.remove(h.actor, empty.section.id);

    const restore = await h.sectionWriteService.restoreSection(h.actor, empty.section.id);
    expect(restore.operation).not.toBeNull();
    const actions = (await h.operationActions.list()).length;

    const retry = await h.sectionWriteService.restoreSection(h.actor, empty.section.id);
    expect(retry.operation).toBeNull();
    expect((await h.operationActions.list()).length).toBe(actions);
    // A no-op must also leave the Redo branch alone, which is what a retried request depends on.
    await step(h, restore.operation!);
    const summary = await h.operationHistoryService.summary(h.actor, MINE);
    expect(summary.redo?.operation).toBe('section.restore');
  });

  it('appends densely on a hand-edited sparse page and replays its committed placement on Redo', async () => {
    const h = buildHarness();
    const first = await h.sectionWriteService.add(h.actor, MINE, { type: 'rich-text', title: 'First' });
    const middle = await h.sectionWriteService.add(h.actor, MINE, { type: 'rich-text', title: 'Middle' });
    const last = await h.sectionWriteService.add(h.actor, MINE, { type: 'rich-text', title: 'Last' });
    for (const section of [middle.section, last.section]) {
      await h.sectionWriteService.update(h.actor, section.id, { config: { text: 'Worth keeping' } });
    }
    await h.sectionWriteService.update(h.actor, first.section.id, { config: { text: 'Worth keeping' } });
    await h.sectionWriteService.remove(h.actor, middle.section.id);
    // Hand-edit the surviving order into a sparse one, which §14 permits.
    await h.sections.update({ ...(await h.sections.find(first.section.id))!, position: 0 });
    await h.sections.update({ ...(await h.sections.find(last.section.id))!, position: 7 });

    const restore = await h.sectionWriteService.restoreSection(h.actor, middle.section.id);
    const order = async () => (await listPlacements(h, `page-${MINE}` as never)).map(({ value }) => value.id);
    expect(await order()).toEqual([first.section.id, last.section.id, middle.section.id]);
    expect((await h.sections.find(middle.section.id))?.position).toBe(2);

    await step(h, restore.operation!);
    expect(await order()).toEqual([first.section.id, last.section.id]);
    const redone = await step(h, restore.operation!, 'redo');
    // Redo replays the placement the Restore committed rather than appending afresh; here they
    // are the same place, and the strategy says it followed the recorded previous neighbour.
    expect(redone.result).toMatchObject({ placement: { strategy: 'previous', index: 2, pageEnabled: true } });
    expect(await order()).toEqual([first.section.id, last.section.id, middle.section.id]);
  });

  it('refuses a new live row Undo would hide and a newly marked row Redo would absorb', async () => {
    const h = buildHarness();
    const add = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'Backlog' });
    const original = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: add.section.id, title: 'Original' });
    await h.sectionWriteService.remove(h.actor, add.section.id, { policy: 'cascade' });
    const restore = await h.sectionWriteService.restoreSection(h.actor, add.section.id);

    const agent = agentActorFor(0, ['tasks.write']);
    const newer = await h.taskWriteService.create(agent, { projectId: MINE, sectionId: add.section.id, title: 'Newer' });
    const before = JSON.stringify(h.store.snapshot().tasks);
    await expect(step(h, restore.operation!)).rejects.toThrow('history_conflict');
    expect(JSON.stringify(h.store.snapshot().tasks)).toBe(before);

    await h.taskWriteService.archive(agent, newer.task.id);
    await step(h, restore.operation!);
    expect((await h.tasks.find(original.task.id))?.archivedWithSectionId).toBe(add.section.id);
    // Hand-mark the unrecorded row as though it had come down with this section; Redo must not
    // silently bring it back with the recorded ones.
    await h.tasks.update({ ...(await h.tasks.find(newer.task.id))!, archivedWithSectionId: add.section.id });
    await expect(step(h, restore.operation!, 'redo')).rejects.toThrow('history_conflict');
  });

  it('retires when a later removal advanced the generation, in either direction', async () => {
    const h = buildHarness();
    const add = await h.sectionWriteService.add(h.actor, MINE, { type: 'rich-text', title: 'Notes' });
    await h.sectionWriteService.update(h.actor, add.section.id, { config: { text: 'Worth keeping' } });
    await h.sectionWriteService.remove(h.actor, add.section.id);
    const restore = await h.sectionWriteService.restoreSection(h.actor, add.section.id);

    // Another actor removes it again, at the same clock instant: only the generation tells the
    // two removals apart, which is the whole reason it is captured.
    await h.sectionWriteService.remove(agentActorFor(0, ['projects.write']), add.section.id);
    await expect(step(h, restore.operation!)).rejects.toThrow('history_retired');
    const summary = await h.operationHistoryService.summary(h.actor, MINE);
    expect(summary.undo?.operation).toBe('section.remove');
    expect(summary.redo).toBeNull();
  });

  it('names a captured row that moved away as moved, not missing', async () => {
    const h = buildHarness();
    const add = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'Backlog' });
    const elsewhere = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'Elsewhere' });
    const task = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: add.section.id, title: 'Ship it' });
    await h.sectionWriteService.remove(h.actor, add.section.id, { policy: 'cascade' });
    const restore = await h.sectionWriteService.restoreSection(h.actor, add.section.id);

    // The row did not vanish — somebody moved it. Saying "missing" would send the caller looking
    // for something to restore instead of somewhere to move the row back from.
    await h.taskWriteService.update(agentActorFor(0, ['tasks.write']), task.task.id, { sectionId: elsewhere.section.id });
    await expect(step(h, restore.operation!)).rejects.toThrow('history_conflict');
    try {
      await step(h, restore.operation!);
    } catch (error) {
      const { details } = error as { details: { conflicts: { problem: string; nextStep: string; title?: string }[] } };
      expect(details.conflicts).toEqual([
        { entityType: 'task', id: task.task.id, title: 'Ship it', problem: 'moved', nextStep: 'move-back-and-retry' },
      ]);
    }
  });

  it('retires rather than wedges the stack when the section itself was deleted', async () => {
    const h = buildHarness();
    const add = await h.sectionWriteService.add(h.actor, MINE, { type: 'rich-text', title: 'Notes' });
    await h.sectionWriteService.update(h.actor, add.section.id, { config: { text: 'Worth keeping' } });
    const removed = await h.sectionWriteService.remove(h.actor, add.section.id);
    const restore = await h.sectionWriteService.restoreSection(h.actor, add.section.id);

    // A later disposable removal deletes the row outright. Nothing can put that row back by hand,
    // so the Restore action must stop holding the actions beneath it hostage for 24 hours.
    await h.sections.remove(add.section.id);
    await expect(step(h, restore.operation!)).rejects.toThrow('history_retired');
    const summary = await h.operationHistoryService.summary(h.actor, MINE);
    expect(summary.undo?.actionId).toBe(removed.operation.actionId);
  });

  it('survives expiry as an ordinary write while its own transitions expire', async () => {
    const h = buildHarness();
    const add = await h.sectionWriteService.add(h.actor, MINE, { type: 'rich-text', title: 'Notes' });
    await h.sectionWriteService.update(h.actor, add.section.id, { config: { text: 'Worth keeping' } });
    await h.sectionWriteService.remove(h.actor, add.section.id);
    advance(h, 25 * 60 * 60 * 1000);

    // Restore itself needs no receipt and never expires; it simply records a fresh action.
    const restore = await h.sectionWriteService.restoreSection(h.actor, add.section.id);
    expect(restore.section.archivedAt).toBeUndefined();
    expect(restore.operation).not.toBeNull();
    advance(h, 25 * 60 * 60 * 1000);
    await expect(step(h, restore.operation!)).rejects.toThrow('history_expired');
  });
});
