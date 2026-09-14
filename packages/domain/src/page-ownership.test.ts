import type { ProjectId, ProjectPage, ProjectSection } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { EntityNotFoundError } from './errors';

type Harness = ReturnType<typeof buildHarness>;

/** A root with its Home and an enabled Reflections page — the first shape with two canvases. */
const rootWithReflections = async (harness: Harness): Promise<{ home: ProjectPage; reflections: ProjectPage }> => {
  const reflections = await harness.projectPageService.setEnabled(harness.actor, MINE, {
    kind: 'reflections',
    enabled: true,
  });
  const home = (await harness.pages.list({ projectId: MINE, kind: 'home' }))[0]!;
  return { home, reflections };
};

const positionsOn = async (harness: Harness, page: ProjectPage): Promise<Array<[string, number]>> =>
  (await harness.sections.list({ pageId: page.id }))
    .sort((a, b) => a.position - b.position)
    .map((section) => [section.id, section.position] as [string, number]);

/**
 * Archives a project by writing the status straight to the repository, bypassing
 * `ProjectService.archive`'s active-children guard. That guard is what makes the states below
 * unreachable through the domain — which is the point: a hidden descendant arrives in a seed
 * or a hand-edited `data.json` (§14), so its fixture has to arrive the same way.
 */
const archiveDirectly = async (harness: Harness, projectId: ProjectId): Promise<void> => {
  const project = (await harness.projects.list({})).find(({ id }) => id === projectId)!;
  await harness.store.runUnitOfWork(async () => {
    await harness.projects.update({ ...project, status: 'archived' });
  });
};

const subprojectOf = async (harness: Harness, parentProjectId: ProjectId = MINE, name = 'Kitchen') =>
  harness.projectService.create(harness.actor, {
    kind: 'subproject',
    parentProjectId,
    workspaceId: harness.actor.workspaceId,
    name,
  });

describe('a page owns its sections (§27, §30)', () => {
  it('lets Home and the Reflections page own different reflection containers', async () => {
    const harness = buildHarness();
    const { home, reflections } = await rootWithReflections(harness);

    const onHome = await harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: home.id });
    const onPage = await harness.sectionService.add(harness.actor, MINE, {
      type: 'reflections',
      pageId: reflections.id,
    });
    const journal = await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      sectionId: onPage.id,
      body: 'What went well',
    });
    await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      sectionId: onHome.id,
      body: 'A note on the canvas',
    });

    expect(onHome.pageId).toBe(home.id);
    expect(onPage.pageId).toBe(reflections.id);
    // Each container renders what it owns and nothing the other holds.
    const held = await harness.reflectionService.list(harness.actor, MINE, { sectionId: onPage.id });
    expect(held.map(({ id }) => id)).toEqual([journal.id]);
    expect(await harness.sectionService.list(harness.actor, MINE, { pageId: reflections.id })).toEqual([onPage]);
  });

  it('keeps a root’s task list and a sub-project’s distinct', async () => {
    const harness = buildHarness();
    const subproject = await subprojectOf(harness);

    const rootTask = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Plan the year' });
    const unitTask = await harness.taskService.create(harness.actor, {
      projectId: subproject.id,
      title: 'Measure the wall',
    });

    const rootSection = await harness.sectionService.requireWithin(harness.actor, rootTask.sectionId);
    const unitSection = await harness.sectionService.requireWithin(harness.actor, unitTask.sectionId);
    expect(rootSection.pageId).not.toBe(unitSection.pageId);
    expect(await harness.taskService.list(harness.actor, { sectionId: rootSection.id })).toHaveLength(1);
    expect(await harness.taskService.list(harness.actor, { sectionId: unitSection.id })).toHaveLength(1);
  });

  /**
   * §27: *"Nothing supplied — a root resolves a matching container on Home."* Staged so that a
   * project-wide search would answer differently: the Reflections page holds a container at
   * position 0 before Home holds anything at all.
   */
  it('lands a default write on the canonical canvas, not on whichever page happens to be first', async () => {
    const harness = buildHarness();
    const { home, reflections } = await rootWithReflections(harness);
    await harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: reflections.id });

    const written = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'Week one' });

    const container = await harness.sectionService.requireWithin(harness.actor, written.sectionId);
    expect(container.pageId).toBe(home.id);
  });

  it('resolves a named page, and refuses one that does not take that data rather than falling back', async () => {
    const harness = buildHarness();
    const { reflections } = await rootWithReflections(harness);

    const written = await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      pageId: reflections.id,
      body: 'Written straight to the page',
    });
    expect((await harness.sectionService.requireWithin(harness.actor, written.sectionId)).pageId).toBe(reflections.id);

    // A task list is not something a Reflections page holds (§30), so this is a refusal and
    // *not* a quiet fallback to Home — the writer would believe it had gone where they said.
    await expect(
      harness.taskService.create(harness.actor, { projectId: MINE, pageId: reflections.id, title: 'Buy tiles' }),
    ).rejects.toThrow(/does not hold task-list sections/);
  });

  it('rejects an explicit section that disagrees with an explicit page', async () => {
    const harness = buildHarness();
    const { home, reflections } = await rootWithReflections(harness);
    const onPage = await harness.sectionService.add(harness.actor, MINE, {
      type: 'reflections',
      pageId: reflections.id,
    });

    await expect(
      harness.reflectionService.create(harness.actor, {
        projectId: MINE,
        pageId: home.id,
        sectionId: onPage.id,
        body: 'Contradictory',
      }),
    ).rejects.toThrow(/not on the named page/);
  });

  /** The third case §27 covers: a subtask inherits its parent's section, page included. */
  it('rejects a page that disagrees with the section a subtask inherits', async () => {
    const harness = buildHarness();
    const { reflections } = await rootWithReflections(harness);
    const parent = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Tile the wall' });

    await expect(
      harness.taskService.create(harness.actor, {
        projectId: MINE,
        parentTaskId: parent.id,
        pageId: reflections.id,
        title: 'Buy grout',
      }),
    ).rejects.toThrow(/cannot be given another page/);
  });
});

describe('ordering is per page (§27)', () => {
  const stage = async (harness: Harness) => {
    const { home, reflections } = await rootWithReflections(harness);
    const first = await harness.sectionService.add(harness.actor, MINE, {
      type: 'rich-text', pageId: home.id, config: { text: 'Keep this section for the ordering test' },
    });
    const second = await harness.sectionService.add(harness.actor, MINE, { type: 'progress', pageId: home.id });
    const journal = await harness.sectionService.add(harness.actor, MINE, {
      type: 'reflections',
      pageId: reflections.id,
    });
    return { home, reflections, first, second, journal };
  };

  it('numbers each page from zero', async () => {
    const harness = buildHarness();
    const { first, second, journal } = await stage(harness);

    expect([first.position, second.position]).toEqual([0, 1]);
    expect(journal.position).toBe(0);
  });

  it('does not renumber another page when one reorders', async () => {
    const harness = buildHarness();
    const { home, reflections, second } = await stage(harness);
    const before = await positionsOn(harness, reflections);

    await harness.sectionService.move(harness.actor, second.id, 0);

    expect((await positionsOn(harness, home)).map(([, position]) => position)).toEqual([0, 1]);
    expect(await positionsOn(harness, reflections)).toEqual(before);
  });

  it('does not renumber another page when one is removed and restored', async () => {
    const harness = buildHarness();
    const { home, reflections, first } = await stage(harness);
    const before = await positionsOn(harness, reflections);

    const { section: archived } = await harness.sectionService.remove(harness.actor, first.id);
    expect(await positionsOn(harness, reflections)).toEqual(before);

    const restored = await harness.sectionService.restoreSection(harness.actor, archived.id);
    // Back at the end of **its own** page, which has one other live section.
    expect(restored.pageId).toBe(home.id);
    expect(restored.position).toBe(1);
    expect(await positionsOn(harness, reflections)).toEqual(before);
  });

  it('duplicates onto the owning page and renumbers only that page', async () => {
    const harness = buildHarness();
    const { home, reflections, first } = await stage(harness);
    const before = await positionsOn(harness, reflections);

    const copy = await harness.sectionService.duplicate(harness.actor, first.id);

    expect(copy.pageId).toBe(home.id);
    expect((await positionsOn(harness, home)).map(([, position]) => position)).toEqual([0, 1, 2]);
    expect(await positionsOn(harness, reflections)).toEqual(before);
  });

  it('restores a Home section after its shortcut placements', async () => {
    const harness = buildHarness();
    const sourceProject = await subprojectOf(harness, MINE, 'Kitchen');
    const source = await harness.sectionService.add(harness.actor, sourceProject.id, { type: 'task-list' });
    const { home } = await rootWithReflections(harness);
    const own = await harness.sectionService.add(harness.actor, MINE, {
      type: 'rich-text', pageId: home.id, config: { text: 'Keep this canvas note' },
    });
    const shortcut = await harness.sectionShortcutService.create(harness.actor, MINE, {
      pageId: home.id,
      sourceSectionId: source.id,
    });
    await harness.sectionService.remove(harness.actor, own.id);

    const restored = await harness.sectionService.restoreSection(harness.actor, own.id);

    expect((await harness.shortcuts.find(shortcut.id))?.position).toBe(0);
    expect(restored.pageId).toBe(home.id);
    expect(restored.position).toBe(1);
  });

  /**
   * **A canvas is a page** (§27), so a read that names none answers the *canonical* one rather
   * than the whole project. Running the feature is what made this matter: a project-wide read
   * put the Reflections page's container on Home and its archived sections in Home's Archived
   * region, and enabling an optional page was all it took to reach.
   *
   * Both branches, because the archived one is a direct repository read that does not share
   * the live path's sort.
   */
  it('answers the canonical canvas when no page is named, in both branches', async () => {
    const harness = buildHarness();
    const { home, reflections, first, journal } = await stage(harness);
    await harness.reflectionService.create(harness.actor, { projectId: MINE, sectionId: journal.id, body: 'Archive content' });
    await harness.sectionService.remove(harness.actor, first.id);
    await harness.sectionService.remove(harness.actor, journal.id, { policy: 'cascade' });

    const pagesIn = (sections: ProjectSection[]) => new Set(sections.map(({ pageId }) => pageId));
    const live = await harness.sectionService.list(harness.actor, MINE);
    const all = await harness.sectionService.list(harness.actor, MINE, { includeArchived: true });

    expect(pagesIn(live)).toEqual(new Set([home.id]));
    expect(pagesIn(all)).toEqual(new Set([home.id]));
    expect(all.some(({ id }) => id === first.id)).toBe(true);
    // The other page's archived section belongs to that page's region, not to Home's.
    expect(all.some(({ id }) => id === journal.id)).toBe(false);
    // It is on its own page's region instead — which is where §31 says a canvas's region is.
    const onReflections = await harness.sectionService.list(harness.actor, MINE, {
      pageId: reflections.id,
      includeArchived: true,
    });
    expect(onReflections.map(({ id }) => id)).toEqual([journal.id]);
  });

  it('scopes a list to one page in both branches, and resolves a page it cannot own', async () => {
    const harness = buildHarness();
    const { home, reflections, first, journal } = await stage(harness);
    await harness.reflectionService.create(harness.actor, { projectId: MINE, sectionId: journal.id, body: 'Keep this container' });
    await harness.sectionService.remove(harness.actor, first.id);

    const liveHome = await harness.sectionService.list(harness.actor, MINE, { pageId: home.id });
    const allHome = await harness.sectionService.list(harness.actor, MINE, {
      pageId: home.id,
      includeArchived: true,
    });
    const onPage = await harness.sectionService.list(harness.actor, MINE, {
      pageId: reflections.id,
      includeArchived: true,
    });

    expect(liveHome).toHaveLength(1);
    expect(allHome).toHaveLength(2);
    expect(onPage.map(({ id }) => id)).toEqual([journal.id]);
    // Foreign page, on the read as well as on the write: not found, never an empty page.
    const foreign = (await harness.pages.list({ projectId: THEIRS }))[0]!;
    await expect(
      harness.sectionService.list(harness.actor, MINE, { pageId: foreign.id, includeArchived: true }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe('a disabled page hides navigation, not data (§27)', () => {
  const staged = async (harness: Harness) => {
    const { reflections } = await rootWithReflections(harness);
    const journal = await harness.sectionService.add(harness.actor, MINE, {
      type: 'reflections',
      pageId: reflections.id,
    });
    const row = await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      sectionId: journal.id,
      body: 'Written while the page was on',
    });
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'reflections', enabled: false });
    return { reflections, journal, row };
  };

  it('refuses every way of placing new content there', async () => {
    const harness = buildHarness();
    const { reflections, journal } = await staged(harness);

    // Named by page, named by section, duplicated, and reassigned into.
    await expect(
      harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: reflections.id }),
    ).rejects.toThrow(/is disabled/);
    await expect(
      harness.reflectionService.create(harness.actor, { projectId: MINE, sectionId: journal.id, body: 'New' }),
    ).rejects.toThrow(/is disabled/);
    await expect(harness.sectionService.duplicate(harness.actor, journal.id)).rejects.toThrow(/is disabled/);

    const onHome = await harness.sectionService.add(harness.actor, MINE, { type: 'reflections' });
    await harness.reflectionService.create(harness.actor, { projectId: MINE, sectionId: onHome.id, body: 'Home' });
    await expect(
      harness.sectionService.remove(harness.actor, onHome.id, {
        policy: 'reassign',
        reassignToSectionId: journal.id,
      }),
    ).rejects.toThrow(/is disabled/);
  });

  /**
   * **A task cannot currently reach a disabled page at all**, and this is where that is stated
   * rather than left as a gap in the coverage. A `task-list` may only sit on a page whose kind
   * accepts it — `home` or `work` (§30) — and neither can ever be disabled: `setEnabled` refuses
   * a canonical kind and every kind on a sub-project, and `validateDocumentIntegrity` rejects a
   * disabled canonical page at load. The only disable-able page that holds sections is
   * Reflections, which holds reflections containers.
   *
   * So the two subtask guards in `TaskService` are uniformity, not coverage: they apply the same
   * rule the reflection paths are pinned on above, on paths that inherit a section and could not
   * otherwise reach it. What *is* reachable — and what this asserts — is the inheritance itself.
   */
  it('gives a subtask its parent’s section, and so its parent’s page', async () => {
    const harness = buildHarness();
    const { home } = await rootWithReflections(harness);
    const parent = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Tile the wall' });

    const child = await harness.taskService.create(harness.actor, {
      projectId: MINE,
      parentTaskId: parent.id,
      title: 'Buy grout',
    });

    expect(child.sectionId).toBe(parent.sectionId);
    expect((await harness.sectionService.requireWithin(harness.actor, child.sectionId)).pageId).toBe(home.id);
  });

  it('keeps reading, editing, reordering, removing and restoring what is already there', async () => {
    const harness = buildHarness();
    const { reflections, journal, row } = await staged(harness);

    expect(await harness.sectionService.list(harness.actor, MINE, { pageId: reflections.id })).toHaveLength(1);
    expect((await harness.reflectionService.list(harness.actor, MINE, { sectionId: journal.id })).length).toBe(1);
    await expect(
      harness.reflectionService.update(harness.actor, row.id, { body: 'Edited' }),
    ).resolves.toMatchObject({ body: 'Edited' });
    await expect(harness.sectionService.update(harness.actor, journal.id, { collapsed: true })).resolves.toBeDefined();
    await expect(harness.sectionService.move(harness.actor, journal.id, 0)).resolves.toBeDefined();

    // Undo is never behind a toggle (§31): removal and restore both work on a disabled page.
    const { section: archived } = await harness.sectionService.remove(harness.actor, journal.id, { policy: 'cascade' });
    const restored = await harness.sectionService.restoreSection(harness.actor, archived.id);
    expect(restored.pageId).toBe(reflections.id);
    expect((await harness.reflections.list({ sectionId: journal.id }))[0]?.archivedAt).toBeUndefined();
  });

  /**
   * `TaskService.update`'s subtask branch re-derives `sectionId` from the parent on **every**
   * update of a task that has one, not only on a reparent — so a disabled-page refusal placed on
   * the branch rather than on the *change* would refuse an ordinary rename. This is the case that
   * distinguishes the two, and it is the reason the check compares against `current.sectionId`.
   */
  it('renames a subtask without treating the inherited section as a placement', async () => {
    const harness = buildHarness();
    const parent = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Tile the wall' });
    const child = await harness.taskService.create(harness.actor, {
      projectId: MINE,
      parentTaskId: parent.id,
      title: 'Buy grout',
    });

    await expect(
      harness.taskService.update(harness.actor, child.id, { title: 'Buy grout and spacers' }),
    ).resolves.toMatchObject({ title: 'Buy grout and spacers', sectionId: parent.sectionId });
  });
});

describe('reassigning rows across pages (§31)', () => {
  it('is allowed within a project — §31 constrains the type, not the page', async () => {
    const harness = buildHarness();
    const { home, reflections } = await rootWithReflections(harness);
    const source = await harness.sectionService.add(harness.actor, MINE, { type: 'reflections', pageId: home.id });
    const target = await harness.sectionService.add(harness.actor, MINE, {
      type: 'reflections',
      pageId: reflections.id,
    });
    const row = await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      sectionId: source.id,
      body: 'Moves with its policy',
    });

    await harness.sectionService.remove(harness.actor, source.id, {
      policy: 'reassign',
      reassignToSectionId: target.id,
    });

    const moved = (await harness.reflections.list({ sectionId: target.id }))[0];
    expect(moved?.id).toBe(row.id);
    // Live, not archived: `reassign` settles the rows under their own policy, so they are not
    // "archived with" the section that gave them up.
    expect(moved?.archivedAt).toBeUndefined();
  });
});

describe('a write-only agent still lands its rows (§54)', () => {
  it('creates a task with an implicit container, a named page, and under a parent', async () => {
    const harness = buildHarness();
    const writer = agentActorFor(0, ['tasks.write']);
    const { home } = await rootWithReflections(harness);

    const implicit = await harness.taskService.create(writer, { projectId: MINE, title: 'Implicit' });
    const named = await harness.taskService.create(writer, { projectId: MINE, pageId: home.id, title: 'On Home' });
    const subtask = await harness.taskService.create(writer, {
      projectId: MINE,
      parentTaskId: implicit.id,
      title: 'Under it',
    });

    expect(named.sectionId).toBe(implicit.sectionId);
    expect(subtask.sectionId).toBe(implicit.sectionId);
  });

  it('creates a reflection with an implicit container and with a named page', async () => {
    const harness = buildHarness();
    const writer = agentActorFor(0, ['reflections.write']);
    const { reflections } = await rootWithReflections(harness);

    const implicit = await harness.reflectionService.create(writer, { projectId: MINE, body: 'Implicit' });
    const onPage = await harness.reflectionService.create(writer, {
      projectId: MINE,
      pageId: reflections.id,
      body: 'On the page',
    });

    expect(implicit.sectionId).not.toBe(onPage.sectionId);
  });

  it('answers not found for a page in another workspace', async () => {
    const harness = buildHarness();
    const foreign = (await harness.pages.list({ projectId: THEIRS }))[0]!;

    for (const failure of [
      harness.sectionService.add(harness.actor, MINE, { type: 'task-list', pageId: foreign.id }),
      harness.taskService.create(harness.actor, { projectId: MINE, pageId: foreign.id, title: 'Nope' }),
      harness.reflectionService.create(harness.actor, { projectId: MINE, pageId: foreign.id, body: 'Nope' }),
    ]) {
      await expect(failure).rejects.toBeInstanceOf(EntityNotFoundError);
    }
  });
});

describe('archived ancestors (§31)', () => {
  /**
   * `assertNoActiveChildren` forces children archived before an ancestor can be, and this
   * slice refuses the two ways back in, so a live descendant of an archived ancestor cannot be
   * reached through the services any more. The fixture is written straight to the repositories
   * — which is also how one arrives in a seed or a hand-edited `data.json` (§14).
   */
  const hiddenTree = async (harness: Harness, archived: 'root' | 'middle') => {
    const middle = await subprojectOf(harness, MINE, 'Middle');
    const leaf = await subprojectOf(harness, middle.id, 'Leaf');
    await archiveDirectly(harness, archived === 'root' ? MINE : middle.id);
    return { middle, leaf };
  };

  it('hides a live grandchild of an archived root from ordinary reads', async () => {
    const harness = buildHarness();
    const middle = await subprojectOf(harness, MINE, 'Middle');
    const leaf = await harness.projectService.create(harness.actor, {
      kind: 'subproject',
      parentProjectId: middle.id,
      workspaceId: harness.actor.workspaceId,
      name: 'Leaf',
      status: 'active',
    });
    // The work is written while the tree is live; the root is archived underneath it after.
    // Overdue against `SEED_NOW`, so it would reach the dashboard and upcoming work if it
    // were visible at all.
    await harness.taskService.create(harness.actor, {
      projectId: leaf.id,
      title: 'Leaf work still open',
      dueAt: '2026-08-20T09:00:00.000Z',
    });
    await archiveDirectly(harness, MINE);

    expect((await harness.projectService.list(harness.actor, {})).map(({ id }) => id)).not.toContain(leaf.id);

    const dashboard = await harness.dashboardService.load(harness.actor, {});
    expect(dashboard.activeProjects.map(({ id }) => id)).not.toContain(leaf.id);
    expect(dashboard.today.overdue).toEqual([]);
    expect((await harness.workspaceService.search(harness.actor, { query: 'Leaf', limit: 20 })).hits).toEqual([]);
    expect((await harness.workspaceService.upcomingWork(harness.actor, { days: 7, limit: 20 })).overdue).toEqual([]);
    // The unscoped task list drops it too — §31's "hides its live contents from ordinary reads".
    expect((await harness.taskService.list(harness.actor, {})).map(({ projectId }) => projectId)).not.toContain(
      leaf.id,
    );
  });

  it('hides a live grandchild of an archived *intermediate* ancestor', async () => {
    const harness = buildHarness();
    const { middle, leaf } = await hiddenTree(harness, 'middle');

    const listed = (await harness.projectService.list(harness.actor, {})).map(({ id }) => id);
    expect(listed).toContain(MINE);
    // Archived in its own right, so still listed — it is what `status: ['archived']` asks for.
    expect(listed).toContain(middle.id);
    expect(listed).not.toContain(leaf.id);
  });

  it('refuses writes beneath an archived ancestor, naming the ancestor', async () => {
    const harness = buildHarness();
    const { middle, leaf } = await hiddenTree(harness, 'middle');

    for (const failure of [
      harness.taskService.create(harness.actor, { projectId: leaf.id, title: 'Sneaking in' }),
      harness.reflectionService.create(harness.actor, { projectId: leaf.id, body: 'Sneaking in' }),
      harness.sectionService.add(harness.actor, leaf.id, { type: 'task-list' }),
    ]) {
      await expect(failure).rejects.toThrow(new RegExp(`inside archived project "${middle.id}"`));
    }
  });

  /** §31: an archived project's own page keeps rendering, so a read that named it answers. */
  it('still answers a read that named the archived project itself', async () => {
    const harness = buildHarness();
    const section = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    await harness.taskService.create(harness.actor, { projectId: MINE, sectionId: section.id, title: 'Filed away' });
    await harness.projectService.archive(harness.actor, MINE);

    expect(await harness.sectionService.list(harness.actor, MINE)).toHaveLength(1);
    expect(await harness.taskService.list(harness.actor, { projectId: MINE })).toHaveLength(1);
    // And the canvas's own read, which names a section and no project at all.
    expect(await harness.taskService.list(harness.actor, { sectionId: section.id })).toHaveLength(1);
  });

  it('refuses new work under an archived grandparent, on create and on reparent', async () => {
    const harness = buildHarness();
    const middle = await subprojectOf(harness, MINE, 'Middle');
    const elsewhere = await subprojectOf(harness, MINE, 'Elsewhere');
    await archiveDirectly(harness, MINE);

    await expect(
      harness.projectService.create(harness.actor, {
        kind: 'subproject',
        parentProjectId: middle.id,
        workspaceId: harness.actor.workspaceId,
        name: 'New work',
      }),
    ).rejects.toThrow(new RegExp(`project "${MINE}" is archived and cannot take new work`));

    await expect(
      harness.projectService.update(harness.actor, elsewhere.id, { parentProjectId: middle.id }),
    ).rejects.toThrow(/is archived and cannot take new work/);
  });

  it('refuses reactivation beneath an archived ancestor, and keeps the way out open', async () => {
    const harness = buildHarness();
    const middle = await subprojectOf(harness, MINE, 'Middle');
    await harness.projectService.archive(harness.actor, middle.id);
    await harness.projectService.archive(harness.actor, MINE);

    await expect(
      harness.projectService.update(harness.actor, middle.id, { status: 'active' }),
    ).rejects.toThrow(new RegExp(`project "${MINE}" is archived`));

    // The hatch: a rename still works, `get` still resolves it, and reactivating while moving
    // to a live parent in one call succeeds — the check reads the *next* parent, not the old.
    const other = await harness.projectService.create(harness.actor, {
      kind: 'root',
      workspaceId: harness.actor.workspaceId,
      name: 'Somewhere live',
    });
    await expect(harness.projectService.get(harness.actor, middle.id)).resolves.toMatchObject({ id: middle.id });
    await expect(
      harness.projectService.update(harness.actor, middle.id, { name: 'Renamed while hidden' }),
    ).resolves.toMatchObject({ name: 'Renamed while hidden' });
    await expect(
      harness.projectService.update(harness.actor, middle.id, { status: 'active', parentProjectId: other.id }),
    ).resolves.toMatchObject({ status: 'active', parentProjectId: other.id });
  });
});

describe('the read models this slice deliberately did not change', () => {
  /** §39's formula measures the *direct* tasks of the project named, and still does. */
  it('leaves progress measuring direct tasks only', async () => {
    const harness = buildHarness();
    const subproject = await subprojectOf(harness);
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Mine' });
    await harness.taskService.create(harness.actor, { projectId: subproject.id, title: 'Theirs' });

    expect(await harness.progressService.calculate(harness.actor, MINE)).toMatchObject({ total: 1 });
  });

  /**
   * `TimelineService` prunes archived subtrees relative to the project asked about, rather
   * than globally — which is why it keeps answering for an archived project.
   */
  it('leaves the timeline’s root-relative descendant scope alone', async () => {
    const harness = buildHarness();
    const subproject = await subprojectOf(harness);
    await harness.projectService.update(harness.actor, subproject.id, { targetDate: '2026-10-01' });
    await harness.projectService.update(harness.actor, MINE, { targetDate: '2026-12-01' });
    await harness.projectService.archive(harness.actor, subproject.id);
    await harness.projectService.archive(harness.actor, MINE);

    const timeline = await harness.timelineService.derive(harness.actor, MINE);

    expect(timeline.items.map(({ kind }) => kind)).toEqual(['project']);
  });
});
