import { describe, expect, it } from 'vitest';
import { DashboardWidgetSchema, DashboardWidgetTypeSchema, WidgetSizeSchema } from './dashboard';

const widget = {
  id: 'widget-1',
  type: 'today',
  position: 0,
  size: 'medium',
  config: {},
  hidden: false,
};

describe('DashboardWidgetSchema', () => {
  it('accepts each of the four §25 sizes', () => {
    for (const size of WidgetSizeSchema.options) {
      expect(DashboardWidgetSchema.parse({ ...widget, size }).size).toBe(size);
    }
    expect(WidgetSizeSchema.options).toEqual(['small', 'medium', 'wide', 'full']);
  });

  it('keeps widget config opaque and honours hidden', () => {
    const parsed = DashboardWidgetSchema.parse({
      ...widget,
      type: 'upcoming',
      config: { rangeDays: 7 },
      hidden: true,
    });
    expect(parsed).toMatchObject({ config: { rangeDays: 7 }, hidden: true });
  });

  it('rejects a pixel-ish size — presets only (§25)', () => {
    expect(DashboardWidgetSchema.safeParse({ ...widget, size: 'large' }).success).toBe(false);
  });

  it('rejects a widget type outside §24', () => {
    expect(DashboardWidgetSchema.safeParse({ ...widget, type: 'weather' }).success).toBe(false);
    expect(DashboardWidgetTypeSchema.options).toEqual([
      'today',
      'upcoming',
      'active_projects',
      'calendar',
      'recent_progress',
      'daily_digest',
      'work_summary',
      'fun_fact',
      'recent_agent_activity',
    ]);
  });
});
