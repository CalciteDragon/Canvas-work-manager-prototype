import { describe, expect, it } from 'vitest';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';
import { agentActorFor, buildHarness, MINE, seedContainer } from '../test/test-support';

describe('ProjectJournalService (§36)', () => {
  const populated = async () => {
    const harness = buildHarness();
    const child = await harness.projectService.create(harness.actor, {
      kind: 'subproject',
      workspaceId: 'workspace-demo' as never,
      parentProjectId: MINE,
      name: 'Launch',
    });
    const grandchild = await harness.projectService.create(harness.actor, {
      kind: 'subproject',
      workspaceId: 'workspace-demo' as never,
      parentProjectId: child.id,
      name: 'Release',
    });
    const rootReflection = await harness.reflectionService.create(harness.actor, { projectId: MINE, body: 'Root journal entry' });
    const childReflection = await harness.reflectionService.create(harness.actor, { projectId: grandchild.id, body: 'Nested journal entry' });
    const taskSection = await harness.sectionService.add(harness.actor, grandchild.id, { type: 'task-list' });
    const task = await harness.taskService.create(harness.actor, {
      projectId: grandchild.id,
      sectionId: taskSection.id,
      title: 'Ship release',
      status: 'done',
    });
    await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      body: 'About the task',
      subject: { kind: 'task', id: task.id },
    });
    await harness.projectService.update(harness.actor, child.id, { status: 'completed' });
    await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      body: 'About the unit of work',
      subject: { kind: 'subproject', id: child.id },
    });
    return { harness, child, grandchild, rootReflection, childReflection, task };
  };

  it('aggregates Home and descendant canvases without moving reflection ownership', async () => {
    const { harness, grandchild, rootReflection, childReflection } = await populated();
    const result = await harness.projectJournalService.journal(harness.actor, MINE);

    expect(result.items).toHaveLength(4);
    expect(result.items.map(({ reflection }) => reflection.id)).toContain(rootReflection.id);
    expect(result.items.find(({ reflection }) => reflection.id === childReflection.id)?.origin).toMatchObject({
      projectId: grandchild.id,
      pageKind: 'work',
    });
    expect(result.items.every(({ reflection }) => reflection.projectId === MINE || reflection.projectId === grandchild.id)).toBe(true);
  });

  it('resolves current task and sub-project subject views, retaining subjectless entries', async () => {
    const { harness, child, task, rootReflection } = await populated();
    const result = await harness.projectJournalService.journal(harness.actor, MINE);
    const linkedTask = result.items.find(({ reflection }) => reflection.subject?.kind === 'task');
    const linkedProject = result.items.find(({ reflection }) => reflection.subject?.kind === 'subproject');
    const ordinary = result.items.find(({ reflection }) => reflection.id === rootReflection.id);

    expect(linkedTask?.subject).toMatchObject({ kind: 'task', id: task.id, name: 'Ship release', status: 'done' });
    expect(linkedProject?.subject).toMatchObject({ kind: 'subproject', id: child.id, name: 'Launch', status: 'completed' });
    expect(ordinary?.reflection.body).toBe('Root journal entry');
    expect(ordinary?.reflection.subject).toBeUndefined();
  });

  it('resolves a retained subject after the canonical work is archived', async () => {
    const { harness, task } = await populated();
    await harness.taskService.archive(harness.actor, task.id);

    const entry = (await harness.projectJournalService.journal(harness.actor, MINE)).items.find(
      ({ reflection }) => reflection.subject?.kind === 'task',
    );
    expect(entry?.subject).toMatchObject({ kind: 'task', id: task.id, status: 'done', archived: true });
  });

  it('keeps a historical link but omits its resolved view after the subject leaves the root tree', async () => {
    const { harness, child } = await populated();
    const otherRoot = await harness.projectService.create(harness.actor, {
      kind: 'root',
      workspaceId: 'workspace-demo' as never,
      name: 'Another workspace root',
    });
    await harness.projectService.update(harness.actor, child.id, { parentProjectId: otherRoot.id });

    const entry = (await harness.projectJournalService.journal(harness.actor, MINE)).items.find(
      ({ reflection }) => reflection.subject?.kind === 'subproject',
    );
    expect(entry?.reflection.subject).toEqual({ kind: 'subproject', id: child.id });
    expect(entry?.subject).toBeUndefined();
  });

  it('offers only currently completed live work in deterministic order', async () => {
    const { harness, child, task } = await populated();
    const sectionId = await seedContainer(harness, MINE);
    const openTask = await harness.taskService.create(harness.actor, { projectId: MINE, sectionId, title: 'Still open' });
    const archivedTask = await harness.taskService.create(harness.actor, { projectId: MINE, sectionId, title: 'Filed', status: 'done' });
    await harness.taskService.archive(harness.actor, archivedTask.id);
    const result = await harness.projectJournalService.completedWork(harness.actor, MINE);

    expect(result.candidates.map(({ id }) => id)).toEqual([child.id, task.id]);
    expect(result.candidates.map(({ id }) => id)).not.toContain(openTask.id);
    expect(result.candidates.map(({ id }) => id)).not.toContain(archivedTask.id);
  });

  it('excludes completed work hidden beneath an archived ancestor while retaining its journal state', async () => {
    const harness = buildHarness();
    const middle = await harness.projectService.create(harness.actor, {
      kind: 'subproject',
      workspaceId: 'workspace-demo' as never,
      parentProjectId: MINE,
      name: 'Archived phase',
    });
    const leaf = await harness.projectService.create(harness.actor, {
      kind: 'subproject',
      workspaceId: 'workspace-demo' as never,
      parentProjectId: middle.id,
      name: 'Finished work',
    });
    await harness.projectService.update(harness.actor, leaf.id, { status: 'completed' });
    await harness.reflectionService.create(harness.actor, {
      projectId: MINE,
      body: 'History beneath an archived phase',
      subject: { kind: 'subproject', id: leaf.id },
    });

    // Canonical archive writes refuse live children. This hand-built document state is the
    // explicit fixture for §31's non-cascading archive rule and the read model's hidden branch.
    await harness.store.runUnitOfWork(async () => {
      const current = await harness.projects.find(middle.id);
      if (current === null) throw new Error('fixture phase disappeared');
      await harness.projects.update({ ...current, status: 'archived', updatedAt: harness.clock.now().toISOString() });
    });

    const journal = await harness.projectJournalService.journal(harness.actor, MINE);
    const entry = journal.items.find(({ reflection }) => reflection.subject?.kind === 'subproject');
    expect(entry?.subject).toMatchObject({ kind: 'subproject', id: leaf.id, status: 'completed', hiddenByArchivedAncestor: true });
    expect((await harness.projectJournalService.completedWork(harness.actor, MINE)).candidates).toEqual([]);
  });

  it('returns an empty projection for an archived root and refuses non-root or foreign roots', async () => {
    const { harness, child, grandchild } = await populated();
    await harness.projectService.archive(harness.actor, grandchild.id);
    await harness.projectService.archive(harness.actor, child.id);
    await harness.projectService.archive(harness.actor, MINE);
    expect((await harness.projectJournalService.journal(harness.actor, MINE)).items).toEqual([]);
    expect((await harness.projectJournalService.completedWork(harness.actor, MINE)).candidates).toEqual([]);
    await expect(harness.projectJournalService.journal(harness.actor, 'project-missing' as never)).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(harness.projectJournalService.completedWork(harness.actor, child.id)).rejects.toBeInstanceOf(DomainRuleError);
    await expect(harness.projectJournalService.completedWork(harness.actor, 'project-theirs' as never)).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('asserts all combined-read grants before reading and keeps the refusal atomic', async () => {
    const { harness } = await populated();
    await expect(harness.projectJournalService.journal(agentActorFor(0, ['projects.read', 'tasks.read']), MINE)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(harness.projectJournalService.completedWork(agentActorFor(0, ['projects.read']), MINE)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(harness.projectJournalService.journal(harness.actor, 'project-missing' as never)).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(harness.projectJournalService.journal(harness.actor, 'project-theirs' as never)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
