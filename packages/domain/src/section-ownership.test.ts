import { SEED_NOW } from '@cwm/prototype-data';
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

  it('removes an empty container without ceremony', async () => {
    const harness = buildHarness();
    const list = await harness.sectionService.add(harness.actor, MINE, { type: 'task-list' });

    await harness.sectionService.remove(harness.actor, list.id);

    expect(await harness.sectionService.list(harness.actor, MINE)).toEqual([]);
  });

  it('refuses a container that still holds rows, naming the count', async () => {
    const harness = buildHarness();
    const { list } = await projectWithWork(harness);

    await expect(harness.sectionService.remove(harness.actor, list.id)).rejects.toThrow(/holds 1 tasks/);
    // Nothing removed: the caller is asked, not guessed at.
    expect(await harness.sectionService.list(harness.actor, MINE)).toHaveLength(1);
  });

  it('cascades by archiving rather than deleting, so the removal is undoable', async () => {
    const harness = buildHarness();
    const { task, list } = await projectWithWork(harness);

    await harness.sectionService.remove(harness.actor, list.id, { policy: 'cascade' });

    const archived = await harness.tasks.find(task.id);
    expect(archived).not.toBeNull();
    expect(archived?.archivedAt).toBe(SEED_NOW);
  });

  it('ignores rows that are already archived, so an emptied list goes quietly', async () => {
    const harness = buildHarness();
    const { task, list } = await projectWithWork(harness);
    await harness.taskService.archive(harness.actor, task.id);

    await expect(harness.sectionService.remove(harness.actor, list.id)).resolves.toBeUndefined();
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
    expect(await harness.reflectionService.list(harness.actor, MINE)).toEqual([]);
  });
});
