/**
 * The only failure type the UI sees (§8). Components never learn about `Response`, status
 * codes or `fetch` — the adapter translates all of it into this.
 */
export type GatewayErrorCode =
  | 'not_found'
  | 'rule_violation'
  | 'invalid_request'
  | 'conflict'
  | 'busy'
  | 'internal_error'
  /** The response did not match its contract schema (§11). The host is wrong, not the caller. */
  | 'invalid_response'
  /** The host could not be reached at all — the path §63's revert-on-failure depends on. */
  | 'unreachable';

export class GatewayError extends Error {
  constructor(
    readonly code: GatewayErrorCode,
    /** The HTTP status, or `0` for a failure that never got one. */
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}
