import { TestBed } from '@angular/core/testing';
import type { DashboardWidget, Identity } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { FakeWorkManagerGateway, fakeIdentityProvider } from '../../core/gateway/testing/fake-gateway';
import { testIdentity } from '../../core/gateway/testing/shell-test-providers';
import { IDENTITY_PROVIDER } from '../../core/identity/identity-provider';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
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
  TestBed.configureTestingModule({
    providers: [
      DashboardStore,
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: IDENTITY_PROVIDER, useValue: fakeIdentityProvider(options.identity ?? identityWith(widgets)) },
    ],
  });
  return { store: TestBed.inject(DashboardStore), gateway };
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

  it('survives two overlapping loads without corrupting its state', async () => {
    const { store } = setup([widget({ id: 'w-today', type: 'today' })]);

    const first = store.load();
    const second = store.load();
    await Promise.all([first, second]);

    expect(store.widgets().map(({ id }) => id)).toEqual(['w-today']);
    expect(store.loading()).toBe(false);
  });
});
