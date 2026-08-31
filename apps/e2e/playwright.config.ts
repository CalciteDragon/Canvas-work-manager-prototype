import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * §69's two end-to-end tests. Playwright rather than Cypress on one deciding property:
 * `webServer` takes an **array**, and this prototype is two processes.
 *
 * Four mechanical details a first draft got wrong, each written down because the failure
 * mode is silent:
 *
 * - **`cwd`** defaults to this config's directory, so a bare `pnpm dev:host` would resolve
 *   against `apps/e2e/package.json` and die with `ERR_PNPM_NO_SCRIPT`. Both entries name
 *   their package with `--filter`, and use `start` rather than `dev`: the host's `dev` is
 *   `tsx watch`, and a file watcher inside an e2e run is a source of spurious restarts.
 * - **`CWM_DATA_FILE` must be absolute.** The host resolves an override against *its own*
 *   cwd (`persistence/store.ts`), which is `apps/prototype-host` — a relative path would
 *   quietly create a second data directory inside that package, which the slash-anchored
 *   `.gitignore` entry would not even hide.
 * - **`reuseExistingServer: false`** on both, so a port already in use throws instead of
 *   hanging. A developer with `pnpm dev` up gets a loud conflict; silently reusing a dev
 *   server would mean an e2e run that destroys the workspace they were using.
 * - **The two probes use different addresses, on purpose.** The host binds `127.0.0.1`
 *   only, so its probe must not depend on Node's `::1` fallback. `ng serve` does the
 *   opposite — it listens on `[::1]:4200` — so probing it at `127.0.0.1` times out after
 *   three minutes with no explanation. Each entry names the address its server actually
 *   binds; neither is a default anyone should tidy into matching the other.
 */
const dataFile = fileURLToPath(new URL('../../.prototype/e2e-data.json', import.meta.url));

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  // The two specs seed the same host, so they must not race each other.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @cwm/prototype-host start',
      url: 'http://127.0.0.1:4310/prototype/state',
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: { CWM_DATA_FILE: dataFile },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter web start',
      url: 'http://localhost:4200',
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
