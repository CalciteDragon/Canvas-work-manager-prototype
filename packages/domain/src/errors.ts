/**
 * Two failures a caller can cause, so a transport can answer them differently (§61).
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
