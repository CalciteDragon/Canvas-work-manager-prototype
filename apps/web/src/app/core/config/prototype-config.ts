import { InjectionToken } from '@angular/core';

/**
 * Where the prototype host lives (§10). The one place the transport's address is written:
 * swapping `PrototypeWorkManagerGateway` for `HttpWorkManagerGateway` later changes this
 * provider, not any component.
 */
export const PROTOTYPE_API_BASE_URL = new InjectionToken<string>('PROTOTYPE_API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:4310',
});
