import { TaskSchema, type TaskId } from '@cwm/contracts';
import { InMemoryDataStore } from '@cwm/repositories';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';

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

  it('persists an optional positive estimate on create', async () => {
    const harness = buildHarness();

    expect((await create(harness, { estimate: 5 })).estimate).toBe(5);
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

  it('updates and clears an estimate', async () => {
    const harness = buildHarness();
    const task = await create(harness, { estimate: 3 });

    expect((await harness.taskService.update(harness.actor, task.id, { estimate: 8 })).estimate).toBe(8);
    expect((await harness.taskService.update(harness.actor, task.id, { estimate: null })).estimate).toBeUndefined();
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

describe('TaskService parent and archive guards', () => {
  it('refuses to make a task its own ancestor', async () => {
    const harness = buildHarness();
    const a = await create(harness, { title: 'A' });
    const b = await create(harness, { title: 'B' });
    const c = await create(harness, { title: 'C' });
    await harness.taskService.update(harness.actor, b.id, { parentTaskId: a.id });
    await harness.taskService.update(harness.actor, c.id, { parentTaskId: b.id });

    // A cycle survives validateDocumentIntegrity, so nothing downstream catches it.
    await expect(
      harness.taskService.update(harness.actor, a.id, { parentTaskId: c.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    await expect(
      harness.taskService.update(harness.actor, a.id, { parentTaskId: b.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    expect((await harness.taskService.get(harness.actor, a.id)).parentTaskId).toBeUndefined();
  });

  it('refuses to complete an archived task through update, not only through complete', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    await harness.taskService.archive(harness.actor, task.id);

    // PATCH is the exposed route, so a rule only complete() enforced would be decorative.
    await expect(
      harness.taskService.update(harness.actor, task.id, { status: 'done' }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    expect((await harness.taskService.get(harness.actor, task.id)).completedAt).toBeUndefined();
  });

  it('still allows an ordinary edit of an archived task', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    await harness.taskService.archive(harness.actor, task.id);

    expect((await harness.taskService.update(harness.actor, task.id, { title: 'Renamed' })).title).toBe('Renamed');
  });
});

describe('TaskService permissions (§51, §53)', () => {
  it('refuses a create from an agent that was never granted tasks.write', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['tasks.read']);

    await expect(harness.taskService.create(agent, { projectId: MINE, title: 'Configure deployment' })).rejects.toThrow(
      'connection "agent-claude" is missing permission "tasks.write"',
    );
  });

  it('refuses a complete from the same agent', async () => {
    const harness = buildHarness();
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Configure deployment' });

    await expect(harness.taskService.complete(agentActorFor(0, ['tasks.read']), task.id)).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it('leaves nothing behind when a write is denied — no task, no event, no persist', async () => {
    const harness = buildHarness();
    const persistsBefore = harness.store.persistCalls;

    await expect(
      harness.taskService.create(agentActorFor(0, []), { projectId: MINE, title: 'Never created' }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(await harness.tasks.list()).toEqual([]);
    expect(await harness.activities.list()).toEqual([]);
    expect(harness.store.persistCalls).toBe(persistsBefore);
  });

  it('refuses a read from an agent granted only writes', async () => {
    const harness = buildHarness();

    await expect(harness.taskService.list(agentActorFor(0, ['tasks.write']))).rejects.toThrow(PermissionDeniedError);
  });

  /**
   * The reason `require` exists. A write path looks its own target up; if that lookup were
   * the permission-checked `get`, `tasks.write` alone would be unusable — every create,
   * complete and archive would demand `tasks.read` it was never given.
   */
  it('lets an agent with tasks.write but no tasks.read still create, complete and archive', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['tasks.write']);

    const created = await harness.taskService.create(agent, { projectId: MINE, title: 'Configure deployment' });
    const completed = await harness.taskService.complete(agent, created.id);
    const archived = await harness.taskService.archive(agent, created.id);

    expect(completed.status).toBe('done');
    expect(archived.archivedAt).toBeDefined();
  });

  it('creates a subtask without needing tasks.read for the parent lookup', async () => {
    const harness = buildHarness();
    const parent = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Parent' });

    const child = await harness.taskService.create(agentActorFor(0, ['tasks.write']), {
      projectId: MINE,
      title: 'Child',
      parentTaskId: parent.id,
    });

    expect(child.parentTaskId).toBe(parent.id);
  });

  it('attributes an agent’s write to the connection that made it (§57)', async () => {
    const harness = buildHarness();

    await harness.taskService.create(agentActorFor(0, ['tasks.write']), { projectId: MINE, title: 'By Claude' });

    const [event] = await harness.activity.list(harness.actor);
    expect(event).toMatchObject({ actor: 'agent', actorAgentConnectionId: 'agent-claude', actorName: 'Claude' });
  });
});

describe('TaskService archive cascades, and restore undoes exactly that', () => {
  /** A parent with two subtasks, all live and all in one list. */
  const family = async (harness: ReturnType<typeof buildHarness>) => {
    const parent = await create(harness, { title: 'Parent' });
    const first = await create(harness, { title: 'First', parentTaskId: parent.id });
    const second = await create(harness, { title: 'Second', parentTaskId: parent.id });
    return { parent, first, second };
  };

  it('archives live descendants and stamps each with the archived task', async () => {
    const harness = buildHarness();
    const { parent, first, second } = await family(harness);

    const archived = await harness.taskService.archive(harness.actor, parent.id);

    // The root carries no marker: it is what the markers point at.
    expect(archived.archivedWithTaskId).toBeUndefined();
    for (const id of [first.id, second.id]) {
      const child = await harness.taskService.get(harness.actor, id);
      expect(child.archivedAt).toBe(NOW);
      expect(child.archivedWithTaskId).toBe(parent.id);
    }
    expect(await harness.taskService.list(harness.actor)).toEqual([]);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('leaves an already-archived descendant alone, and restore does not revive it', async () => {
    // The case the cascade cannot mark, and the one a naive restore strands: archiving
    // something and restoring it changes no other state.
    const harness = buildHarness();
    const { parent, first, second } = await family(harness);
    await harness.taskService.archive(harness.actor, first.id);

    await harness.taskService.archive(harness.actor, parent.id);
    expect((await harness.taskService.get(harness.actor, first.id)).archivedWithTaskId).toBeUndefined();

    await harness.taskService.restore(harness.actor, parent.id);

    expect((await harness.taskService.list(harness.actor)).map((task) => task.id)).toEqual([parent.id, second.id]);
    // It restores on its own afterwards, now that its parent is live again.
    await harness.taskService.restore(harness.actor, first.id);
    expect((await harness.taskService.get(harness.actor, first.id)).archivedAt).toBeUndefined();
  });

  it('restores every task carrying its marker in one lookup, clearing both fields', async () => {
    const harness = buildHarness();
    const { parent, first } = await family(harness);
    await harness.taskService.archive(harness.actor, parent.id);
    harness.clock.setNow(LATER);

    const restored = await harness.taskService.restore(harness.actor, parent.id);

    expect(restored.archivedAt).toBeUndefined();
    // `updatedAt` moves, which is what the §62 refresh depends on.
    expect(restored.updatedAt).toBe(LATER.toISOString());
    const child = await harness.taskService.get(harness.actor, first.id);
    expect(child.archivedAt).toBeUndefined();
    expect(child.archivedWithTaskId).toBeUndefined();
    expect((await harness.activity.list(harness.actor))[0]).toMatchObject({ action: 'task.restored' });
  });

  it('leaves status and completedAt alone, and is idempotent on a live task', async () => {
    const harness = buildHarness();
    const task = await create(harness, { status: 'in_progress' });
    await harness.taskService.archive(harness.actor, task.id);

    const restored = await harness.taskService.restore(harness.actor, task.id);
    expect(restored).toMatchObject({ status: 'in_progress' });
    expect(restored.completedAt).toBeUndefined();

    const events = (await harness.activity.list(harness.actor)).filter((e) => e.action === 'task.restored').length;
    expect(await harness.taskService.restore(harness.actor, task.id)).toEqual(restored);
    expect((await harness.activity.list(harness.actor)).filter((e) => e.action === 'task.restored')).toHaveLength(
      events,
    );
  });

  it('refuses to restore a row whose section is archived, naming the section', async () => {
    const harness = buildHarness();
    const marked = await create(harness);
    const beforehand = await create(harness, { title: 'Filed first' });
    await harness.taskService.archive(harness.actor, beforehand.id);
    await harness.sectionService.remove(harness.actor, marked.sectionId, { policy: 'cascade' });

    // Both cases: the row the cascade marked, and the one archived individually beforehand.
    for (const id of [marked.id, beforehand.id]) {
      const refusal = await harness.taskService.restore(harness.actor, id).then(() => null, (error: unknown) => error);
      expect(refusal).toBeInstanceOf(DomainRuleError);
      expect((refusal as DomainRuleError).message).toContain(marked.sectionId);
    }
  });

  it('refuses to restore a subtask whose parent is archived, naming the parent', async () => {
    // Rule 1 fires before rule 2, so this needs a live section and an archived parent —
    // reachable because the cascade skips a child that was already archived.
    const harness = buildHarness();
    const { parent, first } = await family(harness);
    await harness.taskService.archive(harness.actor, first.id);
    await harness.taskService.archive(harness.actor, parent.id);

    const refusal = await harness.taskService
      .restore(harness.actor, first.id)
      .then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(DomainRuleError);
    expect((refusal as DomainRuleError).message).toContain(parent.id);
  });

  it('refuses restore without tasks.write, and answers not-found across workspaces', async () => {
    const harness = buildHarness();
    const task = await create(harness);
    await harness.taskService.archive(harness.actor, task.id);

    await expect(harness.taskService.restore(agentActorFor(0, ['tasks.read']), task.id)).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
    await expect(harness.taskService.restore(harness.other, task.id)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe('TaskService archived-parent and archived-project policy', () => {
  it('refuses to create or re-parent beneath an archived task, before any write', async () => {
    const harness = buildHarness();
    const parent = await create(harness, { title: 'Parent' });
    const other = await create(harness, { title: 'Other' });
    await harness.taskService.archive(harness.actor, parent.id);

    // A rule error, not the integrity 500 the live-ancestor invariant would otherwise cause.
    await expect(
      harness.taskService.create(harness.actor, { projectId: MINE, title: 'Nope', parentTaskId: parent.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    await expect(
      harness.taskService.update(harness.actor, other.id, { parentTaskId: parent.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    expect((await harness.taskService.get(harness.actor, other.id)).parentTaskId).toBeUndefined();
  });

  it('refuses to move a row out of an archived section, rather than failing at commit', async () => {
    // The container is what renders the row, so an archived section is not a place to edit
    // from — and a move out of one would carry `archivedWithSectionId` to a section it no
    // longer names, which document integrity rejects at commit. That would surface as a
    // rolled-back unit of work rather than a refusal the caller can read.
    const harness = buildHarness();
    const marked = await create(harness);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    await harness.sectionService.remove(harness.actor, marked.sectionId, { policy: 'cascade' });

    const refusal = await harness.taskService
      .update(harness.actor, marked.id, { sectionId: target.id })
      .then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(DomainRuleError);
    expect((refusal as DomainRuleError).message).toContain(marked.sectionId);

    // The same door one level down: re-parenting inherits the new parent's section without
    // going through `requireContainer`, so it needs the refusal too.
    const elsewhere = await harness.taskService.create(harness.actor, {
      projectId: MINE,
      sectionId: target.id,
      title: 'Somewhere live',
    });
    await expect(
      harness.taskService.update(harness.actor, marked.id, { parentTaskId: elsewhere.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    // And an ordinary edit is refused too — there is none to make on a row that is off the
    // canvas which restoring the section first would not allow.
    await expect(harness.taskService.update(harness.actor, marked.id, { title: 'Renamed' })).rejects.toBeInstanceOf(
      DomainRuleError,
    );
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('refuses to move an unmarked archived row out of an archived section', async () => {
    // The row archived on its own *before* the cascade carries no marker, so the marker
    // clause would not catch this one — the rule is about the section, not the marker.
    const harness = buildHarness();
    const beforehand = await create(harness);
    await harness.taskService.archive(harness.actor, beforehand.id);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    await harness.sectionService.remove(harness.actor, beforehand.sectionId);

    await expect(
      harness.taskService.update(harness.actor, beforehand.id, { sectionId: target.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('freezes an archived project against create, update, complete and restore', async () => {
    const harness = buildHarness();
    const live = await create(harness, { title: 'Live' });
    const filed = await create(harness, { title: 'Filed' });
    await harness.taskService.archive(harness.actor, filed.id);
    await harness.projectService.archive(harness.actor, MINE);

    await expect(harness.taskService.create(harness.actor, { projectId: MINE, title: 'Nope' })).rejects.toBeInstanceOf(
      DomainRuleError,
    );
    await expect(harness.taskService.update(harness.actor, live.id, { title: 'Nope' })).rejects.toBeInstanceOf(
      DomainRuleError,
    );
    await expect(harness.taskService.complete(harness.actor, live.id)).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.taskService.restore(harness.actor, filed.id)).rejects.toBeInstanceOf(DomainRuleError);
    // Tidying stays allowed, and a live restore stays a no-op rather than a refusal.
    await expect(harness.taskService.archive(harness.actor, live.id)).resolves.toMatchObject({ id: live.id });
    await expect(harness.taskService.restore(harness.actor, filed.id)).rejects.toBeInstanceOf(DomainRuleError);
  });
});

describe('TaskService archive-group markers survive a move, and split on a real detach', () => {
  /** `A → B → C`, all archived as one group rooted at A. */
  const group = async (harness: ReturnType<typeof buildHarness>) => {
    const a = await create(harness, { title: 'A' });
    const b = await create(harness, { title: 'B', parentTaskId: a.id });
    const c = await create(harness, { title: 'C', parentTaskId: b.id });
    await harness.taskService.archive(harness.actor, a.id);
    return { a, b, c };
  };

  it('re-roots a detached subtree, so restoring the old root cannot revive it', async () => {
    const harness = buildHarness();
    const { a, b, c } = await group(harness);

    // Same section, so `moveSubtree` never fires: this is the detach an implementation
    // gated on a section change would miss.
    await harness.taskService.update(harness.actor, b.id, { parentTaskId: null });

    expect((await harness.taskService.get(harness.actor, b.id)).archivedWithTaskId).toBeUndefined();
    expect((await harness.taskService.get(harness.actor, c.id)).archivedWithTaskId).toBe(b.id);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();

    await harness.taskService.restore(harness.actor, a.id);
    expect((await harness.taskService.get(harness.actor, b.id)).archivedAt).toBe(NOW);
    // The detached subtree is still one reversible archive, rooted at B.
    await harness.taskService.restore(harness.actor, b.id);
    expect((await harness.taskService.get(harness.actor, c.id)).archivedAt).toBeUndefined();
  });

  it('preserves markers on a move within the same archive group', async () => {
    const harness = buildHarness();
    const { a, b, c } = await group(harness);

    // C moves from B to A — still inside A's group, so nothing re-roots.
    await harness.taskService.update(harness.actor, c.id, { parentTaskId: a.id });

    expect((await harness.taskService.get(harness.actor, c.id)).archivedWithTaskId).toBe(a.id);
    expect((await harness.taskService.get(harness.actor, b.id)).archivedWithTaskId).toBe(a.id);
    await harness.taskService.restore(harness.actor, a.id);
    expect((await harness.taskService.list(harness.actor, { includeArchived: true })).every((t) => t.archivedAt === undefined)).toBe(true);
  });

  it('repoints an unmarked archived root between live sections, keeping its group', async () => {
    const harness = buildHarness();
    const { a, b, c } = await group(harness);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    await harness.taskService.update(harness.actor, a.id, { sectionId: target.id });

    for (const id of [a.id, b.id, c.id]) {
      expect((await harness.taskService.get(harness.actor, id)).sectionId).toBe(target.id);
    }
    expect((await harness.taskService.get(harness.actor, b.id)).archivedWithTaskId).toBe(a.id);
    expect((await harness.taskService.get(harness.actor, c.id)).archivedWithTaskId).toBe(a.id);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });
});
