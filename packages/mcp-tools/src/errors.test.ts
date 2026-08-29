import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from '@cwm/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { UnknownToolError } from './errors';
import { agent, buildHarness, FOREIGN_PROJECT, OPEN_TASK, PROJECT } from '../test/harness';

/**
 * What a caller's mistake looks like at this layer. Nothing is mapped to a status here —
 * that is the transport's job (Slice 15's, as `api/errors.ts` is HTTP's) — so these assert
 * the *type* that reaches it.
 */
describe('errors from a tool call', () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    harness = buildHarness();
  });

  it('raises UnknownToolError for a name that is not registered', async () => {
    await expect(harness.registry.call('drop_database', {}, agent(['tasks.write']))).rejects.toThrow(UnknownToolError);
  });

  it('raises ZodError before any service is reached', async () => {
    // No title, which `CreateTaskInputSchema` requires.
    await expect(harness.registry.call('create_task', { projectId: PROJECT }, agent(['tasks.write']))).rejects.toThrow(
      ZodError,
    );

    expect(harness.store.persistCalls).toBe(0);
  });

  it('raises ZodError for a well-typed input with an out-of-range value', async () => {
    await expect(
      harness.registry.call('get_upcoming_work', { days: 400 }, agent(['workspace.read'])),
    ).rejects.toThrow(ZodError);
  });

  it('raises EntityNotFoundError for an id that does not exist', async () => {
    await expect(harness.registry.call('get_task', { taskId: 'task-nope' }, agent(['tasks.read']))).rejects.toThrow(
      EntityNotFoundError,
    );
  });

  it('raises EntityNotFoundError — not PermissionDeniedError — for another workspace’s project', async () => {
    // The distinction is the point: a 403 here would confirm that a project belonging to
    // someone else exists, which is exactly what Slice 13 refused to do.
    const call = harness.registry.call('get_project', { projectId: FOREIGN_PROJECT }, agent(['projects.read']));

    await expect(call).rejects.toThrow(EntityNotFoundError);
    await expect(call).rejects.not.toThrow(PermissionDeniedError);
  });

  it('hides a foreign id from a write too, rather than reporting a rule violation', async () => {
    await expect(
      harness.registry.call('create_task', { projectId: FOREIGN_PROJECT, title: 'Sneak in' }, agent(['tasks.write'])),
    ).rejects.toThrow(EntityNotFoundError);

    expect(harness.store.persistCalls).toBe(0);
  });

  it('raises DomainRuleError when the caller breaks a rule', async () => {
    // A subtask must share its parent's project; `task-ops-review` lives in the other one.
    await expect(
      harness.registry.call(
        'create_task',
        { projectId: PROJECT, title: 'Orphan', parentTaskId: 'task-ops-review' },
        agent(['tasks.write']),
      ),
    ).rejects.toThrow(DomainRuleError);
  });

  it('names both the connection and the missing permission when a grant falls short', async () => {
    await expect(
      harness.registry.call('complete_task', { taskId: OPEN_TASK }, agent(['tasks.read'])),
    ).rejects.toThrow(
      'connection "agent-claude" is missing permission "tasks.write"',
    );
  });
});
