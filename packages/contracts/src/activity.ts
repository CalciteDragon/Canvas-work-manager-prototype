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
 * The event's own fields, **exported** so `ActivityFeedEntrySchema` below can extend them.
 * `ActivityEventSchema` is a `superRefine` wrapper, and a refined schema in Zod 4 is no
 * longer an object type — there is nothing on it to `.extend()`. Both schemas are built
 * from this shape and share `assertActorIsAttributable`, so the two can never drift.
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

  createdAt: IsoDateTimeSchema,
});

/**
 * §57 requires the UI to tell the three actors apart, so an event has to be attributable:
 * a user action names the user, an agent action names the connection that made it, and a
 * system action names neither. Without this, an agent write could be recorded that the
 * activity feed cannot attribute to anything.
 */
export const assertActorIsAttributable = (
  event: z.infer<typeof ActivityEventShape>,
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

export const ActivityEventSchema = ActivityEventShape.superRefine(assertActorIsAttributable);
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
}).superRefine(assertActorIsAttributable);
export type ActivityFeedEntry = z.infer<typeof ActivityFeedEntrySchema>;
