import { describe, expect, it } from 'vitest';
import {
  DashboardQuerySchema,
  DashboardResultSchema,
  DashboardWidgetSchema,
  DashboardWidgetTypeSchema,
  GeneratedContentSchema,
  WidgetSizeSchema,
} from './dashboard';

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

describe('DashboardQuerySchema', () => {
  it('defaults both ranges to a week', () => {
    expect(DashboardQuerySchema.parse({})).toEqual({ upcomingDays: 7, recentDays: 7 });
  });

  it('rejects a range outside 1..90 days', () => {
    expect(DashboardQuerySchema.safeParse({ upcomingDays: 0 }).success).toBe(false);
    expect(DashboardQuerySchema.safeParse({ upcomingDays: 91 }).success).toBe(false);
    expect(DashboardQuerySchema.safeParse({ recentDays: 1.5 }).success).toBe(false);
  });
});

const dashboardTask = {
  id: 'task-1',
  projectId: 'project-1',
  projectName: 'Website launch',
  title: 'Run launch QA',
  status: 'in_progress',
  priority: 'high',
  dueAt: '2026-08-25T23:00:00.000Z',
  overdue: false,
};

const generated = {
  title: 'Daily digest',
  lines: ['You have 3 tasks scheduled today.'],
  source: 'prototype',
  generatedAt: '2026-08-24T16:00:00.000Z',
};

describe('DashboardResultSchema', () => {
  const result = {
    generatedAt: '2026-08-24T16:00:00.000Z',
    today: { date: '2026-08-24', overdue: [], dueToday: [dashboardTask], inProgress: [] },
    upcoming: { days: 7, throughDate: '2026-08-31', tasks: [] },
    activeProjects: [
      {
        id: 'project-1',
        name: 'Website launch',
        icon: '🚀',
        status: 'active',
        targetDate: '2026-08-28',
        openTasks: 2,
        completedTasks: 1,
        percentage: 33,
        daysToTarget: 4,
      },
    ],
    recentProgress: { days: 7, sinceDate: '2026-08-17', tasks: [] },
    dailyDigest: generated,
    funFact: 'Most people overestimate what they can finish in a day.',
  };

  it('accepts a fully derived dashboard', () => {
    expect(DashboardResultSchema.parse(result).today.dueToday[0]?.projectName).toBe('Website launch');
  });

  it('allows a project with nothing to measure and a target date already passed', () => {
    const parsed = DashboardResultSchema.parse({
      ...result,
      activeProjects: [{ ...result.activeProjects[0], percentage: null, daysToTarget: -3 }],
    });
    expect(parsed.activeProjects[0]).toMatchObject({ percentage: null, daysToTarget: -3 });
  });

  it('rejects generated content with no lines — a widget would render an empty tile', () => {
    expect(
      DashboardResultSchema.safeParse({ ...result, dailyDigest: { ...generated, lines: [] } }).success,
    ).toBe(false);
  });

  it('rejects an unknown generated-content source', () => {
    expect(GeneratedContentSchema.safeParse({ ...generated, source: 'openai' }).success).toBe(false);
  });
});
