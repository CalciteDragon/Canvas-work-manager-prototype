import { DashboardWidgetTypeSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { DASHBOARD_WIDGET_REGISTRY, widgetDefinitionFor } from './registry';

describe('DASHBOARD_WIDGET_REGISTRY (§24, §25)', () => {
  it('ships the six widgets Slice 11 builds', () => {
    expect(DASHBOARD_WIDGET_REGISTRY.map(({ type }) => type)).toEqual([
      'today',
      'upcoming',
      'active_projects',
      'recent_progress',
      'daily_digest',
      'fun_fact',
    ]);
  });

  it('registers only types the contract knows, each exactly once', () => {
    const types = DASHBOARD_WIDGET_REGISTRY.map(({ type }) => type);

    expect(new Set(types).size).toBe(types.length);
    for (const type of types) expect(DashboardWidgetTypeSchema.options).toContain(type);
  });

  it('gives every definition a name, an icon, and a component', () => {
    for (const definition of DASHBOARD_WIDGET_REGISTRY) {
      expect(definition.displayName.length).toBeGreaterThan(0);
      expect(definition.icon.length).toBeGreaterThan(0);
      expect(typeof definition.component).toBe('function');
    }
  });

  it('lets only the range-configurable widgets contribute to the query (§24)', () => {
    expect(widgetDefinitionFor('upcoming')?.queryFrom?.({ days: 14 })).toEqual({ upcomingDays: 14 });
    expect(widgetDefinitionFor('recent_progress')?.queryFrom?.({ days: 30 })).toEqual({ recentDays: 30 });
    expect(widgetDefinitionFor('upcoming')?.queryFrom?.({ days: 900 })).toEqual({});
    expect(widgetDefinitionFor('today')?.queryFrom).toBeUndefined();
  });

  it('answers undefined for the §24 widgets later slices own', () => {
    expect(widgetDefinitionFor('calendar')).toBeUndefined();
    expect(widgetDefinitionFor('recent_agent_activity')).toBeUndefined();
    expect(widgetDefinitionFor('work_summary')).toBeUndefined();
  });
});
