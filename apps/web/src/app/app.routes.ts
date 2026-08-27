import { Routes } from '@angular/router';
import { CalendarPage } from './features/calendar/calendar-page';
import { DashboardPage } from './features/dashboard/dashboard-page';
import { ProjectPage } from './features/projects/project-page';
import { SearchPage } from './features/search/search-page';
import { AgentConnectionsPage } from './features/settings/agents/agent-connections-page';
import { SettingsPage } from './features/settings/settings-page';
import { DesignLabPage } from './prototype/design-lab/design-lab-page';
import { StateInspectorPage } from './prototype/dev-panel/state-inspector-page';
import { NotFoundPage } from './shared/components/placeholder-page/not-found-page';

/**
 * §68's route map. The routes are eagerly loaded on purpose: the prototype optimizes for
 * time to change an idea, not for bundle size (§3.1), and lazy boundaries are one more
 * thing to move when a feature does.
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
  { path: 'prototype/design', component: DesignLabPage },
  { path: 'prototype/state', component: StateInspectorPage },
  { path: '**', component: NotFoundPage },
];
