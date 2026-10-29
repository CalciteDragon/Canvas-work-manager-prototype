import { DashboardWidgetTypeSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { DASHBOARD_WIDGET_REGISTRY, widgetDefinitionFor } from './registry';
import { ICON_NAMES } from '../../../shared/components/icon/icon';
import { dailyDigestFailure } from './daily-digest/daily-digest-widget';

describe('DASHBOARD_WIDGET_REGISTRY (§24, §25)', () => {
  // Slice 72 (L2-013): widget marks come from the shared SVG set, not platform emoji.
  it('names a mark from the shared icon set for every widget', () => {
    for (const { type, icon } of DASHBOARD_WIDGET_REGISTRY) expect(ICON_NAMES as readonly string[], type).toContain(icon);
  });

  it('ships the seven of §24’s widgets that exist', () => {
    expect(DASHBOARD_WIDGET_REGISTRY.map(({ type }) => type)).toEqual([
      'today',
      'upcoming',
      'active_projects',
      'recent_progress',
      'daily_digest',
      'fun_fact',
      'recent_agent_activity',
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

  // Slice 78: widgets still take data only; a failure comes from the definition, and only
  // the digest can have one.
  it('gives only the digest a failureOf hook, and it is the digest’s own', () => {
    expect(widgetDefinitionFor('daily_digest')?.failureOf).toBe(dailyDigestFailure);
    for (const { type, failureOf } of DASHBOARD_WIDGET_REGISTRY) if (type !== 'daily_digest') expect(failureOf, type).toBeUndefined();
  });

  it('answers undefined for the §24 widgets later slices own', () => {
    expect(widgetDefinitionFor('calendar')).toBeUndefined();
    expect(widgetDefinitionFor('work_summary')).toBeUndefined();
  });
});
