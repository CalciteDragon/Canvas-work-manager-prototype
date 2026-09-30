import { describe, expect, it } from 'vitest';
import {
  ActivityActorSchema,
  ActivityEntityTypeSchema,
  ActivityEventSchema,
  ActivityFeedEntrySchema,
} from './activity';

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
  context: {
    targetKind: 'task',
    targetId: 'task-123',
    targetLabel: 'Configure deployment',
    projectId: 'project-a',
    rootProjectId: 'project-root',
  },
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
      entityId: 'project-a',
      context: { ...event.context, targetKind: 'project', targetId: 'project-a', targetLabel: 'Personal' },
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
    context: {
      targetKind: 'task',
      targetId: 'task-1',
      targetLabel: 'Configure deployment',
      projectId: 'project-work-manager',
      rootProjectId: 'project-work-manager',
    },
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
      context: { targetKind: 'agent_connection', targetId: 'agent-claude', targetLabel: 'Claude' },
    });

    expect([entry.projectName, entry.entityTitle]).toEqual([undefined, undefined]);
  });

  it('applies the same attribution rule the event does', () => {
    expect(
      ActivityFeedEntrySchema.safeParse({ ...base, actor: 'agent', actorName: 'Claude' }).success,
    ).toBe(false);
  });
});

// Slice 36: Undo of a creation deletes the row an event describes, so the event carries the
// identity it needs to stay readable afterwards (§57).
describe('ActivityHistoricalContextSchema', () => {
  it('is required, so no event can be written that its own Undo would orphan', () => {
    const { context, ...withoutContext } = event;
    expect(ActivityEventSchema.safeParse(withoutContext).success).toBe(false);
    expect(ActivityEventSchema.parse(event).context.targetLabel).toBe('Configure deployment');
  });

  it('must agree with the event’s own kind, id and project', () => {
    for (const wrong of [
      { ...event.context, targetKind: 'reflection' },
      { ...event.context, targetId: 'task-999' },
      { ...event.context, projectId: 'project-b' },
    ]) {
      expect(ActivityEventSchema.safeParse({ ...event, context: wrong }).success).toBe(false);
    }
  });

  it('omits project and root together — an agent_connection belongs to no project', () => {
    const connection = {
      ...event,
      action: 'agent_connection.revoked',
      entityType: 'agent_connection',
      entityId: 'agent-1',
      projectId: undefined,
      context: { targetKind: 'agent_connection', targetId: 'agent-1', targetLabel: 'Claude' },
    };
    expect(ActivityEventSchema.parse(connection).context.projectId).toBeUndefined();
    expect(
      ActivityEventSchema.safeParse({
        ...connection,
        context: { ...connection.context, rootProjectId: 'project-a' },
      }).success,
    ).toBe(false);
  });

  it('rejects a blank label, so a titleless reflection needs a real fallback', () => {
    expect(
      ActivityEventSchema.safeParse({ ...event, context: { ...event.context, targetLabel: '' } }).success,
    ).toBe(false);
  });

  it('rejects an unknown captured key', () => {
    expect(
      ActivityEventSchema.safeParse({ ...event, context: { ...event.context, inverse: 'delete' } }).success,
    ).toBe(false);
  });
});
