import { SEED_NOW } from '@cwm/prototype-data';
import { InMemoryDataStore } from '@cwm/repositories';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError } from './errors';

/**
 * Ownership, end to end through the services that hold it —
 * docs/decisions/2026-09-sections-own-their-data.md. The pieces are split across
 * `SectionService`, `TaskService` and `ReflectionService`, but the *rule* is one rule, so
 * it is asserted in one place.
 */

describe('SectionService.resolveContainer (the default a row falls to)', () => {
  it('creates exactly one task list for a project that has none, through the ordinary add', async () => {
    const harness = buildHarness();

    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ship it' });

    const sections = await harness.sectionService.list(harness.actor, MINE);
    expect(sections.map(({ type, position }) => [type, position])).toEqual([['task-list', 0]]);
    expect(task.sectionId).toBe(sections[0]!.id);
    // The same door the Add Section button uses, so the canvas gets a real activity event.
    expect((await harness.activity.list(harness.actor)).map(({ action }) => action)).toContain(
      'project.section_added',
    );
  });

  it('reuses that container the second time rather than adding another', async () => {
    const harness = buildHarness();

    const first = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'One' });
    const second = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Two' });

    expect(second.sectionId).toBe(first.sectionId);
    expect(await harness.sectionService.list(harness.actor, MINE)).toHaveLength(1);
  });

  it('resolves a reflection to a reflections container, not to the task list beside it', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ship it' });

    const reflection = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'A quiet week' });

    const sections = await harness.sectionService.list(harness.actor, MINE);
    expect(sections.map(({ type }) => type)).toEqual(['task-list', 'reflections']);
    expect(reflection.sectionId).toBe(sections[1]!.id);
  });

  it('lets an agent granted only tasks.write produce a project that renders its work', async () => {
    const harness = buildHarness();

    const task = await harness.taskService.create(agentActorFor(0, ['tasks.write']), {
      projectId: MINE,
      title: 'From an agent',
    });

    expect((await harness.sectionService.list(harness.actor, MINE))[0]!.id).toBe(task.sectionId);
  });

  it('picks the first container of the matching type when a project has two', async () => {
    const harness = buildHarness();
    const first = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ship it' });

    expect(task.sectionId).toBe(first.id);
  });
});

describe('the invariant: a row lives in a container of its own project', () => {
  it('refuses a section from another project', async () => {
    const harness = buildHarness();
    const theirs = await harness.sectionService.add(harness.other, THEIRS, { type: 'task-list' });

    await expect(
      harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ship it', sectionId: theirs.id }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('refuses a container of the wrong kind, and a view', async () => {
    const harness = buildHarness();
    const reflections = await harness.sectionService.add(harness.actor, MINE, { type: 'reflections' });
    const progress = await harness.sectionService.add(harness.actor, MINE, { type: 'progress' });

    for (const sectionId of [reflections.id, progress.id]) {
      await expect(
        harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ship it', sectionId }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    }
  });

  it('accepts a named container of the right kind', async () => {
    const harness = buildHarness();
    await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    const second = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    const task = await harness.taskService.create(harness.actor, {
      projectId: MINE,
      title: 'Ship it',
      sectionId: second.id,
    });

    expect(task.sectionId).toBe(second.id);
  });
});

describe('subtasks inherit their parent’s container', () => {
  const withParent = async (harness: ReturnType<typeof buildHarness>) => {
    // The parent first, so it resolves to the *first* list and `other` is genuinely other.
    const parent = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Parent' });
    const other = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    return { other, parent };
  };

  it('places a subtask in whichever list holds its parent', async () => {
    const harness = buildHarness();
    const { parent } = await withParent(harness);

    const child = await harness.taskService.create(harness.actor, {
      projectId: MINE,
      title: 'Child',
      parentTaskId: parent.id,
    });

    expect(child.sectionId).toBe(parent.sectionId);
  });

  it('refuses a subtask that names a different container from its parent', async () => {
    const harness = buildHarness();
    const { other, parent } = await withParent(harness);

    await expect(
      harness.taskService.create(harness.actor, {
        projectId: MINE,
        title: 'Child',
        parentTaskId: parent.id,
        sectionId: other.id,
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('takes the whole subtree along when a parent moves between lists', async () => {
    const harness = buildHarness();
    const { other, parent } = await withParent(harness);
    const child = await harness.taskService.create(harness.actor, {
      projectId: MINE,
      title: 'Child',
      parentTaskId: parent.id,
    });
    const grandchild = await harness.taskService.create(harness.actor, {
      projectId: MINE,
      title: 'Grandchild',
      parentTaskId: child.id,
    });

    const moved = await harness.taskService.update(harness.actor, parent.id, { sectionId: other.id });

    expect(moved.sectionId).toBe(other.id);
    expect((await harness.taskService.get(harness.actor, child.id)).sectionId).toBe(other.id);
    expect((await harness.taskService.get(harness.actor, grandchild.id)).sectionId).toBe(other.id);
  });

  it('refuses to move a subtask on its own', async () => {
    const harness = buildHarness();
    const { other, parent } = await withParent(harness);
    const child = await harness.taskService.create(harness.actor, {
      projectId: MINE,
      title: 'Child',
      parentTaskId: parent.id,
    });

    await expect(
      harness.taskService.update(harness.actor, child.id, { sectionId: other.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});

describe('SectionService.remove follows ownership, and only ownership', () => {
  const projectWithWork = async (harness: ReturnType<typeof buildHarness>) => {
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ship it' });
    const list = await harness.sectionService.get(harness.actor, task.sectionId);
    return { task, list };
  };

  it('removes a view without touching a row, whatever the policy says', async () => {
    const harness = buildHarness();
    const { task } = await projectWithWork(harness);
    const progress = await harness.sectionService.add(harness.actor, MINE, { type: 'progress' });

    await harness.sectionService.remove(harness.actor, progress.id);

    expect((await harness.taskService.get(harness.actor, task.id)).archivedAt).toBeUndefined();
  });

  it('treats an unregistered type as a view, so an unknown type can never cascade', async () => {
    const harness = buildHarness();
    const { task, list } = await projectWithWork(harness);
    const unknown = await harness.sectionService.add(harness.actor, MINE, { type: 'not-in-the-registry' });

    await harness.sectionService.remove(harness.actor, unknown.id);

    expect((await harness.taskService.get(harness.actor, task.id)).sectionId).toBe(list.id);
  });

  it('archives an empty container without ceremony, rather than deleting it', async () => {
    const harness = buildHarness();
    const list = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    await harness.sectionService.remove(harness.actor, list.id);

    // Off the canvas, still on the record: no policy is needed because there are no rows to
    // settle, and the root Archive page is what makes the silent removal safe.
    expect(await harness.sectionService.list(harness.actor, MINE)).toEqual([]);
    expect((await harness.sections.find(list.id))?.archivedAt).toBe(SEED_NOW);
  });

  it('refuses a container that still holds rows, naming the count', async () => {
    const harness = buildHarness();
    const { list } = await projectWithWork(harness);

    await expect(harness.sectionService.remove(harness.actor, list.id)).rejects.toThrow(/holds 1 tasks/);
    // Nothing removed: the caller is asked, not guessed at.
    expect(await harness.sectionService.list(harness.actor, MINE)).toHaveLength(1);
  });

  it('cascades by archiving the section and its rows, so the removal is undoable', async () => {
    const harness = buildHarness();
    const { task, list } = await projectWithWork(harness);

    await harness.sectionService.remove(harness.actor, list.id, { policy: 'cascade' });

    const archived = await harness.tasks.find(task.id);
    expect(archived).not.toBeNull();
    expect(archived?.archivedAt).toBe(SEED_NOW);
    // The row names what it came down with, which is what restore pairs on.
    expect(archived?.archivedWithSectionId).toBe(list.id);
    // The container comes down too — the row's section still exists, so nothing dangles.
    expect((await harness.sections.find(list.id))?.archivedAt).toBe(SEED_NOW);
    expect(await harness.sectionService.list(harness.actor, MINE)).toEqual([]);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('stamps the marker on live rows only, and restores exactly those', async () => {
    const harness = buildHarness();
    const { task, list } = await projectWithWork(harness);
    const beforehand = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Filed away' });
    await harness.taskService.archive(harness.actor, beforehand.id);

    await harness.sectionService.remove(harness.actor, list.id, { policy: 'cascade' });
    expect((await harness.tasks.find(beforehand.id))?.archivedWithSectionId).toBeUndefined();

    await harness.sectionService.restoreSection(harness.actor, list.id);

    // Archiving something and restoring it changes no other state: the row filed away
    // beforehand stays filed away.
    const restored = await harness.tasks.find(task.id);
    expect(restored?.archivedAt).toBeUndefined();
    expect(restored?.archivedWithSectionId).toBeUndefined();
    expect((await harness.tasks.find(beforehand.id))?.archivedAt).toBe(SEED_NOW);
    // The section comes back at the end of the canvas, where a new one would go.
    expect((await harness.sectionService.list(harness.actor, MINE)).map((section) => section.id)).toEqual([list.id]);
  });

  it('archives a container holding only archived rows, with no policy and no dangle', async () => {
    // The second dangle, which no policy ever reached: `settleRows` returns early when
    // nothing is live, so the old hard delete removed the section out from under them.
    const harness = buildHarness();
    const { task, list } = await projectWithWork(harness);
    await harness.taskService.archive(harness.actor, task.id);

    const archived = await harness.sectionService.remove(harness.actor, list.id);

    expect(archived.archivedAt).toBe(SEED_NOW);
    expect((await harness.tasks.find(task.id))?.sectionId).toBe(list.id);
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();
  });

  it('reassigns rows to another container of the same type, archived ones included', async () => {
    const harness = buildHarness();
    const { task, list } = await projectWithWork(harness);
    const archived = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Old' });
    await harness.taskService.archive(harness.actor, archived.id);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    await harness.sectionService.remove(harness.actor, list.id, {
      policy: 'reassign',
      reassignToSectionId: target.id,
    });

    expect((await harness.taskService.get(harness.actor, task.id)).sectionId).toBe(target.id);
    expect((await harness.tasks.find(archived.id))?.sectionId).toBe(target.id);
    // The emptied section archives too, and writes no marker: the rows left under their own
    // policy, so restoring it brings back an empty section — what the person removed.
    const emptied = await harness.sections.find(list.id);
    expect(emptied?.archivedAt).toBe(SEED_NOW);
    expect((await harness.tasks.find(task.id))?.archivedWithSectionId).toBeUndefined();
    expect(() => new InMemoryDataStore(harness.store.snapshot())).not.toThrow();

    await harness.sectionService.restoreSection(harness.actor, list.id);
    expect((await harness.taskService.get(harness.actor, task.id)).sectionId).toBe(target.id);
  });

  it('moves an archived subtree whole on reassign, keeping its own markers', async () => {
    const harness = buildHarness();
    const { list } = await projectWithWork(harness);
    const parent = await harness.taskService.create(harness.actor, { projectId: MINE, sectionId: list.id, title: 'Parent' });
    const child = await harness.taskService.create(harness.actor, { projectId: MINE, parentTaskId: parent.id, title: 'Child' });
    await harness.taskService.archive(harness.actor, parent.id);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    await harness.sectionService.remove(harness.actor, list.id, { policy: 'reassign', reassignToSectionId: target.id });

    expect(await harness.tasks.list({ sectionId: list.id, includeArchived: true })).toEqual([]);
    expect(await harness.tasks.find(child.id)).toMatchObject({ sectionId: target.id, archivedWithTaskId: parent.id });
    expect((await harness.tasks.find(parent.id))?.archivedWithSectionId).toBeUndefined();
  });

  it('moves nothing when reassign is asked of a container holding only archived rows', async () => {
    // `settleRows` returns before reading the policy: no live row, no question. The rows stay
    // with their source, which is what keeps that source visible in Archive as their way back.
    const harness = buildHarness();
    const { task, list } = await projectWithWork(harness);
    await harness.taskService.archive(harness.actor, task.id);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    await harness.sectionService.remove(harness.actor, list.id, { policy: 'reassign', reassignToSectionId: target.id });

    expect(await harness.tasks.find(task.id)).toMatchObject({ sectionId: list.id, archivedAt: SEED_NOW });
    expect((await harness.tasks.find(task.id))?.archivedWithSectionId).toBeUndefined();
  });

  it('refuses a reassign target that is archived, naming it', async () => {
    // `require` finds archived sections deliberately, and the checks after it were project
    // and type only — so this moved live rows into a container off the canvas.
    const harness = buildHarness();
    const { list } = await projectWithWork(harness);
    const target = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });
    await harness.sectionService.remove(harness.actor, target.id);

    const refusal = await harness.sectionService
      .remove(harness.actor, list.id, { policy: 'reassign', reassignToSectionId: target.id })
      .then(() => null, (error: unknown) => error);

    // A rule error, not a commit-time integrity failure and rollback.
    expect(refusal).toBeInstanceOf(DomainRuleError);
    expect((refusal as DomainRuleError).message).toContain(target.id);
  });

  it('refuses a reassign target that is missing, itself, or the wrong type', async () => {
    const harness = buildHarness();
    const { list } = await projectWithWork(harness);
    const reflections = await harness.sectionService.add(harness.actor, MINE, { type: 'reflections' });

    await expect(harness.sectionService.remove(harness.actor, list.id, { policy: 'reassign' })).rejects.toBeInstanceOf(
      DomainRuleError,
    );
    await expect(
      harness.sectionService.remove(harness.actor, list.id, { policy: 'reassign', reassignToSectionId: list.id }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    await expect(
      harness.sectionService.remove(harness.actor, list.id, {
        policy: 'reassign',
        reassignToSectionId: reflections.id,
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('refuses a reassign target in another project', async () => {
    const harness = buildHarness();
    const { list } = await projectWithWork(harness);
    const theirs = await harness.sectionService.add(harness.other, THEIRS, { type: 'task-list' });

    await expect(
      harness.sectionService.remove(harness.actor, list.id, { policy: 'reassign', reassignToSectionId: theirs.id }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('cascades reflections too, which is why they gained archivedAt', async () => {
    const harness = buildHarness();
    const reflection = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'A week' });

    await harness.sectionService.remove(harness.actor, reflection.sectionId, { policy: 'cascade' });

    expect((await harness.reflections.find(reflection.id))?.archivedAt).toBe(SEED_NOW);
    expect((await harness.reflections.find(reflection.id))?.archivedWithSectionId).toBe(reflection.sectionId);
    expect(await harness.reflectionService.list(harness.actor, MINE)).toEqual([]);
    expect((await harness.sections.find(reflection.sectionId))?.archivedAt).toBe(SEED_NOW);

    await harness.sectionService.restoreSection(harness.actor, reflection.sectionId);
    expect(await harness.reflectionService.list(harness.actor, MINE)).toHaveLength(1);
  });
});
