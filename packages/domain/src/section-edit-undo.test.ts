import { type ProjectSection, type SectionId } from '@cwm/contracts';
import { unitOfWorkFor } from '@cwm/repositories';
import { describe, expect, it } from 'vitest';
import type { ActorContext } from './actor';
import { actorFor, agentActorFor, buildHarness, MINE } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError } from './errors';
import { captureSectionUpdate } from './section-edit-undo';
import { listPlacements } from './page-placements';
import { UndoService } from './undo-service';

type Harness = ReturnType<typeof buildHarness>;

const writable = (harness: Harness) => {
  const { sections, tasks, reflections, activityEvents, undoRecords, sectionShortcuts } = harness.store.snapshot();
  return { sections, tasks, reflections, activityEvents, undoRecords, sectionShortcuts };
};

const refusalOf = (promise: Promise<unknown>): Promise<DomainRuleError> =>
  promise.then(
    () => { throw new Error('expected a refusal'); },
    (failure: unknown) => {
      expect(failure).toBeInstanceOf(DomainRuleError);
      return failure as DomainRuleError;
    },
  );

const problemsOf = (error: DomainRuleError): string[] =>
  ((error.details as { conflicts?: { problem: string }[] }).conflicts ?? []).map(({ problem }) => problem);

describe('SectionService edit receipts and Undo', () => {
  it('records an explicit add and Undo removes only that section', async () => {
    const harness = buildHarness();

    const added = await harness.sectionWriteService.add(harness.actor, MINE, {
      type: 'rich-text',
      title: 'Scratch',
      config: { text: 'temporary' },
    });

    expect(added.undo).toMatchObject({ operation: 'section.add', sequence: 1 });
    expect(harness.store.snapshot().undoRecords.at(-1)?.operation).toMatchObject({
      type: 'section.add',
      section: added.section,
    });

    const undone = await harness.undoServiceWithEdits.undo(harness.actor, added.undo.undoId);

    expect(undone).toEqual({
      undoId: added.undo.undoId,
      operation: 'section.add',
      outcome: 'removed',
      sectionId: added.section.id,
      projectId: MINE,
      pageId: added.section.pageId,
    });
    expect(await harness.sections.find(added.section.id)).toBeNull();
    expect(harness.store.snapshot().activityEvents.at(-1)?.action).toBe('project.section_addition_undone');
  });

  it('does not record implicit row-container creation', async () => {
    const harness = buildHarness();

    await harness.reflectionService.create(harness.actor, { projectId: MINE, title: 'First reflection', body: 'Body' });

    expect(harness.store.snapshot().undoRecords).toEqual([]);
  });

  it('returns no receipt for a true update or move no-op', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress' });
    const before = harness.store.snapshot();
    const update = await harness.sectionWriteService.update(harness.actor, added.section.id, {
      config: { ...added.section.config },
      collapsed: added.section.collapsed,
      columnSpan: added.section.columnSpan,
    });
    const move = await harness.sectionWriteService.move(harness.actor, added.section.id, added.section.position);

    expect(update).toEqual({ section: added.section, undo: null });
    expect(move).toEqual({ section: added.section, undo: null });
    expect(harness.store.snapshot().activityEvents).toEqual(before.activityEvents);
    expect(harness.store.snapshot().undoRecords).toEqual(before.undoRecords);
  });

  it('restores only the fields in an update and allows a disjoint later update', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });

    const titleUpdate = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: '  Notes  ' });
    const widthUpdate = await harness.sectionWriteService.update(harness.actor, added.section.id, { columnSpan: 6 });
    const undone = await harness.undoServiceWithEdits.undo(harness.actor, titleUpdate.undo!.undoId);

    expect(widthUpdate.undo).not.toBeNull();
    expect(undone).toMatchObject({ operation: 'section.update', outcome: 'restored', section: { columnSpan: 6 } });
    expect(undone.operation === 'section.update' ? undone.section.title : undefined).toBeUndefined();
    expect(await harness.sections.find(added.section.id)).toMatchObject({ columnSpan: 6 });
  });

  it('restores a move in combined section and shortcut order using a surviving neighbour', async () => {
    const harness = buildHarness();
    const first = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', title: 'First' });
    const second = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'timeline', title: 'Second' });
    const sourceProject = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId,
      kind: 'subproject',
      parentProjectId: MINE,
      name: 'Source',
    });
    const source = await harness.sectionWriteService.add(harness.actor, sourceProject.id, { type: 'rich-text' });
    const home = (await harness.pages.list({ projectId: MINE, kind: 'home' }))[0]!;
    await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: home.id,
      sourceSectionId: source.section.id,
    });

    const moved = await harness.sectionWriteService.move(harness.actor, second.section.id, 0);
    const undone = await harness.undoServiceWithEdits.undo(harness.actor, moved.undo!.undoId);

    expect(undone).toMatchObject({
      operation: 'section.move',
      placement: { strategy: 'previous', index: 1 },
    });
    expect(await harness.sectionWriteService.list(harness.actor, MINE)).toEqual([
      expect.objectContaining({ id: first.section.id, position: 0 }),
      expect.objectContaining({ id: second.section.id, position: 1 }),
    ]);
  });

  it('refuses add Undo when a later row references the new container and keeps the receipt usable', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'task-list' });
    await harness.taskService.create(harness.actor, { projectId: MINE, sectionId: added.section.id, title: 'Keep me' });

    const error = await harness.undoServiceWithEdits
      .undo(harness.actor, added.undo.undoId)
      .then(() => undefined, (failure: unknown) => failure);

    expect(error).toBeInstanceOf(DomainRuleError);
    expect((error as DomainRuleError).message).toMatch(/^undo_conflict:/);
    expect((error as DomainRuleError).details).toMatchObject({
      reason: 'undo_conflict',
      conflicts: [expect.objectContaining({ entityType: 'task', problem: 'new-dependent' })],
    });
    expect((await harness.undoRecords.find(added.undo.undoId))?.consumedAt).toBeUndefined();
    expect(await harness.sections.find(added.section.id)).not.toBeNull();
  });

  it('keeps the exact prior title representation in an update inverse', async () => {
    const harness = buildHarness();
    const section: ProjectSection = {
      id: 'section-raw' as SectionId,
      projectId: MINE,
      pageId: 'page-project-mine' as ProjectSection['pageId'],
      type: 'rich-text',
      position: 0,
      columnSpan: 12,
      collapsed: false,
      config: {},
      createdAt: '2026-08-01T16:00:00.000Z',
      updatedAt: '2026-08-01T16:00:00.000Z',
    };
    await harness.sections.insert(section);

    const update = await harness.sectionWriteService.update(harness.actor, section.id, { title: 'Named' });
    await harness.undoServiceWithEdits.undo(harness.actor, update.undo!.undoId);

    const restored = await harness.sections.find(section.id);
    expect(restored).not.toHaveProperty('title');
  });

  describe('forward writes roll back with a failed recorder', () => {
    const failing = () => buildHarness(undefined, {
      recorder: (real) => ({
        record: () => Promise.reject(new Error('recorder unavailable')),
        outstandingFor: (actor, sectionId) => real.outstandingFor(actor, sectionId),
      }),
    });

    it.each([
      ['add', (harness: Harness) => harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', position: 0 })],
      ['update', (harness: Harness) => harness.sectionWriteService.update(harness.actor, 'section-b' as SectionId, { title: 'Renamed', columnSpan: 6 })],
      ['move', (harness: Harness) => harness.sectionWriteService.move(harness.actor, 'section-b' as SectionId, 0)],
    ] as const)('%s leaves sections, positions, activity and records unchanged', async (_, act) => {
      const harness = failing();
      for (const [id, position] of [['section-a', 0], ['section-b', 1]] as const) {
        await harness.sections.insert({
          id: id as SectionId, projectId: MINE, pageId: 'page-project-mine' as ProjectSection['pageId'], type: 'rich-text',
          title: id, position, columnSpan: 12, collapsed: false, config: {},
          createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z',
        });
      }
      const before = writable(harness);
      const persistCalls = harness.store.persistCalls;

      await expect(act(harness)).rejects.toThrow('recorder unavailable');

      expect(writable(harness)).toEqual(before);
      expect(harness.store.persistCalls).toBe(persistCalls);
    });
  });

  it('records exactly one record and event per changed operation, and Undo adds one event and no record', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
    const events = harness.store.snapshot().activityEvents.length;
    const records = harness.store.snapshot().undoRecords.length;

    const updated = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: 'Once', collapsed: true });
    expect(harness.store.snapshot().activityEvents.length).toBe(events + 1);
    expect(harness.store.snapshot().undoRecords.length).toBe(records + 1);
    expect(harness.store.snapshot().undoRecords.at(-1)?.operation).toMatchObject({
      type: 'section.update',
      changes: [
        { field: 'title', before: null, after: 'Once' },
        { field: 'collapsed', before: false, after: true },
      ],
    });

    await harness.undoServiceWithEdits.undo(harness.actor, updated.undo!.undoId);
    expect(harness.store.snapshot().activityEvents.length).toBe(events + 2);
    expect(harness.store.snapshot().activityEvents.at(-1)?.action).toBe('project.section_update_undone');
    expect(harness.store.snapshot().undoRecords.length).toBe(records + 1);
    expect((await harness.undoRecords.find(updated.undo!.undoId))?.consumedAt).toBeDefined();
  });

  it('treats a config with reordered keys as a no-op', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', config: { text: 'a', tone: 'calm' } });
    const before = writable(harness);

    const result = await harness.sectionWriteService.update(harness.actor, added.section.id, { config: { tone: 'calm', text: 'a' } });

    expect(result.undo).toBeNull();
    expect(writable(harness)).toEqual(before);
  });

  describe('add inverse refuses once removal would destroy later work', () => {
    it('refuses after the section config changed, without deleting it', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', config: { text: 'initial' } });
      await harness.sectionWriteService.update(harness.actor, added.section.id, { config: { text: 'authored later' } });
      const before = writable(harness);

      const refusal = await refusalOf(harness.undoServiceWithEdits.undo(harness.actor, added.undo.undoId));

      expect(problemsOf(refusal)).toEqual(['field-changed', 'superseded']);
      expect(writable(harness)).toEqual(before);
    });

    it('refuses while a shortcut elsewhere points at the new section', async () => {
      const harness = buildHarness();
      const home = (await harness.pages.list({ projectId: MINE, kind: 'home' }))[0]!;
      const child = await harness.projectService.create(harness.actor, {
        workspaceId: harness.actor.workspaceId, kind: 'subproject', parentProjectId: MINE, name: 'Child',
      });
      const added = await harness.sectionWriteService.add(harness.actor, child.id, { type: 'rich-text' });
      await harness.sectionShortcutService.create(harness.actor, MINE, { pageId: home.id, sourceSectionId: added.section.id });
      const before = writable(harness);

      const refusal = await refusalOf(harness.undoServiceWithEdits.undo(harness.actor, added.undo.undoId));

      expect(refusal.details).toMatchObject({
        conflicts: [expect.objectContaining({ entityType: 'shortcut', problem: 'shortcut-reference', nextStep: 'remove-reference-and-retry' })],
      });
      expect(writable(harness)).toEqual(before);
    });

    it('is blocked while the owning project is archived', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      await harness.projectService.update(harness.actor, MINE, { status: 'archived' });

      const refusal = await refusalOf(harness.undoServiceWithEdits.undo(harness.actor, added.undo.undoId));

      expect(refusal.details).toMatchObject({ reason: 'undo_blocked', blockingProjectId: MINE });
      expect(await harness.sections.find(added.section.id)).not.toBeNull();
    });
  });

  describe('update inverse footprint', () => {
    it('is superseded by a newer overlapping update even when the value changed back under the same clock', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      const first = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: 'A' });
      await harness.sectionWriteService.update(harness.actor, added.section.id, { title: 'B' });
      await harness.sectionWriteService.update(harness.actor, added.section.id, { title: 'A' });
      const before = writable(harness);

      const refusal = await refusalOf(harness.undoServiceWithEdits.undo(harness.actor, first.undo!.undoId));

      expect(problemsOf(refusal)).toEqual(['superseded']);
      expect(writable(harness)).toEqual(before);
    });

    it('refuses when a touched field changed outside the recorder', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      const update = await harness.sectionWriteService.update(harness.actor, added.section.id, { columnSpan: 6, collapsed: true });
      const current = (await harness.sections.find(added.section.id))!;
      await harness.sections.update({ ...current, columnSpan: 4 });

      const refusal = await refusalOf(harness.undoServiceWithEdits.undo(harness.actor, update.undo!.undoId));

      expect(problemsOf(refusal)).toEqual(['field-changed']);
      expect(await harness.sections.find(added.section.id)).toMatchObject({ columnSpan: 4, collapsed: true });
    });

    it('is not superseded by a later move, and keeps the moved position', async () => {
      const harness = buildHarness();
      await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress' });
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      const update = await harness.sectionWriteService.update(harness.actor, added.section.id, { collapsed: true });
      await harness.sectionWriteService.move(harness.actor, added.section.id, 0);

      const undone = await harness.undoServiceWithEdits.undo(harness.actor, update.undo!.undoId);

      expect(undone).toMatchObject({ operation: 'section.update', section: { collapsed: false, position: 0 } });
    });
  });

  describe('move inverse', () => {
    const three = async (harness: Harness) => {
      const a = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', title: 'A' });
      const b = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'timeline', title: 'B' });
      const c = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'C' });
      return { a: a.section.id, b: b.section.id, c: c.section.id };
    };
    const order = async (harness: Harness) =>
      (await harness.sectionWriteService.list(harness.actor, MINE)).map(({ title }) => title);

    it('names the agent that superseded a person’s move, and stops offering its receipt', async () => {
      // note-2026-09-15-005: a person moved a section, an MCP agent moved it again. The refusal
      // is right; "use the later Undo receipt" was not, because that receipt is the agent's and
      // receipts are scoped to one exact actor.
      const harness = buildHarness();
      const { b } = await three(harness);
      const mine = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.sectionWriteService.move(agentActorFor(0, ['projects.write']), b, 0);

      const refusal = await refusalOf(harness.undoServiceWithEdits.undo(harness.actor, mine.undo!.undoId));

      expect((refusal.details as { conflicts: unknown[] }).conflicts).toContainEqual(
        expect.objectContaining({ problem: 'superseded', nextStep: 'redo-by-hand', supersededBy: 'agent' }),
      );
      expect(refusal.message).toContain('make the change again by hand');
      expect(refusal.message).not.toContain('use the later receipt');
    });

    it('still offers the later receipt when the same person made both moves', async () => {
      const harness = buildHarness();
      const { b } = await three(harness);
      const mine = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.sectionWriteService.move(harness.actor, b, 0);

      const refusal = await refusalOf(harness.undoServiceWithEdits.undo(harness.actor, mine.undo!.undoId));

      expect((refusal.details as { conflicts: unknown[] }).conflicts).toContainEqual(
        expect.objectContaining({ problem: 'superseded', nextStep: 'use-later-receipt', supersededBy: 'self' }),
      );
    });

    it('is not superseded by a later settings change and keeps that change', async () => {
      const harness = buildHarness();
      const { b } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.sectionWriteService.update(harness.actor, b, { title: 'B renamed' });

      await harness.undoServiceWithEdits.undo(harness.actor, move.undo!.undoId);

      expect(await order(harness)).toEqual(['A', 'B renamed', 'C']);
    });

    it('is superseded by a newer move of the same section under a repeated clock value', async () => {
      const harness = buildHarness();
      const { b } = await three(harness);
      const first = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.sectionWriteService.move(harness.actor, b, 0);
      const before = writable(harness);

      const refusal = await refusalOf(harness.undoServiceWithEdits.undo(harness.actor, first.undo!.undoId));

      expect(problemsOf(refusal)).toEqual(['superseded']);
      expect(writable(harness)).toEqual(before);
    });

    it('uses the next neighbour when the previous one is gone', async () => {
      const harness = buildHarness();
      const { a, b } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, b, 2);
      // A, B's previous neighbour, is removed (an empty section is deleted): order is now C, B.
      await harness.sectionWriteService.remove(harness.actor, a);

      const undone = await harness.undoServiceWithEdits.undo(harness.actor, move.undo!.undoId);

      expect(undone).toMatchObject({ operation: 'section.move', placement: { strategy: 'next' } });
      expect(await order(harness)).toEqual(['B', 'C']);
    });

    it('prefers a surviving previous neighbour even after the neighbours were reordered', async () => {
      const harness = buildHarness();
      const { a, b } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.sectionWriteService.move(harness.actor, a, 2);

      const undone = await harness.undoServiceWithEdits.undo(harness.actor, move.undo!.undoId);

      expect(undone).toMatchObject({ operation: 'section.move', placement: { strategy: 'previous' } });
      expect(await order(harness)).toEqual(['C', 'A', 'B']);
    });

    it('keeps an unrelated later insert in place', async () => {
      const harness = buildHarness();
      const { c } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, c, 0);
      await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', title: 'New', position: 0 });

      await harness.undoServiceWithEdits.undo(harness.actor, move.undo!.undoId);

      expect(await order(harness)).toEqual(['New', 'A', 'B', 'C']);
    });
  });

  it('is not found for a different actor in the same workspace, even with projects.write', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });

    await expect(
      harness.undoServiceWithEdits.undo(agentActorFor(0, ['projects.read', 'projects.write']), added.undo.undoId),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect((await harness.undoRecords.find(added.undo.undoId))?.consumedAt).toBeUndefined();
  });

  it('never recovers an edit receipt as an already-removed response', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
    await harness.undoRecorder.record(harness.actor, {
      projectId: MINE,
      label: 'Updated',
      operation: captureSectionUpdate({
        sectionId: added.section.id, projectId: MINE, pageId: added.section.pageId,
        changes: [{ field: 'collapsed', before: false, after: true }],
      }),
    });

    expect(await harness.undoRecorder.outstandingFor(harness.actor, added.section.id)).toBeNull();
  });

  it('treats a clamped move to the current place on a sparse page as a no-op that renumbers nothing', async () => {
    const harness = buildHarness();
    for (const [id, position] of [['section-sparse-a', 3], ['section-sparse-b', 9]] as const) {
      await harness.sections.insert({
        id: id as SectionId, projectId: MINE, pageId: 'page-project-mine' as ProjectSection['pageId'], type: 'rich-text',
        position, columnSpan: 12, collapsed: false, config: {},
        createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z',
      });
    }
    const before = writable(harness);

    const result = await harness.sectionWriteService.move(harness.actor, 'section-sparse-b' as SectionId, 99);

    expect(result.undo).toBeNull();
    expect(writable(harness)).toEqual(before);
  });

  it('restores a cleared title and a replaced config exactly', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'Named', config: { text: 'one', nested: { a: [1, 2] } } });
    const update = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: null, config: { text: 'two' } });

    await harness.undoServiceWithEdits.undo(harness.actor, update.undo!.undoId);

    expect(await harness.sections.find(added.section.id)).toMatchObject({ title: 'Named', config: { text: 'one', nested: { a: [1, 2] } } });
  });
});

/** Slice 33 (Refactor §26.8–10): the deferred edit-inverse preconditions, neighbours and scope. */
describe('section edit Undo acceptance', () => {
  const retainedNotes = async (harness: Harness, projectId = MINE) =>
    harness.sectionWriteService.add(harness.actor, projectId, { type: 'rich-text', title: 'Notes', config: { text: 'Kept prose' } });

  /** One receipt per edit family, each on its own section so no receipt supersedes another. */
  const oneOfEach = async (harness: Harness, projectId = MINE, actor: ActorContext = harness.actor) => {
    const add = await harness.sectionWriteService.add(actor, projectId, { type: 'rich-text', title: 'Added' });
    const updatedSection = await harness.sectionWriteService.add(actor, projectId, { type: 'progress', title: 'Updated' });
    const update = await harness.sectionWriteService.update(actor, updatedSection.section.id, { collapsed: true });
    const movedSection = await harness.sectionWriteService.add(actor, projectId, { type: 'timeline', title: 'Moved' });
    const move = await harness.sectionWriteService.move(actor, movedSection.section.id, 0);
    return { add: add.undo, update: update.undo!, move: move.undo! };
  };

  it('edit Undo refuses a missing page before writing', async () => {
    const harness = buildHarness();
    const receipts = await oneOfEach(harness);
    // A live section on a page that no longer resolves cannot be committed through a service,
    // so the page repository is the double; every other collaborator is the real one.
    const pages = Object.create(harness.pages) as typeof harness.pages;
    pages.find = async () => null;
    const undo = new UndoService({
      undoRecords: harness.undoRecords, sections: harness.sections, shortcuts: harness.shortcuts, pages,
      projects: harness.projects, tasks: harness.tasks, reflections: harness.reflections,
      activity: harness.activity, clock: harness.clock, unitOfWork: unitOfWorkFor(harness.store),
    });
    const before = writable(harness);

    for (const receipt of [receipts.add, receipts.update, receipts.move]) {
      const refusal = await refusalOf(undo.undo(harness.actor, receipt.undoId));
      expect(problemsOf(refusal)).toContain('page-changed');
    }
    expect(writable(harness)).toEqual(before);
  });

  it('update and move refuse archived or page-changed subjects', async () => {
    const archived = buildHarness();
    const notes = await retainedNotes(archived);
    await archived.sectionWriteService.add(archived.actor, MINE, { type: 'progress' });
    const update = await archived.sectionWriteService.update(archived.actor, notes.section.id, { collapsed: true });
    const move = await archived.sectionWriteService.move(archived.actor, notes.section.id, 1);
    // Prose is meaningful, so removal archives rather than deletes it.
    await archived.sectionWriteService.remove(archived.actor, notes.section.id);
    expect((await archived.sections.find(notes.section.id))?.archivedAt).toBeDefined();
    const archivedBefore = writable(archived);

    for (const receipt of [update.undo!, move.undo!]) {
      expect(problemsOf(await refusalOf(archived.undoServiceWithEdits.undo(archived.actor, receipt.undoId)))).toContain('archived-subject');
    }
    expect(writable(archived)).toEqual(archivedBefore);

    const moved = buildHarness();
    const subject = await retainedNotes(moved);
    await moved.sectionWriteService.add(moved.actor, MINE, { type: 'progress' });
    const movedUpdate = await moved.sectionWriteService.update(moved.actor, subject.section.id, { columnSpan: 6 });
    const movedMove = await moved.sectionWriteService.move(moved.actor, subject.section.id, 1);
    // No service moves a section between pages; the corrupted state is written directly.
    const current = (await moved.sections.find(subject.section.id))!;
    await moved.sections.update({ ...current, pageId: 'page-project-theirs' as ProjectSection['pageId'] });
    const movedBefore = writable(moved);

    for (const receipt of [movedUpdate.undo!, movedMove.undo!]) {
      expect(problemsOf(await refusalOf(moved.undoServiceWithEdits.undo(moved.actor, receipt.undoId)))).toEqual(['page-changed']);
    }
    expect(writable(moved)).toEqual(movedBefore);
  });

  it('each edit inverse blocks on an archived ancestor', async () => {
    const harness = buildHarness();
    const child = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId, kind: 'subproject', parentProjectId: MINE, name: 'Kitchen',
    });
    const receipts = await oneOfEach(harness, child.id);
    // A root cannot be archived over an active child; the refusal must name the highest blocker.
    await harness.projectService.archive(harness.actor, child.id);
    await harness.projectService.archive(harness.actor, MINE);
    const before = writable(harness);

    for (const receipt of [receipts.add, receipts.update, receipts.move]) {
      const refusal = await refusalOf(harness.undoServiceWithEdits.undo(harness.actor, receipt.undoId));
      expect(refusal.details).toMatchObject({ reason: 'undo_blocked', blockingProjectId: MINE });
    }
    expect(writable(harness)).toEqual(before);

    await harness.projectService.update(harness.actor, MINE, { status: 'active' });
    await harness.projectService.update(harness.actor, child.id, { status: 'active' });
    for (const receipt of [receipts.add, receipts.update, receipts.move]) {
      await expect(harness.undoServiceWithEdits.undo(harness.actor, receipt.undoId)).resolves.toMatchObject({ undoId: receipt.undoId });
    }
  });

  it('move Undo follows a surviving previous shortcut', async () => {
    const harness = buildHarness();
    const kitchen = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId, kind: 'subproject', parentProjectId: MINE, name: 'Kitchen',
    });
    const source = await harness.sectionWriteService.add(harness.actor, kitchen.id, { type: 'rich-text' });
    const a = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', title: 'A' });
    const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: `page-${MINE}` as never, sourceSectionId: source.section.id,
    });
    const b = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'timeline', title: 'B' });
    const c = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'C' });
    const order = async () => (await listPlacements(harness, `page-${MINE}` as never)).map(({ value }) => value.id);
    expect(await order()).toEqual([a.section.id, shortcut.id, b.section.id, c.section.id]);

    const move = await harness.sectionWriteService.move(harness.actor, b.section.id, 3);
    await harness.sectionShortcutService.move(harness.actor, shortcut.id, 0);
    expect(await order()).toEqual([shortcut.id, a.section.id, c.section.id, b.section.id]);

    const undone = await harness.undoServiceWithEdits.undo(harness.actor, move.undo!.undoId);

    expect(undone).toMatchObject({ operation: 'section.move', placement: { strategy: 'previous', index: 1 } });
    expect(await order()).toEqual([shortcut.id, b.section.id, a.section.id, c.section.id]);
  });

  it('each edit family accepts its system actor and hides foreign-workspace or other-actor receipts', async () => {
    const harness = buildHarness();
    const system: ActorContext = { actor: 'system', workspaceId: harness.actor.workspaceId };
    const receipts = await oneOfEach(harness, MINE, system);
    const before = writable(harness);

    for (const receipt of [receipts.add, receipts.update, receipts.move]) {
      for (const stranger of [harness.actor, actorFor(1), agentActorFor(0, ['projects.read', 'projects.write'])]) {
        await expect(harness.undoServiceWithEdits.undo(stranger, receipt.undoId)).rejects.toBeInstanceOf(EntityNotFoundError);
      }
    }
    expect(writable(harness)).toEqual(before);

    for (const receipt of [receipts.add, receipts.update, receipts.move]) {
      await expect(harness.undoServiceWithEdits.undo(system, receipt.undoId)).resolves.toMatchObject({ undoId: receipt.undoId });
      expect((await harness.undoRecords.find(receipt.undoId))?.consumedAt).toBeDefined();
    }
  });
});

