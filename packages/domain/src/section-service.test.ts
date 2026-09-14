import { ProjectSectionSchema, type ProjectId, type SectionId } from '@cwm/contracts';
import { SEED_NOW } from '@cwm/prototype-data';
import { InMemoryDataStore } from '@cwm/repositories';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, seedContainer, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';

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

const withShortcut = async () => {
  const harness = buildHarness();
  const sourceProject = await harness.projectService.create(harness.actor, {
    workspaceId: harness.actor.workspaceId,
    kind: 'subproject',
    parentProjectId: MINE,
    name: 'Kitchen',
  });
  const source = await harness.sectionService.add(harness.actor, sourceProject.id, { type: 'rich-text' });
  const home = (await harness.pages.list({ projectId: MINE, kind: 'home' }))[0]!;
  const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
    pageId: home.id,
    sourceSectionId: source.id,
  });
  return { harness, shortcut };
};

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

describe('SectionService and Home shortcut ordering (§27)', () => {
  it('appends a section after an existing shortcut', async () => {
    const { harness, shortcut } = await withShortcut();

    const section = await add(harness, 'rich-text');

    expect(section.position).toBe(1);
    expect((await harness.shortcuts.find(shortcut.id))?.position).toBe(0);
  });

  it('inserts at a position in the combined section and shortcut order', async () => {
    const { harness, shortcut } = await withShortcut();
    const first = await add(harness, 'rich-text');
    const second = await add(harness, 'progress');

    const inserted = await add(harness, 'task-list', { position: 1 });

    const placements = [
      ...(await harness.sections.list({ pageId: shortcut.pageId })).map((value) => ({
        kind: 'section',
        id: value.id,
        position: value.position,
      })),
      ...(await harness.shortcuts.list({ pageId: shortcut.pageId })).map((value) => ({
        kind: 'shortcut',
        id: value.id,
        position: value.position,
      })),
    ].sort((a, b) => a.position - b.position);

    expect(placements).toEqual([
      { kind: 'shortcut', id: shortcut.id, position: 0 },
      { kind: 'section', id: inserted.id, position: 1 },
      { kind: 'section', id: first.id, position: 2 },
      { kind: 'section', id: second.id, position: 3 },
    ]);
  });

  it('clamps a position past the end and appends when position is absent', async () => {
    const { harness, shortcut } = await withShortcut();
    const first = await add(harness, 'rich-text');

    const clamped = await add(harness, 'task-list', { position: 99 });
    const appended = await add(harness, 'progress');

    expect((await harness.shortcuts.find(shortcut.id))?.position).toBe(0);
    expect([first.position, clamped.position, appended.position]).toEqual([1, 2, 3]);
  });

  it('records one added event and no move event for a positioned add', async () => {
    const harness = buildHarness();
    await add(harness, 'rich-text');
    await add(harness, 'progress');
    const before = harness.store.snapshot().activityEvents.length;

    await add(harness, 'task-list', { position: 1 });

    expect(harness.store.snapshot().activityEvents.slice(before).map(({ action }) => action)).toEqual([
      'project.section_added',
    ]);
  });

  it('does not renumber sections when a positioned add is refused for a disabled page', async () => {
    const harness = buildHarness();
    const page = await harness.projectPageService.setEnabled(harness.actor, MINE, {
      kind: 'reflections',
      enabled: true,
    });
    await harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: page.id });
    await harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: page.id });
    const before = (await harness.sections.list({ pageId: page.id })).map(({ id, position }) => [id, position]);
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'reflections', enabled: false });

    await expect(
      harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: page.id, position: 0 }),
    ).rejects.toThrow(/disabled/);

    expect((await harness.sections.list({ pageId: page.id })).map(({ id, position }) => [id, position])).toEqual(before);
  });

  it('does not renumber sections when a positioned add is refused for an archived project', async () => {
    const harness = buildHarness();
    const first = await add(harness, 'rich-text');
    const second = await add(harness, 'progress');
    await harness.projectService.archive(harness.actor, MINE);

    await expect(harness.sectionService.add(harness.actor, MINE, { type: 'task-list', position: 0 })).rejects.toThrow(
      /archived; reactivate it first/,
    );

    expect((await harness.sections.list({ pageId: first.pageId })).map(({ id, position }) => [id, position])).toEqual([
      [first.id, 0],
      [second.id, 1],
    ]);
  });

  it('does not renumber sections when a positioned add is refused for missing permission', async () => {
    const harness = buildHarness();
    const first = await add(harness, 'rich-text');
    const second = await add(harness, 'progress');

    await expect(
      harness.sectionService.add(agentActorFor(0), MINE, { type: 'task-list', position: 0 }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    expect((await harness.sections.list({ pageId: first.pageId })).map(({ id, position }) => [id, position])).toEqual([
      [first.id, 0],
      [second.id, 1],
    ]);
  });

  it('moves a section past a shortcut using the combined target index', async () => {
    const { harness, shortcut } = await withShortcut();
    const first = await add(harness, 'rich-text');
    const second = await add(harness, 'progress');

    await harness.sectionService.move(harness.actor, first.id, 2);

    expect((await harness.shortcuts.find(shortcut.id))?.position).toBe(0);
    expect((await harness.sections.find(second.id))?.position).toBe(1);
    expect((await harness.sections.find(first.id))?.position).toBe(2);
  });

  it('duplicates a section beside its original on a mixed canvas', async () => {
    const { harness, shortcut } = await withShortcut();
    const original = await add(harness, 'rich-text');

    const copy = await harness.sectionService.duplicate(harness.actor, original.id);

    expect((await harness.shortcuts.find(shortcut.id))?.position).toBe(0);
    expect((await harness.sections.find(original.id))?.position).toBe(1);
    expect((await harness.sections.find(copy.id))?.position).toBe(2);
  });

  it('removes a section and closes the gap around a shortcut', async () => {
    const { harness, shortcut } = await withShortcut();
    const before = await add(harness, 'rich-text');
    const after = await add(harness, 'progress');
    await harness.sectionService.move(harness.actor, before.id, 0);

    await harness.sectionService.remove(harness.actor, before.id);

    expect((await harness.shortcuts.find(shortcut.id))?.position).toBe(0);
    expect((await harness.sections.find(after.id))?.position).toBe(1);
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
  it('archives the section, closes the position gap, and returns the archived record', async () => {
    const harness = buildHarness();
    const [, second] = await withThree(harness);

    const archived = await harness.sectionService.remove(harness.actor, second.id);

    // Nothing is deleted, so `get` — which resolves through the unchecked lookup restore
    // depends on — still answers, and `list` is what stops it reaching the canvas.
    expect(archived.archivedAt).toBe(SEED_NOW);
    expect((await harness.sectionService.get(harness.actor, second.id)).archivedAt).toBe(SEED_NOW);
    expect(await positions(harness)).toEqual([
      ['rich-text', 0],
      ['progress', 1],
    ]);
    // The returned record is what MCP echoes, without a second permissioned read.
    expect(archived.id).toBe(second.id);
  });

  it('archives a view with its config, and restore returns the prose unchanged', async () => {
    // The reason removal archives *every* section rather than only containers: a Notes
    // section's text lives in `config` and nowhere else, so deleting the record loses it.
    const harness = buildHarness();
    const notes = await add(harness, 'rich-text', { title: 'Notes' });
    await harness.sectionService.update(harness.actor, notes.id, { config: { text: 'Measure the hallway shelf' } });

    // No dialog, no policy: a view holds no rows, so there is no question to ask.
    await harness.sectionService.remove(harness.actor, notes.id);
    expect(await harness.sectionService.list(harness.actor, MINE)).toHaveLength(0);

    const restored = await harness.sectionService.restoreSection(harness.actor, notes.id);
    expect(restored.config).toEqual({ text: 'Measure the hallway shelf' });
    expect(restored.title).toBe('Notes');
    expect(restored.archivedAt).toBeUndefined();
  });

  it('refuses to remove a section that is already archived', async () => {
    // Reachable: `get` and the root Archive projection both hand out archived ids, so the API and
    // `remove_section` can be pointed at one. Permanent deletion is what this case wants.
    const harness = buildHarness();
    const section = await add(harness);
    await harness.sectionService.remove(harness.actor, section.id);

    const refusal = await harness.sectionService
      .remove(harness.actor, section.id)
      .then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(DomainRuleError);
    expect((refusal as DomainRuleError).message).toContain(section.id);
    // No second discriminator: the canvas surfaces this as an ordinary error, not a dialog.
    expect((refusal as DomainRuleError).details).toBeUndefined();
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

  it('archives a container holding only already-archived rows, with no policy', async () => {
    // The second dangle: the hard delete removed such a section out from under rows no
    // policy ever reached, because `settleRows` returned early when nothing was live.
    const harness = buildHarness();
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Done with' });
    await harness.taskService.archive(harness.actor, task.id);

    const archived = await harness.sectionService.remove(harness.actor, task.sectionId);

    expect(archived.archivedAt).toBe(SEED_NOW);
    // The row keeps a section, and it carries no marker — it was not archived *with* this.
    const row = await harness.taskService.get(harness.actor, task.id);
    expect(row.sectionId).toBe(task.sectionId);
    expect(row.archivedWithSectionId).toBeUndefined();
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
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
    await harness.sectionService.restoreSection(harness.actor, copy.id);
    // Restoring an already-live section invents no history — the retry semantics the public
    // route needs.
    await harness.sectionService.restoreSection(harness.actor, copy.id);

    const events = harness.store.snapshot().activityEvents;
    expect(events.map((event) => event.action)).toEqual([
      'project.section_added',
      'project.section_added',
      'project.section_updated',
      'project.section_moved',
      'project.section_added',
      'project.section_archived',
      'project.section_restored',
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
    await harness.sectionService.restoreSection(harness.actor, section.id);

    const summaries = harness.store.snapshot().activityEvents.map((event) => event.summary);
    expect(summaries).toContain('Added the Task List section');
    expect(summaries).toContain('Archived the Task List section');
    expect(summaries).toContain('Restored the Task List section');
  });

  it('names archive and restore by the section own title, frozen at write time', async () => {
    const harness = buildHarness();
    const backlog = await add(harness, 'task-list', { title: 'Backlog' });

    await harness.sectionService.remove(harness.actor, backlog.id);
    await harness.sectionService.restoreSection(harness.actor, backlog.id);
    // A later rename does not rewrite either event — `nameOf` is read at write time.
    await harness.sectionService.update(harness.actor, backlog.id, { title: 'Later' });

    const summaries = harness.store.snapshot().activityEvents.map((event) => event.summary);
    expect(summaries).toContain('Archived the Backlog section');
    expect(summaries).toContain('Restored the Backlog section');
  });

  it('falls back through nameOf for a legacy blank stored title', async () => {
    // `ProjectSection.title` stays a plain optional string, so a document written before the
    // names phase can hold `"   "`. The activity line must still say what the canvas says.
    const harness = buildHarness();
    const sectionId = await seedContainer(harness, MINE);
    const stored = await harness.sectionService.get(harness.actor, sectionId);
    await harness.sections.update({ ...stored, title: '   ' });

    await harness.sectionService.remove(harness.actor, sectionId);

    expect(harness.store.snapshot().activityEvents.map((event) => event.summary)).toContain(
      'Archived the Task List section',
    );
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

describe('SectionService reads are live-only', () => {
  it('defaults to the live canvas and returns both states only when asked', async () => {
    const harness = buildHarness();
    const [first, second, third] = await withThree(harness);
    await harness.sectionService.remove(harness.actor, second.id);

    // The whole list, spelled out: an assertion built from the result it is checking would
    // only ever pin the length.
    expect((await harness.sectionService.list(harness.actor, MINE)).map((section) => section.id)).toEqual([
      first.id,
      third.id,
    ]);

    const all = await harness.sectionService.list(harness.actor, MINE, { includeArchived: true });
    expect(all.map((section) => section.id)).toContain(second.id);
    expect(all).toHaveLength(3);
    // Deterministic for transport: position, then id. The region applies its own timestamp
    // order after selecting the archived records.
    expect(all.map((section) => section.position)).toEqual([...all.map((s) => s.position)].sort((a, b) => a - b));
  });

  it('does not cross project scope, even when asked for archived sections', async () => {
    const harness = buildHarness();
    await harness.sectionService.add(harness.other, THEIRS, { type: 'task-list' });
    const mine = await add(harness, 'task-list');
    await harness.sectionService.remove(harness.actor, mine.id);

    const all = await harness.sectionService.list(harness.actor, MINE, { includeArchived: true });
    expect(all.every((section) => section.projectId === MINE)).toBe(true);
  });

  it('resolves a container past an archived one, creating a new one rather than reviving it', async () => {
    // The subtlest read path: a removed section comes back through restore, never through a
    // row write that happened to need somewhere to go.
    const harness = buildHarness();
    const list = await add(harness, 'task-list');
    await harness.sectionService.remove(harness.actor, list.id);

    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Somewhere new' });

    expect(task.sectionId).not.toBe(list.id);
    expect((await harness.sectionService.list(harness.actor, MINE)).map((s) => s.id)).toEqual([task.sectionId]);
  });

  it('refuses to create or move a row into an archived container', async () => {
    const harness = buildHarness();
    const list = await add(harness, 'task-list');
    const keep = await add(harness, 'task-list');
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, sectionId: keep.id, title: 'Live' });
    await harness.sectionService.remove(harness.actor, list.id);

    await expect(
      harness.taskService.create(harness.actor, { projectId: MINE, sectionId: list.id, title: 'Nope' }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    await expect(
      harness.taskService.update(harness.actor, task.id, { sectionId: list.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('refuses update, move and duplicate on an archived section', async () => {
    const harness = buildHarness();
    const notes = await add(harness, 'rich-text', { title: 'Notes' });
    await add(harness, 'task-list');
    await harness.sectionService.update(harness.actor, notes.id, { config: { text: 'keep me' } });
    await harness.sectionService.remove(harness.actor, notes.id);

    // The `config` case is the one that matters: replacing it would overwrite the very prose
    // archiving a view exists to keep.
    await expect(
      harness.sectionService.update(harness.actor, notes.id, { config: { text: 'clobbered' } }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.sectionService.update(harness.actor, notes.id, { title: 'Renamed' })).rejects.toBeInstanceOf(
      DomainRuleError,
    );
    await expect(harness.sectionService.move(harness.actor, notes.id, 0)).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.sectionService.duplicate(harness.actor, notes.id)).rejects.toBeInstanceOf(DomainRuleError);
    expect((await harness.sectionService.get(harness.actor, notes.id)).config).toEqual({ text: 'keep me' });
  });
});

describe('SectionService.restoreSection', () => {
  it('appends at the end of the canvas and renumbers nothing else', async () => {
    const harness = buildHarness();
    const [first, second, third] = await withThree(harness);
    await harness.sectionService.remove(harness.actor, first.id);

    // Archiving closed the gap the same way deleting used to.
    expect(await positions(harness)).toEqual([
      ['task-list', 0],
      ['progress', 1],
    ]);

    const restored = await harness.sectionService.restoreSection(harness.actor, first.id);

    // Its old index needs positions the canvas has since reused, so it goes last — where
    // `addWithin` puts a new one.
    expect(restored.position).toBe(2);
    expect((await harness.sectionService.list(harness.actor, MINE)).map((section) => section.id)).toEqual([
      second.id,
      third.id,
      first.id,
    ]);
  });

  it('is a no-op on a live section, preserving position, timestamps and history', async () => {
    const harness = buildHarness();
    const [first] = await withThree(harness);
    const before = harness.store.snapshot().activityEvents.length;

    const same = await harness.sectionService.restoreSection(harness.actor, first.id);

    expect(same).toEqual(first);
    expect(harness.store.snapshot().activityEvents).toHaveLength(before);
  });

  it('refuses without projects.write, and answers not-found for a foreign section', async () => {
    const harness = buildHarness();
    const section = await add(harness);
    await harness.sectionService.remove(harness.actor, section.id);
    const theirs = await harness.sectionService.add(harness.other, THEIRS, { type: 'task-list' });
    await harness.sectionService.remove(harness.other, theirs.id);

    await expect(
      harness.sectionService.restoreSection(agentActorFor(0, ['projects.read']), section.id),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    // Not-found wins for a foreign id: a rule error would confirm it exists.
    await expect(harness.sectionService.restoreSection(harness.actor, theirs.id)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
  });

  it('refuses to restore into an archived project, while removal stays allowed', async () => {
    // The freeze stops work coming *back* into a project someone has put away; it does not
    // stop them tidying one. It is escapable — reactivating the project lifts it.
    const harness = buildHarness();
    const section = await add(harness, 'task-list');
    const second = await add(harness, 'rich-text');
    await harness.sectionService.remove(harness.actor, section.id);
    await harness.projectService.archive(harness.actor, MINE);

    await expect(harness.sectionService.restoreSection(harness.actor, section.id)).rejects.toBeInstanceOf(
      DomainRuleError,
    );
    await expect(harness.sectionService.add(harness.actor, MINE, { type: 'task-list' })).rejects.toBeInstanceOf(
      DomainRuleError,
    );
    await expect(harness.sectionService.update(harness.actor, second.id, { collapsed: true })).rejects.toBeInstanceOf(
      DomainRuleError,
    );
    await expect(harness.sectionService.duplicate(harness.actor, second.id)).rejects.toBeInstanceOf(DomainRuleError);
    // Tidying is still allowed.
    await expect(harness.sectionService.remove(harness.actor, second.id)).resolves.toMatchObject({ id: second.id });

    await harness.projectService.update(harness.actor, MINE, { status: 'active' });
    expect((await harness.sectionService.restoreSection(harness.actor, section.id)).archivedAt).toBeUndefined();
  });
});

/**
 * §27's ownership chain at the layer that maintains it. A section belongs to a page, and the
 * page it belongs to is either the one the caller named or the project's canonical one.
 */
describe('SectionService page ownership', () => {
  const canonicalPageOf = async (harness: ReturnType<typeof buildHarness>, projectId: ProjectId) =>
    (await harness.pages.list({ projectId }))[0]!;

  it('lands a section on a root’s Home when no page is named', async () => {
    const harness = buildHarness();

    const section = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    expect(section.pageId).toBe((await canonicalPageOf(harness, MINE)).id);
  });

  it('lands a section on a sub-project’s work canvas when no page is named', async () => {
    const harness = buildHarness();
    const child = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId,
      kind: 'subproject',
      parentProjectId: MINE,
      name: 'Work unit',
    });

    const section = await harness.sectionService.add(harness.actor, child.id, { type: 'task-list' });

    expect(await canonicalPageOf(harness, child.id)).toMatchObject({ kind: 'work', id: section.pageId });
  });

  /**
   * **Not found, not a rule error.** A 409 would confirm the page exists, which is the reason
   * `require` answers not-found for a foreign section and `ProjectService.require` for a
   * foreign project. The page's *capability* refusals below stay rule errors: the caller may
   * see that page, it just may not put that there.
   */
  it('answers not found for another project’s page', async () => {
    const harness = buildHarness();
    const foreign = await canonicalPageOf(harness, THEIRS);

    await expect(
      harness.sectionService.add(harness.actor, MINE, { type: 'task-list', pageId: foreign.id }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  /** §30: Todos and Archive project rows they do not own, so a section there renders nowhere. */
  it('refuses a section on a page that holds none', async () => {
    const harness = buildHarness();
    const home = await canonicalPageOf(harness, MINE);
    await harness.pages.insert({ ...home, id: 'page-mine-todos' as typeof home.id, kind: 'todos' });

    await expect(
      harness.sectionService.add(harness.actor, MINE, { type: 'task-list', pageId: 'page-mine-todos' as typeof home.id }),
    ).rejects.toThrow(/does not hold sections/);
  });

  /**
   * Ordering, not just outcome: page resolution runs after the archive check, so an archived
   * project keeps failing with the refusal that names the actual problem.
   */
  it('still refuses with the archive error on an archived project', async () => {
    const harness = buildHarness();
    await harness.projectService.archive(harness.actor, MINE);

    await expect(harness.sectionService.add(harness.actor, MINE, { type: 'task-list' })).rejects.toThrow(
      /archived; reactivate it first/,
    );
  });

  it('keeps a duplicate on the page that owned the original', async () => {
    const harness = buildHarness();
    const section = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    expect((await harness.sectionService.duplicate(harness.actor, section.id)).pageId).toBe(section.pageId);
  });

  /**
   * The write-only path still works. Resolving a container now resolves a page too, and an
   * agent granted `tasks.write` alone must not start needing layout permission for it.
   */
  it('resolves a container for an agent granted tasks.write alone', async () => {
    const harness = buildHarness();

    const task = await harness.taskService.create(agentActorFor(0, ['tasks.write']), {
      projectId: MINE,
      title: 'Agent task',
    });

    const container = await harness.sectionService.get(harness.actor, task.sectionId);
    expect(container.pageId).toBe((await canonicalPageOf(harness, MINE)).id);
  });
});
