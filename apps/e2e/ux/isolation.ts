import type { BrowserContext } from '@playwright/test';
/** Redirect the browser transport only; production providers remain unchanged. */
export async function configureContext(context: BrowserContext): Promise<void> {
  // Keep the browser origin supported by the existing host CORS policy while forwarding
  // every web request to our own Angular server. No request reaches the live app.
  await context.route('http://localhost:4200/**', route => route.continue({ url: route.request().url().replace('http://localhost:4200', 'http://localhost:4201') }));
  const host = process.env['CWM_E2E_HOST'];
  if (host) await context.route(/^http:\/\/(localhost|127\.0\.0\.1):4310\//, route =>
    route.continue({ url: route.request().url().replace(/^http:\/\/(localhost|127\.0\.0\.1):4310/, host) }));
}

