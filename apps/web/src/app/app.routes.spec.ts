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
import { ProjectWorkspaceShell } from './features/projects/project-workspace-shell';
import { SearchPage } from './features/search/search-page';
import { AgentConnectionsPage } from './features/settings/agents/agent-connections-page';
import { ArchivedProjectsPage } from './features/settings/archived-projects/archived-projects-page';
import { SettingsPage } from './features/settings/settings-page';
import { DesignLabPage } from './prototype/design-lab/design-lab-page';
import { NavigationAlternativesPage } from './prototype/navigation-alternatives/navigation-alternatives-page';
import { StateInspectorPage } from './prototype/dev-panel/state-inspector-page';
import { NotFoundPage } from './shared/components/placeholder-page/not-found-page';
import { routes } from './app.routes';

const harness = async () => {
  TestBed.configureTestingModule({
    providers: [
      // `withComponentInputBinding()` matches `app.config.ts`. Without it
      // `ProjectWorkspaceShell`'s required `projectId` route input is never bound, and the
      // shell throws NG0950 on creation — a failure of the harness, not of the route map.
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
    ['/projects/project-1', ProjectWorkspaceShell],
    // §68's canonical root page route. Declared before the shorter one, or
    // `projects/:projectId` would match it and swallow the page segment.
    ['/projects/project-1/pages/home', ProjectWorkspaceShell],
    // The shell decides what an unknown kind means, not the router — §68 asks for a fallback
    // with an explanation, which a 404 route could not give.
    ['/projects/project-1/pages/nonsense', ProjectWorkspaceShell],
    ['/calendar', CalendarPage],
    ['/search', SearchPage],
    ['/settings', SettingsPage],
    ['/settings/agents', AgentConnectionsPage],
    ['/settings/archived-projects', ArchivedProjectsPage],
    ['/prototype/design', DesignLabPage],
    ['/prototype/state', StateInspectorPage],
    // Slice 81's disposable specimens (R1), deleted at its step 3.
    ['/prototype/navigation/a?at=/app', NavigationAlternativesPage],
  ])('resolves %s', async (path, expected) => {
    const component = await (await harness()).navigateByUrl(path);

    expect(component).toBeInstanceOf(expected);
  });

  it('loads only the rarely-opened routes lazily', () => {
    // Q8 (a) of Slice 79: Calendar and Settings › Agents joined the two `prototype/*` routes
    // behind `loadComponent` to hold the initial bundle ceiling. Q1 (a) of Slice 80 added Settings ›
    // Archived projects, a recovery route opened rarely. Every other feature route stays eager, so
    // the `resolves` cases above prove the lazy ones still land on their pages.
    const lazy = routes.filter((route) => route.loadComponent).map((route) => route.path);
    const eager = routes.filter((route) => route.component).map((route) => route.path);

    expect(lazy).toEqual(['calendar', 'settings/agents', 'settings/archived-projects', 'prototype/design', 'prototype/state', 'prototype/navigation/:option']);
    expect(eager).toEqual([
      'app',
      'projects/:projectId/pages/:pageKind',
      'projects/:projectId',
      'search',
      'settings',
      '**',
    ]);
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
