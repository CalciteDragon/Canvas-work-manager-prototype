import {
  ActivityEventIdSchema,
  type ActivityAction,
  type ActivityEntityType,
  type ActivityEvent,
  type ActivityQuery,
  type ProjectId,
} from '@cwm/contracts';
import type { ActivityRepository } from '@cwm/repositories';
import type { ActorContext } from './actor';
import type { Clock } from './clock';
import type { IdGenerator } from './ids';

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
}

/**
 * Every mutation produces one attributable event (§57). `record` never opens a unit of
 * work — it runs inside the one its caller opened, so a mutation and its event commit or
 * roll back together.
 */
export class ActivityService {
  constructor(private readonly dependencies: ActivityServiceDependencies) {}

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
    return event;
  }

  /**
   * Newest first. The tie-break is explicit because the clock is settable and two events
   * in one millisecond are ordinary: a plain stable sort would leave equal timestamps in
   * *insertion* order, which reads as oldest-first inside the tie.
   */
  async list(actor: ActorContext, query: ActivityQuery = {}): Promise<ActivityEvent[]> {
    const events = await this.dependencies.activities.list(
      // `limit` truncates the scoped, sorted result, so it cannot be pushed down here.
      query.projectId === undefined ? {} : { projectId: query.projectId },
    );
    const ordered = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.workspaceId === actor.workspaceId)
      .sort((left, right) =>
        left.event.createdAt === right.event.createdAt
          ? right.index - left.index
          : right.event.createdAt.localeCompare(left.event.createdAt),
      )
      .map(({ event }) => event);

    return query.limit === undefined ? ordered : ordered.slice(0, query.limit);
  }
}
