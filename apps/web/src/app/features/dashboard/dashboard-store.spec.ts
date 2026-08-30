import { TestBed } from '@angular/core/testing';
import type { DashboardResult, DashboardWidget, Identity } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { FakeWorkManagerGateway, emptyDashboard, fakeIdentityProvider } from '../../core/gateway/testing/fake-gateway';
import { testIdentity } from '../../core/gateway/testing/shell-test-providers';
import { IDENTITY_PROVIDER } from '../../core/identity/identity-provider';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../core/live/live-updates';
import { FakeLiveUpdates } from '../../core/live/testing/fake-live-updates';
import { DashboardStore } from './dashboard-store';

const widget = (overrides: Partial<DashboardWidget> & Pick<DashboardWidget, 'id' | 'type'>): DashboardWidget => ({
  position: 0,
  size: 'medium',
  config: {},
  hidden: false,
  ...overrides,
});

const identityWith = (widgets: DashboardWidget[]): Identity => {
  const identity = testIdentity();
  return { ...identity, user: { ...identity.user, preferences: { ...identity.user.preferences, dashboardWidgets: widgets } } };
};

const setup = (widgets: DashboardWidget[], options: { failWith?: GatewayError; identity?: Identity | GatewayError } = {}) => {
  const gateway = new FakeWorkManagerGateway(options.failWith === undefined ? {} : { failWith: options.failWith });
  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({
    providers: [
      DashboardStore,
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: IDENTITY_PROVIDER, useValue: fakeIdentityProvider(options.identity ?? identityWith(widgets)) },
      { provide: LIVE_UPDATES, useValue: live },
    ],
  });
  return { store: TestBed.inject(DashboardStore), gateway, live };
};

describe('DashboardStore', () => {
  it('shows visible widgets in position order and drops hidden ones (§25)', async () => {
    const { store } = setup([
      widget({ id: 'w-digest', type: 'daily_digest', position: 2 }),
      widget({ id: 'w-hidden', type: 'today', position: 0, hidden: true }),
      widget({ id: 'w-projects', type: 'active_projects', position: 1 }),
    ]);

    await store.load();

    expect(store.widgets().map(({ id }) => id)).toEqual(['w-projects', 'w-digest']);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('lets each widget contribute its own configured range, and nothing else', async () => {
    const { store, gateway } = setup([
      widget({ id: 'w-upcoming', type: 'upcoming', position: 0, config: { days: 14 } }),
      widget({ id: 'w-recent', type: 'recent_progress', position: 1, config: { days: 30 } }),
    ]);

    await store.load();

    expect(gateway.argumentTo('dashboard.get')).toEqual({ upcomingDays: 14, recentDays: 30 });
  });

  it('asks for nothing when no widget configures a range, so the contract defaults apply', async () => {
    const { store, gateway } = setup([widget({ id: 'w-today', type: 'today' })]);

    await store.load();

    expect(gateway.argumentTo('dashboard.get')).toEqual({});
  });

  it('ignores an unreadable widget config rather than blanking the dashboard', async () => {
    const { store, gateway } = setup([widget({ id: 'w-upcoming', type: 'upcoming', config: { days: 'soon' } })]);

    await store.load();

    expect(gateway.argumentTo('dashboard.get')).toEqual({});
    expect(store.error()).toBeNull();
  });

  it('does not let a hidden widget widen the range for the visible ones', async () => {
    const { store, gateway } = setup([
      widget({ id: 'w-upcoming', type: 'upcoming', position: 0, config: { days: 60 }, hidden: true }),
      widget({ id: 'w-today', type: 'today', position: 1 }),
    ]);

    await store.load();

    expect(gateway.argumentTo('dashboard.get')).toEqual({});
  });

  it('pairs each widget with its registry definition and leaves unbuilt types unmatched', async () => {
    const { store } = setup([
      widget({ id: 'w-today', type: 'today', position: 0 }),
      widget({ id: 'w-calendar', type: 'calendar', position: 1 }),
    ]);

    await store.load();

    expect(store.tiles().map(({ definition }) => definition?.displayName)).toEqual(['Today', undefined]);
  });

  it('surfaces a gateway failure and keeps no stale content behind it', async () => {
    const { store } = setup([widget({ id: 'w-today', type: 'today' })], {
      failWith: new GatewayError('unreachable', 0, 'the prototype host is not running'),
    });

    await store.load();

    expect(store.error()).toContain('not running');
    expect(store.dashboard()).toBeNull();
    expect(store.widgets()).toEqual([]);
    expect(store.loading()).toBe(false);
  });

  it('surfaces an identity failure the same way — the layout is half the dashboard', async () => {
    const { store } = setup([], { identity: new GatewayError('unreachable', 0, 'no identity') });

    await store.load();

    expect(store.error()).toContain('no identity');
    expect(store.dashboard()).toBeNull();
  });

  it('ignores a superseded load whose answer arrives last', async () => {
    // `FakeWorkManagerGateway` resolves immediately, so it cannot express "the first call
    // answers second" — the interleaving the generation guard exists for. This gateway
    // hands back promises the spec settles by hand, in the order it chooses.
    const pending: Array<(result: DashboardResult) => void> = [];
    const answers: DashboardResult[] = [
      { ...emptyDashboard(), funFact: 'stale answer' },
      { ...emptyDashboard(), funFact: 'fresh answer' },
    ];
    const gateway = {
      dashboard: { get: () => new Promise<DashboardResult>((resolve) => pending.push(resolve)) },
    } as unknown as WorkManagerGateway;

    TestBed.configureTestingModule({
      providers: [
        DashboardStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        {
          provide: IDENTITY_PROVIDER,
          useValue: fakeIdentityProvider(identityWith([widget({ id: 'w-fact', type: 'fun_fact' })])),
        },
      ],
    });
    const store = TestBed.inject(DashboardStore);

    const first = store.load();
    const second = store.load();
    // Let both reach the gateway before either answers.
    await Promise.resolve();
    await Promise.resolve();
    expect(pending).toHaveLength(2);

    pending[1]!(answers[1]!);
    await second;
    pending[0]!(answers[0]!);
    await first;

    expect(store.dashboard()?.funFact).toBe('fresh answer');
    expect(store.loading()).toBe(false);
  });
});

describe('DashboardStore and live updates (§62)', () => {
  const dashboardReads = (gateway: FakeWorkManagerGateway) =>
    gateway.calls.filter(({ method }) => method === 'dashboard.get').length;

  const settleLive = async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  };

  it('quietly reloads when a task changes anywhere in the workspace', async () => {
    const { store, gateway, live } = setup([widget({ id: 'w-today', type: 'today' })]);
    await store.load();
    const before = dashboardReads(gateway);

    live.emit({ type: 'task.completed', entityType: 'task', entityId: 'task-1' });
    await settleLive();

    expect(dashboardReads(gateway)).toBe(before + 1);
    // Six tiles blanking to skeletons on every agent write is worse than a second of stale.
    expect(store.loading()).toBe(false);
  });

  it('ignores an agent connection event', async () => {
    const { store, gateway, live } = setup([widget({ id: 'w-today', type: 'today' })]);
    await store.load();
    const before = dashboardReads(gateway);

    // Nothing on §24's dashboard renders a connection; §53's page owns those.
    live.emit({ type: 'agent_connection.permissions_changed', entityType: 'agent_connection', entityId: 'agent-claude' });
    await settleLive();

    expect(dashboardReads(gateway)).toBe(before);
  });

  it('keeps the rendered dashboard when a live reload fails', async () => {
    const { store, live } = setup([widget({ id: 'w-today', type: 'today' })]);
    await store.load();
    const rendered = store.dashboard();

    live.emit({ type: 'task.completed', entityType: 'task', entityId: 'task-1' });
    await settleLive();

    expect(store.dashboard()).toEqual(rendered);
    expect(store.error()).toBeNull();
  });
});

describe('DashboardStore — a live frame during the first load (§62)', () => {
  const settleLive = async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  };

  it('does not strand the dashboard on a skeleton', async () => {
    const { store, live } = setup([widget({ id: 'w-today', type: 'today' })]);

    // Both reads claim a generation, so the load abandons its own answer on the check. If
    // only the loud path could clear `loading`, the page would sit on a skeleton forever
    // with its data already rendered underneath.
    const loading = store.load();
    live.emit({ type: 'task.completed', entityType: 'task', entityId: 'task-1' });
    await loading;
    await settleLive();

    expect(store.loading()).toBe(false);
    expect(store.dashboard()).not.toBeNull();
  });
});
