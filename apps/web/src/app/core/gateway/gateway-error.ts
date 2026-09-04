/**
 * The only failure type the UI sees (§8). Components never learn about `fetch`, a
 * `Response`, or the shape of a transport — every adapter translates all of it into this.
 */

/** The error envelope the prototype host actually sends (`apps/prototype-host/api/errors.ts`). */
export const WIRE_ERROR_CODES = [
  'not_found',
  'rule_violation',
  'invalid_request',
  'conflict',
  'busy',
  'internal_error',
  /** §51: the bearer token names no usable connection. */
  'unauthorized',
  /** §53: a real connection, without the grant this call needs. The message names it. */
  'permission_denied',
] as const;

export type GatewayErrorCode =
  | (typeof WIRE_ERROR_CODES)[number]
  /** The response did not match its contract schema (§11). The host is wrong, not the caller. */
  | 'invalid_response'
  /** The host could not be reached at all — the path §63's revert-on-failure depends on. */
  | 'unreachable';

const isWireCode = (value: unknown): value is GatewayErrorCode =>
  typeof value === 'string' && (WIRE_ERROR_CODES as readonly string[]).includes(value);

export class GatewayError extends Error {
  constructor(
    readonly code: GatewayErrorCode,
    /**
     * The originating HTTP status, or `0` for a failure that never got one. Present for
     * diagnostics only — `code` is what the UI should branch on, so an adapter with no
     * concept of a status code stays a legal implementation.
     */
    readonly status: number,
    message: string,
    /**
     * Whatever the host sent beside the message, untouched and **untrusted**. A boundary
     * preserves wire data; the feature that branches on it owns the validation — the removal
     * dialog parses this through `SectionRemovalRefusalDetailsSchema` and treats anything
     * else as an ordinary error.
     */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * The one translation from a failed `Response` to a `GatewayError`. Shared by the gateway
 * and the identity provider: they are both boundaries, and two copies of this drifted
 * within a single slice — the identity provider's version mapped every status to
 * `internal_error` and threw the host's own message away.
 */
export const toGatewayError = async (response: Response, what: string): Promise<GatewayError> => {
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    envelope = undefined;
  }

  const body = envelope as { error?: unknown; message?: unknown; details?: unknown } | undefined;
  const code = isWireCode(body?.error) ? body.error : 'internal_error';
  const message = typeof body?.message === 'string' ? body.message : `${what} answered ${response.status}`;
  return new GatewayError(code, response.status, message, body?.details);
};

/** A `fetch` that never reached the host — a stopped process, a refused connection. */
export const toUnreachableError = (error: unknown): GatewayError =>
  new GatewayError(
    'unreachable',
    0,
    `could not reach the prototype host — ${error instanceof Error ? error.message : String(error)}`,
  );
