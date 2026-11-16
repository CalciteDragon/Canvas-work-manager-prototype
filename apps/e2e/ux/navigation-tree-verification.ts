import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { configureContext } from './isolation';
import { api, createProject, seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';
import { navLocators, runCoreTasks } from './tasks';

/**
 * Slice 81's navigation tree evidence. Under `UX_OBJECTS=1` `capture.ts` skips its legacy task
 * baseline, so the core-task counts come from here (Capture scope). Step 13 adds the Capture scope's
 * runtime contexts, light at 1440 and dark at 375 unless a context names its views. A context marked
 * `afterOnly` shows a state the baseline (`1a0fb0d`) cannot have, so the before run skips it.
 * Fixtures are made by using the app or the host API, never by editing seeds. Label: `UX_BEFORE`, or HEAD.
 */
const commit = process.env['UX_BEFORE'] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const before = Boolean(process.env['UX_BEFORE']);
const out = resolve('ux-output', commit);
const nav = navLocators(before);

type Theme = 'dark' | 'light';
export type Context = {
  id: string; route: string;
  views?: readonly (readonly [Theme, number])[];
  afterOnly?: boolean;
  forcedColors?: boolean;
  /** Host-side fixture; a returned path replaces `route`. */
  prepare?(): Promise<string | void>;
  act?(page: Page, width: number): Promise<void>;
};

const KITCHEN = '/projects/project-kitchen';
const CABINETS = '/projects/project-cabinets';
const PANELS = [['light', 1440], ['dark', 375]] as const;
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const phone = (width: number) => width < 768;
/** At 375 the tree is in the drawer behind Menu. */
const openMenu = async (page: Page) => { await button(page, 'Menu').click(); await expect(page.locator('#shell-navigation')).toBeVisible(); };
/** Before: the column's own button (behind "Show project navigation" when folded). After: the pencil's menu item. */
const navAction = async (page: Page, width: number, name: string) => {
  if (before) {
    const show = button(page, 'Show project navigation');
    if (await show.isVisible()) await show.click();
    await button(page, name).click();
    return;
  }
  if (phone(width)) await openMenu(page);
  await page.locator('app-sidebar [data-edit-project]').click();
  await page.getByRole('menuitem', { name, exact: true }).click();
};

export const CONTEXTS: Context[] = [
  { id: 'kitchen', route: KITCHEN },
  { id: 'cabinets', route: CABINETS },
  { id: 'kitchen-menu-open', route: KITCHEN, views: [['dark', 375]], act: page => openMenu(page) },
  { id: 'add-workstream-kitchen', route: KITCHEN, act: async (page, width) => { await navAction(page, width, nav.addWorkstream); await expect(page.getByRole('dialog')).toBeVisible(); } },
  { id: 'page-settings-open', route: KITCHEN, act: async (page, width) => { await navAction(page, width, nav.pageSettings); await expect(page.locator('[data-project-page-manager]')).toBeVisible(); } },
  { id: 'legacy-shelving', route: '/projects/project-legacy-child' },
  { id: 'forced-colours-kitchen', route: KITCHEN, forcedColors: true },
  { id: 'deep-tree', route: CABINETS, afterOnly: true,
    prepare: async () => {
      const { workspace } = await api.get<{ workspace: { id: string } }>('/api/me');
      let parent = 'project-cabinets';
      for (const level of [1, 2, 3, 4, 5]) parent = (await createProject({ workspaceId: workspace.id, kind: 'subproject', parentProjectId: parent, name: `Level ${level}` } as never)).id;
      return `/projects/${parent}`;
    } },
  { id: 'skip-link-focused', route: CABINETS, afterOnly: true, act: async page => { await page.keyboard.press('Tab'); await expect(page.locator('[data-skip-link]')).toBeFocused(); } },
  { id: 'edit-project-menu-open', route: KITCHEN, afterOnly: true,
    act: async (page, width) => { if (phone(width)) await openMenu(page); await page.locator('app-sidebar [data-edit-project]').click(); await expect(page.getByRole('menuitem').first()).toBeVisible(); } },
  { id: 'all-projects-level', route: CABINETS, afterOnly: true,
    act: async (page, width) => { if (phone(width)) await openMenu(page); await page.locator('app-sidebar').getByRole('button', { name: 'All projects', exact: true }).click(); await expect(page.locator('app-sidebar [aria-current="location"]')).toBeVisible(); } },
  { id: 'drawer-dismiss-focused', route: KITCHEN, afterOnly: true, views: [['dark', 375]],
    act: async page => { await openMenu(page); await page.locator('[data-shell-drawer-dismiss]').focus(); await expect(page.locator('[data-shell-drawer-dismiss]')).toBeFocused(); } },
];

/** Browser-side evidence: the tree, the header, the current item, the open lift and where focus is. */
function probe() {
  const text = (e: Element | null) => ((e as HTMLElement | null)?.innerText ?? e?.textContent ?? '').trim();
  /** The accessible text: its label, or its text without decorative icons, read even inside the closed drawer. */
  const name = (e: Element | null) => {
    if (!e) return null;
    const copy = e.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(icon => icon.remove());
    return (e.getAttribute('aria-label') || copy.textContent || '').replace(/\s+/g, ' ').trim();
  };
  const box = (e: Element | null) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const nav = document.querySelector('#shell-navigation');
  const header = document.querySelector('app-project-header');
  const current = nav?.querySelector('[aria-current="page"]') ?? null;
  const active = document.activeElement;
  const lift = document.querySelector('dialog[open], [role="dialog"], [popover]:popover-open:not([data-toast])');
  return {
    url: location.pathname, title: document.title,
    navigation: nav ? { box: box(nav), visible: getComputedStyle(nav).visibility !== 'hidden', text: text(nav).slice(0, 3000) } : null,
    header: header ? { box: box(header), text: text(header).slice(0, 1000) } : null,
    current: current ? { name: name(current), box: box(current), outline: getComputedStyle(current).outlineStyle, border: getComputedStyle(current).borderInlineStartStyle } : null,
    location: name(nav?.querySelector('[aria-current="location"]') ?? null) || null,
    h1: text(document.querySelector('h1')) || null,
    lift: lift ? { box: box(lift), text: text(lift).slice(0, 600) } : null,
    focus: active && active !== document.body ? name(active)!.slice(0, 200) : null,
    overflow: { document: document.documentElement.scrollWidth, viewport: innerWidth },
  };
}

test('navigation tree runtime contexts', async ({ browser }) => {
  await mkdir(out, { recursive: true });
  const match = process.env['UX_NAV_MATCH'];
  const file = resolve(out, 'navigation-tree-contexts.json');
  const entries: Record<string, unknown>[] = match ? await readFile(file, 'utf8').then(s => JSON.parse(s).entries).catch(() => []) : [];
  const key = (e: Record<string, unknown>) => [e['context'], e['theme'], e['width']].join('|');
  for (const fixture of CONTEXTS.filter(c => !before || !c.afterOnly)) for (const [theme, width] of fixture.views ?? PANELS) {
    if (match && !new RegExp(match).test([fixture.id, theme, width].join('|'))) continue;
    const entry: Record<string, unknown> = { context: fixture.id, theme, width, route: fixture.route };
    const consoleErrors: string[] = [];
    await seed('nested-projects'); await setClock(SEED_NOW);
    const context = await browser.newContext({ viewport: { width, height: phone(width) ? 812 : 900 }, hasTouch: phone(width), isMobile: phone(width), colorScheme: theme, forcedColors: fixture.forcedColors ? 'active' : 'none', timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce' });
    await configureContext(context);
    const page = await context.newPage();
    await page.clock.install({ time: new Date(SEED_NOW) });
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    try {
      const route = (await fixture.prepare?.()) || fixture.route;
      entry['route'] = route;
      await page.goto('http://localhost:4200' + route, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle');
      const toggle = page.getByRole('button', { name: `Switch to the ${theme} theme` });
      if (await page.locator('html').getAttribute('data-theme') !== theme && await toggle.count()) await toggle.click();
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      await fixture.act?.(page, width);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      entry['screenshot'] = `navigation-${fixture.id}-${theme}-${width}.png`;
      await page.screenshot({ path: resolve(out, String(entry['screenshot'])), fullPage: true });
      Object.assign(entry, await page.evaluate(probe));
      const scan = await new AxeBuilder({ page }).options({ rules: { 'target-size': { enabled: true } } }).analyze();
      entry['axe'] = { violations: scan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) };
    } catch (error) { entry['error'] = String(error); }
    finally {
      entry['consoleErrors'] = consoleErrors;
      const prior = entries.findIndex(e => key(e) === key(entry)); if (prior >= 0) entries.splice(prior, 1); entries.push(entry);
      await context.close();
      await writeFile(file, JSON.stringify({ commit, before, entries }, null, 2));
    }
    console.log(`${entry['error'] ? 'error' : 'captured'}: ${key(entry)}${entry['error'] ? ' — ' + String(entry['error']).slice(0, 300) : ''}`);
  }
  expect(entries.filter(e => e['error']).map(e => `${key(e)}: ${String(e['error'])}`), 'all contexts captured').toEqual([]);
});

test('navigation tree core tasks', async ({ browser }) => {
  await runCoreTasks(browser, resolve(out, 'tasks'));
  const tasks: { id: string; status: string; clicks: number; deadEnds: number; steps: { action: string; status: string }[] }[] = JSON.parse(await readFile(resolve(out, 'tasks/tasks.json'), 'utf8'));
  await writeFile(resolve(out, 'navigation-tree-verification.json'), JSON.stringify({ commit, before, tasks }, null, 2));
  // T10's known dead end (no Connect agent control, slice 8) is the only one allowed, and only at that step.
  // Comparing clicks with step 0's counts is Acceptance item 6, read from the two builds' JSON by the sheet.
  const knownDeadEnd = (t: (typeof tasks)[number]) => t.id === 'T10' && t.steps.filter(s => s.status === 'blocked').map(s => s.action).join() === 'Find Connect agent control';
  expect(tasks.filter(t => t.status !== 'completed' && !knownDeadEnd(t)).map(t => t.id), 'core tasks complete').toEqual([]);
});
