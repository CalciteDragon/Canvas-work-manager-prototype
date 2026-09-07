import { buildSeed } from '@cwm/prototype-data';
import { describe, expect, it } from 'vitest';
import { buildHarness } from '../test/test-support';
import { ProjectArchiveService } from './project-archive-service';

const ROOT = 'project-renovation' as never;
const KITCHEN = 'project-kitchen' as never;
const ROOT_TASKS = 'section-project-renovation-tasks' as never;

const buildArchive = () => {
  const harness = buildHarness(buildSeed('nested-projects'));
  const archive = new ProjectArchiveService({
    projects: harness.projects,
    pages: harness.pages,
    sections: harness.sections,
    tasks: harness.tasks,
    reflections: harness.reflections,
  });
  return { harness, archive };
};

describe('ProjectArchiveService (§31)', () => {
  it('includes the whole selected tree once, with causes and actionable blockers', async () => {
    const { harness, archive } = buildArchive();
    const taskContainer = await harness.sectionService.add(harness.actor, ROOT, { type: 'task-list' });
    const parent = await harness.taskService.create(harness.actor, {
      projectId: ROOT,
      sectionId: taskContainer.id,
      title: 'Parent task',
    });
    const child = await harness.taskService.create(harness.actor, {
      projectId: ROOT,
      sectionId: taskContainer.id,
      parentTaskId: parent.id,
      title: 'Child task',
    });
    await harness.taskService.archive(harness.actor, parent.id);

    const independent = await harness.taskService.create(harness.actor, {
      projectId: ROOT,
      sectionId: ROOT_TASKS,
      title: 'Archived before section removal',
    });
    await harness.taskService.archive(harness.actor, independent.id);
    await harness.sectionService.remove(harness.actor, ROOT_TASKS, { policy: 'cascade' });

    // This is a valid hand-edited state explicitly called out by the plan: the canonical
    // project writer refuses it, but Archive must still make the live descendants findable.
    await harness.store.runUnitOfWork(async () => {
      const project = await harness.projects.find(KITCHEN);
      if (project === null || project.kind !== 'subproject') throw new Error('fixture project missing');
      await harness.projects.update({ ...project, status: 'archived' });
    });

    const result = await archive.derive(harness.actor, ROOT);
    const keys = result.items.map((item) => `${item.kind}:${item.kind === 'subproject' ? item.project.id : item.kind === 'section' ? item.section.id : item.kind === 'task' ? item.task.id : item.reflection.id}`);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(`task:${parent.id}`);
    expect(keys).toContain(`task:${child.id}`);
    expect(keys).toContain(`section:${ROOT_TASKS}`);

    const childItem = result.items.find((item) => item.kind === 'task' && item.task.id === child.id);
    expect(childItem).toMatchObject({
      cause: { kind: 'task-cascade', taskId: parent.id },
      restoration: { kind: 'blocked', blocker: { kind: 'task', taskId: parent.id } },
    });

    const hiddenKitchen = result.items.find((item) => item.kind === 'section' && item.section.projectId === KITCHEN);
    expect(hiddenKitchen).toMatchObject({
      cause: { kind: 'hidden-by-project', projectId: KITCHEN },
      restoration: { kind: 'not-archived', blocker: { kind: 'project', projectId: KITCHEN } },
    });
  });

  it('requires all combined read grants before touching repositories', async () => {
    const { archive } = buildArchive();
    const actor = {
      actor: 'agent' as const,
      workspaceId: 'workspace-demo' as never,
      agentConnectionId: 'agent-claude' as never,
      permissions: ['projects.read', 'tasks.read'] as const,
    };
    await expect(archive.derive(actor, ROOT)).rejects.toThrow(/reflections\.read/);
  });

  it('can query an archived root and refuses a subproject as a root', async () => {
    const { harness, archive } = buildArchive();
    await harness.store.runUnitOfWork(async () => {
      const project = await harness.projects.find(ROOT);
      if (project === null) throw new Error('fixture root missing');
      await harness.projects.update({ ...project, status: 'archived' });
    });

    await expect(archive.derive(harness.actor, ROOT)).resolves.toMatchObject({ root: { status: 'archived' } });
    await expect(archive.derive(harness.actor, KITCHEN)).rejects.toThrow(/only a root project/);
  });
});
