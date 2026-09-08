import type { AgentConnectionId, AgentPermission, UserId, WorkspaceId } from '@cwm/contracts';
import { DomainRuleError, PermissionDeniedError } from './errors';

/**
 * Who is making a change, and in which workspace. §57 requires the UI to tell user,
 * agent and system actions apart, so every mutation carries one of these and every read
 * is scoped by its `workspaceId`.
 *
 * The caller resolves identity: the host from its persona header (§18 is Slice 6), and
 * Slice 13's MCP authenticator from a bearer token (§51). The domain checks the shape.
 */
export type ActorContext =
  | { actor: 'user'; workspaceId: WorkspaceId; userId: UserId; agentConnectionId?: undefined; permissions?: undefined }
  | {
      actor: 'agent';
      workspaceId: WorkspaceId;
      userId?: UserId;
      agentConnectionId: AgentConnectionId;
      /**
       * The grant, read from the connection at authentication time (§51, §52). It travels
       * with the actor rather than being looked up per check, so one call is judged
       * against one consistent grant — but the *authenticator* re-reads the connection on
       * every call, which is what makes §53's "immediately" true.
       */
      permissions: readonly AgentPermission[];
    }
  | { actor: 'system'; workspaceId: WorkspaceId; userId?: undefined; agentConnectionId?: undefined; permissions?: undefined };

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

/**
 * §53's permission model, enforced **in the domain** rather than at the transport — which
 * is what makes it true for the web API, the MCP tools of Slice 14, and any in-process
 * caller alike.
 *
 * Users and system actors are never checked. A person acting in their own workspace holds
 * no grant to check against — `AgentPermissionSchema` describes what a *connection* was
 * given — and a system action is the prototype acting on its own behalf. Scoping is a
 * separate question that every service still answers by `workspaceId`.
 */
export const assertPermitted = (actor: ActorContext, permission: AgentPermission): void => {
  if (actor.actor !== 'agent') return;
  if (!actor.permissions.includes(permission)) {
    throw new PermissionDeniedError(actor.agentConnectionId, permission);
  }
};

/** Whether a caller has a grant, without throwing — useful for deliberately collapsed errors. */
export const holds = (actor: ActorContext, permission: AgentPermission): boolean =>
  actor.actor !== 'agent' || actor.permissions.includes(permission);

/**
 * The gate on `AgentConnectionService`: managing connections is a **person's** act.
 *
 * No permission could do this job. An agent that could edit connections could grant itself
 * the permission it was just denied, or un-revoke itself after being revoked — so the
 * answer is not a finer-grained permission but the absence of one. `AgentPermissionSchema`
 * deliberately has no `agents.*` member.
 */
export const assertUserActor = (actor: ActorContext): void => {
  if (actor.actor === 'user') return;
  throw new PermissionDeniedError(
    actor.actor === 'agent' ? actor.agentConnectionId : 'system',
    null,
    'agent connections can only be managed by the person who owns them',
  );
};
