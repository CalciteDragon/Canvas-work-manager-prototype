import { Routes } from '@angular/router';
import { CalendarPage } from './features/calendar/calendar-page';
import { DashboardPage } from './features/dashboard/dashboard-page';
import { ProjectWorkspaceShell } from './features/projects/project-workspace-shell';
import { SearchPage } from './features/search/search-page';
import { AgentConnectionsPage } from './features/settings/agents/agent-connections-page';
import { ArchivedProjectsPage } from './features/settings/archived-projects/archived-projects-page';
import { SettingsPage } from './features/settings/settings-page';
import { NotFoundPage } from './shared/components/placeholder-page/not-found-page';

/**
 * §68's route map. The feature routes are eagerly loaded on purpose: the prototype
 * optimizes for time to change an idea, not for bundle size (§3.1), and lazy boundaries are
 * one more thing to move when a feature does.
 *
 * **The two `prototype/*` routes are the exception**, because they are development tooling
 * that most sessions never open and the Design Lab's catalogue is the largest thing this
 * slice adds. `App` mounts the development-panel shell globally so §46's chord reaches
 * every route; only its controls load on opening, through a deferred block inside the
 * dialog. The same controls are shared with the lazy state inspector. The Design Lab
 * still reuses components eager through the feature routes.
 */
export const routes: Routes = [
  // `pathMatch: 'full'` is not decoration — without it this redirect swallows every URL.
  { path: '', pathMatch: 'full', redirectTo: '/app' },
  { path: 'app', component: DashboardPage },
  // §68's two project routes, in this order: the longer path must be declared first, or
  // `projects/:projectId` matches `projects/x/pages/home` and swallows the page.
  {
    path: 'projects/:projectId/pages/:pageKind',
    component: ProjectWorkspaceShell,
  },
  { path: 'projects/:projectId', component: ProjectWorkspaceShell },
  { path: 'calendar', component: CalendarPage },
  { path: 'search', component: SearchPage },
  { path: 'settings', component: SettingsPage },
  { path: 'settings/agents', component: AgentConnectionsPage },
  { path: 'settings/archived-projects', component: ArchivedProjectsPage },
  {
    path: 'prototype/design',
    loadComponent: () => import('./prototype/design-lab/design-lab-page').then((m) => m.DesignLabPage),
  },
  {
    path: 'prototype/state',
    loadComponent: () => import('./prototype/dev-panel/state-inspector-page').then((m) => m.StateInspectorPage),
  },
  { path: '**', component: NotFoundPage },
];
