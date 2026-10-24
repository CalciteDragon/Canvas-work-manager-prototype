import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import existing from '../playwright.config';

process.env['CWM_E2E_HOST'] = 'http://127.0.0.1:4354';
process.env['UX_OBJECTS'] = '1';
process.env['UX_STATIC_ORIGIN'] = 'http://localhost:4254';
const servers = Array.isArray(existing.webServer) ? existing.webServer : [];
const baseline = Boolean(process.env['UX_BEFORE']);
const served = baseline ? 'apps/e2e/ux-output/slice77-baseline-web/browser' : 'apps/web/dist/web/browser';

/** Isolated Slice 77 evidence never reads the developer's prototype document. */
export default defineConfig({
  ...existing,
  outputDir: '../ux-output/slice77-capture-results',
  testDir: '.', testIgnore: [], testMatch: ['capture.ts', 'objects-verification.ts'], timeout: 1_800_000,
  use: { ...existing.use, actionTimeout: 30_000, navigationTimeout: 30_000 },
  webServer: [
    { ...servers[0]!, command: 'pnpm --filter @cwm/prototype-host start', url: 'http://127.0.0.1:4354/prototype/state', env: { CWM_HOST_PORT: '4354', CWM_DATA_FILE: fileURLToPath(new URL('../../../.prototype/ux-slice77.json', import.meta.url)) } },
    { ...servers[1]!, command: `node apps/e2e/ux/walk/static.mjs ${served} 4254`, url: 'http://localhost:4254' },
  ],
});
