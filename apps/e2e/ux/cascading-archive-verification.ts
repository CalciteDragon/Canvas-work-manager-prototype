import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { configureContext } from './isolation';
import { seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';

/**
 * Slice 80's cascading archive evidence: the Capture scope's runtime contexts. A context marked
 * `afterOnly` has no before panel, because the state it shows cannot exist at the baseline
 * (`bfff1c6`), so the before run skips it. Fixtures are made by using the app or the host API,
 * never by editing seeds.
 */
const commit = process.env['UX_BEFORE'] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const before = Boolean(process.env['UX_BEFORE']);
const out = resolve('ux-output', commit);

export type Ctx = { page: Page; entry: Record<string, unknown> };
export type Context = {
  id: string; route: string; region: string;
  /** Capture only these views; both themes at 1440 and 375 otherwise. */
  views?: readonly (readonly ['dark' | 'light', number])[];
  afterOnly?: boolean;
  prepare?(): Promise<void>;
  act?(c: Ctx): Promise<void>;
};

const CONFIRM_R = '[data-project-archive-confirm]';
const openArchiveConfirm = async (c: Ctx) => {
  await c.page.getByRole('button', { name: 'More project actions', exact: true }).click();
  await c.page.getByRole('menuitem', { name: /^Archive (project|workstream)…$/ }).click();
  await expect(c.page.locator(CONFIRM_R)).toBeVisible();
};

export const CONTEXTS: Context[] = [
  { id: 'renovation-archive-confirm', route: '/projects/project-renovation', region: CONFIRM_R, act: openArchiveConfirm },
];

/** Browser-side evidence: the region's text and controls, the banner, the open toast and where focus is. */
function probe(region: string) {
  const text = (e: Element | null) => ((e as HTMLElement | null)?.innerText ?? e?.textContent ?? '').trim();
  const box = (e: Element) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const el = document.querySelector(region);
  const toast = document.querySelector('[data-toast]:popover-open');
  const active = document.activeElement;
  return {
    url: location.pathname,
    region: el ? { box: box(el), text: text(el).slice(0, 3000), controls: [...el.querySelectorAll('button, a[href], select')].map(c => ({ name: (c.getAttribute('aria-label') || text(c)).slice(0, 200), tag: c.tagName.toLowerCase(), box: box(c) })) } : null,
    banner: text(document.querySelector('app-archived-banner')).slice(0, 600) || null,
    toast: toast ? text(toast).slice(0, 300) : null,
    focus: active && active !== document.body ? (active.getAttribute('aria-label') || text(active)).slice(0, 200) : null,
    overflow: { document: document.documentElement.scrollWidth, viewport: innerWidth },
  };
}

test('Cascading archive evidence', async ({ browser }) => {
  await mkdir(out, { recursive: true });
  const match = process.env['UX_STATES_MATCH'];
  const file = resolve(out, 'cascading-archive-verification.json');
  const entries: Record<string, unknown>[] = match ? await readFile(file, 'utf8').then(s => JSON.parse(s).entries).catch(() => []) : [];
  const key = (e: Record<string, unknown>) => [e['context'], e['theme'], e['width']].join('|');
  const selected = CONTEXTS.filter(c => !before || !c.afterOnly);
  const views = (c: Context) => c.views ?? (['dark', 'light'] as const).flatMap(theme => [1440, 375].map(width => [theme, width] as const));
  for (const fixture of selected) for (const [theme, width] of views(fixture)) {
    if (match && !new RegExp(match).test([fixture.id, theme, width].join('|'))) continue;
    const entry: Record<string, unknown> = { context: fixture.id, theme, width, route: fixture.route };
    const consoleErrors: string[] = [];
    await seed('nested-projects'); await setClock(SEED_NOW);
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, hasTouch: width === 375, isMobile: width === 375, colorScheme: theme, timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce' });
    await configureContext(context);
    const page = await context.newPage();
    await page.clock.install({ time: new Date(SEED_NOW) });
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    try {
      await fixture.prepare?.();
      await page.goto('http://localhost:4200' + fixture.route, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle');
      const toggle = page.getByRole('button', { name: `Switch to the ${theme} theme` });
      if (await page.locator('html').getAttribute('data-theme') !== theme && await toggle.count()) await toggle.click();
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      await fixture.act?.({ page, entry });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      entry['screenshot'] = `cascading-${fixture.id}-${theme}-${width}.png`;
      await page.screenshot({ path: resolve(out, String(entry['screenshot'])), fullPage: true });
      Object.assign(entry, await page.evaluate(probe, fixture.region));
      const scan = await new AxeBuilder({ page }).options({ rules: { 'target-size': { enabled: true } } }).analyze();
      entry['axe'] = { violations: scan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) };
    } catch (error) { entry['error'] = String(error); }
    finally {
      entry['consoleErrors'] = consoleErrors;
      const prior = entries.findIndex(e => key(e) === key(entry)); if (prior >= 0) entries.splice(prior, 1); entries.push(entry);
      await context.close();
      await writeFile(file, JSON.stringify({ commit, entries }, null, 2));
    }
    console.log(`${entry['error'] ? 'error' : 'captured'}: ${key(entry)}${entry['error'] ? ' — ' + String(entry['error']).slice(0, 300) : ''}`);
  }
  expect(entries.filter(e => e['error']).map(e => `${key(e)}: ${String(e['error'])}`), 'all contexts captured').toEqual([]);
});
