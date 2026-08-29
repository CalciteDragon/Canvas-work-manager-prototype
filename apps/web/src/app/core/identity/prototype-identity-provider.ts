import { Injectable, inject } from '@angular/core';
import { IdentitySchema, type Identity } from '@cwm/contracts';
import { PROTOTYPE_API_BASE_URL } from '../config/prototype-config';
import { GatewayError, toGatewayError, toUnreachableError } from '../gateway/gateway-error';
import type { IdentityProvider } from './identity-provider';

/**
 * Which persona the prototype is acting as. §46's development panel writes it through
 * `writePersona` below and then reloads; an absent key means "let the host pick its first
 * user", which is what a fresh browser gets.
 */
export const PROTOTYPE_PERSONA_STORAGE_KEY = 'cwm.prototype.persona';

/**
 * `localStorage` throws a `SecurityError` on *access*, not just on write, in Safari
 * private browsing, with site data disabled, and inside a sandboxed iframe. Unguarded,
 * that rejection sails straight past the error mapping below and reaches the sidebar as a
 * raw DOMException — the exact failure this file exists to prevent. No stored persona is
 * a perfectly good answer: it means "let the host pick its first user".
 */
const readPersona = (): string | null => {
  try {
    return localStorage.getItem(PROTOTYPE_PERSONA_STORAGE_KEY);
  } catch {
    return null;
  }
};

const clearPersona = (): void => {
  try {
    localStorage.removeItem(PROTOTYPE_PERSONA_STORAGE_KEY);
  } catch {
    // Nothing to clear if nothing could be read.
  }
};

/**
 * §17's "Switch Persona", written by the development panel (§46). It lives beside the
 * reader so both ends of the key stay in one file — the provider is what heals a stale
 * value, and a second module writing the key by name is how the two drift apart.
 *
 * The panel reloads after calling this: an identity already resolved is memoized for the
 * page's lifetime, so writing the key alone would change nothing on screen.
 */
export const writePersona = (personaId: string): void => {
  try {
    localStorage.setItem(PROTOTYPE_PERSONA_STORAGE_KEY, personaId);
  } catch {
    // A persona that cannot be remembered leaves the host picking its first user.
  }
};

/**
 * §18's provider for the prototype (§10): the identity comes from the host's `GET /api/me`,
 * validated against the contract like every other response.
 */
@Injectable()
export class PrototypeIdentityProvider implements IdentityProvider {
  private readonly baseUrl = inject(PROTOTYPE_API_BASE_URL);
  private pending: Promise<Identity> | null = null;

  getCurrentIdentity(): Promise<Identity> {
    // Only a *fulfilled* identity is memoized. `pnpm dev` starts the web app and the host
    // at once, so the first call can easily lose the race to the host's listen; caching
    // that rejection would fail every later call — and, since the gateway derives its
    // persona header from here, every gateway call too — until a manual reload.
    this.pending ??= this.fetchIdentity().catch((error: unknown) => {
      this.pending = null;
      throw error;
    });
    return this.pending;
  }

  private async fetchIdentity(): Promise<Identity> {
    const stored = readPersona();
    const response = await this.request(stored);

    // A 404 means the stored persona no longer exists — a reseed, or a hand-edited
    // browser. Clearing and retrying is the difference between a stale key costing one
    // request and it bricking the session.
    if (response.status === 404 && stored !== null) {
      clearPersona();
      return parse(await this.request(null));
    }

    return parse(response);
  }

  /**
   * Like the gateway, this is a boundary: §8 says components see `GatewayError` and never
   * a transport. Without this the sidebar renders "Failed to fetch" — the browser's own
   * words — the first time `pnpm dev` has not finished starting the host.
   */
  private async request(persona: string | null): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}/api/me`, {
        headers: persona === null ? {} : { 'x-prototype-user': persona },
      });
    } catch (error) {
      throw toUnreachableError(error);
    }
  }
}

const parse = async (response: Response): Promise<Identity> => {
  // Shared with the gateway on purpose. Two copies of this drifted inside one slice: the
  // version that lived here mapped every status to `internal_error` and discarded the
  // host's own message, so a 400 and a 503 were indistinguishable to the UI.
  if (!response.ok) throw await toGatewayError(response, 'GET /api/me');

  const parsed = IdentitySchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw new GatewayError('invalid_response', 0, 'GET /api/me answered something that is not an Identity');
  return parsed.data;
};
