import type { AgentPermission } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { assertPermitted, assertUserActor, assertValidActor, type ActorContext } from './actor';
import { DomainRuleError, PermissionDeniedError } from './errors';

const workspaceId = 'workspace-1' as ActorContext['workspaceId'];

const agent = (permissions: AgentPermission[]): ActorContext => ({
  actor: 'agent',
  workspaceId,
  agentConnectionId: 'agent-1' as never,
  permissions,
});

describe('assertValidActor', () => {
  it('accepts the three well-formed actors', () => {
    expect(() =>
      assertValidActor({ actor: 'user', workspaceId, userId: 'user-1' as never }),
    ).not.toThrow();
    expect(() => assertValidActor(agent(['tasks.read']))).not.toThrow();
    expect(() => assertValidActor({ actor: 'system', workspaceId })).not.toThrow();
  });

  it('rejects a user actor with no user', () => {
    expect(() => assertValidActor({ actor: 'user', workspaceId } as never)).toThrow(DomainRuleError);
  });

  it('rejects an agent actor with no connection', () => {
    expect(() => assertValidActor({ ...agent([]), agentConnectionId: undefined } as never)).toThrow(DomainRuleError);
  });

  it('rejects a system actor carrying either id', () => {
    expect(() => assertValidActor({ actor: 'system', workspaceId, userId: 'user-1' } as never)).toThrow(
      DomainRuleError,
    );
    expect(() =>
      assertValidActor({ actor: 'system', workspaceId, agentConnectionId: 'agent-1' } as never),
    ).toThrow(DomainRuleError);
  });
});

describe('assertPermitted', () => {
  it('lets an agent through when the connection holds the permission', () => {
    expect(() => assertPermitted(agent(['tasks.read', 'tasks.write']), 'tasks.write')).not.toThrow();
  });

  it('denies an agent the permission it was not granted, naming both', () => {
    expect(() => assertPermitted(agent(['tasks.read']), 'tasks.write')).toThrow(PermissionDeniedError);
    expect(() => assertPermitted(agent(['tasks.read']), 'tasks.write')).toThrow(
      'connection "agent-1" is missing permission "tasks.write"',
    );
  });

  it('never checks a user actor — a person in their own workspace holds no grant', () => {
    expect(() => assertPermitted({ actor: 'user', workspaceId, userId: 'user-1' as never }, 'tasks.write')).not.toThrow();
  });

  it('never checks a system actor', () => {
    expect(() => assertPermitted({ actor: 'system', workspaceId }, 'projects.write')).not.toThrow();
  });
});

describe('assertUserActor', () => {
  it('accepts a user', () => {
    expect(() => assertUserActor({ actor: 'user', workspaceId, userId: 'user-1' as never })).not.toThrow();
  });

  /**
   * The gate on `AgentConnectionService`. No permission could do this job: an agent holding
   * whatever `AgentPermissionSchema` offers must still not be able to widen its own grant
   * or un-revoke itself, and adding an `agents.write` permission would only move the hole.
   */
  it('rejects an agent, so a connection cannot manage connections', () => {
    expect(() => assertUserActor(agent(['projects.read', 'tasks.write']))).toThrow(
      'agent connections can only be managed by the person who owns them',
    );
  });

  it('rejects a system actor', () => {
    expect(() => assertUserActor({ actor: 'system', workspaceId })).toThrow(PermissionDeniedError);
  });
});
