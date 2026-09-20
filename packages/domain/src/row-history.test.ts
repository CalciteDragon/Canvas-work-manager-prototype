import { describe, expect, it } from 'vitest';
import { buildHarness, MINE, agentActorFor } from '../test/test-support';
import type { OperationReceipt, OperationHistoryDirection, TaskId } from '@cwm/contracts';

const step = async (h: ReturnType<typeof buildHarness>, receipt: OperationReceipt, direction: OperationHistoryDirection = 'undo', actor = h.actor) => {
  const history = h.store.snapshot().operationHistories.find(x => x.id === receipt.historyId)!;
  return h.operationHistoryService.transition(actor, receipt.historyId, { actionId: receipt.actionId, expectedRevision: history.revision, direction });
};

describe('row history acceptance (§31, §34, §36, §57)', () => {
  it('reverses and replays task creation, completion, editing and archive twice, preserving identity and one event per step', async () => {
    const h = buildHarness();
    const add = await h.taskWriteService.create(h.actor, { projectId: MINE, title: 'Original' });
    const complete = await h.taskWriteService.complete(h.actor, add.task.id);
    const edit = await h.taskWriteService.update(h.actor, add.task.id, { title: 'Edited' });
    const archive = await h.taskWriteService.archive(h.actor, add.task.id);
    const receipts = [add.operation, complete.operation!, edit.operation!, archive.operation!];
    const states = [undefined, add.task, complete.task, edit.task, archive.task];
    const same = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => key === 'updatedAt' ? undefined : item));
    for (let cycle = 0; cycle < 2; cycle++) {
      for (let index = 3; index >= 0; index--) {
        const count = h.store.snapshot().activityEvents.length;
        await step(h, receipts[index]!);
        expect(h.store.snapshot().activityEvents).toHaveLength(count + 1);
        const actual = await h.tasks.find(add.task.id);
        expect(actual === null ? undefined : same(actual)).toEqual(states[index] === undefined ? undefined : same(states[index]));
      }
      expect(await h.sections.find(add.task.sectionId)).toBeNull();
      const event = h.store.snapshot().activityEvents.at(-1)!;
      expect(event).toMatchObject({ entityType: 'task', entityId: add.task.id, action: 'task.task_addition_undone', context: { targetLabel: 'Original' } });
      expect((await h.activity.list(h.actor)).some(entry => entry.entityTitle === 'Original')).toBe(true);
      for (let index = 0; index < 4; index++) {
        await step(h, receipts[index]!, 'redo');
        expect(same(await h.tasks.find(add.task.id))).toEqual(same(states[index + 1]));
      }
    }
  });

  it('minimal row grant chains a compound add without project reads and rejects another family', async () => {
    const h = buildHarness();
    const actor = agentActorFor(0, ['tasks.write']);
    const add = await h.taskWriteService.create(actor, { projectId: MINE, title: 'Agent' });
    await expect(h.operationHistoryService.summary(actor, MINE)).rejects.toThrow();
    const undone = await step(h, add.operation, 'undo', actor);
    await h.operationHistoryService.transition(actor, add.operation.historyId, { direction: 'redo', actionId: undone.summary.redo!.actionId, expectedRevision: undone.summary.revision });
    await expect(step(h, add.operation, 'undo', agentActorFor(0, ['reflections.write']))).rejects.toThrow();
  });

  it('disjoint edits survive and overlapping edits refuse without changing history', async () => {
    const h = buildHarness();
    const add = await h.taskWriteService.create(h.actor, { projectId: MINE, title: 'Original' });
    const edit = await h.taskWriteService.update(h.actor, add.task.id, { title: 'Changed' });
    const agent = agentActorFor(0, ['tasks.write']);
    await h.taskWriteService.update(agent, add.task.id, { priority: 'high' });
    await step(h, edit.operation!);
    expect(await h.tasks.find(add.task.id)).toMatchObject({ title: 'Original', priority: 'high' });
    await step(h, edit.operation!, 'redo');
    await h.taskWriteService.update(agent, add.task.id, { title: 'Other' });
    const before = h.store.snapshot();
    await expect(step(h, edit.operation!)).rejects.toThrow('history_conflict');
    expect(h.store.snapshot()).toEqual(before);
  });

  it('later children and subject links block creation Undo atomically', async () => {
    for (const dependent of ['child', 'reflection']) {
      const h = buildHarness();
      const add = await h.taskWriteService.create(h.actor, { projectId: MINE, title: 'Parent', status: 'done' });
      const agent = agentActorFor(0, ['tasks.write', 'reflections.write']);
      if (dependent === 'child') await h.taskWriteService.create(agent, { projectId: MINE, parentTaskId: add.task.id, title: 'Child' });
      else await h.reflectionWriteService.create(agent, { projectId: MINE, body: 'About it', subject: { kind: 'task', id: add.task.id } });
      const before = h.store.snapshot();
      await expect(step(h, add.operation)).rejects.toThrow('history_conflict');
      expect(h.store.snapshot()).toEqual(before);
    }
  });

  it('a reflection in another project of the same root blocks task creation Undo', async () => {
    const h = buildHarness();
    const child = await h.projectService.create(h.actor, {
      workspaceId: h.actor.workspaceId,
      kind: 'subproject',
      parentProjectId: MINE,
      name: 'Sibling journal',
    });
    const add = await h.taskWriteService.create(h.actor, { projectId: MINE, title: 'Shared subject', status: 'done' });
    await h.reflectionWriteService.create(agentActorFor(0, ['reflections.write']), {
      projectId: child.id,
      body: 'Cross-project reflection',
      subject: { kind: 'task', id: add.task.id },
    });
    const before = h.store.snapshot();

    await expect(step(h, add.operation)).rejects.toThrow('history_conflict');
    expect(h.store.snapshot()).toEqual(before);
  });

  it.each(['task', 'reflection'] as const)('Redo %s Add refuses a recreated implicit container id', async (kind) => {
    const h = buildHarness();
    const add = kind === 'task'
      ? await h.taskWriteService.create(h.actor, { projectId: MINE, title: 'Created row' })
      : await h.reflectionWriteService.create(h.actor, { projectId: MINE, body: 'Created row' });
    const row = 'task' in add ? add.task : add.reflection;
    const capturedContainer = await h.sections.find(row.sectionId);
    expect(capturedContainer).not.toBeNull();
    await step(h, add.operation);
    await h.sections.insert({ ...capturedContainer!, title: 'Recreated by another write' });
    const before = h.store.snapshot();

    await expect(step(h, add.operation, 'redo')).rejects.toThrow('history_conflict');
    expect(h.store.snapshot()).toEqual(before);
  });

  it('same-section reparent Undo and Redo leave existing descendants in place', async () => {
    const h = buildHarness();
    const first = await h.taskWriteService.create(h.actor, { projectId: MINE, title: 'First parent' });
    const second = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: first.task.sectionId, title: 'Second parent' });
    const child = await h.taskWriteService.create(h.actor, {
      projectId: MINE, sectionId: first.task.sectionId, parentTaskId: first.task.id, title: 'Existing child',
    });
    const reparented = await h.taskWriteService.update(h.actor, first.task.id, { parentTaskId: second.task.id });

    await step(h, reparented.operation!);
    expect((await h.tasks.find(first.task.id))?.parentTaskId).toBeUndefined();
    expect(await h.tasks.find(child.task.id)).toMatchObject({ parentTaskId: first.task.id, sectionId: first.task.sectionId });
    await step(h, reparented.operation!, 'redo');
    expect(await h.tasks.find(first.task.id)).toMatchObject({ parentTaskId: second.task.id });
    expect(await h.tasks.find(child.task.id)).toMatchObject({ parentTaskId: first.task.id, sectionId: first.task.sectionId });
  });

  it('an archived task move refuses when its target container for Undo was removed', async () => {
    const h = buildHarness();
    const source = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'Source' });
    const target = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'Target' });
    const task = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: source.section.id, title: 'Filed' });
    await h.taskWriteService.archive(h.actor, task.task.id);
    const moved = await h.taskWriteService.update(h.actor, task.task.id, { sectionId: target.section.id });
    await h.sectionWriteService.remove(agentActorFor(0, ['projects.write']), source.section.id, {});
    const before = h.store.snapshot();

    await expect(step(h, moved.operation!)).rejects.toThrow('history_conflict');
    expect(h.store.snapshot()).toEqual(before);
  });

  it('reflection add, edit, archive and durable restore reverse and replay with a compound container', async () => {
    const h = buildHarness();
    const add = await h.reflectionWriteService.create(h.actor, { projectId: MINE, body: 'First' });
    const edit = await h.reflectionWriteService.update(h.actor, add.reflection.id, { title: 'Named', body: 'Second' });
    const archived = await h.reflectionWriteService.archive(h.actor, add.reflection.id);
    const restored = await h.reflectionWriteService.restore(h.actor, add.reflection.id);
    const receipts = [add.operation, edit.operation!, archived.operation!, restored.operation!];
    for (const receipt of [...receipts].reverse()) await step(h, receipt);
    expect(await h.reflections.find(add.reflection.id)).toBeNull();
    expect(await h.sections.find(add.reflection.sectionId)).toBeNull();
    expect(h.store.snapshot().activityEvents.at(-1)).toMatchObject({ entityType: 'reflection', entityId: add.reflection.id });
    for (const receipt of receipts) await step(h, receipt, 'redo');
    expect(await h.reflections.find(add.reflection.id)).toEqual(restored.reflection);
  });
});

describe('row history regressions found in the closing review (§§31, 34)', () => {
  it('a reparent that both moves a subtree and reroots its archive group records each row once', async () => {
    const h = buildHarness();
    const source = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'Source' });
    const destination = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'Destination' });
    const root = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: source.section.id, title: 'Root' });
    const middle = await h.taskWriteService.create(h.actor, {
      projectId: MINE, sectionId: source.section.id, parentTaskId: root.task.id, title: 'Middle',
    });
    const leaf = await h.taskWriteService.create(h.actor, {
      projectId: MINE, sectionId: source.section.id, parentTaskId: middle.task.id, title: 'Leaf',
    });
    const newParent = await h.taskWriteService.create(h.actor, {
      projectId: MINE, sectionId: destination.section.id, title: 'New parent',
    });
    await h.taskWriteService.archive(h.actor, root.task.id);
    expect(await h.tasks.find(leaf.task.id)).toMatchObject({ archivedWithTaskId: root.task.id });

    // `moveSubtree` repoints the leaf's section and `normalizeArchiveGroup` reroots its marker, so
    // both helpers write the same row. The footprint holds one entry carrying both changes.
    const moved = await h.taskWriteService.update(h.actor, middle.task.id, { parentTaskId: newParent.task.id });
    expect(await h.tasks.find(leaf.task.id)).toMatchObject({
      sectionId: destination.section.id, archivedWithTaskId: middle.task.id,
    });

    await step(h, moved.operation!);
    expect(await h.tasks.find(leaf.task.id)).toMatchObject({
      sectionId: source.section.id, archivedWithTaskId: root.task.id,
    });
    expect(await h.tasks.find(middle.task.id)).toMatchObject({
      sectionId: source.section.id, parentTaskId: root.task.id, archivedWithTaskId: root.task.id,
    });
    await step(h, moved.operation!, 'redo');
    expect(await h.tasks.find(leaf.task.id)).toMatchObject({
      sectionId: destination.section.id, archivedWithTaskId: middle.task.id,
    });
  });

  it('a reparent-only reroot ignores descendants that belong to their own archive group', async () => {
    const h = buildHarness();
    const list = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'One list' });
    const make = async (title: string, parentTaskId?: TaskId) => (await h.taskWriteService.create(h.actor, {
      projectId: MINE, sectionId: list.section.id, title, ...(parentTaskId === undefined ? {} : { parentTaskId }),
    })).task;
    const root = await make('Root');
    const middle = await make('Middle', root.id);
    const inner = await make('Inner', middle.id);
    const leaf = await make('Leaf', inner.id);
    const newParent = await make('New parent');

    // `inner` is archived first, so it roots its own group and `archiveDescendants` steps past it.
    await h.taskWriteService.archive(h.actor, inner.id);
    await h.taskWriteService.archive(h.actor, root.id);
    await h.taskWriteService.archive(h.actor, newParent.id);
    expect((await h.tasks.find(inner.id))?.archivedWithTaskId).toBeUndefined();
    expect(await h.tasks.find(leaf.id)).toMatchObject({ archivedWithTaskId: inner.id });

    // Same section, so only the marker moves: `inner` and `leaf` are untouched bystanders, not
    // later dependents, and must not refuse the inverse.
    const rerooted = await h.taskWriteService.update(h.actor, middle.id, { parentTaskId: newParent.id });
    expect((await h.tasks.find(middle.id))?.archivedWithTaskId).toBeUndefined();

    await step(h, rerooted.operation!);
    expect(await h.tasks.find(middle.id)).toMatchObject({ parentTaskId: root.id, archivedWithTaskId: root.id });
    expect(await h.tasks.find(leaf.id)).toMatchObject({ archivedWithTaskId: inner.id });
    await step(h, rerooted.operation!, 'redo');
    expect(await h.tasks.find(middle.id)).toMatchObject({ parentTaskId: newParent.id });
    expect((await h.tasks.find(middle.id))?.archivedWithTaskId).toBeUndefined();
    expect(await h.tasks.find(leaf.id)).toMatchObject({ archivedWithTaskId: inner.id });
  });
});
