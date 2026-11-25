import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import existing from '../playwright.config';

process.env['CWM_E2E_HOST'] = 'http://127.0.0.1:4358';
process.env['UX_OBJECTS'] = '1';
process.env['UX_STATIC_ORIGIN'] = 'http://localhost:4258';
const servers = Array.isArray(existing.webServer) ? existing.webServer : [];

/**
 * Slice 82's comb recapture at one commit (`C82`): the whole matrix, the core tasks and the runtime
 * surfaces, on ports no other rig uses (4258/4358). One build, no `UX_BEFORE`. The host runs through
 * `tsx` directly, never `pnpm --filter … start`, so stopping the run releases its port (step 0a's trap).
 */
export default defineConfig({
  ...existing,
  outputDir: '../ux-output/slice82-capture-results',
  testDir: '.', testIgnore: [], testMatch: ['capture.ts', 'comb-verification.ts'], timeout: 3_600_000,
  use: { ...existing.use, actionTimeout: 30_000, navigationTimeout: 30_000 },
  webServer: [
    { ...servers[0]!, command: './node_modules/.bin/tsx main.ts', cwd: fileURLToPath(new URL('../../prototype-host', import.meta.url)), url: 'http://127.0.0.1:4358/prototype/state', env: { CWM_HOST_PORT: '4358', CWM_DATA_FILE: fileURLToPath(new URL('../../../.prototype/ux-slice82.json', import.meta.url)) } },
    { ...servers[1]!, command: 'node apps/e2e/ux/walk/static.mjs apps/web/dist/web/browser 4258', url: 'http://localhost:4258' },
  ],
});
