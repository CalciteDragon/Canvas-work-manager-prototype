import type { ProjectPageId } from '@cwm/contracts';
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
    type: 'rich-text',
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
    const first = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', pageId: home.id });
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
    const first = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', pageId: home.id });
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
    const first = await harness.sectionService.add(harness.actor, MINE, { type: 'rich-text', pageId: home.id });
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
      type: 'rich-text',
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
});
