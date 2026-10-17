import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';

/** Supplement the preserved baseline with actual visible persistent blur counts. */
test('Genuine before lift layer budget', async ({ browser }) => {
  const commit = process.env['UX_BEFORE'];
  test.skip(!commit);
  const layers = [];
  for (const theme of ['dark', 'light'] as const) for (const width of [1440, 375]) {
    await seed('nested-projects');
    await setClock(SEED_NOW);
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, colorScheme: theme, hasTouch: width === 375, isMobile: width === 375 });
    await configureContext(context);
    const page = await context.newPage();
    await page.goto('http://localhost:4200/projects/project-kitchen');
    await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForLoadState('networkidle');
    const selectors = await page.evaluate(() => [...document.querySelectorAll('*')]
      .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).backdropFilter !== 'none')
      .map(element => ({ tag: element.tagName, class: element.getAttribute('class'), filter: getComputedStyle(element).backdropFilter })));
    layers.push({ theme, width, route: '/projects/project-kitchen', persistent: selectors.length, selectors });
    await context.close();
  }
  const out = resolve('ux-output', commit!);
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'lift-baseline.json'), JSON.stringify({ commit, complete: true, layers, source: 'Preserved genuine baseline production build; supplemental measurement leaves the194-cell capture unchanged.' }, null, 2));
});
