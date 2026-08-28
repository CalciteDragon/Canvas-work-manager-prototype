import type { Type } from '@angular/core';
import type { DashboardQuery, DashboardWidgetType } from '@cwm/contracts';
import { ActiveProjectsWidget } from './active-projects/active-projects-widget';
import { DailyDigestWidget } from './daily-digest/daily-digest-widget';
import { FunFactWidget } from './fun-fact/fun-fact-widget';
import { RecentProgressWidget, recentProgressWidgetQuery } from './recent-progress/recent-progress-widget';
import { TodayWidget } from './today/today-widget';
import { UpcomingWidget, upcomingWidgetQuery } from './upcoming/upcoming-widget';
import type { DashboardWidgetComponent } from './widget-contract';

/**
 * The dashboard's answer to §29's section registry. **Adding a widget is this file's only
 * line of change** plus the widget's own folder.
 *
 * `queryFrom` is what keeps §25's opaque `config` opaque outside the widget that owns it:
 * the store merges whatever each visible widget asks for, and never learns that "days"
 * means two different query keys.
 */
export interface DashboardWidgetDefinition {
  type: DashboardWidgetType;
  displayName: string;
  icon: string;
  component: Type<DashboardWidgetComponent>;
  queryFrom?: (config: unknown) => Partial<DashboardQuery>;
}

/**
 * §24 names nine widgets; Slice 11 builds six. `calendar` waits for Slice 18,
 * `recent_agent_activity` for Slice 13, and `work_summary` for the AI summary work in
 * Slice 24 — their types exist in the contract, so a persona can already carry one and the
 * host renders the documented fallback rather than pretending the tile exists.
 */
export const DASHBOARD_WIDGET_REGISTRY: readonly DashboardWidgetDefinition[] = [
  { type: 'today', displayName: 'Today', icon: '📌', component: TodayWidget },
  { type: 'upcoming', displayName: 'Upcoming', icon: '📅', component: UpcomingWidget, queryFrom: upcomingWidgetQuery },
  { type: 'active_projects', displayName: 'Active Projects', icon: '🗂️', component: ActiveProjectsWidget },
  { type: 'recent_progress', displayName: 'Recent Progress', icon: '✅', component: RecentProgressWidget, queryFrom: recentProgressWidgetQuery },
  { type: 'daily_digest', displayName: 'Daily Digest', icon: '🤖', component: DailyDigestWidget },
  { type: 'fun_fact', displayName: 'Fun Fact', icon: '💡', component: FunFactWidget },
];

/** `undefined` for a type nothing registers — a real state, not a defensive one. */
export const widgetDefinitionFor = (type: DashboardWidgetType): DashboardWidgetDefinition | undefined =>
  DASHBOARD_WIDGET_REGISTRY.find((definition) => definition.type === type);
