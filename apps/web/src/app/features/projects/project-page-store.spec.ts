import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  ProjectSectionSchema,
  TaskSchema,
  type Project,
  type ProjectId,
  type ProjectSection,
  type SectionId,
  type Task,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { emptyDashboard } from '../../core/gateway/testing/fake-gateway';
import {
  WORK_MANAGER_GATEWAY,
  type WorkManagerGateway,
} from '../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../core/live/live-updates';
import { FakeLiveUpdates } from '../../core/live/testing/fake-live-updates';
import { TaskListStore } from '../tasks/task-list-store';
import { ProjectPageStore } from './project-page-store';
import type { SectionDefinition } from './sections/registry';

const AT = '2026-08-27T16:00:00.000Z';
const PROJECT = 'project-a' as ProjectId;

const project = (overrides: Record<string, unknown> = {}): Project =>
  ProjectSchema.parse({
    id: PROJECT,
    workspaceId: 'workspace-demo',
    name: 'Website launch',
    icon: '🚀',
    status: 'active',
    targetDate: '2026-09-30',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const section = (
  id: string,
  type: string,
  position: number,
  overrides: Record<string, unknown> = {},
): ProjectSection =>
  ProjectSectionSchema.parse({
    id,
    projectId: PROJECT,
    type,
    position,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const task = (id: string, status: 'todo' | 'done' = 'todo'): Task =>
  TaskSchema.parse({
    id,
    projectId: PROJECT,
    sectionId: 'section-tasks',
    title: `Task ${id}`,
    status,
    priority: 'medium',
    completedAt: status === 'done' ? AT : undefined,
    createdAt: AT,
    updatedAt: AT,
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const setup = (
  options: {
    sections?: ProjectSection[];
    tasks?: Task[];
    projectGet?: WorkManagerGateway['projects']['get'];
    projectUpdate?: WorkManagerGateway['projects']['update'];
    sectionOverrides?: Partial<WorkManagerGateway['sections']>;
    taskList?: WorkManagerGateway['tasks']['list'];
  } = {},
) => {
  // Mutated by the write fakes, so a spec sees what a re-listing host would answer.
  let sections = options.sections ?? [
    section('section-text', 'rich-text', 0),
    section('section-tasks', 'task-list', 1),
  ];

  const gateway: WorkManagerGateway = {
    // Slice 11 added `dashboard` to the boundary; nothing on the project page reads it.
    dashboard: { get: vi.fn(async () => emptyDashboard()) },
    // Slice 13 added these two for the same reason.
    agents: { list: vi.fn(async () => []), setPermissions: vi.fn(), revoke: vi.fn() },
    activity: { list: vi.fn(async () => []) },
    projects: {
      list: vi.fn(async () => [project()]),
      get: options.projectGet ?? vi.fn(async () => project()),
      create: vi.fn(),
      // The host's `null` clears / `undefined` leaves alone rule, so a spec clearing a
      // target date sees what the real adapter answers rather than a `null` the contract
      // forbids.
      update:
        options.projectUpdate ??
        vi.fn(async (_id, input) => {
          const next: Record<string, unknown> = { ...project(), updatedAt: '2026-08-28T09:00:00.000Z' };
          for (const [key, value] of Object.entries(input)) {
            if (value === undefined) continue;
            if (value === null) delete next[key];
            else next[key] = value;
          }
          return next as Project;
        }),
    },
    sections: {
      list: vi.fn(async () => [...sections]),
      create: vi.fn(async (_projectId, input) => {
        const created = section(`section-${sections.length}`, input.type, sections.length, {
          config: input.config,
        });
        sections = [...sections, created];
        return created;
      }),
      update: vi.fn(async (id, input) => {
        const updated = { ...sections.find((item) => item.id === id)!, ...input } as ProjectSection;
        sections = sections.map((item) => (item.id === id ? updated : item));
        return updated;
      }),
      move: vi.fn(async (id, input) => ({
        ...sections.find((item) => item.id === id)!,
        position: input.position,
      })),
      duplicate: vi.fn(async (id) => {
        const original = sections.find((item) => item.id === id)!;
        const copy = {
          ...original,
          id: `${id}-copy` as SectionId,
          position: original.position + 1,
        };
        sections = [
          ...sections.map((item) =>
            item.position > original.position ? { ...item, position: item.position + 1 } : item,
          ),
          copy,
        ];
        return copy;
      }),
      remove: vi.fn(async (id) => {
        sections = sections
          .filter((item) => item.id !== id)
          .map((item, position) => ({ ...item, position }));
      }),
      restore: vi.fn(async (id) => sections.find((item) => item.id === id)!),
      ...options.sectionOverrides,
    },
    tasks: {
      list:
        options.taskList ??
        vi.fn(async () => options.tasks ?? [task('task-1'), task('task-2', 'done')]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      complete: vi.fn(async (id: string) => task(id, 'done')),
      archive: vi.fn(),
      restore: vi.fn(),
    } as unknown as WorkManagerGateway['tasks'],
    progress: { get: vi.fn(async () => { const items = options.tasks ?? [task('task-1'), task('task-2', 'done')]; const done = items.filter(({status}) => status === 'done').length; return { projectId: PROJECT, formula: 'count' as const, percentage: items.length === 0 ? null : Math.round(done / items.length * 100), completed: done, total: items.length, explanation: items.length === 0 ? 'No tasks to measure' : 'Count based' }; }) },
    timeline: { get: vi.fn(async () => ({ projectId: PROJECT, items: [] })) },
    reflections: { list: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn() },
  };

  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({
    providers: [
      TaskListStore,
      ProjectPageStore,
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: LIVE_UPDATES, useValue: live },
    ],
  });
  return { store: TestBed.inject(ProjectPageStore), tasks: TestBed.inject(TaskListStore), gateway, live };
};

const definition = (overrides: Partial<SectionDefinition> = {}): SectionDefinition => ({
  type: 'rich-text',
  kind: 'view',
  displayName: 'Rich Text',
  icon: '📝',
  createDefaultConfig: () => ({ text: '' }),
  // Satisfies the content contract `SectionDefinition.component` requires; never rendered.
  component: class {
    readonly section = undefined;
    readonly onConfigChange = undefined;
    readonly onProjectDataChange = undefined;
    readonly onProjectHierarchyChange = undefined;
    readonly projectDataRevision = undefined;
    readonly projectHierarchyRevision = undefined;
  },
  ...overrides,
});

describe('ProjectPageStore (§19, §26)', () => {
  it('loads the project and its sections in position order, and reads no rows itself', async () => {
    const { store, gateway } = setup({
      sections: [section('section-tasks', 'task-list', 1), section('section-text', 'rich-text', 0)],
    });

    await store.load(PROJECT);

    expect(store.project()?.name).toBe('Website launch');
    // Ordering is the store's job — the canvas renders what it is handed.
    expect(store.sections().map(({ id }) => id)).toEqual(['section-text', 'section-tasks']);
    // A container owns its rows, so the Task List section reads them; this store does not.
    expect(gateway.tasks.list).not.toHaveBeenCalled();
    expect(store.error()).toBeNull();
  });

  it('exposes count-based progress that follows task completion in a section store', async () => {
    const { store, tasks, gateway } = setup();
    await store.load(PROJECT);
    await tasks.load(section('section-tasks', 'task-list', 1));

    expect(store.progress()).toBe(50);

    await tasks.complete('task-1' as Task['id']);
    vi.mocked(gateway.progress.get).mockResolvedValue({ projectId: PROJECT, formula: 'count', percentage: 100, completed: 2, total: 2, explanation: '2 of 2 tasks complete' });
    await store.refreshProgress();

    // Progress is a *view* over the whole project, so it stays page-scoped and canonical —
    // it is not a sum of whatever the visible containers happen to hold.
    expect(store.progress()).toBe(100);
  });

  it('reports no progress rather than NaN for a project with no tasks', async () => {
    const { store } = setup({ tasks: [] });

    await store.load(PROJECT);

    // "Nothing to measure" and "nothing done" are different claims to make about a project.
    expect(store.progress()).toBeNull();
  });

  it('renders the header and sections when a task-list load fails, using the independent progress read model', async () => {
    const { store, tasks } = setup({
      taskList: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
      }) as unknown as WorkManagerGateway['tasks']['list'],
    });

    await store.load(PROJECT);
    await tasks.load(section('section-tasks', 'task-list', 1));

    // One container's failure must not blank the header and the Rich Text section.
    expect(store.project()?.name).toBe('Website launch');
    expect(store.sections()).toHaveLength(2);
    expect(store.error()).toBeNull();
    expect(tasks.error()).toContain('could not reach');
    expect(store.progress()).toBe(50);
  });

  it('keeps progress after a failed task mutation — only a failed load makes it unavailable', async () => {
    const { store, tasks } = setup();
    await store.load(PROJECT);
    await tasks.load(section('section-tasks', 'task-list', 1));
    expect(store.progress()).toBe(50);

    // `TaskListStore.error` carries validation and rollback messages too. Gating progress on
    // it made the header read "Not available" the moment someone pressed Add task with an
    // empty box — a mutation failing does not make the count wrong.
    expect(await tasks.create('   ')).toBe(false);

    expect(tasks.error()).not.toBeNull();
    expect(store.progress()).toBe(50);
  });

  it('ignores a slower earlier project load, so two clicks cannot mix two projects', async () => {
    const other = 'project-b' as ProjectId;
    const gates = new Map<string, () => void>();
    const { store } = setup({
      projectGet: vi.fn(async (id: ProjectId) => {
        await new Promise<void>((resolve) => gates.set(id, resolve));
        return project({ id, name: id === PROJECT ? 'Website launch' : 'Second project' });
      }) as unknown as WorkManagerGateway['projects']['get'],
    });

    const first = store.load(PROJECT);
    const second = store.load(other);
    // The first click's response lands last — the shape that leaves A's sections under B.
    gates.get(other)!();
    await second;
    gates.get(PROJECT)!();
    await first;

    expect(store.project()?.id).toBe(other);
  });

  it('reports a write that succeeded as a success even when the re-read fails', async () => {
    let listCalls = 0;
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async () => {
          listCalls += 1;
          if (listCalls > 1)
            throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
          return [
            section('section-text', 'rich-text', 0),
            section('section-tasks', 'task-list', 1),
          ];
        }),
      },
    });
    await store.load(PROJECT);

    // Telling the user a completed remove failed invites them to click it again, which now
    // answers the already-archived 409 — the record is still there.
    expect(await store.removeSection('section-text' as SectionId)).toBe(true);
    expect(store.sectionError()).toBeNull();
    expect(store.sections().map(({ id }) => id)).toEqual(['section-tasks']);
  });

  it('surfaces an unreachable project as a visible error rather than an empty canvas', async () => {
    const { store } = setup({
      projectGet: vi.fn(async () => {
        throw new GatewayError('not_found', 404, 'no such project "project-a"');
      }) as unknown as WorkManagerGateway['projects']['get'],
    });

    await store.load(PROJECT);

    expect(store.project()).toBeNull();
    expect(store.sections()).toEqual([]);
    expect(store.error()).toContain('no such project');
  });

  it('adds a section with the registry definition’s default config', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);

    expect(await store.addSection(definition())).toBe(true);

    // The registry's default is what has to reach persistence — otherwise a new type's
    // config would silently start life as `{}`.
    expect(gateway.sections.create).toHaveBeenCalledWith(PROJECT, {
      type: 'rich-text',
      config: { text: '' },
    });
    expect(store.sections()).toHaveLength(3);
  });

  it('refuses a definition whose default config is not an object', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);

    // §29 types `createDefaultConfig()` as `unknown`; this is where that stops being safe.
    // It surfaces as a visible section error, not a thrown page crash — a broken definition
    // is a bug to see, not a reason to lose the canvas.
    expect(await store.addSection(definition({ createDefaultConfig: () => 'not an object' }))).toBe(
      false,
    );
    expect(gateway.sections.create).not.toHaveBeenCalled();
    expect(store.sectionError()).not.toBeNull();
  });

  it('collapses, resizes and re-configures a section through the gateway', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);

    expect(await store.setCollapsed('section-text' as SectionId, true)).toBe(true);
    expect(await store.setColumnSpan('section-text' as SectionId, 6)).toBe(true);
    expect(await store.updateConfig('section-text' as SectionId, { text: 'edited' })).toBe(true);

    expect(gateway.sections.update).toHaveBeenNthCalledWith(1, 'section-text', { collapsed: true });
    expect(gateway.sections.update).toHaveBeenNthCalledWith(2, 'section-text', { columnSpan: 6 });
    expect(gateway.sections.update).toHaveBeenNthCalledWith(3, 'section-text', {
      config: { text: 'edited' },
    });
    expect(store.sections()[0]).toMatchObject({
      collapsed: true,
      columnSpan: 6,
      config: { text: 'edited' },
    });
  });

  it('duplicates a section and re-reads the positions the host renumbered', async () => {
    const { store } = setup();
    await store.load(PROJECT);

    expect(await store.duplicateSection('section-text' as SectionId)).toBe(true);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-text', 0],
      ['section-text-copy', 1],
      ['section-tasks', 2],
    ]);
  });

  it('removes a section and closes the position gap', async () => {
    const { store } = setup();
    await store.load(PROJECT);

    expect(await store.removeSection('section-text' as SectionId)).toBe(true);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-tasks', 0],
    ]);
  });

  it('does not fabricate sibling positions when a successful duplicate cannot be re-read', async () => {
    let listCalls = 0;
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async () => {
          if (listCalls++ === 0)
            return [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)];
          throw new GatewayError('unreachable', 0, 're-read failed');
        }),
      },
    });
    await store.load(PROJECT);

    expect(await store.duplicateSection('section-text' as SectionId)).toBe(true);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-text', 0],
      ['section-text-copy', 1],
      ['section-tasks', 1],
    ]);
  });

  it('does not fabricate sibling positions when a successful remove cannot be re-read', async () => {
    let listCalls = 0;
    const { store } = setup({
      sectionOverrides: {
        list: vi.fn(async () => {
          if (listCalls++ === 0)
            return [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)];
          throw new GatewayError('unreachable', 0, 're-read failed');
        }),
      },
    });
    await store.load(PROJECT);

    expect(await store.removeSection('section-text' as SectionId)).toBe(true);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-tasks', 1],
    ]);
  });

  it('leaves the canvas exactly as it was and shows why when a section write fails', async () => {
    const { store } = setup({
      sectionOverrides: {
        remove: vi.fn(async () => {
          throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
        }),
      },
    });
    await store.load(PROJECT);
    const before = store.sections();

    expect(await store.removeSection('section-text' as SectionId)).toBe(false);

    // A silently dropped remove or config save is the failure that costs the user work.
    expect(store.sections()).toEqual(before);
    expect(store.sectionError()).toContain('could not reach');
  });

  it('renames a section after the gateway answers, and leaves it alone when it refuses', async () => {
    // Rename joins `setCollapsed`/`setColumnSpan`/`updateConfig` on the store's awaited path
    // rather than forking a fourth idiom. **Not** an optimism test: the plan deliberately
    // does not make one pass — `updateSection` has nothing to revert.
    const { store, gateway } = setup();
    await store.load(PROJECT);

    expect(await store.renameSection('section-tasks' as SectionId, 'Backlog')).toBe(true);
    expect(gateway.sections.update).toHaveBeenCalledWith('section-tasks', { title: 'Backlog' });
    expect(store.sections().find(({ id }) => id === 'section-tasks')?.title).toBe('Backlog');
    // `null` clears the override, so the name falls back to the derived default.
    await store.renameSection('section-tasks' as SectionId, null);
    expect(gateway.sections.update).toHaveBeenLastCalledWith('section-tasks', { title: null });
  });

  it('leaves the section unchanged and says why when a rename is refused', async () => {
    const { store } = setup({
      sectionOverrides: {
        update: vi.fn(async () => {
          throw new GatewayError('rule_violation', 409, 'nope');
        }),
      },
    });
    await store.load(PROJECT);
    const before = store.sections();

    expect(await store.renameSection('section-tasks' as SectionId, 'Backlog')).toBe(false);
    expect(store.sections()).toEqual(before);
    expect(store.sectionError()).toContain('nope');
  });

  it('opens the removal dialog with the parts the UI writes its question from', async () => {
    const { store } = setup({
      sections: [section('section-tasks', 'task-list', 0), section('section-shipped', 'task-list', 1)],
      sectionOverrides: {
        remove: vi.fn(async () => {
          throw new GatewayError('rule_violation', 409, 'still holds 3 tasks', {
            reason: 'section_not_empty',
            liveRowCount: 3,
          });
        }),
      },
    });
    await store.load(PROJECT);

    expect(await store.removeSection('section-tasks' as SectionId)).toBe(true);
    expect(store.removalPrompt()).toEqual({
      sectionId: 'section-tasks',
      sectionName: 'Task List',
      rowCount: 3,
      ownedKind: 'tasks',
      targets: [expect.objectContaining({ id: 'section-shipped' })],
    });
    // A question, not an error: the dialog is already saying it.
    expect(store.sectionError()).toBeNull();
  });

  it('surfaces every other 409 as an error rather than as a removal-policy question', async () => {
    // The archive phase's coming refusals — an already-archived section, an archived
    // reassign target — must never masquerade as this dialog's question.
    let details: unknown;
    const { store } = setup({
      sectionOverrides: {
        remove: vi.fn(async () => {
          throw new GatewayError('rule_violation', 409, 'still holds 3 tasks', details);
        }),
      },
    });
    await store.load(PROJECT);

    for (const candidate of [
      undefined,
      null,
      'section_not_empty',
      { reason: 'section_not_empty' },
      { reason: 'section_not_empty', liveRowCount: 0 },
      { reason: 'section_not_empty', liveRowCount: 1.5 },
      { reason: 'section_not_empty', liveRowCount: '3' },
      { reason: 'section_archived', liveRowCount: 3 },
    ]) {
      details = candidate;

      expect(await store.removeSection('section-tasks' as SectionId)).toBe(false);
      expect(store.removalPrompt()).toBeNull();
      expect(store.sectionError()).toContain('still holds 3 tasks');
    }
  });

  it('moves through the gateway and reconciles every authoritative sibling position (§32)', async () => {
    const movedSections = [
      section('section-tasks', 'task-list', 0),
      section('section-text', 'rich-text', 1),
    ];
    let listCalls = 0;
    const { store, gateway } = setup({
      sectionOverrides: {
        list: vi.fn(async () =>
          listCalls++ === 0
            ? [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)]
            : movedSections,
        ),
        move: vi.fn(async () => movedSections[1]!),
      },
    });
    await store.load(PROJECT);

    expect(await store.moveSection('section-text' as SectionId, 1)).toBe(true);

    expect(gateway.sections.move).toHaveBeenCalledWith('section-text', { position: 1 });
    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-tasks', 0],
      ['section-text', 1],
    ]);
  });

  it('skips a same-index drop without writing or recording activity', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);

    expect(await store.moveSection('section-text' as SectionId, 0)).toBe(true);

    expect(gateway.sections.move).not.toHaveBeenCalled();
  });

  it('restores a fresh canonical list and exposes the reason when a move fails', async () => {
    const { store } = setup({
      sectionOverrides: {
        move: vi.fn(async () => {
          throw new GatewayError('unreachable', 0, 'move did not persist');
        }),
      },
    });
    await store.load(PROJECT);
    const before = store.sections();
    const revision = store.canvasRevision();

    expect(await store.moveSection('section-text' as SectionId, 1)).toBe(false);

    expect(store.sections()).toEqual(before);
    expect(store.sections()).not.toBe(before);
    expect(store.canvasRevision()).toBe(revision + 1);
    expect(store.sectionError()).toContain('move did not persist');
  });

  it('resets Edit Layout Mode when project navigation starts', async () => {
    const { store } = setup();
    await store.load(PROJECT);
    store.setEditMode(true);

    const next = store.load('project-b' as ProjectId);

    expect(store.editMode()).toBe(false);
    await next;
  });

  it('ignores a move answer for the project left during the write', async () => {
    const gate = deferred<ProjectSection>();
    const other = 'project-b' as ProjectId;
    const { store } = setup({
      projectGet: vi.fn(async (id: ProjectId) => project({ id })),
      sectionOverrides: { move: vi.fn(() => gate.promise) },
    });
    await store.load(PROJECT);

    const move = store.moveSection('section-text' as SectionId, 1);
    await store.load(other);
    gate.resolve(section('section-text', 'rich-text', 1));
    await move;

    expect(store.project()?.id).toBe(other);
    expect(store.sectionError()).toBeNull();
  });

  it('does not append a created section after navigation leaves its project', async () => {
    const gate = deferred<ProjectSection>();
    const other = 'project-b' as ProjectId;
    const { store } = setup({
      projectGet: vi.fn(async (id: ProjectId) => project({ id })),
      sectionOverrides: {
        list: vi.fn(async (projectId: ProjectId) =>
          projectId === PROJECT
            ? [section('section-text', 'rich-text', 0)]
            : [section('section-b', 'rich-text', 0, { projectId: other })],
        ),
        create: vi.fn(() => gate.promise),
      },
    });
    await store.load(PROJECT);

    const add = store.addSection(definition());
    await store.load(other);
    gate.resolve(section('section-created', 'rich-text', 1));
    await add;

    expect(store.project()?.id).toBe(other);
    expect(store.sections().map(({ id }) => id)).toEqual(['section-b']);
  });

  it('does not append a duplicate or leak a rejected update after navigation', async () => {
    const duplicateGate = deferred<ProjectSection>();
    const updateGate = deferred<ProjectSection>();
    const other = 'project-b' as ProjectId;
    const { store } = setup({
      projectGet: vi.fn(async (id: ProjectId) => project({ id })),
      sectionOverrides: {
        list: vi.fn(async (projectId: ProjectId) =>
          projectId === PROJECT
            ? [section('section-text', 'rich-text', 0)]
            : [section('section-b', 'rich-text', 0, { projectId: other })],
        ),
        duplicate: vi.fn(() => duplicateGate.promise),
        update: vi.fn(() => updateGate.promise),
      },
    });
    await store.load(PROJECT);

    const duplicate = store.duplicateSection('section-text' as SectionId);
    const update = store.setCollapsed('section-text' as SectionId, true);
    await store.load(other);
    duplicateGate.resolve(section('section-copy', 'rich-text', 1));
    updateGate.reject(new GatewayError('unreachable', 0, 'old project write failed'));
    await Promise.all([duplicate, update]);

    expect(store.sections().map(({ id }) => id)).toEqual(['section-b']);
    expect(store.sectionError()).toBeNull();
  });

  it('previews order without fabricating persisted sibling positions', async () => {
    const gate = deferred<ProjectSection>();
    const { store } = setup({ sectionOverrides: { move: vi.fn(() => gate.promise) } });
    await store.load(PROJECT);

    const move = store.moveSection('section-text' as SectionId, 1);

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([
      ['section-tasks', 1],
      ['section-text', 0],
    ]);
    gate.resolve(section('section-text', 'rich-text', 1));
    await move;
  });
});

/** How many times a spy has been called, so a spec can assert a *further* call. */
const calls = (spy: unknown): number => (spy as ReturnType<typeof vi.fn>).mock.calls.length;
const settleLive = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

describe('ProjectPageStore and live updates (§62)', () => {
  it('bumps the data revision and refreshes progress on a task event for this project', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT);
    const progressReads = calls(gateway.progress.get);

    live.emit({ type: 'task.completed', entityType: 'task', entityId: 'task-1', projectId: PROJECT });
    await settleLive();

    expect(calls(gateway.progress.get)).toBe(progressReads + 1);
    // The rows themselves are re-read by whichever container owns them, off this revision —
    // this store no longer knows which task lists are on the canvas, and does not need to.
    expect(store.projectDataRevision()).toBe(1);
    expect(store.projectHierarchyRevision()).toBe(0);
    // Quiet: the page never blinks back to its loading state for someone else's write.
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('routes a minimal current-project event by type and entityId and bumps both revisions', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT);
    const projectReads = calls(gateway.projects.get);
    const sectionReads = calls(gateway.sections.list);

    live.emit({ type: 'project.updated', entityId: PROJECT });
    await settleLive();

    expect(calls(gateway.projects.get)).toBe(projectReads + 1);
    expect(calls(gateway.sections.list)).toBe(sectionReads + 1);
    expect(store.projectDataRevision()).toBe(1);
    expect(store.projectHierarchyRevision()).toBe(1);
  });

  it('invalidates hierarchy only for a project event naming another workspace project', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT);
    const projectReads = calls(gateway.projects.get);

    live.emit({ type: 'project.created', entityType: 'project', entityId: 'project-child', projectId: 'project-child' as ProjectId });
    await settleLive();

    expect(calls(gateway.projects.get)).toBe(projectReads);
    expect(store.projectDataRevision()).toBe(0);
    expect(store.projectHierarchyRevision()).toBe(1);
  });

  it('quietly recovers the open page when the live connection opens', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT);
    const projectReads = calls(gateway.projects.get);
    const sectionReads = calls(gateway.sections.list);
    const progressReads = calls(gateway.progress.get);

    live.emitConnected();
    await settleLive();

    expect(calls(gateway.projects.get)).toBe(projectReads + 1);
    expect(calls(gateway.sections.list)).toBe(sectionReads + 1);
    expect(calls(gateway.progress.get)).toBe(progressReads + 1);
    // The containers recover on the revision the reconnect bumps.
    expect(store.projectDataRevision()).toBeGreaterThan(0);
    expect(store.loading()).toBe(false);
  });

  it('recovers a failed first page load when the live connection opens', async () => {
    const get = vi.fn()
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'host starting'))
      .mockResolvedValue(project({ name: 'Recovered project' }));
    const listTasks = vi.fn()
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'host starting'))
      .mockResolvedValue([task('task-recovered')]);
    const { store, tasks, live } = setup({ projectGet: get, taskList: listTasks });
    const container = section('section-tasks', 'task-list', 1);

    await store.load(PROJECT);
    await tasks.load(container);
    expect(store.project()).toBeNull();
    expect(store.error()).toContain('host starting');
    expect(tasks.loadFailed()).toBe(true);

    live.emitConnected();
    await settleLive();

    expect(store.project()?.name).toBe('Recovered project');
    expect(store.sections()).toHaveLength(2);
    expect(store.progressResult()?.projectId).toBe(PROJECT);
    expect(store.error()).toBeNull();
    expect(store.sectionError()).toBeNull();

    // The container recovers itself off the revision, the way the section component does.
    await tasks.sync(container);
    expect(tasks.tasks().map(({ id }) => id)).toEqual(['task-recovered']);
    expect(tasks.error()).toBeNull();
    expect(tasks.loadFailed()).toBe(false);
  });

  it('queues an event that arrives before the first project response', async () => {
    const first = deferred<Project>();
    const get = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(project({ name: 'Recovered after startup' }));
    const { store, gateway, live } = setup({ projectGet: get });

    const loading = store.load(PROJECT);
    live.emit({ type: 'task.completed', entityId: 'task-1', projectId: PROJECT });
    first.resolve(project({ name: 'Old first read' }));
    await loading;
    await settleLive();

    expect(calls(gateway.projects.get)).toBe(2);
    expect(store.projectDataRevision()).toBe(1);
    expect(store.project()?.name).toBe('Recovered after startup');
  });

  it('coalesces a second full recovery behind one already in flight', async () => {
    const firstRecovery = deferred<Project>();
    const get = vi.fn()
      .mockResolvedValueOnce(project())
      .mockImplementationOnce(() => firstRecovery.promise)
      .mockResolvedValue(project({ name: 'Trailing recovery' }));
    const { store, gateway, live } = setup({ projectGet: get });
    await store.load(PROJECT);

    live.emitConnected();
    await settleLive();
    live.emitConnected();
    await settleLive();
    expect(calls(gateway.projects.get)).toBe(2);

    firstRecovery.resolve(project({ name: 'First recovery' }));
    await settleLive();
    expect(calls(gateway.projects.get)).toBe(3);
    await settleLive();
    expect(store.project()?.name).toBe('Trailing recovery');
  });

  it('ignores an event for another project', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT);
    const taskReads = calls(gateway.tasks.list);

    live.emit({ type: 'task.completed', entityType: 'task', entityId: 'task-9', projectId: 'project-z' as ProjectId });
    await settleLive();

    expect(calls(gateway.tasks.list)).toBe(taskReads);
  });

  it('re-reads the project and its canvas on a project event naming this project', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT);
    const projectReads = calls(gateway.projects.get);
    const sectionReads = calls(gateway.sections.list);
    (gateway.projects.get as ReturnType<typeof vi.fn>).mockResolvedValue(project({ name: 'Renamed by an agent' }));

    // §57 records a section change against the *project*, which is why routing is on
    // `type` and `projectId` rather than on `entityType`.
    live.emit({ type: 'project.section_added', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();

    expect(calls(gateway.projects.get)).toBe(projectReads + 1);
    expect(calls(gateway.sections.list)).toBe(sectionReads + 1);
    expect(store.project()?.name).toBe('Renamed by an agent');
  });

  it('does not clobber an optimistic section reorder that is still in flight', async () => {
    const move = deferred<ProjectSection>();
    const { store, gateway, live } = setup({
      sectionOverrides: { move: vi.fn(async () => move.promise) },
    });
    await store.load(PROJECT);
    const sectionReads = calls(gateway.sections.list);

    const moving = store.moveSection('section-tasks' as SectionId, 0);
    expect(store.sections().map(({ id }) => id)).toEqual(['section-tasks', 'section-text']);

    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();

    // The preview survives, and the write's own reconcile is still the thing that lands it.
    expect(store.sections().map(({ id }) => id)).toEqual(['section-tasks', 'section-text']);
    expect(calls(gateway.sections.list)).toBe(sectionReads);

    move.resolve(section('section-tasks', 'task-list', 0));
    await moving;
  });

  it('reloads the project when the host state is replaced', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT);
    const projectReads = calls(gateway.projects.get);

    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    await settleLive();

    expect(calls(gateway.projects.get)).toBe(projectReads + 1);
  });

  it('stops listening once the store is destroyed', async () => {
    const { store, live } = setup();
    await store.load(PROJECT);
    expect(live.listenerCount).toBeGreaterThan(0);

    TestBed.resetTestingModule();

    expect(live.listenerCount).toBe(0);
  });
});

describe('ProjectPageStore project writes (§26, §63, §81)', () => {
  it('renames optimistically and reverts on failure', async () => {
    const update = deferred<Project>();
    const { store } = setup({ projectUpdate: vi.fn(async () => update.promise) });
    await store.load(PROJECT);

    const renaming = store.rename('Website relaunch');
    // Painted before the write resolved — that is what §63 asks for.
    expect(store.project()?.name).toBe('Website relaunch');

    update.reject(new GatewayError('unreachable', 0, 'the prototype host is not running'));
    expect(await renaming).toBe(false);
    expect(store.project()?.name).toBe('Website launch');
    expect(store.writeError()).toContain('not running');
    // Never on the signal that renders instead of the page.
    expect(store.error()).toBeNull();
  });

  // The defect this guard exists for: `onLiveEvent` routes any `project.*` event naming this
  // project into `refreshProject()`, which replaces `projectState` wholesale — so without it
  // an optimistic rename is overwritten by the very frame its own write produces.
  // What this covers, precisely: the **increment**. Removing `whileWriting` from the write
  // path fails it. Removing only `onLiveEvent`'s pre-dispatch check does not, because
  // `refreshProject()` re-checks the same counter on entry — two of the three check sites
  // are redundant with each other, deliberately.
  it('holds off the live re-read while a project write is in flight', async () => {
    const update = deferred<Project>();
    const { store, gateway, live } = setup({ projectUpdate: vi.fn(async () => update.promise) });
    await store.load(PROJECT);
    const projectReads = calls(gateway.projects.get);

    const renaming = store.rename('Website relaunch');
    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    await settleLive();

    expect(store.project()?.name).toBe('Website relaunch');
    expect(calls(gateway.projects.get)).toBe(projectReads);

    update.resolve(project({ name: 'Website relaunch' }));
    await renaming;
  });

  it('re-asserts the server’s record when the write resolves', async () => {
    const { store } = setup({
      projectUpdate: vi.fn(async () => project({ name: 'Website relaunch', updatedAt: '2026-08-28T09:00:00.000Z' })),
    });
    await store.load(PROJECT);

    expect(await store.rename('Website relaunch')).toBe(true);

    expect(store.project()?.name).toBe('Website relaunch');
    expect(store.project()?.updatedAt).toBe('2026-08-28T09:00:00.000Z');
  });

  // §19: stores decide, pages navigate. The guard is structural rather than asserted —
  // `setup()` provides no `Router`, so a store that injected one would throw at
  // construction and take every test in this file with it. What is asserted here is the
  // other half: `archive` reports its outcome to a caller instead of acting on it.
  it('returns success without navigating', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);

    expect(await store.archive()).toBe(true);

    expect(gateway.projects.update).toHaveBeenCalledWith(PROJECT, { status: 'archived' });
  });

  // The defect the reviewer found: `load()` cleared every other error signal but not this
  // one, and `ProjectPage` re-uses one component instance across `/projects/:id` changes.
  it('does not carry a failed write into the next project', async () => {
    const { store } = setup({
      projectUpdate: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'the prototype host is not running');
      }),
    });
    await store.load(PROJECT);
    expect(await store.rename('Website relaunch')).toBe(false);
    expect(store.writeError()).not.toBeNull();

    await store.load(PROJECT);

    expect(store.writeError()).toBeNull();
  });

  // §53's lesson: a named reason beats "forbidden".
  it('surfaces the domain’s refusal when a project still has active children', async () => {
    const { store } = setup({
      projectUpdate: vi.fn(async () => {
        throw new GatewayError('conflict', 409, 'archive or complete the 2 active sub-projects first');
      }),
    });
    await store.load(PROJECT);

    expect(await store.archive()).toBe(false);

    expect(store.writeError()).toBe('archive or complete the 2 active sub-projects first');
    expect(store.error()).toBeNull();
    expect(store.project()?.status).toBe('active');
  });

  it('clears a target date', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);
    expect(store.project()?.targetDate).toBe('2026-09-30');

    expect(await store.setTargetDate(null)).toBe(true);

    expect(gateway.projects.update).toHaveBeenCalledWith(PROJECT, { targetDate: null });
    expect(store.project()?.targetDate).toBeUndefined();
  });

  it('sets a status without offering the archived one', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);

    expect(await store.setStatus('completed')).toBe(true);

    expect(gateway.projects.update).toHaveBeenCalledWith(PROJECT, { status: 'completed' });
    expect(store.project()?.status).toBe('completed');
  });

  it('ignores a write that resolved after the route moved on', async () => {
    const update = deferred<Project>();
    const { store } = setup({ projectUpdate: vi.fn(async () => update.promise) });
    await store.load(PROJECT);

    const renaming = store.rename('Website relaunch');
    // A second load is a new generation: whatever the first write answers is stale.
    await store.load(PROJECT);

    update.resolve(project({ name: 'Answered too late' }));
    await renaming;

    expect(store.project()?.name).toBe('Website launch');
  });
});

describe('ProjectPageStore restore invalidation and the project-write guard', () => {
  it('repaints the canvas after a section restore, not just the data revision', async () => {
    // A restored section is a *new* frame. The revision only makes existing containers
    // re-read, so without the reconcile the section comes back invisible until a reload.
    const { store, gateway } = setup({ sections: [section('section-text', 'rich-text', 0)] });
    await store.load(PROJECT);
    const listsBefore = (gateway.sections.list as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    const revisionBefore = store.projectDataRevision();

    await store.sectionRestored();

    expect((gateway.sections.list as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
      listsBefore + 1,
    );
    // Both, not either: the restored section's own container has rows to fetch too.
    expect(store.projectDataRevision()).toBe(revisionBefore + 1);
  });

  it('invalidates the containers after a row restore', async () => {
    // A restored row becomes live inside a container already on the canvas, and that
    // container re-reads only when the revision moves. Without this, "with no reload" holds
    // for sections and quietly fails for rows.
    const { store } = setup();
    await store.load(PROJECT);
    const before = store.projectDataRevision();

    store.rowRestored();

    expect(store.projectDataRevision()).toBe(before + 1);
  });

  it('raises projectWritePending before the optimistic paint and clears it after success', async () => {
    // `setStatus` paints optimistically, so a consumer reading the project's status alone
    // would see `active` — and enable a restore the domain would still refuse — before the
    // reactivation had actually landed.
    const gate = deferred<Project>();
    const { store } = setup({
      projectUpdate: vi.fn(async () => gate.promise),
      projectGet: vi.fn(async () => project({ status: 'archived' })),
    });
    await store.load(PROJECT);
    expect(store.projectWritePending()).toBe(false);

    const write = store.setStatus('active');
    expect(store.project()?.status).toBe('active');
    expect(store.projectWritePending()).toBe(true);

    gate.resolve(project({ status: 'active' }));
    expect(await write).toBe(true);
    expect(store.projectWritePending()).toBe(false);
  });

  it('keeps the guard up through a rollback, and until the last of two writes settles', async () => {
    const first = deferred<Project>();
    const second = deferred<Project>();
    const updates = [first, second];
    const { store } = setup({
      projectUpdate: vi.fn(async () => updates.shift()!.promise),
      projectGet: vi.fn(async () => project({ status: 'archived' })),
    });
    await store.load(PROJECT);

    const a = store.setStatus('active');
    const b = store.rename('Renamed');
    expect(store.projectWritePending()).toBe(true);

    first.reject(new Error('nope'));
    expect(await a).toBe(false);
    // A counter rather than a boolean: the first response must not release the second
    // request's guard.
    expect(store.projectWritePending()).toBe(true);
    // The failed status write rolled back, so the project is archived again.
    expect(store.project()?.status).toBe('archived');

    second.resolve(project({ status: 'archived', name: 'Renamed' }));
    await b;
    expect(store.projectWritePending()).toBe(false);
  });
});
