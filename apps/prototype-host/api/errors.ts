import { DomainRuleError, EntityNotFoundError, PermissionDeniedError } from '@cwm/domain';
import { AgentAuthenticationError } from '../auth/prototype-agent-authenticator.ts';
import {
  DocumentIntegrityError,
  RepositoryConflictError,
  RepositoryNotFoundError,
  UnitOfWorkInProgressError,
} from '@cwm/repositories';
import { ZodError } from 'zod';
import type { RouteResult } from '../router.ts';

const json = (status: number, body: unknown): RouteResult => ({
  status,
  contentType: 'application/json',
  body,
});

/**
 * The one place the host turns a thrown thing into a status. A caller mistake must not
 * arrive as a 500: that is how a typo in a query string becomes an hour of debugging.
 */
export const toErrorResult = (error: unknown): RouteResult => {
  if (error instanceof ZodError) {
    return json(400, { error: 'invalid_request', issues: error.issues });
  }
  // A malformed JSON body, one past the size cap, or a bad percent-escape in the URL —
  // all the caller's doing.
  if (error instanceof SyntaxError || error instanceof RangeError || error instanceof URIError) {
    return json(400, { error: 'invalid_request', message: error.message });
  }
  if (error instanceof EntityNotFoundError || error instanceof RepositoryNotFoundError) {
    return json(404, { error: 'not_found', message: error.message });
  }
  // A token that names no usable connection (§51). One shape for every cause — an
  // unknown token, a deleted connection, a revoked one — so a 401 is never an oracle.
  if (error instanceof AgentAuthenticationError) {
    return json(401, { error: 'unauthorized', message: error.message });
  }
  // The connection is real but its grant does not cover this (§53). Unlike a 404, the
  // message names the missing permission: the answer is a checkbox the owner can tick,
  // and a 403 saying only "forbidden" is what makes agent debugging miserable.
  if (error instanceof PermissionDeniedError) {
    return json(403, { error: 'permission_denied', message: error.message });
  }
  if (error instanceof DomainRuleError) {
    // Spread rather than a `details: error.details` key: an `undefined` value survives the
    // object and disappears only in `JSON.stringify`, which puts a body-shape difference
    // somewhere no test of this function can see.
    return json(409, {
      error: 'rule_violation',
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
  if (error instanceof RepositoryConflictError) {
    return json(409, { error: 'conflict', message: error.message });
  }
  // Reachable only from a stale async descendant of a committed unit; the serializing
  // adapter keeps ordinary concurrent requests off this path.
  if (error instanceof UnitOfWorkInProgressError) {
    return json(503, { error: 'busy', message: error.message });
  }
  // Integrity failures are the host's bug, not the caller's. Surface them loudly.
  if (error instanceof DocumentIntegrityError) {
    console.error(`prototype-host document integrity error — ${error.message}`);
    return json(500, { error: 'internal_error', message: error.message });
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`prototype-host unhandled error — ${message}`);
  return json(500, { error: 'internal_error' });
};
