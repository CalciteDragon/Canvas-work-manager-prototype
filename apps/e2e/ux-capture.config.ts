import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import existing from './playwright.config';

// Separate ports preserve a developer's live workspace; the same ownership-guarded
// prepare-data.ts and server definitions still own the scratch document.
process.env['CWM_E2E_HOST'] = 'http://127.0.0.1:4321';
process.env['CWM_E2E_WEB'] = 'http://localhost:4200';
const original = Array.isArray(existing.webServer) ? existing.webServer : [];
/** Opt-in visual evidence, deliberately excluded from the ordinary e2e suite. */
export default defineConfig({
  ...existing,
  testDir: './ux', testIgnore: [], testMatch: ['capture.ts', 'depth-verification.ts', 'primitives-verification.ts', 'lifts-verification.ts'], timeout: 1_800_000,
  use: { ...existing.use, baseURL: 'http://localhost:4201', viewport: { width: 1440, height: 900 } },
  webServer: [
    { ...original[0]!, command: 'pnpm --filter @cwm/prototype-host start', url: 'http://127.0.0.1:4321/prototype/state', env: { ...original[0]!.env, CWM_HOST_PORT: '4321', CWM_DATA_FILE: fileURLToPath(new URL('../../.prototype/ux-data.json', import.meta.url)) } },
    { ...original[1]!, command: 'node apps/e2e/ux/walk/static.mjs apps/web/dist/web/browser 4201', url: 'http://localhost:4201' },
  ],
});

