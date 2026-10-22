import { describe, expect, it } from 'vitest';
import { buildHarness, MINE } from '../test/test-support';
import { taskOrigin } from './task-origin';

describe('taskOrigin (§24, §34, §38)', () => {
  it('resolves a root Home task and refuses an absent section or page', async () => {
    const h = buildHarness();
    const task = await h.taskService.create(h.actor, { projectId: MINE, title: 'Root task' });
    const projects = await h.projects.list();
    const sections = await h.sections.list();
    const pages = await h.pages.list();
    expect(taskOrigin(task, projects, sections, pages)).toMatchObject({
      projectId: MINE, pageKind: 'home', sectionId: task.sectionId,
      sectionName: 'Task List', breadcrumb: [{ projectId: MINE, name: 'Project project-mine' }],
    });
    expect(taskOrigin(task, projects, [], pages)).toBeUndefined();
    expect(taskOrigin(task, projects, sections, [])).toBeUndefined();
  });

  it('walks a deep Work owner to the true root in root-first order', async () => {
    const h = buildHarness();
    const child = await h.projectService.create(h.actor, { kind: 'subproject', workspaceId: h.actor.workspaceId, parentProjectId: MINE, name: 'Child' });
    const deep = await h.projectService.create(h.actor, { kind: 'subproject', workspaceId: h.actor.workspaceId, parentProjectId: child.id, name: 'Deep' });
    const task = await h.taskService.create(h.actor, { projectId: deep.id, title: 'Deep task' });
    expect(taskOrigin(task, await h.projects.list(), await h.sections.list(), await h.pages.list())).toMatchObject({
      projectId: deep.id, pageKind: 'work', sectionId: task.sectionId,
      breadcrumb: [{ projectId: MINE, name: 'Project project-mine' }, { projectId: child.id, name: 'Child' }, { projectId: deep.id, name: 'Deep' }],
    });
  });
});
