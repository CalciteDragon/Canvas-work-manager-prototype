import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import existing from '../playwright.config';

process.env['CWM_E2E_HOST'] = 'http://127.0.0.1:4357';
process.env['UX_STATIC_ORIGIN'] = 'http://localhost:4257';
const servers = Array.isArray(existing.webServer) ? existing.webServer : [];

/**
 * Slice 81's alternatives rig (R1, disposable, deleted at step 3): the current build's
 * `/prototype/navigation/:option` specimens over an isolated document. Shares Slices 79–81's
 * ports, which never run at the same time.
 */
export default defineConfig({
  ...existing,
  outputDir: '../ux-output/slice81-alternatives-results',
  testDir: '.', testIgnore: [], testMatch: ['navigation-alternatives.ts'], timeout: 1_800_000,
  use: { ...existing.use, actionTimeout: 30_000, navigationTimeout: 30_000 },
  webServer: [
    { ...servers[0]!, command: 'pnpm --filter @cwm/prototype-host start', url: 'http://127.0.0.1:4357/prototype/state', env: { CWM_HOST_PORT: '4357', CWM_DATA_FILE: fileURLToPath(new URL('../../../.prototype/ux-slice81-alternatives.json', import.meta.url)) } },
    { ...servers[1]!, command: 'node apps/e2e/ux/walk/static.mjs apps/web/dist/web/browser 4257', url: 'http://localhost:4257' },
  ],
});
