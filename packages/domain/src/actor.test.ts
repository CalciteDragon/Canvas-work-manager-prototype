import { describe, expect, it } from 'vitest';
import { assertValidActor, type ActorContext } from './actor';
import { DomainRuleError } from './errors';

const workspaceId = 'workspace-1' as ActorContext['workspaceId'];

describe('assertValidActor', () => {
  it('accepts the three well-formed actors', () => {
    expect(() =>
      assertValidActor({ actor: 'user', workspaceId, userId: 'user-1' as never }),
    ).not.toThrow();
    expect(() =>
      assertValidActor({ actor: 'agent', workspaceId, agentConnectionId: 'agent-1' as never }),
    ).not.toThrow();
    expect(() => assertValidActor({ actor: 'system', workspaceId })).not.toThrow();
  });

  it('rejects a user actor with no user', () => {
    expect(() => assertValidActor({ actor: 'user', workspaceId } as never)).toThrow(DomainRuleError);
  });

  it('rejects an agent actor with no connection', () => {
    expect(() => assertValidActor({ actor: 'agent', workspaceId } as never)).toThrow(DomainRuleError);
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
