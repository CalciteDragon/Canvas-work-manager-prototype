import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import existing from '../playwright.config';

process.env['CWM_E2E_HOST'] = 'http://127.0.0.1:4352';
process.env['UX_STATIC_ORIGIN'] = 'http://localhost:4252';
const servers = Array.isArray(existing.webServer) ? existing.webServer : [];
const baseline = Boolean(process.env['UX_BEFORE']);
// The slice-73 pair (W1-026, W3-012, W2-009, W4-008) compares against the pre-73 build kept locally.
const pre73 = Boolean(process.env['UX_PRE73']);
const served = pre73 ? 'apps/e2e/ux-output/slice73-baseline-web' : baseline ? 'apps/e2e/ux-output/slice75-baseline-web' : 'apps/web/dist/web/browser';

/** Isolated Slice 75 evidence never reads the developer's prototype document. */
export default defineConfig({
  ...existing,
  outputDir: '../ux-output/slice75-capture-results',
  testDir: '.', testIgnore: [], testMatch: ['capture.ts', 'depth-verification.ts', 'placement-verification.ts'], timeout: 1_800_000,
  use: { ...existing.use, actionTimeout: 30_000, navigationTimeout: 30_000 },
  webServer: [
    { ...servers[0]!, command: 'pnpm --filter @cwm/prototype-host start', url: 'http://127.0.0.1:4352/prototype/state', env: { CWM_HOST_PORT: '4352', CWM_DATA_FILE: fileURLToPath(new URL('../../../.prototype/ux-slice75.json', import.meta.url)) } },
    { ...servers[1]!, command: `node apps/e2e/ux/walk/static.mjs ${served} 4252`, url: 'http://localhost:4252' },
  ],
});
