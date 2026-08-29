import type { AgentConnectionId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { agentActorFor, buildHarness } from '../test/test-support';
import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from './errors';

const CLAUDE = 'agent-claude' as AgentConnectionId;
const THEIRS = 'agent-theirs' as AgentConnectionId;

describe('AgentConnectionService', () => {
  it('lists only the connections the acting person owns', async () => {
    const harness = buildHarness();

    const mine = await harness.agentService.list(harness.actor);

    expect(mine.map(({ id }) => id)).toEqual(['agent-claude', 'agent-cursor']);
  });

  it('treats another person’s connection as not found rather than forbidden', async () => {
    const harness = buildHarness();

    await expect(harness.agentService.get(harness.actor, THEIRS)).rejects.toThrow(EntityNotFoundError);
  });

  /**
   * The hole both plan reviewers found. An agent that could edit connections could grant
   * itself the permission it was just denied, or un-revoke itself after being revoked —
   * which would make every other check in this slice decorative.
   */
  it('refuses an agent actor on every method, however permissive its grant', async () => {
    const harness = buildHarness();
    const agent = agentActorFor(0, ['projects.read', 'projects.write', 'tasks.read', 'tasks.write', 'workspace.read']);

    await expect(harness.agentService.list(agent)).rejects.toThrow(PermissionDeniedError);
    await expect(harness.agentService.get(agent, CLAUDE)).rejects.toThrow(PermissionDeniedError);
    await expect(harness.agentService.updatePermissions(agent, CLAUDE, ['tasks.write'])).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(harness.agentService.revoke(agent, CLAUDE)).rejects.toThrow(PermissionDeniedError);
  });

  it('replaces the whole permission set and records who changed it', async () => {
    const harness = buildHarness();

    const updated = await harness.agentService.updatePermissions(harness.actor, CLAUDE, ['projects.read', 'tasks.read']);

    expect(updated.permissions).toEqual(['projects.read', 'tasks.read']);
    expect(await harness.agentService.get(harness.actor, CLAUDE)).toMatchObject({
      permissions: ['projects.read', 'tasks.read'],
    });
    const [event] = await harness.activities.list();
    expect(event).toMatchObject({
      action: 'agent_connection.updated',
      entityType: 'agent_connection',
      entityId: CLAUDE,
      actor: 'user',
    });
  });

  it('revokes, records it, and stays revoked when revoked again', async () => {
    const harness = buildHarness();

    const revoked = await harness.agentService.revoke(harness.actor, CLAUDE);
    const again = await harness.agentService.revoke(harness.actor, CLAUDE);

    expect([revoked.revoked, again.revoked]).toEqual([true, true]);
    // Idempotent, but not silent twice: a second revoke of an already-revoked connection
    // changed nothing, so it writes no second event.
    expect((await harness.activities.list()).filter(({ action }) => action === 'agent_connection.revoked')).toHaveLength(
      1,
    );
  });

  it('refuses to widen a revoked connection, which would silently bring it back', async () => {
    const harness = buildHarness();
    await harness.agentService.revoke(harness.actor, CLAUDE);

    await expect(harness.agentService.updatePermissions(harness.actor, CLAUDE, ['tasks.write'])).rejects.toThrow(
      DomainRuleError,
    );
  });

  it('stamps lastUsedAt from the clock, so §53 can say how long ago', async () => {
    const harness = buildHarness();

    await harness.agentService.touch(CLAUDE);

    expect((await harness.agents.find(CLAUDE))?.lastUsedAt).toBe(harness.clock.now().toISOString());
  });

  /**
   * `touch` runs on every authenticated call, and a unit of work clones and revalidates
   * the whole document before rewriting the file. Unthrottled, every agent *read* would
   * cost a full persist.
   */
  it('does not write again inside the throttle window', async () => {
    const harness = buildHarness();
    await harness.agentService.touch(CLAUDE);
    const persistsAfterFirst = harness.store.persistCalls;

    await harness.agentService.touch(CLAUDE);

    expect(harness.store.persistCalls).toBe(persistsAfterFirst);
  });

  it('writes again once the clock has moved past the window', async () => {
    const harness = buildHarness();
    await harness.agentService.touch(CLAUDE);
    const persistsAfterFirst = harness.store.persistCalls;

    harness.clock.setNow(new Date(harness.clock.now().getTime() + 61_000));
    await harness.agentService.touch(CLAUDE);

    expect(harness.store.persistCalls).toBe(persistsAfterFirst + 1);
    expect((await harness.agents.find(CLAUDE))?.lastUsedAt).toBe(harness.clock.now().toISOString());
  });

  /**
   * §46's Current Date control moves the clock backwards as readily as forwards. Compared
   * one-directionally, a stamp left in the future would suppress every later touch.
   */
  it('writes again when the clock has moved backwards past the window', async () => {
    const harness = buildHarness();
    await harness.agentService.touch(CLAUDE);
    const persistsAfterFirst = harness.store.persistCalls;

    harness.clock.setNow(new Date(harness.clock.now().getTime() - 61_000));
    await harness.agentService.touch(CLAUDE);

    expect(harness.store.persistCalls).toBe(persistsAfterFirst + 1);
  });

  it('ignores a touch for a connection that does not exist', async () => {
    const harness = buildHarness();

    await expect(harness.agentService.touch('agent-missing' as AgentConnectionId)).resolves.toBeUndefined();
  });
});
