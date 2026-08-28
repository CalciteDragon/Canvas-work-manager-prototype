import { GeneratedContentSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import type { DailyDigestContext, ProjectSummaryContext } from './ai-provider';
import { PrototypeAIProvider } from './prototype-ai-provider';

const GENERATED_AT = '2026-08-24T16:00:00.000Z';

const digestContext = (overrides: Partial<DailyDigestContext> = {}): DailyDigestContext => ({
  generatedAt: GENERATED_AT,
  dueTodayCount: 5,
  overdueCount: 2,
  inProgressCount: 1,
  upcomingCount: 4,
  upcomingDays: 7,
  completedRecentlyCount: 6,
  recentDays: 7,
  activeProjectCount: 3,
  nearestDeadline: { projectName: 'Portfolio', targetDate: '2026-08-28', daysAway: 4 },
  ...overrides,
});

const summaryContext = (overrides: Partial<ProjectSummaryContext> = {}): ProjectSummaryContext => ({
  generatedAt: GENERATED_AT,
  projectName: 'Website launch',
  status: 'active',
  targetDate: '2026-08-28',
  totalTasks: 6,
  completedTasks: 2,
  overdueTasks: 1,
  blockedTasks: 1,
  percentage: 33,
  ...overrides,
});

const provider = new PrototypeAIProvider();

describe('PrototypeAIProvider.generateDailyDigest', () => {
  it('states the real counts and the nearest deadline (§43)', async () => {
    const digest = await provider.generateDailyDigest(digestContext());
    const text = digest.lines.join('\n');

    expect(GeneratedContentSchema.parse(digest).source).toBe('prototype');
    expect(text).toContain('5 tasks scheduled today');
    expect(text).toContain('Portfolio');
    expect(text).toContain('2 tasks are overdue');
    expect(text).toContain('completed 6 tasks');
    expect(digest.generatedAt).toBe(GENERATED_AT);
  });

  it('needs no API key and no network — it is a pure composition (§43)', async () => {
    const first = await provider.generateDailyDigest(digestContext());
    const second = await provider.generateDailyDigest(digestContext());
    expect(second).toEqual(first);
  });

  it('says something useful about a workspace with nothing in it', async () => {
    const digest = await provider.generateDailyDigest(
      digestContext({
        dueTodayCount: 0,
        overdueCount: 0,
        inProgressCount: 0,
        upcomingCount: 0,
        completedRecentlyCount: 0,
        activeProjectCount: 0,
        nearestDeadline: undefined,
      }),
    );

    expect(GeneratedContentSchema.parse(digest).lines.length).toBeGreaterThan(0);
    expect(digest.lines.join('\n')).toContain('Nothing is scheduled');
    expect(digest.lines.join('\n')).not.toContain('undefined');
  });

  it('reads singular work as singular', async () => {
    const digest = await provider.generateDailyDigest(
      digestContext({ dueTodayCount: 1, overdueCount: 1, completedRecentlyCount: 1 }),
    );
    const text = digest.lines.join('\n');
    expect(text).toContain('1 task scheduled today');
    expect(text).toContain('1 task is overdue');
    expect(text).toContain('completed 1 task');
  });

  it('distinguishes a deadline today, ahead, and already passed', async () => {
    const today = await provider.generateDailyDigest(
      digestContext({ nearestDeadline: { projectName: 'Portfolio', targetDate: '2026-08-24', daysAway: 0 } }),
    );
    const passed = await provider.generateDailyDigest(
      digestContext({ nearestDeadline: { projectName: 'Portfolio', targetDate: '2026-08-21', daysAway: -3 } }),
    );

    expect(today.lines.join('\n')).toContain('due today');
    expect(passed.lines.join('\n')).toContain('3 days ago');
  });
});

describe('PrototypeAIProvider.generateProjectSummary', () => {
  it('composes from its context (§42 pins both methods)', async () => {
    const summary = await provider.generateProjectSummary(summaryContext());
    const text = summary.lines.join('\n');

    expect(GeneratedContentSchema.parse(summary).source).toBe('prototype');
    expect(text).toContain('2 of 6');
    expect(text).toContain('33%');
    expect(text).toContain('1 task is overdue');
    expect(text).toContain('1 task is blocked');
    expect(text).toContain('2026-08-28');
  });

  it('handles a project with no tasks, no target and no reflection', async () => {
    const summary = await provider.generateProjectSummary(
      summaryContext({
        totalTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        blockedTasks: 0,
        percentage: null,
        targetDate: undefined,
      }),
    );

    expect(GeneratedContentSchema.parse(summary).lines.length).toBeGreaterThan(0);
    expect(summary.lines.join('\n')).toContain('No tasks');
    expect(summary.lines.join('\n')).not.toContain('undefined');
  });

  it('quotes the latest reflection when there is one', async () => {
    const summary = await provider.generateProjectSummary(
      summaryContext({ latestReflection: 'Analytics validation is blocked on production access.' }),
    );
    expect(summary.lines.join('\n')).toContain('Analytics validation is blocked');
  });
});
