import { GeneratedContentSchema, type GeneratedContent } from '@cwm/contracts';
import type { AIProvider, DailyDigestContext, ProjectSummaryContext } from './ai-provider';

/**
 * §43's provider: no API key, no network, no prompt engineering. The text is *composed*
 * from counts the caller already derived, which is what makes it deterministic — the same
 * context always produces the same digest, so a screenshot of the dashboard is a fact
 * about the seed rather than about a sampling temperature.
 *
 * It is allowed to read as AI-generated. It is not allowed to *claim* to be: every
 * `GeneratedContent` carries `source: 'prototype'`, and the widget says so.
 */
export class PrototypeAIProvider implements AIProvider {
  generateDailyDigest(context: DailyDigestContext): Promise<GeneratedContent> {
    const lines: string[] = [];

    lines.push(
      context.dueTodayCount === 0
        ? 'Nothing is scheduled for today.'
        : `You have ${count(context.dueTodayCount, 'task')} scheduled today.`,
    );

    if (context.inProgressCount > 0) {
      lines.push(`${capitalize(count(context.inProgressCount, 'task'))} already in progress.`);
    }

    if (context.nearestDeadline !== undefined) {
      const { projectName, targetDate, daysAway } = context.nearestDeadline;
      const when =
        daysAway === 0
          ? 'due today'
          : daysAway > 0
            ? `due in ${count(daysAway, 'day')}, on ${targetDate}`
            : `due ${count(-daysAway, 'day')} ago, on ${targetDate}`;
      lines.push(`The ${projectName} project has the closest deadline — ${when}.`);
    } else if (context.activeProjectCount > 0) {
      lines.push(`None of your ${context.activeProjectCount} active projects has a target date.`);
    }

    lines.push(
      context.overdueCount === 0
        ? 'Nothing is overdue.'
        : `${capitalize(count(context.overdueCount, 'task'))} ${context.overdueCount === 1 ? 'is' : 'are'} overdue.`,
    );

    if (context.upcomingCount > 0) {
      lines.push(
        `${capitalize(count(context.upcomingCount, 'task'))} ${context.upcomingCount === 1 ? 'arrives' : 'arrive'} in the next ${count(context.upcomingDays, 'day')}.`,
      );
    }

    lines.push(
      `You completed ${count(context.completedRecentlyCount, 'task')} during the last ${count(context.recentDays, 'day')}.`,
    );

    return this.content(lines, context.generatedAt);
  }

  generateProjectSummary(context: ProjectSummaryContext): Promise<GeneratedContent> {
    const lines: string[] = [];

    lines.push(
      context.totalTasks === 0
        ? 'No tasks have been added to this project yet.'
        : `${context.completedTasks} of ${context.totalTasks} tasks are complete${context.percentage === null ? '' : ` — ${context.percentage}%`}.`,
    );

    if (context.overdueTasks > 0) {
      lines.push(
        `${capitalize(count(context.overdueTasks, 'task'))} ${context.overdueTasks === 1 ? 'is' : 'are'} overdue.`,
      );
    }
    if (context.blockedTasks > 0) {
      lines.push(
        `${capitalize(count(context.blockedTasks, 'task'))} ${context.blockedTasks === 1 ? 'is' : 'are'} blocked.`,
      );
    }

    lines.push(
      context.targetDate === undefined
        ? `The project is ${context.status.replace('_', ' ')} with no target date set.`
        : `The project is ${context.status.replace('_', ' ')} and targets ${context.targetDate}.`,
    );

    if (context.latestReflection !== undefined) {
      lines.push(`The most recent reflection reads: "${context.latestReflection}"`);
    }

    return this.content(lines, context.generatedAt);
  }

  /**
   * Parsed on the way out, not merely typed. The provider is the one thing in this slice
   * that writes prose rather than copying stored values, so an empty line or a missing
   * sentence has to fail here rather than render as a blank tile.
   */
  private content(lines: string[], generatedAt: string): Promise<GeneratedContent> {
    return Promise.resolve(GeneratedContentSchema.parse({ lines, source: 'prototype', generatedAt }));
  }
}

const count = (value: number, noun: string): string => `${value} ${noun}${value === 1 ? '' : 's'}`;

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
