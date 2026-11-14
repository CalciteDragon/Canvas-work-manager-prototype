import { Routes } from '@angular/router';
import { DashboardPage } from './features/dashboard/dashboard-page';
import { ProjectWorkspaceShell } from './features/projects/project-workspace-shell';
import { NotFoundPage } from './shared/components/placeholder-page/not-found-page';

/**
 * §68’s route map. Most feature routes are eagerly loaded on purpose: the prototype
 * optimizes for time to change an idea, not for bundle size (§3.1), and lazy boundaries are
 * one more thing to move when a feature does.
 *
 * **The `prototype/*` routes are the exception**, because they are development tooling
 * that most sessions never open and the Design Lab's catalogue is the largest thing this
 * slice adds. `App` mounts the development-panel shell globally so §46's chord reaches
 * every route; only its controls load on opening, through a deferred block inside the
 * dialog. The same controls are shared with the lazy state inspector. The Design Lab
 * still reuses components eager through the feature routes.
 *
 * **Calendar and Settings › Agents are lazy too** (Slice 79, Q8 (a)): they are rarely opened,
 * and loading them on demand holds the initial bundle under its 1,150 kB ceiling
 * (`docs/decisions/2026-08-initial-bundle-budget.md`) rather than raising it. **Settings ›
 * Archived projects joined them** (Slice 80, Q1 (a)), a recovery route opened rarely, to pay for
 * the cascading archive. **Settings and Search followed** (Slice 81, Q12 (a), pre-approved), to pay
 * for the one navigation tree's interaction. Every other feature route stays eager. `app.config.ts`
 * prefetches every lazy route once the first navigation settles, so a first click does not wait
 * (`docs/decisions/2026-11-on-demand-loading-and-prefetch.md`).
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
  {
    path: 'calendar',
    loadComponent: () => import('./features/calendar/calendar-page').then((m) => m.CalendarPage),
  },
  { path: 'search', loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage) },
  {
    path: 'settings/agents',
    loadComponent: () => import('./features/settings/agents/agent-connections-page').then((m) => m.AgentConnectionsPage),
  },
  {
    path: 'settings/archived-projects',
    loadComponent: () => import('./features/settings/archived-projects/archived-projects-page').then((m) => m.ArchivedProjectsPage),
  },
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
