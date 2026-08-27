import { InjectionToken } from '@angular/core';
import type { Identity } from '@cwm/contracts';

/**
 * §18's contract. The application depends on this; `PrototypeIdentityProvider` reads a
 * persona from the prototype host today, and a `SupabaseIdentityProvider` would replace it
 * without a component changing.
 */
export interface IdentityProvider {
  getCurrentIdentity(): Promise<Identity>;
}

export const IDENTITY_PROVIDER = new InjectionToken<IdentityProvider>('IDENTITY_PROVIDER');
