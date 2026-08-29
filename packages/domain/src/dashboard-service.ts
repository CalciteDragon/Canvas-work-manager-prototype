import {
  DashboardQuerySchema,
  DashboardResultSchema,
  type DashboardProject,
  type DashboardResult,
  type DashboardTask,
  type Project,
  type Task,
} from '@cwm/contracts';
import type { ProjectRepository, TaskRepository } from '@cwm/repositories';
import type { ActivityService } from './activity-service';
import { assertPermitted, type ActorContext } from './actor';
import { DAY_MS, isoDayOf, isoDayOfInstant, startOfUtcDay } from './calendar';
import type { AIProvider, DailyDigestContext } from './ai-provider';
import type { Clock } from './clock';

export interface DashboardServiceDependencies {
  projects: ProjectRepository;
  tasks: TaskRepository;
  activity: ActivityService;
  clock: Clock;
  ai: AIProvider;
}

/**
 * How many rows §24's Recent Agent Activity tile carries. A dashboard widget answers
 * "what have the agents been doing?", not "everything they have ever done" — the project
 * page's Recent Activity section is where a full history belongs.
 */
export const RECENT_AGENT_ACTIVITY_LIMIT = 8;

/**
 * §24's "low-priority optional daily content". Deliberately *not* behind `AIProvider`:
 * §42 pins that interface to two methods, and §24 describes the digest as AI-generated
 * while calling this merely daily. A fixture rotated by the simulated day is honest about
 * what it is and still changes when the clock moves.
 */
const FUN_FACTS: readonly string[] = [
  'The average knowledge worker checks their inbox every six minutes.',
  'Writing a task down makes you roughly twice as likely to finish it.',
  'Most people overestimate what they can do in a day and underestimate a year.',
  'A five-minute plan at the start of the day beats a thirty-minute one at the end.',
  'Context switching costs more time than the switch itself takes.',
  'Deadlines you set for yourself work best when someone else knows about them.',
  'Unfinished work occupies memory — that nagging feeling has a name, the Zeigarnik effect.',
];

const OPEN_STATUSES = new Set(['todo', 'in_progress', 'blocked']);

/**
 * §24's dashboard, derived. Nothing here is stored: every widget reads the same
 * projects and tasks the rest of the application does, through one clock reading, so the
 * digest can never disagree with the lists beside it.
 */
export class DashboardService {
  constructor(private readonly dependencies: DashboardServiceDependencies) {}

  async load(actor: ActorContext, query: unknown): Promise<DashboardResult> {
    // `workspace.read` is deliberately a *superset* grant: what comes back includes task
    // and project content in aggregate. §53's grid says so on the row rather than the UI
    // implying it is a narrower thing than it is — see the decision log.
    assertPermitted(actor, 'workspace.read');
    const { upcomingDays, recentDays } = DashboardQuerySchema.parse(query);
    const { clock, ai } = this.dependencies;

    const now = clock.now();
    const nowMs = now.getTime();
    const today = isoDayOf(nowMs);
    const todayStart = startOfUtcDay(nowMs);

    // Archived projects are filed away, not merely inactive: their tasks must not surface
    // anywhere on the dashboard. `TimelineService` excludes archived descendants for the
    // same reason. `on_hold` and `planning` projects stay — an overdue task is overdue
    // whoever paused the project, and "active project overview" is a narrower question
    // than "what should I do today?".
    const projects = (await this.dependencies.projects.list({ workspaceId: actor.workspaceId })).filter(
      ({ status }) => status !== 'archived',
    );
    const byId = new Map(projects.map((project) => [project.id, project]));
    const tasks = (await this.dependencies.tasks.list()).filter(
      (task) => task.archivedAt === undefined && byId.has(task.projectId),
    );

    const row = (task: Task): DashboardTask => {
      const project = byId.get(task.projectId);
      return {
        id: task.id,
        projectId: task.projectId,
        projectName: project?.name ?? 'Unknown project',
        ...(project?.icon === undefined ? {} : { projectIcon: project.icon }),
        title: task.title,
        status: task.status,
        priority: task.priority,
        ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
        ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
        overdue: task.dueAt !== undefined && Date.parse(task.dueAt) < nowMs && OPEN_STATUSES.has(task.status),
      };
    };

    const open = tasks.filter((task) => OPEN_STATUSES.has(task.status));
    const byDueDate = (a: Task, b: Task): number => (a.dueAt ?? '').localeCompare(b.dueAt ?? '');

    const overdue = open
      .filter((task) => task.dueAt !== undefined && Date.parse(task.dueAt) < nowMs)
      .sort(byDueDate);
    const dueToday = open
      .filter((task) => task.dueAt !== undefined && Date.parse(task.dueAt) >= nowMs && isoDayOfInstant(task.dueAt) === today)
      .sort(byDueDate);
    // A task can be overdue *and* running, or running *and* due on Thursday. Every list on
    // this screen is disjoint from every other: a task appears exactly once, in the bucket
    // that asks for action soonest, so the digest's counts add up to what the eye sees.
    const todayIds = new Set([...overdue, ...dueToday].map(({ id }) => id));
    const inProgress = open.filter((task) => task.status === 'in_progress' && !todayIds.has(task.id)).sort(byDueDate);
    const claimed = new Set([...todayIds, ...inProgress.map(({ id }) => id)]);

    const throughMs = todayStart + upcomingDays * DAY_MS;
    const upcoming = open
      .filter((task) => {
        if (task.dueAt === undefined || claimed.has(task.id)) return false;
        const due = Date.parse(task.dueAt);
        return due >= todayStart + DAY_MS && due < throughMs + DAY_MS;
      })
      .sort(byDueDate);

    // `recentDays` calendar days *including today*, so "the last 7 days" spans seven days
    // rather than seven-and-a-bit — the same width `upcomingDays` covers going forward.
    const sinceMs = todayStart - (recentDays - 1) * DAY_MS;
    const recent = tasks
      .filter((task) => task.status === 'done' && task.completedAt !== undefined && Date.parse(task.completedAt) >= sinceMs)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

    const activeProjects = projects
      .filter((project) => project.status === 'active')
      .map((project) => this.summarize(project, tasks, todayStart))
      .sort(
        (a, b) =>
          (a.targetDate ?? '9999-12-31').localeCompare(b.targetDate ?? '9999-12-31') || a.name.localeCompare(b.name),
      );

    // "Closest" means nearest in time, in either direction — a deadline three days gone is
    // closer than one three weeks out, and both are worth a sentence.
    const nearest = activeProjects.reduce<DashboardProject | undefined>(
      (best, project) =>
        project.daysToTarget === null
          ? best
          : best === undefined || Math.abs(project.daysToTarget) < Math.abs(best.daysToTarget ?? Infinity)
            ? project
            : best,
      undefined,
    );
    const digestContext: DailyDigestContext = {
      generatedAt: now.toISOString(),
      dueTodayCount: dueToday.length,
      overdueCount: overdue.length,
      inProgressCount: inProgress.length,
      upcomingCount: upcoming.length,
      upcomingDays,
      completedRecentlyCount: recent.length,
      recentDays,
      activeProjectCount: activeProjects.length,
      ...(nearest === undefined || nearest.targetDate === undefined || nearest.daysToTarget === null
        ? {}
        : {
            nearestDeadline: {
              projectName: nearest.name,
              targetDate: nearest.targetDate,
              daysAway: nearest.daysToTarget,
            },
          }),
    };

    return DashboardResultSchema.parse({
      generatedAt: now.toISOString(),
      today: { date: today, overdue: overdue.map(row), dueToday: dueToday.map(row), inProgress: inProgress.map(row) },
      upcoming: { days: upcomingDays, throughDate: isoDayOf(throughMs), tasks: upcoming.map(row) },
      activeProjects,
      recentProgress: { days: recentDays, sinceDate: isoDayOf(sinceMs), tasks: recent.map(row) },
      dailyDigest: await ai.generateDailyDigest(digestContext),
      // The same read as everything else on this screen. `ActivityService.list` asserts
      // `workspace.read` too, which the actor has already passed above — a harmless repeat,
      // and the alternative (an unchecked internal variant) would be a hole waiting for a
      // later caller to find.
      recentAgentActivity: await this.dependencies.activity.list(actor, {
        actor: 'agent',
        limit: RECENT_AGENT_ACTIVITY_LIMIT,
      }),
      // `%` keeps the sign of its left operand, so a clock simulated before 1970 would
      // index backwards off the front of the array. The double modulo makes the rotation
      // continue in both directions instead.
      funFact: FUN_FACTS[(((todayStart / DAY_MS) % FUN_FACTS.length) + FUN_FACTS.length) % FUN_FACTS.length]!,
    });
  }

  /**
   * Count-based only, deliberately: §39's weighted and manual formulas are a *per project*
   * experiment, and a dashboard that mixed three scales in one column would compare
   * nothing. The project page remains where a formula is chosen and read.
   */
  private summarize(project: Project, tasks: Task[], todayStart: number): DashboardProject {
    const mine = tasks.filter((task) => task.projectId === project.id);
    const completedTasks = mine.filter(({ status }) => status === 'done').length;
    const openTasks = mine.filter(({ status }) => OPEN_STATUSES.has(status)).length;
    return {
      id: project.id,
      name: project.name,
      ...(project.icon === undefined ? {} : { icon: project.icon }),
      status: project.status,
      ...(project.targetDate === undefined ? {} : { targetDate: project.targetDate }),
      openTasks,
      completedTasks,
      percentage: mine.length === 0 ? null : Math.round((completedTasks / mine.length) * 100),
      daysToTarget:
        project.targetDate === undefined
          ? null
          : Math.round((Date.parse(`${project.targetDate}T00:00:00.000Z`) - todayStart) / DAY_MS),
    };
  }
}
