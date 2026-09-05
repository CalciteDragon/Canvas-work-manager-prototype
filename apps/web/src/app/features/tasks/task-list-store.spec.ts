import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  ProjectSectionSchema,
  TaskSchema,
  type Project,
  type ProjectSection,
  type Task,
  type TaskId,
  type UpdateTaskInput,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { emptyDashboard } from '../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../core/gateway/work-manager-gateway';
import { TaskListStore } from './task-list-store';

const AT = '2026-08-27T16:00:00.000Z';

const project = (id = 'project-a', name = 'Project A'): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    kind: 'root',
    name,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  });


/** The container the list renders. A task list owns its rows, so the store loads by it. */
const section = (projectId = 'project-a', id = `section-${projectId}-tasks`): ProjectSection =>
  ProjectSectionSchema.parse({
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
  });

const task = (overrides: Record<string, unknown> = {}): Task =>
  TaskSchema.parse({
    id: 'task-a',
    projectId: 'project-a',
    sectionId: 'section-project-a-tasks',
    title: 'Write the first draft',
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
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

const setup = (options: {
  projects?: Project[];
  tasks?: Task[];
  create?: WorkManagerGateway['tasks']['create'];
  update?: WorkManagerGateway['tasks']['update'];
  complete?: WorkManagerGateway['tasks']['complete'];
  archive?: WorkManagerGateway['tasks']['archive'];
} = {}) => {
  const projects = options.projects ?? [project(), project('project-b', 'Project B')];
  const tasks = options.tasks ?? [task()];
  const gateway: WorkManagerGateway = {
    // Slice 11 added `dashboard` to the boundary; nothing on the project page reads it.
    dashboard: { get: vi.fn(async () => emptyDashboard()) },
    // Slice 13 added these two for the same reason.
    agents: { list: vi.fn(async () => []), setPermissions: vi.fn(), revoke: vi.fn() },
    // Slice 25.2 added `pages`; nothing here reads it until the workspace shell lands (25.3).
    pages: { list: vi.fn(async () => []), setEnabled: vi.fn() },
    activity: { list: vi.fn(async () => []) },
    projects: {
      list: vi.fn(async () => projects),
      get: vi.fn(async () => projects[0]!),
      create: vi.fn(),
      update: vi.fn(async (_id, input) => ({ ...projects[0]!, ...input }) as Project),
    },
    sections: {
      list: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      move: vi.fn(),
      duplicate: vi.fn(),
      remove: vi.fn(async () => undefined),
      restore: vi.fn(),
    } as unknown as WorkManagerGateway['sections'],
    tasks: {
      list: vi.fn(async () => tasks),
      get: vi.fn(async () => tasks[0]!),
      create: options.create ?? vi.fn(async (input) => task({ id: 'task-created', ...input })),
      update:
        options.update ??
        vi.fn(async (id: TaskId, input: UpdateTaskInput) => ({ ...tasks[0]!, id, ...input, updatedAt: AT } as Task)),
      complete: options.complete ?? vi.fn(async (id) => task({ id, status: 'done', completedAt: AT })),
      archive: options.archive ?? vi.fn(async () => undefined),
      restore: vi.fn(),
    },
    progress: { get: vi.fn() },
    timeline: { get: vi.fn() },
    reflections: { list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn() },
  };

  TestBed.configureTestingModule({
    providers: [TaskListStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  return { store: TestBed.inject(TaskListStore), gateway };
};

describe('TaskListStore', () => {
  it('loads one project’s unarchived tasks, and only that project’s', async () => {
    const { store, gateway } = setup();

    await store.load(section('project-b'));

    expect(store.tasks().map(({ title }) => title)).toEqual(['Write the first draft']);
    expect(store.projectId()).toBe('project-b');
    expect(store.sectionId()).toBe('section-project-b-tasks');
    // By section, not by project: this list renders only what its own container owns.
    expect(gateway.tasks.list).toHaveBeenCalledWith({ sectionId: 'section-project-b-tasks', includeArchived: false });
  });

  it('creates a trimmed task in the loaded project and selects the server result', async () => {
    const { store, gateway } = setup();
    await store.load(section('project-b'));

    expect(await store.create('  New task  ')).toBe(true);

    // The container is named, not resolved: the domain would otherwise send the row to the
    // project's *first* task list, which may be a different one on the same canvas.
    expect(gateway.tasks.create).toHaveBeenCalledWith({
      projectId: 'project-b',
      title: 'New task',
      sectionId: 'section-project-b-tasks',
    });
    expect(store.tasks().at(-1)?.id).toBe('task-created');
    expect(store.selectedTask()?.id).toBe('task-created');
  });

  it('updates and clears an estimate through the shared task update path', async () => {
    const { store, gateway } = setup(); await store.load(section());
    await store.updateEstimate(task().id, 3);
    expect(gateway.tasks.update).toHaveBeenCalledWith(task().id, { estimate: 3 });
    await store.updateEstimate(task().id, null);
    expect(gateway.tasks.update).toHaveBeenLastCalledWith(task().id, { estimate: null });
  });

  it('refuses to create before its container has loaded', async () => {
    const { store, gateway } = setup();

    expect(await store.create('New task')).toBe(false);
    expect(gateway.tasks.create).not.toHaveBeenCalled();
    // A task cannot exist without a container to render it, so there is nowhere to put one.
    expect(store.error()).toContain('section');
  });

  it('rejects a blank quick-create title without calling the gateway', async () => {
    const { store, gateway } = setup();
    await store.load(section());

    expect(await store.create('   ')).toBe(false);
    expect(gateway.tasks.create).not.toHaveBeenCalled();
    expect(store.error()).toContain('title');
  });

  it('updates title, priority, and date-only dueAt from the gateway results', async () => {
    const update = vi.fn(async (id: TaskId, input: UpdateTaskInput) =>
      task({
        id,
        ...input,
        dueAt: input.dueAt === null ? undefined : input.dueAt,
        updatedAt: '2026-08-27T17:00:00.000Z',
      }),
    );
    const { store } = setup({ update });
    await store.load(section());

    await store.updateTitle(task().id, '  Revised title  ');
    await store.updatePriority(task().id, 'high');
    await store.updateDueDate(task().id, '2026-09-03');

    expect(update.mock.calls.map(([, input]) => input)).toEqual([
      { title: 'Revised title' },
      { priority: 'high' },
      { dueAt: '2026-09-03T23:59:59.999Z' },
    ]);
    expect(store.tasks()[0]).toMatchObject({
      title: 'Revised title',
      priority: 'high',
      dueAt: '2026-09-03T23:59:59.999Z',
    });

    await store.updateDueDate(task().id, '');
    expect(update).toHaveBeenLastCalledWith(task().id, { dueAt: null });
    expect(store.tasks()[0]?.dueAt).toBeUndefined();
  });

  it('marks completion immediately while the gateway is pending, then reconciles its status fields', async () => {
    const result = deferred<Task>();
    const { store } = setup({ complete: vi.fn(() => result.promise) });
    await store.load(section());

    const completion = store.complete(task().id);

    expect(store.tasks()[0]?.status).toBe('done');
    expect(store.completingIds().has(task().id)).toBe(true);

    result.resolve(task({ status: 'done', completedAt: '2026-08-27T18:00:00.000Z' }));
    await completion;

    expect(store.tasks()[0]?.completedAt).toBe('2026-08-27T18:00:00.000Z');
    expect(store.completingIds().has(task().id)).toBe(false);
  });

  it('restores the exact previous task and exposes a message when completion fails', async () => {
    const before = task({ title: 'Keep every field', priority: 'high' });
    const result = deferred<Task>();
    const { store } = setup({ tasks: [before], complete: vi.fn(() => result.promise) });
    await store.load(section());

    const completion = store.complete(before.id);
    result.reject(new GatewayError('unreachable', 0, 'could not reach the prototype host'));
    await completion;

    expect(store.tasks()[0]).toEqual(before);
    expect(store.error()).toContain('could not reach the prototype host');
  });

  it('does not let an older failed completion overwrite a newer title mutation', async () => {
    const result = deferred<Task>();
    const { store } = setup({ complete: vi.fn(() => result.promise) });
    await store.load(section());

    const completion = store.complete(task().id);
    await store.updateTitle(task().id, 'Newer title');
    result.reject(new GatewayError('unreachable', 0, 'offline'));
    await completion;

    expect(store.tasks()[0]).toMatchObject({ title: 'Newer title', status: 'todo' });
  });

  it('does not let an older successful completion response overwrite a newer title mutation', async () => {
    const result = deferred<Task>();
    const { store } = setup({ complete: vi.fn(() => result.promise) });
    await store.load(section());

    const completion = store.complete(task().id);
    await store.updateTitle(task().id, 'Newer title');
    result.resolve(task({ title: 'Stale title', status: 'done', completedAt: AT }));
    await completion;

    expect(store.tasks()[0]).toMatchObject({ title: 'Newer title', status: 'done' });
  });

  it('keeps an older successful same-field edit when the queued newer edit fails', async () => {
    const first = deferred<Task>();
    const second = deferred<Task>();
    const update = vi
      .fn<WorkManagerGateway['tasks']['update']>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { store } = setup({ update });
    await store.load(section());

    const older = store.updateTitle(task().id, 'Persisted title');
    const newer = store.updateTitle(task().id, 'Rejected title');
    await Promise.resolve();
    const callsWhileOlderPending = update.mock.calls.length;

    first.resolve(task({ title: 'Persisted title' }));
    await older;
    await Promise.resolve();
    const callsAfterOlderSettled = update.mock.calls.length;

    second.reject(new GatewayError('unreachable', 0, 'newer edit failed'));
    await newer;
    expect(callsWhileOlderPending).toBe(1);
    expect(callsAfterOlderSettled).toBe(2);
    expect(store.tasks()[0]?.title).toBe('Persisted title');
    expect(store.error()).toContain('newer edit failed');
  });
});

/**
 * §63's actual payoff, and the reason the development panel's Failure Rate exists at all:
 * "click task complete → task appears complete → gateway mutation → if it fails, revert
 * and show error". Everything else about the injection is plumbing; this is the behaviour
 * it was built to make testable.
 */
describe('TaskListStore under the panel’s failure injection (§63)', () => {
  it('paints the completion, then reverts it and reports the failure', async () => {
    const gate = deferred<Task>();
    const { store } = setup({ complete: vi.fn(() => gate.promise) });
    await store.load(section());

    const completing = store.complete('task-a' as TaskId);
    // Painted before the gateway has answered — the whole point of an optimistic write.
    expect(store.tasks()[0]?.status).toBe('done');

    gate.reject(new GatewayError('unreachable', 0, 'prototype failure injection (§46 Failure Rate)'));
    await completing;

    expect(store.tasks()[0]?.status).toBe('todo');
    expect(store.tasks()[0]?.completedAt).toBeUndefined();
    expect(store.error()).toContain('prototype failure injection');
  });
});

describe('TaskListStore.refresh (§62)', () => {
  it('quietly re-reads the project’s tasks, without a loading flicker', async () => {
    const { store, gateway } = setup();
    await store.load(section());
    (gateway.tasks.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      task({ id: 'task-a', title: 'Renamed by an agent' }),
      task({ id: 'task-b', title: 'Added by an agent' }),
    ]);

    const pending = store.refresh();
    // An agent's write must not paint a skeleton over a page the user is reading.
    expect(store.loading()).toBe(false);
    await pending;

    expect(store.tasks().map(({ title }) => title)).toEqual(['Renamed by an agent', 'Added by an agent']);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('leaves the rendered list alone when the re-read fails', async () => {
    const { store, gateway } = setup();
    await store.load(section());
    (gateway.tasks.list as ReturnType<typeof vi.fn>).mockRejectedValue(new GatewayError('unreachable', 0, 'down'));

    await store.refresh();

    expect(store.tasks().map(({ title }) => title)).toEqual(['Write the first draft']);
    expect(store.error()).toBeNull();
    expect(store.loadFailed()).toBe(false);
  });

  it('defers while an optimistic completion is in flight, and lands once it settles', async () => {
    const pending = deferred<Task>();
    const { store, gateway } = setup({ complete: vi.fn(async () => pending.promise) });
    await store.load(section());
    const listCalls = (gateway.tasks.list as ReturnType<typeof vi.fn>).mock.calls.length;
    (gateway.tasks.list as ReturnType<typeof vi.fn>).mockResolvedValue([task({ id: 'task-a', status: 'todo' })]);

    const completing = store.complete('task-a' as TaskId);
    await store.refresh();

    // The host flushes its frame at commit, before this tab's own response lands — so a
    // refresh that ran now would repaint the optimistic tick as `todo`.
    expect(store.tasks()[0]?.status).toBe('done');
    expect((gateway.tasks.list as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(listCalls);

    pending.resolve(task({ id: 'task-a', status: 'done', completedAt: AT }));
    await completing;
    await Promise.resolve();
    await Promise.resolve();

    expect((gateway.tasks.list as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(listCalls);
  });

  it('coalesces a burst of frames into one re-read', async () => {
    const pending = deferred<Task>();
    const { store, gateway } = setup({ complete: vi.fn(async () => pending.promise) });
    await store.load(section());
    const listCalls = (gateway.tasks.list as ReturnType<typeof vi.fn>).mock.calls.length;

    const completing = store.complete('task-a' as TaskId);
    await store.refresh();
    await store.refresh();
    await store.refresh();
    pending.resolve(task({ id: 'task-a', status: 'done', completedAt: AT }));
    await completing;
    await Promise.resolve();
    await Promise.resolve();

    // An agent working through a checklist should cost one read, not one per tick.
    expect((gateway.tasks.list as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(listCalls + 1);
  });

  it('does nothing before a project is loaded', async () => {
    const { store, gateway } = setup();

    await store.refresh();

    expect(gateway.tasks.list).not.toHaveBeenCalled();
  });
});

describe('TaskListStore.archive (§34)', () => {
  it('re-reads the list, because the void response carries no row to paint', async () => {
    const { store, gateway } = setup({ tasks: [task(), task({ id: 'task-b', title: 'Stays behind' })] });
    await store.load(section());
    (gateway.tasks.list as ReturnType<typeof vi.fn>).mockResolvedValue([task({ id: 'task-b', title: 'Stays behind' })]);

    expect(await store.archive(task().id)).toBe(true);

    expect(gateway.tasks.archive).toHaveBeenCalledWith(task().id);
    // Nothing here removed the row; it is gone because the store went back and asked.
    expect(store.tasks().map(({ title }) => title)).toEqual(['Stays behind']);
  });

  it('marks the row as archiving until the write settles', async () => {
    const result = deferred<void>();
    const { store } = setup({ archive: vi.fn(() => result.promise) });
    await store.load(section());

    const archiving = store.archive(task().id);

    expect(store.archivingIds().has(task().id)).toBe(true);

    result.resolve(undefined);
    await archiving;

    expect(store.archivingIds().has(task().id)).toBe(false);
  });

  it('stops marking the row as archiving when the write fails', async () => {
    const result = deferred<void>();
    const { store } = setup({ archive: vi.fn(() => result.promise) });
    await store.load(section());

    const archiving = store.archive(task().id);
    result.reject(new GatewayError('unreachable', 0, 'offline'));
    await archiving;

    // A row that stayed marked would be left disabled with no way back for the user.
    expect(store.archivingIds().has(task().id)).toBe(false);
  });

  it('keeps the row and reports the reason when the archive fails', async () => {
    const before = task({ title: 'Keep every field', priority: 'high' });
    const { store } = setup({
      tasks: [before],
      archive: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
      }),
    });
    await store.load(section());

    expect(await store.archive(before.id)).toBe(false);

    // The write was never optimistic, so there is nothing to revert — the row simply stayed.
    expect(store.tasks()).toEqual([before]);
    expect(store.error()).toContain('could not reach the prototype host');
  });
});

describe('TaskListStore.archive', () => {
  it('re-reads the list, because the void response carries nothing to paint', async () => {
    // §9 pins `TaskGateway.archive` to `Promise<void>`, so unlike `complete` there is no
    // updated row to patch in — the row leaves this list only because the re-read says so.
    const remaining = [task({ id: 'task-kept', title: 'Still here' })];
    const list = vi
      .fn<() => Promise<Task[]>>()
      .mockResolvedValueOnce([task(), ...remaining])
      .mockResolvedValue(remaining);
    const { store, gateway } = setup();
    (gateway.tasks as { list: unknown }).list = list;
    await store.load(section());
    expect(store.tasks()).toHaveLength(2);

    expect(await store.archive(task().id)).toBe(true);

    expect(gateway.tasks.archive).toHaveBeenCalledWith(task().id);
    expect(store.tasks().map(({ id }) => id)).toEqual(['task-kept']);
  });

  it('marks the row as archiving while the write is out, and clears it either way', async () => {
    const gate = deferred<void>();
    const { store } = setup({ archive: vi.fn(async () => gate.promise) });
    await store.load(section());

    const write = store.archive(task().id);
    expect(store.archivingIds().has(task().id)).toBe(true);

    gate.resolve();
    await write;
    expect(store.archivingIds().has(task().id)).toBe(false);
  });

  it('leaves the row where it was and names the reason when the archive fails', async () => {
    // Not optimistic, so there is nothing to roll back — but the row must not vanish on a
    // failure either, and the person needs to know why nothing happened.
    const { store } = setup({
      archive: vi.fn(async () => {
        throw new GatewayError('rule_violation', 409, 'an archived task cannot be archived');
      }),
    });
    await store.load(section());

    expect(await store.archive(task().id)).toBe(false);

    expect(store.tasks().map(({ id }) => id)).toEqual([task().id]);
    expect(store.error()).toContain('cannot be archived');
    expect(store.archivingIds().has(task().id)).toBe(false);
  });
});
