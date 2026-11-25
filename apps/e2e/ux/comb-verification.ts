import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { configureContext } from './isolation';
import { api, createProject, seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';
import { runCoreTasks, waitForFailure } from './tasks';

/**
 * Slice 82's comb evidence at `C82` beyond the matrix: the core tasks T01–T12 (`UX_COMB=tasks`) and the
 * post-Gate 1 runtime surfaces the matrix does not reach (`UX_COMB=surfaces`, or `surfaces:<group>` for
 * one group), each light at 1440 and dark at 375. Every surface borrows the steps of the slice
 * verification file its group names; fixtures come from the app, a routed failure or the host API,
 * never from editing seeds. Surfaces merge into `comb/surfaces.json`, so a group can be rerun alone.
 */
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve('ux-output', commit);
const combDir = resolve(out, 'comb');
const [mode, only] = (process.env['UX_COMB'] ?? '').split(':');

type Group = 'feedback' | 'placement' | 'states' | 'archive' | 'navigation';
type Surface = {
  id: string; group: Group; seed: string; route: string;
  /** Fake the page clock at the seed date (default true). Slice 75's delayed saves ran on the real clock. */
  clock?: boolean;
  /** Host-side fixture; a returned path replaces `route`. */
  prepare?(): Promise<string | void>;
  /** Routes installed before navigation. */
  setup?(page: Page, state: Record<string, unknown>): Promise<unknown>;
  /** Brings the page to the surface for its main frame. */
  act?(page: Page, width: number, state: Record<string, unknown>): Promise<void>;
  /** A second frame of the same surface (e.g. Saved after Saving…). */
  after?: { name: string; run(page: Page, width: number, state: Record<string, unknown>): Promise<void> };
};

const KITCHEN = '/projects/project-kitchen';
const CABINETS = '/projects/project-cabinets';
const PANELS = [['light', 1440], ['dark', 375]] as const;
const failure = (message: string) => ({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message }) });
const phone = (width: number) => width < 768;
const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
const toast = (page: Page) => page.locator('[data-toast]:popover-open');
/** At 375 the tree is in the drawer behind Menu (Slice 81). */
const openMenu = async (page: Page) => { await page.getByRole('button', { name: 'Menu', exact: true }).click(); await expect(page.locator('#shell-navigation')).toBeVisible(); };
const TASKS_R = '[data-section-id="section-project-kitchen-tasks"]';

export const SURFACES: Surface[] = [
  // Slice 74 (`feedback-verification.ts`, remove-listed): the toast with Undo after a section removal.
  { id: 'toast-undo-section-removal', group: 'feedback', seed: 'nested-projects', route: KITCHEN,
    act: async page => { await page.getByRole('button', { name: /^Remove section / }).first().click(); await expect(toast(page)).toBeVisible(); } },
  // Slice 75 (`placement-verification.ts`, row-failures): two failed completions in one list.
  { id: 'row-failure', group: 'placement', seed: 'busy-week', route: '/projects/project-launch',
    setup: page => page.route('**/api/tasks/*/complete', route => route.fulfill(failure('Injected failure'))),
    act: async page => {
      const boxes = page.locator('[data-task-complete]:not(:checked)');
      await boxes.first().scrollIntoViewIfNeeded();
      for (let index = 0; index < 2; index += 1) { await boxes.nth(index).click(); await delay(500); }
      await expect(page.locator('[data-task-error]').first()).toBeVisible();
      await page.locator('[data-task-error]').first().scrollIntoViewIfNeeded();
    } },
  // Slice 75 (`placement-verification.ts`, drawer-save): Saving… on a delayed PATCH, then Saved.
  { id: 'drawer-saving', group: 'placement', seed: 'nested-projects', route: KITCHEN, clock: false,
    setup: page => page.route('**/api/tasks/*', async route => { if (route.request().method() === 'PATCH') await delay(2000); await route.fallback(); }),
    act: async page => {
      await page.getByRole('button', { name: /, open details$/ }).first().click();
      const priority = page.locator('[data-task-priority]');
      await priority.waitFor();
      await priority.selectOption((await priority.inputValue()) === 'high' ? 'low' : 'high');
      await expect(page.locator('[data-field-status="priority"]')).toContainText('Saving');
    },
    after: { name: 'saved', run: async page => { await expect(page.locator('[data-field-status="priority"]')).not.toContainText('Saving', { timeout: 6000 }); await delay(400); } } },
  // Slice 78 (`states-verification.ts`, kitchen-tasks-lifted): a failed section read, then recovered by Try again.
  { id: 'section-failed-recovered', group: 'states', seed: 'nested-projects', route: KITCHEN,
    setup: async (page, state) => { state['failing'] = true; await page.route(url => /^\/api\/tasks$/.test(new URL(url).pathname), route => route.request().method() === 'GET' && state['failing'] ? route.fulfill(failure('Audit: tasks read failed')) : route.fallback()); },
    act: async (page, _width, state) => { await waitForFailure(page, TASKS_R, 'Audit: tasks read failed'); await page.locator(TASKS_R).scrollIntoViewIfNeeded(); state['failing'] = false; },
    after: { name: 'recovered', run: async page => {
      await page.locator(TASKS_R).getByRole('button', { name: /^(Try again|Retry)$/ }).first().click();
      await expect(page.locator(`${TASKS_R} [data-task-row]`).first()).toBeVisible();
    } } },
  // Slice 80 (`cascading-archive-verification.ts`, renovation-archive-confirm): the cascade confirmation (a sheet at 375).
  { id: 'archive-cascade-confirm', group: 'archive', seed: 'nested-projects', route: '/projects/project-renovation',
    act: async page => {
      await page.getByRole('button', { name: 'More project actions', exact: true }).click();
      await page.getByRole('menuitem', { name: /^Archive (project|workstream)…$/ }).click();
      await expect(page.locator('[data-project-archive-confirm]')).toBeVisible();
    } },
  // Slice 81 (`navigation-tree-verification.ts`): the edit-project menu, the tree at depth (in the drawer at 375), the skip link.
  { id: 'edit-project-menu-open', group: 'navigation', seed: 'nested-projects', route: KITCHEN,
    act: async (page, width) => { if (phone(width)) await openMenu(page); await page.locator('app-sidebar [data-edit-project]').click(); await expect(page.getByRole('menuitem').first()).toBeVisible(); } },
  { id: 'tree-at-depth', group: 'navigation', seed: 'nested-projects', route: CABINETS,
    prepare: async () => {
      const { workspace } = await api.get<{ workspace: { id: string } }>('/api/me');
      let parent = 'project-cabinets';
      for (const level of [1, 2, 3, 4, 5]) parent = (await createProject({ workspaceId: workspace.id, kind: 'subproject', parentProjectId: parent, name: `Level ${level}` } as never)).id;
      return `/projects/${parent}`;
    },
    act: async (page, width) => { if (phone(width)) await openMenu(page); await expect(page.locator('#shell-navigation [aria-current="page"]')).toBeVisible(); } },
  { id: 'skip-link-focused', group: 'navigation', seed: 'nested-projects', route: CABINETS,
    act: async page => { await page.keyboard.press('Tab'); await expect(page.locator('[data-skip-link]')).toBeFocused(); } },
];

/** Where focus is and what lift is open, for the auditors' reading of a frame. */
function probe() {
  const text = (e: Element | null) => ((e as HTMLElement | null)?.innerText ?? '').trim();
  const active = document.activeElement;
  const lift = document.querySelector('dialog[open], [role="dialog"], [popover]:popover-open:not([data-toast])');
  const toastEl = document.querySelector('[data-toast]:popover-open');
  return {
    url: location.pathname, title: document.title, h1: text(document.querySelector('h1')) || null,
    lift: lift ? text(lift).slice(0, 600) : null, toast: toastEl ? text(toastEl).slice(0, 300) : null,
    focus: active && active !== document.body ? (active.getAttribute('aria-label') || text(active)).slice(0, 200) : null,
    overflow: { document: document.documentElement.scrollWidth, viewport: innerWidth },
  };
}

test('comb core tasks', async ({ browser }) => {
  test.skip(Boolean(mode) && mode !== 'tasks', 'UX_COMB selects another part');
  await runCoreTasks(browser, resolve(out, 'tasks'));
  const tasks: { id: string; status: string; steps: { action: string; status: string }[] }[] = JSON.parse(await readFile(resolve(out, 'tasks/tasks.json'), 'utf8'));
  // T10's dead end (no Connect agent control, slice 8) is the one known; any other is a comb finding, recorded, not hidden.
  const knownDeadEnd = (t: (typeof tasks)[number]) => t.id === 'T10' && t.steps.filter(s => s.status === 'blocked').map(s => s.action).join() === 'Find Connect agent control';
  expect(tasks.filter(t => t.status !== 'completed' && !knownDeadEnd(t)).map(t => t.id), 'core tasks complete').toEqual([]);
});

test('comb runtime surfaces', async ({ browser }) => {
  test.skip(Boolean(mode) && mode !== 'surfaces', 'UX_COMB selects another part');
  await mkdir(combDir, { recursive: true });
  const file = resolve(combDir, 'surfaces.json');
  const entries: Record<string, unknown>[] = await readFile(file, 'utf8').then(s => JSON.parse(s).entries).catch(() => []);
  const key = (e: Record<string, unknown>) => [e['surface'], e['theme'], e['width']].join('|');
  for (const surface of SURFACES.filter(s => !only || s.group === only)) for (const [theme, width] of PANELS) {
    const entry: Record<string, unknown> = { surface: surface.id, group: surface.group, seed: surface.seed, theme, width, route: surface.route, frames: [] };
    const consoleErrors: string[] = [];
    const state: Record<string, unknown> = {};
    await seed(surface.seed); await setClock(SEED_NOW);
    const context = await browser.newContext({ viewport: { width, height: phone(width) ? 812 : 900 }, hasTouch: phone(width), isMobile: phone(width), colorScheme: theme, timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce' });
    await configureContext(context);
    const page = await context.newPage();
    if (surface.clock !== false) await page.clock.install({ time: new Date(SEED_NOW) });
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const frame = async (name: string) => {
      const base = `${surface.id}${name ? '-' + name : ''}-${theme}-${width}`;
      await page.screenshot({ path: resolve(combDir, `${base}.png`), fullPage: true });
      const scan = await new AxeBuilder({ page }).options({ rules: { 'target-size': { enabled: true } } }).analyze();
      await writeFile(resolve(combDir, `${base}.axe.json`), JSON.stringify({ violations: scan.violations, incomplete: scan.incomplete }, null, 2));
      await writeFile(resolve(combDir, `${base}.aria.yml`), await page.locator('body').ariaSnapshot());
      (entry['frames'] as unknown[]).push({ name: name || 'main', screenshot: `comb/${base}.png`, ...(await page.evaluate(probe)),
        axe: { violations: scan.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), incomplete: scan.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })) } });
    };
    try {
      const route = (await surface.prepare?.()) || surface.route;
      entry['route'] = route;
      await surface.setup?.(page, state);
      await page.goto('http://localhost:4200' + route, { waitUntil: 'load' });
      await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
      await page.waitForLoadState('networkidle');
      const toggle = page.getByRole('button', { name: `Switch to the ${theme} theme` });
      if (await page.locator('html').getAttribute('data-theme') !== theme && await toggle.count()) await toggle.click();
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      await surface.act?.(page, width, state);
      await frame('');
      if (surface.after) { await surface.after.run(page, width, state); await frame(surface.after.name); }
    } catch (error) {
      entry['error'] = String(error).slice(0, 600);
      await page.screenshot({ path: resolve(combDir, `${surface.id}-error-${theme}-${width}.png`), fullPage: true }).catch(() => undefined);
    } finally {
      entry['consoleErrors'] = consoleErrors;
      const prior = entries.findIndex(e => key(e) === key(entry)); if (prior >= 0) entries.splice(prior, 1); entries.push(entry);
      await context.close();
      await writeFile(file, JSON.stringify({ commit, entries }, null, 2));
    }
    console.log(`${entry['error'] ? 'error' : 'captured'}: ${key(entry)}${entry['error'] ? ' — ' + String(entry['error']).slice(0, 300) : ''}`);
  }
  expect(entries.filter(e => e['error']).map(e => `${key(e)}: ${String(e['error'])}`), 'all runtime surfaces captured').toEqual([]);
});
