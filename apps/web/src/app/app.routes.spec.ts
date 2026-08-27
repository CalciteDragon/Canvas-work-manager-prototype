import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
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
  TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
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
});
