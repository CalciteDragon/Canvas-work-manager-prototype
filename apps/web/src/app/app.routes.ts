import { Routes } from '@angular/router';
import { CalendarPage } from './features/calendar/calendar-page';
import { DashboardPage } from './features/dashboard/dashboard-page';
import { ProjectPage } from './features/projects/project-page';
import { SearchPage } from './features/search/search-page';
import { AgentConnectionsPage } from './features/settings/agents/agent-connections-page';
import { SettingsPage } from './features/settings/settings-page';
import { NotFoundPage } from './shared/components/placeholder-page/not-found-page';

/**
 * §68's route map. The feature routes are eagerly loaded on purpose: the prototype
 * optimizes for time to change an idea, not for bundle size (§3.1), and lazy boundaries are
 * one more thing to move when a feature does.
 *
 * **The two `prototype/*` routes are the exception**, because they are development tooling
 * that most sessions never open and the Design Lab's catalogue is the largest thing this
 * slice adds. The honest limit: it moves less than it looks like. `App` mounts
 * `<app-dev-panel />` globally so §46's chord reaches every route, and `DevPanel` imports
 * the same `DevPanelControls` that `StateInspectorPage` does — so the panel, its controls,
 * its store and the layout control stay eager whatever these routes do, and the Design
 * Lab's live panels reuse components already eager through the feature routes. Lazy-loading
 * the development panel itself is the next lever, and it would reopen a Slice 12 decision.
 */
export const routes: Routes = [
  // `pathMatch: 'full'` is not decoration — without it this redirect swallows every URL.
  { path: '', pathMatch: 'full', redirectTo: '/app' },
  { path: 'app', component: DashboardPage },
  { path: 'projects/:projectId', component: ProjectPage },
  { path: 'calendar', component: CalendarPage },
  { path: 'search', component: SearchPage },
  { path: 'settings', component: SettingsPage },
  { path: 'settings/agents', component: AgentConnectionsPage },
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
