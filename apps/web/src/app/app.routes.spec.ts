import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { WORK_MANAGER_GATEWAY } from './core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway, fakeIdentityProvider } from './core/gateway/testing/fake-gateway';
import { testIdentity } from './core/gateway/testing/shell-test-providers';
import { IDENTITY_PROVIDER } from './core/identity/identity-provider';
import { PROTOTYPE_CONTROL } from './prototype/control/prototype-control';
import { FakePrototypeControl } from './prototype/control/testing/fake-prototype-control';
import { CalendarPage } from './features/calendar/calendar-page';
import { DashboardPage } from './features/dashboard/dashboard-page';
import { ProjectPage } from './features/projects/project-page';
import { SearchPage } from './features/search/search-page';
import { AgentConnectionsPage } from './features/settings/agents/agent-connections-page';
import { SettingsPage } from './features/settings/settings-page';
import { DesignLabPage } from './prototype/design-lab/design-lab-page';
import { StateInspectorPage } from './prototype/dev-panel/state-inspector-page';
import { NotFoundPage } from './shared/components/placeholder-page/not-found-page';
import { routes } from './app.routes';

const harness = async () => {
  TestBed.configureTestingModule({
    providers: [
      // `withComponentInputBinding()` matches `app.config.ts`. Without it `ProjectPage`'s
      // required `projectId` route input is never bound, and the page throws NG0950 on
      // creation — a failure of the harness, not of the route map.
      provideRouter(routes, withComponentInputBinding()),
      { provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway() },
      // `DashboardPage` reads the persona's widget list from the identity provider (§25).
      { provide: IDENTITY_PROVIDER, useValue: fakeIdentityProvider(testIdentity()) },
      // §68's /prototype/state renders §46's controls, which talk to the host's own routes.
      { provide: PROTOTYPE_CONTROL, useValue: new FakePrototypeControl() },
    ],
  });
  return RouterTestingHarness.create();
};

describe('the §68 route map', () => {
  it.each([
    ['/app', DashboardPage],
    ['/projects/project-1', ProjectPage],
    ['/calendar', CalendarPage],
    ['/search', SearchPage],
    ['/settings', SettingsPage],
    ['/settings/agents', AgentConnectionsPage],
    ['/prototype/design', DesignLabPage],
    ['/prototype/state', StateInspectorPage],
  ])('resolves %s', async (path, expected) => {
    const component = await (await harness()).navigateByUrl(path);

    expect(component).toBeInstanceOf(expected);
  });

  it('redirects / to the dashboard without swallowing every other path', async () => {
    const routerHarness = await harness();

    await routerHarness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/app');

    expect(await routerHarness.navigateByUrl('/calendar')).toBeInstanceOf(CalendarPage);
  });

  it('answers an unknown path with a page rather than a blank screen', async () => {
    expect(await (await harness()).navigateByUrl('/nowhere')).toBeInstanceOf(NotFoundPage);
  });

  it('no longer serves Slice 7’s temporary /tasks workspace', async () => {
    // §68 has no `/tasks`. Project task lists are sections on a project canvas now, so the
    // route falls through to the catch-all rather than resolving to a page.
    expect(await (await harness()).navigateByUrl('/tasks')).toBeInstanceOf(NotFoundPage);
  });
});
