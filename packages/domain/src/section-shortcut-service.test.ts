import type { ProjectId, ProjectPageId, SectionId, SectionShortcutId } from '@cwm/contracts';
import { buildSeed } from '@cwm/prototype-data';
import { describe, expect, it } from 'vitest';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';

const setupNestedSource = async () => {
  const harness = buildHarness();
  const child = await harness.projectService.create(harness.actor, {
    workspaceId: harness.actor.workspaceId,
    kind: 'subproject',
    parentProjectId: MINE,
    name: 'Kitchen',
  });
  const childPage = (await harness.pages.list({ projectId: child.id }))[0]!;
  const source = await harness.sectionService.add(harness.actor, child.id, {
    type: 'task-list',
    pageId: childPage.id,
  });
  const home = (await harness.pages.list({ projectId: MINE, kind: 'home' }))[0]!;
  return { harness, child, childPage, source, home };
};

const homeOrder = async (harness: ReturnType<typeof buildHarness>, pageId: ProjectPageId) => {
  const sections = await harness.sections.list({ pageId });
  const shortcuts = await harness.shortcuts.list({ pageId });
  return [
    ...sections.map(({ id, position }) => ({ kind: 'section' as const, id, position })),
    ...shortcuts.map(({ id, position }) => ({ kind: 'shortcut' as const, id, position })),
  ].sort((a, b) => a.position - b.position);
};

const setupPlacedHome = async () => {
  const state = await setupNestedSource();
  const section = await state.harness.sectionService.add(state.harness.actor, MINE, {
    type: 'markdown',
    pageId: state.home.id,
  });
  const shortcut = await state.harness.sectionShortcutService.create(state.harness.actor, MINE, {
    pageId: state.home.id,
    sourceSectionId: state.source.id,
  });
  return { ...state, section, shortcut };
};

describe('SectionShortcutService', () => {
  it('resolves a same-tree source by identity and never returns its rows', async () => {
    const { harness, source, home } = await setupNestedSource();

    const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: home.id,
      sourceSectionId: source.id,
    });
    const listed = await harness.sectionShortcutService.list(harness.actor, MINE, { pageId: home.id });

    expect(shortcut).toMatchObject({
      sourceSectionId: source.id,
      sourceProjectId: source.projectId,
      sourcePageKind: 'work',
      breadcrumb: ['Project project-mine', 'Kitchen'],
      availability: 'available',
    });
    expect(listed[0]).toEqual(shortcut);
    expect(shortcut).not.toHaveProperty('tasks');

    const sources = await harness.sectionShortcutService.listSources(harness.actor, MINE, { pageId: home.id });
    expect(sources).toContainEqual(
      expect.objectContaining({
        sourceSectionId: source.id,
        breadcrumb: ['Project project-mine', 'Kitchen'],
        alreadyPlaced: true,
      }),
    );
  });

  it('orders sections and shortcuts together and renumbers both kinds on every move', async () => {
    const { harness, source, home } = await setupNestedSource();
    const first = await harness.sectionService.add(harness.actor, MINE, { type: 'markdown', pageId: home.id });
    const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: home.id,
      sourceSectionId: source.id,
    });
    const last = await harness.sectionService.add(harness.actor, MINE, { type: 'progress', pageId: home.id });

    await harness.sectionService.move(harness.actor, first.id, 2);
    expect(
      (await harness.sections.list({ pageId: home.id })).sort((a, b) => a.position - b.position).map((item) => [item.id, item.position]),
    ).toEqual([
      [last.id, 1],
      [first.id, 2],
    ]);
    expect((await harness.shortcuts.list({ pageId: home.id }))[0]).toMatchObject({ id: shortcut.id, position: 0 });

    await harness.sectionShortcutService.move(harness.actor, shortcut.id, { position: 2 });
    expect((await harness.shortcuts.find(shortcut.id))?.position).toBe(2);
    expect((await harness.sections.list({ pageId: home.id })).sort((a, b) => a.position - b.position).map((item) => item.position)).toEqual([0, 1]);
  });

  it('creates a shortcut at a position among sections in the combined order', async () => {
    const { harness, source, home } = await setupNestedSource();
    const first = await harness.sectionService.add(harness.actor, MINE, { type: 'markdown', pageId: home.id });
    const second = await harness.sectionService.add(harness.actor, MINE, { type: 'progress', pageId: home.id });
    const eventsBefore = harness.store.snapshot().activityEvents.length;

    const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: home.id,
      sourceSectionId: source.id,
      position: 1,
    });

    expect(await homeOrder(harness, home.id)).toEqual([
      { kind: 'section', id: first.id, position: 0 },
      { kind: 'shortcut', id: shortcut.id, position: 1 },
      { kind: 'section', id: second.id, position: 2 },
    ]);
    expect(harness.store.snapshot().activityEvents.slice(eventsBefore).map(({ action }) => action)).toEqual([
      'project.shortcut_added',
    ]);
  });

  it('shifts sections for a positioned shortcut without changing their updatedAt', async () => {
    const { harness, source, home } = await setupNestedSource();
    const first = await harness.sectionService.add(harness.actor, MINE, { type: 'markdown', pageId: home.id });
    harness.clock.setNow(new Date('2026-12-01T09:00:00.000Z'));

    await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: home.id,
      sourceSectionId: source.id,
      position: 0,
    });

    expect((await harness.sections.find(first.id))).toMatchObject({ position: 1, updatedAt: first.updatedAt });
  });

  it('does not renumber placements when a positioned create is refused outside Home', async () => {
    const { harness, home, source } = await setupPlacedHome();
    const { page: reflections } = await harness.projectPageService.setEnabled(harness.actor, MINE, {
      kind: 'reflections',
      enabled: true,
    });
    const before = await homeOrder(harness, home.id);

    await expect(
      harness.sectionShortcutService.create(harness.actor, MINE, {
        pageId: reflections.id,
        sourceSectionId: source.id,
        position: 0,
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    expect(await homeOrder(harness, home.id)).toEqual(before);
  });

  it('does not renumber placements when a positioned create is refused for a cross-root source', async () => {
    const { harness, home } = await setupPlacedHome();
    const otherRoot = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId,
      kind: 'root',
      name: 'Another root',
    });
    const otherHome = (await harness.pages.list({ projectId: otherRoot.id, kind: 'home' }))[0]!;
    const foreignSource = await harness.sectionService.add(harness.actor, otherRoot.id, {
      type: 'markdown',
      pageId: otherHome.id,
    });
    const before = await homeOrder(harness, home.id);

    await expect(
      harness.sectionShortcutService.create(harness.actor, MINE, {
        pageId: home.id,
        sourceSectionId: foreignSource.id,
        position: 0,
      }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);

    expect(await homeOrder(harness, home.id)).toEqual(before);
  });

  it('does not renumber placements when a positioned create is refused for missing permission', async () => {
    const { harness, home, source } = await setupPlacedHome();
    const before = await homeOrder(harness, home.id);

    await expect(
      harness.sectionShortcutService.create(agentActorFor(0), MINE, {
        pageId: home.id,
        sourceSectionId: source.id,
        position: 0,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    expect(await homeOrder(harness, home.id)).toEqual(before);
  });

  it('marks an archived source section unavailable, then restores availability', async () => {
    const { harness, source, home } = await setupNestedSource();
    const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: home.id,
      sourceSectionId: source.id,
    });

    await harness.sectionService.remove(harness.actor, source.id);
    await expect(harness.sectionShortcutService.list(harness.actor, MINE, { pageId: home.id })).resolves.toMatchObject([
      expect.objectContaining({ id: shortcut.id, availability: 'source_archived' }),
    ]);

    await harness.sectionService.restoreSection(harness.actor, source.id);
    await expect(harness.sectionShortcutService.list(harness.actor, MINE, { pageId: home.id })).resolves.toMatchObject([
      expect.objectContaining({ id: shortcut.id, availability: 'available' }),
    ]);
  });

  it('marks a source project hidden while archived and comes back on reactivation', async () => {
    const { harness, child, source, home } = await setupNestedSource();
    const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: home.id,
      sourceSectionId: source.id,
    });

    await harness.projectService.update(harness.actor, child.id, { status: 'archived' });
    expect((await harness.sectionShortcutService.list(harness.actor, MINE, { pageId: home.id }))[0]).toMatchObject({
      id: shortcut.id,
      availability: 'source_hidden',
    });

    await harness.projectService.update(harness.actor, child.id, { status: 'active' });
    expect((await harness.sectionShortcutService.list(harness.actor, MINE, { pageId: home.id }))[0]).toMatchObject({
      id: shortcut.id,
      availability: 'available',
    });
  });

  it('allows a disabled source page to remain a valid source', async () => {
    const harness = buildHarness();
    const { page } = await harness.projectPageService.setEnabled(harness.actor, MINE, {
      kind: 'reflections',
      enabled: true,
    });
    const source = await harness.sectionService.add(harness.actor, MINE, {
      type: 'reflections',
      pageId: page.id,
    });
    const home = (await harness.pages.list({ projectId: MINE, kind: 'home' }))[0]!;
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'reflections', enabled: false });

    await expect(
      harness.sectionShortcutService.create(harness.actor, MINE, { pageId: home.id, sourceSectionId: source.id }),
    ).resolves.toMatchObject({ sourcePageKind: 'reflections', availability: 'available' });
  });

  it('hides foreign sources and refuses shortcuts outside the root tree', async () => {
    const { harness, home } = await setupNestedSource();
    const foreign = await harness.sectionService.add(harness.other, THEIRS, { type: 'task-list' });

    await expect(
      harness.sectionShortcutService.create(harness.actor, MINE, { pageId: home.id, sourceSectionId: foreign.id }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(await harness.sectionShortcutService.listSources(harness.actor, MINE, { pageId: home.id })).not.toContainEqual(
      expect.objectContaining({ sourceSectionId: foreign.id }),
    );
  });

  it('refuses unavailable sources on create and allows removal without touching the source', async () => {
    const { harness, child, source, home } = await setupNestedSource();
    await harness.projectService.update(harness.actor, child.id, { status: 'archived' });
    await expect(
      harness.sectionShortcutService.create(harness.actor, MINE, { pageId: home.id, sourceSectionId: source.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    await harness.projectService.update(harness.actor, child.id, { status: 'active' });
    const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: home.id,
      sourceSectionId: source.id,
    });
    const before = await harness.sections.find(source.id);
    await harness.sectionShortcutService.remove(harness.actor, shortcut.id);
    expect(await harness.shortcuts.find(shortcut.id)).toBeNull();
    expect(await harness.sections.find(source.id)).toEqual(before);
  });

  it('labels each recorded placement write with the source section’s name; Activity keeps its text (Slice 41)', async () => {
    const { harness, source, home } = await setupNestedSource();
    const writes = harness.sectionShortcutWriteService;
    const added = await writes.create(harness.actor, MINE, { pageId: home.id, sourceSectionId: source.id });
    const id = added.shortcut.id;
    expect(added.operation.label).toBe('Added the Task List shortcut');
    expect((await writes.update(harness.actor, id, { collapsed: true })).operation?.label).toBe('Collapsed the Task List shortcut');
    expect((await writes.update(harness.actor, id, { collapsed: false })).operation?.label).toBe('Expanded the Task List shortcut');
    expect((await writes.update(harness.actor, id, { columnSpan: 6 })).operation?.label).toBe('Resized the Task List shortcut');
    expect((await writes.update(harness.actor, id, { columnSpan: 12, collapsed: true })).operation?.label).toBe('Updated the Task List shortcut');
    await harness.sectionService.add(harness.actor, MINE, { type: 'markdown', pageId: home.id });
    expect((await writes.move(harness.actor, id, 1)).operation?.label).toBe('Moved the Task List shortcut');
    expect((await writes.remove(harness.actor, id)).operation.label).toBe('Removed the Task List shortcut');
    const summaries = (await harness.activity.list(harness.actor)).map((event) => event.summary);
    expect(summaries).toEqual(expect.arrayContaining(['Updated a shortcut', 'Moved a shortcut', 'Removed a shortcut']));
  });

  it('removes and labels a shortcut whose source is archived, or hidden under an archived subproject', async () => {
    const archived = await setupNestedSource();
    const first = await archived.harness.sectionShortcutWriteService.create(archived.harness.actor, MINE, {
      pageId: archived.home.id, sourceSectionId: archived.source.id,
    });
    await archived.harness.sectionService.remove(archived.harness.actor, archived.source.id);
    await expect(archived.harness.sectionShortcutWriteService.remove(archived.harness.actor, first.shortcut.id))
      .resolves.toMatchObject({ operation: { label: 'Removed the Task List shortcut' } });

    const hidden = await setupNestedSource();
    const second = await hidden.harness.sectionShortcutWriteService.create(hidden.harness.actor, MINE, {
      pageId: hidden.home.id, sourceSectionId: hidden.source.id,
    });
    await hidden.harness.projectService.update(hidden.harness.actor, hidden.child.id, { status: 'archived' });
    await expect(hidden.harness.sectionShortcutWriteService.remove(hidden.harness.actor, second.shortcut.id))
      .resolves.toMatchObject({ operation: { label: 'Removed the Task List shortcut' } });
  });
});

/**
 * Slice 65: a workstream's Work canvas is a destination exactly as a root's Home is — same root,
 * same workspace, never its own page — with the action in the **workstream's** history.
 */
describe('SectionShortcutService on a workstream Work canvas (Slice 65)', () => {
  const RENOVATION = 'project-renovation' as ProjectId;
  const KITCHEN = 'project-kitchen' as ProjectId;
  const GARDEN = 'project-garden' as ProjectId;
  const CABINETS = 'project-cabinets' as ProjectId;
  const LEGACY_CHILD = 'project-legacy-child' as ProjectId;
  const KITCHEN_WORK = 'page-project-kitchen' as ProjectPageId;
  const CABINETS_WORK = 'page-project-cabinets' as ProjectPageId;
  const LEGACY_CHILD_WORK = 'page-project-legacy-child' as ProjectPageId;
  const GARDEN_BRIEF = 'section-project-garden-brief' as SectionId;
  const RENOVATION_BRIEF = 'section-project-renovation-brief' as SectionId;

  type Harness = ReturnType<typeof buildHarness>;
  const nested = () => buildHarness(buildSeed('nested-projects'));

  const actionIdsIn = async (harness: Harness, projectId: ProjectId) => {
    const histories = await harness.operationHistories.list({ projectId });
    return (await Promise.all(histories.map(({ id }) => harness.operationActions.list({ historyId: id })))).flat().map(({ id }) => id);
  };

  it('places a sibling section on the Work canvas and records it in the workstream history only', async () => {
    const harness = nested();

    const { shortcut, operation } = await harness.sectionShortcutWriteService.create(harness.actor, KITCHEN, {
      pageId: KITCHEN_WORK,
      sourceSectionId: GARDEN_BRIEF,
      position: 1,
    });

    expect(shortcut).toMatchObject({
      pageId: KITCHEN_WORK,
      position: 1,
      sourceProjectId: GARDEN,
      breadcrumb: ['Home renovation', 'Garden'],
      availability: 'available',
    });
    expect((await harness.operationHistories.find(operation.historyId))?.projectId).toBe(KITCHEN);
    expect(await actionIdsIn(harness, KITCHEN)).toContain(operation.actionId);
    for (const elsewhere of [RENOVATION, GARDEN]) {
      expect(await actionIdsIn(harness, elsewhere)).not.toContain(operation.actionId);
    }
  });

  it('lists the Work page placements when no pageId is given', async () => {
    const harness = nested();
    const created = await harness.sectionShortcutService.create(harness.actor, KITCHEN, {
      pageId: KITCHEN_WORK,
      sourceSectionId: GARDEN_BRIEF,
    });

    expect(await harness.sectionShortcutService.list(harness.actor, KITCHEN)).toEqual([created]);
  });

  it('offers the root pages, a disabled page, siblings and descendants as sources, never its own page or hidden work', async () => {
    const harness = nested();
    await harness.projectPageService.setEnabled(harness.actor, RENOVATION, { kind: 'reflections', enabled: false });
    const cabinets = await harness.sectionService.add(harness.actor, CABINETS, { type: 'markdown' });
    // Legacy is archived and owns no sections, so the hidden source is inserted the way a stored one exists.
    const hidden = { ...cabinets, id: 'section-legacy-hidden' as SectionId, projectId: LEGACY_CHILD, pageId: LEGACY_CHILD_WORK };
    await harness.sections.insert(hidden);

    const sources = (await harness.sectionShortcutService.listSources(harness.actor, KITCHEN, { pageId: KITCHEN_WORK })).map(
      ({ sourceSectionId }) => sourceSectionId,
    );

    expect(sources).toEqual(
      expect.arrayContaining([RENOVATION_BRIEF, 'section-project-renovation-reflections-page', GARDEN_BRIEF, cabinets.id]),
    );
    const kitchenOwn = (await harness.sections.list({ pageId: KITCHEN_WORK })).map(({ id }) => id);
    expect(kitchenOwn.length).toBeGreaterThan(0);
    for (const excluded of [...kitchenOwn, hidden.id]) expect(sources).not.toContain(excluded);
  });

  it('refuses another root, another workspace and an optional page, writing nothing', async () => {
    const harness = nested();
    const otherRoot = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId,
      kind: 'root',
      name: 'Other root',
    });
    const otherRootSource = await harness.sectionService.add(harness.actor, otherRoot.id, { type: 'markdown' });
    const foreignSource = await harness.sectionService.add(harness.other, 'project-alex-private' as ProjectId, { type: 'markdown' });
    const before = harness.store.snapshot();

    for (const sourceSectionId of [otherRootSource.id, foreignSource.id]) {
      await expect(
        harness.sectionShortcutService.create(harness.actor, KITCHEN, { pageId: KITCHEN_WORK, sourceSectionId }),
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    }
    await expect(
      harness.sectionShortcutService.create(harness.actor, RENOVATION, {
        pageId: 'page-project-renovation-reflections' as ProjectPageId,
        sourceSectionId: GARDEN_BRIEF,
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    const after = harness.store.snapshot();
    expect(after.sectionShortcuts).toEqual(before.sectionShortcuts);
    expect(after.activityEvents).toEqual(before.activityEvents);
    expect(after.operationActions).toEqual(before.operationActions);
    expect(after.operationHistories).toEqual(before.operationHistories);
  });

  it('freezes a placement on an archived workstream, or one under an archived ancestor, except for removal', async () => {
    const harness = nested();
    const placed = await harness.sectionShortcutService.create(harness.actor, CABINETS, {
      pageId: CABINETS_WORK,
      sourceSectionId: GARDEN_BRIEF,
    });
    await harness.sectionService.add(harness.actor, CABINETS, { type: 'markdown' });
    await harness.projectService.update(harness.actor, CABINETS, { status: 'archived' });

    await expect(
      harness.sectionShortcutService.create(harness.actor, CABINETS, { pageId: CABINETS_WORK, sourceSectionId: RENOVATION_BRIEF }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.sectionShortcutService.update(harness.actor, placed.id, { collapsed: true })).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.sectionShortcutService.move(harness.actor, placed.id, 1)).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.sectionShortcutService.remove(harness.actor, placed.id)).resolves.toBeUndefined();

    // Legacy is archived and frozen, so its child's placement is inserted the way a stored one exists.
    const stored = { ...(await harness.shortcuts.list())[0]!, id: 'shortcut-legacy-child' as SectionShortcutId, pageId: LEGACY_CHILD_WORK, sourceSectionId: GARDEN_BRIEF, position: 0 };
    await harness.shortcuts.insert(stored);
    await expect(
      harness.sectionShortcutService.create(harness.actor, LEGACY_CHILD, { pageId: LEGACY_CHILD_WORK, sourceSectionId: RENOVATION_BRIEF }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.sectionShortcutService.update(harness.actor, stored.id, { columnSpan: 6 })).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.sectionShortcutService.move(harness.actor, stored.id, 0)).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.sectionShortcutService.remove(harness.actor, stored.id)).resolves.toBeUndefined();
  });

  it('lets projects.write create on a Work canvas and refuses projects.read alone', async () => {
    const harness = nested();
    const input = { pageId: KITCHEN_WORK, sourceSectionId: GARDEN_BRIEF };

    await expect(
      harness.sectionShortcutService.create(agentActorFor(0, ['projects.read']), KITCHEN, input),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      harness.sectionShortcutService.create(agentActorFor(0, ['projects.read', 'projects.write']), KITCHEN, input),
    ).resolves.toMatchObject({ pageId: KITCHEN_WORK });
  });
});
