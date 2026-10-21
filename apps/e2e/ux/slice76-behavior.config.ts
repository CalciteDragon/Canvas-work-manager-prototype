import { defineConfig } from '@playwright/test';
import existing from './slice76.config';
// One legacy Node-side fetch names the virtual host directly; keep it on this run's isolated host.
const fetchIsolated = globalThis.fetch;
globalThis.fetch = (input, init) => fetchIsolated(typeof input === 'string' ? input.replace('http://127.0.0.1:4310', 'http://127.0.0.1:4353') : input, init);
const servers=Array.isArray(existing.webServer)?existing.webServer:[];
/** Launch-level proxy also isolates contexts manually created by existing unedited journeys. */
export default defineConfig({ ...existing, outputDir:'../ux-output/slice76-behavior-results',testDir:'..',testIgnore:['**/ux/**','**/ux-output/**'],testMatch:['*.spec.ts'],timeout:90_000,
  use:{...existing.use,launchOptions:{proxy:{server:'http://localhost:4253'},args:['--proxy-bypass-list=<-loopback>']}},
  webServer:[servers[0]!,{...servers[1]!,command:'node apps/e2e/ux/slice76-server.mjs '+(process.env['UX_BEFORE']?'apps/e2e/ux-output/slice76-baseline-web/browser':'apps/web/dist/web/browser')}],
});
