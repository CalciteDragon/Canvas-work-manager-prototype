import type { UndoRefusalDetails } from '@cwm/contracts';

/**
 * Three failures a caller can cause, so a transport can answer them differently (§61).
 * Anything else reaching a route is a bug, not a caller mistake.
 */

/**
 * An id that does not resolve *for this actor*. A cross-workspace id raises this rather
 * than a rule error: answering 409 would confirm that a foreign id exists.
 */
export class EntityNotFoundError extends Error {
  constructor(
    readonly entity: string,
    readonly id: string,
  ) {
    super(`${entity} "${id}" was not found`);
    this.name = 'EntityNotFoundError';
  }
}

/**
 * A rule the caller broke: an illegal transition, a cycle, an unsupported move.
 *
 * `details` is an optional plain record for a refusal a *caller* can act on rather than only
 * read — the non-empty section removal is the first, whose row count the canvas needs to ask
 * its own question with. It stays a record, not a JSON or HTTP shape: `api/errors.ts` is the
 * single place that turns it into an envelope, and the schema that gives the payload a
 * checked form lives in `packages/contracts`.
 */
export class DomainRuleError extends Error {
  constructor(
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'DomainRuleError';
  }
}

/**
 * An agent connection asked for something its grant does not cover (§51, §53).
 *
 * Distinct from `EntityNotFoundError`, which hides a foreign id: here the caller is
 * entitled to know exactly what it is missing, because the answer to "why did that fail?"
 * is a checkbox in §53's grid. It names the connection and the permission for the same
 * reason — a 403 saying only "forbidden" is what makes agent debugging miserable.
 */
export class PermissionDeniedError extends Error {
  constructor(
    readonly connectionId: string,
    /** The `AgentPermission` that was missing, or `null` when no permission could grant it. */
    readonly permission: string | null,
    message = `connection "${connectionId}" is missing permission "${permission}"`,
  ) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * An Undo refusal: a `DomainRuleError` whose details are an `UndoRefusalDetails` and whose
 * message **starts with the reason token** — `undo_consumed: …`. MCP clients receive the message
 * text only, so the token is how an agent tells the refusals apart; HTTP clients also get the
 * typed details in the 409 envelope.
 */
export const undoRefusal = (details: UndoRefusalDetails, sentence: string): DomainRuleError =>
  new DomainRuleError(`${details.reason}: ${sentence}`, details);
