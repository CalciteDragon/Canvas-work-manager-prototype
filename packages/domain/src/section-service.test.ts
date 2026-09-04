import { ProjectSectionSchema, type SectionId } from '@cwm/contracts';
import { InMemoryDataStore } from '@cwm/repositories';
import { describe, expect, it } from 'vitest';
import { buildHarness, MINE, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError } from './errors';

const NOW = '2026-08-24T16:00:00.000Z';

type Harness = ReturnType<typeof buildHarness>;

const add = (harness: Harness, type = 'rich-text', overrides = {}) =>
  harness.sectionService.add(harness.actor, MINE, { type, ...overrides });

/** Three sections in one project, in the order they were added. */
const withThree = async (harness: Harness) => [
  await add(harness, 'rich-text'),
  await add(harness, 'task-list'),
  await add(harness, 'progress'),
];

const positions = async (harness: Harness) =>
  (await harness.sectionService.list(harness.actor, MINE)).map((section) => [section.type, section.position]);

describe('SectionService.add', () => {
  it('appends at the end with the caller’s config and clock timestamps', async () => {
    const harness = buildHarness();

    const first = await add(harness, 'rich-text', { config: { text: 'Kickoff notes' } });
    const second = await add(harness, 'task-list');

    expect(() => ProjectSectionSchema.parse(first)).not.toThrow();
    expect(first).toMatchObject({
      id: 'section-1',
      projectId: MINE,
      type: 'rich-text',
      position: 0,
      columnSpan: 12,
      collapsed: false,
      config: { text: 'Kickoff notes' },
      createdAt: NOW,
      updatedAt: NOW,
    });
    // The registry lives in Angular and carries a `Type<unknown>`; the domain cannot see
    // `createDefaultConfig`, so an unconfigured section gets an empty object, not a guess.
    expect(second).toMatchObject({ position: 1, config: {} });
  });

  it('accepts a frame title override and a §27 column span', async () => {
    const harness = buildHarness();

    const section = await add(harness, 'task-list', { title: 'This week', columnSpan: 6 });

    expect(section).toMatchObject({ title: 'This week', columnSpan: 6 });
  });

  it('normalises a name a caller passed without going through a write input schema', async () => {
    // `SectionTitleSchema` guards HTTP and MCP, but the domain package is a public API a
    // test or a future caller can reach with a structurally typed string. Blank means
    // absent, exactly as it does through the wire.
    const harness = buildHarness();

    expect((await add(harness, 'task-list', { title: '  This week  ' })).title).toBe('This week');
    expect((await add(harness, 'task-list', { title: '   ' })).title).toBeUndefined();
  });
});

describe('SectionService.list', () => {
  it('answers one project’s sections in position order, whatever order they were written', async () => {
    const harness = buildHarness();
    const [first, , third] = await withThree(harness);
    await harness.sectionService.move(harness.actor, third.id, 0);
    await harness.sectionService.add(harness.actor, THEIRS, { type: 'rich-text' }).catch(() => undefined);

    expect(await positions(harness)).toEqual([
      ['progress', 0],
      ['rich-text', 1],
      ['task-list', 2],
    ]);
    expect((await harness.sectionService.list(harness.actor, MINE)).map(({ id }) => id)).toContain(first.id);
  });
});

describe('SectionService.update', () => {
  it('changes title, columnSpan, collapsed and config independently', async () => {
    const harness = buildHarness();
    const section = await add(harness, 'rich-text', { title: 'Notes', config: { text: 'one' } });

    const collapsed = await harness.sectionService.update(harness.actor, section.id, { collapsed: true });
    expect(collapsed).toMatchObject({ title: 'Notes', collapsed: true, config: { text: 'one' } });

    const resized = await harness.sectionService.update(harness.actor, section.id, { columnSpan: 8 });
    expect(resized).toMatchObject({ columnSpan: 8, collapsed: true });

    // Replace whole, not merge: the section definition owns the keys, so the domain has no
    // basis for deciding which of them a partial write meant to keep.
    const reconfigured = await harness.sectionService.update(harness.actor, section.id, {
      config: { text: 'two' },
    });
    expect(reconfigured.config).toEqual({ text: 'two' });
  });

  it('clears a frame title override with null and leaves it alone when absent', async () => {
    const harness = buildHarness();
    const section = await add(harness, 'rich-text', { title: 'Notes' });

    expect((await harness.sectionService.update(harness.actor, section.id, { collapsed: true })).title).toBe('Notes');
    expect((await harness.sectionService.update(harness.actor, section.id, { title: null })).title).toBeUndefined();
  });

  it('treats a blank name as the same clear that null is', async () => {
    const harness = buildHarness();
    const section = await add(harness, 'rich-text', { title: 'Notes' });

    expect((await harness.sectionService.update(harness.actor, section.id, { title: '  Ideas ' })).title).toBe('Ideas');
    expect((await harness.sectionService.update(harness.actor, section.id, { title: '   ' })).title).toBeUndefined();
  });
});

describe('SectionService.move', () => {
  it('renumbers the project’s sections densely, leaving no gap and no duplicate', async () => {
    const harness = buildHarness();
    const [, , third] = await withThree(harness);

    await harness.sectionService.move(harness.actor, third.id, 1);

    expect(await positions(harness)).toEqual([
      ['rich-text', 0],
      ['progress', 1],
      ['task-list', 2],
    ]);
  });

  it('clamps a position past the end rather than leaving a gap', async () => {
    const harness = buildHarness();
    const [first] = await withThree(harness);

    await harness.sectionService.move(harness.actor, first.id, 99);

    expect(await positions(harness)).toEqual([
      ['task-list', 0],
      ['progress', 1],
      ['rich-text', 2],
    ]);
  });
});

describe('SectionService.duplicate', () => {
  it('copies a section directly below the original, with a new id and a detached config', async () => {
    const harness = buildHarness();
    const [first] = await withThree(harness);
    await harness.sectionService.update(harness.actor, first.id, { config: { text: 'original' } });

    const copy = await harness.sectionService.duplicate(harness.actor, first.id);

    expect(copy.id).not.toBe(first.id);
    expect(copy).toMatchObject({ type: 'rich-text', position: 1, config: { text: 'original' } });
    // A shared reference would make editing the copy silently edit the original.
    await harness.sectionService.update(harness.actor, copy.id, { config: { text: 'changed' } });
    expect((await harness.sectionService.get(harness.actor, first.id)).config).toEqual({ text: 'original' });
    expect(await positions(harness)).toEqual([
      ['rich-text', 0],
      ['rich-text', 1],
      ['task-list', 2],
      ['progress', 3],
    ]);
  });
});

describe('SectionService.remove', () => {
  it('deletes the section and closes the position gap', async () => {
    const harness = buildHarness();
    const [, second] = await withThree(harness);

    await harness.sectionService.remove(harness.actor, second.id);

    await expect(harness.sectionService.get(harness.actor, second.id)).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(await positions(harness)).toEqual([
      ['rich-text', 0],
      ['progress', 1],
    ]);
  });

  it('removes a section without orphaning its activity events', async () => {
    const harness = buildHarness();
    const section = await add(harness);
    await harness.sectionService.update(harness.actor, section.id, { collapsed: true });

    await harness.sectionService.remove(harness.actor, section.id);

    // `validateDocumentIntegrity` runs at the close of every unit of work *and* when a
    // document is loaded, and it resolves each event's target. Events recorded against the
    // section itself would have made this remove roll itself back, and would then have
    // failed every later boot — which is what re-loading the snapshot here stands in for.
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
    expect(harness.store.snapshot().activityEvents).not.toHaveLength(0);
  });

  it('refuses a non-empty container with a typed reason and a live-only count', async () => {
    const harness = buildHarness();
    const live = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ship it' });
    const archived = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Done with' });
    await harness.taskService.archive(harness.actor, archived.id);

    const refusal = await harness.sectionService
      .remove(harness.actor, live.sectionId)
      .then(() => null, (error: unknown) => error);

    // The count travels as data rather than inside a sentence, so the canvas can compose its
    // own question — and it counts what is *live*, since an archived row is already unrendered.
    expect(refusal).toBeInstanceOf(DomainRuleError);
    expect((refusal as DomainRuleError).details).toEqual({ reason: 'section_not_empty', liveRowCount: 1 });
    // The sentence stays, for MCP and `curl` callers with no UI to compose one.
    expect((refusal as DomainRuleError).message).toContain('holds 1 tasks');
  });

  it('is not idempotent — removing twice is not found', async () => {
    const harness = buildHarness();
    const section = await add(harness);
    await harness.sectionService.remove(harness.actor, section.id);

    await expect(harness.sectionService.remove(harness.actor, section.id)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe('section activity (§57)', () => {
  it('records one event per mutation, against the owning project', async () => {
    const harness = buildHarness();
    const section = await add(harness, 'rich-text', { title: 'Notes' });
    await add(harness, 'task-list');
    await harness.sectionService.update(harness.actor, section.id, { collapsed: true });
    // A real move: with a sibling present, position 1 is somewhere the section is not.
    await harness.sectionService.move(harness.actor, section.id, 1);
    const copy = await harness.sectionService.duplicate(harness.actor, section.id);
    await harness.sectionService.remove(harness.actor, copy.id);

    const events = harness.store.snapshot().activityEvents;
    expect(events.map((event) => event.action)).toEqual([
      'project.section_added',
      'project.section_added',
      'project.section_updated',
      'project.section_moved',
      'project.section_added',
      'project.section_removed',
    ]);
    // Every one targets the project — see the remove test above for why that is structural.
    for (const event of events) {
      expect(event).toMatchObject({ entityType: 'project', entityId: MINE, projectId: MINE, actor: 'user' });
    }
    expect(events[0]!.summary).toContain('Notes');
  });

  it('names an untitled section by its default rather than by its type', async () => {
    // §14 expects people to open `data.json` and read it. `summary` is the only place that
    // line exists — the feed composes its own from the entry's parts
    // (docs/decisions/2026-08-activity-summary-ownership.md), so this changes no pixel.
    const harness = buildHarness();
    const section = await add(harness, 'task-list');

    await harness.sectionService.remove(harness.actor, section.id);

    const summaries = harness.store.snapshot().activityEvents.map((event) => event.summary);
    expect(summaries).toContain('Added the Task List section');
    expect(summaries).toContain('Removed the Task List section');
  });

  it('records nothing for an update that changes nothing', async () => {
    const harness = buildHarness();
    const section = await add(harness, 'rich-text', { title: 'Notes' });
    const before = harness.store.snapshot().activityEvents.length;

    const same = await harness.sectionService.update(harness.actor, section.id, { title: 'Notes' });

    expect(same.updatedAt).toBe(section.updatedAt);
    expect(harness.store.snapshot().activityEvents).toHaveLength(before);
  });

  it('records nothing for a move that changes no position', async () => {
    const harness = buildHarness();
    const [first] = await withThree(harness);
    const before = harness.store.snapshot().activityEvents.length;

    await harness.sectionService.move(harness.actor, first.id, 0);

    expect(harness.store.snapshot().activityEvents).toHaveLength(before);
  });
});

describe('section workspace scoping (§16)', () => {
  it('refuses every mutation against a project in another workspace', async () => {
    const harness = buildHarness();

    await expect(harness.sectionService.add(harness.actor, THEIRS, { type: 'rich-text' })).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    await expect(harness.sectionService.list(harness.actor, THEIRS)).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it.each([
    ['get', (harness: Harness, id: SectionId) => harness.sectionService.get(harness.other, id)],
    ['update', (harness: Harness, id: SectionId) => harness.sectionService.update(harness.other, id, { collapsed: true })],
    ['move', (harness: Harness, id: SectionId) => harness.sectionService.move(harness.other, id, 0)],
    ['duplicate', (harness: Harness, id: SectionId) => harness.sectionService.duplicate(harness.other, id)],
    ['remove', (harness: Harness, id: SectionId) => harness.sectionService.remove(harness.other, id)],
  ])('answers not-found rather than forbidden when %s names a foreign section', async (_name, call) => {
    const harness = buildHarness();
    const section = await add(harness);

    // Not-found, not a rule violation: a 409 would confirm the section exists.
    await expect(call(harness, section.id)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe('SectionService on a sparsely numbered project', () => {
  /** §14 makes `data.json` hand-editable, so dense positions are a convention, not a given. */
  const sparse = async (harness: Harness) => {
    const [first, second, third] = await withThree(harness);
    for (const [section, position] of [[first, 0], [second, 5], [third, 7]] as const) {
      await harness.sections.update({ ...section, position });
    }
    return [first, second, third];
  };

  it('duplicates the section the caller named, in place, rather than at its position index', async () => {
    const harness = buildHarness();
    const [, second] = await sparse(harness);

    const copy = await harness.sectionService.duplicate(harness.actor, second.id);

    // Indexing by `position` would splice past the end of a three-element array and leave
    // the pair below `progress`.
    expect(await positions(harness)).toEqual([
      ['rich-text', 0],
      ['task-list', 1],
      ['task-list', 2],
      ['progress', 3],
    ]);
    expect(copy.position).toBe(2);
  });
});
