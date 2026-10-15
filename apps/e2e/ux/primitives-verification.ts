import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve('ux-output', commit);
/** Slice 72, acceptance 11: the surfaces whose checkbox, radio, select and pill boundaries must survive forced colours. */
const SURFACES = [
  { surface: 'kitchen', seed: 'nested-projects', route: '/projects/project-kitchen' },
  { surface: 'settings', seed: 'agent-heavy', route: '/settings' },
] as const;

test('Primitives forced-colours evidence', async ({ browser }) => {
  test.skip(!process.env['UX_PRIMITIVES']);
  await mkdir(out, { recursive: true });
  const forcedColors: unknown[] = [];
  for (const { surface, seed: seedName, route } of SURFACES) {
    await seed(seedName);
    await setClock(SEED_NOW);
    for (const theme of ['dark', 'light'] as const) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce' });
      await configureContext(context);
      const page = await context.newPage();
      await page.goto(`http://localhost:4200${route}`);
      await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
      // Lock the labelled theme through the real toggle, as capture.ts does: CDP media
      // emulation would otherwise reset a device-followed theme.
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to the ${theme} theme` }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.waitForLoadState('networkidle');
      await page.emulateMedia({ forcedColors: 'active' });
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
      await expect(page.locator('html'), `${theme} survives forced-colours emulation`).toHaveAttribute('data-theme', theme);
      const screenshot = `primitives-forced-${surface}-${theme}.png`;
      await page.screenshot({ path: resolve(out, screenshot), fullPage: true, animations: 'disabled' });
      forcedColors.push({ surface, seed: seedName, route, theme, screenshot });
      await context.close();
    }
  }
  await writeFile(resolve(out, 'primitives-verification.json'), JSON.stringify({ commit, forcedColors }, null, 2));
});
