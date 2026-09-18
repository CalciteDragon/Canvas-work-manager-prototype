import {
  ActivityEventIdSchema,
  ActivityEventSchema,
  type ActivityAction,
  type ActivityEntityType,
  type ActivityEvent,
  type ActivityFeedEntry,
  type ActivityHistoricalContext,
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
   * Read-only. `list` uses all of them, to resolve the names §57's card renders.
   *
   * `record` uses **one**: it walks `projects` up the parent chain to name the root a change
   * belongs to (see `rootOf`). That is a departure from "record reads nothing" — worth stating
   * rather than leaving as a surprise, since `record` runs inside every mutation. The walk is
   * one map lookup per ancestor over a document already held in memory (§14, §71); the trees
   * this prototype is about are a handful deep.
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
 * A titleless reflection still has to read as something (§36). Stable rather than generated, so two
 * events about the same reflection say the same thing and a converted document matches a freshly
 * recorded one.
 */
export const UNTITLED_REFLECTION_LABEL = 'Untitled reflection';

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
    // **Captured before the write that may remove the target.** Slice 36 makes Undo of a creation
    // delete the row its event describes, so the identity has to be read while the row is still
    // there — which is here, inside the caller's own unit of work, rather than in the feed later
    // (docs/decisions/2026-09-historical-activity-identity.md).
    const context = await this.captureContext(entry);
    const event = ActivityEventSchema.parse({
      id: ActivityEventIdSchema.parse(ids.next('activity')),
      workspaceId: actor.workspaceId,
      actor: actor.actor,
      actorUserId: actor.actor === 'user' ? actor.userId : undefined,
      actorAgentConnectionId: actor.actor === 'agent' ? actor.agentConnectionId : undefined,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      // The context is authoritative: `captureContext` fills a project-targeted event's own project
      // when the caller left it out, and an event and its context must name the same one.
      projectId: context.projectId,
      summary: entry.summary,
      context,
      createdAt: clock.now().toISOString(),
    });

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
        projectId: context.projectId,
        // A root's aggregate pages project rows from anywhere beneath it (§31, §34), so a
        // change three sub-projects down changes what they render while `projectId` names a
        // project those pages are not open on. It is the same root the context captured, so a
        // frame and an audit line can never disagree about which tree changed.
        rootProjectId: context.rootProjectId,
      },
    });
    return event;
  }

  /**
   * The target's identity as it is right now: kind, id, readable label and owning project.
   *
   * It validates rather than trusts. A caller cannot supply a history — there is no parameter for
   * one — and an entry naming a target this service cannot resolve is refused here, inside the
   * caller's unit, so the mutation rolls back rather than writing an audit line that asserts
   * something untrue. The project is checked the same way, against the entry rather than guessed.
   *
   * `rootProjectId` is the root of the owning project's tree; both it and `projectId` are absent
   * for an `agent_connection`, which belongs to no project.
   */
  private async captureContext(entry: ActivityEntry): Promise<ActivityHistoricalContext> {
    const label = await this.labelOf(entry);
    if (entry.entityType === 'agent_connection') {
      if (entry.projectId !== undefined) {
        throw new TypeError(`activity about connection "${entry.entityId}" cannot name a project`);
      }
      return { targetKind: entry.entityType, targetId: entry.entityId, targetLabel: label };
    }
    // A project-targeted event's project **is** its target, so a caller may leave it out; anything
    // else must say which project the change happened in, because nothing else can derive it.
    const projectId = entry.projectId ?? (entry.entityType === 'project' ? (entry.entityId as ProjectId) : undefined);
    if (projectId === undefined) {
      throw new TypeError(`activity about ${entry.entityType} "${entry.entityId}" must name its project`);
    }
    const root = await this.rootOf(projectId);
    if (root === undefined) throw new TypeError(`activity names missing project "${projectId}"`);
    return { targetKind: entry.entityType, targetId: entry.entityId, targetLabel: label, projectId, rootProjectId: root };
  }

  /**
   * The label captured for a target, and the name the feed falls back to once the row is gone.
   *
   * A target that cannot be resolved is a caller mistake rather than a blank label: the document's
   * integrity pass would reject the event anyway, and failing here says which entry was wrong. The
   * one exception is a `section`, which no product surface targets — section events target the
   * project (docs/decisions/2026-08-section-activity-targets-the-project.md) — and which this
   * service holds no repository for, so its id is the honest answer.
   */
  private async labelOf(entry: ActivityEntry): Promise<string> {
    const { projects, tasks, milestones, reflections, agents } = this.dependencies;
    const missing = (): never => {
      throw new TypeError(`activity target ${entry.entityType} "${entry.entityId}" does not exist`);
    };
    switch (entry.entityType) {
      case 'project':
        return (await projects.find(entry.entityId as never))?.name ?? missing();
      case 'task':
        return (await tasks.find(entry.entityId as never))?.title ?? missing();
      case 'milestone':
        return (await milestones.find(entry.entityId as never))?.title ?? missing();
      case 'reflection': {
        const reflection = (await reflections.find(entry.entityId as never)) ?? missing();
        return reflection.title?.trim() || UNTITLED_REFLECTION_LABEL;
      }
      case 'agent_connection':
        return (await agents.find(entry.entityId as never))?.name ?? missing();
      case 'section':
        return entry.entityId;
    }
  }

  /**
   * The root of the tree a project sits in — itself, when it is already one.
   *
   * The visited set is the same guard `ProjectService.assertParentIsUsable` carries and for the
   * same reason: a hand-edited document (§14) can contain a parent cycle, and this runs inside
   * every mutation, where an unguarded loop would not fail one request but starve the event
   * loop. A chain that cannot be resolved answers with the last project it could see, which is
   * a worse root than the truth and better than no frame at all.
   */
  private async rootOf(projectId: ProjectId): Promise<ProjectId | undefined> {
    const seen = new Set<ProjectId>();
    let current = await this.dependencies.projects.find(projectId);
    if (current === null) return undefined;
    while (current.parentProjectId !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = await this.dependencies.projects.find(current.parentProjectId);
      if (parent === null) break;
      current = parent;
    }
    return current.id;
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

  /**
   * **Current name when the target is there, captured label when it is not.** The live read is what
   * docs/decisions/2026-08-activity-feed-composes-from-parts.md settles: rename a task and the feed
   * shows its new title. The fallback is Slice 36's addition — Undo of a creation removes the row,
   * and the row it removed still has to read as something rather than as a blank line.
   *
   * `projectName` is read live too, but the captured context is never rewritten when an entity
   * moves: it says where the change happened, not where the entity lives now.
   */
  private async resolve(event: ActivityEvent): Promise<ActivityFeedEntry> {
    const [actorName, entityTitle, projectName] = await Promise.all([
      this.actorName(event),
      this.entityTitle(event),
      this.projectName(event),
    ]);

    return {
      ...event,
      actorName,
      entityTitle: entityTitle ?? event.context.targetLabel,
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
