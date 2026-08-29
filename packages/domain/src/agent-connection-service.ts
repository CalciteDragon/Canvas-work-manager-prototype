import type { AgentConnection, AgentConnectionId, AgentPermission } from '@cwm/contracts';
import { AgentConnectionSchema } from '@cwm/contracts';
import type { AgentConnectionRepository, UnitOfWork } from '@cwm/repositories';
import type { ActivityService } from './activity-service';
import { assertUserActor, type ActorContext } from './actor';
import type { Clock } from './clock';
import { DomainRuleError, EntityNotFoundError } from './errors';

export interface AgentConnectionServiceDependencies {
  agents: AgentConnectionRepository;
  activity: ActivityService;
  clock: Clock;
  unitOfWork: UnitOfWork;
}

/**
 * How long a `lastUsedAt` stamp is allowed to go stale before it is rewritten.
 *
 * `touch` runs on **every** authenticated call, and a unit of work clones the whole
 * document, validates it twice and rewrites `.prototype/data.json` (§15) on one serialized
 * lock. Unthrottled, every agent *read* would cost a full persist. §53 renders "Last used:
 * 4 minutes ago", where a minute of granularity is invisible — so this is the cheapest
 * thing that keeps the record the single source of truth rather than moving last-used into
 * host memory, where it would vanish on restart.
 */
export const LAST_USED_THROTTLE_MS = 60_000;

/**
 * §52's connections, and §53's controls over them.
 *
 * **Every method is user-actors-only** (`assertUserActor`). Managing connections is a
 * person's act: an agent that could edit connections could grant itself the permission it
 * was just denied, or un-revoke itself after being revoked, which would make every other
 * permission check in the prototype decorative. That is why `AgentPermissionSchema` has no
 * `agents.*` member — the answer is the absence of a permission, not a finer one.
 *
 * `touch` is the deliberate exception: it takes a bare id because the *authenticator*
 * calls it, before there is an actor to speak of.
 */
export class AgentConnectionService {
  constructor(private readonly dependencies: AgentConnectionServiceDependencies) {}

  async list(actor: ActorContext): Promise<AgentConnection[]> {
    assertUserActor(actor);
    // Scoped in the service, the way every other collection is — a repository query with
    // one caller would be the inconsistency, not the saving.
    const connections = await this.dependencies.agents.list();
    return connections.filter((connection) => connection.userId === actor.userId);
  }

  async get(actor: ActorContext, id: AgentConnectionId): Promise<AgentConnection> {
    assertUserActor(actor);
    return this.require(actor, id);
  }

  /**
   * The whole set, never a delta — a permission grid is a statement of the grant, and two
   * checkboxes clicked quickly would otherwise race each other into different results.
   */
  async updatePermissions(
    actor: ActorContext,
    id: AgentConnectionId,
    permissions: AgentPermission[],
  ): Promise<AgentConnection> {
    assertUserActor(actor);

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      // Widening a revoked connection would bring it back to life through a side door:
      // §53's Revoke is meant to be the end of a connection, not a mode it can be edited
      // out of. Restoring one is a decision that deserves its own control, not a
      // by-product of ticking a box.
      if (current.revoked) {
        throw new DomainRuleError('a revoked connection cannot be given permissions');
      }

      const next = AgentConnectionSchema.parse({ ...current, permissions });
      await this.dependencies.agents.update(next);
      await this.dependencies.activity.record(actor, {
        action: 'agent_connection.updated',
        entityType: 'agent_connection',
        entityId: next.id,
        summary: `Updated permissions for "${next.name}"`,
      });
      return next;
    });
  }

  async revoke(actor: ActorContext, id: AgentConnectionId): Promise<AgentConnection> {
    assertUserActor(actor);

    return this.dependencies.unitOfWork.run(async () => {
      const current = await this.require(actor, id);
      // Idempotent, but not silently doubled: revoking an already-revoked connection
      // changed nothing, so recording a second event would put a lie in §57's feed.
      if (current.revoked) return current;

      const next = AgentConnectionSchema.parse({ ...current, revoked: true });
      await this.dependencies.agents.update(next);
      await this.dependencies.activity.record(actor, {
        action: 'agent_connection.revoked',
        entityType: 'agent_connection',
        entityId: next.id,
        summary: `Revoked "${next.name}"`,
      });
      return next;
    });
  }

  /**
   * §53's "Last used", stamped by the authenticator on a successful call. Throttled (see
   * `LAST_USED_THROTTLE_MS`), and silent about a connection that does not exist — the
   * caller has already failed to authenticate by then, and a throw here would turn a 401
   * into a 500.
   */
  async touch(id: AgentConnectionId): Promise<void> {
    const connection = await this.dependencies.agents.find(id);
    if (connection === null) return;

    const now = this.dependencies.clock.now();
    const previous = connection.lastUsedAt === undefined ? undefined : Date.parse(connection.lastUsedAt);
    // Distance, not elapsed time. §46's Current Date control moves the clock *backwards*
    // as readily as forwards, and a one-directional comparison would leave `lastUsedAt`
    // stranded in the future — suppressing every later touch, so §53's "Last used" would
    // freeze for the rest of the session.
    if (previous !== undefined && Math.abs(now.getTime() - previous) < LAST_USED_THROTTLE_MS) return;

    await this.dependencies.unitOfWork.run(async () => {
      // Re-read inside the unit: the find above ran outside the lock, so another call may
      // have stamped it since. No activity event — a read is not a change to the workspace,
      // and §57's feed would drown in them.
      const current = await this.dependencies.agents.find(id);
      if (current === null) return;
      await this.dependencies.agents.update(
        AgentConnectionSchema.parse({ ...current, lastUsedAt: now.toISOString() }),
      );
    });
  }

  /** Unchecked lookup, so the public methods above assert exactly once. */
  private async require(actor: ActorContext, id: AgentConnectionId): Promise<AgentConnection> {
    const connection = await this.dependencies.agents.find(id);
    // Another person's connection is "not found", never "forbidden" — 403 would confirm
    // that a connection with that id exists, which is the same rule projects follow.
    if (connection === null || connection.userId !== actor.userId) {
      throw new EntityNotFoundError('agent connection', id);
    }
    return connection;
  }
}
