import { type OperationReceipt, type ProjectSection, type SectionId } from '@cwm/contracts';
import { unitOfWorkFor } from '@cwm/repositories';
import { describe, expect, it } from 'vitest';
import type { ActorContext } from './actor';
import { actorFor, agentActorFor, buildHarness, MINE } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError } from './errors';
import { OperationHistoryService } from './operation-history-service';
import { captureSectionUpdate } from './section-edit-undo';
import { listPlacements } from './page-placements';

type Harness = ReturnType<typeof buildHarness>;

/** Somebody else with write access in the same workspace: their writes never enter the person's history. */
const someoneElse = agentActorFor(0, ['projects.read', 'projects.write']);

const writable = (harness: Harness) => {
  const { sections, tasks, reflections, activityEvents, operationHistories, operationActions, sectionShortcuts } = harness.store.snapshot();
  return { sections, tasks, reflections, activityEvents, operationHistories, operationActions, sectionShortcuts };
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

describe('SectionService edit receipts, Undo and Redo', () => {
  it('records an explicit add; Undo removes only that section and Redo recreates it with the same id and place', async () => {
    const harness = buildHarness();
    const before = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', title: 'Before' });
    const after = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'timeline', title: 'After' });
    await harness.undo(harness.actor, after.operation);

    const added = await harness.sectionWriteService.add(harness.actor, MINE, {
      type: 'rich-text', title: 'Scratch', config: { text: 'temporary' }, position: 1,
    });

    expect(added.operation).toMatchObject({ operation: 'section.add', revision: 4 });
    expect(harness.store.snapshot().operationActions.at(-1)?.operation).toMatchObject({
      type: 'section.add',
      section: added.section,
      placement: { pageId: added.section.pageId, previous: { kind: 'section', id: before.section.id }, index: 1 },
    });

    const undone = await harness.undo(harness.actor, added.operation);
    expect(undone).toEqual({
      operation: 'section.add', outcome: 'removed', sectionId: added.section.id, projectId: MINE, pageId: added.section.pageId,
    });
    expect(await harness.sections.find(added.section.id)).toBeNull();
    expect(harness.store.snapshot().activityEvents.at(-1)?.action).toBe('project.section_addition_undone');

    const redone = await harness.redo(harness.actor, added.operation);
    expect(redone).toMatchObject({
      operation: 'section.add', outcome: 'reapplied',
      section: { ...added.section, updatedAt: expect.any(String) },
      placement: { index: 1, strategy: 'previous' },
    });
    expect((await harness.sectionWriteService.list(harness.actor, MINE)).map(({ id }) => id)).toEqual([before.section.id, added.section.id]);
    expect(harness.store.snapshot().activityEvents.at(-1)?.action).toBe('project.section_addition_redone');
  });

  /**
   * Since Slice 36 an implicit container is **part of the row's own action**, not a `section.add` of
   * its own: one row event, one action, one frame, and one Undo that removes both. What must never
   * appear is a second action, or a second activity event, for the container.
   */
  it('folds implicit row-container creation into the row action rather than recording its own', async () => {
    const harness = buildHarness();
    const eventsBefore = harness.store.snapshot().activityEvents.length;

    const { operation } = await harness.reflectionWriteService.create(harness.actor, {
      projectId: MINE,
      title: 'First reflection',
      body: 'Body',
    });

    const actions = harness.store.snapshot().operationActions;
    expect(actions).toHaveLength(1);
    expect(actions[0]!.id).toBe(operation.actionId);
    expect(actions[0]!.operation.type).toBe('reflection.add');
    if (actions[0]!.operation.type !== 'reflection.add') throw new Error('expected a reflection add record');
    expect(actions[0]!.operation.container?.section.type).toBe('reflections');
    expect(harness.store.snapshot().activityEvents.slice(eventsBefore).map(({ action }) => action)).toEqual([
      'reflection.added',
    ]);
  });

  it('returns no receipt for a true update or move no-op, and a no-op leaves the redo branch standing', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress' });
    const updated = await harness.sectionWriteService.update(harness.actor, added.section.id, { collapsed: true });
    await harness.undo(harness.actor, updated.operation!);
    const section = (await harness.sections.find(added.section.id))!;
    const before = harness.store.snapshot();

    const update = await harness.sectionWriteService.update(harness.actor, added.section.id, {
      config: { ...section.config }, collapsed: section.collapsed, columnSpan: section.columnSpan,
    });
    const move = await harness.sectionWriteService.move(harness.actor, added.section.id, section.position);

    expect(update).toEqual({ section, operation: null });
    expect(move).toEqual({ section, operation: null });
    expect(harness.store.snapshot().activityEvents).toEqual(before.activityEvents);
    expect(harness.store.snapshot().operationActions).toEqual(before.operationActions);
    expect((await harness.operationHistoryService.summary(harness.actor, MINE)).redo?.actionId).toBe(updated.operation!.actionId);
  });

  it('an unrelated later edit to a different field survives Undo and Redo', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });

    const titleUpdate = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: '  Notes  ' });
    await harness.sectionWriteService.update(someoneElse, added.section.id, { columnSpan: 6 });
    const undone = await harness.undo(harness.actor, titleUpdate.operation!);

    expect(undone).toMatchObject({ operation: 'section.update', outcome: 'restored', section: { columnSpan: 6 } });
    expect(undone.operation === 'section.update' ? undone.section.title : undefined).toBeUndefined();

    const redone = await harness.redo(harness.actor, titleUpdate.operation!);
    expect(redone).toMatchObject({ operation: 'section.update', outcome: 'reapplied', section: { title: 'Notes', columnSpan: 6 } });
  });

  it('restores a move in combined section and shortcut order using a surviving neighbour, then reapplies it', async () => {
    const harness = buildHarness();
    const first = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', title: 'First' });
    const second = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'timeline', title: 'Second' });
    const sourceProject = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId, kind: 'subproject', parentProjectId: MINE, name: 'Source',
    });
    const source = await harness.sectionWriteService.add(harness.actor, sourceProject.id, { type: 'rich-text' });
    const home = (await harness.pages.list({ projectId: MINE, kind: 'home' }))[0]!;
    const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, { pageId: home.id, sourceSectionId: source.section.id });
    const order = async () => (await listPlacements(harness, home.id)).map(({ value }) => value.id);

    const moved = await harness.sectionWriteService.move(harness.actor, second.section.id, 0);
    const undone = await harness.undo(harness.actor, moved.operation!);

    expect(undone).toMatchObject({ operation: 'section.move', outcome: 'restored', placement: { strategy: 'previous', index: 1 } });
    expect(await order()).toEqual([first.section.id, second.section.id, shortcut.id]);

    const redone = await harness.redo(harness.actor, moved.operation!);
    expect(redone).toMatchObject({ operation: 'section.move', outcome: 'reapplied', placement: { index: 0 } });
    expect(await order()).toEqual([second.section.id, first.section.id, shortcut.id]);
  });

  it('refuses add Undo when a later row references the new container and keeps the action next', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'task-list' });
    // The row is created by an **agent**, whose writes record into its own history (Slice 36 gave
    // row writes actions too). That keeps the section add the next undo step in the person's stack
    // while still leaving a real later dependent on the container.
    await harness.taskService.create(agentActorFor(0, ['tasks.write']), {
      projectId: MINE,
      sectionId: added.section.id,
      title: 'Keep me',
    });
    const before = writable(harness);

    const refusal = await refusalOf(harness.undo(harness.actor, added.operation));

    expect(refusal.message).toMatch(/^history_conflict:/);
    expect(refusal.details).toMatchObject({
      reason: 'history_conflict',
      conflicts: [expect.objectContaining({ entityType: 'task', problem: 'new-dependent' })],
      summary: { revision: added.operation.revision, undo: { actionId: added.operation.actionId } },
    });
    expect(writable(harness)).toEqual(before);
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
      archiveGeneration: 0,
      createdAt: '2026-08-01T16:00:00.000Z',
      updatedAt: '2026-08-01T16:00:00.000Z',
    };
    await harness.sections.insert(section);

    const update = await harness.sectionWriteService.update(harness.actor, section.id, { title: 'Named' });
    await harness.undo(harness.actor, update.operation!);

    expect(await harness.sections.find(section.id)).not.toHaveProperty('title');
  });

  describe('forward writes roll back with a failed recorder', () => {
    const failing = () => buildHarness(undefined, {
      recorder: (real) => ({
        record: () => Promise.reject(new Error('recorder unavailable')),
        outstandingRemovalFor: (actor, sectionId, section) => real.outstandingRemovalFor(actor, sectionId, section),
      }),
    });

    it.each([
      ['add', (harness: Harness) => harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', position: 0 })],
      ['update', (harness: Harness) => harness.sectionWriteService.update(harness.actor, 'section-b' as SectionId, { title: 'Renamed', columnSpan: 6 })],
      ['move', (harness: Harness) => harness.sectionWriteService.move(harness.actor, 'section-b' as SectionId, 0)],
    ] as const)('%s leaves sections, positions, activity and history unchanged', async (_, act) => {
      const harness = failing();
      for (const [id, position] of [['section-a', 0], ['section-b', 1]] as const) {
        await harness.sections.insert({
          id: id as SectionId, projectId: MINE, pageId: 'page-project-mine' as ProjectSection['pageId'], type: 'rich-text',
          title: id, position, columnSpan: 12, collapsed: false, config: {}, archiveGeneration: 0,
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

  it('records one action and event per changed operation; each transition adds one event and no action', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
    const events = harness.store.snapshot().activityEvents.length;
    const actions = harness.store.snapshot().operationActions.length;

    const updated = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: 'Once', collapsed: true });
    expect(harness.store.snapshot().activityEvents.length).toBe(events + 1);
    expect(harness.store.snapshot().operationActions.length).toBe(actions + 1);
    expect(harness.store.snapshot().operationActions.at(-1)?.operation).toMatchObject({
      type: 'section.update',
      changes: [
        { field: 'title', before: null, after: 'Once' },
        { field: 'collapsed', before: false, after: true },
      ],
    });

    await harness.undo(harness.actor, updated.operation!);
    expect(harness.store.snapshot().activityEvents.length).toBe(events + 2);
    expect(harness.store.snapshot().activityEvents.at(-1)?.action).toBe('project.section_update_undone');
    expect(harness.store.snapshot().operationActions.length).toBe(actions + 1);
    expect((await harness.operationActions.find(updated.operation!.actionId))?.state).toBe('undone');

    await harness.redo(harness.actor, updated.operation!);
    expect(harness.store.snapshot().activityEvents.at(-1)).toMatchObject({ action: 'project.section_update_redone', summary: 'Redid updating the Once section' });
    expect((await harness.operationActions.find(updated.operation!.actionId))?.state).toBe('applied');
  });

  it('treats a config with reordered keys as a no-op', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', config: { text: 'a', tone: 'calm' } });
    const before = writable(harness);

    const result = await harness.sectionWriteService.update(harness.actor, added.section.id, { config: { tone: 'calm', text: 'a' } });

    expect(result.operation).toBeNull();
    expect(writable(harness)).toEqual(before);
  });

  describe('add inverse refuses once removal would destroy later work', () => {
    it('refuses after someone else changed the section config, without deleting it', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', config: { text: 'initial' } });
      await harness.sectionWriteService.update(someoneElse, added.section.id, { config: { text: 'authored later' } });
      const before = writable(harness);

      const refusal = await refusalOf(harness.undo(harness.actor, added.operation));

      expect(problemsOf(refusal)).toEqual(['field-changed']);
      expect(refusal.details).toMatchObject({ conflicts: [{ nextStep: 'change-by-hand' }] });
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

      const refusal = await refusalOf(harness.undo(harness.actor, added.operation));

      expect(refusal.details).toMatchObject({
        conflicts: [expect.objectContaining({ entityType: 'shortcut', problem: 'shortcut-reference', nextStep: 'remove-reference-and-retry' })],
      });
      expect(writable(harness)).toEqual(before);
    });

    it('is blocked while the owning project is archived', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      await harness.projectService.update(someoneElse, MINE, { status: 'archived' });

      const refusal = await refusalOf(harness.undo(harness.actor, added.operation));

      expect(refusal.details).toMatchObject({ reason: 'history_blocked', blockingProjectId: MINE });
      expect(await harness.sections.find(added.section.id)).not.toBeNull();
    });
  });

  describe('update footprint', () => {
    it('another actor’s overlapping edit refuses with a typed conflict and writes nothing', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      const mine = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: 'Mine' });
      await harness.sectionWriteService.update(someoneElse, added.section.id, { title: 'Theirs' });
      const before = writable(harness);

      const refusal = await refusalOf(harness.undo(harness.actor, mine.operation!));

      expect(refusal.details).toMatchObject({
        reason: 'history_conflict',
        conflicts: [{ entityType: 'section', id: added.section.id, title: 'Theirs', problem: 'field-changed', nextStep: 'change-by-hand' }],
        summary: { revision: mine.operation!.revision },
      });
      expect(writable(harness)).toEqual(before);
    });

    it('allows Undo once another actor changed the field back — applied state, not supersession, decides', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      const mine = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: 'A' });
      await harness.sectionWriteService.update(someoneElse, added.section.id, { title: 'B' });
      await harness.sectionWriteService.update(someoneElse, added.section.id, { title: 'A' });

      await expect(harness.undo(harness.actor, mine.operation!)).resolves.toMatchObject({ operation: 'section.update' });
      expect((await harness.sections.find(added.section.id))?.title).toBeUndefined();
    });

    it('refuses when a touched field changed outside any service', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      const update = await harness.sectionWriteService.update(harness.actor, added.section.id, { columnSpan: 6, collapsed: true });
      const current = (await harness.sections.find(added.section.id))!;
      await harness.sections.update({ ...current, columnSpan: 4 });

      const refusal = await refusalOf(harness.undo(harness.actor, update.operation!));

      expect(problemsOf(refusal)).toEqual(['field-changed']);
      expect(await harness.sections.find(added.section.id)).toMatchObject({ columnSpan: 4, collapsed: true });
    });

    it('Redo refuses when the field changed after the Undo', async () => {
      const harness = buildHarness();
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      const update = await harness.sectionWriteService.update(harness.actor, added.section.id, { collapsed: true });
      await harness.undo(harness.actor, update.operation!);
      await harness.sectionWriteService.update(someoneElse, added.section.id, { collapsed: true });

      const refusal = await refusalOf(harness.redo(harness.actor, update.operation!));

      expect(refusal.details).toMatchObject({ reason: 'history_conflict', conflicts: [{ problem: 'field-changed' }] });
    });

    it('is not blocked by someone else’s later move, and keeps the moved position', async () => {
      const harness = buildHarness();
      await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress' });
      const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
      const update = await harness.sectionWriteService.update(harness.actor, added.section.id, { collapsed: true });
      await harness.sectionWriteService.move(someoneElse, added.section.id, 0);

      const undone = await harness.undo(harness.actor, update.operation!);

      expect(undone).toMatchObject({ operation: 'section.update', section: { collapsed: false, position: 0 } });
    });
  });

  describe('move footprint', () => {
    const three = async (harness: Harness) => {
      const a = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'progress', title: 'A' });
      const b = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'timeline', title: 'B' });
      const c = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'C', config: { text: 'Keep' } });
      return { a: a.section.id, b: b.section.id, c: c.section.id };
    };
    const order = async (harness: Harness) =>
      (await harness.sectionWriteService.list(harness.actor, MINE)).map(({ title }) => title);

    it('refuses as moved when an agent moved the section again, never pointing at a receipt it cannot use', async () => {
      // note-2026-09-15-005: a person moved a section, an MCP agent moved it again.
      const harness = buildHarness();
      const { b } = await three(harness);
      const mine = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.sectionWriteService.move(someoneElse, b, 0);
      const before = writable(harness);

      const refusal = await refusalOf(harness.undo(harness.actor, mine.operation!));

      expect(refusal.details).toMatchObject({ conflicts: [{ problem: 'moved', nextStep: 'move-back-and-retry' }] });
      expect(refusal.message).not.toContain('receipt');
      expect(writable(harness)).toEqual(before);
    });

    it('a move whose section has since been moved refuses on neighbours, not on index', async () => {
      const harness = buildHarness();
      const { c } = await three(harness);
      const { b } = { b: (await harness.sectionWriteService.list(harness.actor, MINE))[1]!.id };
      const mine = await harness.sectionWriteService.move(harness.actor, b, 2);
      expect(await order(harness)).toEqual(['A', 'C', 'B']);
      // B keeps index 2, but its recorded previous neighbour C is no longer beside it.
      await harness.sectionWriteService.move(someoneElse, c, 0);
      expect(await order(harness)).toEqual(['C', 'A', 'B']);

      const refusal = await refusalOf(harness.undo(harness.actor, mine.operation!));

      expect(problemsOf(refusal)).toEqual(['moved']);
    });

    it('is not blocked by someone else’s later settings change and keeps that change', async () => {
      const harness = buildHarness();
      const { b } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.sectionWriteService.update(someoneElse, b, { title: 'B renamed' });

      await harness.undo(harness.actor, move.operation!);

      expect(await order(harness)).toEqual(['A', 'B renamed', 'C']);
    });

    it('uses the next neighbour when the previous one is gone', async () => {
      const harness = buildHarness();
      const { a, b } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, b, 2);
      // A, B's previous neighbour, is removed by someone else (an empty view is deleted): order is now C, B.
      await harness.sectionWriteService.remove(someoneElse, a);

      const undone = await harness.undo(harness.actor, move.operation!);

      expect(undone).toMatchObject({ operation: 'section.move', outcome: 'restored', placement: { strategy: 'next' } });
      expect(await order(harness)).toEqual(['B', 'C']);
    });

    it('move Undo reports partial placement when the exact original location is gone', async () => {
      const harness = buildHarness();
      const { a, b, c } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.sectionWriteService.remove(someoneElse, a);
      await harness.sectionWriteService.remove(someoneElse, c);
      const extra = await harness.sectionWriteService.add(someoneElse, MINE, { type: 'timeline', title: 'X', position: 0 });

      const undone = await harness.undo(harness.actor, move.operation!);

      expect(undone).toMatchObject({ operation: 'section.move', outcome: 'partial', placement: { strategy: 'index', index: 1 } });
      expect(await order(harness)).toEqual(['X', 'B']);
      expect(extra.section.id).toBeDefined();
    });

    it('prefers a surviving previous neighbour even after the neighbours were reordered', async () => {
      const harness = buildHarness();
      const { a, b } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.sectionWriteService.move(someoneElse, a, 2);

      const undone = await harness.undo(harness.actor, move.operation!);

      expect(undone).toMatchObject({ operation: 'section.move', placement: { strategy: 'previous' } });
      expect(await order(harness)).toEqual(['C', 'A', 'B']);
    });

    it('judges where a transition left the section by the neighbour it placed it by, so Redo follows its own Undo', async () => {
      const harness = buildHarness();
      const ids: Record<string, SectionId> = {};
      for (const title of ['P', 'S', 'N', 'X', 'Y']) {
        ids[title] = (await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title })).section.id;
      }
      const move = await harness.sectionWriteService.move(harness.actor, ids['S']!, 4);
      // Someone else puts X between P and N; S's recorded next neighbour N is no longer after P.
      await harness.sectionWriteService.move(someoneElse, ids['X']!, 1);
      expect(await order(harness)).toEqual(['P', 'X', 'N', 'Y', 'S']);

      await harness.undo(harness.actor, move.operation!);
      // Placed after its surviving previous neighbour; N is not beside it, and was not used.
      expect(await order(harness)).toEqual(['P', 'S', 'X', 'N', 'Y']);

      await expect(harness.redo(harness.actor, move.operation!)).resolves.toMatchObject({ operation: 'section.move', outcome: 'reapplied' });
      expect(await order(harness)).toEqual(['P', 'X', 'N', 'Y', 'S']);
      await harness.undo(harness.actor, move.operation!);
      expect(await order(harness)).toEqual(['P', 'S', 'X', 'N', 'Y']);
    });

    it('still refuses when the section left the neighbour it was placed by', async () => {
      const harness = buildHarness();
      const { a, b } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, b, 2);
      await harness.undo(harness.actor, move.operation!);
      // B sits after A; someone moves A away, so B is no longer where Undo put it.
      await harness.sectionWriteService.move(someoneElse, a, 2);
      expect(await order(harness)).toEqual(['B', 'C', 'A']);

      expect(problemsOf(await refusalOf(harness.redo(harness.actor, move.operation!)))).toEqual(['moved']);
    });

    it('keeps an unrelated later insert in place', async () => {
      const harness = buildHarness();
      const { c } = await three(harness);
      const move = await harness.sectionWriteService.move(harness.actor, c, 0);
      await harness.sectionWriteService.add(someoneElse, MINE, { type: 'progress', title: 'New', position: 0 });

      await harness.undo(harness.actor, move.operation!);

      expect(await order(harness)).toEqual(['New', 'A', 'B', 'C']);
    });
  });

  it('is not found for a different actor in the same workspace, even with projects.write', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
    const before = writable(harness);

    await expect(harness.undo(someoneElse, added.operation)).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(writable(harness)).toEqual(before);
  });

  it('never recovers an edit receipt as an already-removed response', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text' });
    await harness.store.runUnitOfWork(() => harness.historyRecorder.record(harness.actor, {
      projectId: MINE,
      label: 'Updated',
      operation: captureSectionUpdate({
        sectionId: added.section.id, projectId: MINE, pageId: added.section.pageId,
        changes: [{ field: 'collapsed', before: false, after: true }],
      }),
    }));

    expect(await harness.historyRecorder.outstandingRemovalFor(harness.actor, added.section.id, added.section)).toBeNull();
  });

  it('treats a clamped move to the current place on a sparse page as a no-op that renumbers nothing', async () => {
    const harness = buildHarness();
    for (const [id, position] of [['section-sparse-a', 3], ['section-sparse-b', 9]] as const) {
      await harness.sections.insert({
        id: id as SectionId, projectId: MINE, pageId: 'page-project-mine' as ProjectSection['pageId'], type: 'rich-text',
        position, columnSpan: 12, collapsed: false, config: {}, archiveGeneration: 0,
        createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z',
      });
    }
    const before = writable(harness);

    const result = await harness.sectionWriteService.move(harness.actor, 'section-sparse-b' as SectionId, 99);

    expect(result.operation).toBeNull();
    expect(writable(harness)).toEqual(before);
  });

  it('restores a cleared title and a replaced config exactly, and reapplies them', async () => {
    const harness = buildHarness();
    const added = await harness.sectionWriteService.add(harness.actor, MINE, { type: 'rich-text', title: 'Named', config: { text: 'one', nested: { a: [1, 2] } } });
    const update = await harness.sectionWriteService.update(harness.actor, added.section.id, { title: null, config: { text: 'two' } });

    await harness.undo(harness.actor, update.operation!);
    expect(await harness.sections.find(added.section.id)).toMatchObject({ title: 'Named', config: { text: 'one', nested: { a: [1, 2] } } });

    await harness.redo(harness.actor, update.operation!);
    const redone = await harness.sections.find(added.section.id);
    expect(redone).not.toHaveProperty('title');
    expect(redone?.config).toEqual({ text: 'two' });
  });
});

/** Slice 33 (Refactor §26.8–10), on the Slice 35 cursor: edit-inverse preconditions, neighbours and scope. */
describe('section edit history acceptance', () => {
  /** One receipt of the named family, alone in a fresh harness so it is the next Undo. */
  const family = async (harness: Harness, kind: 'add' | 'update' | 'move', projectId = MINE, actor: ActorContext = harness.actor): Promise<OperationReceipt> => {
    await harness.sectionWriteService.add(someoneElse, projectId, { type: 'progress', title: 'Neighbour' });
    const subject = await harness.sectionWriteService.add(actor, projectId, { type: 'rich-text', title: 'Subject', config: { text: 'Kept prose' } });
    if (kind === 'add') return subject.operation;
    if (kind === 'update') return (await harness.sectionWriteService.update(actor, subject.section.id, { collapsed: true })).operation!;
    return (await harness.sectionWriteService.move(actor, subject.section.id, 0)).operation!;
  };

  it.each(['add', 'update', 'move'] as const)('%s Undo refuses a missing page before writing', async (kind) => {
    const harness = buildHarness();
    const receipt = await family(harness, kind);
    // A live section on a page that no longer resolves cannot be committed through a service,
    // so the page repository is the double; every other collaborator is the real one.
    const pages = Object.create(harness.pages) as typeof harness.pages;
    pages.find = async () => null;
    const history = new OperationHistoryService({
      histories: harness.operationHistories, actions: harness.operationActions, sections: harness.sections,
      shortcuts: harness.shortcuts, pages, projects: harness.projects, tasks: harness.tasks, reflections: harness.reflections,
      activity: harness.activity, clock: harness.clock, unitOfWork: unitOfWorkFor(harness.store),
    });
    const before = writable(harness);

    const refusal = await refusalOf(history.transition(harness.actor, receipt.historyId, {
      actionId: receipt.actionId, direction: 'undo', expectedRevision: receipt.revision,
    }));

    expect(problemsOf(refusal)).toContain('page-changed');
    expect(writable(harness)).toEqual(before);
  });

  it.each(['update', 'move'] as const)('%s refuses an archived or page-changed subject', async (kind) => {
    const archived = buildHarness();
    const receipt = await family(archived, kind);
    const subject = (await archived.sections.list({ projectId: MINE })).find(({ title }) => title === 'Subject')!;
    // Prose is meaningful, so removal archives rather than deletes it.
    await archived.sectionWriteService.remove(someoneElse, subject.id);
    const archivedBefore = writable(archived);

    expect(problemsOf(await refusalOf(archived.undo(archived.actor, receipt)))).toEqual(['archived-subject']);
    expect(writable(archived)).toEqual(archivedBefore);

    const moved = buildHarness();
    const movedReceipt = await family(moved, kind);
    const movedSubject = (await moved.sections.list({ projectId: MINE })).find(({ title }) => title === 'Subject')!;
    // No service moves a section between pages; the corrupted state is written directly.
    await moved.sections.update({ ...movedSubject, pageId: 'page-project-theirs' as ProjectSection['pageId'] });
    const movedBefore = writable(moved);

    expect(problemsOf(await refusalOf(moved.undo(moved.actor, movedReceipt)))).toContain('page-changed');
    expect(writable(moved)).toEqual(movedBefore);
  });

  it('each edit family blocks on an archived ancestor in both directions, naming the highest one', async () => {
    const harness = buildHarness();
    const child = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId, kind: 'subproject', parentProjectId: MINE, name: 'Kitchen',
    });
    const add = await harness.sectionWriteService.add(harness.actor, child.id, { type: 'rich-text', title: 'Added' });
    const update = await harness.sectionWriteService.update(harness.actor, add.section.id, { collapsed: true });
    await harness.sectionWriteService.add(someoneElse, child.id, { type: 'progress' });
    const move = await harness.sectionWriteService.move(harness.actor, add.section.id, 1);
    // A root cannot be archived over an active child; the refusal must name the highest blocker.
    await harness.projectService.archive(someoneElse, child.id);
    await harness.projectService.archive(someoneElse, MINE);
    const before = writable(harness);

    const refusal = await refusalOf(harness.undo(harness.actor, move.operation!));
    expect(refusal.details).toMatchObject({ reason: 'history_blocked', blockingProjectId: MINE, summary: { blockedBy: { projectId: MINE } } });
    expect(writable(harness)).toEqual(before);

    await harness.projectService.update(someoneElse, MINE, { status: 'active' });
    await harness.projectService.update(someoneElse, child.id, { status: 'active' });
    for (const receipt of [move.operation!, update.operation!, add.operation]) await harness.undo(harness.actor, receipt);
    await harness.projectService.archive(someoneElse, child.id);
    const redo = await refusalOf(harness.redo(harness.actor, add.operation));
    expect(redo.details).toMatchObject({ reason: 'history_blocked', blockingProjectId: child.id });
    await harness.projectService.update(someoneElse, child.id, { status: 'active' });
    for (const receipt of [add.operation, update.operation!, move.operation!]) await harness.redo(harness.actor, receipt);
    expect(await harness.sections.find(add.section.id)).toMatchObject({ collapsed: true, position: 1 });
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
    // Moved by **someone else**, so it lands in their history rather than on top of this actor's
    // move: a placement change by another actor must not wedge a section Undo that still fits.
    await harness.sectionShortcutService.move(someoneElse, shortcut.id, 0);
    expect(await order()).toEqual([shortcut.id, a.section.id, c.section.id, b.section.id]);

    const undone = await harness.undo(harness.actor, move.operation!);

    expect(undone).toMatchObject({ operation: 'section.move', placement: { strategy: 'previous', index: 1 } });
    expect(await order()).toEqual([shortcut.id, b.section.id, a.section.id, c.section.id]);
  });

  it('each edit family works for its system actor and hides that history from every other actor', async () => {
    const harness = buildHarness();
    const system: ActorContext = { actor: 'system', workspaceId: harness.actor.workspaceId };
    const add = await harness.sectionWriteService.add(system, MINE, { type: 'rich-text', title: 'Added' });
    const update = await harness.sectionWriteService.update(system, add.section.id, { collapsed: true });
    await harness.sectionWriteService.add(someoneElse, MINE, { type: 'progress' });
    const move = await harness.sectionWriteService.move(system, add.section.id, 1);
    const before = writable(harness);

    for (const stranger of [harness.actor, actorFor(1), someoneElse]) {
      await expect(harness.undo(stranger, move.operation!)).rejects.toBeInstanceOf(EntityNotFoundError);
    }
    expect((await harness.operationHistoryService.summary(harness.actor, MINE)).historyId).toBeNull();
    expect(writable(harness)).toEqual(before);

    for (const receipt of [move.operation!, update.operation!, add.operation]) {
      await expect(harness.undo(system, receipt)).resolves.toMatchObject({ operation: receipt.operation });
    }
    expect((await harness.operationHistoryService.summary(system, MINE)).undo).toBeNull();
  });
});
