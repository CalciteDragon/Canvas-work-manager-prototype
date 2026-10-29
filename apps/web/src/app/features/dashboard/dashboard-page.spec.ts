import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ActivityFeedEntrySchema, DashboardResultSchema, type DashboardResult, type DashboardWidget, type Identity } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { FakeWorkManagerGateway, dashboardWithoutDigest, emptyDashboard, fakeIdentityProvider } from '../../core/gateway/testing/fake-gateway';
import { testIdentity } from '../../core/gateway/testing/shell-test-providers';
import { IDENTITY_PROVIDER } from '../../core/identity/identity-provider';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { DashboardPage } from './dashboard-page';

const at = '2026-08-24T16:00:00.000Z';

const widget = (id: string, type: DashboardWidget['type'], overrides: Partial<DashboardWidget> = {}): DashboardWidget => ({
  id,
  type,
  position: 0,
  size: 'medium',
  config: {},
  hidden: false,
  ...overrides,
});

// Parsed, not cast: the branded ids are what stop a fixture the host could never produce
// from compiling, and this file is the one place a `DashboardResult` is written by hand.
const task = (id: string, title: string, overrides: Record<string, unknown> = {}) => ({
  id,
  projectId: 'project-1',
  projectName: 'Website launch',
  origin: { projectId: 'project-1', pageId: 'page-home', pageKind: 'home', sectionId: 'section-tasks', sectionName: 'Tasks', breadcrumb: [{ projectId: 'project-1', name: 'Website launch' }] },
  projectIcon: '🚀',
  title,
  status: 'todo',
  priority: 'high',
  overdue: false,
  ...overrides,
});

const populated = (): DashboardResult =>
  DashboardResultSchema.parse({
  ...emptyDashboard(),
  generatedAt: at,
  today: {
    date: '2026-08-24',
    overdue: [task('task-late', 'Run launch QA', { overdue: true, dueAt: '2026-08-21T17:00:00.000Z' })],
    dueToday: [task('task-today', 'Verify analytics', { dueAt: '2026-08-24T21:00:00.000Z' })],
    inProgress: [],
  },
  upcoming: { days: 7, throughDate: '2026-08-31', tasks: [task('task-soon', 'Replace air filter', { dueAt: '2026-08-27T02:00:00.000Z' })] },
  activeProjects: [
    { id: 'project-1', name: 'Website launch', breadcrumb: [], icon: '🚀', status: 'active', targetDate: '2026-08-28', openTasks: 2, completedTasks: 1, percentage: 33, daysToTarget: 4 },
  ],
  recentProgress: { days: 7, sinceDate: '2026-08-17', tasks: [task('task-done', 'Approve homepage copy', { status: 'done', completedAt: '2026-08-21T18:30:00.000Z' })] },
  dailyDigest: { lines: ['You have 1 task scheduled today.', '1 task is overdue.'], source: 'prototype', generatedAt: at },
  funFact: 'Context switching costs more time than the switch itself takes.',
  });

const render = async (...args: Parameters<typeof renderPage>) => (await renderPage(...args)).element;

const renderPage = async (
  widgets: DashboardWidget[],
  options: { dashboard?: DashboardResult; failWith?: GatewayError; identity?: Identity | GatewayError } = {},
) => {
  const identity = options.identity ?? (() => {
    const base = testIdentity();
    return { ...base, user: { ...base.user, preferences: { ...base.user.preferences, dashboardWidgets: widgets } } };
  })();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: WORK_MANAGER_GATEWAY,
        useValue: new FakeWorkManagerGateway({
          dashboard: options.dashboard ?? populated(),
          ...(options.failWith === undefined ? {} : { failWith: options.failWith }),
        }),
      },
      { provide: IDENTITY_PROVIDER, useValue: fakeIdentityProvider(identity) },
    ],
  });

  const fixture = TestBed.createComponent(DashboardPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, gateway: TestBed.inject(WORK_MANAGER_GATEWAY) as FakeWorkManagerGateway };
};

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; };

const everyWidget = (): DashboardWidget[] =>
  (['today', 'upcoming', 'active_projects', 'recent_progress', 'daily_digest', 'fun_fact', 'recent_agent_activity'] as const)
    .map((type, position) => widget(`w-${type}`, type, { position }));

describe('DashboardPage (§24, §25)', () => {
  it('renders one tile per visible widget, carrying its preset size', async () => {
    const element = await render([
      widget('w-today', 'today', { position: 0, size: 'wide' }),
      widget('w-fact', 'fun_fact', { position: 1, size: 'small' }),
    ]);

    const tiles = [...element.querySelectorAll('[data-dashboard-tile]')];
    expect(tiles.map((tile) => tile.getAttribute('data-widget-type'))).toEqual(['today', 'fun_fact']);
    expect(tiles.map((tile) => tile.getAttribute('data-widget-size'))).toEqual(['wide', 'small']);
    expect([...element.querySelectorAll('[data-widget-title]')].map((node) => node.textContent)).toEqual(['Today', 'Fun Fact']);
  });

  it('shows real work in the Today, Upcoming, Active Projects and Recent Progress widgets', async () => {
    const element = await render([
      widget('w-today', 'today', { position: 0 }),
      widget('w-upcoming', 'upcoming', { position: 1 }),
      widget('w-projects', 'active_projects', { position: 2 }),
      widget('w-recent', 'recent_progress', { position: 3 }),
    ]);
    const text = element.textContent ?? '';

    expect(text).toContain('Run launch QA');
    expect(text).toContain('Verify analytics');
    expect(text).toContain('Replace air filter');
    expect(text).toContain('Approve homepage copy');
    expect(element.querySelector('[data-widget-project]')?.textContent).toContain('Website launch');
    expect(element.querySelector('[data-widget-project] a')?.getAttribute('href')).toBe('/projects/project-1');
  });

  it('marks an overdue row so the day reads at a glance', async () => {
    const element = await render([widget('w-today', 'today')]);

    expect(element.querySelector('[data-widget-task]')?.classList.contains('widget-row--overdue')).toBe(true);
  });

  it('dates an overdue row and gives a still-due one only its time', async () => {
    // Found in the browser: "23:00" on a task that went overdue five days ago reads as
    // tonight, which is the opposite of what the row is trying to say.
    const element = await render([widget('w-today', 'today')]);
    const rows = [...element.querySelectorAll('[data-widget-task]')];

    expect(rows[0]?.textContent).toContain('2026-08-21');
    expect(rows[1]?.textContent).toContain('21:00');
  });

  it('renders the digest as separate lines and names the provider that composed it (§43)', async () => {
    const element = await render([widget('w-digest', 'daily_digest')]);

    expect([...element.querySelectorAll('[data-widget-digest-line]')].map((node) => node.textContent?.trim())).toEqual([
      'You have 1 task scheduled today.',
      '1 task is overdue.',
    ]);
    expect(element.querySelector('[data-widget-digest-source]')?.textContent).toContain('prototype AI provider');
  });

  it('gives each of the four list widgets an empty state rather than a blank tile', async () => {
    const element = await render(
      [
        widget('w-today', 'today', { position: 0 }),
        widget('w-upcoming', 'upcoming', { position: 1 }),
        widget('w-projects', 'active_projects', { position: 2 }),
        widget('w-recent', 'recent_progress', { position: 3 }),
      ],
      { dashboard: emptyDashboard() },
    );

    // Daily Digest and Fun Fact are deliberately absent from this list: both always have
    // content to show, so neither has — or needs — an empty branch.
    expect(element.querySelectorAll('[data-widget-empty]')).toHaveLength(4);
  });

  it('says so plainly for a widget type this slice does not build', async () => {
    const element = await render([widget('w-calendar', 'calendar')]);

    expect(element.querySelector('[data-widget-unavailable]')?.textContent).toContain('calendar widget is not built yet');
  });

  it('tells a persona with no visible widgets what it is looking at', async () => {
    const element = await render([widget('w-today', 'today', { hidden: true })]);

    expect(element.querySelector('[data-dashboard-empty]')).not.toBeNull();
    expect(element.querySelectorAll('[data-dashboard-tile]')).toHaveLength(0);
  });

  // Slice 78 (L4-002): one message, in product words, as the page's one alert; the host's
  // reason waits under Details.
  it('shows the failure instead of an empty dashboard when the host is unreachable', async () => {
    const element = await render([widget('w-today', 'today')], {
      failWith: new GatewayError('unreachable', 0, 'the prototype host is not running'),
    });

    const failure = element.querySelector('[data-dashboard-error]')!;
    expect(failure.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t reach your workspace, so Home didn’t load.');
    expect(failure.querySelector('[data-failure-sentence]')?.getAttribute('role')).toBe('alert');
    expect(failure.querySelector('details')?.textContent).toContain('not running');
    expect(element.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-dashboard-tile]')).toHaveLength(0);
    expect(element.querySelector('[data-dashboard-empty]')).toBeNull();
  });

  it('reads again on Try again, and shows the dashboard when the read answers', async () => {
    const { fixture, element, gateway } = await renderPage([widget('w-today', 'today')], {
      failWith: new GatewayError('internal_error', 500, 'boom'),
    });
    expect(element.querySelector('[data-dashboard-error] [data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t load Home.');

    gateway.options.failWith = undefined;
    element.querySelector<HTMLElement>('[data-dashboard-error] [data-recovery="try-again"]')!.click();
    await fixture.whenStable();

    expect(element.querySelector('[data-dashboard-error]')).toBeNull();
    expect(element.querySelectorAll('[data-dashboard-tile]')).toHaveLength(1);
  });
});

// Slice 78 (L4-022): the provider failing costs the digest, not Home.
describe('DashboardPage — a failed digest (§24, §43)', () => {
  it('renders the other six widgets and the digest’s failure, with Try again and no Details', async () => {
    const element = await render(everyWidget(), { dashboard: dashboardWithoutDigest() });

    expect(element.querySelectorAll('[data-dashboard-tile]')).toHaveLength(7);
    const digest = element.querySelector('[data-widget-type="daily_digest"]')!;
    expect(digest.querySelector('[data-widget-failure] [data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t write today’s digest.');
    expect(digest.querySelector('[data-widget-failure] [data-recovery="try-again"]')).not.toBeNull();
    expect(digest.querySelector('details')).toBeNull();
    expect(digest.querySelector('app-daily-digest-widget')).toBeNull();
    expect(element.querySelectorAll('[data-widget-failure]')).toHaveLength(1);
    expect(element.querySelector('[data-dashboard-error]')).toBeNull();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('re-reads quietly on the digest’s Try again, busy while it runs, keeping the other widgets', async () => {
    const { fixture, element, gateway } = await renderPage(everyWidget(), { dashboard: dashboardWithoutDigest() });
    const answer = deferred<DashboardResult>();
    vi.spyOn(gateway.dashboard, 'get').mockReturnValueOnce(answer.promise);

    element.querySelector<HTMLElement>('[data-widget-failure] [data-recovery="try-again"]')!.click();
    await fixture.whenStable();

    const failure = element.querySelector('[data-widget-failure]')!;
    expect(failure.getAttribute('aria-busy')).toBe('true');
    expect(failure.querySelector('[data-recovery="try-again"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(element.querySelectorAll('[data-dashboard-tile]')).toHaveLength(7);
    expect(element.querySelector('[data-dashboard-loading]')).toBeNull();

    answer.resolve(populated());
    // The quiet re-read is not a pending task, so let its promise chain settle first.
    await new Promise((settled) => setTimeout(settled));
    await fixture.whenStable();

    expect(element.querySelector('[data-widget-failure]')).toBeNull();
    expect(element.querySelectorAll('[data-widget-digest-line]')).toHaveLength(2);
    expect(element.querySelectorAll('[data-dashboard-tile]')).toHaveLength(7);
  });

  it('ends visibly when the digest’s retry fails again', async () => {
    const { fixture, element } = await renderPage(everyWidget(), { dashboard: dashboardWithoutDigest() });

    element.querySelector<HTMLElement>('[data-widget-failure] [data-recovery="try-again"]')!.click();
    await fixture.whenStable();

    const failure = element.querySelector('[data-widget-failure]')!;
    expect(failure.getAttribute('aria-busy')).toBeNull();
    expect(failure.querySelector('[data-recovery="try-again"]')?.getAttribute('aria-disabled')).toBeNull();
  });
});

describe('DashboardPage — Recent Agent Activity (§24, §57)', () => {
  const agentEntry = ActivityFeedEntrySchema.parse({
    id: 'activity-1',
    workspaceId: 'workspace-demo',
    actor: 'agent',
    actorAgentConnectionId: 'agent-claude',
    action: 'task.completed',
    entityType: 'task',
    entityId: 'task-1',
    projectId: 'project-1',
    context: {
      targetKind: 'task',
      targetId: 'task-1',
      targetLabel: 'Configure deployment',
      projectId: 'project-1',
      rootProjectId: 'project-1',
    },
    summary: 'Completed "Configure deployment"',
    createdAt: '2026-08-24T15:32:00.000Z',
    actorName: 'Claude',
    entityTitle: 'Configure deployment',
    projectName: 'Website launch',
  });

  it('renders what the agents did, attributed to the connection by name', async () => {
    const element = await render([widget('w-agents', 'recent_agent_activity', { position: 0, size: 'wide' })], {
      dashboard: DashboardResultSchema.parse({ ...populated(), recentAgentActivity: [agentEntry] }),
    });

    expect(element.querySelector('[data-widget-title]')?.textContent).toBe('Recent Agent Activity');
    expect(element.querySelector('[data-activity-actor]')?.textContent?.trim()).toBe('Claude');
    expect(element.querySelector('[data-activity-entry]')?.getAttribute('data-actor')).toBe('agent');
  });

  it('has an empty state, because a workspace no agent has touched is the ordinary case', async () => {
    const element = await render([widget('w-agents', 'recent_agent_activity', { position: 0 })], {
      dashboard: DashboardResultSchema.parse({ ...populated(), recentAgentActivity: [] }),
    });

    expect(element.querySelector('[data-activity-empty]')?.textContent?.trim()).toBe(
      'No agent has done anything yet.',
    );
  });
});


it('opens dashboard tasks at their canonical owner section and hides decorative emoji (§24)', async () => {
 const element=await render([widget('today','today'),widget('upcoming','upcoming'),widget('recent','recent_progress')]);
 const rows=element.querySelectorAll('[data-widget-task]'); expect(rows.length).toBe(4);
 for(const row of rows) {
  expect(row.querySelector('a.object-row__title')?.getAttribute('href')).toBe('/projects/project-1/pages/home#section-section-tasks');
  expect(row.querySelector('[data-project-icon]')?.getAttribute('aria-hidden')).toBe('true');
 }
 expect(rows[0]?.classList.contains('object-row--overdue')).toBe(true);
});
