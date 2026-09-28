import { describe, expect, it } from 'vitest';
import { buildHarness, MINE, agentActorFor } from '../test/test-support';
import {
  nameOf,
  OperationHistoryRefusalDetailsSchema,
  type OperationHistoryDirection,
  type OperationHistoryRefusalDetails,
  type OperationReceipt,
  type SectionId,
  type Task,
  type TaskId,
  type UndoConflict,
} from '@cwm/contracts';
import { DomainRuleError, PermissionDeniedError } from './errors';
import { ProjectArchiveService } from './project-archive-service';

/** A refused transition's details, parsed against the contract rather than read loosely. */
const refusalOf = async (promise: Promise<unknown>): Promise<OperationHistoryRefusalDetails> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainRuleError) return OperationHistoryRefusalDetailsSchema.parse(error.details);
    throw error;
  }
  throw new Error('expected the transition to be refused, but it resolved');
};

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
    await h.sectionWriteService.remove(agentActorFor(0, ['projects.write']), source.section.id);
    const before = h.store.snapshot();

    const refusal = await refusalOf(step(h, moved.operation!));
    expect(refusal.reason).toBe('history_conflict');
    expect('conflicts' in refusal ? refusal.conflicts : undefined)
      .toEqual([{ entityType: 'section', id: source.section.id, problem: 'missing', nextStep: 'nothing-to-undo' }]);
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

/**
 * Slice 45's integrated audit found these row guarantees asserted only forward, or only for a
 * single row, so each one is pinned here at its rule owner.
 */
describe('row history closure evidence (Slice 45; §§31, 34, 36)', () => {
  const later = (h: ReturnType<typeof buildHarness>) => {
    h.clock.setNow(new Date(h.clock.now().getTime() + 60_000));
    return h.clock.now().toISOString();
  };
  const markers = async (h: ReturnType<typeof buildHarness>, id: TaskId) => {
    const task = await h.tasks.find(id);
    return [task?.archivedAt ?? null, task?.archivedWithTaskId ?? null, task?.archivedWithSectionId ?? null];
  };

  it('task Delete over a live and an independently archived subtree reverses and replays only its own cascade, stamping updatedAt from the Clock', async () => {
    const h = buildHarness();
    const parent = await h.taskWriteService.create(h.actor, { projectId: MINE, title: 'Parent' });
    const live = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: parent.task.sectionId, parentTaskId: parent.task.id, title: 'Live child' });
    const filed = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: parent.task.sectionId, parentTaskId: parent.task.id, title: 'Filed child' });
    await h.taskWriteService.archive(h.actor, filed.task.id);
    const filedMarkers = await markers(h, filed.task.id);
    const deleted = await h.taskWriteService.archive(h.actor, parent.task.id);
    const deletedMarkers = { parent: await markers(h, parent.task.id), live: await markers(h, live.task.id) };
    expect(deletedMarkers.live).toEqual([expect.any(String), parent.task.id, null]);

    const undoAt = later(h);
    const events = h.store.snapshot().activityEvents.length;
    await step(h, deleted.operation!);
    expect(h.store.snapshot().activityEvents).toHaveLength(events + 1);
    for (const id of [parent.task.id, live.task.id]) {
      expect(await markers(h, id)).toEqual([null, null, null]);
      expect(await h.tasks.find(id)).toMatchObject({ updatedAt: undoAt });
    }
    expect(await markers(h, filed.task.id)).toEqual(filedMarkers);
    expect(await h.tasks.find(parent.task.id)).toMatchObject({ createdAt: parent.task.createdAt, status: parent.task.status });

    const redoAt = later(h);
    await step(h, deleted.operation!, 'redo');
    expect(h.store.snapshot().activityEvents).toHaveLength(events + 2);
    expect({ parent: await markers(h, parent.task.id), live: await markers(h, live.task.id) }).toEqual(deletedMarkers);
    expect(await h.tasks.find(live.task.id)).toMatchObject({ updatedAt: redoAt });
    expect(await markers(h, filed.task.id)).toEqual(filedMarkers);
  });

  it('Undo of a task Restore re-archives only the rows that Restore revived', async () => {
    const h = buildHarness();
    const parent = await h.taskWriteService.create(h.actor, { projectId: MINE, title: 'Parent' });
    const live = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: parent.task.sectionId, parentTaskId: parent.task.id, title: 'Live child' });
    const filed = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: parent.task.sectionId, parentTaskId: parent.task.id, title: 'Filed child' });
    await h.taskWriteService.archive(h.actor, filed.task.id);
    await h.taskWriteService.archive(h.actor, parent.task.id);
    const archived = { parent: await markers(h, parent.task.id), live: await markers(h, live.task.id), filed: await markers(h, filed.task.id) };
    const restored = await h.taskWriteService.restore(h.actor, parent.task.id);
    expect(restored.operation).not.toBeNull();
    expect(await markers(h, live.task.id)).toEqual([null, null, null]);
    expect(await markers(h, filed.task.id)).toEqual(archived.filed);

    await step(h, restored.operation!);
    expect({ parent: await markers(h, parent.task.id), live: await markers(h, live.task.id), filed: await markers(h, filed.task.id) }).toEqual(archived);
    await step(h, restored.operation!, 'redo');
    expect(await markers(h, parent.task.id)).toEqual([null, null, null]);
    expect(await markers(h, live.task.id)).toEqual([null, null, null]);
    expect(await markers(h, filed.task.id)).toEqual(archived.filed);
  });

  it('Undo Add leaves the task out of the task repository and the Archive projection', async () => {
    const h = buildHarness();
    const archive = new ProjectArchiveService({ projects: h.projects, pages: h.pages, sections: h.sections, tasks: h.tasks, reflections: h.reflections });
    const container = await h.sectionWriteService.add(h.actor, MINE, { type: 'task-list', title: 'Kept container' });
    const add = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: container.section.id, title: 'Short-lived' });
    await step(h, add.operation);

    expect(await h.tasks.find(add.task.id)).toBeNull();
    expect(await h.tasks.list({ includeArchived: true })).not.toContainEqual(expect.objectContaining({ id: add.task.id }));
    const { items } = await archive.derive(h.actor, MINE);
    expect(items.filter((item) => item.kind === 'task')).toEqual([]);
  });

  it('a no-op task write answers a null receipt and leaves the Redo branch standing', async () => {
    const h = buildHarness();
    const add = await h.taskWriteService.create(h.actor, { projectId: MINE, title: 'Same' });
    const edit = await h.taskWriteService.update(h.actor, add.task.id, { title: 'Changed' });
    await step(h, edit.operation!);
    const before = h.store.snapshot();

    expect((await h.taskWriteService.update(h.actor, add.task.id, { title: 'Same' })).operation).toBeNull();
    expect(h.store.snapshot().operationActions).toEqual(before.operationActions);
    expect(h.store.snapshot().operationHistories).toEqual(before.operationHistories);
    expect((await h.operationHistoryService.summary(h.actor, MINE)).redo?.actionId).toBe(edit.operation!.actionId);
  });

  it('a reflection transition needs reflections.write, and tasks.write alone is refused before any change', async () => {
    const h = buildHarness();
    const writer = agentActorFor(0, ['reflections.write']);
    const add = await h.reflectionWriteService.create(writer, { projectId: MINE, body: 'Agent note' });
    const before = h.store.snapshot();

    await expect(step(h, add.operation, 'undo', agentActorFor(0, ['tasks.write']))).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(h.store.snapshot()).toEqual(before);
    await step(h, add.operation, 'undo', writer);
    expect(await h.reflections.find(add.reflection.id)).toBeNull();
  });
});

/**
 * Slice 48: a task step's Undo and Redo refuse while the row's section, or the section the step
 * would put it in, is archived, and work again once that section is restored
 * (docs/decisions/2026-09-task-history-under-archived-sections.md). The Add, Delete and Restore
 * inverses already refused there and are pinned unchanged. B removes and restores every section
 * from its own history, so A's task step stays next, and every section B removes keeps B's live
 * filler row, so a removal always retains it rather than deleting it.
 */
describe('task history under archived sections (Slice 48; §§31, 34)', () => {
  const B = agentActorFor(0, ['projects.read', 'projects.write', 'tasks.write']);
  type Harness = ReturnType<typeof buildHarness>;

  const tick = (h: Harness): string => {
    h.clock.setNow(new Date(h.clock.now().getTime() + 60_000));
    return h.clock.now().toISOString();
  };
  /** A task list B made, holding B's live filler row. */
  const list = async (h: Harness): Promise<SectionId> => {
    const { section } = await h.sectionWriteService.add(B, MINE, { type: 'task-list' });
    await h.taskWriteService.create(B, { projectId: MINE, sectionId: section.id, title: 'Filler' });
    return section.id;
  };
  const remove = (h: Harness, id: SectionId) => h.sectionWriteService.remove(B, id);
  const restore = (h: Harness, id: SectionId) => h.sectionWriteService.restoreSection(B, id);
  const stored = async (h: Harness, id: TaskId): Promise<Task> => (await h.tasks.find(id))!;
  const create = async (h: Harness, sectionId: SectionId, title: string, parentTaskId?: TaskId) =>
    (await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId, title, ...(parentTaskId === undefined ? {} : { parentTaskId }) })).task;
  /** `S(x)`: the archived-section conflict, titled from the stored section. */
  const archivedSection = async (h: Harness, id: SectionId): Promise<UndoConflict> => ({
    entityType: 'section', id, title: nameOf((await h.sections.find(id))!), problem: 'archived-subject', nextStep: 'restore-state-and-retry',
  });
  /** A task conflict carrying the row's current title and the step its problem implies. */
  const taskConflict = async (
    h: Harness,
    id: TaskId,
    problem: 'field-changed' | 'archived-subject' | 'archive-state-changed',
  ): Promise<UndoConflict> => ({
    entityType: 'task', id, title: (await stored(h, id)).title, problem,
    nextStep: problem === 'field-changed' ? 'change-by-hand' : 'restore-state-and-retry',
  });
  /** Refused with exactly these conflicts, the step still next, and nothing written. */
  const refuses = async (h: Harness, receipt: OperationReceipt, direction: OperationHistoryDirection, conflicts: UndoConflict[]) => {
    const before = h.store.snapshot();
    const refusal = await refusalOf(step(h, receipt, direction));
    expect(refusal.reason).toBe('history_conflict');
    expect('conflicts' in refusal ? refusal.conflicts : undefined).toEqual(conflicts);
    expect(refusal.summary[direction]?.actionId).toBe(receipt.actionId);
    expect(h.store.snapshot()).toEqual(before);
  };
  /** The same step then succeeds: the exact row (or none), stamped by the ticked Clock, and one event. */
  const recovers = async (h: Harness, receipt: OperationReceipt, direction: OperationHistoryDirection, id: TaskId, expected: Task | null) => {
    const now = tick(h);
    const events = h.store.snapshot().activityEvents.length;
    await step(h, receipt, direction);
    expect(await h.tasks.find(id)).toEqual(expected === null ? null : { ...expected, updatedAt: now });
    expect(h.store.snapshot().activityEvents).toHaveLength(events + 1);
  };

  // Preserved: the Add, Delete and Restore executors already refuse here.

  it('Add inverses keep refusing under an archived section and recover after a Restore', async () => {
    const h = buildHarness();
    const s = await list(h);
    const add = await h.taskWriteService.create(h.actor, { projectId: MINE, sectionId: s, title: 'Added' });

    await remove(h, s);
    await refuses(h, add.operation, 'undo', [await taskConflict(h, add.task.id, 'archived-subject')]);
    await restore(h, s);
    await recovers(h, add.operation, 'undo', add.task.id, null);

    await remove(h, s);
    await refuses(h, add.operation, 'redo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, add.operation, 'redo', add.task.id, add.task);
  });

  it('Delete inverses keep refusing under an archived section and recover after a Restore', async () => {
    const h = buildHarness();
    const s = await list(h);
    const t = await create(h, s, 'Deleted');
    const deleted = await h.taskWriteService.archive(h.actor, t.id);

    await remove(h, s);
    await refuses(h, deleted.operation!, 'undo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, deleted.operation!, 'undo', t.id, t);

    await remove(h, s);
    await refuses(h, deleted.operation!, 'redo', [await taskConflict(h, t.id, 'archive-state-changed')]);
    await restore(h, s);
    await recovers(h, deleted.operation!, 'redo', t.id, deleted.task);
  });

  it('Restore inverses keep refusing under an archived section and recover after a Restore', async () => {
    const h = buildHarness();
    const s = await list(h);
    const t = await create(h, s, 'Restored');
    const archived = await h.taskWriteService.archive(h.actor, t.id);
    const restored = await h.taskWriteService.restore(h.actor, t.id);

    await remove(h, s);
    await refuses(h, restored.operation!, 'undo', [await taskConflict(h, t.id, 'archive-state-changed')]);
    await restore(h, s);
    await recovers(h, restored.operation!, 'undo', t.id, archived.task);

    await remove(h, s);
    await refuses(h, restored.operation!, 'redo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, restored.operation!, 'redo', t.id, restored.task);
  });

  // task.update: the container rule.

  it('an edit refuses both ways while its section is archived, and a Restore is the whole repair', async () => {
    const h = buildHarness();
    const s = await list(h);
    const t = await create(h, s, 'Original');
    const edit = await h.taskWriteService.update(h.actor, t.id, { title: 'Edited' });

    await remove(h, s);
    await refuses(h, edit.operation!, 'undo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, edit.operation!, 'undo', t.id, t);

    await remove(h, s);
    await refuses(h, edit.operation!, 'redo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, edit.operation!, 'redo', t.id, edit.task);
  });

  it('a completion refuses both ways while its section is archived, with status and completedAt exact on recovery', async () => {
    const h = buildHarness();
    const s = await list(h);
    const t = await create(h, s, 'Finish me');
    const complete = await h.taskWriteService.complete(h.actor, t.id);
    expect(complete.task).toMatchObject({ status: 'done', completedAt: expect.any(String) });

    await remove(h, s);
    await refuses(h, complete.operation!, 'undo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, complete.operation!, 'undo', t.id, t);

    await remove(h, s);
    await refuses(h, complete.operation!, 'redo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, complete.operation!, 'redo', t.id, complete.task);
  });

  it('a reopen refuses both ways while its section is archived, and brings completedAt back verbatim', async () => {
    const h = buildHarness();
    const s = await list(h);
    const t = await create(h, s, 'Reopen me');
    const complete = await h.taskWriteService.complete(h.actor, t.id);
    const reopen = await h.taskWriteService.update(h.actor, t.id, { status: 'todo' });
    expect(reopen.task.completedAt).toBeUndefined();

    await remove(h, s);
    await refuses(h, reopen.operation!, 'undo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, reopen.operation!, 'undo', t.id, complete.task);

    await remove(h, s);
    await refuses(h, reopen.operation!, 'redo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, reopen.operation!, 'redo', t.id, reopen.task);
  });

  it('a field conflict and an archived section are reported together, field first', async () => {
    const h = buildHarness();
    const s = await list(h);
    const t = await create(h, s, 'Original');
    const edit = await h.taskWriteService.update(h.actor, t.id, { title: 'Edited' });
    await h.taskWriteService.update(B, t.id, { title: 'Other' });
    await remove(h, s);

    await refuses(h, edit.operation!, 'undo', [await taskConflict(h, t.id, 'field-changed'), await archivedSection(h, s)]);
    // A Restore repairs only the section half: the field conflict is B's edit, and stays by hand.
    await restore(h, s);
    await refuses(h, edit.operation!, 'undo', [await taskConflict(h, t.id, 'field-changed')]);
  });

  it("a subtask's container is its parent's section", async () => {
    const h = buildHarness();
    const s = await list(h);
    const parent = await create(h, s, 'Parent');
    const child = await create(h, s, 'Child', parent.id);
    const edit = await h.taskWriteService.update(h.actor, child.id, { title: 'Edited child' });

    await remove(h, s);
    expect(await stored(h, child.id)).toMatchObject({ archivedWithSectionId: s });
    await refuses(h, edit.operation!, 'undo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, edit.operation!, 'undo', child.id, child);
  });

  it('an edit of an independently archived row keys on its container, and recovery never re-marks the row', async () => {
    const h = buildHarness();
    const s = await list(h);
    const t = await create(h, s, 'Filed');
    await h.taskWriteService.archive(B, t.id);
    const edit = await h.taskWriteService.update(h.actor, t.id, { title: 'Filed and renamed' });
    const archived = await stored(h, t.id);

    await remove(h, s);
    expect(await stored(h, t.id)).toEqual(archived);
    await refuses(h, edit.operation!, 'undo', [await archivedSection(h, s)]);
    await restore(h, s);
    expect(await stored(h, t.id)).toEqual(archived);
    await recovers(h, edit.operation!, 'undo', t.id, { ...archived, title: 'Filed' });
  });

  it('an archived row moved out of a section refuses on its current section for Undo and on its target for Redo', async () => {
    const h = buildHarness();
    const x = await list(h);
    const y = await list(h);
    const t = await create(h, x, 'Filed');
    await h.taskWriteService.archive(B, t.id);
    const inX = await stored(h, t.id);
    const move = await h.taskWriteService.update(h.actor, t.id, { sectionId: y });

    await remove(h, y);
    await refuses(h, move.operation!, 'undo', [await archivedSection(h, y)]);
    await restore(h, y);
    await recovers(h, move.operation!, 'undo', t.id, inX);

    await remove(h, y);
    await refuses(h, move.operation!, 'redo', [await archivedSection(h, y)]);
    await restore(h, y);
    await recovers(h, move.operation!, 'redo', t.id, move.task);
  });

  it('an archived row moved into a section refuses on an archived target in both directions', async () => {
    const h = buildHarness();
    const x = await list(h);
    const y = await list(h);
    const t = await create(h, x, 'Filed');
    await h.taskWriteService.archive(B, t.id);
    const inX = await stored(h, t.id);
    const move = await h.taskWriteService.update(h.actor, t.id, { sectionId: y });

    await remove(h, x);
    await refuses(h, move.operation!, 'undo', [await archivedSection(h, x)]);
    await restore(h, x);
    await recovers(h, move.operation!, 'undo', t.id, inX);

    await remove(h, y);
    await refuses(h, move.operation!, 'redo', [await archivedSection(h, y)]);
    await restore(h, y);
    await recovers(h, move.operation!, 'redo', t.id, move.task);
  });

  it('reports one conflict per section when the current and target sections are the same', async () => {
    const h = buildHarness();
    const s = await list(h);
    const t = await create(h, s, 'Child to be');
    const p = await create(h, s, 'Parent to be');
    await h.taskWriteService.archive(B, t.id);
    await h.taskWriteService.archive(B, p.id);
    const unparented = await stored(h, t.id);
    const reparent = await h.taskWriteService.update(h.actor, t.id, { parentTaskId: p.id });

    await remove(h, s);
    await refuses(h, reparent.operation!, 'undo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, reparent.operation!, 'undo', t.id, unparented);
  });

  it('a cascaded live move lists its structural conflict, then the current section, then the target', async () => {
    const h = buildHarness();
    const x = await list(h);
    const y = await list(h);
    const t = await create(h, x, 'Moved');
    const move = await h.taskWriteService.update(h.actor, t.id, { sectionId: y });

    await remove(h, y);
    await refuses(h, move.operation!, 'undo', [await taskConflict(h, t.id, 'archive-state-changed'), await archivedSection(h, y)]);
    await remove(h, x);
    await refuses(h, move.operation!, 'undo', [
      await taskConflict(h, t.id, 'archive-state-changed'), await archivedSection(h, y), await archivedSection(h, x),
    ]);
    // One Restore round — both sections — is the whole repair.
    await restore(h, y);
    await restore(h, x);
    await recovers(h, move.operation!, 'undo', t.id, t);
  });

  it('refuses the Redo of an archived row following its parent into an archived section (history stricter than the service)', async () => {
    const h = buildHarness();
    const x = await list(h);
    const y = await list(h);
    const p = await create(h, x, 'Parent');
    const t = await create(h, y, 'Follower');
    await h.taskWriteService.archive(B, p.id);
    await h.taskWriteService.archive(B, t.id);
    const reparent = await h.taskWriteService.update(h.actor, t.id, { parentTaskId: p.id });
    expect(reparent.task.sectionId).toBe(x);
    await step(h, reparent.operation!);
    expect((await stored(h, t.id)).sectionId).toBe(y);

    await remove(h, x);
    await refuses(h, reparent.operation!, 'redo', [await archivedSection(h, x)]);
    await restore(h, x);
    await recovers(h, reparent.operation!, 'redo', t.id, reparent.task);
  });

  it('the archived-project blocker still runs first, and the section conflict follows once the project is active', async () => {
    const h = buildHarness();
    const s = await list(h);
    const t = await create(h, s, 'Original');
    const edit = await h.taskWriteService.update(h.actor, t.id, { title: 'Edited' });
    await remove(h, s);
    await h.projectService.archive(B, MINE);

    const before = h.store.snapshot();
    const blocked = await refusalOf(step(h, edit.operation!));
    expect(blocked).toMatchObject({ reason: 'history_blocked', blockingProjectId: MINE });
    expect(blocked.summary.undo?.actionId).toBe(edit.operation!.actionId);
    expect(h.store.snapshot()).toEqual(before);

    await h.projectService.update(B, MINE, { status: 'active' });
    await refuses(h, edit.operation!, 'undo', [await archivedSection(h, s)]);
    await restore(h, s);
    await recovers(h, edit.operation!, 'undo', t.id, t);
  });

  it('an archived section the row is not in does not refuse', async () => {
    const h = buildHarness();
    const s1 = await list(h);
    const s2 = await list(h);
    const t = await create(h, s1, 'Original');
    const edit = await h.taskWriteService.update(h.actor, t.id, { title: 'Edited' });
    await remove(h, s2);

    await recovers(h, edit.operation!, 'undo', t.id, t);
    await recovers(h, edit.operation!, 'redo', t.id, edit.task);
  });
});
