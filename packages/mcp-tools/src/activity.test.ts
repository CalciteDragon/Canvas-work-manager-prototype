import { beforeEach, describe, expect, it } from 'vitest';
import { agent, buildHarness, OPEN_TASK, PROJECT, user } from '../test/harness';

/**
 * §57: "Every MCP mutation should produce an event", and the UI must be able to tell user,
 * agent and system actions apart. Proven at the layer that produces the event rather than
 * at the transport, so it stays true for stdio, HTTP and any in-process caller alike.
 */
describe('§57 activity from a tool call', () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    harness = buildHarness();
  });

  /** Read back as the *person*: `ActivityService.list` asserts `workspace.read`. */
  const newest = async () => (await harness.activity.list(user(), { limit: 1 }))[0]!;

  const cases: [name: string, permission: 'projects.write' | 'tasks.write' | 'reflections.write', input: unknown, action: string][] = [
    ['create_project', 'projects.write', { name: 'Agent-made project' }, 'project.created'],
    ['update_project', 'projects.write', { projectId: PROJECT, description: 'Rewritten.' }, 'project.updated'],
    ['create_task', 'tasks.write', { projectId: PROJECT, title: 'Wire the transport' }, 'task.created'],
    ['update_task', 'tasks.write', { taskId: OPEN_TASK, priority: 'high' }, 'task.updated'],
    // Not `task-agent-deployment`: it is already done, and completing a done task is
    // idempotent — it records nothing, so the assertion would read a stale seed event.
    ['complete_task', 'tasks.write', { taskId: OPEN_TASK }, 'task.completed'],
    ['add_reflection', 'reflections.write', { projectId: PROJECT, body: 'Worth writing down.' }, 'reflection.added'],
  ];

  for (const [name, permission, input, action] of cases) {
    it(`${name} records ${action}, attributed to the connection that made it`, async () => {
      const result = (await harness.registry.call(name, input, agent([permission]))) as { id: string };

      const event = await newest();

      expect(event.action).toBe(action);
      expect(event.entityId).toBe(result.id);
      expect(event.actor).toBe('agent');
      // Resolved from the connection record, not from anything this test asserted into it.
      expect(event.actorName).toBe('Claude');
      expect(event.actorAgentConnectionId).toBe('agent-claude');
    });
  }

  it('tells an agent’s action apart from the same action taken by a person', async () => {
    await harness.registry.call('create_task', { projectId: PROJECT, title: 'By an agent' }, agent(['tasks.write']));
    const byAgent = await newest();

    await harness.services.tasks.create(user(), { projectId: PROJECT, title: 'By a person' });
    const byUser = await newest();

    expect(byAgent.actor).toBe('agent');
    expect(byUser.actor).toBe('user');
    expect(byUser.actorAgentConnectionId).toBeUndefined();
    expect(byUser.actorName).not.toBe(byAgent.actorName);
  });

  it('carries the live entity title and project name §57’s card renders', async () => {
    const created = (await harness.registry.call(
      'create_task',
      { projectId: PROJECT, title: 'Configure the second deployment' },
      agent(['tasks.write']),
    )) as { id: string };

    const event = await newest();

    expect(event.entityId).toBe(created.id);
    expect(event.entityTitle).toBe('Configure the second deployment');
    expect(event.projectName).toBe('Work Manager');
  });

  it('records nothing when a call is denied', async () => {
    const before = (await harness.activity.list(user(), {})).length;

    await expect(
      harness.registry.call('create_task', { projectId: PROJECT, title: 'Refused' }, agent(['tasks.read'])),
    ).rejects.toThrow();

    expect((await harness.activity.list(user(), {})).length).toBe(before);
  });
});
