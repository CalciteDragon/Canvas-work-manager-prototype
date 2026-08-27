import { Injectable, inject } from '@angular/core';
import { IdentitySchema, type Identity } from '@cwm/contracts';
import { PROTOTYPE_API_BASE_URL } from '../config/prototype-config';
import type { IdentityProvider } from './identity-provider';

/**
 * Which persona the prototype is acting as. Slice 12's dev panel is what will write this;
 * nothing in the UI writes it yet, and an absent key means "let the host pick its first
 * user" — §17's "Switch Persona" without a switcher.
 */
export const PROTOTYPE_PERSONA_STORAGE_KEY = 'cwm.prototype.persona';

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
    const stored = localStorage.getItem(PROTOTYPE_PERSONA_STORAGE_KEY);
    const response = await this.request(stored);

    // A 404 means the stored persona no longer exists — a reseed, or a hand-edited
    // browser. Clearing and retrying is the difference between a stale key costing one
    // request and it bricking the session.
    if (response.status === 404 && stored !== null) {
      localStorage.removeItem(PROTOTYPE_PERSONA_STORAGE_KEY);
      return IdentitySchema.parse(await (await this.request(null)).json());
    }

    if (!response.ok) throw new Error(`GET /api/me answered ${response.status}`);
    return IdentitySchema.parse(await response.json());
  }

  private request(persona: string | null): Promise<Response> {
    return fetch(`${this.baseUrl}/api/me`, {
      headers: persona === null ? {} : { 'x-prototype-user': persona },
    });
  }
}
