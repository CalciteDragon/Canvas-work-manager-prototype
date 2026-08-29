import { DashboardResultSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';
import { RECENT_AGENT_ACTIVITY_LIMIT } from './dashboard-service';
import { PermissionDeniedError } from './errors';

/** The harness clock sits on `SEED_NOW` — Monday 2026-08-24, 16:00 UTC. */
const NOW = '2026-08-24T16:00:00.000Z';

const NEWLINE = '\n';

const titles = (tasks: ReadonlyArray<{ title: string }>): string[] => tasks.map(({ title }) => title);

describe('DashboardService.load', () => {
  it('answers the contract for an empty workspace without inventing content', async () => {
    const harness = buildHarness();
    const result = await harness.dashboardService.load(harness.actor, {});

    expect(() => DashboardResultSchema.parse(result)).not.toThrow();
    expect(result.today).toMatchObject({ date: '2026-08-24', overdue: [], dueToday: [], inProgress: [] });
    expect(result.upcoming).toMatchObject({ days: 7, throughDate: '2026-08-31', tasks: [] });
    expect(result.recentProgress).toMatchObject({ days: 7, sinceDate: '2026-08-18', tasks: [] });
    expect(result.generatedAt).toBe(NOW);
    expect(result.dailyDigest.source).toBe('prototype');
    expect(result.funFact.length).toBeGreaterThan(0);
  });

  it('sorts each task into exactly one of overdue, due today, and in progress', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Late', dueAt: '2026-08-21T17:00:00.000Z' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Tonight', dueAt: '2026-08-24T21:00:00.000Z' });
    const running = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Running' });
    await harness.taskService.update(harness.actor, running.id, { status: 'in_progress' });
    // Overdue *and* in progress: it must appear once, in the bucket that needs action.
    const slipping = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Slipping', dueAt: '2026-08-22T17:00:00.000Z' });
    await harness.taskService.update(harness.actor, slipping.id, { status: 'in_progress' });

    const { today } = await harness.dashboardService.load(harness.actor, {});

    expect(titles(today.overdue)).toEqual(['Late', 'Slipping']);
    expect(titles(today.dueToday)).toEqual(['Tonight']);
    expect(titles(today.inProgress)).toEqual(['Running']);
    expect(today.overdue.every(({ overdue }) => overdue)).toBe(true);
  });

  it('leaves finished, cancelled, and archived work out of today and upcoming', async () => {
    const harness = buildHarness();
    const done = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Done', dueAt: '2026-08-21T17:00:00.000Z' });
    await harness.taskService.complete(harness.actor, done.id);
    const cancelled = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Cancelled', dueAt: '2026-08-21T17:00:00.000Z' });
    await harness.taskService.update(harness.actor, cancelled.id, { status: 'cancelled' });
    const archived = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Archived', dueAt: '2026-08-26T17:00:00.000Z' });
    await harness.taskService.archive(harness.actor, archived.id);

    const result = await harness.dashboardService.load(harness.actor, {});

    expect(result.today.overdue).toEqual([]);
    expect(result.upcoming.tasks).toEqual([]);
  });

  it('honours the configured upcoming range and orders by due date', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Thursday', dueAt: '2026-08-27T17:00:00.000Z' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Wednesday', dueAt: '2026-08-26T17:00:00.000Z' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Fortnight', dueAt: '2026-09-04T17:00:00.000Z' });

    const week = await harness.dashboardService.load(harness.actor, {});
    const fortnight = await harness.dashboardService.load(harness.actor, { upcomingDays: 14 });

    expect(titles(week.upcoming.tasks)).toEqual(['Wednesday', 'Thursday']);
    expect(titles(fortnight.upcoming.tasks)).toEqual(['Wednesday', 'Thursday', 'Fortnight']);
    expect(fortnight.upcoming.throughDate).toBe('2026-09-07');
  });

  it('rejects a range the contract does not allow rather than silently clamping it', async () => {
    const harness = buildHarness();
    await expect(harness.dashboardService.load(harness.actor, { upcomingDays: 0 })).rejects.toThrow();
    await expect(harness.dashboardService.load(harness.actor, { recentDays: 400 })).rejects.toThrow();
  });

  it('lists recently completed work newest first and drops anything older than the lookback', async () => {
    const harness = buildHarness();
    const old = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Old win' });
    harness.clock.setNow(new Date('2026-08-10T12:00:00.000Z'));
    await harness.taskService.complete(harness.actor, old.id);

    harness.clock.setNow(new Date('2026-08-22T12:00:00.000Z'));
    const early = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Friday win' });
    await harness.taskService.complete(harness.actor, early.id);

    harness.clock.setNow(new Date('2026-08-23T12:00:00.000Z'));
    const late = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Sunday win' });
    await harness.taskService.complete(harness.actor, late.id);

    harness.clock.setNow(new Date(NOW));
    const result = await harness.dashboardService.load(harness.actor, {});

    expect(titles(result.recentProgress.tasks)).toEqual(['Sunday win', 'Friday win']);
    expect(titles((await harness.dashboardService.load(harness.actor, { recentDays: 30 })).recentProgress.tasks)).toEqual([
      'Sunday win',
      'Friday win',
      'Old win',
    ]);
  });

  it('summarizes active projects with counts, count-based progress, and days to target', async () => {
    const harness = buildHarness();
    await harness.projectService.update(harness.actor, MINE, { targetDate: '2026-08-28' });
    const done = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Shipped' });
    await harness.taskService.complete(harness.actor, done.id);
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Open one' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Open two' });

    const [project] = (await harness.dashboardService.load(harness.actor, {})).activeProjects;

    expect(project).toMatchObject({ id: MINE, openTasks: 2, completedTasks: 1, percentage: 33, daysToTarget: 4 });
  });

  it('omits projects that are not active and never leaks another workspace', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.other, { projectId: THEIRS, title: 'Not mine', dueAt: '2026-08-21T17:00:00.000Z' });
    const parked = await harness.projectService.create(harness.actor, { workspaceId: harness.actor.workspaceId, name: 'Parked' });
    await harness.projectService.update(harness.actor, parked.id, { status: 'on_hold' });

    const result = await harness.dashboardService.load(harness.actor, {});

    expect(result.activeProjects.map(({ id }) => id)).toEqual([MINE]);
    expect(result.today.overdue).toEqual([]);
  });

  it('names the project each row came from, because rows mix projects', async () => {
    const harness = buildHarness();
    await harness.projectService.update(harness.actor, MINE, { icon: '🚀' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Late', dueAt: '2026-08-21T17:00:00.000Z' });

    const [row] = (await harness.dashboardService.load(harness.actor, {})).today.overdue;

    expect(row).toMatchObject({ projectId: MINE, projectName: 'Project project-mine', projectIcon: '🚀' });
  });

  it('is driven by the clock: the same document reads differently on a later day (§45)', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Wednesday', dueAt: '2026-08-26T17:00:00.000Z' });

    const monday = await harness.dashboardService.load(harness.actor, {});
    harness.clock.setNow(new Date('2026-08-26T09:00:00.000Z'));
    const wednesday = await harness.dashboardService.load(harness.actor, {});

    expect(titles(monday.upcoming.tasks)).toEqual(['Wednesday']);
    expect(monday.today.dueToday).toEqual([]);
    expect(wednesday.upcoming.tasks).toEqual([]);
    expect(titles(wednesday.today.dueToday)).toEqual(['Wednesday']);
    expect(wednesday.today.date).toBe('2026-08-26');
  });

  it('rotates the fun fact daily and holds it steady within a day (§24)', async () => {
    const harness = buildHarness();
    const morning = (await harness.dashboardService.load(harness.actor, {})).funFact;
    harness.clock.setNow(new Date('2026-08-24T22:00:00.000Z'));
    const evening = (await harness.dashboardService.load(harness.actor, {})).funFact;
    harness.clock.setNow(new Date('2026-08-25T09:00:00.000Z'));
    const tomorrow = (await harness.dashboardService.load(harness.actor, {})).funFact;

    expect(evening).toBe(morning);
    expect(tomorrow).not.toBe(morning);
  });

  it('feeds the digest the same counts the widgets render', async () => {
    const harness = buildHarness();
    await harness.projectService.update(harness.actor, MINE, { targetDate: '2026-08-28' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Tonight', dueAt: '2026-08-24T21:00:00.000Z' });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Late', dueAt: '2026-08-20T21:00:00.000Z' });

    const result = await harness.dashboardService.load(harness.actor, {});
    const text = result.dailyDigest.lines.join('\n');

    expect(text).toContain('1 task scheduled today');
    expect(text).toContain('1 task is overdue');
    expect(text).toContain('Project project-mine');
  });

  it('keeps an in-progress task out of upcoming — every list on the screen is disjoint', async () => {
    const harness = buildHarness();
    const running = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Running soon', dueAt: '2026-08-27T17:00:00.000Z' });
    await harness.taskService.update(harness.actor, running.id, { status: 'in_progress' });

    const result = await harness.dashboardService.load(harness.actor, {});

    expect(titles(result.today.inProgress)).toEqual(['Running soon']);
    expect(result.upcoming.tasks).toEqual([]);
    // The digest states both counts, so an overlap here would describe one task twice.
    const text = result.dailyDigest.lines.join(NEWLINE);
    expect(text).toContain('1 task already in progress');
    expect(text).not.toContain('arrives in the next');
  });

  it('hides the work of an archived project everywhere, not just in Active Projects', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ghost', dueAt: '2026-08-20T17:00:00.000Z' });
    const finished = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ghost win' });
    await harness.taskService.complete(harness.actor, finished.id);
    await harness.projectService.archive(harness.actor, MINE);

    const result = await harness.dashboardService.load(harness.actor, {});

    expect(result.today.overdue).toEqual([]);
    expect(result.recentProgress.tasks).toEqual([]);
    expect(result.activeProjects).toEqual([]);
    expect(result.dailyDigest.lines.join(NEWLINE)).toContain('Nothing is overdue');
  });

  it('still shows the work of a paused project — an overdue task is overdue either way', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Parked but late', dueAt: '2026-08-20T17:00:00.000Z' });
    await harness.projectService.update(harness.actor, MINE, { status: 'on_hold' });

    const result = await harness.dashboardService.load(harness.actor, {});

    expect(titles(result.today.overdue)).toEqual(['Parked but late']);
    expect(result.activeProjects).toEqual([]);
  });

  it('spans exactly the requested number of days in both directions', async () => {
    const harness = buildHarness();
    // Seven days back including today is 2026-08-18; seven days forward is 2026-08-31.
    const edge = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Oldest kept' });
    harness.clock.setNow(new Date('2026-08-18T00:00:00.000Z'));
    await harness.taskService.complete(harness.actor, edge.id);
    const dropped = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Just too old' });
    harness.clock.setNow(new Date('2026-08-17T23:59:59.999Z'));
    await harness.taskService.complete(harness.actor, dropped.id);
    harness.clock.setNow(new Date(NOW));

    const result = await harness.dashboardService.load(harness.actor, {});

    expect(titles(result.recentProgress.tasks)).toEqual(['Oldest kept']);
    expect(result.recentProgress.sinceDate).toBe('2026-08-18');
  });

  it('treats a foreign actor as an empty workspace rather than an error', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Late', dueAt: '2026-08-21T17:00:00.000Z' });

    const result = await harness.dashboardService.load(harness.other, {});

    expect(result.activeProjects.map(({ id }) => id)).toEqual([THEIRS]);
    expect(result.today.overdue).toEqual([]);
  });
});

describe('DashboardService: §24’s Recent Agent Activity', () => {
  it('carries only agent events, newest first', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'A person did this' });
    const agent = agentActorFor(0, ['tasks.write']);
    await harness.taskService.create(agent, { projectId: MINE, title: 'An agent did this' });
    await harness.taskService.create(agent, { projectId: MINE, title: 'And this' });

    const dashboard = await harness.dashboardService.load(harness.actor, {});

    expect(dashboard.recentAgentActivity.map(({ actor, entityTitle }) => [actor, entityTitle])).toEqual([
      ['agent', 'And this'],
      ['agent', 'An agent did this'],
    ]);
  });

  it('is empty when no agent has done anything — a real state, not a missing one', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Only a person' });

    expect((await harness.dashboardService.load(harness.actor, {})).recentAgentActivity).toEqual([]);
  });

  /**
   * The cap is written out as a literal on purpose. Asserting against the imported constant
   * would prove only that *a* cap exists — change it to 100 and the test still passes.
   */
  it('caps the tile at 8 rows — a widget answers "lately", not "ever"', async () => {
    const harness = buildHarness();
    for (let index = 0; index < 11; index += 1) {
      await harness.taskService.create(agentActorFor(0, ['tasks.write']), { projectId: MINE, title: `Task ${index}` });
    }

    expect((await harness.dashboardService.load(harness.actor, {})).recentAgentActivity).toHaveLength(8);
    expect(RECENT_AGENT_ACTIVITY_LIMIT).toBe(8);
  });

  /**
   * The tile filters by actor *before* the limit. Filtering afterwards made it report
   * "no agent has done anything" whenever the newest events happened to be a person's —
   * a lying empty state, which is the one thing this slice's other decisions avoid.
   */
  it('finds agent work that a wall of newer user activity would otherwise bury', async () => {
    const harness = buildHarness();
    await harness.taskService.create(agentActorFor(0, ['tasks.write']), { projectId: MINE, title: 'By an agent' });
    for (let index = 0; index < 30; index += 1) {
      await harness.taskService.create(harness.actor, { projectId: MINE, title: `Person task ${index}` });
    }

    const { recentAgentActivity } = await harness.dashboardService.load(harness.actor, {});

    expect(recentAgentActivity.map(({ entityTitle }) => entityTitle)).toEqual(['By an agent']);
  });

  it('refuses an agent without workspace.read', async () => {
    const harness = buildHarness();

    await expect(harness.dashboardService.load(agentActorFor(0, ['tasks.read']), {})).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});
