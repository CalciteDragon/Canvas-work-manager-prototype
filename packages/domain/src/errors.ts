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

/** A rule the caller broke: an illegal transition, a cycle, an unsupported move. */
export class DomainRuleError extends Error {
  constructor(message: string) {
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
