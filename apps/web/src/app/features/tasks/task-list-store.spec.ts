import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  TaskSchema,
  type Project,
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
    name,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  });

const task = (overrides: Record<string, unknown> = {}): Task =>
  TaskSchema.parse({
    id: 'task-a',
    projectId: 'project-a',
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
} = {}) => {
  const projects = options.projects ?? [project(), project('project-b', 'Project B')];
  const tasks = options.tasks ?? [task()];
  const gateway: WorkManagerGateway = {
    // Slice 11 added `dashboard` to the boundary; nothing on the project page reads it.
    dashboard: { get: vi.fn(async () => emptyDashboard()) },
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
    } as unknown as WorkManagerGateway['sections'],
    tasks: {
      list: vi.fn(async () => tasks),
      get: vi.fn(async () => tasks[0]!),
      create: options.create ?? vi.fn(async (input) => task({ id: 'task-created', ...input })),
      update:
        options.update ??
        vi.fn(async (id: TaskId, input: UpdateTaskInput) => ({ ...tasks[0]!, id, ...input, updatedAt: AT } as Task)),
      complete: options.complete ?? vi.fn(async (id) => task({ id, status: 'done', completedAt: AT })),
      archive: vi.fn(async () => undefined),
    },
    progress: { get: vi.fn() },
    timeline: { get: vi.fn() },
    reflections: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
  };

  TestBed.configureTestingModule({
    providers: [TaskListStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  return { store: TestBed.inject(TaskListStore), gateway };
};

describe('TaskListStore', () => {
  it('loads one project’s unarchived tasks, and only that project’s', async () => {
    const { store, gateway } = setup();

    await store.load(project('project-b').id);

    expect(store.tasks().map(({ title }) => title)).toEqual(['Write the first draft']);
    expect(store.projectId()).toBe('project-b');
    // Archived tasks stay out, which is also what keeps them out of the header's progress.
    expect(gateway.tasks.list).toHaveBeenCalledWith({ projectId: 'project-b', includeArchived: false });
  });

  it('creates a trimmed task in the loaded project and selects the server result', async () => {
    const { store, gateway } = setup();
    await store.load(project('project-b').id);

    expect(await store.create('  New task  ')).toBe(true);

    expect(gateway.tasks.create).toHaveBeenCalledWith({ projectId: 'project-b', title: 'New task' });
    expect(store.tasks().at(-1)?.id).toBe('task-created');
    expect(store.selectedTask()?.id).toBe('task-created');
  });

  it('updates and clears an estimate through the shared task update path', async () => {
    const { store, gateway } = setup(); await store.load(project().id);
    await store.updateEstimate(task().id, 3);
    expect(gateway.tasks.update).toHaveBeenCalledWith(task().id, { estimate: 3 });
    await store.updateEstimate(task().id, null);
    expect(gateway.tasks.update).toHaveBeenLastCalledWith(task().id, { estimate: null });
  });

  it('refuses to create before a project has loaded', async () => {
    const { store, gateway } = setup();

    expect(await store.create('New task')).toBe(false);
    expect(gateway.tasks.create).not.toHaveBeenCalled();
    expect(store.error()).toContain('project');
  });

  it('rejects a blank quick-create title without calling the gateway', async () => {
    const { store, gateway } = setup();
    await store.load(project().id);

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
    await store.load(project().id);

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
    await store.load(project().id);

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
    await store.load(project().id);

    const completion = store.complete(before.id);
    result.reject(new GatewayError('unreachable', 0, 'could not reach the prototype host'));
    await completion;

    expect(store.tasks()[0]).toEqual(before);
    expect(store.error()).toContain('could not reach the prototype host');
  });

  it('does not let an older failed completion overwrite a newer title mutation', async () => {
    const result = deferred<Task>();
    const { store } = setup({ complete: vi.fn(() => result.promise) });
    await store.load(project().id);

    const completion = store.complete(task().id);
    await store.updateTitle(task().id, 'Newer title');
    result.reject(new GatewayError('unreachable', 0, 'offline'));
    await completion;

    expect(store.tasks()[0]).toMatchObject({ title: 'Newer title', status: 'todo' });
  });

  it('does not let an older successful completion response overwrite a newer title mutation', async () => {
    const result = deferred<Task>();
    const { store } = setup({ complete: vi.fn(() => result.promise) });
    await store.load(project().id);

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
    await store.load(project().id);

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
    await store.load('project-a' as never);

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
