import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { ActivityEventIdSchema, AgentConnectionIdSchema, ProjectIdSchema, UserIdSchema, WorkspaceIdSchema } from './ids';

/** The three kinds of actor the UI must tell apart (§57). */
export const ActivityActorSchema = z.enum(['user', 'agent', 'system']);
export type ActivityActor = z.infer<typeof ActivityActorSchema>;

/** The §14 collections a mutation can be about. */
export const ActivityEntityTypeSchema = z.enum([
  'project',
  'section',
  'task',
  'milestone',
  'reflection',
  'agent_connection',
]);
export type ActivityEntityType = z.infer<typeof ActivityEntityTypeSchema>;

/**
 * `entity.verb`, e.g. `task.completed`. Deliberately not an enum: §57 names no action
 * list, and every later slice adds verbs — an enum would make each of them edit this
 * package for nothing. The shape is still checked, so typos fail loudly: exactly two
 * lowercase snake_case segments, matching `ActivityEntityType`'s spelling. No digits,
 * no hyphens, no third segment.
 */
export const ActivityActionSchema = z.string().regex(/^[a-z_]+\.[a-z_]+$/);
export type ActivityAction = z.infer<typeof ActivityActionSchema>;

/**
 * **The identity an event keeps when its target is gone** (§57; Slice 36;
 * docs/decisions/2026-09-historical-activity-identity.md).
 *
 * Undo of a creation deletes the row it created. Without this, the feed row describing that
 * creation would name an id nothing resolves, and load-time integrity would reject the document.
 * The alternative — a canonical tombstone row — would keep the deleted work visible in ordinary
 * views and in Archive, which is exactly what Undo is for removing. So the **event** captures the
 * identity instead, at the moment it is written and while the target is still readable.
 *
 * It is a record of what was true then, not a live reference: an entity that later moves keeps the
 * owning context its event captured. There is no executable inverse here and no caller-supplied
 * history — `ActivityService` validates and captures this itself, inside the caller's unit of work.
 */
export const ActivityHistoricalContextSchema = z.strictObject({
  /** The target as it was: kind, id and the label the feed shows once the row is gone. */
  targetKind: ActivityEntityTypeSchema,
  targetId: z.string().min(1),
  /** A readable name, never blank — a titleless reflection gets a stable fallback. */
  targetLabel: z.string().min(1),
  /** The project that owned the target, and the root of its tree. Absent together. */
  projectId: ProjectIdSchema.optional(),
  rootProjectId: ProjectIdSchema.optional(),
});
export type ActivityHistoricalContext = z.infer<typeof ActivityHistoricalContextSchema>;

/**
 * The context must agree with the event's own identity fields. Shared by the event and the feed
 * entry, so the two cannot drift, and asserted at parse time so a hand-edited document cannot
 * launder one entity's audit line into another's.
 */
export const assertContextAgreesWithEvent = (
  event: {
    entityType: z.infer<typeof ActivityEntityTypeSchema>;
    entityId: string;
    projectId?: string;
    context: ActivityHistoricalContext;
  },
  ctx: z.RefinementCtx,
): void => {
  const { context } = event;
  if (context.targetKind !== event.entityType) {
    ctx.addIssue({ code: 'custom', path: ['context', 'targetKind'], message: 'the captured kind is the event’s own' });
  }
  if (context.targetId !== event.entityId) {
    ctx.addIssue({ code: 'custom', path: ['context', 'targetId'], message: 'the captured id is the event’s own' });
  }
  if (context.projectId !== event.projectId) {
    ctx.addIssue({ code: 'custom', path: ['context', 'projectId'], message: 'the captured project is the event’s own' });
  }
  if ((context.rootProjectId === undefined) !== (context.projectId === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['context', 'rootProjectId'], message: 'a captured project names its root' });
  }
};

/**
 * The event's own fields, **exported** so `ActivityFeedEntrySchema` below can extend them.
 *
 * Extending the *refined* `ActivityEventSchema` would also compile — Zod 4's `superRefine`
 * returns the same object schema — but it would run the attribution check twice on every
 * feed entry, and it would hide which schema the rule belongs to. Both schemas are built
 * from this one shape and share `assertActorIsAttributable`, so the two cannot drift.
 */
export const ActivityEventShape = z.object({
  id: ActivityEventIdSchema,
  workspaceId: WorkspaceIdSchema,

  actor: ActivityActorSchema,
  /** Absent on system events. */
  actorUserId: UserIdSchema.optional(),
  /** Present on agent events — which connection did it (§52, §57). */
  actorAgentConnectionId: AgentConnectionIdSchema.optional(),

  action: ActivityActionSchema,
  entityType: ActivityEntityTypeSchema,
  entityId: z.string().min(1),
  /** The project the event happened in, when there is one — §57's example shows it. */
  projectId: ProjectIdSchema.optional(),

  /** The human-readable line the feed renders, e.g. `Completed "Configure deployment"`. */
  summary: z.string().min(1),

  /**
   * Required since schema version 5: the audit line outlives its target (§57). An
   * `agent_connection` event omits `projectId` and `rootProjectId`, because a connection belongs
   * to no project.
   */
  context: ActivityHistoricalContextSchema,

  createdAt: IsoDateTimeSchema,
});

/**
 * §57 requires the UI to tell the three actors apart, so an event has to be attributable:
 * a user action names the user, an agent action names the connection that made it, and a
 * system action names neither. Without this, an agent write could be recorded that the
 * activity feed cannot attribute to anything.
 *
 * Typed over the three attribution fields alone, so an Undo record — which answers "whose
 * record is this?" with the same fields — shares the rule instead of copying it.
 */
export const assertActorIsAttributable = (
  event: Pick<z.infer<typeof ActivityEventShape>, 'actor' | 'actorUserId' | 'actorAgentConnectionId'>,
  ctx: z.RefinementCtx,
): void => {
  if (event.actor === 'user' && event.actorUserId === undefined) {
    ctx.addIssue({ code: 'custom', path: ['actorUserId'], message: 'a user event must name the user' });
  }

  if (event.actor === 'agent' && event.actorAgentConnectionId === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['actorAgentConnectionId'],
      message: 'an agent event must name the connection that made it',
    });
  }

  if (event.actor === 'system' && (event.actorUserId !== undefined || event.actorAgentConnectionId !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['actor'], message: 'a system event has no actor id' });
  }
};

export const ActivityEventSchema = ActivityEventShape.superRefine((event, ctx) => {
  assertActorIsAttributable(event, ctx);
  assertContextAgreesWithEvent(event, ctx);
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

/**
 * One row of §57's feed, with the names it renders already resolved.
 *
 * The feed **composes** its line from these parts rather than printing the event's stored
 * `summary` — see docs/decisions/2026-08-activity-feed-composes-from-parts.md. `summary`
 * freezes the entity's title at write time, so a renamed task would keep printing its old
 * name forever; `entityTitle` is read live and does not.
 *
 * `entityTitle` and `projectName` are optional because neither is always available: an
 * `agent_connection` event has no project at all, and an event whose target has since been
 * removed from a hand-edited `data.json` still has to render.
 */
export const ActivityFeedEntrySchema = ActivityEventShape.extend({
  /** The user's name, the connection's name, or `System` — whichever the actor is. */
  actorName: z.string().min(1),
  entityTitle: z.string().min(1).optional(),
  projectName: z.string().min(1).optional(),
}).superRefine((entry, ctx) => {
  assertActorIsAttributable(entry, ctx);
  assertContextAgreesWithEvent(entry, ctx);
});
export type ActivityFeedEntry = z.infer<typeof ActivityFeedEntrySchema>;
