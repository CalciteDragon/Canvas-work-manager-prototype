import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  TaskSchema,
  type LiveEvent,
  type ProjectId,
  type ProjectPageId,
  type ProjectTodoItem,
  type SectionId,
  type Task,
  type TaskId,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { TodosPageStore } from './todos-page-store';

const AT = '2026-08-27T16:00:00.000Z';
const ROOT = 'project-root' as ProjectId;
const OTHER_ROOT = 'project-other' as ProjectId;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const task = (id: string, overrides: Record<string, unknown> = {}): Task =>
  TaskSchema.parse({
    id,
    projectId: ROOT,
    sectionId: 'section-a',
    title: `Task ${id}`,
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const taskItem = (id: string, overrides: Record<string, unknown> = {}): ProjectTodoItem => ({
  kind: 'task',
  task: task(id, overrides),
  origin: {
    projectId: ROOT,
    pageId: 'page-project-root' as ProjectPageId,
    pageKind: 'home',
    breadcrumb: [{ projectId: ROOT, name: 'Renovation' }],
    sectionId: 'section-a' as SectionId,
    sectionName: 'This week',
  },
});

const subprojectItem = (id: string, overrides: Record<string, unknown> = {}): ProjectTodoItem => ({
  kind: 'subproject',
  project: ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    kind: 'subproject',
    parentProjectId: ROOT,
    name: `Unit ${id}`,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }) as Extract<ProjectTodoItem, { kind: 'subproject' }>['project'],
  origin: {
    projectId: id as ProjectId,
    pageId: `page-${id}` as ProjectPageId,
    pageKind: 'work',
    breadcrumb: [
      { projectId: ROOT, name: 'Renovation' },
      { projectId: id as ProjectId, name: `Unit ${id}` },
    ],
  },
});

interface SetupOptions {
  items?: ProjectTodoItem[];
  todosGet?: (projectId: ProjectId) => Promise<{ projectId: ProjectId; items: ProjectTodoItem[] }>;
  completeTask?: (id: TaskId) => Promise<Task>;
  updateProject?: (id: ProjectId, input: Record<string, unknown>) => Promise<unknown>;
}

const setup = (options: SetupOptions = {}) => {
  const items = options.items ?? [taskItem('task-1'), subprojectItem('project-kitchen')];
  const todosGet = vi.fn(options.todosGet ?? (async (projectId: ProjectId) => ({ projectId, items })));
  const completeTask = vi.fn(
    options.completeTask ??
      (async (id: TaskId) => task(id, { status: 'done', completedAt: '2026-08-28T09:00:00.000Z' })),
  );
  const updateProject = vi.fn(
    options.updateProject ??
      (async (id: ProjectId, input: Record<string, unknown>) => ({
        ...(subprojectItem(id) as Extract<ProjectTodoItem, { kind: 'subproject' }>).project,
        ...input,
        completedAt: '2026-08-28T09:00:00.000Z',
      })),
  );
  const gateway = {
    todos: { get: todosGet },
    tasks: { complete: completeTask },
    projects: { update: updateProject },
  } as unknown as WorkManagerGateway;
  const live = new FakeLiveUpdates();

  TestBed.configureTestingModule({
    providers: [
      TodosPageStore,
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: LIVE_UPDATES, useValue: live },
    ],
  });

  return { store: TestBed.inject(TodosPageStore), live, todosGet, completeTask, updateProject };
};

/** The store's own microtask chain, drained the way every other live-refresh spec drains it. */
const settleLive = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

const statusOf = (store: TodosPageStore, id: string): string | undefined => {
  const item = store.items().find((candidate) => (candidate.kind === 'task' ? candidate.task.id : candidate.project.id) === id);
  return item === undefined ? undefined : item.kind === 'task' ? item.task.status : item.project.status;
};

describe('TodosPageStore — reading (§34, §62)', () => {
  it('loads a chronology, an empty root, and an unreadable one it can retry', async () => {
    const { store } = setup({ items: [] });

    await store.load(ROOT);

    expect(store.items()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('reports a failed read and recovers on retry', async () => {
    let reads = 0;
    const { store } = setup({
      todosGet: async (projectId) => {
        reads += 1;
        if (reads === 1) throw new GatewayError('unreachable', 0, 'the host is not answering');
        return { projectId, items: [taskItem('task-1')] };
      },
    });

    await store.load(ROOT);
    expect(store.error()).toContain('not answering');
    expect(store.items()).toEqual([]);

    await store.retry();

    expect(store.error()).toBeNull();
    expect(store.items()).toHaveLength(1);
  });

  it('keeps terminal rows exactly as the chronology answers them', async () => {
    const { store } = setup({
      items: [taskItem('task-done', { status: 'done' }), taskItem('task-cancelled', { status: 'cancelled' })],
    });

    await store.load(ROOT);

    expect(store.items().map((item) => (item.kind === 'task' ? item.task.status : null))).toEqual(['done', 'cancelled']);
  });
});

describe('TodosPageStore — completing (§34, §63)', () => {
  it('completes each kind through its own canonical operation', async () => {
    const { store, completeTask, updateProject } = setup();
    await store.load(ROOT);

    expect(await store.complete(store.items()[0]!)).toBe(true);
    expect(await store.complete(store.items()[1]!)).toBe(true);

    expect(completeTask).toHaveBeenCalledWith('task-1');
    expect(updateProject).toHaveBeenCalledWith('project-kitchen', { status: 'completed' });
    expect(statusOf(store, 'task-1')).toBe('done');
    expect(statusOf(store, 'project-kitchen')).toBe('completed');
  });

  it('takes the canonical record back, including its completion timestamp', async () => {
    const { store } = setup();
    await store.load(ROOT);

    await store.complete(store.items()[0]!);

    const row = store.items().find((item) => item.kind === 'task' && item.task.id === 'task-1');
    expect(row?.kind === 'task' && row.task.completedAt).toBe('2026-08-28T09:00:00.000Z');
  });

  it('paints the pending status immediately and rolls back exactly on rejection', async () => {
    const gate = deferred<Task>();
    const { store } = setup({ items: [taskItem('task-1', { status: 'in_progress' })], completeTask: () => gate.promise });
    await store.load(ROOT);

    const write = store.complete(store.items()[0]!);
    expect(statusOf(store, 'task-1')).toBe('done');
    expect(store.completing()).toBe('task-1');

    gate.reject(new GatewayError('conflict', 409, 'the task is archived'));

    expect(await write).toBe(false);
    // The *precise* prior status, not a guess at `todo`.
    expect(statusOf(store, 'task-1')).toBe('in_progress');
    expect(store.writeError()).toContain('archived');
    expect(store.completing()).toBeNull();
  });

  it('gates a second click on the same row and a click on another while one is in flight', async () => {
    const gate = deferred<Task>();
    const { store, completeTask } = setup({ completeTask: () => gate.promise });
    await store.load(ROOT);

    const first = store.complete(store.items()[0]!);
    const again = store.complete(store.items()[0]!);
    const other = store.complete(store.items()[1]!);

    expect(await again).toBe(false);
    expect(await other).toBe(false);
    gate.resolve(task('task-1', { status: 'done' }));
    expect(await first).toBe(true);
    expect(completeTask).toHaveBeenCalledTimes(1);
  });

  it('refuses to complete a row that is already finished', async () => {
    const { store, completeTask } = setup({ items: [taskItem('task-done', { status: 'done' })] });
    await store.load(ROOT);

    expect(await store.complete(store.items()[0]!)).toBe(false);
    expect(completeTask).not.toHaveBeenCalled();
  });
});

describe('TodosPageStore — races and lifetime (§62, §63)', () => {
  it('lets a pending write finish before applying a queued read, so nothing clobbers optimism', async () => {
    const write = deferred<Task>();
    let reads = 0;
    const { store, live } = setup({
      completeTask: () => write.promise,
      // Every read after the first is the host answering *after* the write committed.
      todosGet: async (projectId) => {
        reads += 1;
        return { projectId, items: [reads === 1 ? taskItem('task-1') : taskItem('task-1', { status: 'done', completedAt: AT })] };
      },
    });
    await store.load(ROOT);

    const completion = store.complete(store.items()[0]!);
    // The host flushes its §62 frame at commit, so this is the mutation's own echo arriving
    // before its response — carrying the pre-write row.
    live.emit({ type: 'task.updated', entityId: 'task-1', projectId: ROOT, rootProjectId: ROOT });
    await settleLive();
    expect(statusOf(store, 'task-1')).toBe('done');

    write.resolve(task('task-1', { status: 'done', completedAt: AT }));
    await completion;
    await settleLive();

    expect(statusOf(store, 'task-1')).toBe('done');
  });

  it('does not undo a persisted completion when the following read fails', async () => {
    let reads = 0;
    const { store, live } = setup({
      todosGet: async (projectId) => {
        reads += 1;
        if (reads > 1) throw new GatewayError('unreachable', 0, 'the host is not answering');
        return { projectId, items: [taskItem('task-1')] };
      },
    });
    await store.load(ROOT);

    await store.complete(store.items()[0]!);
    live.emit({ type: 'task.updated', entityId: 'task-1', projectId: ROOT, rootProjectId: ROOT });
    await settleLive();

    expect(statusOf(store, 'task-1')).toBe('done');
    expect(store.error()).toBeNull();
    expect(store.refreshError()).toContain('not answering');
  });

  it('refreshes on a descendant’s event and ignores an unrelated root', async () => {
    const { store, live, todosGet } = setup();
    await store.load(ROOT);
    expect(todosGet).toHaveBeenCalledTimes(1);

    live.emit({ type: 'task.updated', entityId: 'task-9', projectId: 'project-kitchen' as ProjectId, rootProjectId: ROOT });
    await settleLive();
    expect(todosGet).toHaveBeenCalledTimes(2);

    live.emit({ type: 'task.updated', entityId: 'task-9', projectId: OTHER_ROOT, rootProjectId: OTHER_ROOT });
    await settleLive();
    expect(todosGet).toHaveBeenCalledTimes(2);
  });

  it('replays an invalidation that arrived while a read was running', async () => {
    const gate = deferred<{ projectId: ProjectId; items: ProjectTodoItem[] }>();
    let reads = 0;
    const { store, live, todosGet } = setup({
      todosGet: async (projectId) => {
        reads += 1;
        return reads === 1 ? gate.promise : { projectId, items: [taskItem('task-2')] };
      },
    });

    const load = store.load(ROOT);
    live.emit({ type: 'task.updated', entityId: 'task-2', projectId: ROOT, rootProjectId: ROOT });
    gate.resolve({ projectId: ROOT, items: [taskItem('task-1')] });
    await load;
    await settleLive();

    expect(todosGet).toHaveBeenCalledTimes(2);
    expect(store.items().map((item) => (item.kind === 'task' ? item.task.id : ''))).toEqual(['task-2']);
  });

  it('refreshes after a reconnect', async () => {
    const { store, live, todosGet } = setup();
    await store.load(ROOT);

    live.emitConnected();
    await settleLive();

    expect(todosGet).toHaveBeenCalledTimes(2);
  });

  it('clears and reloads on prototype.reloaded even though the root id has not changed', async () => {
    const gate = deferred<{ projectId: ProjectId; items: ProjectTodoItem[] }>();
    let reads = 0;
    const { store, live } = setup({
      todosGet: async (projectId) => {
        reads += 1;
        return reads === 2 ? gate.promise : { projectId, items: [taskItem('task-1')] };
      },
    });
    await store.load(ROOT);

    live.emit({ type: 'prototype.reloaded', entityId: 'prototype' });

    // Content is gone at once: the document behind it may have been replaced entirely.
    expect(store.items()).toEqual([]);
    gate.resolve({ projectId: ROOT, items: [taskItem('task-seeded')] });
    await settleLive();
    expect(store.items().map((item) => (item.kind === 'task' ? item.task.id : ''))).toEqual(['task-seeded']);
  });

  it('lets a late answer for one root fall on the floor when another is showing', async () => {
    const first = deferred<{ projectId: ProjectId; items: ProjectTodoItem[] }>();
    let reads = 0;
    const { store } = setup({
      todosGet: async (projectId) => {
        reads += 1;
        return reads === 1 ? first.promise : { projectId, items: [taskItem('task-b')] };
      },
    });

    const stale = store.load(ROOT);
    await store.load(OTHER_ROOT);
    first.resolve({ projectId: ROOT, items: [taskItem('task-a')] });
    await stale;

    expect(store.items().map((item) => (item.kind === 'task' ? item.task.id : ''))).toEqual(['task-b']);
  });

  it('makes a write started on one root inert once another is showing', async () => {
    const gate = deferred<Task>();
    const { store } = setup({ completeTask: () => gate.promise });
    await store.load(ROOT);
    const row = store.items()[0]!;

    const write = store.complete(row);
    await store.load(OTHER_ROOT);
    gate.resolve(task('task-1', { status: 'done' }));

    // The canonical mutation still finished; this view simply no longer owns the answer.
    expect(await write).toBe(false);
    expect(store.writeError()).toBeNull();
    expect(store.completing()).toBeNull();
  });

  it('unsubscribes from the stream when it is destroyed', async () => {
    const { store, live, todosGet } = setup();
    await store.load(ROOT);
    expect(live.listenerCount).toBe(1);

    TestBed.resetTestingModule();

    expect(live.listenerCount).toBe(0);
    live.emit({ type: 'task.updated', entityId: 'task-1', projectId: ROOT, rootProjectId: ROOT } as LiveEvent);
    await settleLive();
    expect(todosGet).toHaveBeenCalledTimes(1);
  });
});
