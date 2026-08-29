import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { WORK_MANAGER_GATEWAY } from './core/gateway/work-manager-gateway';
import { PrototypeWorkManagerGateway } from './core/gateway/prototype-work-manager-gateway';
import { IDENTITY_PROVIDER } from './core/identity/identity-provider';
import { PrototypeIdentityProvider } from './core/identity/prototype-identity-provider';
import { PROTOTYPE_CONTROL } from './prototype/control/prototype-control';
import { PrototypeHttpControl } from './prototype/control/prototype-http-control';
import { routes } from './app.routes';

/**
 * **The only file in the application that names a concrete adapter.** §8's boundary is
 * exactly this: every component injects `WORK_MANAGER_GATEWAY` and `IDENTITY_PROVIDER`,
 * and swapping the prototype implementations for production ones is a change here and
 * nowhere else (§10, §18).
 *
 * There is no `if (prototypeMode)` anywhere — the choice is made once, at bootstrap.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    PrototypeIdentityProvider,
    { provide: IDENTITY_PROVIDER, useExisting: PrototypeIdentityProvider },
    PrototypeWorkManagerGateway,
    { provide: WORK_MANAGER_GATEWAY, useExisting: PrototypeWorkManagerGateway },
    // §46's development panel talks to the host's `/prototype/*` routes. A separate port
    // from the work-manager gateway on purpose: it must keep working when that gateway is
    // at 100 % injected failure, or the panel could not turn the failures back off.
    PrototypeHttpControl,
    { provide: PROTOTYPE_CONTROL, useExisting: PrototypeHttpControl },
  ],
};
