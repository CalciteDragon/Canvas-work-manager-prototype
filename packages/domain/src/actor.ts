import type { AgentConnectionId, UserId, WorkspaceId } from '@cwm/contracts';
import { DomainRuleError } from './errors';

/**
 * Who is making a change, and in which workspace. §57 requires the UI to tell user,
 * agent and system actions apart, so every mutation carries one of these and every read
 * is scoped by its `workspaceId`.
 *
 * The caller resolves identity: the host from its persona header (§18 is Slice 6), and
 * Slice 13's MCP authenticator from a bearer token (§51). The domain checks the shape.
 */
export type ActorContext =
  | { actor: 'user'; workspaceId: WorkspaceId; userId: UserId; agentConnectionId?: undefined }
  | { actor: 'agent'; workspaceId: WorkspaceId; userId?: UserId; agentConnectionId: AgentConnectionId }
  | { actor: 'system'; workspaceId: WorkspaceId; userId?: undefined; agentConnectionId?: undefined };

/**
 * The same three rules `ActivityEventSchema` enforces, checked before a mutation starts
 * rather than when the event is validated at commit — a bad actor should fail the call,
 * not the persist.
 */
export const assertValidActor = (actor: ActorContext): void => {
  if (actor.actor === 'user' && actor.userId === undefined) {
    throw new DomainRuleError('a user actor must name the user');
  }
  if (actor.actor === 'agent' && actor.agentConnectionId === undefined) {
    throw new DomainRuleError('an agent actor must name the connection making the change');
  }
  if (actor.actor === 'system' && (actor.userId !== undefined || actor.agentConnectionId !== undefined)) {
    throw new DomainRuleError('a system actor has no actor id');
  }
};
