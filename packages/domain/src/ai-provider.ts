import type { GeneratedContent } from '@cwm/contracts';

/**
 * What the digest is composed from. A **context**, not a prompt: §43's provider is local
 * and deterministic, so what it needs is the counts a sentence would state, already
 * derived by the service that owns the clock.
 *
 * `generatedAt` travels in the context rather than the provider holding a `Clock` — a
 * provider with a clock could disagree with the dashboard it is describing (§45).
 */
export interface DailyDigestContext {
  generatedAt: string;
  dueTodayCount: number;
  overdueCount: number;
  inProgressCount: number;
  upcomingCount: number;
  upcomingDays: number;
  completedRecentlyCount: number;
  recentDays: number;
  activeProjectCount: number;
  /** The active project whose target date is nearest, in either direction. */
  nearestDeadline?: { projectName: string; targetDate: string; daysAway: number };
}

export interface ProjectSummaryContext {
  generatedAt: string;
  projectName: string;
  status: string;
  targetDate?: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  percentage: number | null;
  latestReflection?: string;
}

/**
 * §42, verbatim. Both methods are pinned by the spec, so both are implemented and tested
 * even though only the digest has a caller until Slice 24 — the same rule §9's
 * `TaskGateway` is held to.
 */
export interface AIProvider {
  generateDailyDigest(context: DailyDigestContext): Promise<GeneratedContent>;
  generateProjectSummary(context: ProjectSummaryContext): Promise<GeneratedContent>;
}
