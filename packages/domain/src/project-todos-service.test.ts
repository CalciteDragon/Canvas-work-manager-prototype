import { PrototypeDocumentSchema, type ProjectId, type SectionId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';
import { ProjectTodosService } from './project-todos-service';

const AT = '2026-08-01T16:00:00.000Z';

type Harness = ReturnType<typeof buildHarness>;

/**
 * §34's whole surface in one deliberately scrambled scenario: two root containers, a child and
 * a grandchild with a subtask, terminal rows, undated work, equal instants written at three
 * different precisions, archived owners and rows, a sibling root, a foreign root, and two
 * shortcut placements pointing at a populated container.
 *
 * Written straight to the repositories rather than through the services: what is being tested
 * is a read, and a fixture built through `TaskService` would record a dozen §57 events that the
 * "derive changes nothing" assertions would then have to subtract. The archive paths that
 * matter *as writes* are exercised through the services in their own tests below.
 */
const scenario = async (harness: Harness, order: 'as-written' | 'reversed' = 'as-written') => {
  const workspaceId = harness.actor.workspaceId;

  const project = (id: string, extra: Record<string, unknown>) =>
    PrototypeDocumentSchema.shape.projects.element.parse({
      id,
      workspaceId,
      name: `Project ${id}`,
      status: 'active',
      projectLayoutMode: 'flow',
      createdAt: AT,
      updatedAt: AT,
      ...extra,
    });

  const page = (projectId: string, kind: 'home' | 'work') =>
    PrototypeDocumentSchema.shape.projectPages.element.parse({
      id: `page-${projectId}`,
      projectId,
      kind,
      enabled: true,
      createdAt: AT,
      updatedAt: AT,
    });

  const section = (id: string, projectId: string, extra: Record<string, unknown> = {}) =>
    PrototypeDocumentSchema.shape.sections.element.parse({
      id,
      projectId,
      pageId: `page-${projectId}`,
      type: 'task-list',
      position: 0,
      columnSpan: 12,
      collapsed: false,
      config: {},
      createdAt: AT,
      updatedAt: AT,
      ...extra,
    });

  const task = (id: string, projectId: string, sectionId: string, extra: Record<string, unknown> = {}) =>
    PrototypeDocumentSchema.shape.tasks.element.parse({
      id,
      projectId,
      sectionId,
      title: `Task ${id}`,
      status: 'todo',
      priority: 'medium',
      createdAt: AT,
      updatedAt: AT,
      ...extra,
    });

  const shortcut = (id: string, sourceSectionId: string, position: number) =>
    PrototypeDocumentSchema.shape.sectionShortcuts.element.parse({
      id,
      pageId: 'page-project-mine',
      sourceSectionId,
      position,
      columnSpan: 12,
      collapsed: false,
      createdAt: AT,
      updatedAt: AT,
    });

  const projects = [
    project('project-kitchen', { kind: 'subproject', parentProjectId: MINE, targetDate: '2026-09-01' }),
    project('project-tiling', {
      kind: 'subproject',
      parentProjectId: 'project-kitchen',
      targetDate: '2026-09-10',
      status: 'completed',
    }),
    project('project-bathroom', { kind: 'subproject', parentProjectId: MINE }),
    project('project-attic', { kind: 'subproject', parentProjectId: MINE, status: 'archived', targetDate: '2026-08-29' }),
    // Live, and underneath something archived: §31's hidden-content rule, which `isHidden`
    // alone does not answer.
    project('project-attic-loft', { kind: 'subproject', parentProjectId: 'project-attic', targetDate: '2026-08-30' }),
    project('project-sibling', { kind: 'root' }),
  ];

  const pages = [
    page('project-kitchen', 'work'),
    page('project-tiling', 'work'),
    page('project-bathroom', 'work'),
    page('project-attic', 'work'),
    page('project-attic-loft', 'work'),
    page('project-sibling', 'home'),
  ];

  const sections = [
    section('section-mine-a', MINE, { title: 'This week' }),
    section('section-mine-b', MINE, { position: 1 }),
    section('section-mine-gone', MINE, { position: 2, archivedAt: AT }),
    section('section-kitchen', 'project-kitchen'),
    section('section-tiling', 'project-tiling'),
    section('section-bathroom', 'project-bathroom'),
    section('section-attic-loft', 'project-attic-loft'),
    section('section-sibling', 'project-sibling'),
    // The foreign root's own container, so its task is a real row rather than an orphan.
    section('section-theirs', THEIRS),
  ];

  const tasks = [
    task('task-a-early', MINE, 'section-mine-a', { dueAt: '2026-09-01T09:00:00.000Z' }),
    task('task-b-midday', MINE, 'section-mine-b', { dueAt: '2026-09-01T15:30:00.000Z' }),
    // The same instant as `project-kitchen`'s end-of-day due date.
    task('task-c-eod', 'project-kitchen', 'section-kitchen', { dueAt: '2026-09-01T23:59:59.999Z' }),
    task('task-done', MINE, 'section-mine-a', {
      dueAt: '2026-09-02T12:00:00.000Z',
      status: 'done',
      completedAt: '2026-09-02T08:00:00.000Z',
    }),
    task('task-cancelled', MINE, 'section-mine-b', { dueAt: '2026-09-02T13:00:00.000Z', status: 'cancelled' }),
    // One instant, two textual precisions. `b` is written first and sorts second.
    task('task-precision-b', MINE, 'section-mine-a', { dueAt: '2026-09-03T10:00:00.0Z' }),
    task('task-precision-a', MINE, 'section-mine-b', { dueAt: '2026-09-03T10:00Z' }),
    // Sub-millisecond, and the ids point the other way: `a` is the later instant.
    task('task-submilli-a', MINE, 'section-mine-a', { dueAt: '2026-09-04T10:00:00.0009Z' }),
    task('task-submilli-b', MINE, 'section-mine-b', { dueAt: '2026-09-04T10:00:00.0001Z' }),
    task('task-f-later', 'project-tiling', 'section-tiling', { dueAt: '2026-09-05T12:00:00.000Z' }),
    task('task-g-subtask', 'project-tiling', 'section-tiling', {
      dueAt: '2026-09-06T12:00:00.000Z',
      parentTaskId: 'task-f-later',
    }),
    task('task-undated-a', MINE, 'section-mine-a'),
    task('task-undated-b', 'project-bathroom', 'section-bathroom'),
    task('task-archived', MINE, 'section-mine-a', { dueAt: '2026-08-30T09:00:00.000Z', archivedAt: AT }),
    task('task-in-archived-section', MINE, 'section-mine-gone', {
      dueAt: '2026-08-28T09:00:00.000Z',
      archivedAt: AT,
      archivedWithSectionId: 'section-mine-gone',
    }),
    task('task-attic', 'project-attic-loft', 'section-attic-loft', { dueAt: '2026-08-31T09:00:00.000Z' }),
    task('task-sibling', 'project-sibling', 'section-sibling', { dueAt: '2026-09-01T08:00:00.000Z' }),
    task('task-theirs', THEIRS, 'section-theirs', { dueAt: '2026-09-01T07:00:00.000Z' }),
  ];

  const shortcuts = [shortcut('shortcut-one', 'section-kitchen', 0), shortcut('shortcut-two', 'section-kitchen', 1)];

  const arrange = <T>(items: T[]) => (order === 'reversed' ? [...items].reverse() : items);

  for (const record of arrange(projects)) await harness.projects.insert(record);
  for (const record of arrange(pages)) await harness.pages.insert(record);
  for (const record of arrange(sections)) await harness.sections.insert(record);
  for (const record of arrange(tasks)) await harness.tasks.insert(record);
  for (const record of arrange(shortcuts)) await harness.shortcuts.insert(record);
};

const todosServiceFor = (harness: Harness) =>
  new ProjectTodosService({
    projects: harness.projects,
    tasks: harness.tasks,
    sections: harness.sections,
    pages: harness.pages,
  });

const sequenceOf = (result: {
  items: readonly ({ kind: 'task'; task: { id: string } } | { kind: 'subproject'; project: { id: string } })[];
}): string[][] => result.items.map((item) => [item.kind, item.kind === 'task' ? item.task.id : item.project.id]);

/** §34's chronology, written out. Every ordering test compares against this one list. */
const EXPECTED = [
  ['task', 'task-a-early'],
  ['task', 'task-b-midday'],
  ['subproject', 'project-kitchen'],
  ['task', 'task-c-eod'],
  ['task', 'task-done'],
  ['task', 'task-cancelled'],
  ['task', 'task-precision-a'],
  ['task', 'task-precision-b'],
  ['task', 'task-submilli-b'],
  ['task', 'task-submilli-a'],
  ['task', 'task-f-later'],
  ['task', 'task-g-subtask'],
  ['subproject', 'project-tiling'],
  ['subproject', 'project-bathroom'],
  ['task', 'task-undated-a'],
  ['task', 'task-undated-b'],
];

const positionOf = (sequence: string[][], id: string): number => sequence.findIndex(([, candidate]) => candidate === id);

describe('ProjectTodosService.derive — chronology (§34, §45)', () => {
  it('sorts mixed due dates with a work unit at its UTC end of day, and undated last', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const result = await todosServiceFor(harness).derive(harness.actor, MINE);

    expect(sequenceOf(result)).toEqual(EXPECTED);
    expect(result.projectId).toBe(MINE);
  });

  it('is the same chronology when the fixture is inserted in the opposite order', async () => {
    const harness = buildHarness();
    await scenario(harness, 'reversed');

    expect(sequenceOf(await todosServiceFor(harness).derive(harness.actor, MINE))).toEqual(EXPECTED);
  });

  /**
   * `2026-09-03T10:00Z` and `2026-09-03T10:00:00.0Z` are one instant written two ways, and both
   * parse (§11's `IsoDateTimeSchema`). Textual precision must not decide the order — the ids do.
   */
  it('treats equal instants written at different precisions as ties, broken by kind then ordinal id', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const sequence = sequenceOf(await todosServiceFor(harness).derive(harness.actor, MINE));

    expect(positionOf(sequence, 'task-precision-a')).toBeLessThan(positionOf(sequence, 'task-precision-b'));
    // A work unit's end-of-day date and a task at the identical instant: kind decides.
    expect(positionOf(sequence, 'project-kitchen')).toBeLessThan(positionOf(sequence, 'task-c-eod'));
    // Undated rows tie the same way.
    expect(positionOf(sequence, 'project-bathroom')).toBeLessThan(positionOf(sequence, 'task-undated-a'));
  });

  it('keeps distinct sub-millisecond instants in chronological order against opposing ids', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const sequence = sequenceOf(await todosServiceFor(harness).derive(harness.actor, MINE));

    expect(positionOf(sequence, 'task-submilli-b')).toBeLessThan(positionOf(sequence, 'task-submilli-a'));
  });

  it('answers the same order in any host timezone', async () => {
    const original = process.env['TZ'];
    try {
      for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env['TZ'] = zone;
        const harness = buildHarness();
        await scenario(harness);

        expect(sequenceOf(await todosServiceFor(harness).derive(harness.actor, MINE))).toEqual(EXPECTED);
      }
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  });
});

describe('ProjectTodosService.derive — scope (§31, §34)', () => {
  it('lists a nested work unit, its task and its subtask exactly once each', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const sequence = sequenceOf(await todosServiceFor(harness).derive(harness.actor, MINE));

    for (const id of ['project-tiling', 'task-f-later', 'task-g-subtask']) {
      expect(sequence.filter(([, candidate]) => candidate === id)).toHaveLength(1);
    }
  });

  it('keeps completed and cancelled work on the list', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const sequence = sequenceOf(await todosServiceFor(harness).derive(harness.actor, MINE));

    expect(sequence).toContainEqual(['task', 'task-done']);
    expect(sequence).toContainEqual(['task', 'task-cancelled']);
    // A completed work unit is still a row: §34 erases nothing.
    expect(sequence).toContainEqual(['subproject', 'project-tiling']);
  });

  it('never lists the root itself, a sibling root or another workspace', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const sequence = sequenceOf(await todosServiceFor(harness).derive(harness.actor, MINE));

    for (const id of [MINE, 'project-sibling', 'task-sibling', THEIRS, 'task-theirs']) {
      expect(positionOf(sequence, id)).toBe(-1);
    }
  });

  it('excludes an archived owner, everything live beneath it, and archived rows and containers', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const sequence = sequenceOf(await todosServiceFor(harness).derive(harness.actor, MINE));

    for (const id of ['project-attic', 'project-attic-loft', 'task-attic', 'task-archived', 'task-in-archived-section']) {
      expect(positionOf(sequence, id)).toBe(-1);
    }
  });

  it('drops a branch the moment its owner is archived through the canonical write', async () => {
    const harness = buildHarness();
    await scenario(harness);
    const service = todosServiceFor(harness);
    expect(sequenceOf(await service.derive(harness.actor, MINE))).toContainEqual(['subproject', 'project-kitchen']);

    // Archiving does not cascade (§31), so the canonical route to an archived owner is to
    // archive its children first — which is exactly the state this read has to handle.
    await harness.projectService.update(harness.actor, 'project-tiling' as ProjectId, { status: 'archived' });
    await harness.projectService.update(harness.actor, 'project-kitchen' as ProjectId, { status: 'archived' });

    const sequence = sequenceOf(await service.derive(harness.actor, MINE));
    for (const id of ['project-kitchen', 'task-c-eod', 'project-tiling', 'task-f-later', 'task-g-subtask']) {
      expect(positionOf(sequence, id)).toBe(-1);
    }
  });

  it('hides the rows of a container archived through the canonical write', async () => {
    const harness = buildHarness();
    await scenario(harness);
    const service = todosServiceFor(harness);

    await harness.sectionService.remove(harness.actor, 'section-mine-a' as SectionId, { policy: 'cascade' });

    const sequence = sequenceOf(await service.derive(harness.actor, MINE));
    expect(positionOf(sequence, 'task-a-early')).toBe(-1);
    // Its sibling container is untouched.
    expect(sequence).toContainEqual(['task', 'task-b-midday']);
  });

  it('answers an archived root with no content at all', async () => {
    const harness = buildHarness();
    await scenario(harness);
    for (const id of ['project-tiling', 'project-kitchen', 'project-bathroom', MINE]) {
      await harness.projectService.update(harness.actor, id as ProjectId, { status: 'archived' });
    }

    const result = await todosServiceFor(harness).derive(harness.actor, MINE);

    expect(result).toEqual({ projectId: MINE, items: [] });
  });

  it('counts a shortcut placement as layout, never as work', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const sequence = sequenceOf(await todosServiceFor(harness).derive(harness.actor, MINE));

    // Two placements point at `section-kitchen`; its one task appears once.
    expect(sequence.filter(([, id]) => id === 'task-c-eod')).toHaveLength(1);
  });
});

describe('ProjectTodosService.derive — origins (§27, §34)', () => {
  it('names the canonical owner, page and container of a root task', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const result = await todosServiceFor(harness).derive(harness.actor, MINE);
    const row = result.items.find((item) => item.kind === 'task' && item.task.id === 'task-a-early');

    expect(row?.kind === 'task' && row.origin).toMatchObject({
      projectId: MINE,
      pageId: 'page-project-mine',
      pageKind: 'home',
      sectionId: 'section-mine-a',
      sectionName: 'This week',
      breadcrumb: [{ projectId: MINE, name: 'Project project-mine' }],
    });
  });

  it('walks the ownership chain for a nested task and for a work unit', async () => {
    const harness = buildHarness();
    await scenario(harness);

    const result = await todosServiceFor(harness).derive(harness.actor, MINE);
    const nested = result.items.find((item) => item.kind === 'task' && item.task.id === 'task-f-later');
    const unit = result.items.find((item) => item.kind === 'subproject' && item.project.id === 'project-tiling');

    expect(nested?.kind === 'task' && nested.origin).toMatchObject({
      projectId: 'project-tiling',
      pageId: 'page-project-tiling',
      pageKind: 'work',
      sectionId: 'section-tiling',
      // The default name, because that container has no override.
      sectionName: 'Task List',
    });
    expect(nested?.kind === 'task' && nested.origin.breadcrumb.map(({ projectId }) => projectId)).toEqual([
      MINE,
      'project-kitchen',
      'project-tiling',
    ]);
    // A work unit's origin is its own canvas, not its parent's page.
    expect(unit?.kind === 'subproject' && unit.origin).toMatchObject({
      projectId: 'project-tiling',
      pageId: 'page-project-tiling',
      pageKind: 'work',
    });
  });
});

describe('ProjectTodosService.derive — permission and addressing (§53, §54)', () => {
  it('requires both grants, and reads no content before checking them', async () => {
    const harness = buildHarness();
    await scenario(harness);
    let taskReads = 0;
    const service = new ProjectTodosService({
      projects: harness.projects,
      pages: harness.pages,
      sections: harness.sections,
      tasks: {
        find: (id) => harness.tasks.find(id),
        insert: (task) => harness.tasks.insert(task),
        update: (task) => harness.tasks.update(task),
        list: (query) => {
          taskReads += 1;
          return harness.tasks.list(query);
        },
      },
    });

    await expect(service.derive(agentActorFor(0, ['tasks.read']), MINE)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(service.derive(agentActorFor(0, ['projects.read']), MINE)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(taskReads).toBe(0);

    expect(sequenceOf(await service.derive(agentActorFor(0, ['projects.read', 'tasks.read']), MINE))).toEqual(EXPECTED);
  });

  it('answers not found for a missing or foreign root, and refuses a work unit', async () => {
    const harness = buildHarness();
    await scenario(harness);
    const service = todosServiceFor(harness);

    await expect(service.derive(harness.actor, 'project-nowhere' as ProjectId)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    await expect(service.derive(harness.actor, THEIRS)).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(service.derive(harness.actor, 'project-kitchen' as ProjectId)).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('does not depend on the Todos page existing or being enabled', async () => {
    const harness = buildHarness();
    await scenario(harness);
    const service = todosServiceFor(harness);
    const before = sequenceOf(await service.derive(harness.actor, MINE));

    const pagesBefore = (await harness.pages.list({ projectId: MINE })).length;

    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'todos', enabled: true });
    const enabled = sequenceOf(await service.derive(harness.actor, MINE));
    const pagesAfterEnable = (await harness.pages.list({ projectId: MINE })).length;
    await harness.projectPageService.setEnabled(harness.actor, MINE, { kind: 'todos', enabled: false });
    const disabled = sequenceOf(await service.derive(harness.actor, MINE));

    expect(before).toEqual(EXPECTED);
    expect(enabled).toEqual(EXPECTED);
    expect(disabled).toEqual(EXPECTED);
    // Exactly one page record, created by the first enable and only updated afterwards — and the
    // three reads around it created none, which is the half a content count cannot show.
    expect(pagesAfterEnable).toBe(pagesBefore + 1);
    expect((await harness.pages.list({ projectId: MINE })).length).toBe(pagesAfterEnable);
  });
});

describe('ProjectTodosService.derive — a read, and only a read (§34, §63)', () => {
  it('leaves canonical rows, activity, persistence, progress and the timeline untouched', async () => {
    const harness = buildHarness();
    await scenario(harness);
    const service = todosServiceFor(harness);
    const rowSnapshot = async () =>
      (await harness.tasks.list({ includeArchived: true })).map(({ id, projectId, sectionId, status }) => ({
        id,
        projectId,
        sectionId,
        status,
      }));
    const before = {
      persists: harness.store.persistCalls,
      tasks: await rowSnapshot(),
      projects: (await harness.projects.list()).map(({ id, status }) => ({ id, status })),
      pages: (await harness.pages.list()).length,
      sections: (await harness.sections.list({ includeArchived: true })).length,
      activity: (await harness.activities.list()).length,
      progress: await harness.progressService.calculate(harness.actor, MINE),
      timeline: await harness.timelineService.derive(harness.actor, MINE),
    };

    await service.derive(harness.actor, MINE);
    await service.derive(harness.actor, MINE);

    expect(harness.store.persistCalls).toBe(before.persists);
    expect(await rowSnapshot()).toEqual(before.tasks);
    expect((await harness.projects.list()).map(({ id, status }) => ({ id, status }))).toEqual(before.projects);
    expect((await harness.pages.list()).length).toBe(before.pages);
    expect((await harness.sections.list({ includeArchived: true })).length).toBe(before.sections);
    expect((await harness.activities.list()).length).toBe(before.activity);
    expect(await harness.progressService.calculate(harness.actor, MINE)).toEqual(before.progress);
    expect(await harness.timelineService.derive(harness.actor, MINE)).toEqual(before.timeline);
  });
});
