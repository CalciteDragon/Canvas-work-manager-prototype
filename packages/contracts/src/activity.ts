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

const ActivityEventShape = z.object({
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
 * system action names neither. Without this, Slice 13 could record an agent write that
 * the activity feed cannot attribute to anything.
 */
export const ActivityEventSchema = ActivityEventShape.superRefine((event, ctx) => {
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
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
