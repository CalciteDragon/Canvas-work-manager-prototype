import type { AgentConnectionId, UserId, WorkspaceId } from '@cwm/contracts';
import type { ActorContext, AgentConnectionService } from '@cwm/domain';
import { PROTOTYPE_AGENT_TOKENS } from '@cwm/prototype-data';
import type { AgentConnectionRepository, UserRepository } from '@cwm/repositories';

/**
 * A bearer token that names no usable connection (§51).
 *
 * Deliberately one error for every cause — unknown token, deleted connection, revoked
 * connection. A 401 that distinguished them would be an oracle telling a caller which
 * tokens exist, and these tokens are already worthless; there is nothing to gain by being
 * chatty and a bad habit to form by being so.
 */
export class AgentAuthenticationError extends Error {
  constructor(message = 'the bearer token is not a usable agent connection') {
    super(message);
    this.name = 'AgentAuthenticationError';
  }
}

export interface AgentAuthenticatorDependencies {
  agents: AgentConnectionRepository;
  users: UserRepository;
  connections: AgentConnectionService;
  /** Overridable so a test can name its own tokens; defaults to §51's fixtures. */
  tokens?: Readonly<Record<string, AgentConnectionId>>;
}

const BEARER = /^Bearer[ ]+(.+)$/i;

/**
 * §51's `PrototypeAgentAuthenticator`: `Authorization: Bearer prototype-user-a-readwrite`
 * resolves to `{ userId, connectionId, permissions }`.
 *
 * **These credentials have no security value and only work on localhost** — `main.ts`
 * binds to `127.0.0.1` for exactly this reason. There is no OAuth here and there will not
 * be one (§51, §80); the experiment is the permission *model*, not the login.
 *
 * The token is only a pointer. Everything that decides the call — the permission set, the
 * revoked flag — is read from the **live connection on every request**, which is what makes
 * §53's "changes take effect immediately" true rather than a claim: unchecking a box in
 * Settings fails the very next call, with no restart and no token reissue.
 */
export class PrototypeAgentAuthenticator {
  private readonly tokens: Readonly<Record<string, AgentConnectionId>>;

  constructor(private readonly dependencies: AgentAuthenticatorDependencies) {
    this.tokens = dependencies.tokens ?? PROTOTYPE_AGENT_TOKENS;
  }

  /**
   * `null` when the request carries no `Authorization` header at all — that is a persona
   * request, and the caller falls back to `x-prototype-user`. A header that is present but
   * unusable throws instead: a malformed credential is a failure, not an absence.
   */
  async authenticate(header: string | string[] | undefined): Promise<ActorContext | null> {
    const raw = Array.isArray(header) ? header[0] : header;
    if (raw === undefined || raw.trim() === '') return null;

    const matched = BEARER.exec(raw.trim());
    if (matched === null) throw new AgentAuthenticationError('only Bearer authorization is supported');

    const connectionId = this.tokens[matched[1]!.trim()];
    if (connectionId === undefined) throw new AgentAuthenticationError();

    // The repository, not `AgentConnectionService.get` — that method is user-actors-only,
    // and there is no actor yet. This *is* the step that produces one.
    const connection = await this.dependencies.agents.find(connectionId);
    if (connection === null || connection.revoked) throw new AgentAuthenticationError();

    const user = await this.dependencies.users.find(connection.userId);
    // A connection whose owner is gone cannot name a workspace, so it cannot act. The
    // store rejects such a document at load, so this is a broken-host case, not a caller's.
    if (user === null) throw new AgentAuthenticationError();

    // Only a *successful* authentication counts as a use. Stamping on the 401 path would
    // let anyone holding a revoked token keep its "Last used" ticking over.
    await this.dependencies.connections.touch(connectionId);

    return {
      actor: 'agent',
      workspaceId: user.workspaceId as WorkspaceId,
      userId: user.id as UserId,
      agentConnectionId: connection.id,
      permissions: connection.permissions,
    };
  }
}
