import {
  SearchWorkspaceResultSchema,
  UpcomingWorkResultSchema,
  type Project,
  type Reflection,
  type SearchHit,
  type SearchWorkspaceQuery,
  type SearchWorkspaceResult,
  type Task,
  type UpcomingWorkQuery,
  type UpcomingWorkResult,
} from '@cwm/contracts';
import type { ProjectRepository, ReflectionRepository, TaskRepository } from '@cwm/repositories';
import { assertPermitted, type ActorContext } from './actor';
import { DAY_MS, isoDayOf, startOfUtcDay } from './calendar';
import type { Clock } from './clock';
import { byDueDate, dashboardTaskFor, isOpen, isOverdue } from './task-windows';

export interface WorkspaceServiceDependencies {
  projects: ProjectRepository;
  tasks: TaskRepository;
  reflections: ReflectionRepository;
  clock: Clock;
}

/**
 * The two workspace-wide reads §54 backs with `workspace.read`: `search_workspace` and
 * `get_upcoming_work`.
 *
 * **Why these are not the checked services composed.** `ProjectService.list` asserts
 * `projects.read` and `TaskService.list` asserts `tasks.read`, so a tool built out of them
 * would demand three grants where §53's grid offers one — and a connection given exactly
 * `workspace.read`, which is what the contracts say backs these tools, could call none of
 * them. `DashboardService` settled this shape first: assert the one grant, read the
 * repositories, scope by hand.
 *
 * **How scoping works.** Projects carry a `workspaceId` and their query filters on it.
 * Tasks and reflections carry none and their queries have no such filter, so the actor's
 * visible projects are resolved first and everything else is intersected against them —
 * the same two-step `TaskService.list` and `DashboardService.load` use. Archived projects
 * are excluded, and so is everything inside them: filed-away work is not workspace content.
 */
export class WorkspaceService {
  constructor(private readonly dependencies: WorkspaceServiceDependencies) {}

  /**
   * §40's global search, minus milestones — they have no service until Slice 19.
   *
   * Project and task matching is the repository's (`ProjectQuery.search`, `TaskQuery.search`),
   * whose semantics are already settled and tested. **Reflection matching is done here**,
   * because `ReflectionQuery` has no `search` member: adding one would change contracts,
   * repositories and their tests for a single caller. The inconsistency is deliberate and
   * belongs to Slice 21, which owns search as a feature.
   */
  async search(actor: ActorContext, query: SearchWorkspaceQuery): Promise<SearchWorkspaceResult> {
    assertPermitted(actor, 'workspace.read');

    const term = query.query.trim().toLowerCase();
    // The repositories treat an empty trimmed term as "no filter", which would turn a query
    // of spaces into "return the whole workspace". A search for nothing finds nothing.
    if (term === '') return SearchWorkspaceResultSchema.parse({ query: query.query, hits: [] });

    const visible = await this.visibleProjects(actor);
    const byId = new Map(visible.map((project) => [project.id, project]));

    const [matchedProjects, matchedTasks, allReflections] = await Promise.all([
      this.dependencies.projects.list({ workspaceId: actor.workspaceId, search: query.query }),
      this.dependencies.tasks.list({ search: query.query }),
      this.dependencies.reflections.list(),
    ]);

    const hits: SearchHit[] = [
      ...matchedProjects.filter((project) => byId.has(project.id)).map((project) => this.projectHit(project)),
      ...matchedTasks
        .filter((task) => task.archivedAt === undefined && byId.has(task.projectId))
        .map((task) => this.taskHit(task, byId.get(task.projectId))),
      ...allReflections
        .filter((reflection) => byId.has(reflection.projectId) && matches(reflection, term))
        .map((reflection) => this.reflectionHit(reflection, byId.get(reflection.projectId))),
    ];

    // Grouped by kind, then by title, then by id. §40 sketches a ranking; this slice does
    // not rank, and an unordered result would make `limit` return different rows each call.
    hits.sort(
      (left, right) =>
        KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
        (left.title ?? '').localeCompare(right.title ?? '') ||
        left.id.localeCompare(right.id),
    );

    return SearchWorkspaceResultSchema.parse({ query: query.query, hits: hits.slice(0, query.limit) });
  }

  /**
   * §54's `get_upcoming_work`. Two buckets over `days` calendar days **including today**.
   *
   * Deliberately not `DashboardService`'s split, which is disjoint from three other widgets
   * and starts tomorrow so that no task appears twice on one screen. An agent asking "what
   * is coming up?" has no screen to keep tidy and does mean today.
   */
  async upcomingWork(actor: ActorContext, query: UpcomingWorkQuery): Promise<UpcomingWorkResult> {
    assertPermitted(actor, 'workspace.read');

    const nowMs = this.dependencies.clock.now().getTime();
    const todayStart = startOfUtcDay(nowMs);
    const throughMs = todayStart + (query.days - 1) * DAY_MS;

    const visible = await this.visibleProjects(actor);
    const byId = new Map(visible.map((project) => [project.id, project]));
    const open = (await this.dependencies.tasks.list()).filter(
      (task) => task.archivedAt === undefined && byId.has(task.projectId) && isOpen(task),
    );

    const bucket = (tasks: Task[]): unknown[] =>
      tasks
        .sort(byDueDate)
        .slice(0, query.limit)
        .map((task) => dashboardTaskFor(task, byId.get(task.projectId), nowMs));

    return UpcomingWorkResultSchema.parse({
      days: query.days,
      throughDate: isoDayOf(throughMs),
      overdue: bucket(open.filter((task) => isOverdue(task, nowMs))),
      // `< throughMs + DAY_MS` is "before the end of the window's last day", so a task due
      // at 23:00 on the final day is in it.
      upcoming: bucket(
        open.filter(
          (task) => !isOverdue(task, nowMs) && task.dueAt !== undefined && Date.parse(task.dueAt) < throughMs + DAY_MS,
        ),
      ),
    });
  }

  private async visibleProjects(actor: ActorContext): Promise<Project[]> {
    return (await this.dependencies.projects.list({ workspaceId: actor.workspaceId })).filter(
      ({ status }) => status !== 'archived',
    );
  }

  /** A project names itself: repeating its id and name as `projectId`/`projectName` would let one hit disagree with itself. */
  private projectHit(project: Project): SearchHit {
    return { kind: 'project', id: project.id, title: project.name, status: project.status };
  }

  private taskHit(task: Task, project: Project | undefined): SearchHit {
    return {
      kind: 'task',
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      ...(project === undefined ? {} : { projectName: project.name }),
      status: task.status,
      ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
    };
  }

  private reflectionHit(reflection: Reflection, project: Project | undefined): SearchHit {
    return {
      kind: 'reflection',
      id: reflection.id,
      ...(reflection.title === undefined ? {} : { title: reflection.title }),
      projectId: reflection.projectId,
      ...(project === undefined ? {} : { projectName: project.name }),
    };
  }
}

const KIND_ORDER: Record<SearchHit['kind'], number> = { project: 0, task: 1, reflection: 2 };

/** The repositories' own text rule, applied to the one entity whose query cannot express it. */
const matches = (reflection: Reflection, term: string): boolean =>
  (reflection.title ?? '').toLowerCase().includes(term) || reflection.body.toLowerCase().includes(term);
