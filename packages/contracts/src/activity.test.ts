import { describe, expect, it } from 'vitest';
import { ActivityActorSchema, ActivityEntityTypeSchema, ActivityEventSchema, ActivityFeedEntrySchema } from './activity';

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

describe('ActivityFeedEntrySchema', () => {
  const base = {
    id: 'activity-1',
    workspaceId: 'workspace-demo',
    action: 'task.completed',
    entityType: 'task',
    entityId: 'task-1',
    summary: 'Completed "Configure deployment"',
    createdAt: '2026-08-24T16:00:00.000Z',
  };

  it('carries the names §57 renders, with the entity title read live', () => {
    const entry = ActivityFeedEntrySchema.parse({
      ...base,
      actor: 'agent',
      actorAgentConnectionId: 'agent-claude',
      projectId: 'project-work-manager',
      actorName: 'Claude',
      entityTitle: 'Configure deployment',
      projectName: 'Work Manager',
    });

    expect([entry.actorName, entry.entityTitle, entry.projectName]).toEqual([
      'Claude',
      'Configure deployment',
      'Work Manager',
    ]);
  });

  it('allows an entry with no project — an agent_connection event has none', () => {
    const entry = ActivityFeedEntrySchema.parse({
      ...base,
      action: 'agent_connection.revoked',
      entityType: 'agent_connection',
      entityId: 'agent-claude',
      actor: 'user',
      actorUserId: 'user-demo',
      actorName: 'Demo User',
    });

    expect([entry.projectName, entry.entityTitle]).toEqual([undefined, undefined]);
  });

  it('applies the same attribution rule the event does', () => {
    expect(
      ActivityFeedEntrySchema.safeParse({ ...base, actor: 'agent', actorName: 'Claude' }).success,
    ).toBe(false);
  });
});
