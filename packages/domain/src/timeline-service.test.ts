import { MilestoneSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { EntityNotFoundError } from './errors';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';

it('slice 77 links tasks to their container and workstreams to themselves under projects.read alone', async () => {
  const h = buildHarness();
  await h.projectService.update(h.actor, MINE, { targetDate: '2026-09-30' });
  const child = await h.projectService.create(h.actor, { kind: 'subproject', workspaceId: h.actor.workspaceId, parentProjectId: MINE, name: 'Child', targetDate: '2026-09-20' });
  const rootTask = await h.taskService.create(h.actor, { projectId: MINE, title: 'Root', dueAt: '2026-09-10T21:00:00.000Z' });
  const nested = await h.taskService.create(h.actor, { projectId: child.id, title: 'Child task', dueAt: '2026-09-12T21:00:00.000Z' });
  await h.milestones.insert(MilestoneSchema.parse({ id: 'milestone-links', projectId: MINE, title: 'Decision', targetDate: '2026-09-06', status: 'upcoming', createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z' }));
  const { items } = await h.timelineService.derive(agentActorFor(0, ['projects.read']), MINE);
  expect(items.find(({ id }) => id === rootTask.id)?.link).toEqual({ projectId: MINE, pageKind: 'home', sectionId: rootTask.sectionId });
  expect(items.find(({ id }) => id === nested.id)?.link).toEqual({ projectId: child.id, pageKind: 'work', sectionId: nested.sectionId });
  expect(items.find(({ id }) => id === child.id)?.link).toEqual({ projectId: child.id, pageKind: 'work' });
  expect(items.filter(({ kind }) => kind === 'project' || kind === 'milestone').every(({ link }) => link === undefined)).toBe(true);
});

describe('TimelineService', () => {
  it('uses a deadline marker until an earlier dated descendant establishes a range', async () => {
    const harness = buildHarness();
    await harness.projectService.update(harness.actor, MINE, { targetDate: '2026-09-30' });
    expect((await harness.timelineService.derive(harness.actor, MINE)).items[0]).toMatchObject({ kind: 'project', startDate: '2026-09-30', endDate: '2026-09-30' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Prepare', startAt: '2026-09-01T09:00:00.000Z', dueAt: '2026-09-05T17:00:00.000Z' });
    expect((await harness.timelineService.derive(harness.actor, MINE)).items.find(({ kind }) => kind === 'project')).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30' });
  });

  it('derives nested project, task, and milestone rows without stored timeline records', async () => {
    const harness = buildHarness();
    const child = await harness.projectService.create(harness.actor, { kind: 'subproject', workspaceId: harness.actor.workspaceId, parentProjectId: MINE, name: 'Child', targetDate: '2026-09-10' });
    await harness.taskService.create(harness.actor, { projectId: child.id, title: 'Nested task', dueAt: '2026-09-08T17:00:00.000Z' });
    await harness.milestones.insert(MilestoneSchema.parse({ id: 'milestone-one', projectId: MINE, title: 'Decision', targetDate: '2026-09-06', status: 'upcoming', createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z' }));
    const kinds = (await harness.timelineService.derive(harness.actor, MINE)).items.map(({ kind }) => kind);
    expect(kinds).toEqual(expect.arrayContaining(['sub-project', 'task', 'milestone']));
    expect(Object.keys(harness.store.snapshot())).not.toContain('timelineEvents');
  });

  it('normalizes inverted task dates but flags the source inconsistency', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Backwards', startAt: '2026-09-10T09:00:00.000Z', dueAt: '2026-09-05T17:00:00.000Z' });
    expect((await harness.timelineService.derive(harness.actor, MINE)).items.find(({ title }) => title === 'Backwards')).toMatchObject({ startDate: '2026-09-05', endDate: '2026-09-10', invalidRange: true });
  });

  it('keeps a target marker when descendant dates are equal to or later than the target', async () => {
    const harness = buildHarness();
    await harness.projectService.update(harness.actor, MINE, { targetDate: '2026-09-30' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Same day', dueAt: '2026-09-30T17:00:00.000Z' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Later', dueAt: '2026-10-02T17:00:00.000Z' });

    expect((await harness.timelineService.derive(harness.actor, MINE)).items.find(({ kind }) => kind === 'project')).toMatchObject({ startDate: '2026-09-30', endDate: '2026-09-30' });
  });

  it('does not fabricate a project row without a target or dated child work', async () => {
    const harness = buildHarness();

    expect((await harness.timelineService.derive(harness.actor, MINE)).items).toEqual([]);
  });

  it('excludes archived descendants and everything nested beneath them', async () => {
    const harness = buildHarness();
    await harness.projectService.update(harness.actor, MINE, { targetDate: '2026-09-30' });
    const child = await harness.projectService.create(harness.actor, { kind: 'subproject', workspaceId: harness.actor.workspaceId, parentProjectId: MINE, name: 'Archived child', targetDate: '2026-08-20' });
    await harness.taskService.create(harness.actor, { projectId: child.id, title: 'Hidden task', dueAt: '2026-08-18T17:00:00.000Z' });
    await harness.milestones.insert(MilestoneSchema.parse({ id: 'milestone-hidden', projectId: child.id, title: 'Hidden milestone', targetDate: '2026-08-19', status: 'upcoming', createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z' }));
    await harness.projectService.archive(harness.actor, child.id);

    const result = await harness.timelineService.derive(harness.actor, MINE);
    expect(result.items.map(({ title }) => title)).toEqual(['Project project-mine']);
    expect(result.items[0]).toMatchObject({ startDate: '2026-09-30', endDate: '2026-09-30' });
  });

  it('treats a foreign root as missing', async () => {
    const harness = buildHarness();

    await expect(harness.timelineService.derive(harness.actor, THEIRS)).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
