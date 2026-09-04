import {
  ActivityEventIdSchema,
  type ActivityAction,
  type ActivityEntityType,
  type ActivityEvent,
  type ActivityFeedEntry,
  type ActivityQuery,
  type ProjectId,
} from '@cwm/contracts';
import type {
  ActivityRepository,
  AgentConnectionRepository,
  MilestoneRepository,
  ProjectRepository,
  ReflectionRepository,
  TaskRepository,
  UserRepository,
} from '@cwm/repositories';
import { assertPermitted, type ActorContext } from './actor';
import type { Clock } from './clock';
import type { IdGenerator } from './ids';
import type { LiveEventPublisher } from './live-events';

export interface ActivityEntry {
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  /** Set whenever the target has a project — the document requires it to match (§57). */
  projectId?: ProjectId;
  /**
   * The §57 feed line, e.g. `Completed "Configure deployment"`. Denormalized and frozen
   * at write time: a fallback and a debugging aid, not the feed's rendering source.
   * See docs/decisions/2026-08-activity-summary-ownership.md.
   */
  summary: string;
}

export interface ActivityServiceDependencies {
  activities: ActivityRepository;
  clock: Clock;
  ids: IdGenerator;
  /**
   * Read-only, and only for `list`: resolving the names §57's card renders. `record` uses
   * none of them, which is why it stays cheap enough to run inside every mutation.
   */
  projects: ProjectRepository;
  agents: AgentConnectionRepository;
  users: UserRepository;
  tasks: TaskRepository;
  milestones: MilestoneRepository;
  reflections: ReflectionRepository;
  /**
   * §62's live stream, when one is attached. Optional: the domain never *requires* a
   * listener, and every construction site that predates Slice 16 — tests included — stays
   * valid without one.
   */
  events?: LiveEventPublisher;
}

/** What a system action is called on screen. §57 gives it no name of its own. */
const SYSTEM_ACTOR_NAME = 'System';

/**
 * Every mutation produces one attributable event (§57). `record` never opens a unit of
 * work — it runs inside the one its caller opened, so a mutation and its event commit or
 * roll back together.
 */
export class ActivityService {
  constructor(private readonly dependencies: ActivityServiceDependencies) {}

  /**
   * Deliberately **not** permission-checked. Every caller is a domain service that has
   * already authorized the mutation this event describes, and it runs inside that
   * mutation's unit of work. Nothing reaches it from a transport: the host exposes `list`
   * only, and Slice 14's tools call the services, never this.
   */
  async record(actor: ActorContext, entry: ActivityEntry): Promise<ActivityEvent> {
    const { activities, clock, ids } = this.dependencies;
    const event = {
      id: ActivityEventIdSchema.parse(ids.next('activity')),
      workspaceId: actor.workspaceId,
      actor: actor.actor,
      actorUserId: actor.actor === 'user' ? actor.userId : undefined,
      actorAgentConnectionId: actor.actor === 'agent' ? actor.agentConnectionId : undefined,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      projectId: entry.projectId,
      summary: entry.summary,
      createdAt: clock.now().toISOString(),
    } as ActivityEvent;

    await activities.insert(event);

    // §62's frame is published from here rather than from each mutating service, because
    // this is the one place every mutation already passes through — so the stream and §57's
    // feed cannot disagree about what happened. Delivery is the publisher's problem: the
    // host's hub holds the frame until this unit of work commits, so a browser cannot
    // refetch a write that has not landed yet, and a rolled-back write never broadcasts.
    // See docs/decisions/2026-08-live-events-ride-the-activity-record.md.
    this.dependencies.events?.publish({
      workspaceId: actor.workspaceId,
      event: {
        type: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        projectId: entry.projectId,
      },
    });
    return event;
  }

  /**
   * §57's feed, newest first, with every name it renders already resolved.
   *
   * The names are read **now**, not taken from the event's frozen `summary`: rename a task
   * and the feed shows its current title, which is what
   * docs/decisions/2026-08-activity-feed-composes-from-parts.md settles.
   *
   * The tie-break is explicit because the clock is settable and two events in one
   * millisecond are ordinary: a plain stable sort would leave equal timestamps in
   * *insertion* order, which reads as oldest-first inside the tie.
   */
  async list(actor: ActorContext, query: ActivityQuery = {}): Promise<ActivityFeedEntry[]> {
    assertPermitted(actor, 'workspace.read');

    const events = await this.dependencies.activities.list(
      // `limit` truncates the scoped, sorted result, so it cannot be pushed down here.
      query.projectId === undefined ? {} : { projectId: query.projectId },
    );
    const ordered = events
      .map((event, index) => ({ event, index }))
      .filter(
        ({ event }) =>
          event.workspaceId === actor.workspaceId && (query.actor === undefined || event.actor === query.actor),
      )
      .sort((left, right) =>
        left.event.createdAt === right.event.createdAt
          ? right.index - left.index
          : right.event.createdAt.localeCompare(left.event.createdAt),
      )
      .map(({ event }) => event);

    // Scope, then narrow, then truncate, then resolve. The order is the point: filtering
    // after the limit would let §24's agent tile report "nothing" whenever the newest
    // events happened to be a person's, and resolving before it would cost three lookups
    // per event for rows nobody asked for.
    const limited = query.limit === undefined ? ordered : ordered.slice(0, query.limit);
    return Promise.all(limited.map((event) => this.resolve(event)));
  }

  private async resolve(event: ActivityEvent): Promise<ActivityFeedEntry> {
    const [actorName, entityTitle, projectName] = await Promise.all([
      this.actorName(event),
      this.entityTitle(event),
      this.projectName(event),
    ]);

    return {
      ...event,
      actorName,
      ...(entityTitle === undefined ? {} : { entityTitle }),
      ...(projectName === undefined ? {} : { projectName }),
    };
  }

  private async actorName(event: ActivityEvent): Promise<string> {
    if (event.actor === 'system') return SYSTEM_ACTOR_NAME;
    if (event.actor === 'agent') {
      const connection = await this.dependencies.agents.find(event.actorAgentConnectionId!);
      // The store rejects a document whose event names a missing connection, so this
      // fallback is unreachable through persistence — it exists so the feed degrades to an
      // id rather than crashing on a fixture or a half-built document.
      return connection?.name ?? event.actorAgentConnectionId!;
    }
    const user = await this.dependencies.users.find(event.actorUserId!);
    return user?.name ?? event.actorUserId!;
  }

  private async entityTitle(event: ActivityEvent): Promise<string | undefined> {
    const { projects, tasks, milestones, reflections, agents } = this.dependencies;
    switch (event.entityType) {
      case 'project':
        return (await projects.find(event.entityId as never))?.name;
      case 'task':
        return (await tasks.find(event.entityId as never))?.title;
      case 'milestone':
        return (await milestones.find(event.entityId as never))?.title;
      case 'reflection':
        return (await reflections.find(event.entityId as never))?.title;
      case 'agent_connection':
        return (await agents.find(event.entityId as never))?.name;
      case 'section':
        // The domain *can* name a section now — `nameOf` is in contracts and `SectionService`
        // uses it for its summaries. This branch stays `undefined` for a different reason:
        // section events target the **project**
        // (docs/decisions/2026-08-section-activity-targets-the-project.md), so nothing this
        // service writes reaches it, and only a hand-written fixture does. Resolving it would
        // mean a repository read on a path no product surface produces.
        return undefined;
    }
  }

  private async projectName(event: ActivityEvent): Promise<string | undefined> {
    if (event.projectId === undefined) return undefined;
    return (await this.dependencies.projects.find(event.projectId))?.name;
  }
}
