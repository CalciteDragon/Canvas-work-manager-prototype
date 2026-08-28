import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { DashboardResultSchema, type DashboardResult, type DashboardWidget, type Identity } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { FakeWorkManagerGateway, emptyDashboard, fakeIdentityProvider } from '../../core/gateway/testing/fake-gateway';
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
    { id: 'project-1', name: 'Website launch', icon: '🚀', status: 'active', targetDate: '2026-08-28', openTasks: 2, completedTasks: 1, percentage: 33, daysToTarget: 4 },
  ],
  recentProgress: { days: 7, sinceDate: '2026-08-17', tasks: [task('task-done', 'Approve homepage copy', { status: 'done', completedAt: '2026-08-21T18:30:00.000Z' })] },
  dailyDigest: { title: 'Daily digest', lines: ['You have 1 task scheduled today.', '1 task is overdue.'], source: 'prototype', generatedAt: at },
  funFact: 'Context switching costs more time than the switch itself takes.',
  });

const render = async (
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
  return fixture.nativeElement as HTMLElement;
};

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

  it('gives every widget an empty state rather than a blank tile', async () => {
    const element = await render(
      [
        widget('w-today', 'today', { position: 0 }),
        widget('w-upcoming', 'upcoming', { position: 1 }),
        widget('w-projects', 'active_projects', { position: 2 }),
        widget('w-recent', 'recent_progress', { position: 3 }),
      ],
      { dashboard: emptyDashboard() },
    );

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

  it('shows the failure instead of an empty dashboard when the host is unreachable', async () => {
    const element = await render([widget('w-today', 'today')], {
      failWith: new GatewayError('unreachable', 0, 'the prototype host is not running'),
    });

    expect(element.querySelector('[data-dashboard-error]')?.textContent).toContain('not running');
    expect(element.querySelectorAll('[data-dashboard-tile]')).toHaveLength(0);
  });
});
