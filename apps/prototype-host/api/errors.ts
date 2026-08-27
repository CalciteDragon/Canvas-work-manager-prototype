import { DomainRuleError, EntityNotFoundError } from '@cwm/domain';
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
  // A malformed JSON body, or one past the size cap — both are the caller's doing.
  if (error instanceof SyntaxError || error instanceof RangeError) {
    return json(400, { error: 'invalid_request', message: error.message });
  }
  if (error instanceof EntityNotFoundError || error instanceof RepositoryNotFoundError) {
    return json(404, { error: 'not_found', message: error.message });
  }
  if (error instanceof DomainRuleError) {
    return json(409, { error: 'rule_violation', message: error.message });
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
