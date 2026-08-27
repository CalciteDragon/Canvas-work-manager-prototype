import type { EnvironmentProviders, Provider } from '@angular/core';
import { provideRouter } from '@angular/router';
import { IdentitySchema, type Identity } from '@cwm/contracts';
import { IDENTITY_PROVIDER } from '../../identity/identity-provider';
import { WORK_MANAGER_GATEWAY } from '../work-manager-gateway';
import type { GatewayError } from '../gateway-error';
import { FakeWorkManagerGateway, fakeIdentityProvider, type FakeGatewayOptions } from './fake-gateway';

const AT = '2026-08-01T16:00:00.000Z';

/**
 * A persona to render a shell around. Overridable so a spec can pick the light theme.
 *
 * Parsed rather than cast: `as unknown as Identity` would defeat the branded ids and let
 * every shell spec keep compiling against a fixture the real host could never produce.
 * This is the one place in `apps/web` where a contracts shape is written out by hand, so
 * it is the one place that has to fail loudly when the contract moves.
 */
export const testIdentity = (theme: 'dark' | 'light' = 'dark'): Identity =>
  IdentitySchema.parse({
    user: {
      id: 'user-demo',
      name: 'Demo User',
      avatar: '🧭',
      workspaceId: 'workspace-demo',
      preferences: { theme, dashboardWidgets: [] },
      createdAt: AT,
    },
    workspace: { id: 'workspace-demo', name: 'Demo User Workspace', ownerUserId: 'user-demo', createdAt: AT },
  });

/**
 * What every shell-level spec needs, in one place so `app.spec.ts`, `app-shell.spec.ts`
 * and `sidebar.spec.ts` cannot drift into three half-configured TestBeds.
 *
 * `provideRouter([])` is not optional: `RouterOutlet` and `RouterLink` inject `Router`,
 * `ActivatedRoute`, `ChildrenOutletContexts` and `LocationStrategy`, and without them the
 * fixture throws at creation and takes every test in the file with it. An empty route
 * array is enough — `RouterLink` renders an `href` from `serializeUrl` and never checks
 * that the target resolves.
 */
export const shellTestProviders = (
  options: FakeGatewayOptions & { identity?: Identity | GatewayError } = {},
): Array<Provider | EnvironmentProviders> => {
  const { identity = testIdentity(), ...gatewayOptions } = options;
  return [
    provideRouter([]),
    { provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway(gatewayOptions) },
    { provide: IDENTITY_PROVIDER, useValue: fakeIdentityProvider(identity) },
  ];
};
