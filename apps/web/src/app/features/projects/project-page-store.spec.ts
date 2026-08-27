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
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../core/gateway/work-manager-gateway';
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

const section = (id: string, type: string, position: number, overrides: Record<string, unknown> = {}): ProjectSection =>
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
    title: `Task ${id}`,
    status,
    priority: 'medium',
    completedAt: status === 'done' ? AT : undefined,
    createdAt: AT,
    updatedAt: AT,
  });

const setup = (
  options: {
    sections?: ProjectSection[];
    tasks?: Task[];
    projectGet?: WorkManagerGateway['projects']['get'];
    sectionOverrides?: Partial<WorkManagerGateway['sections']>;
    taskList?: WorkManagerGateway['tasks']['list'];
  } = {},
) => {
  // Mutated by the write fakes, so a spec sees what a re-listing host would answer.
  let sections = options.sections ?? [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)];

  const gateway: WorkManagerGateway = {
    projects: {
      list: vi.fn(async () => [project()]),
      get: options.projectGet ?? vi.fn(async () => project()),
      update: vi.fn(async (_id, input) => ({ ...project(), ...input }) as Project),
    },
    sections: {
      list: vi.fn(async () => [...sections]),
      create: vi.fn(async (_projectId, input) => {
        const created = section(`section-${sections.length}`, input.type, sections.length, { config: input.config });
        sections = [...sections, created];
        return created;
      }),
      update: vi.fn(async (id, input) => {
        const updated = { ...sections.find((item) => item.id === id)!, ...input } as ProjectSection;
        sections = sections.map((item) => (item.id === id ? updated : item));
        return updated;
      }),
      move: vi.fn(async (id, input) => ({ ...sections.find((item) => item.id === id)!, position: input.position })),
      duplicate: vi.fn(async (id) => {
        const original = sections.find((item) => item.id === id)!;
        const copy = { ...original, id: `${id}-copy` as SectionId, position: original.position + 1 };
        sections = [...sections.map((item) =>
          item.position > original.position ? { ...item, position: item.position + 1 } : item,
        ), copy];
        return copy;
      }),
      remove: vi.fn(async (id) => {
        sections = sections
          .filter((item) => item.id !== id)
          .map((item, position) => ({ ...item, position }));
      }),
      ...options.sectionOverrides,
    },
    tasks: {
      list: options.taskList ?? vi.fn(async () => options.tasks ?? [task('task-1'), task('task-2', 'done')]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      complete: vi.fn(async (id: string) => task(id, 'done')),
      archive: vi.fn(),
    } as unknown as WorkManagerGateway['tasks'],
  };

  TestBed.configureTestingModule({
    providers: [TaskListStore, ProjectPageStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  return { store: TestBed.inject(ProjectPageStore), tasks: TestBed.inject(TaskListStore), gateway };
};

const definition = (overrides: Partial<SectionDefinition> = {}): SectionDefinition => ({
  type: 'rich-text',
  displayName: 'Rich Text',
  icon: '📝',
  createDefaultConfig: () => ({ text: '' }),
  // Satisfies the content contract `SectionDefinition.component` requires; never rendered.
  component: class {
    readonly section = undefined;
    readonly onConfigChange = undefined;
  },
  ...overrides,
});

describe('ProjectPageStore (§19, §26)', () => {
  it('loads the project, its sections in position order, and its tasks', async () => {
    const { store, tasks, gateway } = setup({
      sections: [section('section-tasks', 'task-list', 1), section('section-text', 'rich-text', 0)],
    });

    await store.load(PROJECT);

    expect(store.project()?.name).toBe('Website launch');
    // Ordering is the store's job — the canvas renders what it is handed.
    expect(store.sections().map(({ id }) => id)).toEqual(['section-text', 'section-tasks']);
    expect(tasks.tasks()).toHaveLength(2);
    expect(gateway.tasks.list).toHaveBeenCalledWith({ projectId: PROJECT, includeArchived: false });
    expect(store.error()).toBeNull();
  });

  it('exposes count-based progress that follows task completion in the same store', async () => {
    const { store, tasks } = setup();
    await store.load(PROJECT);

    expect(store.progress()).toBe(50);

    await tasks.complete('task-1' as Task['id']);

    // One store means the header cannot go stale behind the Task List section.
    expect(store.progress()).toBe(100);
  });

  it('reports no progress rather than NaN for a project with no tasks', async () => {
    const { store } = setup({ tasks: [] });

    await store.load(PROJECT);

    // "Nothing to measure" and "nothing done" are different claims to make about a project.
    expect(store.progress()).toBeNull();
  });

  it('renders the header and sections when only the task load fails, with progress unavailable', async () => {
    const { store, tasks } = setup({
      taskList: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
      }) as unknown as WorkManagerGateway['tasks']['list'],
    });

    await store.load(PROJECT);

    // An unrelated task error must not blank the header and the Rich Text section.
    expect(store.project()?.name).toBe('Website launch');
    expect(store.sections()).toHaveLength(2);
    expect(store.error()).toBeNull();
    expect(tasks.error()).toContain('could not reach');
    expect(store.progress()).toBeNull();
  });

  it('keeps progress after a failed task mutation — only a failed load makes it unavailable', async () => {
    const { store, tasks } = setup();
    await store.load(PROJECT);
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
          if (listCalls > 1) throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
          return [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)];
        }),
      },
    });
    await store.load(PROJECT);

    // Telling the user a completed remove failed invites them to click it again, which 404s.
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
    expect(gateway.sections.create).toHaveBeenCalledWith(PROJECT, { type: 'rich-text', config: { text: '' } });
    expect(store.sections()).toHaveLength(3);
  });

  it('refuses a definition whose default config is not an object', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);

    // §29 types `createDefaultConfig()` as `unknown`; this is where that stops being safe.
    // It surfaces as a visible section error, not a thrown page crash — a broken definition
    // is a bug to see, not a reason to lose the canvas.
    expect(await store.addSection(definition({ createDefaultConfig: () => 'not an object' }))).toBe(false);
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
    expect(gateway.sections.update).toHaveBeenNthCalledWith(3, 'section-text', { config: { text: 'edited' } });
    expect(store.sections()[0]).toMatchObject({ collapsed: true, columnSpan: 6, config: { text: 'edited' } });
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

    expect(store.sections().map(({ id, position }) => [id, position])).toEqual([['section-tasks', 0]]);
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
});
