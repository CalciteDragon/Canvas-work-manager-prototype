import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import existing from '../playwright.config';

process.env['CWM_E2E_HOST'] = 'http://127.0.0.1:4341';
process.env['UX_STATIC_ORIGIN'] = 'http://localhost:4241';
const servers = Array.isArray(existing.webServer) ? existing.webServer : [];
const baseline = Boolean(process.env['UX_BEFORE']);

/** Dedicated Slice 73 evidence servers and data never reuse a developer's capture host. */
export default defineConfig({
  ...existing,
  testDir: '.', testIgnore: [], testMatch: ['capture.ts', 'depth-verification.ts', 'lifts-verification.ts', 'lift-baseline.ts'], timeout: 1_800_000,
  use: { ...existing.use, actionTimeout: 30_000, navigationTimeout: 30_000 },
  webServer: [
    { ...servers[0]!, command: 'pnpm --filter @cwm/prototype-host start', url: 'http://127.0.0.1:4341/prototype/state', env: { CWM_HOST_PORT: '4341', CWM_DATA_FILE: fileURLToPath(new URL('../../../.prototype/ux-slice73.json', import.meta.url)) } },
    { ...servers[1]!, command: `node apps/e2e/ux/walk/static.mjs ${baseline ? 'apps/e2e/ux-output/slice73-baseline-web' : 'apps/web/dist/web/browser'} 4241`, url: 'http://localhost:4241' },
  ],
});
