import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, seedContainer, THEIRS } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';

describe('ReflectionService', () => {
  it('creates body-only and prompted/titled reflections, newest first', async () => {
    const harness = buildHarness();
    const first = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'First' });
    harness.clock.setNow(new Date('2026-08-25T16:00:00.000Z'));
    const second = await harness.reflectionService.create(harness.actor, { projectId: MINE, title: 'Checkpoint', body: 'Second', prompt: 'What changed?' });
    expect((await harness.reflectionService.list(harness.actor, MINE)).map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(second).toMatchObject({ title: 'Checkpoint', prompt: 'What changed?' });
  });

  it('edits title/body, preserves createdAt, and updates through Clock', async () => {
    const harness = buildHarness();
    const reflection = await harness.reflectionService.create(harness.actor, { projectId: MINE, title: 'Old', body: 'Before' });
    harness.clock.setNow(new Date('2026-08-25T16:00:00.000Z'));
    const updated = await harness.reflectionService.update(harness.actor, reflection.id, { title: null, body: 'After' });
    expect(updated.title).toBeUndefined();
    expect(updated.createdAt).toBe(reflection.createdAt);
    expect(updated.updatedAt).toBe('2026-08-25T16:00:00.000Z');
  });

  it('records activity atomically and hides foreign data', async () => {
    const harness = buildHarness();
    const reflection = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'Visible' });
    expect((await harness.activity.list(harness.actor))[0]).toMatchObject({ action: 'reflection.added', entityId: reflection.id });
    await expect(harness.reflectionService.create(harness.actor, { projectId: THEIRS, body: 'No' })).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(harness.reflectionService.list(harness.actor, THEIRS)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe('ReflectionService permissions (§51, §53)', () => {
  it('refuses a read without reflections.read and a write without reflections.write', async () => {
    const harness = buildHarness();

    await expect(harness.reflectionService.list(agentActorFor(0, ['reflections.write']), MINE)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(
      harness.reflectionService.create(agentActorFor(0, ['reflections.read']), { projectId: MINE, body: 'No' }),
    ).rejects.toThrow('connection "agent-claude" is missing permission "reflections.write"');
  });
});

describe('ReflectionService completed-work subjects (§36)', () => {
  const completedTask = async (harness: ReturnType<typeof buildHarness>) => {
    const sectionId = await seedContainer(harness, MINE);
    return harness.taskService.create(harness.actor, {
      projectId: MINE,
      sectionId,
      title: 'Ship the release',
      status: 'done',
    });
  };

  it('attaches completed tasks and sub-projects without changing ownership', async () => {
    const harness = buildHarness();
    const task = await completedTask(harness);
    const child = await harness.projectService.create(harness.actor, {
      kind: 'subproject',
      workspaceId: 'workspace-demo' as never,
      parentProjectId: MINE,
      name: 'Launch',
    });
    const completedChild = await harness.projectService.update(harness.actor, child.id, { status: 'completed' });

    const taskReflection = await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      body: 'Task note',
      subject: { kind: 'task', id: task.id },
    });
    const projectReflection = await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      body: 'Project note',
      subject: { kind: 'subproject', id: completedChild.id },
    });

    expect(taskReflection).toMatchObject({ projectId: MINE, subject: { kind: 'task', id: task.id } });
    expect(projectReflection).toMatchObject({ projectId: MINE, subject: { kind: 'subproject', id: child.id } });
    expect((await harness.reflectionService.list(harness.actor, MINE)).map(({ projectId }) => projectId)).toEqual([
      MINE,
      MINE,
    ]);
  });

  it('rejects incomplete, archived, root and cross-root subjects before creating a container', async () => {
    const harness = buildHarness();
    const sectionId = await seedContainer(harness, MINE);
    const incomplete = await harness.taskService.create(harness.actor, { projectId: MINE, sectionId, title: 'Not done' });
    const beforeSections = (await harness.sections.list({ projectId: MINE, includeArchived: true })).length;

    await expect(
      harness.reflectionService.create(harness.actor, {
        projectId: MINE,
        body: 'No',
        subject: { kind: 'task', id: incomplete.id },
      }),
    ).rejects.toThrow(/not completed/);
    await expect(
      harness.reflectionService.create(harness.actor, {
        projectId: MINE,
        body: 'No',
        subject: { kind: 'subproject', id: MINE },
      }),
    ).rejects.toThrow(/root project/);
    await expect(
      harness.reflectionService.create(harness.actor, {
        projectId: MINE,
        body: 'No',
        subject: { kind: 'task', id: 'task-missing' as never },
      }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect((await harness.sections.list({ projectId: MINE, includeArchived: true })).length).toBe(beforeSections);
  });

  it('collapses subject eligibility failures for an agent without the relevant read grant', async () => {
    const harness = buildHarness();
    const sectionId = await seedContainer(harness, MINE);
    const incomplete = await harness.taskService.create(harness.actor, { projectId: MINE, sectionId, title: 'Not done' });
    const actor = agentActorFor(0, ['reflections.write']);

    await expect(
      harness.reflectionService.create(actor, {
        projectId: MINE,
        body: 'No',
        subject: { kind: 'task', id: incomplete.id },
      }),
    ).rejects.toThrow('that subject cannot be reflected on');
  });

  it('retains a subject through reopen and archive, while an explicit replacement is revalidated', async () => {
    const harness = buildHarness();
    const task = await completedTask(harness);
    const reflection = await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      body: 'Before',
      subject: { kind: 'task', id: task.id },
    });

    await harness.taskService.update(harness.actor, task.id, { status: 'todo' });
    const reopened = await harness.reflectionService.update(harness.actor, reflection.id, { body: 'After reopen' });
    expect(reopened.subject).toEqual({ kind: 'task', id: task.id });

    await harness.taskService.archive(harness.actor, task.id);
    const archived = await harness.reflectionService.update(harness.actor, reflection.id, { body: 'After archive' });
    expect(archived.subject).toEqual({ kind: 'task', id: task.id });

    const incomplete = await harness.taskService.create(harness.actor, {
      projectId: MINE,
      sectionId: task.sectionId,
      title: 'Still open',
    });
    await expect(
      harness.reflectionService.update(harness.actor, reflection.id, {
        subject: { kind: 'task', id: incomplete.id },
      }),
    ).rejects.toThrow(/not completed/);
  });

  it('assigns a subject through update and clears it with null', async () => {
    const harness = buildHarness();
    const task = await completedTask(harness);
    const reflection = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'Unlinked first' });

    const linked = await harness.reflectionService.update(harness.actor, reflection.id, {
      subject: { kind: 'task', id: task.id },
    });
    expect(linked.subject).toEqual({ kind: 'task', id: task.id });

    const cleared = await harness.reflectionService.update(harness.actor, reflection.id, { subject: null });
    expect(cleared.subject).toBeUndefined();
  });
});

describe('ReflectionService.archive and restore', () => {
  const write = (harness: ReturnType<typeof buildHarness>, body = 'A week') =>
    harness.reflectionService.create(harness.actor, { projectId: MINE, body });

  it('archives, hides from the default list, and restores', async () => {
    // Until this pair existed a reflection could acquire `archivedAt` only by having its
    // container cascaded, and nothing could ever clear it.
    const harness = buildHarness();
    const reflection = await write(harness);

    const archived = await harness.reflectionService.archive(harness.actor, reflection.id);
    expect(archived.archivedAt).toBeDefined();
    expect(await harness.reflectionService.list(harness.actor, MINE)).toEqual([]);
    expect(await harness.reflectionService.list(harness.actor, MINE, { includeArchived: true })).toHaveLength(1);

    const restored = await harness.reflectionService.restore(harness.actor, reflection.id);
    expect(restored.archivedAt).toBeUndefined();
    expect(await harness.reflectionService.list(harness.actor, MINE)).toHaveLength(1);
  });

  it('records one event each way, and nothing for an idempotent repeat', async () => {
    const harness = buildHarness();
    const reflection = await write(harness);
    await harness.reflectionService.archive(harness.actor, reflection.id);
    await harness.reflectionService.archive(harness.actor, reflection.id);
    await harness.reflectionService.restore(harness.actor, reflection.id);
    await harness.reflectionService.restore(harness.actor, reflection.id);

    const actions = (await harness.activity.list(harness.actor)).map((event) => event.action);
    expect(actions.filter((action) => action === 'reflection.archived')).toHaveLength(1);
    expect(actions.filter((action) => action === 'reflection.restored')).toHaveLength(1);
  });

  it('narrows to one container when a section is named', async () => {
    const harness = buildHarness();
    const first = await write(harness, 'In the first list');
    const other = await harness.sectionService.add(harness.actor, MINE, { type: 'reflections' });
    await harness.reflectionService.create(harness.actor, { projectId: MINE, sectionId: other.id, body: 'Elsewhere' });

    expect(
      (await harness.reflectionService.list(harness.actor, MINE, { sectionId: first.sectionId })).map(({ id }) => id),
    ).toEqual([first.id]);
  });

  it('refuses to restore a reflection whose section is archived, naming the section', async () => {
    const harness = buildHarness();
    const reflection = await write(harness);
    await harness.sectionService.remove(harness.actor, reflection.sectionId, { policy: 'cascade' });

    const refusal = await harness.reflectionService
      .restore(harness.actor, reflection.id)
      .then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(DomainRuleError);
    expect((refusal as DomainRuleError).message).toContain(reflection.sectionId);
  });

  it('freezes an archived project against create, update and restore, while archive stays allowed', async () => {
    const harness = buildHarness();
    const live = await write(harness, 'Still here');
    const filed = await write(harness, 'Filed away');
    await harness.reflectionService.archive(harness.actor, filed.id);
    await harness.projectService.archive(harness.actor, MINE);

    await expect(
      harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'No' }),
    ).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.reflectionService.update(harness.actor, live.id, { body: 'No' })).rejects.toBeInstanceOf(
      DomainRuleError,
    );
    await expect(harness.reflectionService.restore(harness.actor, filed.id)).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.reflectionService.archive(harness.actor, live.id)).resolves.toMatchObject({ id: live.id });
  });

  it('refuses both writes without reflections.write, and hides a foreign workspace', async () => {
    const harness = buildHarness();
    const reflection = await write(harness);

    await expect(
      harness.reflectionService.archive(agentActorFor(0, ['reflections.read']), reflection.id),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      harness.reflectionService.restore(agentActorFor(0, ['reflections.read']), reflection.id),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    // Not-found rather than a rule error: a 409 would confirm the reflection exists.
    await expect(harness.reflectionService.archive(harness.other, reflection.id)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
  });
});
