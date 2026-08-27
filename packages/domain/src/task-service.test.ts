import { TaskSchema, type TaskId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { buildHarness, MINE, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError } from './errors';

const NOW = '2026-08-24T16:00:00.000Z';
const LATER = new Date('2026-08-25T09:00:00.000Z');

const create = async (harness: ReturnType<typeof buildHarness>, overrides = {}) =>
  harness.taskService.create(harness.actor, { projectId: MINE, title: 'Configure deployment', ...overrides });

describe('TaskService.create', () => {
  it('stamps clock timestamps and a generated id, and parses as a contract Task', async () => {
    const harness = buildHarness();

    const task = await create(harness);

    expect(() => TaskSchema.parse(task)).not.toThrow();
    expect(task).toMatchObject({ id: 'task-1', createdAt: NOW, updatedAt: NOW, projectId: MINE });
  });

  it('defaults status to todo and priority to medium', async () => {
    const harness = buildHarness();

    expect(await create(harness)).toMatchObject({ status: 'todo', priority: 'medium' });
  });

  it('stamps completedAt when a task is created already done', async () => {
    const harness = buildHarness();

    expect((await create(harness, { status: 'done' })).completedAt).toBe(NOW);
  });

  it('rejects a project that does not exist', async () => {
    const harness = buildHarness();

    await expect(create(harness, { projectId: 'project-nope' })).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('treats another workspace’s project as missing rather than forbidden', async () => {
    const harness = buildHarness();

    await expect(create(harness, { projectId: THEIRS })).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(harness.store.snapshot().tasks).toEqual([]);
  });

  it('rejects a parent task from another project', async () => {
    const harness = buildHarness();
    const sibling = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId,
      name: 'Sibling',
    });
    const parent = await create(harness);

    await expect(
      harness.taskService.create(harness.actor, { projectId: sibling.id, title: 'Child', parentTaskId: parent.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('persists exactly once per create, and not at all when a rule rejects', async () => {
    const harness = buildHarness();

    await create(harness);
    expect(harness.store.persistCalls).toBe(1);

    await expect(create(harness, { projectId: THEIRS })).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(harness.store.persistCalls).toBe(1);
  });
});

describe('TaskService.get and list', () => {
  it('treats another workspace’s task as missing on get and update', async () => {
    const harness = buildHarness();
    const task = await create(harness);

    await expect(harness.taskService.get(harness.other, task.id)).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(harness.taskService.update(harness.other, task.id, { title: 'Theirs now' })).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    expect((await harness.taskService.get(harness.actor, task.id)).title).toBe('Configure deployment');
  });

  it('never returns another workspace’s tasks', async () => {
    const harness = buildHarness();
    const mine = await create(harness);
    const theirs = await harness.taskService.create(harness.other, { projectId: THEIRS, title: 'Their task' });

    const listed = await harness.taskService.list(harness.actor);

    expect(listed.map((task) => task.id)).toEqual([mine.id]);
    expect(listed.map((task) => task.id)).not.toContain(theirs.id);
  });

  it('raises rather than answering [] for a projectId filter it cannot see', async () => {
    const harness = buildHarness();

    await expect(harness.taskService.list(harness.actor, { projectId: THEIRS })).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    await expect(
      harness.taskService.list(harness.actor, { projectId: 'project-nope' as never }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('answers [] for an unfiltered list in an empty workspace', async () => {
    const harness = buildHarness();

    expect(await harness.taskService.list(harness.actor)).toEqual([]);
  });

  it('delegates the contract query filters to the repository', async () => {
    const harness = buildHarness();
    await create(harness, { title: 'Prepare release', priority: 'high', dueAt: '2026-08-27T12:00:00.000Z' });
    await create(harness, { title: 'Something else' });

    expect(await harness.taskService.list(harness.actor, { priority: ['high'] })).toHaveLength(1);
    expect(await harness.taskService.list(harness.actor, { search: 'release' })).toHaveLength(1);
    expect(await harness.taskService.list(harness.actor, { status: ['todo'] })).toHaveLength(2);
  });
});

describe('TaskService.complete', () => {
  it('sets status done and completedAt from the clock', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    harness.clock.setNow(LATER);

    const completed = await harness.taskService.complete(harness.actor, task.id);

    expect(completed).toMatchObject({ status: 'done', completedAt: LATER.toISOString() });
  });

  it('is idempotent — completing a done task records no second event', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    const first = await harness.taskService.complete(harness.actor, task.id);
    harness.clock.setNow(LATER);

    const second = await harness.taskService.complete(harness.actor, task.id);

    const events = await harness.activity.list(harness.actor);
    expect(events.filter((event) => event.action === 'task.completed')).toHaveLength(1);
    // A later clock would move updatedAt if the second call had written anything.
    expect(second).toEqual(first);
  });

  it('refuses to complete an archived task', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    await harness.taskService.archive(harness.actor, task.id);

    await expect(harness.taskService.complete(harness.actor, task.id)).rejects.toBeInstanceOf(DomainRuleError);
  });
});

describe('TaskService.update', () => {
  it('clears completedAt when a done task moves back to todo', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    await harness.taskService.complete(harness.actor, task.id);

    const reopened = await harness.taskService.update(harness.actor, task.id, { status: 'todo' });

    expect(reopened.completedAt).toBeUndefined();
    expect(reopened.status).toBe('todo');
  });

  it('sets completedAt and emits task.completed, not task.updated, on a transition into done', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    harness.clock.setNow(LATER);

    const done = await harness.taskService.update(harness.actor, task.id, { status: 'done' });

    expect(done.completedAt).toBe(LATER.toISOString());
    expect((await harness.activity.list(harness.actor))[0]).toMatchObject({ action: 'task.completed' });
  });

  it('records nothing for a no-op status write', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    const done = await harness.taskService.complete(harness.actor, task.id);
    const before = await harness.activity.list(harness.actor);
    harness.clock.setNow(LATER);

    const again = await harness.taskService.update(harness.actor, task.id, { status: 'done' });

    expect(again).toEqual(done);
    expect(await harness.activity.list(harness.actor)).toHaveLength(before.length);
  });

  it('clears dueAt on null and leaves it alone when omitted', async () => {
    const harness = buildHarness();
    const task = await create(harness, { dueAt: '2026-08-27T12:00:00.000Z' });

    const untouched = await harness.taskService.update(harness.actor, task.id, { title: 'Renamed' });
    expect(untouched.dueAt).toBe('2026-08-27T12:00:00.000Z');

    const cleared = await harness.taskService.update(harness.actor, task.id, { dueAt: null });
    expect(cleared.dueAt).toBeUndefined();
  });

  it('refuses to move a task to another project in the same workspace', async () => {
    const harness = buildHarness();
    const destination = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId,
      name: 'Destination',
    });
    const task = await create(harness);

    // The destination resolves, so only the move rule itself can make this fail.
    await expect(
      harness.taskService.update(harness.actor, task.id, { projectId: destination.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    expect((await harness.taskService.get(harness.actor, task.id)).projectId).toBe(MINE);
  });

  it('raises EntityNotFoundError for an unknown id', async () => {
    const harness = buildHarness();

    await expect(
      harness.taskService.update(harness.actor, 'task-nope' as TaskId, { title: 'x' }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe('TaskService.archive', () => {
  it('sets archivedAt, records task.archived, and leaves status alone', async () => {
    const harness = buildHarness();
    const task = await create(harness, { status: 'in_progress' });
    harness.clock.setNow(LATER);

    const archived = await harness.taskService.archive(harness.actor, task.id);

    expect(archived).toMatchObject({ archivedAt: LATER.toISOString(), status: 'in_progress' });
    expect((await harness.activity.list(harness.actor))[0]).toMatchObject({ action: 'task.archived' });
  });

  it('hides archived tasks from list unless includeArchived asks for them', async () => {
    const harness = buildHarness();
    const live = await create(harness, { title: 'Live' });
    const filed = await create(harness, { title: 'Filed' });
    await harness.taskService.archive(harness.actor, filed.id);

    expect((await harness.taskService.list(harness.actor)).map((task) => task.id)).toEqual([live.id]);
    expect(await harness.taskService.list(harness.actor, { includeArchived: true })).toHaveLength(2);
  });

  it('is idempotent', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    const archived = await harness.taskService.archive(harness.actor, task.id);
    harness.clock.setNow(LATER);

    expect(await harness.taskService.archive(harness.actor, task.id)).toEqual(archived);
    expect((await harness.activity.list(harness.actor)).filter((e) => e.action === 'task.archived')).toHaveLength(1);
  });
});
