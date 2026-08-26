import { describe, expect, it } from 'vitest';
import { ActivityActorSchema, ActivityEntityTypeSchema, ActivityEventSchema } from './activity';

const event = {
  id: 'activity-1',
  workspaceId: 'workspace-a',
  actor: 'user',
  actorUserId: 'user-a',
  action: 'task.completed',
  entityType: 'task',
  entityId: 'task-123',
  projectId: 'project-a',
  summary: 'Completed "Configure deployment"',
  createdAt: '2026-08-26T11:32:00.000Z',
};

describe('ActivityEventSchema', () => {
  it('distinguishes user, agent and system actors (§57)', () => {
    expect(ActivityEventSchema.parse(event).actor).toBe('user');

    const agentEvent = ActivityEventSchema.parse({
      ...event,
      actor: 'agent',
      actorUserId: 'user-a',
      actorAgentConnectionId: 'agent-1',
    });
    expect(agentEvent.actorAgentConnectionId).toBe('agent-1');

    const systemEvent = ActivityEventSchema.parse({
      ...event,
      actor: 'system',
      actorUserId: undefined,
      action: 'workspace.seeded',
      entityType: 'project',
    });
    expect(systemEvent.actorUserId).toBeUndefined();
  });

  it('requires an event to be attributable to what acted (§57)', () => {
    const { actorUserId, ...unattributed } = event;
    expect(ActivityEventSchema.safeParse(unattributed).success).toBe(false);

    expect(ActivityEventSchema.safeParse({ ...unattributed, actor: 'agent' }).success).toBe(false);

    expect(ActivityEventSchema.safeParse({ ...event, actor: 'system' }).success).toBe(false);
  });

  it('rejects an actor kind the UI has no rendering for', () => {
    expect(ActivityEventSchema.safeParse({ ...event, actor: 'robot' }).success).toBe(false);
    expect(ActivityActorSchema.options).toEqual(['user', 'agent', 'system']);
  });

  it('rejects an entity type outside the §14 collections', () => {
    expect(ActivityEventSchema.safeParse({ ...event, entityType: 'widget' }).success).toBe(false);
    expect(ActivityEntityTypeSchema.options).toEqual([
      'project',
      'section',
      'task',
      'milestone',
      'reflection',
      'agent_connection',
    ]);
  });

  it('requires actions to read entity.verb, but does not enumerate them', () => {
    expect(ActivityEventSchema.parse({ ...event, action: 'reflection.added' }).action).toBe('reflection.added');
    expect(ActivityEventSchema.safeParse({ ...event, action: 'completed' }).success).toBe(false);
    expect(ActivityEventSchema.safeParse({ ...event, action: 'Task.Completed' }).success).toBe(false);
  });
});
