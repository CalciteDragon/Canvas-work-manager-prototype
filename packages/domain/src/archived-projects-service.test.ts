import { buildSeed } from '@cwm/prototype-data';
import { describe, expect, it } from 'vitest';
import { buildHarness } from '../test/test-support';
import { ArchivedProjectsService } from './archived-projects-service';
import { ProjectArchiveService } from './project-archive-service';

describe('ArchivedProjectsService', () => {
  it('lists archived roots and sub-projects with live ancestors in the actor workspace', async () => {
    const harness = buildHarness(buildSeed('nested-projects'));
    const service = new ArchivedProjectsService({ projects: harness.projects });
    await harness.projectService.archive(harness.actor, 'project-cabinets' as never);
    await harness.projectService.archive(harness.actor, 'project-kitchen' as never);
    const first = await service.list(harness.actor);
    expect(first.items.map(({ project }) => project.id)).toContain('project-kitchen');
    expect(first.items.map(({ project }) => project.id)).not.toContain('project-cabinets');
    expect(first.items.map(({ project }) => project.id)).not.toContain('project-alex-private');
    await harness.projectService.update(harness.actor, 'project-kitchen' as never, { status: 'active' });
    const second = await service.list(harness.actor);
    expect(second.items.map(({ project }) => project.id)).toContain('project-cabinets');
  });

  it('re-evaluates a listed child after it moves to another live root', async () => {
    const harness = buildHarness(buildSeed('nested-projects'));
    const service = new ArchivedProjectsService({ projects: harness.projects });
    const archive = new ProjectArchiveService({ projects: harness.projects, pages: harness.pages,
      sections: harness.sections, tasks: harness.tasks, reflections: harness.reflections });
    await harness.projectService.archive(harness.actor, 'project-cabinets' as never);
    const other = await harness.projectService.create(harness.actor, {
      workspaceId: harness.actor.workspaceId, kind: 'root', name: 'Other root',
    });
    expect((await archive.derive(harness.actor, 'project-renovation' as never)).items.some((item) =>
      item.kind === 'subproject' && item.project.id === 'project-cabinets')).toBe(true);
    await harness.projectService.update(harness.actor, 'project-cabinets' as never, { parentProjectId: other.id });
    const result = await service.list(harness.actor);
    expect(result.items.find(({ project }) => project.id === 'project-cabinets')?.breadcrumb.map(({ projectId }) => projectId))
      .toEqual([other.id, 'project-cabinets']);
    expect((await archive.derive(harness.actor, 'project-renovation' as never)).items.some((item) =>
      item.kind === 'subproject' && item.project.id === 'project-cabinets')).toBe(false);
    expect((await archive.derive(harness.actor, other.id)).items.some((item) =>
      item.kind === 'subproject' && item.project.id === 'project-cabinets')).toBe(true);
    await harness.projectService.update(harness.actor, 'project-cabinets' as never, { status: 'active' });
    expect((await service.list(harness.actor)).items.some(({ project }) => project.id === 'project-cabinets')).toBe(false);
    expect((await archive.derive(harness.actor, other.id)).items.some((item) =>
      item.kind === 'subproject' && item.project.id === 'project-cabinets')).toBe(false);
  });

  it('checks projects.read without requiring any content read grant', async () => {
    const harness = buildHarness(buildSeed('nested-projects'));
    const service = new ArchivedProjectsService({ projects: harness.projects });
    const actor = { actor: 'agent' as const, workspaceId: harness.actor.workspaceId, agentConnectionId: 'agent-claude' as never, permissions: ['projects.read' as const] };
    await expect(service.list(actor)).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(service.list({ ...actor, permissions: [] })).rejects.toThrow('projects.read');
  });
});
