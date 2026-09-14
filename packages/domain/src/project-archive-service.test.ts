import type { AgentPermission, ProjectArchiveItem } from '@cwm/contracts';
import { buildSeed } from '@cwm/prototype-data';
import { describe, expect, it } from 'vitest';
import { buildHarness } from '../test/test-support';
import { ProjectArchiveService } from './project-archive-service';

const ROOT = 'project-renovation' as never;
const KITCHEN = 'project-kitchen' as never;
const ROOT_TASKS = 'section-project-renovation-tasks' as never;
const ROOT_HOME = 'page-project-renovation';

const buildArchive = () => {
  const harness = buildHarness(buildSeed('nested-projects'));
  const reads: string[] = [];
  // Records every repository call, so a permission test can prove it refused first.
  const watch = <T extends object>(name: string, repository: T): T =>
    new Proxy(repository, {
      get: (target, property, receiver) => {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          reads.push(`${name}.${String(property)}`);
          return (value as (...values: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  const archive = new ProjectArchiveService({
    projects: watch('projects', harness.projects),
    pages: watch('pages', harness.pages),
    sections: watch('sections', harness.sections),
    tasks: watch('tasks', harness.tasks),
    reflections: watch('reflections', harness.reflections),
  });
  return { harness, archive, reads };
};

const keyOf = (item: ProjectArchiveItem): string =>
  `${item.kind}:${item.kind === 'subproject' ? item.project.id : item.kind === 'section' ? item.section.id : item.kind === 'task' ? item.task.id : item.reflection.id}`;

const sectionItem = (items: readonly ProjectArchiveItem[], id: string) =>
  items.find(
    (item): item is Extract<ProjectArchiveItem, { kind: 'section' }> => item.kind === 'section' && item.section.id === id,
  );

describe('ProjectArchiveService (§31)', () => {
  it('includes the whole selected tree once, with causes and actionable blockers', async () => {
    const { harness, archive } = buildArchive();
    const taskContainer = await harness.sectionService.add(harness.actor, ROOT, { type: 'task-list' });
    const parent = await harness.taskService.create(harness.actor, {
      projectId: ROOT,
      sectionId: taskContainer.id,
      title: 'Parent task',
    });
    const child = await harness.taskService.create(harness.actor, {
      projectId: ROOT,
      sectionId: taskContainer.id,
      parentTaskId: parent.id,
      title: 'Child task',
    });
    await harness.taskService.archive(harness.actor, parent.id);

    const independent = await harness.taskService.create(harness.actor, {
      projectId: ROOT,
      sectionId: ROOT_TASKS,
      title: 'Archived before section removal',
    });
    await harness.taskService.archive(harness.actor, independent.id);
    await harness.sectionService.remove(harness.actor, ROOT_TASKS, { policy: 'cascade' });

    // This is a valid hand-edited state explicitly called out by the plan: the canonical
    // project writer refuses it, but Archive must still make the live descendants findable.
    await harness.store.runUnitOfWork(async () => {
      const project = await harness.projects.find(KITCHEN);
      if (project === null || project.kind !== 'subproject') throw new Error('fixture project missing');
      await harness.projects.update({ ...project, status: 'archived' });
    });

    const result = await archive.derive(harness.actor, ROOT);
    const keys = result.items.map((item) => `${item.kind}:${item.kind === 'subproject' ? item.project.id : item.kind === 'section' ? item.section.id : item.kind === 'task' ? item.task.id : item.reflection.id}`);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(`task:${parent.id}`);
    expect(keys).toContain(`task:${child.id}`);
    expect(keys).toContain(`section:${ROOT_TASKS}`);

    const childItem = result.items.find((item) => item.kind === 'task' && item.task.id === child.id);
    expect(childItem).toMatchObject({
      cause: { kind: 'task-cascade', taskId: parent.id },
      restoration: { kind: 'blocked', blocker: { kind: 'task', taskId: parent.id } },
    });

    const hiddenKitchen = result.items.find((item) => item.kind === 'section' && item.section.projectId === KITCHEN);
    expect(hiddenKitchen).toMatchObject({
      cause: { kind: 'hidden-by-project', projectId: KITCHEN },
      restoration: { kind: 'not-archived', blocker: { kind: 'project', projectId: KITCHEN } },
    });

    const hiddenCabinets = result.items.find((item) => item.kind === 'subproject' && item.project.id === 'project-cabinets');
    expect(hiddenCabinets).toMatchObject({
      cause: { kind: 'hidden-by-project', projectId: KITCHEN },
      restoration: { kind: 'not-archived', blocker: { kind: 'project', projectId: KITCHEN } },
    });
  });

  it('keeps independently archived sections and subprojects blocked by their archived ancestor', async () => {
    const { harness, archive } = buildArchive();
    const section = await harness.sectionService.add(harness.actor, KITCHEN, { type: 'rich-text' });
    await harness.sectionService.remove(harness.actor, section.id);
    await harness.projectService.archive(harness.actor, 'project-cabinets' as never);
    await harness.projectService.archive(harness.actor, KITCHEN);

    const result = await archive.derive(harness.actor, ROOT);
    const blocked = { kind: 'blocked', blocker: { kind: 'project', projectId: KITCHEN } };
    expect(result.items.find((item) => item.kind === 'section' && item.section.id === section.id))
      .toMatchObject({ cause: { kind: 'own' }, restoration: blocked });
    expect(result.items.find((item) => item.kind === 'subproject' && item.project.id === 'project-cabinets'))
      .toMatchObject({ cause: { kind: 'own' }, restoration: blocked });
  });

  it('requires all combined read grants before touching repositories', async () => {
    const { archive } = buildArchive();
    const actor = {
      actor: 'agent' as const,
      workspaceId: 'workspace-demo' as never,
      agentConnectionId: 'agent-claude' as never,
      permissions: ['projects.read', 'tasks.read'] as const,
    };
    await expect(archive.derive(actor, ROOT)).rejects.toThrow(/reflections\.read/);
  });

  it('can query an archived root and refuses a subproject as a root', async () => {
    const { harness, archive } = buildArchive();
    await harness.store.runUnitOfWork(async () => {
      const project = await harness.projects.find(ROOT);
      if (project === null) throw new Error('fixture root missing');
      await harness.projects.update({ ...project, status: 'archived' });
    });

    await expect(archive.derive(harness.actor, ROOT)).resolves.toMatchObject({ root: { status: 'archived' } });
    await expect(archive.derive(harness.actor, KITCHEN)).rejects.toThrow(/only a root project/);
  });
});

describe('ProjectArchiveService content projection (Refactor §14 Archive column)', () => {
  const VIEWS = ['sub-projects', 'progress', 'timeline', 'recent-activity'].map(
    (type) => `section-project-renovation-${type}`,
  );

  it('keeps disposable view tombstones in storage but out of Archive', async () => {
    const { harness, archive } = buildArchive();
    for (const id of VIEWS) await harness.sectionService.remove(harness.actor, id as never);
    // A legacy tombstone written before this projection existed, carrying display config.
    await harness.store.runUnitOfWork(async () => {
      const timeline = await harness.sections.find('section-project-kitchen-timeline' as never);
      if (timeline === null) throw new Error('fixture section missing');
      await harness.sections.update({ ...timeline, config: { range: 'quarter' }, archivedAt: '2026-08-01T00:00:00.000Z' });
    });

    const keys = (await archive.derive(harness.actor, ROOT)).items.map(keyOf);

    for (const id of [...VIEWS, 'section-project-kitchen-timeline']) {
      expect((await harness.sections.find(id as never))?.archivedAt).toBeDefined();
      expect(keys).not.toContain(`section:${id}`);
    }
    // Rows, projects and meaningful sections are untouched by the section filter.
    expect(keys).toEqual(
      expect.arrayContaining([
        'section:section-project-renovation-archived-notes',
        'task:task-renovation-archived',
        'subproject:project-legacy',
        'subproject:project-legacy-child',
      ]),
    );
  });

  it('lists meaningful prose with config metadata, and unknown content conservatively', async () => {
    const { harness, archive } = buildArchive();
    const empty = await harness.sectionService.add(harness.actor, ROOT, { type: 'rich-text', config: { text: ' \n\t ' } });
    const unconfigured = await harness.sectionService.add(harness.actor, ROOT, { type: 'rich-text' });
    const unknown = await harness.sectionService.add(harness.actor, ROOT, { type: 'calendar', config: { view: 'month' } });
    for (const { id } of [empty, unconfigured, unknown]) await harness.sectionService.remove(harness.actor, id);

    const { items } = await archive.derive(harness.actor, ROOT);

    expect(sectionItem(items, 'section-project-renovation-archived-notes')).toMatchObject({
      section: { config: { text: 'Old attic notes' } },
      recovery: { kind: 'config' },
      origin: {
        pageId: ROOT_HOME,
        pageKind: 'home',
        breadcrumb: [{ projectId: ROOT, name: 'Home renovation' }],
        sectionId: 'section-project-renovation-archived-notes',
      },
      restoration: { kind: 'ready', operation: 'restore_section' },
    });
    expect(sectionItem(items, 'section-project-renovation-archived-notes')?.cascadeCount).toBeUndefined();
    expect(sectionItem(items, empty.id)).toBeUndefined();
    expect(sectionItem(items, unconfigured.id)).toMatchObject({ recovery: { kind: 'unknown' }, section: { config: {} } });
    expect(sectionItem(items, unknown.id)).toMatchObject({ recovery: { kind: 'unknown' }, section: { config: { view: 'month' } } });
    expect(items.every((item) => item.kind !== 'section' || item.recovery !== undefined)).toBe(true);
    // The sort is untouched: owner, then kind, then id.
    const sorted = [...items].sort((a, b) =>
      a.origin.projectId === b.origin.projectId ? 0 : a.origin.projectId < b.origin.projectId ? -1 : 1,
    );
    expect(items.map(keyOf)).toEqual(sorted.map(keyOf));
  });

  it('counts total content separately from the exact cascade', async () => {
    const { harness, archive } = buildArchive();
    const list = await harness.sectionService.add(harness.actor, ROOT, { type: 'task-list', title: 'Cascade me' });
    const parent = await harness.taskService.create(harness.actor, { projectId: ROOT, sectionId: list.id, title: 'Parent' });
    await harness.taskService.create(harness.actor, { projectId: ROOT, sectionId: list.id, parentTaskId: parent.id, title: 'Child' });
    const earlier = await harness.taskService.create(harness.actor, { projectId: ROOT, sectionId: list.id, title: 'Filed earlier' });
    await harness.taskService.archive(harness.actor, earlier.id);
    await harness.sectionService.remove(harness.actor, list.id, { policy: 'cascade' });

    const { items } = await archive.derive(harness.actor, ROOT);

    expect(sectionItem(items, list.id)).toMatchObject({
      cascadeCount: 2,
      recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 3 },
    });
  });

  it('leaves out a source emptied by reassignment, which took its archived subtree along', async () => {
    const { harness, archive } = buildArchive();
    const source = await harness.sectionService.add(harness.actor, ROOT, { type: 'task-list' });
    const target = await harness.sectionService.add(harness.actor, ROOT, { type: 'task-list' });
    const live = await harness.taskService.create(harness.actor, { projectId: ROOT, sectionId: source.id, title: 'Live' });
    const parent = await harness.taskService.create(harness.actor, { projectId: ROOT, sectionId: source.id, title: 'Archived parent' });
    const child = await harness.taskService.create(harness.actor, {
      projectId: ROOT,
      sectionId: source.id,
      parentTaskId: parent.id,
      title: 'Archived child',
    });
    await harness.taskService.archive(harness.actor, parent.id);
    await harness.sectionService.remove(harness.actor, source.id, { policy: 'reassign', reassignToSectionId: target.id });

    const { items } = await archive.derive(harness.actor, ROOT);

    expect((await harness.sections.find(source.id))?.archivedAt).toBeDefined();
    expect(sectionItem(items, source.id)).toBeUndefined();
    for (const id of [live.id, parent.id, child.id]) expect((await harness.tasks.find(id))?.sectionId).toBe(target.id);
    expect(items.find((item) => keyOf(item) === `task:${child.id}`)).toMatchObject({
      origin: { sectionId: target.id },
      restoration: { kind: 'blocked', blocker: { kind: 'task', taskId: parent.id } },
    });
  });

  it('keeps an archived-only container visible even when reassign was asked for', async () => {
    const { harness, archive } = buildArchive();
    const source = await harness.sectionService.add(harness.actor, ROOT, { type: 'reflections' });
    const target = await harness.sectionService.add(harness.actor, ROOT, { type: 'reflections' });
    const filed = await harness.reflectionService.create(harness.actor, { projectId: ROOT, sectionId: source.id, body: 'Filed' });
    await harness.reflectionService.archive(harness.actor, filed.id);
    // No live rows, so `settleRows` has no question to ask and nothing moves.
    await harness.sectionService.remove(harness.actor, source.id, { policy: 'reassign', reassignToSectionId: target.id });

    const { items } = await archive.derive(harness.actor, ROOT);

    expect((await harness.reflections.find(filed.id))?.sectionId).toBe(source.id);
    expect(sectionItem(items, source.id)).toMatchObject({
      cascadeCount: 0,
      recovery: { kind: 'owned-content', ownedData: 'reflections', contentCount: 1 },
      restoration: { kind: 'ready' },
    });
    expect(items.find((item) => keyOf(item) === `reflection:${filed.id}`)).toMatchObject({
      restoration: { kind: 'blocked', blocker: { kind: 'section', sectionId: source.id } },
    });
  });

  it('makes a pre-archived-only container the first step of recovering its rows', async () => {
    const { harness, archive } = buildArchive();
    const list = await harness.sectionService.add(harness.actor, ROOT, { type: 'task-list', title: 'Old list' });
    const parent = await harness.taskService.create(harness.actor, { projectId: ROOT, sectionId: list.id, title: 'Parent' });
    const child = await harness.taskService.create(harness.actor, {
      projectId: ROOT,
      sectionId: list.id,
      parentTaskId: parent.id,
      title: 'Child',
    });
    await harness.taskService.archive(harness.actor, parent.id);
    await harness.sectionService.remove(harness.actor, list.id);

    const first = await archive.derive(harness.actor, ROOT);
    expect(sectionItem(first.items, list.id)).toMatchObject({
      cascadeCount: 0,
      recovery: { kind: 'owned-content', contentCount: 2 },
      restoration: { kind: 'ready', operation: 'restore_section' },
    });
    expect(first.items.find((item) => keyOf(item) === `task:${parent.id}`)).toMatchObject({
      restoration: { kind: 'blocked', blocker: { kind: 'section', sectionId: list.id, name: 'Old list' } },
    });

    await harness.sectionService.restoreSection(harness.actor, list.id);
    const second = await archive.derive(harness.actor, ROOT);

    expect(sectionItem(second.items, list.id)).toBeUndefined();
    // The section restore revived nothing it did not take down; the markers still say why.
    expect(second.items.find((item) => keyOf(item) === `task:${parent.id}`)).toMatchObject({
      cause: { kind: 'own' },
      restoration: { kind: 'ready', operation: 'restore_task' },
    });
    expect(second.items.find((item) => keyOf(item) === `task:${child.id}`)).toMatchObject({
      task: { archivedWithTaskId: parent.id },
      restoration: { kind: 'blocked', blocker: { kind: 'task', taskId: parent.id } },
    });
  });

  it('shows meaningful live content beneath an archived project as not-archived, and drops its views', async () => {
    const { harness, archive } = buildArchive();
    await harness.projectService.archive(harness.actor, 'project-cabinets' as never);
    await harness.projectService.archive(harness.actor, KITCHEN);

    const { items } = await archive.derive(harness.actor, ROOT);
    const notArchived = { kind: 'not-archived', blocker: { kind: 'project', projectId: KITCHEN } };

    expect(sectionItem(items, 'section-project-kitchen-brief')).toMatchObject({
      recovery: { kind: 'config' },
      cause: { kind: 'hidden-by-project', projectId: KITCHEN },
      restoration: notArchived,
    });
    expect(sectionItem(items, 'section-project-kitchen-tasks')).toMatchObject({
      recovery: { kind: 'owned-content', ownedData: 'tasks' },
      restoration: notArchived,
    });
    for (const type of ['sub-projects', 'progress', 'timeline', 'recent-activity']) {
      expect(sectionItem(items, `section-project-kitchen-${type}`)).toBeUndefined();
    }
    // An actual archived project stays an entry, whatever happened to the views that listed it.
    expect(items.find((item) => keyOf(item) === 'subproject:project-cabinets')).toMatchObject({
      restoration: { kind: 'blocked', blocker: { kind: 'project', projectId: KITCHEN } },
    });
  });

  it('names the highest archived ancestor above section and task blockers', async () => {
    const { harness, archive } = buildArchive();
    const list = await harness.sectionService.add(harness.actor, KITCHEN, { type: 'task-list' });
    const task = await harness.taskService.create(harness.actor, { projectId: KITCHEN, sectionId: list.id, title: 'Buried' });
    await harness.taskService.archive(harness.actor, task.id);
    await harness.sectionService.remove(harness.actor, list.id);
    await harness.projectService.archive(harness.actor, 'project-cabinets' as never);
    await harness.projectService.archive(harness.actor, KITCHEN);
    await harness.store.runUnitOfWork(async () => {
      const root = await harness.projects.find(ROOT);
      if (root === null) throw new Error('fixture root missing');
      await harness.projects.update({ ...root, status: 'archived' });
    });

    const { items } = await archive.derive(harness.actor, ROOT);
    const blockedByRoot = { kind: 'blocked', blocker: { kind: 'project', projectId: ROOT } };

    expect(sectionItem(items, list.id)).toMatchObject({
      cascadeCount: 0,
      recovery: { kind: 'owned-content', contentCount: 1 },
      restoration: blockedByRoot,
    });
    expect(items.find((item) => keyOf(item) === `task:${task.id}`)).toMatchObject({ restoration: blockedByRoot });
  });

  it('succeeds with exactly the three read grants and refuses each missing one before any read', async () => {
    const grants: AgentPermission[] = ['projects.read', 'tasks.read', 'reflections.read'];
    const agent = (permissions: AgentPermission[]) => ({
      actor: 'agent' as const,
      workspaceId: 'workspace-demo' as never,
      agentConnectionId: 'agent-claude' as never,
      permissions,
    });

    await expect(buildArchive().archive.derive(agent(grants), ROOT)).resolves.toMatchObject({ projectId: ROOT });

    for (const missing of grants) {
      const { archive, reads } = buildArchive();
      await expect(archive.derive(agent(grants.filter((grant) => grant !== missing)), ROOT)).rejects.toThrow(missing);
      expect(reads).toEqual([]);
    }
  });

  it('answers not found for a missing or foreign root and keeps sibling roots apart', async () => {
    const { harness, archive } = buildArchive();
    await expect(archive.derive(harness.actor, 'project-nowhere' as never)).rejects.toThrow(/not found/i);
    await expect(archive.derive(harness.actor, 'project-alex-private' as never)).rejects.toThrow(/not found/i);

    const sibling = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId,
      kind: 'root',
      name: 'Sibling',
    });
    const notes = await harness.sectionService.add(harness.actor, sibling.id, { type: 'rich-text', config: { text: 'Elsewhere' } });
    await harness.sectionService.remove(harness.actor, notes.id);

    expect((await archive.derive(harness.actor, ROOT)).items.map(keyOf)).not.toContain(`section:${notes.id}`);
    expect((await archive.derive(harness.actor, sibling.id)).items.map(keyOf)).toEqual([`section:${notes.id}`]);
  });
});
