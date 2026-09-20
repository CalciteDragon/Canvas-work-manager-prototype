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
  // Slice 36 gives row writes their history receipt. Project writes keep their historical bare
  // result, so the feed assertion deliberately accepts both wire shapes.
  const entityIdOf = (result: unknown): string => {
    const value = result as { id?: string; task?: { id: string }; reflection?: { id: string } };
    return value.task?.id ?? value.reflection?.id ?? value.id!;
  };

  type ActivityCase = {
    name: string;
    permission: 'projects.write' | 'tasks.write' | 'reflections.write';
    input: unknown;
    action: string;
    prepare?: () => Promise<void>;
  };
  const cases: ActivityCase[] = [
    { name: 'create_project', permission: 'projects.write', input: { kind: 'root', name: 'Agent-made project' }, action: 'project.created' },
    { name: 'update_project', permission: 'projects.write', input: { projectId: PROJECT, description: 'Rewritten.' }, action: 'project.updated' },
    { name: 'archive_project', permission: 'projects.write', input: { projectId: 'project-agent-kitchen' }, action: 'project.archived' },
    { name: 'restore_project', permission: 'projects.write', input: { projectId: 'project-agent-kitchen', status: 'active' }, action: 'project.updated', prepare: async () => {
      await harness.registry.call('archive_project', { projectId: 'project-agent-kitchen' }, agent(['projects.write']));
    } },
    { name: 'create_task', permission: 'tasks.write', input: { projectId: PROJECT, title: 'Wire the transport' }, action: 'task.created' },
    { name: 'update_task', permission: 'tasks.write', input: { taskId: OPEN_TASK, priority: 'high' }, action: 'task.updated' },
    // Not `task-agent-deployment`: it is already done, and completing a done task is
    // idempotent — it records nothing, so the assertion would read a stale seed event.
    { name: 'complete_task', permission: 'tasks.write', input: { taskId: OPEN_TASK }, action: 'task.completed' },
    { name: 'archive_task', permission: 'tasks.write', input: { taskId: OPEN_TASK }, action: 'task.archived' },
    { name: 'restore_task', permission: 'tasks.write', input: { taskId: OPEN_TASK }, action: 'task.restored', prepare: async () => {
      await harness.registry.call('archive_task', { taskId: OPEN_TASK }, agent(['tasks.write']));
    } },
    { name: 'add_reflection', permission: 'reflections.write', input: { projectId: PROJECT, body: 'Worth writing down.' }, action: 'reflection.added' },
    { name: 'archive_reflection', permission: 'reflections.write', input: { reflectionId: 'reflection-agent-scope' }, action: 'reflection.archived' },
    { name: 'restore_reflection', permission: 'reflections.write', input: { reflectionId: 'reflection-agent-scope' }, action: 'reflection.restored', prepare: async () => {
      await harness.registry.call('archive_reflection', { reflectionId: 'reflection-agent-scope' }, agent(['reflections.write']));
    } },
  ];

  for (const { name, permission, input, action, prepare } of cases) {
    it(`${name} records ${action}, attributed to the connection that made it`, async () => {
      await prepare?.();
      const result = await harness.registry.call(name, input, agent([permission]));

      const event = await newest();

      expect(event.action).toBe(action);
      expect(event.entityId).toBe(entityIdOf(result));
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
    ));

    const event = await newest();

    expect(event.entityId).toBe(entityIdOf(created));
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
