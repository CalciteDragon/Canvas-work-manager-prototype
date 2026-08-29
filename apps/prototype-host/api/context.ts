import type { PrototypeDocument, User, UserId, WorkspaceId } from '@cwm/contracts';
import { EntityNotFoundError, type ActorContext } from '@cwm/domain';
import type { PrototypeAgentAuthenticator } from '../auth/prototype-agent-authenticator.ts';
import type { RouteRequest } from '../router.ts';

/**
 * Which persona the request is acting as.
 *
 * This is **not** authentication. §18's `IdentityProvider` is an Angular interface, not a
 * credential: a header names a persona and the first user in the document is the default,
 * exactly the kind of insecure local shortcut §7 permits the host. §51's bearer tokens are
 * the other identity, and `resolveActor` below is where the two meet.
 */
export const resolveUser = (document: PrototypeDocument, request: RouteRequest): User => {
  const header = request.headers['x-prototype-user'];
  const requested = Array.isArray(header) ? header[0] : header;
  const user = requested === undefined ? document.users[0] : document.users.find(({ id }) => id === requested);

  // A mistyped persona is a caller mistake (404). An empty document is the host being
  // broken, which is a 500 and should say so loudly.
  if (user === undefined && requested !== undefined) throw new EntityNotFoundError('user', requested);
  if (user === undefined) {
    throw new Error('the prototype data file contains no users — reseed it with `pnpm prototype:reset`');
  }

  return user;
};

/**
 * The actor a domain service sees.
 *
 * **The bearer token wins.** A request carrying both an `Authorization` header and
 * `x-prototype-user` is an agent request: the token is a credential the caller had to be
 * given, and the persona header is a convenience anyone can type. Treating the header as
 * the stronger of the two would let a browser tab downgrade an agent call into a
 * permission-free one, which is the whole model inverted.
 *
 * For a persona request the workspace comes from the *resolved user*, never from the
 * request, so a caller cannot address another persona's workspace by asking for it. For an
 * agent request it comes from the connection's owner, for the same reason.
 */
export const resolveActor = async (
  document: PrototypeDocument,
  request: RouteRequest,
  authenticator?: PrototypeAgentAuthenticator,
): Promise<ActorContext> => {
  const agent = await authenticator?.authenticate(request.headers['authorization']);
  if (agent !== undefined && agent !== null) return agent;

  const user = resolveUser(document, request);
  return { actor: 'user', workspaceId: user.workspaceId as WorkspaceId, userId: user.id as UserId };
};

/**
 * Which user a request speaks for, token or persona. §18's `GET /api/me` needs a `User`
 * rather than an actor, and a token-only request must not silently answer as
 * `document.users[0]`.
 */
export const resolveIdentityUser = async (
  document: PrototypeDocument,
  request: RouteRequest,
  authenticator?: PrototypeAgentAuthenticator,
): Promise<User> => {
  const actor = await resolveActor(document, request, authenticator);
  if (actor.actor !== 'agent') return resolveUser(document, request);

  const owner = document.users.find(({ id }) => id === actor.userId);
  if (owner === undefined) throw new EntityNotFoundError('user', String(actor.userId));
  return owner;
};
