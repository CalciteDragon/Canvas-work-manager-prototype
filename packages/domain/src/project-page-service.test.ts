import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError } from './errors';

const subprojectOf = async (harness: ReturnType<typeof buildHarness>) =>
  harness.projectService.create(harness.actor, {
    kind: 'subproject',
    parentProjectId: MINE,
    workspaceId: harness.actor.workspaceId,
    name: 'Kitchen',
  });

describe('ProjectPageService.list (§26)', () => {
  it('answers a new root with Home and nothing else', async () => {
    const harness = buildHarness();

    const pages = await harness.projectPageService.list(harness.actor, MINE);

    expect(pages.map(({ kind }) => kind)).toEqual(['home']);
    expect(pages[0]).toMatchObject({ projectId: MINE, enabled: true });
  });

  /**
   * The list is the toggle surface, not the navigation, so a disabled page has to be in it —
   * a list that hid them could not offer to turn one back on.
   */
  it('keeps a disabled page in the list, in §23’s column order', async () => {
    const harness = buildHarness();
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'reflections', enabled: true });
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'todos', enabled: true });
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'todos', enabled: false });

    const pages = await harness.projectPageService.list(harness.actor, MINE);

    expect(pages.map(({ kind }) => kind)).toEqual(['home', 'todos', 'reflections']);
    expect(pages.map(({ enabled }) => enabled)).toEqual([true, false, true]);
  });

  it('answers a sub-project with its one work canvas', async () => {
    const harness = buildHarness();
    const subproject = await subprojectOf(harness);

    const pages = await harness.projectPageService.list(harness.actor, subproject.id);

    expect(pages.map(({ kind }) => kind)).toEqual(['work']);
  });

  it('needs projects.read', async () => {
    const harness = buildHarness();

    await expect(harness.projectPageService.list(agentActorFor(0, []), MINE)).rejects.toThrow(/projects\.read/);
  });

  it('answers not found for another workspace’s project', async () => {
    const harness = buildHarness();

    await expect(harness.projectPageService.list(harness.actor, THEIRS)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe('ProjectPageService.setEnabled (§26, §31)', () => {
  it('creates the record on the first enable', async () => {
    const harness = buildHarness();

    const page = await harness.projectPageService.setEnabled(harness.actor, MINE, {
      kind: 'todos',
      enabled: true,
    });

    expect(page).toMatchObject({ projectId: MINE, kind: 'todos', enabled: true });
    expect(await harness.pages.list({ projectId: MINE })).toHaveLength(2);
  });

  /**
   * §26: disabling keeps the content, the layout and every reference. Structural rather than
   * asserted only at the surface — the same page id comes back, holding the same sections at
   * the same positions.
   */
  it('is nondestructive: disable then re-enable keeps the page, its sections and their order', async () => {
    const harness = buildHarness();
    const page = await harness.projectPageService.setEnabled(harness.actor, MINE, {
      kind: 'reflections',
      enabled: true,
    });
    const first = await harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: page.id });
    const before = await harness.sections.list({ pageId: page.id });

    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'reflections', enabled: false });
    const restored = await harness.projectPageService.setEnabled(harness.actor, MINE, {
      kind: 'reflections',
      enabled: true,
    });

    expect(restored.id).toBe(page.id);
    expect(await harness.sections.list({ pageId: page.id })).toEqual(before);
    expect(before.map(({ id }) => id)).toEqual([first.id]);
  });

  it('records enabling and disabling against the project, and records nothing for a no-op', async () => {
    const harness = buildHarness();

    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'todos', enabled: true });
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'todos', enabled: true });
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'todos', enabled: false });

    const events = await harness.activities.list({ projectId: MINE });
    expect(events.map(({ action }) => action)).toEqual(['project.page_enabled', 'project.page_disabled']);
    expect(events.every(({ entityType, entityId }) => entityType === 'project' && entityId === MINE)).toBe(true);
  });

  it('refuses to disable the required Home page', async () => {
    const harness = buildHarness();

    await expect(
      harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'home', enabled: false }),
    ).rejects.toThrow(/required and cannot be disabled/);
  });

  /** §26: a work canvas is a page record, not a tab — it cannot be added, disabled or chosen. */
  it('refuses a work page on a root, and every kind on a sub-project', async () => {
    const harness = buildHarness();
    const subproject = await subprojectOf(harness);

    await expect(
      harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'work', enabled: true }),
    ).rejects.toThrow(/not one a root can configure/);
    for (const kind of ['home', 'work', 'todos', 'archive', 'reflections'] as const) {
      await expect(
        harness.projectPageService.setEnabled(harness.actor, subproject.id, { kind, enabled: true }),
      ).rejects.toThrow(/one work canvas and no pages to configure/);
    }
  });

  it('refuses to disable a page that was never enabled', async () => {
    const harness = buildHarness();

    await expect(
      harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'archive', enabled: false }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  /**
   * §31: *"Because undo must never be behind a toggle, disabling the Archive page leaves Open
   * archive in the project controls, which enables and opens it."* So this is the one write the
   * archive freeze does not cover.
   */
  it('is allowed on an archived project, so the archive is never trapped behind its own toggle', async () => {
    const harness = buildHarness();
    await harness.projectService.archive(harness.actor, MINE);

    const page = await harness.projectPageService.setEnabled(harness.actor, MINE, {
      kind: 'archive',
      enabled: true,
    });

    expect(page).toMatchObject({ kind: 'archive', enabled: true });
  });

  it('needs projects.write', async () => {
    const harness = buildHarness();

    await expect(
      harness.projectPageService.setEnabled(agentActorFor(0, ['projects.read']), MINE, {
        kind: 'todos',
        enabled: true,
      }),
    ).rejects.toThrow(/projects\.write/);
  });

  it('answers not found for another workspace’s project', async () => {
    const harness = buildHarness();

    await expect(
      harness.projectPageService.setEnabled(harness.actor, THEIRS, { kind: 'todos', enabled: true }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  /** A rejected unit leaves nothing behind — no half-created page, and no announcement. */
  it('leaves no page record when the unit of work fails', async () => {
    const frames: unknown[] = [];
    const harness = buildHarness(undefined, { events: { publish: (publication) => void frames.push(publication) } });
    // Delegating explicitly rather than spreading: `harness.pages` is a class instance, and a
    // spread copies its own properties, not its prototype's methods.
    const failing = {
      find: (id: Parameters<typeof harness.pages.find>[0]) => harness.pages.find(id),
      list: (query?: Parameters<typeof harness.pages.list>[0]) => harness.pages.list(query),
      update: (page: Parameters<typeof harness.pages.update>[0]) => harness.pages.update(page),
      insert: async () => { throw new Error('disk gave up'); },
    };
    const service = new (await import('./project-page-service')).ProjectPageService({
      pages: failing,
      projects: harness.projects,
      activity: harness.activity,
      clock: harness.clock,
      ids: harness.ids,
      unitOfWork: (await import('@cwm/repositories')).unitOfWorkFor(harness.store),
    });

    await expect(service.setEnabled(harness.actor, MINE, { kind: 'todos', enabled: true })).rejects.toThrow(
      /disk gave up/,
    );

    expect(await harness.pages.list({ projectId: MINE })).toHaveLength(1);
    expect(frames).toEqual([]);
  });
});
