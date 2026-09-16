import {
  PrototypeDocumentSchema,
  UndoRecordSchema,
  type SectionRemoveUndoOperation,
  type ActivityEvent,
  type SectionId,
  type UndoRecordId,
  type UserId,
  type UndoConflict,
  type WorkspaceId,
} from '@cwm/contracts';
import { PERSONAS, SEED_NOW } from '@cwm/prototype-data';
import { InMemoryDataStore, JsonDataStore, unitOfWorkFor, type FileOperations } from '@cwm/repositories';
import { describe, expect, it, vi } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS, twoPersonaDocument } from '../test/test-support';
import type { ActorContext } from './actor';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';
import { PrototypeIdGenerator, type IdGenerator } from './ids';
import type { LivePublication } from './live-events';
import { listPlacements } from './page-placements';

type Harness = ReturnType<typeof buildHarness>;

const LATER = '2026-08-24T17:00:00.000Z';

/** Resolves to the refusal a promise rejects with, and fails the test if it resolves. */
const refusalOf = (promise: Promise<unknown>): Promise<DomainRuleError> =>
  promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (error: unknown) => error as DomainRuleError,
  );

/** Everything Undo could write, for "nothing changed" assertions. */
const state = (harness: Harness) => {
  const { sections, sectionShortcuts, tasks, reflections, activityEvents, undoRecords } = harness.store.snapshot();
  return { sections, sectionShortcuts, tasks, reflections, activityEvents, undoRecords };
};

/** The page's combined live order, as ids. */
const order = async (harness: Harness, pageId = `page-${MINE}`) =>
  (await listPlacements(harness, pageId as never)).map(({ value }) => value.id);

/** Ids that sort against insertion order, so nothing but `sequence` can say which record is newer. */
class DescendingIdGenerator implements IdGenerator {
  private counts = new Map<string, number>();

  next(prefix: string): string {
    const count = (this.counts.get(prefix) ?? 0) + 1;
    this.counts.set(prefix, count);
    return `${prefix}-${String(1000 - count).padStart(4, '0')}`;
  }
}

/**
 * Home: a Notes section, the Progress view under test, and a shortcut to a sub-project's
 * section — so the view sits between one placement of each kind.
 */
const homeWithShortcut = async (harness: Harness) => {
  const kitchen = await harness.projectService.create(harness.actor, {
    workspaceId: harness.actor.workspaceId,
    kind: 'subproject',
    parentProjectId: MINE,
    name: 'Kitchen',
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

describe('UndoService.undo — placement', () => {
  it('recreates a deleted disposable view from its receipt snapshot in its old placement', async () => {
    const harness = buildHarness();
    const before = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', config: { text: 'Keep' } });
    const progress = await harness.sectionService.add(harness.actor, MINE, {
      type: 'progress', title: 'Burn-up', columnSpan: 6, config: { milestoneIds: ['m-1'] },
    });
    const after = await harness.sectionService.add(harness.actor, MINE, { type: 'timeline' });
    await harness.sectionService.update(harness.actor, progress.id, { collapsed: true });

    const { undo } = await harness.sectionService.remove(harness.actor, progress.id);
    expect(await harness.sections.find(progress.id)).toBeNull();
    expect(harness.store.snapshot().undoRecords.at(-1)?.operation).toMatchObject({ disposition: 'deleted' });

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(result.section).toMatchObject({
      id: progress.id,
      type: 'progress',
      title: 'Burn-up',
      config: { milestoneIds: ['m-1'] },
      columnSpan: 6,
      collapsed: true,
    });
    expect(await order(harness)).toEqual([before.id, progress.id, after.id]);
  });

  it('executes a retained version-1 record with no disposition as before Slice 31', async () => {
    const harness = buildHarness();
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', config: { text: 'Prose' } });
    const { undo } = await harness.sectionService.remove(harness.actor, notes.id);
    const record = await harness.undoRecords.find(undo.undoId);
    expect(record).not.toBeNull();
    const { disposition: _disposition, ...legacyOperation } = record!.operation as SectionRemoveUndoOperation;
    await harness.store.runUnitOfWork(() =>
      harness.undoRecords.update(UndoRecordSchema.parse({ ...record!, operation: legacyOperation })),
    );

    await expect(harness.undoService.undo(harness.actor, undo.undoId)).resolves.toMatchObject({
      outcome: 'restored', section: { id: notes.id, config: { text: 'Prose' } },
    });
  });

  it('does not overwrite a live section that reused a deleted section id', async () => {
    const harness = buildHarness();
    const progress = await harness.sectionService.add(harness.actor, MINE, { type: 'progress', title: 'Old' });
    const { undo } = await harness.sectionService.remove(harness.actor, progress.id);
    const original = (await harness.undoRecords.find(undo.undoId))!.operation;
    if (original.type !== 'section.remove') throw new Error('unexpected operation');
    const replacement = { ...original.section, title: 'Replacement', position: 0, updatedAt: LATER };
    await harness.store.runUnitOfWork(() => harness.sections.insert(replacement));
    const before = state(harness);

    const refusal = await refusalOf(harness.undoService.undo(harness.actor, undo.undoId));

    expect(refusal.details).toEqual({
      reason: 'undo_conflict',
      undoId: undo.undoId,
      conflicts: [{
        entityType: 'section', id: progress.id, title: 'Replacement', problem: 'not-archived', nextStep: 'nothing-to-undo',
      }],
    });
    expect(state(harness)).toEqual(before);
  });

  it('classifies an archived section that reused a deleted section id as archived differently', async () => {
    const harness = buildHarness();
    const progress = await harness.sectionService.add(harness.actor, MINE, { type: 'progress', title: 'Old' });
    const { undo } = await harness.sectionService.remove(harness.actor, progress.id);
    const original = (await harness.undoRecords.find(undo.undoId))!.operation;
    if (original.type !== 'section.remove') throw new Error('unexpected operation');
    await harness.store.runUnitOfWork(() => harness.sections.insert({
      ...original.section, title: 'Replacement', position: 0, archivedAt: LATER, updatedAt: LATER,
    }));
    const before = state(harness);

    const refusal = await refusalOf(harness.undoService.undo(harness.actor, undo.undoId));

    expect(refusal.details).toEqual({
      reason: 'undo_conflict', undoId: undo.undoId,
      conflicts: [{
        entityType: 'section', id: progress.id, title: 'Replacement', problem: 'archived-differently',
        nextStep: 'use-later-receipt-or-archive',
      }],
    });
    expect(state(harness)).toEqual(before);
  });

  it('restores a disposable view exactly, between the same neighbours, and consumes the record', async () => {
    const harness = buildHarness();
    const { notes, progress, shortcut } = await homeWithShortcut(harness);
    const { undo } = await harness.sectionService.remove(harness.actor, progress.id);
    expect(await order(harness)).toEqual([notes.id, shortcut.id]);
    harness.clock.setNow(new Date(LATER));

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(await order(harness)).toEqual([notes.id, progress.id, shortcut.id]);
    // Its stale archived position equals the resolved index, and it is still written live.
    expect(await harness.sections.find(progress.id)).toEqual({ ...progress, updatedAt: LATER });
    expect(result).toEqual({
      undoId: undo.undoId,
      operation: 'section.remove',
      outcome: 'restored',
      section: { ...progress, updatedAt: LATER },
      placement: { pageId: `page-${MINE}`, index: 1, strategy: 'previous', pageEnabled: true },
      restoredRowCount: 0,
    });
    expect((await harness.undoRecords.find(undo.undoId))?.consumedAt).toBe(LATER);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('follows the previous neighbour past an interposed insert, leaving shifted siblings’ timestamps alone', async () => {
    const harness = buildHarness();
    const { notes, progress, shortcut } = await homeWithShortcut(harness);
    const { undo } = await harness.sectionService.remove(harness.actor, progress.id);
    const inserted = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', position: 0 });
    const before = await harness.sectionShortcutService.list(harness.actor, MINE);
    harness.clock.setNow(new Date(LATER));

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(await order(harness)).toEqual([inserted.id, notes.id, progress.id, shortcut.id]);
    expect(result.placement).toMatchObject({ index: 2, strategy: 'previous' });
    const moved = (await harness.shortcuts.find(shortcut.id))!;
    expect(moved.position).toBe(3);
    expect(moved.updatedAt).toBe(before[0]!.updatedAt);
    expect((await harness.sections.find(notes.id))?.updatedAt).toBe(SEED_NOW);
  });

  it('inserts before the next neighbour when the previous one is gone', async () => {
    const harness = buildHarness();
    const { notes, progress, shortcut } = await homeWithShortcut(harness);
    const { undo } = await harness.sectionService.remove(harness.actor, progress.id);
    await harness.sectionService.remove(harness.actor, notes.id);

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(await order(harness)).toEqual([progress.id, shortcut.id]);
    expect(result.placement).toMatchObject({ index: 0, strategy: 'next' });
  });

  it('follows a shortcut neighbour that moved', async () => {
    const harness = buildHarness();
    const { notes, progress, shortcut } = await homeWithShortcut(harness);
    const { undo } = await harness.sectionService.remove(harness.actor, progress.id);
    await harness.sectionService.remove(harness.actor, notes.id);
    const added = await harness.sectionService.add(harness.actor, MINE, { type: 'timeline' });
    await harness.sectionShortcutService.move(harness.actor, shortcut.id, 1);
    expect(await order(harness)).toEqual([added.id, shortcut.id]);

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(await order(harness)).toEqual([added.id, progress.id, shortcut.id]);
    expect(result.placement).toMatchObject({ index: 1, strategy: 'next' });
  });

  it('clamps the original index when both neighbours are gone', async () => {
    const harness = buildHarness();
    const { notes, progress, shortcut } = await homeWithShortcut(harness);
    const { undo } = await harness.sectionService.remove(harness.actor, progress.id);
    await harness.sectionService.remove(harness.actor, notes.id);
    await harness.sectionShortcutService.remove(harness.actor, shortcut.id);
    const x = await harness.sectionService.add(harness.actor, MINE, { type: 'timeline' });
    const y = await harness.sectionService.add(harness.actor, MINE, { type: 'timeline' });

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(await order(harness)).toEqual([x.id, progress.id, y.id]);
    expect(result.placement).toMatchObject({ index: 1, strategy: 'index' });
  });

  it('restores onto a page that was disabled after the removal, and says so', async () => {
    const harness = buildHarness();
    const page = await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'reflections', enabled: true });
    const journal = await harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: page.id });
    const { undo } = await harness.sectionService.remove(harness.actor, journal.id);
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'reflections', enabled: false });

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(result).toMatchObject({ outcome: 'restored', placement: { pageId: page.id, index: 0, pageEnabled: false } });
    expect((await harness.sections.find(journal.id))?.archivedAt).toBeUndefined();
  });
});

describe('UndoService.undo — rows', () => {
  it('reverses a cascade exactly, leaving independently archived rows and their subtrees as they were', async () => {
    const harness = buildHarness();
    const parent = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Parent' });
    const child = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Child', parentTaskId: parent.id });
    const filed = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed' });
    const filedChild = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed child', parentTaskId: filed.id });
    await harness.taskService.archive(harness.actor, filed.id);
    const filedBefore = [await harness.tasks.find(filed.id), await harness.tasks.find(filedChild.id)];
    const { undo } = await harness.sectionService.remove(harness.actor, parent.sectionId, { policy: 'cascade' });

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(result.restoredRowCount).toBe(2);
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
    const { undo } = await harness.sectionService.remove(harness.actor, live.sectionId, { policy: 'cascade' });

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(result.restoredRowCount).toBe(1);
    const restored = (await harness.reflections.find(live.id))!;
    expect(restored.archivedAt).toBeUndefined();
    expect(restored.archivedWithSectionId).toBeUndefined();
    expect(await harness.reflections.find(filed.id)).toEqual(filedBefore);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('reverses a reassign after later title and status edits, preserving the edits', async () => {
    const harness = buildHarness();
    const live = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Live' });
    const filed = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed' });
    await harness.taskService.archive(harness.actor, filed.id);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    const own = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Own', sectionId: target.id });
    const source = live.sectionId;
    const { undo } = await harness.sectionService.remove(harness.actor, source, { policy: 'reassign', reassignToSectionId: target.id });
    await harness.taskService.update(harness.actor, live.id, { title: 'Renamed', status: 'in_progress' });

    const result = await harness.undoService.undo(harness.actor, undo.undoId);

    expect(result.restoredRowCount).toBe(2);
    expect(await harness.tasks.find(live.id)).toMatchObject({ sectionId: source, title: 'Renamed', status: 'in_progress' });
    expect(await harness.tasks.find(filed.id)).toMatchObject({ sectionId: source, archivedAt: SEED_NOW });
    expect((await harness.tasks.find(own.id))?.sectionId).toBe(target.id);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });
});

describe('UndoService.undo — conflicts', () => {
  /** Refuses with exactly these problems, and writes nothing, records nothing, consumes nothing. */
  const expectConflict = async (harness: Harness, undoId: UndoRecordId, conflicts: UndoConflict[]) => {
    const before = state(harness);

    const refusal = await refusalOf(harness.undoService.undo(harness.actor, undoId));

    expect(refusal).toBeInstanceOf(DomainRuleError);
    expect(refusal.details).toEqual({
      reason: 'undo_conflict',
      undoId,
      conflicts,
    });
    expect(refusal.message).toMatch(/^undo_conflict: /);
    for (const conflict of conflicts) {
      expect(refusal.message).toContain(conflict.problem);
      expect(refusal.message).toContain(conflict.id);
      if (conflict.title !== undefined) expect(refusal.message).toContain(`"${conflict.title}"`);
    }
    expect(state(harness)).toEqual(before);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  };

  it('refuses after Archive Restore brought the section back', async () => {
    const harness = buildHarness();
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', title: 'Notes', config: { text: 'Prose' } });
    const { undo } = await harness.sectionService.remove(harness.actor, notes.id);
    await harness.sectionService.restoreSection(harness.actor, notes.id);

    await expectConflict(harness, undo.undoId, [{
      entityType: 'section', id: notes.id, title: 'Notes', problem: 'not-archived', nextStep: 'nothing-to-undo',
    }]);
  });

  it.each([
    ['with the clock advanced', 60_000, ['archived-differently', 'superseded']],
    ['within the same frozen instant', 0, ['superseded']],
    ['with the clock set backwards', -60_000, ['archived-differently', 'superseded']],
  ])('refuses an older removal of a section restored and removed again %s, and the newer still undoes', async (_, shift, problems) => {
    const harness = buildHarness(undefined, { ids: new DescendingIdGenerator() });
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', title: 'Notes', config: { text: 'Prose' } });
    const { undo: older } = await harness.sectionService.remove(harness.actor, notes.id);
    await harness.sectionService.restoreSection(harness.actor, notes.id);
    harness.clock.setNow(new Date(Date.parse(SEED_NOW) + shift));
    const { undo: newer } = await harness.sectionService.remove(harness.actor, notes.id);
    // The newer receipt's id sorts *before* the older one's.
    expect(newer.undoId < older.undoId).toBe(true);

    const nextSteps = {
      'archived-differently': 'use-later-receipt-or-archive',
      superseded: 'use-later-receipt-or-archive',
    } as const;
    await expectConflict(harness, older.undoId, problems.map((problem) => ({
      entityType: 'section', id: notes.id, title: 'Notes', problem: problem as UndoConflict['problem'],
      nextStep: nextSteps[problem as keyof typeof nextSteps],
      // One actor did both removals, so the later receipt really is a repair they can reach.
      ...(problem === 'superseded' ? { supersededBy: 'self' as const } : {}),
    })));
    await expect(harness.undoService.undo(harness.actor, newer.undoId)).resolves.toMatchObject({ outcome: 'restored' });
  });

  it('tells a person to redo by hand when an agent’s removal superseded theirs, keeping the Archive route', async () => {
    // A removal receipt refused because of a *foreign* later change: Archive may still hold the
    // retained prose, but the agent's receipt is not this person's to use (note-2026-09-15-005).
    const harness = buildHarness();
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', title: 'Notes', config: { text: 'Prose' } });
    const { undo: mine } = await harness.sectionService.remove(harness.actor, notes.id);
    await harness.sectionService.restoreSection(harness.actor, notes.id);
    await harness.sectionService.remove(agentActorFor(0, ['projects.write']), notes.id);

    const refusal = await refusalOf(harness.undoService.undo(harness.actor, mine.undoId));

    expect((refusal.details as { conflicts: unknown[] }).conflicts).toContainEqual(
      expect.objectContaining({ problem: 'superseded', nextStep: 'redo-by-hand-or-archive', supersededBy: 'agent' }),
    );
    expect(refusal.message).toContain('recover retained content from Archive');
  });

  /** A live row and an archived one reassigned from their list to another. */
  const reassigned = async (harness: Harness) => {
    const live = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Live' });
    const filed = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed' });
    await harness.taskService.archive(harness.actor, filed.id);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    const { undo } = await harness.sectionService.remove(harness.actor, live.sectionId, {
      policy: 'reassign',
      reassignToSectionId: target.id,
    });
    return { live, filed, target, undo };
  };

  it('refuses when a reassigned row has since moved', async () => {
    const harness = buildHarness();
    const { live, undo } = await reassigned(harness);
    const other = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    await harness.taskService.update(harness.actor, live.id, { sectionId: other.id });

    await expectConflict(harness, undo.undoId, [{
      entityType: 'task', id: live.id, title: 'Live', problem: 'moved', nextStep: 'move-back-and-retry',
    }]);
  });

  it('refuses when a reassigned row has since been archived', async () => {
    const harness = buildHarness();
    const { live, undo } = await reassigned(harness);
    await harness.taskService.archive(harness.actor, live.id);

    await expectConflict(harness, undo.undoId, [{
      entityType: 'task', id: live.id, title: 'Live', problem: 'archive-state-changed',
      nextStep: 'restore-state-and-retry',
    }]);
  });

  it('refuses when a subtask was created under a moved parent', async () => {
    const harness = buildHarness();
    const { live, undo } = await reassigned(harness);
    const subtask = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Sub', parentTaskId: live.id });

    await expectConflict(harness, undo.undoId, [{
      entityType: 'task', id: subtask.id, title: 'Sub', problem: 'new-dependent',
      nextStep: 'restore-or-move-dependent-and-retry',
    }]);
  });

  it('refuses when a reassigned row was reparented, listing every problem at once', async () => {
    const harness = buildHarness();
    const { live, filed, target, undo } = await reassigned(harness);
    const sibling = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Sibling', sectionId: target.id });
    await harness.taskService.update(harness.actor, live.id, { parentTaskId: sibling.id });
    await harness.taskService.restore(harness.actor, filed.id);

    await expectConflict(harness, undo.undoId, [
      {
        entityType: 'task', id: live.id, title: 'Live', problem: 'reparented',
        nextStep: 'move-back-and-retry',
      },
      {
        entityType: 'task', id: filed.id, title: 'Filed', problem: 'archive-state-changed',
        nextStep: 'use-later-receipt-or-archive',
      },
    ]);
  });
});

describe('UndoService.undo — archived projects', () => {
  it('is blocked while the project is archived, and works once it is reactivated', async () => {
    const harness = buildHarness();
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text' });
    const { undo } = await harness.sectionService.remove(harness.actor, notes.id);
    await harness.projectService.update(harness.actor, MINE, { status: 'archived' });
    const before = state(harness);

    const refusal = await refusalOf(harness.undoService.undo(harness.actor, undo.undoId));

    expect(refusal.details).toEqual({
      reason: 'undo_blocked', undoId: undo.undoId, blockingProjectId: MINE, blockingProjectTitle: 'Project project-mine',
    });
    expect(state(harness)).toEqual(before);
    await harness.projectService.update(harness.actor, MINE, { status: 'active' });
    await expect(harness.undoService.undo(harness.actor, undo.undoId)).resolves.toMatchObject({ outcome: 'restored' });
  });

  it('is blocked by an archived ancestor, naming the highest one', async () => {
    const harness = buildHarness();
    const kitchen = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId,
      kind: 'subproject',
      parentProjectId: MINE,
      name: 'Kitchen',
    });
    const notes = await harness.sectionService.add(harness.actor, kitchen.id, { type: 'rich-text' });
    const { undo } = await harness.sectionService.remove(harness.actor, notes.id);
    await harness.projectService.archive(harness.actor, kitchen.id);
    await harness.projectService.archive(harness.actor, MINE);

    const refusal = await refusalOf(harness.undoService.undo(harness.actor, undo.undoId));

    expect(refusal.message).toMatch(/^undo_blocked: /);
    expect(refusal.details).toMatchObject({ blockingProjectId: MINE });
    await harness.projectService.update(harness.actor, MINE, { status: 'active' });
    await harness.projectService.update(harness.actor, kitchen.id, { status: 'active' });
    await expect(harness.undoService.undo(harness.actor, undo.undoId)).resolves.toMatchObject({ outcome: 'restored' });
  });
});

describe('UndoService.undo — scope and grants', () => {
  const removedNotes = async (harness: Harness, actor: ActorContext = harness.actor) => {
    const notes = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text' });
    return (await harness.sectionService.remove(actor, notes.id)).undo;
  };

  it('answers the same not-found to every caller who is not the exact actor that removed', async () => {
    const document = twoPersonaDocument();
    document.users.push(
      PrototypeDocumentSchema.shape.users.element.parse({ ...PERSONAS[0]!.user, id: 'user-guest', name: 'Guest' }),
    );
    const harness = buildHarness(document);
    const undo = await removedNotes(harness);
    const workspaceId = harness.actor.workspaceId as WorkspaceId;
    const callers: ActorContext[] = [
      harness.other,
      { actor: 'user', workspaceId, userId: 'user-guest' as UserId },
      agentActorFor(0, ['projects.write']),
      { actor: 'agent', workspaceId, agentConnectionId: 'agent-cursor' as never, permissions: ['projects.write'] },
      { actor: 'system', workspaceId },
    ];
    const before = state(harness);

    for (const caller of callers) {
      const refusal = await refusalOf(harness.undoService.undo(caller, undo.undoId));
      expect(refusal).toBeInstanceOf(EntityNotFoundError);
      expect(refusal.message).toBe(`undoRecord "${undo.undoId}" was not found`);
    }
    // The same shape of not-found for an id that never existed, so a refusal cannot confirm one did.
    const unknown = await refusalOf(harness.undoService.undo(harness.actor, 'undo-unknown' as UndoRecordId));
    expect(unknown).toBeInstanceOf(EntityNotFoundError);
    expect(unknown.message).toBe('undoRecord "undo-unknown" was not found');
    expect(state(harness)).toEqual(before);
  });

  it('lets an agent with exactly projects.write undo its own removal', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['projects.write']);
    const undo = await removedNotes(harness, agent);

    await expect(harness.undoService.undo(agent, undo.undoId)).resolves.toMatchObject({ outcome: 'restored' });
  });

  it('denies an agent without projects.write before reading the record', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['projects.write']);
    const undo = await removedNotes(harness, agent);
    const find = vi.spyOn(harness.undoRecords, 'find');

    await expect(
      harness.undoService.undo(agentActorFor(0, ['projects.read', 'tasks.write']), undo.undoId),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    expect(find).not.toHaveBeenCalled();
    expect((await harness.undoRecords.find(undo.undoId))?.consumedAt).toBeUndefined();
  });
});

describe('UndoService.undo — consumption, expiry and failure', () => {
  const removedNotes = async (harness: Harness) => {
    const notes = await harness.sectionService.add(harness.actor, MINE, {
      type: 'rich-text', title: 'Kickoff', config: { text: 'Keep this prose' },
    });
    return { notes, undo: (await harness.sectionService.remove(harness.actor, notes.id)).undo };
  };

  it('records exactly one attributable event naming the project, and publishes one frame', async () => {
    const frames: LivePublication[] = [];
    const harness = buildHarness(undefined, { events: { publish: (publication) => void frames.push(publication) } });
    const { undo } = await removedNotes(harness);
    const eventsBefore = harness.store.snapshot().activityEvents.length;
    frames.length = 0;

    await harness.undoService.undo(harness.actor, undo.undoId);

    const events: ActivityEvent[] = harness.store.snapshot().activityEvents.slice(eventsBefore);
    expect(events).toEqual([
      {
        id: expect.any(String),
        workspaceId: harness.actor.workspaceId,
        actor: 'user',
        actorUserId: harness.actor.userId,
        action: 'project.section_removal_undone',
        entityType: 'project',
        entityId: MINE,
        projectId: MINE,
        summary: 'Undid removing the Kickoff section',
        createdAt: SEED_NOW,
      },
    ]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.event).toEqual({
      type: 'project.section_removal_undone',
      entityType: 'project',
      entityId: MINE,
      projectId: MINE,
      rootProjectId: MINE,
    });
  });

  it('refuses a repeat as undo_consumed, with no second event', async () => {
    const harness = buildHarness();
    const { undo } = await removedNotes(harness);
    await harness.undoService.undo(harness.actor, undo.undoId);
    const before = state(harness);

    const refusal = await refusalOf(harness.undoService.undo(harness.actor, undo.undoId));

    expect(refusal.message).toMatch(/^undo_consumed: /);
    expect(refusal.details).toEqual({ reason: 'undo_consumed', undoId: undo.undoId, consumedAt: SEED_NOW });
    expect(state(harness)).toEqual(before);
  });

  it.each([
    ['at', 0],
    ['after', 1],
  ])('refuses as undo_expired %s the expiry instant, writing nothing', async (_, offset) => {
    const harness = buildHarness();
    const { undo } = await removedNotes(harness);
    harness.clock.setNow(new Date(Date.parse(undo.expiresAt) + offset));
    const before = state(harness);

    const refusal = await refusalOf(harness.undoService.undo(harness.actor, undo.undoId));

    expect(refusal.message).toMatch(/^undo_expired: /);
    expect(refusal.details).toEqual({ reason: 'undo_expired', undoId: undo.undoId, expiresAt: undo.expiresAt });
    expect(state(harness)).toEqual(before);
  });

  it('rolls back when recording the activity fails', async () => {
    const harness = buildHarness();
    const { notes, undo } = await removedNotes(harness);
    const before = state(harness);
    vi.spyOn(harness.activity, 'record').mockRejectedValueOnce(new Error('activity unavailable'));

    await expect(harness.undoService.undo(harness.actor, undo.undoId)).rejects.toThrow('activity unavailable');

    expect(state(harness)).toEqual(before);
    expect((await harness.sections.find(notes.id))?.archivedAt).toBe(SEED_NOW);
  });

  it('rolls back when persistence fails', async () => {
    const harness = buildHarness();
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Row' });
    const { undo } = await harness.sectionService.remove(harness.actor, task.sectionId, { policy: 'cascade' });
    const before = state(harness);
    harness.store.persistFailure = new Error('disk full');

    await expect(harness.undoService.undo(harness.actor, undo.undoId)).rejects.toThrow('disk full');

    harness.store.persistFailure = undefined;
    expect(state(harness)).toEqual(before);
    expect((await harness.undoRecords.find(undo.undoId))?.consumedAt).toBeUndefined();
  });

  it('keeps records usable across a serialize and reload of the data file', async () => {
    const first = buildHarness();
    const notes = await first.sectionService.add(first.actor, MINE, { type: 'rich-text', config: { text: 'Prose' } });
    const { undo } = await first.sectionService.remove(first.actor, notes.id);

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
    const result = await second.undoService.undo(second.actor, undo.undoId);

    expect(result.section).toMatchObject({ id: notes.id, config: { text: 'Prose' } });
    expect((await second.sections.find(notes.id as SectionId))?.archivedAt).toBeUndefined();
  });

  it('never confuses a foreign workspace’s record for its own', async () => {
    const harness = buildHarness();
    const theirs = await harness.sectionService.add(harness.other, THEIRS, { type: 'rich-text' });
    const { undo } = await harness.sectionService.remove(harness.other, theirs.id);

    await expect(harness.undoService.undo(harness.actor, undo.undoId)).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(harness.undoService.undo(harness.other, undo.undoId)).resolves.toMatchObject({ outcome: 'restored' });
  });
});
