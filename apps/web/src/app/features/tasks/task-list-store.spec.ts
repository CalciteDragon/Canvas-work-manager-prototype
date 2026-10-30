import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  ProjectSectionSchema,
  TaskSchema,
  type Project,
  type ProjectSection,
  type Task,
  type TaskId,
  type TaskAddResult,
  type TaskWriteResult,
  OperationReceiptSchema,
  type UpdateTaskInput,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { emptyDashboard } from '../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../core/gateway/work-manager-gateway';
import { provideRecordingReporter } from '../../core/history/testing/recording-reporter';
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

const resultOf = (value: Task) => ({
  task: value,
  operation: OperationReceiptSchema.parse({
    historyId: 'history-test',
    actionId: 'action-test',
    revision: 1,
    operation: 'task.add',
    label: 'Task write',
    createdAt: AT,
    expiresAt: '2026-08-28T16:00:00.000Z',
  }),
});

it('keeps each archived task receipt when concurrent replies arrive out of order', async () => {
  const first = task();
  const second = task({ id: 'task-b' });
  const a = deferred<TaskWriteResult>(), b = deferred<TaskWriteResult>();
  const { store } = setup({ tasks: [first, second], archive: id => id === first.id ? a.promise : b.promise });
  await store.load(section());
  const earlier = store.archive(first.id), later = store.archive(second.id);
  const secondResult = { ...resultOf(second), operation: OperationReceiptSchema.parse({ ...resultOf(second).operation, actionId: 'action-second' }) };
  b.resolve(secondResult);
  await later;
  a.resolve(resultOf(first));
  await earlier;
  expect(store.archiveReport(second.id)?.receipt?.actionId).toBe('action-second');
  expect(store.archiveReport(first.id)?.receipt?.actionId).toBe('action-test');
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
    // Slice 25.5 added `todos`; this store reads a canvas, never the chronology.
    todos: { get: vi.fn(async (projectId) => ({ projectId, items: [] })) },
    archive: { get: vi.fn(async (projectId) => ({ projectId, root: project(projectId) as Extract<Project, { kind: 'root' }>, items: [] })) },
    journal: { get: vi.fn(async (projectId) => ({ projectId, items: [] })), completedWork: vi.fn(async (projectId) => ({ projectId, candidates: [] })) },
    history: { summary: vi.fn(async (projectId) => ({ projectId, historyId: null, revision: 0, undo: null, redo: null, blockedBy: null })), transition: vi.fn() },
    projects: {
      list: vi.fn(async () => projects),
      archived: vi.fn(async () => ({ items: [] })),
      get: vi.fn(async () => projects[0]!),
      create: vi.fn(),
      update: vi.fn(async (_id, input) => ({ project: { ...projects[0]!, ...input } as Project, operation: null })),
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
    shortcuts: {
      list: vi.fn(async () => []),
      sources: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      move: vi.fn(),
      remove: vi.fn(async () => undefined),
    } as unknown as WorkManagerGateway['shortcuts'],
    tasks: {
      list: vi.fn(async () => tasks),
      get: vi.fn(async () => tasks[0]!),
      create: options.create ?? vi.fn(async (input) => resultOf(task({ id: 'task-created', ...input }))),
      update:
        options.update ??
        vi.fn(async (id: TaskId, input: UpdateTaskInput) => resultOf({ ...tasks[0]!, id, ...input, updatedAt: AT } as Task)),
      complete: options.complete ?? vi.fn(async (id) => resultOf(task({ id, status: 'done', completedAt: AT }))),
      archive: options.archive ?? vi.fn(async () => resultOf(task({ archivedAt: AT }))),
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

  it('creates a trimmed task in the loaded project without selecting the server result', async () => {
    const { store, gateway } = setup();
    await store.load(section('project-b'));

    expect(await store.create('  New task  ')).toBe('added');

    // The container is named, not resolved: the domain would otherwise send the row to the
    // project's *first* task list, which may be a different one on the same canvas.
    expect(gateway.tasks.create).toHaveBeenCalledWith({
      projectId: 'project-b',
      title: 'New task',
      sectionId: 'section-project-b-tasks',
    });
    expect(store.tasks().at(-1)?.id).toBe('task-created');
    expect(store.selectedTaskId()).toBeNull();
    store.selectTask(store.tasks()[0]!.id);
    const selected = store.selectedTaskId();
    expect(await store.create('Another task')).toBe('added');
    expect(store.selectedTaskId()).toBe(selected);
  });

  it('clears a vanished selection on a quiet refresh', async () => {
    const { store, gateway } = setup();
    await store.load(section());
    store.selectTask(store.tasks()[0]!.id);
    gateway.tasks.list = vi.fn(async () => []);
    await store.refresh();
    expect(store.selectedTaskId()).toBeNull();
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

    expect(await store.create('New task')).toBe('refused');
    expect(gateway.tasks.create).not.toHaveBeenCalled();
    // A task cannot exist without a container to render it, so there is nowhere to put one.
    expect(store.createError()?.sentence).toContain('section');
  });

  it('rejects a blank quick-create title without calling the gateway', async () => {
    const { store, gateway } = setup();
    await store.load(section());

    expect(await store.create('   ')).toBe('refused');
    expect(gateway.tasks.create).not.toHaveBeenCalled();
    expect(store.createError()).toEqual({ sentence: 'Enter a task title.', reason: null });
    expect(store.error()).toBeNull();
  });

  it('updates title, priority, and date-only dueAt from the gateway results', async () => {
    const update = vi.fn(async (id: TaskId, input: UpdateTaskInput) =>
      resultOf(task({
        id,
        ...input,
        dueAt: input.dueAt === null ? undefined : input.dueAt,
        updatedAt: '2026-08-27T17:00:00.000Z',
      })),
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
    const result = deferred<TaskWriteResult>();
    const { store } = setup({ complete: vi.fn(() => result.promise) });
    await store.load(section());

    const completion = store.complete(task().id);

    expect(store.tasks()[0]?.status).toBe('done');
    expect(store.completingIds().has(task().id)).toBe(true);

    result.resolve(resultOf(task({ status: 'done', completedAt: '2026-08-27T18:00:00.000Z' })));
    await completion;

    expect(store.tasks()[0]?.completedAt).toBe('2026-08-27T18:00:00.000Z');
    expect(store.completingIds().has(task().id)).toBe(false);
  });

  it('restores the exact previous task and exposes a message when completion fails', async () => {
    const before = task({ title: 'Keep every field', priority: 'high' });
    const result = deferred<TaskWriteResult>();
    const { store } = setup({ tasks: [before], complete: vi.fn(() => result.promise) });
    await store.load(section());

    const completion = store.complete(before.id);
    result.reject(new GatewayError('unreachable', 0, 'could not reach the prototype host'));
    await completion;

    expect(store.tasks()[0]).toEqual(before);
    expect(store.error()).toBeNull();
    expect(store.rowErrors().get(before.id)?.reason).toContain('could not reach the prototype host');
  });

  it('does not let an older failed completion overwrite a newer title mutation', async () => {
    const result = deferred<TaskWriteResult>();
    const { store } = setup({ complete: vi.fn(() => result.promise) });
    await store.load(section());

    const completion = store.complete(task().id);
    await store.updateTitle(task().id, 'Newer title');
    result.reject(new GatewayError('unreachable', 0, 'offline'));
    await completion;

    expect(store.tasks()[0]).toMatchObject({ title: 'Newer title', status: 'todo' });
  });

  it('does not let an older successful completion response overwrite a newer title mutation', async () => {
    const result = deferred<TaskWriteResult>();
    const { store } = setup({ complete: vi.fn(() => result.promise) });
    await store.load(section());

    const completion = store.complete(task().id);
    await store.updateTitle(task().id, 'Newer title');
    result.resolve(resultOf(task({ title: 'Stale title', status: 'done', completedAt: AT })));
    await completion;

    expect(store.tasks()[0]).toMatchObject({ title: 'Newer title', status: 'done' });
  });

  it('keeps an older successful same-field edit when the queued newer edit fails', async () => {
    const first = deferred<TaskWriteResult>();
    const second = deferred<TaskWriteResult>();
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

    first.resolve(resultOf(task({ title: 'Persisted title' })));
    await older;
    await Promise.resolve();
    const callsAfterOlderSettled = update.mock.calls.length;

    second.reject(new GatewayError('unreachable', 0, 'newer edit failed'));
    await newer;
    expect(callsWhileOlderPending).toBe(1);
    expect(callsAfterOlderSettled).toBe(2);
    expect(store.tasks()[0]?.title).toBe('Persisted title');
    expect(store.fieldSave(task().id, 'title')).toEqual({ state: 'failed', failure: { sentence: 'Not saved. Try again.', reason: expect.stringContaining('newer edit failed') } });
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
    const gate = deferred<TaskWriteResult>();
    const { store } = setup({ complete: vi.fn(() => gate.promise) });
    await store.load(section());

    const completing = store.complete('task-a' as TaskId);
    // Painted before the gateway has answered — the whole point of an optimistic write.
    expect(store.tasks()[0]?.status).toBe('done');

    gate.reject(new GatewayError('unreachable', 0, 'prototype failure injection (§46 Failure Rate)'));
    await completing;

    expect(store.tasks()[0]?.status).toBe('todo');
    expect(store.tasks()[0]?.completedAt).toBeUndefined();
    expect(store.rowErrors().get('task-a' as TaskId)?.reason).toContain('prototype failure injection');
  });
});

describe('TaskListStore.reopen (§34, §62, §63)', () => {
  it('paints todo and deletes completedAt before the gateway answers, then applies server fields', async () => {
    const before = task({ status: 'done', completedAt: AT });
    const gate = deferred<TaskWriteResult>();
    const update = vi.fn(() => gate.promise);
    const { store } = setup({ tasks: [before], update });
    await store.load(section());

    const reopening = store.reopen(before.id);
    expect(store.tasks()[0]?.status).toBe('todo');
    expect(store.tasks()[0]).not.toHaveProperty('completedAt');
    expect(store.completingIds().has(before.id)).toBe(true);
    expect(update).toHaveBeenCalledWith(before.id, { status: 'todo' });

    const after = task({ status: 'todo', updatedAt: '2026-08-27T18:00:00.000Z' });
    gate.resolve(resultOf(after));
    expect(await reopening).toBe(true);
    expect(store.tasks()[0]).toEqual(after);
    expect(store.completingIds().has(before.id)).toBe(false);
  });

  it('restores the exact previous task and completedAt and exposes a failed reopen', async () => {
    const before = task({ status: 'done', completedAt: AT, priority: 'high' });
    const gate = deferred<TaskWriteResult>();
    const { store } = setup({ tasks: [before], update: vi.fn(() => gate.promise) });
    await store.load(section());

    const reopening = store.reopen(before.id);
    gate.reject(new GatewayError('conflict', 409, 'the task is archived'));
    expect(await reopening).toBe(false);
    expect(store.tasks()[0]).toEqual(before);
    expect(store.rowErrors().get(before.id)?.reason).toContain('the task is archived');
    expect(store.completingIds().has(before.id)).toBe(false);
  });

  it('refuses an unknown, open or already-toggling task without another request', async () => {
    const done = task({ status: 'done', completedAt: AT });
    const open = task({ id: 'task-open' });
    const gate = deferred<TaskWriteResult>();
    const update = vi.fn(() => gate.promise);
    const { store, gateway } = setup({ tasks: [done, open], update });
    await store.load(section());

    expect(await store.reopen('task-unknown' as TaskId)).toBe(false);
    expect(await store.reopen(open.id)).toBe(false);
    const reopening = store.reopen(done.id);
    expect(await store.reopen(done.id)).toBe(false);
    // A slow reopen has painted todo, but the opposite toggle must still wait.
    expect(await store.complete(done.id)).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(gateway.tasks.complete).not.toHaveBeenCalled();
    gate.resolve(resultOf(task()));
    await reopening;
  });

  it('queues a burst of live refreshes and applies one read after reopen settles', async () => {
    const before = task({ status: 'done', completedAt: AT });
    const gate = deferred<TaskWriteResult>();
    const { store, gateway } = setup({ tasks: [before], update: vi.fn(() => gate.promise) });
    await store.load(section());
    const fresh = task({ title: 'Renamed by an agent' });
    vi.mocked(gateway.tasks.list).mockResolvedValue([fresh]);

    const reopening = store.reopen(before.id);
    await store.refresh();
    await store.refresh();
    expect(gateway.tasks.list).toHaveBeenCalledTimes(1);
    expect(store.tasks()[0]?.status).toBe('todo');
    expect(store.tasks()[0]?.title).toBe(before.title);
    gate.resolve(resultOf(task()));
    await reopening;
    await Promise.resolve();
    await Promise.resolve();
    expect(gateway.tasks.list).toHaveBeenCalledTimes(2);
    expect(store.tasks()).toEqual([fresh]);
  });

  it.each(['success', 'failure'] as const)('does not let an older reopen %s overwrite a newer title edit', async (outcome) => {
    const before = task({ status: 'done', completedAt: AT });
    const gate = deferred<TaskWriteResult>();
    const update = vi.fn<WorkManagerGateway['tasks']['update']>(async (_id, input) =>
      input.status === 'todo' ? gate.promise : resultOf(task({ title: 'Newer title', updatedAt: '2026-08-27T18:00:00.000Z' })),
    );
    const { store } = setup({ tasks: [before], update });
    await store.load(section());

    const reopening = store.reopen(before.id);
    await store.updateTitle(before.id, 'Newer title');
    if (outcome === 'failure') gate.reject(new GatewayError('unreachable', 0, 'offline'));
    else gate.resolve(resultOf(task({ title: 'Stale title' })));
    await reopening;
    expect(store.tasks()[0]).toMatchObject({
      title: 'Newer title',
      status: outcome === 'success' ? 'todo' : 'done',
      updatedAt: '2026-08-27T18:00:00.000Z',
    });
    if (outcome === 'failure') expect(store.tasks()[0]?.completedAt).toBe(AT);
    else expect(store.tasks()[0]).not.toHaveProperty('completedAt');
  });

  it('reports the response task’s own project receipt', async () => {
    const reporter = provideRecordingReporter();
    const before = task({ status: 'done', completedAt: AT });
    const response = resultOf(task({ projectId: 'project-b' }));
    const { store } = setup({ tasks: [before], update: vi.fn(async () => response) });
    await store.load(section());

    expect(await store.reopen(before.id)).toBe(true);
    expect(reporter.events).toEqual(['begin', { projectId: 'project-b', receipt: response.operation }, 'end']);
  });
});

describe('TaskListStore completion toggles are bound to their section', () => {
  it.each([
    ['reopen', 'success'], ['reopen', 'failure'], ['complete', 'success'], ['complete', 'failure'],
  ] as const)('drops a late %s %s after loading another section', async (action, outcome) => {
    const before = task(action === 'reopen' ? { status: 'done', completedAt: AT } : {});
    const gate = deferred<TaskWriteResult>();
    const { store, gateway } = setup({
      tasks: [before], update: vi.fn(() => gate.promise), complete: vi.fn(() => gate.promise),
    });
    await store.load(section());
    const writing = store[action](before.id);
    expect(action === 'reopen' ? gateway.tasks.update : gateway.tasks.complete).toHaveBeenCalledOnce();
    // Same id makes an accidental field patch observable even across the section switch.
    const current = task({ sectionId: 'section-project-b-tasks', projectId: 'project-b', title: 'Current section' });
    vi.mocked(gateway.tasks.list).mockResolvedValue([current]);
    await store.load(section('project-b'));

    if (outcome === 'failure') gate.reject(new GatewayError('unreachable', 0, 'old section failed'));
    else gate.resolve(resultOf(task({ status: 'done', completedAt: AT, updatedAt: '2026-08-27T18:00:00.000Z' })));
    expect(await writing).toBe(false);
    expect(store.tasks()).toEqual([current]);
    expect(store.error()).toBeNull();
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
  });

  it('says a failed read in product words and keeps it through Try again until it answers (Slice 78)', async () => {
    const { store, gateway } = setup();
    const list = gateway.tasks.list as ReturnType<typeof vi.fn>;
    list.mockRejectedValueOnce(new GatewayError('not_found', 404, 'Section section-project-a-tasks was not found'));
    await store.load(section());
    expect(store.error()).toEqual({ sentence: 'This task list isn’t available.', reason: 'Section section-project-a-tasks was not found' });
    expect(store.tasks()).toEqual([]);

    const again = deferred<Task[]>();
    list.mockImplementationOnce(() => again.promise);
    const retrying = store.retry();
    expect(store.loading()).toBe(true);
    expect(store.error()?.sentence).toBe('This task list isn’t available.');
    again.resolve([task()]);
    await retrying;

    expect(store.error()).toBeNull();
    expect(store.tasks()).toHaveLength(1);
  });

  it('clears a read failure when another section loads', async () => {
    const { store, gateway } = setup();
    (gateway.tasks.list as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new GatewayError('internal_error', 500, 'boom'));
    await store.load(section());
    expect(store.error()?.sentence).toBe('Couldn’t load this task list.');
    const other = store.load(section('project-b'));
    expect(store.error()).toBeNull();
    await other;
  });

  it('keeps a drag-receive failure apart from the read, and a successful write after a failed read re-reads in full (Slice 78)', async () => {
    const update = vi.fn(async () => { throw new GatewayError('internal_error', 500, 'move refused'); });
    const { store, gateway } = setup({ update });
    const list = gateway.tasks.list as ReturnType<typeof vi.fn>;
    list.mockRejectedValueOnce(new GatewayError('unreachable', 0, 'down'));
    await store.load(section());

    expect(await store.receive('task-elsewhere' as TaskId, section().id)).toBe(false);
    expect(store.receiveError()?.reason).toContain('move refused');
    expect(store.error()?.sentence).toBe('Couldn’t reach your workspace, so this task list didn’t load.');

    const reads = list.mock.calls.length;
    expect(await store.create('Added anyway')).toBe('added');
    await Promise.resolve(); await Promise.resolve();
    expect(list.mock.calls.length).toBe(reads + 1);
    expect(store.error()).toBeNull();
  });

  it('a failed Try again never clears a drag-receive failure (§19)', async () => {
    const update = vi.fn(async () => { throw new GatewayError('internal_error', 500, 'move refused'); });
    const { store, gateway } = setup({ update });
    const list = gateway.tasks.list as ReturnType<typeof vi.fn>;
    list.mockRejectedValueOnce(new GatewayError('unreachable', 0, 'down'));
    await store.load(section());
    await store.receive('task-elsewhere' as TaskId, section().id);
    list.mockRejectedValueOnce(new GatewayError('unreachable', 0, 'still down'));

    await store.retry();

    expect(store.receiveError()?.reason).toContain('move refused');
    expect(store.error()?.reason).toBe('still down');
  });

  it('the full read after a write never drops another write in flight (Slice 78)', async () => {
    const add = deferred<TaskAddResult>();
    const { store, gateway } = setup({ create: vi.fn(() => add.promise) });
    const list = gateway.tasks.list as ReturnType<typeof vi.fn>;
    list.mockRejectedValueOnce(new GatewayError('unreachable', 0, 'down'));
    await store.load(section());
    const adding = store.create('Pending add');
    expect(store.pendingCreate()?.title).toBe('Pending add');

    expect(await store.receive('task-elsewhere' as TaskId, section().id)).toBe(true);
    expect(store.pendingCreate()?.title).toBe('Pending add');

    add.resolve(resultOf(task({ id: 'task-added', title: 'Pending add' })) as TaskAddResult);
    expect(await adding).toBe('added');
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    expect(store.error()).toBeNull();
  });

  it('a failed read never clears a drag-receive failure', async () => {
    const update = vi.fn(async () => { throw new GatewayError('internal_error', 500, 'move refused'); });
    const { store, gateway } = setup({ update });
    await store.load(section());
    await store.receive('task-elsewhere' as TaskId, section().id);
    (gateway.tasks.list as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new GatewayError('unreachable', 0, 'down'));

    await store.refresh();

    expect(store.receiveError()?.reason).toContain('move refused');
    expect(store.tasks()).toHaveLength(1);
  });

  it('defers while an optimistic completion is in flight, and lands once it settles', async () => {
    const pending = deferred<TaskWriteResult>();
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

    pending.resolve(resultOf(task({ id: 'task-a', status: 'done', completedAt: AT })));
    await completing;
    await Promise.resolve();
    await Promise.resolve();

    expect((gateway.tasks.list as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(listCalls);
  });

  it('coalesces a burst of frames into one re-read', async () => {
    const pending = deferred<TaskWriteResult>();
    const { store, gateway } = setup({ complete: vi.fn(async () => pending.promise) });
    await store.load(section());
    const listCalls = (gateway.tasks.list as ReturnType<typeof vi.fn>).mock.calls.length;

    const completing = store.complete('task-a' as TaskId);
    await store.refresh();
    await store.refresh();
    await store.refresh();
    pending.resolve(resultOf(task({ id: 'task-a', status: 'done', completedAt: AT })));
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
  it('re-reads the list, to reconcile the archived subtree', async () => {
    const { store, gateway } = setup({ tasks: [task(), task({ id: 'task-b', title: 'Stays behind' })] });
    await store.load(section());
    (gateway.tasks.list as ReturnType<typeof vi.fn>).mockResolvedValue([task({ id: 'task-b', title: 'Stays behind' })]);

    expect(await store.archive(task().id)).toBe(true);

    expect(gateway.tasks.archive).toHaveBeenCalledWith(task().id);
    // Nothing here removed the row; it is gone because the store went back and asked.
    expect(store.tasks().map(({ title }) => title)).toEqual(['Stays behind']);
  });

  it('marks the row as archiving until the write settles', async () => {
    const result = deferred<TaskWriteResult>();
    const { store } = setup({ archive: vi.fn(() => result.promise) });
    await store.load(section());

    const archiving = store.archive(task().id);

    expect(store.archivingIds().has(task().id)).toBe(true);

    result.resolve(resultOf(task({ archivedAt: AT })));
    await archiving;

    expect(store.archivingIds().has(task().id)).toBe(false);
  });

  it('stops marking the row as archiving when the write fails', async () => {
    const result = deferred<TaskWriteResult>();
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
    expect(store.rowErrors().get(before.id)?.reason).toContain('could not reach the prototype host');
  });
});

describe('TaskListStore.archive', () => {
  it('re-reads the list, to reconcile all affected rows', async () => {
    // Archive returns the root row; re-read to reconcile every affected descendant.
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
    const gate = deferred<TaskWriteResult>();
    const { store } = setup({ archive: vi.fn(async () => gate.promise) });
    await store.load(section());

    const write = store.archive(task().id);
    expect(store.archivingIds().has(task().id)).toBe(true);

    gate.resolve(resultOf(task({ archivedAt: AT })));
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
    expect(store.rowErrors().get(task().id)?.reason).toContain('cannot be archived');
    expect(store.archivingIds().has(task().id)).toBe(false);
  });
});

describe('TaskListStore reports every write to the header’s history (Slice 41)', () => {
  it('begins before each request, commits with the task’s own project, and ends in finally', async () => {
    const reporter = provideRecordingReporter();
    // The list sits in a Home shortcut: its rows belong to the source sub-project, project-b.
    const owned = task({ projectId: 'project-b', sectionId: 'section-project-b-tasks' });
    const { store } = setup({
      tasks: [owned],
      create: vi.fn(async (input) => resultOf(task({ id: 'task-created', ...input }))),
      update: vi.fn(async (id, input) => resultOf({ ...owned, id, ...input } as Task)),
      complete: vi.fn(async (id) => resultOf({ ...owned, id, status: 'done', completedAt: AT })),
      archive: vi.fn(async () => resultOf({ ...owned, archivedAt: AT })),
    });
    await store.load(section('project-b'));

    await store.create('Another');
    await store.updateTitle(owned.id, 'Renamed');
    await store.complete(owned.id);
    await store.archive(owned.id);
    expect(reporter.reports()[3]).toMatchObject({ projectId: 'project-b', feedback: 'own' });
    expect(store.archiveReport(owned.id)).toEqual(reporter.reports()[3]);
    await store.receive('task-elsewhere' as TaskId, 'section-project-b-tasks' as ProjectSection['id']);

    expect(reporter.events.filter((event) => event === 'begin')).toHaveLength(5);
    expect(reporter.events.filter((event) => event === 'end')).toHaveLength(5);
    expect(reporter.reports().map(({ projectId }) => projectId)).toEqual(['project-b', 'project-b', 'project-b', 'project-b', 'project-b']);
    expect(reporter.events.slice(0, 3)).toEqual(['begin', expect.objectContaining({ receipt: expect.objectContaining({ historyId: 'history-test' }) }), 'end']);
  });

  it('ends a failed write without a commit, so the header re-reads', async () => {
    const reporter = provideRecordingReporter();
    const { store } = setup({ complete: vi.fn(async () => { throw new GatewayError('unreachable', 0, 'offline'); }) });
    await store.load(section());

    expect(await store.complete('task-a' as TaskId)).toBe(false);
    expect(reporter.events).toEqual(['begin', 'end']);
  });
});

describe('TaskListStore quick-add pending row (Slice 75, §34, §63)', () => {
  it('shows the pending title synchronously, then replaces it with the server row in place', async () => {
    const created = deferred<TaskAddResult>();
    const { store } = setup({ create: vi.fn<WorkManagerGateway['tasks']['create']>(() => created.promise) });
    await store.load(section());

    const adding = store.create('  Order tiles  ');
    expect(store.pendingCreate()).toMatchObject({ title: 'Order tiles' });
    expect(store.tasks()).toHaveLength(1);

    created.resolve(resultOf(task({ id: 'task-tiles', title: 'Order tiles' })));
    expect(await adding).toBe('added');
    expect(store.pendingCreate()).toBeNull();
    expect(store.tasks().map(({ id }) => id)).toEqual(['task-a', 'task-tiles']);
    expect(store.createError()).toBeNull();
  });

  it('refuses a second submit while one is pending, without a request', async () => {
    const created = deferred<TaskAddResult>();
    const create = vi.fn<WorkManagerGateway['tasks']['create']>(() => created.promise);
    const { store } = setup({ create });
    await store.load(section());

    const first = store.create('Order tiles');
    expect(await store.create('Second')).toBe('refused');
    expect(create).toHaveBeenCalledTimes(1);
    expect(store.pendingCreate()?.title).toBe('Order tiles');
    created.resolve(resultOf(task({ id: 'task-tiles', title: 'Order tiles' })));
    await first;
  });

  it('owes a read after a failed add, and names the title when the task is absent', async () => {
    const { store, gateway } = setup({
      create: vi.fn(async () => { throw new GatewayError('unreachable', 0, 'could not reach the prototype host'); }),
    });
    await store.load(section());
    const reads = vi.mocked(gateway.tasks.list).mock.calls.length;

    expect(await store.create('Order tiles')).toBe('failed');
    expect(vi.mocked(gateway.tasks.list).mock.calls.length).toBe(reads + 1);
    expect(store.pendingCreate()).toBeNull();
    expect(store.tasks().map(({ id }) => id)).toEqual(['task-a']);
    expect(store.createError()).toEqual({ sentence: 'Couldn’t add “Order tiles”. Try again.', reason: 'could not reach the prototype host' });
    expect(store.error()).toBeNull();
  });

  it('keeps a task that committed behind a failed response, so a retry cannot duplicate it', async () => {
    const committed = task({ id: 'task-tiles', title: 'Order tiles' });
    const { store, gateway } = setup({
      create: vi.fn(async () => { throw new GatewayError('internal_error', 500, 'the response was lost'); }),
    });
    await store.load(section());
    gateway.tasks.list = vi.fn(async () => [task(), committed]);

    expect(await store.create('Order tiles')).toBe('added');
    expect(store.tasks().map(({ id }) => id)).toEqual(['task-a', 'task-tiles']);
    expect(store.createError()).toBeNull();
  });

  it('does not count a same-title task that was already in the list as the committed add', async () => {
    const existing = task({ id: 'task-milk', title: 'Buy milk' });
    const { store } = setup({
      tasks: [existing],
      create: vi.fn(async () => { throw new GatewayError('internal_error', 500, 'refused'); }),
    });
    await store.load(section());

    expect(await store.create('Buy milk')).toBe('failed');
    expect(store.createError()?.sentence).toBe('Couldn’t add “Buy milk”. Try again.');
  });

  it('says the add could not be confirmed when the owed read also fails', async () => {
    const { store, gateway } = setup({
      create: vi.fn(async () => { throw new GatewayError('unreachable', 0, 'offline'); }),
    });
    await store.load(section());
    gateway.tasks.list = vi.fn(async () => { throw new GatewayError('unreachable', 0, 'offline'); });

    expect(await store.create('Order tiles')).toBe('unconfirmed');
    expect(store.pendingCreate()).toBeNull();
    expect(store.createError()).toEqual({ sentence: 'Couldn’t confirm “Order tiles” was added. Check the list before adding it again.', reason: 'offline' });
  });

  it('drops a pending add when the store loads another section, and its late answer paints nothing', async () => {
    const created = deferred<TaskAddResult>();
    const { store } = setup({ create: vi.fn<WorkManagerGateway['tasks']['create']>(() => created.promise) });
    await store.load(section());
    const adding = store.create('Order tiles');

    await store.load(section('project-b'));
    expect(store.pendingCreate()).toBeNull();
    created.resolve(resultOf(task({ id: 'task-tiles', title: 'Order tiles' })));
    expect(await adding).toBe('stale');
    expect(store.tasks().some(({ id }) => id === 'task-tiles')).toBe(false);
  });

  it('defers a live re-read behind a pending add and lands one row, not two', async () => {
    const created = deferred<TaskAddResult>();
    const added = task({ id: 'task-tiles', title: 'Order tiles' });
    const { store, gateway } = setup({ create: vi.fn<WorkManagerGateway['tasks']['create']>(() => created.promise) });
    await store.load(section());
    const adding = store.create('Order tiles');
    const list = vi.fn(async () => [task(), added]);
    gateway.tasks.list = list;

    await store.refresh();
    expect(list).not.toHaveBeenCalled();
    expect(store.pendingCreate()?.title).toBe('Order tiles');
    created.resolve(resultOf(added));
    await adding;
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve));
    expect(store.tasks().filter(({ id }) => id === 'task-tiles')).toHaveLength(1);
  });

  it('clears the add message on the next successful add', async () => {
    const create = vi.fn<WorkManagerGateway['tasks']['create']>()
      .mockImplementationOnce(async () => { throw new GatewayError('unreachable', 0, 'offline'); })
      .mockImplementationOnce(async (input) => resultOf(task({ id: 'task-later', ...input })));
    const { store } = setup({ create });
    await store.load(section());
    await store.create('First');
    expect(store.createError()).not.toBeNull();
    expect(await store.create('Second')).toBe('added');
    expect(store.createError()).toBeNull();
  });
});

describe('TaskListStore failures stay on their row (Slice 75, L4-005)', () => {
  it('keeps one message per failed row, and clears it on a new attempt or success', async () => {
    const a = task(), b = task({ id: 'task-b', title: 'Verify analytics events' });
    const complete = vi.fn<WorkManagerGateway['tasks']['complete']>(async () => {
      throw new GatewayError('unreachable', 0, 'offline');
    });
    const { store } = setup({ tasks: [a, b], complete });
    await store.load(section());

    await store.complete(a.id);
    await store.complete(b.id);
    expect(store.rowErrors().get(a.id)).toEqual({ sentence: 'Couldn’t complete “Write the first draft”. Try again.', reason: 'offline' });
    expect(store.rowErrors().get(b.id)).toEqual({ sentence: 'Couldn’t complete “Verify analytics events”. Try again.', reason: 'offline' });
    expect(store.error()).toBeNull();

    complete.mockImplementationOnce(async (id) => resultOf(task({ id, status: 'done', completedAt: AT })));
    const attempt = store.complete(a.id);
    expect(store.rowErrors().has(a.id)).toBe(false);
    await attempt;
    expect(store.rowErrors().has(a.id)).toBe(false);
    expect(store.rowErrors().has(b.id)).toBe(true);
  });

  it('names a failed reopen and a failed Delete on their rows', async () => {
    const done = task({ status: 'done', completedAt: AT });
    const { store } = setup({
      tasks: [done],
      update: vi.fn(async () => { throw new GatewayError('conflict', 409, 'Reopen refused'); }),
      archive: vi.fn(async () => { throw new GatewayError('unreachable', 0, 'offline'); }),
    });
    await store.load(section());
    await store.reopen(done.id);
    expect(store.rowErrors().get(done.id)).toEqual({ sentence: 'Couldn’t reopen “Write the first draft”. Try again.', reason: 'Reopen refused' });
    await store.archive(done.id);
    expect(store.rowErrors().get(done.id)).toEqual({ sentence: 'Couldn’t delete “Write the first draft”. Try again.', reason: 'offline' });
  });

  it('keeps a blank drawer title on its field, not the section', async () => {
    const { store, gateway } = setup();
    await store.load(section());
    expect(await store.updateTitle(task().id, '   ')).toBe(false);
    expect(gateway.tasks.update).not.toHaveBeenCalled();
    expect(store.error()).toBeNull();
    expect(store.fieldSave(task().id, 'title')).toEqual({ state: 'failed', failure: { sentence: 'Enter a task title.', reason: null } });
  });
});

describe('TaskListStore optimistic field edits (Slice 75, §63, L3-008)', () => {
  it('paints the edit at call time and moves from saving to saved', async () => {
    const answer = deferred<TaskWriteResult>();
    const { store } = setup({ update: vi.fn(() => answer.promise) });
    await store.load(section());

    const editing = store.updatePriority(task().id, 'high');
    expect(store.tasks()[0]?.priority).toBe('high');
    expect(store.fieldSave(task().id, 'priority')).toEqual({ state: 'saving' });

    answer.resolve(resultOf(task({ priority: 'high' })));
    expect(await editing).toBe(true);
    expect(store.fieldSave(task().id, 'priority')).toEqual({ state: 'saved' });
  });

  it('restores the last confirmed value when an edit fails', async () => {
    const { store } = setup({ update: vi.fn(async () => { throw new GatewayError('unreachable', 0, 'offline'); }) });
    await store.load(section());

    const editing = store.updateDueDate(task().id, '2026-09-03');
    expect(store.tasks()[0]?.dueAt).toBe('2026-09-03T23:59:59.999Z');
    expect(await editing).toBe(false);
    expect(store.tasks()[0]?.dueAt).toBeUndefined();
    expect(store.fieldSave(task().id, 'dueAt')).toEqual({ state: 'failed', failure: { sentence: 'Not saved. Try again.', reason: 'offline' } });
    expect(store.error()).toBeNull();
  });

  it('restores the server value, not the first edit, when two same-field edits both fail', async () => {
    const first = deferred<TaskWriteResult>(), second = deferred<TaskWriteResult>();
    const update = vi.fn<WorkManagerGateway['tasks']['update']>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { store } = setup({ update });
    await store.load(section());

    const older = store.updatePriority(task().id, 'high');
    const newer = store.updatePriority(task().id, 'low');
    expect(store.tasks()[0]?.priority).toBe('low');
    first.reject(new GatewayError('unreachable', 0, 'offline'));
    await older;
    expect(store.tasks()[0]?.priority).toBe('low');
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    second.reject(new GatewayError('unreachable', 0, 'offline'));
    await newer;
    expect(store.tasks()[0]?.priority).toBe('medium');
  });

  it('defers a live re-read behind a queued edit, so the old value never repaints', async () => {
    const answer = deferred<TaskWriteResult>();
    const { store, gateway } = setup({ update: vi.fn(() => answer.promise) });
    await store.load(section());
    const editing = store.updatePriority(task().id, 'high');
    gateway.tasks.list = vi.fn(async () => [task({ priority: 'medium' })]);

    await store.refresh();
    expect(store.tasks()[0]?.priority).toBe('high');
    answer.resolve(resultOf(task({ priority: 'high' })));
    await editing;
  });
});

describe('TaskListStore after review (Slice 75)', () => {
  it('orders field saves by recency, so the drawer announces the latest field', async () => {
    const { store } = setup({ update: vi.fn(async (_id, input) => resultOf(task(input as Partial<Task>))) });
    await store.load(section());
    store.selectTask(task().id);

    await store.updatePriority(task().id, 'high');
    await store.updateDueDate(task().id, '2026-09-03');
    await store.updatePriority(task().id, 'low');

    expect(Object.keys(store.selectedFieldSaves()).at(-1)).toBe('priority');
  });

  it('a failed add’s owed read never repaints rows with edits in flight', async () => {
    const answer = deferred<TaskWriteResult>();
    const { store } = setup({
      update: vi.fn(() => answer.promise),
      create: vi.fn(async () => { throw new GatewayError('unreachable', 0, 'offline'); }),
    });
    await store.load(section());

    const editing = store.updatePriority(task().id, 'high');
    expect(await store.create('Order tiles')).toBe('failed');
    expect(store.tasks()[0]?.priority).toBe('high');

    answer.resolve(resultOf(task({ priority: 'high' })));
    await editing;
  });

  it('forgets a row error once its task has left the list', async () => {
    const tasks = [task(), task({ id: 'task-b', title: 'B' })];
    const { store, gateway } = setup({ tasks, complete: vi.fn(async () => { throw new GatewayError('unreachable', 0, 'offline'); }) });
    await store.load(section());
    await store.complete('task-b' as TaskId);
    expect(store.rowErrors().has('task-b' as TaskId)).toBe(true);

    vi.mocked(gateway.tasks.list).mockResolvedValue([task()]);
    await store.refresh();
    expect(store.rowErrors().has('task-b' as TaskId)).toBe(false);
  });

  it('drops a settled Saved when another task is selected, keeping a failure', async () => {
    const tasks = [task(), task({ id: 'task-b', title: 'B' })];
    const update = vi.fn<WorkManagerGateway['tasks']['update']>()
      .mockImplementationOnce(async () => resultOf(task({ priority: 'high' })))
      .mockImplementationOnce(async () => { throw new GatewayError('unreachable', 0, 'offline'); });
    const { store } = setup({ tasks, update });
    await store.load(section());
    await store.updatePriority(task().id, 'high');
    await store.updateDueDate(task().id, '2026-09-03');

    store.selectTask('task-b' as TaskId);
    store.selectTask(task().id);
    expect(store.fieldSave(task().id, 'priority')).toBeNull();
    expect(store.fieldSave(task().id, 'dueAt')?.state).toBe('failed');
  });
});
