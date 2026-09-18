import { ActivityEventSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { actorFor, agentActorFor, buildHarness, seedContainer, MINE, THEIRS } from '../test/test-support';
import type { LivePublication } from './live-events';
import { PermissionDeniedError } from './errors';
import type { ActorContext } from './actor';

const at = (iso: string) => new Date(iso);

describe('ActivityService.record', () => {
  it('records an attributable event for every mutation this slice introduces', async () => {
    const harness = buildHarness();
    await seedContainer(harness, MINE);

    const project = await harness.projectService.create(harness.actor, { kind: 'root',
      workspaceId: harness.actor.workspaceId,
      name: 'Work Manager',
    });
    await harness.projectService.update(harness.actor, project.id, { name: 'Renamed' });
    await harness.projectService.archive(harness.actor, project.id);

    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Configure deployment' });
    await harness.taskService.update(harness.actor, task.id, { priority: 'high' });
    await harness.taskService.complete(harness.actor, task.id);
    await harness.taskService.archive(harness.actor, task.id);

    const events = await harness.activity.list(harness.actor);

    expect(events.map((event) => event.action).sort()).toEqual([
      'project.archived',
      'project.created',
      'project.updated',
      'task.archived',
      'task.completed',
      'task.created',
      'task.updated',
    ]);
    for (const event of events) {
      expect(() => ActivityEventSchema.parse(event)).not.toThrow();
      expect(event).toMatchObject({ actor: 'user', actorUserId: harness.actor.userId });
      expect(event.summary.length).toBeGreaterThan(0);
      expect(event.projectId).toBeDefined();
    }
  });

  it('writes §57’s feed line, naming the entity', async () => {
    const harness = buildHarness();
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Configure deployment' });

    await harness.taskService.complete(harness.actor, task.id);

    expect((await harness.activity.list(harness.actor))[0]?.summary).toBe('Completed "Configure deployment"');
  });

  it('records agent and system events without a user id', async () => {
    const harness = buildHarness();
    const agent: ActorContext = {
      actor: 'agent',
      workspaceId: harness.actor.workspaceId,
      agentConnectionId: 'agent-claude' as never,
      permissions: [],
    };
    const system: ActorContext = { actor: 'system', workspaceId: harness.actor.workspaceId };

    // A real row: since version 5 an event captures its target's identity, so `record` refuses an
    // entry naming a target it cannot resolve rather than writing an audit line nothing backs.
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Configure deployment' });
    const agentEvent = await harness.activity.record(agent, {
      action: 'task.completed',
      entityType: 'task',
      entityId: task.id,
      projectId: MINE,
      summary: 'Completed "Configure deployment"',
    });
    const systemEvent = await harness.activity.record(system, {
      action: 'project.updated',
      entityType: 'project',
      entityId: MINE,
      summary: 'Recalculated progress',
    });

    expect(agentEvent).toMatchObject({ actor: 'agent', actorAgentConnectionId: 'agent-claude' });
    expect(agentEvent.actorUserId).toBeUndefined();
    expect(systemEvent.actorUserId).toBeUndefined();
    expect(systemEvent.actorAgentConnectionId).toBeUndefined();
  });
});

describe('ActivityService.list', () => {
  it('returns events newest first', async () => {
    const harness = buildHarness();
    await seedContainer(harness, MINE);
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'First' });
    harness.clock.setNow(at('2026-08-25T09:00:00.000Z'));
    await harness.taskService.update(harness.actor, task.id, { priority: 'high' });
    harness.clock.setNow(at('2026-08-26T09:00:00.000Z'));
    await harness.taskService.complete(harness.actor, task.id);

    expect((await harness.activity.list(harness.actor)).map((event) => event.action)).toEqual([
      'task.completed',
      'task.updated',
      'task.created',
    ]);
  });

  it('breaks createdAt ties by insertion order, newest first', async () => {
    const harness = buildHarness();

    // The clock never advances, so both events share a createdAt to the millisecond.
    const first = await harness.activity.record(harness.actor, {
      action: 'task.created',
      entityType: 'project',
      entityId: MINE,
      summary: 'First',
    });
    const second = await harness.activity.record(harness.actor, {
      action: 'task.updated',
      entityType: 'project',
      entityId: MINE,
      summary: 'Second',
    });

    expect(first.createdAt).toBe(second.createdAt);
    expect((await harness.activity.list(harness.actor)).map((event) => event.summary)).toEqual(['Second', 'First']);
  });

  it('scopes to the actor’s workspace and applies limit after sorting', async () => {
    const harness = buildHarness();
    await seedContainer(harness, MINE);
    await seedContainer(harness, THEIRS);
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Mine' });
    harness.clock.setNow(at('2026-08-25T09:00:00.000Z'));
    await harness.taskService.create(harness.other, { projectId: THEIRS, title: 'Theirs' });

    const mine = await harness.activity.list(harness.actor);
    const theirs = await harness.activity.list(harness.other);

    expect(mine.map((event) => event.summary)).toEqual(['Created "Mine"']);
    expect(theirs.map((event) => event.summary)).toEqual(['Created "Theirs"']);
    expect(await harness.activity.list(actorFor(0), { limit: 1 })).toHaveLength(1);
  });

  it('filters by project', async () => {
    const harness = buildHarness();
    await seedContainer(harness, MINE);
    const other = await harness.projectService.create(harness.actor, { kind: 'root',
      workspaceId: harness.actor.workspaceId,
      name: 'Other',
    });
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'In mine' });

    expect(await harness.activity.list(harness.actor, { projectId: MINE })).toHaveLength(1);
    expect(await harness.activity.list(harness.actor, { projectId: other.id })).toHaveLength(1);
  });
});

describe('activity and the unit of work', () => {
  it('rolls the event back with the mutation that failed', async () => {
    const harness = buildHarness();
    const child = await harness.projectService.create(harness.actor, { kind: 'subproject',
      workspaceId: harness.actor.workspaceId,
      name: 'Child',
      parentProjectId: MINE,
    });
    const before = await harness.activity.list(harness.actor);

    await expect(harness.projectService.archive(harness.actor, MINE)).rejects.toThrow();

    expect(await harness.activity.list(harness.actor)).toHaveLength(before.length);
    expect((await harness.projectService.get(harness.actor, child.id)).status).not.toBe('archived');
  });

  it('does not persist a mutation made outside a unit of work', async () => {
    const harness = buildHarness();

    // assertCanMutateDataStore permits a write when no unit of work exists anywhere, so a
    // forgotten run() fails silently into memory. Only entry-point service methods open one.
    await harness.activity.record(harness.actor, {
      action: 'task.created',
      entityType: 'project',
      entityId: MINE,
      summary: 'Orphan',
    });

    expect(harness.store.persistCalls).toBe(0);
  });
});

describe('ActivityService.list resolves §57’s names', () => {
  it('names a user actor by the person, an agent by the connection, and a system act "System"', async () => {
    const harness = buildHarness();
    await seedContainer(harness, MINE);
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'By a person' });
    await harness.taskService.create(agentActorFor(0, ['tasks.write']), { projectId: MINE, title: 'By an agent' });
    await harness.activity.record(
      { actor: 'system', workspaceId: harness.actor.workspaceId },
      { action: 'project.updated', entityType: 'project', entityId: MINE, projectId: MINE, summary: 'Swept' },
    );

    const feed = await harness.activity.list(harness.actor);

    expect(feed.map(({ actor, actorName }) => [actor, actorName])).toEqual([
      ['system', 'System'],
      ['agent', 'Claude'],
      ['user', 'Demo User'],
    ]);
  });

  /**
   * The whole reason the feed composes rather than printing `summary`
   * (docs/decisions/2026-08-activity-feed-composes-from-parts.md): a frozen line keeps
   * naming the entity as it was when the event was written.
   */
  it('reads the entity title live, so a rename is reflected and summary is not', async () => {
    const harness = buildHarness();
    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Configure deployment' });
    await harness.taskService.update(harness.actor, task.id, { title: 'Configure the deploy pipeline' });

    // The *creation* event: its frozen summary still names the task as it was, while the
    // resolved title names it as it is. Both are visible here, which is the whole argument.
    const creation = (await harness.activity.list(harness.actor)).find(({ action }) => action === 'task.created');

    expect(creation?.summary).toBe('Created "Configure deployment"');
    expect(creation?.entityTitle).toBe('Configure the deploy pipeline');
  });

  it('names the project a row came from, because a feed mixes projects', async () => {
    const harness = buildHarness();
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Somewhere' });

    expect((await harness.activity.list(harness.actor))[0]?.projectName).toBe('Project project-mine');
  });

  it('leaves the project out of an agent_connection event, which belongs to no project', async () => {
    const harness = buildHarness();
    await harness.agentService.revoke(harness.actor, 'agent-cursor' as never);

    const [event] = await harness.activity.list(harness.actor);

    expect(event).toMatchObject({ entityType: 'agent_connection', entityTitle: 'Cursor', actorName: 'Demo User' });
    expect(event?.projectName).toBeUndefined();
  });

  it('refuses an agent that was not granted workspace.read', async () => {
    const harness = buildHarness();

    await expect(harness.activity.list(agentActorFor(0, ['tasks.read']))).rejects.toThrow(PermissionDeniedError);
  });
});

/**
 * §62's live frames ride the §57 record, so this is where the two are pinned together.
 * See docs/decisions/2026-08-live-events-ride-the-activity-record.md.
 */
describe('ActivityService.record — live events (§62)', () => {
  const recording = () => {
    const published: LivePublication[] = [];
    return { published, publisher: { publish: (publication: LivePublication) => void published.push(publication) } };
  };

  it('publishes the recorded activity as a live event', async () => {
    const { published, publisher } = recording();
    const harness = buildHarness(undefined, { events: publisher });
    await seedContainer(harness, MINE);

    const task = await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Configure deployment' });
    await harness.taskService.complete(harness.actor, task.id);

    expect(published).toEqual([
      {
        workspaceId: harness.actor.workspaceId,
        // `rootProjectId` equals `projectId` here: `project-mine` is a root. It differs — and
        // earns its place — when the change is on a sub-project; see the descendant case below.
        event: { type: 'task.created', entityType: 'task', entityId: task.id, projectId: MINE, rootProjectId: MINE },
      },
      {
        workspaceId: harness.actor.workspaceId,
        event: { type: 'task.completed', entityType: 'task', entityId: task.id, projectId: MINE, rootProjectId: MINE },
      },
    ]);
  });

  it('records nothing extra when no publisher is wired', async () => {
    const harness = buildHarness();

    await expect(
      harness.taskService.create(harness.actor, { projectId: MINE, title: 'No stream attached' }),
    ).resolves.toMatchObject({ title: 'No stream attached' });
  });

  it('publishes only after the event is in the repository', async () => {
    const seen: number[] = [];
    const harness = buildHarness(undefined, {
      events: { publish: () => void seen.push(harness.store.snapshot().activityEvents.length) },
    });

    await seedContainer(harness, MINE);
    await harness.taskService.create(harness.actor, { projectId: MINE, title: 'Ordering' });

    // Read inside the open unit of work, so this is the count the publisher could observe.
    expect(seen).toEqual([1]);
  });

  it('publishes an agent mutation under the agent’s workspace', async () => {
    const { published, publisher } = recording();
    const harness = buildHarness(undefined, { events: publisher });
    await seedContainer(harness, MINE);

    await harness.taskService.create(agentActorFor(0, ['tasks.write']), { projectId: MINE, title: 'From an agent' });

    expect(published).toHaveLength(1);
    expect(published[0]?.workspaceId).toBe(harness.actor.workspaceId);
    expect(published[0]?.event.type).toBe('task.created');
  });
});
