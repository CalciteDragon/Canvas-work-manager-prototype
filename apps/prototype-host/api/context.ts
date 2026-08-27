import type { PrototypeDocument, User, UserId, WorkspaceId } from '@cwm/contracts';
import { EntityNotFoundError, type ActorContext } from '@cwm/domain';
import type { RouteRequest } from '../router.ts';

/**
 * Which persona the request is acting as.
 *
 * This is **not** authentication. §18's `IdentityProvider` is an Angular interface, not a
 * credential, and §51's agent tokens arrive with MCP in Slice 13 — which is what
 * `apps/prototype-host/auth/` is reserved for. Until then a header names a persona and the
 * first user in the document is the default, exactly the kind of insecure local shortcut
 * §7 permits the host.
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
 * The workspace always comes from the *resolved user*, never from the request, so a caller
 * cannot address another persona's workspace by asking for it.
 */
export const resolveActor = (document: PrototypeDocument, request: RouteRequest): ActorContext => {
  const user = resolveUser(document, request);
  return { actor: 'user', workspaceId: user.workspaceId as WorkspaceId, userId: user.id as UserId };
};
