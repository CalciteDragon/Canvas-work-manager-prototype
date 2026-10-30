import { test, expect, type Page, type Route } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { addSection, api, createRoot, jsonRequest, seed, setClock } from '../seed';
import type { ProjectSection } from '@cwm/contracts';
import { SEED_NOW } from './matrix';
import { runCoreTasks, waitForFailure } from './tasks';
import AxeBuilder from '@axe-core/playwright';
// @ts-expect-error Browser-serializable helper also exercised by node:test.
import { axeNodeIdentity, collectControls } from './layout.mjs';

/**
 * Slice 78's states evidence: every Capture scope failure, loading and pending context, run
 * unchanged against the before and after builds. Fixtures drive the UI through hooks and roles
 * both builds share and never assert either build's copy.
 */
const commit=process.env['UX_BEFORE'] || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const out=resolve('ux-output',commit);
const taskIds=[...Array.from({length:9},(_,i)=>'T'+String(i+1).padStart(2,'0')),'T11','T12'];

export type Row = {
  context: string;
  /** A CSS selector present in both builds; the first match is the region. */
  region: string;
  kind: 'read' | 'write' | 'stale' | 'loading' | 'pending';
  recovery: 'try-again' | 'go-home' | 'retry-refresh' | 'reload' | 'none';
  details: boolean;
  /** The `data-*-empty` hook that would falsely show in this region, or null. */
  emptyHook: string | null;
  pinned: 'top' | 'bottom' | null;
  /** A `pending` row's declared text, which the region must show. */
  text: string | null;
};

const KITCHEN = '/projects/project-kitchen';
const section = (id: string) => `[data-section-id="section-project-kitchen-${id}"]`;
const TASKS_R = section('tasks'), REFL_R = section('reflections'), TIME_R = section('timeline'), PROG_R = section('progress'), ACT_R = section('recent-activity'), BRIEF_R = section('brief');
const SHORTCUT_R = '[data-shortcut-id="shortcut-renovation-kitchen-tasks"]';
const row = (context: string, region: string, kind: Row['kind'], recovery: Row['recovery'], details: boolean, emptyHook: string | null = null, pinned: Row['pinned'] = null, text: string | null = null): Row =>
  ({ context, region, kind, recovery, details, emptyHook, pinned, text });

/**
 * The context table. **It is the gate's only source of exemptions**: profile 78 checks every
 * rule under Done when against these rows and nothing else, so an expectation that is not
 * declared here is not exempt. Rows state the after build's intent; the before build is
 * expected to fail many of them. `lab` has no row: it is a panel-geometry fixture, not a state.
 */
export const ROWS: Row[] = [
  row('dashboard-me-failing', 'app-dashboard-page', 'read', 'try-again', true, 'data-dashboard-empty'),
  row('dashboard-me-failing', 'app-sidebar', 'read', 'try-again', true, 'data-projects-empty'),
  row('dashboard-real-ai', 'app-daily-digest-widget', 'read', 'try-again', false),
  row('sidebar-loading', 'app-sidebar', 'loading', 'none', false, 'data-projects-empty'),
  row('sidebar-failed', 'app-sidebar', 'read', 'try-again', true, 'data-projects-empty'),
  row('project-read-failing', 'main', 'read', 'try-again', true),
  row('project-unavailable-alex', 'main', 'read', 'go-home', false),
  row('kitchen-sections-failing', 'app-project-canvas', 'read', 'try-again', true, 'data-empty-canvas'),
  row('kitchen-shortcuts-failing', 'app-project-canvas', 'read', 'try-again', true),
  row('kitchen-bodies-failing', TASKS_R, 'read', 'try-again', true, 'data-tasks-empty'),
  row('kitchen-bodies-failing', REFL_R, 'read', 'try-again', true, 'data-reflections-empty'),
  row('kitchen-bodies-failing', TIME_R, 'read', 'try-again', true, 'data-timeline-empty'),
  row('kitchen-bodies-failing', PROG_R, 'read', 'try-again', true),
  row('kitchen-bodies-failing', ACT_R, 'read', 'try-again', true, 'data-activity-empty'),
  row('kitchen-reflection-create-failing', REFL_R, 'write', 'none', true),
  row('kitchen-reflection-edit-failing', REFL_R, 'write', 'none', true),
  row('kitchen-section-create-failing', 'app-section-create-dialog', 'write', 'none', true),
  row('kitchen-tasks-lifted', TASKS_R, 'read', 'try-again', true, 'data-tasks-empty'),
  row('todos-failing', 'app-todos-page', 'read', 'try-again', true, 'data-todos-empty'),
  row('reflections-page-failing', 'app-reflections-page', 'read', 'try-again', true, 'data-reflections-empty'),
  row('archive-failing', 'app-archive-page', 'read', 'try-again', true, 'data-archive-empty'),
  row('archived-projects-failing', 'app-archived-projects-page', 'read', 'try-again', true, 'data-archived-empty'),
  row('agents-failing', 'app-agent-connections-page', 'read', 'try-again', true, 'data-agents-empty'),
  row('picker-discovery-failing', 'app-shortcut-picker', 'read', 'try-again', true, 'data-shortcut-picker-empty'),
  row('todos-stale', 'app-todos-page', 'stale', 'try-again', true, 'data-todos-empty'),
  row('archive-restore-failing', 'app-archive-page', 'write', 'try-again', true),
  row('archive-restore-unrefreshed', 'app-archive-page', 'write', 'retry-refresh', true),
  row('archive-stale', 'app-archive-page', 'stale', 'try-again', true, 'data-archive-empty'),
  row('archived-projects-stale', 'app-archived-projects-page', 'stale', 'try-again', true, 'data-archived-empty'),
  row('kitchen-progress-formula-failing', PROG_R, 'write', 'none', true),
  row('write-task-complete', TASKS_R, 'write', 'none', true),
  row('write-drawer-field', 'app-task-detail-drawer', 'write', 'none', true),
  row('write-quick-add', TASKS_R, 'write', 'none', true),
  row('write-section-removal-toast', '[data-toast]:popover-open', 'write', 'none', true),
  row('markdown-save-failing', BRIEF_R, 'write', 'none', true),
  row('pin-todos-below', 'app-todos-page', 'write', 'none', true, null, 'bottom'),
  row('pin-tasklist-above', TASKS_R, 'write', 'none', true, null, 'top'),
  row('pin-section-collapse', BRIEF_R, 'write', 'none', true, null, 'top'),
  row('pin-shortcut-collapse', SHORTCUT_R, 'write', 'none', true, null, 'bottom'),
  row('pin-tall-tasklist-banner', TASKS_R, 'write', 'none', true, null, 'top'),
  row('header-progress-empty-project', 'app-project-header', 'read', 'none', false),
  row('header-progress-failing', 'app-project-header', 'read', 'none', false),
  row('header-progress-legacy', 'app-project-header', 'read', 'none', false),
  row('not-found', 'main', 'read', 'go-home', false),
  row('kitchen-loading', 'app-project-canvas', 'loading', 'none', false, 'data-empty-canvas'),
  row('header-progress-pending', 'app-project-header', 'pending', 'none', false, null, null, 'Measuring…'),
];

/** Per-capture working state shared by a context's hooks; `regions` are the context's rows' regions. */
export type Ctx = { page: Page; entry: Record<string, unknown>; state: Record<string, unknown>; regions: string[]; shot: (suffix: string) => Promise<string>; releases: (() => void)[] };
export type Context = {
  id: string; seed: string; route: string | ((state: Record<string, unknown>) => string);
  persona?: 'user-alex' | 'user-sam';
  /** The exact injected message, when a failure is injected. */
  reason?: string;
  /** Node-side host preparation after seeding, before the browser exists. */
  prepare?(state: Record<string, unknown>): Promise<void>;
  /** Routes installed before navigation. */
  setup?(c: Ctx): Promise<void>;
  /** Drives the page after load until the state under capture is on screen. */
  act?(c: Ctx): Promise<void>;
  /** Extra evidence after the main capture (retry, cancel, pin press). */
  after?(c: Ctx): Promise<void>;
  teardown?(state: Record<string, unknown>): Promise<void>;
  /** A held read: navigation does not wait for network idle. */
  held?: boolean;
  /** Extra element screenshots. */
  frames?: string[];
};

const body = (message: string) => JSON.stringify({ error: 'internal_error', message });
const path = (pattern: RegExp) => (url: URL) => pattern.test(url.pathname);
/** Fulfils `method` requests on `pattern` with a 500 while `when()` holds. */
async function fail(page: Page, pattern: RegExp, method: string, message: string, when: () => boolean = () => true) {
  await page.route(path(pattern), (route: Route) => route.request().method() === method && when()
    ? route.fulfill({ status: 500, contentType: 'application/json', body: body(message) }) : route.fallback());
}
/** Holds `GET` requests on `pattern` until released (or `maxMs`), then lets them through. */
async function hold(c: Ctx, pattern: RegExp, maxMs: number) {
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  let seen!: () => void; const observed = new Promise<void>(r => { seen = r; });
  c.releases.push(release);
  await c.page.route(path(pattern), async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    seen(); await Promise.race([gate, new Promise(r => setTimeout(r, maxMs))]);
    await route.fallback().catch(() => undefined);
  });
  c.state['observed'] = observed;
}
const heldObserved = async (c: Ctx) => { await (c.state['observed'] as Promise<void>); await c.page.waitForTimeout(1500); };
/** Scrolls the nearest scrolling ancestor of `selector`'s first match. `to` is a scrollTop or an edge. */
async function scrollPort(page: Page, selector: string, to: number | 'top' | 'bottom' | { above: string; margin: number }) {
  await page.locator(selector).first().evaluate((el, to) => {
    let port: Element | null = el.parentElement;
    while (port && !(['auto', 'scroll'].includes(getComputedStyle(port).overflowY) && port.scrollHeight > port.clientHeight)) port = port.parentElement;
    const scroller = (port ?? document.scrollingElement)!;
    if (to === 'top') scroller.scrollTop = 0;
    else if (to === 'bottom') scroller.scrollTop = scroller.scrollHeight;
    else if (typeof to === 'number') scroller.scrollTop = to;
    else {
      // Move the target wholly above the port's top edge by `margin` pixels.
      const target = el.querySelector(to.above) ?? el;
      const portTop = port ? port.getBoundingClientRect().top : 0;
      scroller.scrollTop += target.getBoundingClientRect().bottom - portTop + to.margin;
    }
  }, to);
  await page.waitForTimeout(300);
}
const FAILURE = '[role=alert],[data-tasks-error],[data-task-error],[data-quick-create-error],[data-todo-error],[data-section-error]';
const openPhoneMenu = async (page: Page) => {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
};
const firstTaskRow = (page: Page) => page.locator(`${TASKS_R} [data-task-row]`).first();

export const CONTEXTS: Context[] = [
  { id: 'dashboard-me-failing', seed: 'busy-week', route: '/app', reason: 'Audit: me read failed',
    setup: c => fail(c.page, /^\/api\/me$/, 'GET', 'Audit: me read failed'),
    act: c => waitForFailure(c.page, null, 'Audit: me read failed') },
  { id: 'dashboard-real-ai', seed: 'agent-heavy', route: '/app', frames: ['app-dashboard-page'],
    prepare: () => jsonRequest('/prototype/ai-provider', { method: 'POST', body: { provider: 'real' } }).then(() => undefined),
    act: c => waitForFailure(c.page, null),
    teardown: () => jsonRequest('/prototype/ai-provider', { method: 'POST', body: { provider: 'mock' } }).then(() => undefined) },
  // The sidebar's tree is the status-filtered projects list. Held past the 8 s scenario until
  // the capture is collected, so the evidence is never taken after the read answered.
  // At 375 the sidebar sits behind the phone menu; open it so the region is on screen.
  { id: 'sidebar-loading', seed: 'busy-week', route: '/app', held: true,
    setup: c => hold(c, /^\/api\/projects$/, 60_000), act: async c => { await openPhoneMenu(c.page); await heldObserved(c); } },
  { id: 'sidebar-failed', seed: 'busy-week', route: '/app', reason: 'Audit: projects read failed',
    setup: c => fail(c.page, /^\/api\/projects$/, 'GET', 'Audit: projects read failed'),
    act: async c => { await openPhoneMenu(c.page); await waitForFailure(c.page, 'app-sidebar', 'Audit: projects read failed'); } },
  { id: 'project-read-failing', seed: 'busy-week', route: '/projects/project-launch', reason: 'Audit: project read failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-launch$/, 'GET', 'Audit: project read failed'),
    act: c => waitForFailure(c.page, 'main', 'Audit: project read failed') },
  // Natural 404: Home renovation is Demo's; Alex's workspace holds only Alex private plan.
  { id: 'project-unavailable-alex', seed: 'nested-projects', route: '/projects/project-renovation', persona: 'user-alex' },
  { id: 'kitchen-sections-failing', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: sections read failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-kitchen\/sections$/, 'GET', 'Audit: sections read failed'),
    act: c => waitForFailure(c.page, 'app-project-canvas', 'Audit: sections read failed') },
  { id: 'kitchen-shortcuts-failing', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: shortcuts read failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-kitchen\/shortcuts$/, 'GET', 'Audit: shortcuts read failed'),
    act: c => waitForFailure(c.page, 'app-project-canvas', 'Audit: shortcuts read failed') },
  { id: 'kitchen-bodies-failing', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: section read failed',
    setup: async c => {
      for (const pattern of [/^\/api\/tasks$/, /^\/api\/reflections$/, /^\/api\/projects\/project-kitchen\/timeline$/, /^\/api\/projects\/project-kitchen\/progress$/, /^\/api\/activity$/])
        await fail(c.page, pattern, 'GET', 'Audit: section read failed');
    },
    act: async c => { for (const region of [TASKS_R, REFL_R, TIME_R, PROG_R, ACT_R]) await waitForFailure(c.page, region, 'Audit: section read failed').catch(() => { (c.entry['notes'] as string[] ?? (c.entry['notes'] = [])).push(`no failure rendered in ${region}`); }); } },
  { id: 'kitchen-reflection-create-failing', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: reflection create failed',
    setup: c => fail(c.page, /^\/api\/reflections$/, 'POST', 'Audit: reflection create failed'),
    act: async c => {
      const region = c.page.locator(REFL_R);
      await region.locator('[data-reflection-body]').fill('Audit reflection');
      await region.locator('[data-reflection-create] button[type=submit]').click();
      await waitForFailure(c.page, REFL_R, 'Audit: reflection create failed');
    } },
  { id: 'kitchen-reflection-edit-failing', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: reflection edit failed',
    prepare: () => api.post('/api/reflections', { projectId: 'project-kitchen', sectionId: 'section-project-kitchen-reflections', title: 'Audit reflection', body: 'A reflection to edit.' }).then(() => undefined),
    setup: c => fail(c.page, /^\/api\/reflections\/[^/]+$/, 'PATCH', 'Audit: reflection edit failed'),
    act: async c => {
      const region = c.page.locator(REFL_R);
      await region.locator('[data-reflection-edit]').first().click();
      await region.locator('[data-reflection-edit-body]').fill('An edit that fails.');
      await region.locator('[data-reflection-edit-form] button[type=submit]').click();
      await waitForFailure(c.page, REFL_R, 'Audit: reflection edit failed');
    } },
  { id: 'kitchen-section-create-failing', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: section create failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-kitchen\/sections$/, 'POST', 'Audit: section create failed'),
    act: async c => {
      await c.page.getByRole('button', { name: 'Add a section', exact: true }).click();
      await c.page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
      await waitForFailure(c.page, 'app-section-create-dialog', 'Audit: section create failed');
    } },
  { id: 'kitchen-tasks-lifted', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: tasks read failed',
    setup: async c => { c.state['failing'] = true; await fail(c.page, /^\/api\/tasks$/, 'GET', 'Audit: tasks read failed', () => c.state['failing'] === true); },
    act: async c => { await waitForFailure(c.page, TASKS_R, 'Audit: tasks read failed'); c.state['failing'] = false; },
    after: async c => {
      const retry = c.page.locator(TASKS_R).getByRole('button', { name: /^(Try again|Retry)$/ });
      c.entry['retryAvailable'] = await retry.count() > 0;
      if (!await retry.count()) return;
      await retry.first().click();
      await expect(c.page.locator(`${TASKS_R} [data-task-row]`).first()).toBeVisible();
      c.entry['afterRetryScreenshot'] = await c.shot('after-retry');
    } },
  { id: 'todos-failing', seed: 'nested-projects', route: '/projects/project-renovation/pages/todos', reason: 'Audit: todos read failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-renovation\/todos$/, 'GET', 'Audit: todos read failed'),
    act: c => waitForFailure(c.page, 'app-todos-page', 'Audit: todos read failed') },
  // The page's journal and completed-work reads both fail.
  { id: 'reflections-page-failing', seed: 'nested-projects', route: '/projects/project-renovation/pages/reflections', reason: 'Audit: journal read failed',
    setup: async c => {
      await fail(c.page, /^\/api\/projects\/project-renovation\/journal$/, 'GET', 'Audit: journal read failed');
      await fail(c.page, /^\/api\/projects\/project-renovation\/completed-work$/, 'GET', 'Audit: journal read failed');
    },
    act: c => waitForFailure(c.page, 'app-reflections-page', 'Audit: journal read failed') },
  { id: 'archive-failing', seed: 'nested-projects', route: '/projects/project-renovation/pages/archive', reason: 'Audit: archive read failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-renovation\/archive$/, 'GET', 'Audit: archive read failed'),
    act: c => waitForFailure(c.page, 'app-archive-page', 'Audit: archive read failed') },
  { id: 'archived-projects-failing', seed: 'nested-projects', route: '/settings/archived-projects', reason: 'Audit: archived projects read failed',
    setup: c => fail(c.page, /^\/api\/archived-projects$/, 'GET', 'Audit: archived projects read failed'),
    act: c => waitForFailure(c.page, 'app-archived-projects-page', 'Audit: archived projects read failed') },
  { id: 'agents-failing', seed: 'nested-projects', route: '/settings/agents', reason: 'Audit: agent connections read failed',
    setup: c => fail(c.page, /^\/api\/agent-connections$/, 'GET', 'Audit: agent connections read failed'),
    act: c => waitForFailure(c.page, 'app-agent-connections-page', 'Audit: agent connections read failed') },
  { id: 'picker-discovery-failing', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: shortcut sources read failed',
    setup: c => fail(c.page, /^\/api\/projects\/[^/]+\/shortcut-sources$/, 'GET', 'Audit: shortcut sources read failed'),
    act: async c => {
      await c.page.getByRole('button', { name: 'Add a section', exact: true }).click();
      await c.page.getByRole('button', { name: 'Add shortcut', exact: true }).click();
      await waitForFailure(c.page, 'app-shortcut-picker', 'Audit: shortcut sources read failed');
    } },
  // Todos loads, then a successful complete's follow-up re-read fails: the stale notice.
  { id: 'todos-stale', seed: 'nested-projects', route: '/projects/project-renovation/pages/todos', reason: 'Audit: todos refresh failed',
    setup: async c => { await fail(c.page, /^\/api\/projects\/project-renovation\/todos$/, 'GET', 'Audit: todos refresh failed', () => c.state['failing'] === true); },
    act: async c => {
      c.state['failing'] = true;
      await c.page.locator('app-todos-page [data-todo-toggle]').first().click();
      await waitForFailure(c.page, 'app-todos-page', 'Audit: todos refresh failed');
    } },
  { id: 'archive-restore-failing', seed: 'nested-projects', route: '/projects/project-renovation/pages/archive', reason: 'Audit: restore failed',
    setup: async c => {
      await fail(c.page, /^\/api\/(tasks|sections|reflections|shortcuts)\/[^/]+\/restore$/, 'POST', 'Audit: restore failed');
      await fail(c.page, /^\/api\/projects\/[^/]+$/, 'PATCH', 'Audit: restore failed');
    },
    act: async c => { await c.page.locator('app-archive-page [data-archived-restore]').first().click(); await waitForFailure(c.page, 'app-archive-page', 'Audit: restore failed'); } },
  { id: 'archive-restore-unrefreshed', seed: 'nested-projects', route: '/projects/project-renovation/pages/archive', reason: 'Audit: archive refresh failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-renovation\/archive$/, 'GET', 'Audit: archive refresh failed', () => c.state['failing'] === true),
    act: async c => { c.state['failing'] = true; await c.page.locator('app-archive-page [data-archived-restore]').first().click(); await waitForFailure(c.page, 'app-archive-page'); } },
  // Best effort: a host write under this root publishes a live frame, whose quiet re-read fails.
  { id: 'archive-stale', seed: 'nested-projects', route: '/projects/project-renovation/pages/archive', reason: 'Audit: archive refresh failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-renovation\/archive$/, 'GET', 'Audit: archive refresh failed', () => c.state['failing'] === true),
    act: async c => {
      c.state['failing'] = true;
      await api.post('/api/tasks', { projectId: 'project-renovation', sectionId: 'section-project-renovation-tasks', title: 'Audit live frame' });
      await waitForFailure(c.page, 'app-archive-page', 'Audit: archive refresh failed').catch(() => { c.entry['notes'] = ['the live frame produced no visible failure']; });
    } },
  // A project-record write publishes a frame; the page's quiet re-read fails over its list.
  { id: 'archived-projects-stale', seed: 'nested-projects', route: '/settings/archived-projects', reason: 'Audit: archived projects refresh failed',
    setup: c => fail(c.page, /^\/api\/archived-projects$/, 'GET', 'Audit: archived projects refresh failed', () => c.state['failing'] === true),
    act: async c => {
      c.state['failing'] = true;
      await api.patch('/api/projects/project-kitchen', { description: 'Audit live frame' });
      await waitForFailure(c.page, 'app-archived-projects-page', 'Audit: archived projects refresh failed').catch(() => { c.entry['notes'] = ['the live frame produced no visible failure']; });
    } },
  // The formula is a project write (PATCH /api/projects/:id, progressFormula).
  { id: 'kitchen-progress-formula-failing', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: formula write failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-kitchen$/, 'PATCH', 'Audit: formula write failed'),
    act: async c => { await c.page.locator(`${PROG_R} button[aria-pressed="false"]`).first().click(); await waitForFailure(c.page, PROG_R, 'Audit: formula write failed'); } },
  { id: 'write-task-complete', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: task complete failed',
    setup: c => fail(c.page, /^\/api\/tasks\/[^/]+\/complete$/, 'POST', 'Audit: task complete failed'),
    act: async c => { await c.page.locator(`${TASKS_R} [data-task-complete]`).first().click(); await waitForFailure(c.page, TASKS_R, 'Audit: task complete failed'); } },
  { id: 'write-drawer-field', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: field save failed',
    setup: c => fail(c.page, /^\/api\/tasks\/[^/]+$/, 'PATCH', 'Audit: field save failed'),
    act: async c => {
      await firstTaskRow(c.page).locator('button[data-task-title]').click();
      const priority = c.page.locator('[data-task-drawer] [data-task-priority]');
      await priority.selectOption(await priority.inputValue() === 'low' ? 'high' : 'low');
      await waitForFailure(c.page, 'app-task-detail-drawer', 'Audit: field save failed');
    } },
  { id: 'write-quick-add', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: quick add failed',
    setup: c => fail(c.page, /^\/api\/tasks$/, 'POST', 'Audit: quick add failed'),
    act: async c => {
      const field = c.page.locator(`${TASKS_R} [data-quick-task-title]`);
      await field.fill('Audit quick add'); await field.press('Enter');
      await waitForFailure(c.page, TASKS_R, 'Audit: quick add failed');
    } },
  { id: 'write-section-removal-toast', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: section removal failed',
    setup: c => fail(c.page, /^\/api\/sections\/[^/]+$/, 'DELETE', 'Audit: section removal failed'),
    act: async c => { await c.page.getByRole('button', { name: /^Remove section / }).first().click(); await waitForFailure(c.page, '[data-toast]:popover-open', 'Audit: section removal failed'); } },
  { id: 'markdown-save-failing', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: markdown save failed',
    setup: c => fail(c.page, /^\/api\/sections\/[^/]+$/, 'PATCH', 'Audit: markdown save failed'),
    act: async c => {
      await c.page.getByRole('button', { name: /^Edit Markdown for/ }).first().click();
      await c.page.getByRole('textbox', { name: /Markdown source/ }).fill('# Audit edit');
      await c.page.locator(BRIEF_R).getByRole('button', { name: 'Save', exact: true }).click();
      await waitForFailure(c.page, null, 'Audit: markdown save failed');
    },
    after: async c => {
      await c.page.locator(BRIEF_R).getByRole('button', { name: 'Cancel', exact: true }).click();
      await c.page.waitForTimeout(300);
      c.entry['afterCancelAlerts'] = await c.page.locator('[role=alert]').evaluateAll(es => es.filter(e => e.getClientRects().length && e.textContent?.trim()).map(e => e.textContent!.trim()));
      c.entry['afterCancelScreenshot'] = await c.shot('after-cancel');
    } },
  // Pinned failures: fail a write on screen, then scroll the failure past one edge of the port.
  { id: 'pin-todos-below', seed: 'nested-projects', route: '/projects/project-renovation/pages/todos', reason: 'Audit: todo complete failed',
    setup: async c => {
      await c.page.route(path(/^\/api\/tasks\/[^/]+\/complete$/), route => route.request().method() === 'POST' && route.request().url().includes(`/api/tasks/${String(c.state['target'])}/`)
        ? route.fulfill({ status: 500, contentType: 'application/json', body: body('Audit: todo complete failed') }) : route.fallback());
    },
    act: async c => {
      const toggles = c.page.locator('app-todos-page [data-todo-row]:has([data-todo-toggle])');
      const last = toggles.last();
      c.state['target'] = await last.getAttribute('data-todo-id');
      await last.locator('[data-todo-toggle]').click();
      await waitForFailure(c.page, 'app-todos-page', 'Audit: todo complete failed');
      await scrollPort(c.page, 'app-todos-page', 'top');
      // A completion opens no toast; deleting another row does (its Undo receipt), while the failed row stays below.
      await c.page.locator(`app-todos-page [data-todo-row]:not([data-todo-id="${String(c.state['target'])}"]) [data-todo-delete]`).first().click();
      await c.page.waitForTimeout(500);
      c.entry['toastOpen'] = await c.page.locator('[data-toast]:popover-open').count() > 0;
    },
    after: pinPress },
  { id: 'pin-tasklist-above', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: task complete failed',
    prepare: () => fillTasks('section-project-kitchen-tasks', 30),
    setup: c => fail(c.page, /^\/api\/tasks\/[^/]+\/complete$/, 'POST', 'Audit: task complete failed'),
    act: async c => {
      await firstTaskRow(c.page).locator('[data-task-complete]').click();
      await waitForFailure(c.page, TASKS_R, 'Audit: task complete failed');
      await scrollPort(c.page, TASKS_R, 'top');
      await scrollPort(c.page, TASKS_R, { above: '[data-task-row]', margin: 160 });
      c.entry['quickAdd'] = await stuck(c.page, `${TASKS_R} [data-quick-create]`);
    },
    after: pinPress },
  { id: 'pin-section-collapse', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: collapse failed',
    setup: c => fail(c.page, /^\/api\/sections\/[^/]+$/, 'PATCH', 'Audit: collapse failed'),
    act: async c => {
      await c.page.locator(`${BRIEF_R} [data-section-collapse]`).click();
      await waitForFailure(c.page, null, 'Audit: collapse failed');
      await scrollPort(c.page, BRIEF_R, 'bottom');
    },
    after: pinPress },
  { id: 'pin-shortcut-collapse', seed: 'nested-projects', route: '/projects/project-renovation', reason: 'Audit: collapse failed',
    setup: c => fail(c.page, /^\/api\/shortcuts\/[^/]+$/, 'PATCH', 'Audit: collapse failed'),
    act: async c => {
      await c.page.locator(`${SHORTCUT_R} [data-shortcut-collapse]`).click();
      await waitForFailure(c.page, null, 'Audit: collapse failed');
      await scrollPort(c.page, SHORTCUT_R, 'top');
    },
    after: pinPress },
  // Best effort: a cross-list drag into the tall Kitchen Task List fails, so its banner shows;
  // the banner is then scrolled above the port while the tall frame stays partly in view.
  { id: 'pin-tall-tasklist-banner', seed: 'nested-projects', route: KITCHEN, reason: 'Audit: task move failed',
    prepare: async state => {
      await fillTasks('section-project-kitchen-tasks', 30);
      const source: ProjectSection = await addSection('project-kitchen', { type: 'task-list', title: 'Audit source', position: 1 });
      await api.post('/api/tasks', { projectId: 'project-kitchen', sectionId: source.id, title: 'Audit moving task' });
      state['source'] = source.id;
    },
    setup: c => fail(c.page, /^\/api\/tasks\/[^/]+$/, 'PATCH', 'Audit: task move failed'),
    act: async c => {
      const from = c.page.locator(`[data-section-id="${String(c.state['source'])}"] [data-task-row]`).first();
      // The pointer cannot leave the viewport: bring the source to the top so the tall target
      // list's first rows sit below it on screen, then drop onto the target list's top.
      await c.page.locator(`[data-section-id="${String(c.state['source'])}"]`).evaluate(e => e.scrollIntoView({ block: 'start' }));
      const to = c.page.locator(`${TASKS_R} .cdk-drop-list`).first();
      const a = await from.boundingBox(), b = await to.boundingBox();
      if (!a || !b) throw new Error('Drag rows are missing');
      const viewport = c.page.viewportSize()!;
      const dropY = Math.min(b.y + 40, viewport.height - 10);
      await c.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await c.page.mouse.down();
      await c.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, { steps: 4 });
      await c.page.mouse.move(b.x + b.width / 2, dropY, { steps: 20 });
      await c.page.waitForTimeout(200); await c.page.mouse.up();
      const shown = await waitForFailure(c.page, TASKS_R, 'Audit: task move failed').then(() => true, () => false);
      c.entry['bannerProduced'] = shown;
      if (!shown) { c.entry['notes'] = ['the drag did not produce a receive failure in this build/width']; return; }
      await scrollPort(c.page, TASKS_R, 'top');
      await scrollPort(c.page, TASKS_R, { above: FAILURE, margin: 120 });
    },
    after: pinPress },
  { id: 'header-progress-empty-project', seed: 'busy-week', route: state => `/projects/${String(state['projectId'])}`,
    prepare: async state => { state['projectId'] = (await createRoot('Audit empty project')).id; } },
  { id: 'header-progress-failing', seed: 'busy-week', route: '/projects/project-launch', reason: 'Audit: progress read failed',
    setup: c => fail(c.page, /^\/api\/projects\/project-launch\/progress$/, 'GET', 'Audit: progress read failed') },
  { id: 'header-progress-legacy', seed: 'nested-projects', route: '/projects/project-legacy' },
  { id: 'not-found', seed: 'nested-projects', route: '/nope' },
  { id: 'kitchen-loading', seed: 'nested-projects', route: KITCHEN, held: true,
    setup: c => hold(c, /^\/api\/projects\/project-kitchen\/sections$/, 120_000), act: heldObserved },
  { id: 'header-progress-pending', seed: 'nested-projects', route: KITCHEN, held: true,
    // Before 78 the workspace waits on this read, so the whole page shows its loading line.
    setup: c => hold(c, /^\/api\/projects\/project-kitchen\/progress$/, 120_000), act: heldObserved },
  { id: 'lab', seed: 'nested-projects', route: '/prototype/design',
    after: async c => { c.entry['panels'] = await c.page.locator('[data-panel]').evaluateAll(panels => panels.map(panel => { const r = panel.getBoundingClientRect(); return { id: panel.getAttribute('data-panel'), x: r.x, y: r.y, width: r.width, height: r.height }; })); } },
];

async function fillTasks(sectionId: string, count: number) {
  for (let i = 1; i <= count; i += 1) await api.post('/api/tasks', { projectId: 'project-kitchen', sectionId, title: `Audit filler ${String(i).padStart(2, '0')}` });
}
async function stuck(page: Page, selector: string) {
  return page.locator(selector).first().evaluate(e => {
    const r = e.getBoundingClientRect(); const port = e.closest('main.workspace')?.getBoundingClientRect();
    return { position: getComputedStyle(e).position, box: { x: r.x, y: r.y, width: r.width, height: r.height }, stuck: !!port && Math.abs(r.top - port.top) < 80 };
  }).catch(() => null);
}
/** After build's pin hook; absent before. */
async function pinPress(c: Ctx) {
  const pin = c.page.locator('[data-failure-pin]');
  c.entry['pinPresent'] = await pin.count() > 0;
  if (!await pin.count()) return;
  await pin.first().click(); await c.page.waitForTimeout(500);
  c.entry['afterPinPress'] = await c.page.evaluate(probe, { regions: c.regions, reason: null });
  c.entry['afterPinPressScreenshot'] = await c.shot('after-pin-press');
}

/**
 * Browser-side evidence: regions, visible-reason and raw-reason checks, and the pin gate's raw
 * geometry — the scroll port's client box, the content track, sentence anchors, stuck
 * `[data-pin-clearance]` controls, the open toast, each pinned copy and where focus is. Profile 78
 * recomputes the clear port from these rather than trusting the app's own measurement.
 */
function probe({ regions, reason }: { regions: string[]; reason: string | null }) {
  const box = (e: Element) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const inClosedDetails = (e: Element) => { const d = e.closest('details:not([open])'); return !!d && !e.closest('summary'); };
  const shown = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && e.checkVisibility({ visibilityProperty: true }) && !inClosedDetails(e); };
  const text = (e: Element) => ((e as HTMLElement).innerText ?? e.textContent ?? '').trim();
  const name = (e: Element) => (e.getAttribute('aria-label') ?? text(e) ?? e.getAttribute('title') ?? '').trim();
  const isFailure = (e: Element) => (e.getAttribute('role') === 'alert' && !!e.textContent?.trim()) || [...e.attributes].some(a => /^data-.*error/.test(a.name));
  // The pins' port is the slot's nearest scrolling ancestor, as `scrollPortOf` finds it; the
  // before build has no slot, so it falls back to the shell's workspace.
  const scrolls = (e: Element) => /^(auto|scroll|overlay)$/.test(getComputedStyle(e).overflowY);
  const slot = document.querySelector('app-pinned-failure-slot');
  let portEl: Element | null = null;
  for (let parent = slot?.parentElement ?? null; parent && !portEl; parent = parent.parentElement) if (scrolls(parent)) portEl = parent;
  if (!portEl) { const ports = [...document.querySelectorAll('main.workspace, .workspace, .project-workspace__main')]; portEl = ports.find(scrolls) ?? ports[0] ?? null; }
  const client = (e: Element) => { const r = e.getBoundingClientRect(); return { x: r.x + e.clientLeft, y: r.y + e.clientTop, width: e.clientWidth, height: e.clientHeight }; };
  const scrollPort = portEl ? { selector: portEl.tagName.toLowerCase() + '.' + [...portEl.classList].join('.'), ...box(portEl), client: client(portEl), scrollTop: portEl.scrollTop, scrollHeight: portEl.scrollHeight, clientHeight: portEl.clientHeight } : null;
  // The content track: the last element in tree order named `--toast-track`, which anchor() resolves to.
  const tracks = [...document.querySelectorAll('*')].filter(e => (getComputedStyle(e) as CSSStyleDeclaration & { anchorName?: string }).anchorName?.split(',').map(n => n.trim()).includes('--toast-track') && e.getClientRects().length > 0);
  const track = tracks.length ? box(tracks.at(-1)!) : null;
  const sticky = portEl ? [...portEl.querySelectorAll('[data-pin-clearance]')].filter(e => e.getClientRects().length > 0).map(e => ({ box: box(e) })) : [];
  const toastEl = [...document.querySelectorAll('[data-toast-open], [data-toast]:popover-open')].find(e => e.getClientRects().length > 0 && box(e).height > 0);
  const toast = toastEl ? box(toastEl) : null;
  const edge = (b: { y: number; height: number }) => !scrollPort ? null : b.y + b.height <= scrollPort.y ? 'top' : b.y >= scrollPort.y + scrollPort.height ? 'bottom' : 'inside';
  const regionData = regions.map(region => {
    const el = document.querySelector(region);
    if (!el) return { region, present: false };
    const all = [...el.querySelectorAll('*')];
    const failures = [el, ...all].filter(e => isFailure(e) && e.getClientRects().length > 0 && e.checkVisibility());
    const failureBox = failures[0] ? box(failures[0]) : null;
    return {
      region, present: true, box: box(el), text: text(el).slice(0, 2000),
      alerts: all.filter(e => e.getAttribute('role') === 'alert' && shown(e)).map(text).filter(Boolean),
      statuses: all.filter(e => (e.getAttribute('role') === 'status' || e.hasAttribute('aria-live')) && e.getClientRects().length).map(text).filter(Boolean),
      buttons: all.filter(e => e.matches('button, a[href], [role=button], summary')).map(e => ({ name: name(e), tag: e.tagName.toLowerCase(), recovery: e.getAttribute('data-recovery'), visible: shown(e), box: box(e), disabled: (e as HTMLButtonElement).disabled === true || e.getAttribute('aria-disabled') === 'true' })),
      // A closed Details shows its summary; `shown(d)` would count the element as inside itself.
      details: all.filter(e => e.tagName === 'DETAILS').map(d => ({ open: (d as HTMLDetailsElement).open, visible: shown(d.querySelector(':scope > summary') ?? d), summary: text(d.querySelector('summary') ?? d), text: (d.textContent ?? '').trim().slice(0, 1000) })),
      visibleEmptyHooks: [...new Set([el, ...all].filter(shown).flatMap(e => [...e.attributes].map(a => a.name).filter(n => /^data-.*-empty$|^data-empty-canvas$/.test(n))))],
      ariaBusy: el.getAttribute('aria-busy'),
      ariaBusyWithin: [el, ...all].some(e => e.getAttribute('aria-busy') === 'true'),
      loadingMessages: all.filter(e => e.matches('.state-message--loading')).map(text),
      // A loading line counts as busy when it, or an ancestor inside the region, carries aria-busy.
      loading: all.filter(e => e.matches('.state-message--loading')).map(e => { const busy = e.closest('[aria-busy="true"]'); return { text: text(e), visible: shown(e), busy: !!busy && (busy === el || el.contains(busy)) }; }),
      anchors: all.filter(e => e.matches('[data-failure-sentence]') && e.getClientRects().length > 0).map(e => ({ id: e.id || null, text: text(e).slice(0, 300), box: box(e) })),
      failureBox, failureEdge: failureBox ? edge(failureBox) : null,
      failures: failures.slice(0, 10).map(e => ({ hooks: [...e.attributes].map(a => a.name).filter(n => n.startsWith('data-') || n === 'role'), text: text(e).slice(0, 300), box: box(e), edge: edge(box(e)) })),
    };
  });
  const texts: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent?.trim(); const parent = n.parentElement;
    if (t && parent && !parent.closest('script,style,template') && shown(parent)) texts.push(t);
  }
  const patterns = [/"[a-zA-Z]+-[0-9a-z-]+"/g, /answered \d{3}/g, /(GET|PATCH|POST|DELETE) \/api/g, /prototype host/g, /§\d+/g];
  const rawReasonHits = [...new Set(texts.flatMap(t => patterns.flatMap(p => [...t.matchAll(p)].map(m => ({ pattern: String(p), match: m[0], text: t.slice(0, 200) })))).map(h => JSON.stringify(h)))].map(h => JSON.parse(h));
  const pins = [...document.querySelectorAll('[data-failure-pin-region]')].map(region => {
    const show = region.querySelector('[data-failure-pin]'), dismiss = region.querySelector('[data-failure-pin-dismiss]');
    return { edge: show?.getAttribute('data-failure-pin') ?? null, indicator: text(region.querySelector('.pinned-failure__indicator') ?? region).slice(0, 4), sentence: text(region.querySelector('.pinned-failure__sentence') ?? region), name: show ? name(show) : null,
      box: box(region), show: show ? box(show) : null, dismiss: dismiss ? box(dismiss) : null, side: edge(box(region)) };
  });
  const toastOpen = document.querySelectorAll('[data-toast]:popover-open').length > 0;
  // Failures on the canvas outside every section and shortcut frame (a duplicate canvas-level alert).
  const canvasFailures = [...document.querySelectorAll('app-project-canvas, app-project-canvas *')]
    .filter(e => isFailure(e) && shown(e) && !e.closest('[data-section-id], [data-shortcut-id]'))
    .filter((e, _, all) => !all.some(outer => outer !== e && outer.contains(e)))
    .map(e => ({ hooks: [...e.attributes].map(a => a.name).filter(n => n.startsWith('data-') || n === 'role'), text: text(e).slice(0, 300), box: box(e) }));
  // Where focus is, against the rows' regions: inside one, on a sentence, or described by one there.
  const active = document.activeElement;
  const owner = active ? regions.map(r => document.querySelector(r)).find(r => r?.contains(active)) ?? null : null;
  const sentenceIds = new Set(owner ? [...owner.querySelectorAll('[data-failure-sentence]')].map(e => e.id).filter(Boolean) : []);
  const focus = active && active !== document.body ? { tag: active.tagName.toLowerCase(), name: name(active).slice(0, 200), inRegion: !!owner, isAnchor: !!owner && active.matches('[data-failure-sentence]'),
    describes: (active.getAttribute('aria-describedby') ?? '').split(/\s+/).some(id => sentenceIds.has(id)), box: box(active) } : null;
  return { regions: regionData, reasonVisible: reason ? texts.some(t => t.includes(reason)) : null, rawReasonHits, scrollPort, track, sticky, toast, pins, toastOpen, canvasFailures, focus };
}

/** Slice 78's own evidence; frozen earlier verification journeys are deliberately not re-run. */
test('States runtime evidence and core tasks', async ({ browser }) => {
  await mkdir(out, { recursive: true });
  const match = process.env['UX_STATES_MATCH'];
  const entries: Record<string, unknown>[] = match ? await readFile(resolve(out, 'states-verification.json'), 'utf8').then(text => JSON.parse(text).entries).catch(() => []) : [];
  const key = (e: Record<string, unknown>) => [e['context'], e['theme'], e['width']].join('|');
  const write = (complete: boolean, tasks?: unknown) => writeFile(resolve(out, 'states-verification.json'), JSON.stringify({ commit, complete, rows: ROWS, entries, tasks }, null, 2));
  for (const fixture of CONTEXTS) for (const theme of ['dark', 'light'] as const) for (const width of [1440, 375]) {
    if (match && !new RegExp(match).test([fixture.id, theme, width].join('|'))) continue;
    const started = Date.now();
    const rows = ROWS.filter(r => r.context === fixture.id);
    const state: Record<string, unknown> = {};
    const entry: Record<string, unknown> = { context: fixture.id, seed: fixture.seed, theme, width, persona: fixture.persona ?? 'user-demo', reason: fixture.reason ?? null };
    const consoleErrors: string[] = [];
    await seed(fixture.seed); await setClock(SEED_NOW);
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, hasTouch: width === 375, isMobile: width === 375, colorScheme: theme, timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce' });
    await configureContext(context);
    if (fixture.persona) await context.addInitScript(persona => localStorage.setItem('cwm.prototype.persona', persona), fixture.persona);
    const page = await context.newPage(); await page.clock.install({ time: new Date(SEED_NOW) }); await page.clock.setFixedTime(new Date(SEED_NOW));
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const base = `states-${fixture.id}-${theme}-${width}`;
    const c: Ctx = { page, entry, state, regions: rows.map(r => r.region), releases: [], shot: async suffix => { const file = `${base}-${suffix}.png`; await page.screenshot({ path: resolve(out, file), fullPage: true }); return file; } };
    const regionShots = async () => {
      const shots: Record<string, unknown> = {};
      for (const [i, region] of [...new Set([...rows.map(r => r.region), ...(fixture.frames ?? [])])].entries()) {
        const target = page.locator(region).first();
        if (!await target.count() || !await target.isVisible()) { shots[region] = { absent: true }; continue; }
        const file = `${base}-r${i}.png`;
        await target.screenshot({ path: resolve(out, file) }).then(() => { shots[region] = file; }, () => { shots[region] = { absent: true }; });
      }
      entry['regionScreenshots'] = shots;
    };
    try {
      await fixture.prepare?.(state);
      const route = typeof fixture.route === 'function' ? fixture.route(state) : fixture.route;
      entry['route'] = route;
      await fixture.setup?.(c);
      const documentResponse = await page.goto('http://localhost:4200' + route, { waitUntil: fixture.held ? 'domcontentloaded' : 'load' });
      if (!fixture.held) await page.waitForLoadState('networkidle');
      if (!documentResponse) throw new Error('Static document response is missing');
      entry['servedBuild'] = { indexSha256: createHash('sha256').update(await documentResponse.body()).digest('hex'), captureLabel: commit, workingTree: !process.env['UX_BEFORE'] };
      await page.locator('[data-theme-toggle]').first().waitFor({ state: 'attached' }).catch(() => undefined);
      const toggle = page.getByRole('button', { name: `Switch to the ${theme} theme` });
      if (await page.locator('html').getAttribute('data-theme') !== theme && await toggle.count()) await toggle.click();
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      await fixture.act?.(c);
      if (!fixture.held) await page.waitForLoadState('networkidle').catch(() => undefined);
      entry['screenshot'] = `${base}.png`;
      await page.screenshot({ path: resolve(out, String(entry['screenshot'])), fullPage: true });
      Object.assign(entry, await page.evaluate(probe, { regions: rows.map(r => r.region), reason: fixture.reason ?? null }));
      entry['controls'] = await page.evaluate(collectControls);
      const scan = await new AxeBuilder({ page }).options({ rules: { 'target-size': { enabled: true } } }).analyze();
      for (const violation of scan.violations) for (const node of violation.nodes) {
        const selector = node.target.at(-1);
        if (typeof selector === 'string') (node as typeof node & { stableAnchor?: string }).stableAnchor = String(await page.evaluate(axeNodeIdentity, selector).catch(() => selector));
      }
      entry['axe'] = { violations: scan.violations, incomplete: scan.incomplete };
      entry['aria'] = await page.locator('body').ariaSnapshot();
      const pinned = rows.some(r => r.pinned);
      if (!pinned) await regionShots();
      // A pin is pressed while still pinned: clicking a Details summary scrolls its row into view first.
      if (pinned) await fixture.after?.(c);
      // Open every closed Details in the rows' regions, record what it reveals, then close it again.
      const closed = page.locator(rows.map(r => `${r.region} details:not([open]) > summary`).join(', ') || 'details-none');
      if (await closed.count()) {
        // Handles, not `nth()` locators: the `:not([open])` set shrinks as each one opens.
        const summaries = await closed.elementHandles();
        const detailsErrors: string[] = [];
        for (const summary of summaries) await summary.click().catch(error => { detailsErrors.push(String(error).split('\n')[0]!); });
        if (detailsErrors.length) entry['detailsErrors'] = detailsErrors;
        entry['detailsOpen'] = (await page.evaluate(probe, { regions: rows.map(r => r.region), reason: fixture.reason ?? null })).regions;
        entry['detailsOpenScreenshot'] = await c.shot('details');
        await page.evaluate(sel => document.querySelectorAll(sel).forEach(s => { (s.parentElement as HTMLDetailsElement).open = false; }), rows.map(r => `${r.region} details > summary`).join(', '));
      }
      if (!pinned) await fixture.after?.(c);
      if (pinned) await regionShots();
    } catch (error) { entry['error'] = String(error); }
    finally {
      for (const release of c.releases) release();
      await fixture.teardown?.(state).catch(error => { entry['error'] = (entry['error'] ? entry['error'] + '; ' : '') + 'teardown: ' + String(error); });
      entry['consoleErrors'] = consoleErrors;
      entry['durationMs'] = Date.now() - started;
      const prior = entries.findIndex(e => key(e) === key(entry)); if (prior >= 0) entries.splice(prior, 1); entries.push(entry);
      await context.close();
      await write(false);
    }
    console.log(`${entry['error'] ? 'error' : 'captured'}: ${key(entry)}${entry['error'] ? ' — ' + String(entry['error']).slice(0, 300) : ''}`);
  }
  const tasksFile = resolve(out, 'tasks/tasks.json');
  // UX_STATES_SKIP_TASKS reuses the recorded tasks while iterating on contexts.
  if (!process.env['UX_STATES_SKIP_TASKS']) await runCoreTasks(browser, resolve(out, 'tasks'), taskIds);
  const tasks = await readFile(tasksFile, 'utf8').then(text => JSON.parse(text)).catch(() => null);
  const expected = CONTEXTS.length * 4;
  await write(entries.length === expected && entries.every(e => !e['error']) && tasks !== null, tasks);
  expect(entries.filter(e => e['error']).map(e => `${key(e)}: ${String(e['error'])}`), 'all states contexts captured').toEqual([]);
  if (!match) expect(entries.length, 'every context at both themes and both widths').toBe(expected);
});
