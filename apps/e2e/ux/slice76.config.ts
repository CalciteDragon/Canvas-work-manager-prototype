import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import existing from '../playwright.config';

process.env['CWM_E2E_HOST'] = 'http://127.0.0.1:4353';
process.env['UX_STATIC_ORIGIN'] = 'http://localhost:4253';
const servers = Array.isArray(existing.webServer) ? existing.webServer : [];
const baseline = Boolean(process.env['UX_BEFORE']);
const served = baseline ? 'apps/e2e/ux-output/slice76-baseline-web/browser' : 'apps/web/dist/web/browser';

/** Isolated Slice 76 evidence never reads the developer's prototype document. */
export default defineConfig({
  ...existing,
  outputDir: '../ux-output/slice76-capture-results',
  testDir: '.', testIgnore: [], testMatch: ['capture.ts', 'depth-verification.ts', 'chrome-verification.ts'], timeout: 1_800_000,
  use: { ...existing.use, actionTimeout: 30_000, navigationTimeout: 30_000 },
  webServer: [
    { ...servers[0]!, command: 'pnpm --filter @cwm/prototype-host start', url: 'http://127.0.0.1:4353/prototype/state', env: { CWM_HOST_PORT: '4353', CWM_DATA_FILE: fileURLToPath(new URL('../../../.prototype/ux-slice76.json', import.meta.url)) } },
    { ...servers[1]!, command: `node apps/e2e/ux/walk/static.mjs ${served} 4253`, url: 'http://localhost:4253' },
  ],
});
