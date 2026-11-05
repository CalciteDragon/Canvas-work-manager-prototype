import { test, expect, type Page, type Route } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { api, createProject, createRoot, seed, setClock, setPageEnabled, type Persona } from '../seed';
import { SEED_NOW } from './matrix';
import { runCoreTasks, waitForFailure } from './tasks';
import AxeBuilder from '@axe-core/playwright';
import type { WorkspaceId } from '@cwm/contracts';
// @ts-expect-error Browser-serializable helper also exercised by node:test.
import { axeNodeIdentity, collectControls } from './layout.mjs';

/**
 * Slice 79's empty, archived and editing evidence: every Capture scope context, run unchanged
 * against the before (`44e7e9e`) and after builds. Fixtures are made through the host API, never
 * by editing seeds. Contexts drive the page through hooks and roles both builds share; where only
 * the after build has the control (the banner, the first-run block, Discard draft), the before
 * run records it absent instead of failing.
 */
const commit = process.env['UX_BEFORE'] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve('ux-output', commit);
const taskIds = [...Array.from({ length: 9 }, (_, i) => 'T' + String(i + 1).padStart(2, '0')), 'T11', 'T12'];

/**
 * The write controls a read-only region must not show (Test plan, profile 79). Collapse is not
 * listed: it stays on read-only pages (Open question 4 (a)). Profile 79 pins each selector to
 * exist in the web source, so a renamed hook fails rather than passing silently.
 */
export const WRITE_CONTROLS = [
  '[data-canvas-add]', '[data-empty-canvas-add]', 'app-insertion-point', '[data-insertion-point-button]',
  'app-section-resize-handle', '[data-section-drag-handle]', '[data-section-remove]', '[data-section-config]',
  '[data-section-title-edit]', '[data-shortcut-drag-handle]', '[data-shortcut-remove]',
  '[data-unknown-section-drag-handle]', '[data-unknown-section-remove]', '[data-quick-create]',
  '[data-task-complete]', '[data-task-delete]', '[data-markdown-edit]', '[data-reflection-create]',
  '[data-reflection-edit]', '.progress-section__controls', '[data-todo-toggle]', '[data-todo-complete]',
  '[data-todo-delete]', 'app-task-row.cdk-drag', 'button[aria-label$=", open details"]',
] as const;

export type Row = {
  context: string;
  /** A CSS selector present in both builds; the first match is the region. */
  region: string;
  /**
   * What the after build must show in the region; profile 79 has one rule per kind:
   * - `first-run`: the main-column New project (`data-first-run-create`); `not-first-run`: none.
   * - `create-focused`: focus is in the creation form's name field.
   * - `archived-only-sidebar`: "No active projects." with a link to Settings › Archived projects.
   * - `read-only`: no `WRITE_CONTROLS` match, the banner present under the header and above the
   *   first frame, header rename and Parent kept.
   * - `restored`: no banner, focus on the heading or the next owner's choice.
   * - `undo-refused`: still no banner, and the header shows the transition refusal.
   * - `restore-failure`: the failure renders inside the banner, with Details.
   * - `blocked-confirm`: no commit button, each of `links` a link. `commit-confirm`: the commit.
   * - `late-refusal`: the refusal's sentence and Details in the header.
   * - `restore-choice`: one option list in one casing, Active preselected and visible.
   * - `digest`: overdue rows (`data-digest-overdue`) link to their owners, five at most, as many as
   *   the tile's overdue tasks allow.
   * - `owner-section`: a followed overdue link landed on its section (`hashTarget`), as its href says.
   * - `draft`: the editor's source equals the typed draft. `discarded`: it equals the saved text.
   * - `preview`: the "Unsaved preview" caption. `count`: each Task List header's count equals
   *   its rendered rows. `drag`: the first row moved at most 1 px as the drag started.
   * - `todos-pending`: no other row's Complete or Delete has `disabled`; each has `aria-disabled`.
   */
  kind: 'first-run' | 'not-first-run' | 'create-focused' | 'archived-only-sidebar' | 'read-only' | 'restored' | 'undo-refused'
    | 'restore-failure' | 'blocked-confirm' | 'commit-confirm' | 'late-refusal' | 'restore-choice' | 'digest'
    | 'owner-section' | 'draft' | 'discarded' | 'preview' | 'count' | 'drag' | 'todos-pending';
  /** A read-only Todos or Reflections page: which Q7 hidden-count sentence applies. */
  hidden: 'todos' | 'reflections' | null;
  /** The named snapshot the rule reads (`entry[snapshot]`), or null for the context's main capture. */
  snapshot: string | null;
  /** A blocked confirmation's live children, each of which must be a link. */
  links: string[] | null;
};

const ROOT = '/projects/project-renovation';
const KITCHEN = '/projects/project-kitchen';
const LEGACY = '/projects/project-legacy';
const LEGACY_CHILD = '/projects/project-legacy-child';
const section = (project: string, id: string) => `[data-section-id="section-${project}-${id}"]`;
const KITCHEN_TASKS = section('project-kitchen', 'tasks'), KITCHEN_BRIEF = section('project-kitchen', 'brief');
const DENSE_TASKS = section('project-work-manager', 'tasks');
const SHORTCUT_R = '[data-shortcut-id="shortcut-renovation-kitchen-tasks"]';
const DIGEST_R = '[data-dashboard-tile][data-widget-type="daily_digest"]';
const CONFIRM_R = '[data-project-archive-confirm]';
const ARCHIVE_ROW = '[data-archived-item][data-archived-id="project-legacy"]';
const SETTINGS_ROW = '[data-archived-project][data-project-id="project-legacy"]';
const row = (context: string, region: string, kind: Row['kind'], more: Partial<Pick<Row, 'hidden' | 'snapshot' | 'links'>> = {}): Row =>
  ({ context, region, kind, hidden: null, snapshot: null, links: null, ...more });

/**
 * The context table. **It is profile 79's only source of exemptions**: the gate checks each row's
 * rule and nothing else. Rows state the after build's intent; the before build is expected to fail
 * many of them. `lab` has no row: it is a panel-geometry fixture.
 */
export const ROWS: Row[] = [
  row('first-run-demo', 'app-dashboard-page', 'first-run'),
  row('first-run-alex', 'app-dashboard-page', 'first-run'),
  row('first-run-sam', 'app-dashboard-page', 'first-run'),
  row('first-run-create', 'app-sidebar', 'create-focused'),
  row('archived-only-home', 'app-sidebar', 'archived-only-sidebar'),
  row('archived-only-home', 'app-dashboard-page', 'not-first-run'),
  row('archived-only-canvas', 'main', 'read-only'),
  row('archived-only-todos', 'app-todos-page', 'read-only', { hidden: 'todos' }),
  row('archived-only-reflections', 'app-reflections-page', 'read-only', { hidden: 'reflections' }),
  row('legacy-attic', 'main', 'read-only'),
  row('legacy-shelving', 'main', 'read-only'),
  row('renovation-archived-home', 'main', 'read-only'),
  row('renovation-archived-todos', 'app-todos-page', 'read-only', { hidden: 'todos' }),
  row('renovation-archived-reflections', 'app-reflections-page', 'read-only', { hidden: 'reflections' }),
  row('renovation-archived-archive', 'main', 'read-only'),
  row('renovation-archived-kitchen', 'main', 'read-only'),
  row('legacy-attic-restore', 'main', 'restored', { snapshot: 'restored' }),
  row('legacy-attic-restore', 'main', 'undo-refused'),
  row('legacy-shelving-restore', 'main', 'restored'),
  row('renovation-restore-undo', 'main', 'restored', { snapshot: 'restored' }),
  row('renovation-restore-undo', 'main', 'read-only'),
  row('banner-restore-failing', 'main', 'restore-failure'),
  row('kitchen-archive-blocked', CONFIRM_R, 'blocked-confirm', { links: ['Cabinets'] }),
  row('renovation-archive-blocked', CONFIRM_R, 'blocked-confirm', { links: ['Kitchen', 'Garden'] }),
  row('cabinets-archive-commit', CONFIRM_R, 'commit-confirm'),
  row('cabinets-late-refusal', 'app-project-header', 'late-refusal'),
  row('archive-restore-choice', ARCHIVE_ROW, 'restore-choice'),
  row('settings-restore-choice', SETTINGS_ROW, 'restore-choice'),
  row('digest-overdue-chaos', DIGEST_R, 'digest'),
  row('digest-busy-week', DIGEST_R, 'digest'),
  row('digest-sam', DIGEST_R, 'digest'),
  row('digest-owner-section', 'main', 'owner-section'),
  row('markdown-draft', KITCHEN_BRIEF, 'draft'),
  row('markdown-cancel-edit', KITCHEN_BRIEF, 'draft'),
  row('markdown-navigate-back', KITCHEN_BRIEF, 'draft'),
  row('markdown-discard', KITCHEN_BRIEF, 'discarded'),
  row('markdown-preview', KITCHEN_BRIEF, 'preview'),
  row('count-kitchen', KITCHEN_TASKS, 'count'),
  row('count-dense', DENSE_TASKS, 'count'),
  row('count-shortcut', SHORTCUT_R, 'count'),
  row('drag-start', KITCHEN_TASKS, 'drag'),
  row('todos-pending', 'app-todos-page', 'todos-pending'),
];

/** Per-capture working state shared by a context's hooks; `regions` are the context's rows' regions. */
export type Ctx = { page: Page; entry: Record<string, unknown>; state: Record<string, unknown>; regions: string[]; shot: (suffix: string) => Promise<string>; releases: (() => void)[] };
export type Context = {
  id: string; seed: string; route: string | ((state: Record<string, unknown>) => string);
  persona?: Persona;
  /** Capture only these themes or widths; both themes at 1440 and 375 otherwise. */
  themes?: readonly ('dark' | 'light')[]; widths?: readonly number[];
  /** The exact injected message, when a failure is injected. */
  reason?: string;
  /** Node-side host preparation after seeding, before the browser exists. */
  prepare?(state: Record<string, unknown>): Promise<void>;
  /** Routes installed before navigation. */
  setup?(c: Ctx): Promise<void>;
  /** Drives the page after load until the state under capture is on screen. */
  act?(c: Ctx): Promise<void>;
  /** Extra evidence after the main capture. */
  after?(c: Ctx): Promise<void>;
  /** A held write: navigation and capture do not wait for network idle. */
  held?: boolean;
  /** The Todos or journal read whose `hiddenItemCount` the row's Q7 rule reads, at capture time. */
  hiddenFrom?: (state: Record<string, unknown>) => string;
  /** Extra element screenshots. */
  frames?: string[];
};

const body = (error: string, message: string) => JSON.stringify({ error, message });
const path = (pattern: RegExp) => (url: URL) => pattern.test(url.pathname);
/** Fulfils non-GET requests on `pattern` with `status` while `when()` holds. */
async function refuse(page: Page, pattern: RegExp, status: number, error: string, message: string, when: () => boolean = () => true) {
  await page.route(path(pattern), (route: Route) => route.request().method() !== 'GET' && when()
    ? route.fulfill({ status, contentType: 'application/json', body: body(error, message) }) : route.fallback());
}
/** Holds non-GET requests on `pattern` until released (or `maxMs`), then lets them through. */
async function holdWrite(c: Ctx, pattern: RegExp, maxMs: number) {
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  c.releases.push(release);
  await c.page.route(path(pattern), async route => {
    if (route.request().method() === 'GET') return route.fallback();
    await Promise.race([gate, new Promise(r => setTimeout(r, maxMs))]);
    await route.fallback().catch(() => undefined);
  });
}
const openPhoneMenu = async (page: Page) => {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
};
const archive = (id: string) => api.patch(`/api/projects/${id}`, { status: 'archived' });
/** Home renovation archived as a root, with nothing live under it: every workstream archived first. */
const archiveRenovation = async () => {
  for (const id of ['project-cabinets', 'project-kitchen', 'project-garden', 'project-legacy-child', 'project-renovation']) await archive(id);
};
/** One root on `empty`, with its Todos and Reflections pages on, then archived (W4-034, Q7's zero branch). */
const archivedOnly = async (state: Record<string, unknown>) => {
  const project = await createRoot('Archived only');
  await setPageEnabled(project.id, 'todos', true);
  await setPageEnabled(project.id, 'reflections', true);
  await archive(project.id);
  state['projectId'] = project.id;
};
const archivedOnlyRoute = (suffix = '') => (state: Record<string, unknown>) => `/projects/${String(state['projectId'])}${suffix}`;
/** The banner's Restore, when the build has a banner; the before run records it absent. */
async function bannerRestore(c: Ctx): Promise<boolean> {
  const banner = c.page.locator('app-archived-banner');
  c.entry['bannerPresent'] = await banner.count() > 0;
  if (!await banner.count()) return false;
  await banner.getByRole('button', { name: /^Restore\b/ }).first().click();
  return true;
}
/** Waits as the e2e does for a banner restore to land: the banner gone, focus on the project's name. */
async function restoreLanded(c: Ctx) {
  await c.page.locator('app-archived-banner').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
  await c.page.waitForFunction(() => document.activeElement?.matches('h1[data-project-name]') === true, null, { timeout: 5_000 }).catch(() => undefined);
}
/** Presses the header's Undo once it names the restore, so an earlier step is never the one undone. */
async function undoRestore(c: Ctx, name: string) {
  const undo = c.page.locator('[data-history-undo]');
  await expect(undo).toHaveAttribute('aria-label', new RegExp(`Reactivated "${name}"`), { timeout: 15_000 }).catch(() => undefined);
  await undo.click();
}
/** Records the page state after a step as named evidence, with its own screenshot. */
async function snapshot(c: Ctx, name: string) {
  await c.page.waitForLoadState('networkidle').catch(() => undefined);
  c.entry[name] = await c.page.evaluate(probe, { regions: c.regions, writeControls: [...WRITE_CONTROLS] });
  c.entry[`${name}Screenshot`] = await c.shot(name);
}
const openArchiveConfirm = async (c: Ctx) => {
  await c.page.getByRole('button', { name: 'More project actions', exact: true }).click();
  await c.page.getByRole('menuitem', { name: /^Archive (project|workstream)…$/ }).click();
  await expect(c.page.locator(CONFIRM_R)).toBeVisible();
};
const DRAFT = '# Audit draft\n\nTyped, then left unsaved.';
/** Opens Kitchen's Brief editor, records the saved source, and types the draft. */
async function typeDraft(c: Ctx) {
  const brief = c.page.locator(KITCHEN_BRIEF);
  await brief.locator('[data-markdown-edit]').click();
  const source = brief.locator('[data-markdown-source]');
  c.entry['savedSource'] = await source.inputValue();
  c.entry['typedDraft'] = DRAFT;
  await source.fill(DRAFT);
}
const editAgain = (c: Ctx) => c.page.locator(KITCHEN_BRIEF).locator('[data-markdown-edit]').click();
const cancelEdit = (c: Ctx) => c.page.locator(KITCHEN_BRIEF).locator('[data-markdown-cancel]').click();

const ARCHIVED_ONLY = { seed: 'empty', prepare: archivedOnly } as const;
const RENOVATION_ARCHIVED = { seed: 'nested-projects', prepare: archiveRenovation } as const;

export const CONTEXTS: Context[] = [
  // First run: the personas W4-001 names, each with no project on `empty`.
  { id: 'first-run-demo', seed: 'empty', route: '/app' },
  { id: 'first-run-alex', seed: 'empty', route: '/app', persona: 'user-alex' },
  { id: 'first-run-sam', seed: 'empty', route: '/app', persona: 'user-sam' },
  // After: the main column's New project, which opens the Menu itself at 375. Before: the sidebar's.
  { id: 'first-run-create', seed: 'empty', route: '/app',
    act: async c => {
      const main = c.page.locator('app-dashboard-page [data-first-run-create]');
      c.entry['pressed'] = await main.count() ? 'main' : 'sidebar';
      if (await main.count()) { await main.first().click(); return; }
      await openPhoneMenu(c.page);
      await c.page.locator('app-sidebar').getByRole('button', { name: 'New project', exact: true }).click();
    } },
  { id: 'archived-only-home', ...ARCHIVED_ONLY, route: '/app', act: c => openPhoneMenu(c.page) },
  { id: 'archived-only-canvas', ...ARCHIVED_ONLY, route: archivedOnlyRoute() },
  { id: 'archived-only-todos', ...ARCHIVED_ONLY, route: archivedOnlyRoute('/pages/todos'), themes: ['light'], widths: [1440],
    hiddenFrom: state => `/api/projects/${String(state['projectId'])}/todos` },
  { id: 'archived-only-reflections', ...ARCHIVED_ONLY, route: archivedOnlyRoute('/pages/reflections'), themes: ['light'], widths: [1440],
    hiddenFrom: state => `/api/projects/${String(state['projectId'])}/journal` },
  { id: 'legacy-attic', seed: 'nested-projects', route: LEGACY },
  { id: 'legacy-shelving', seed: 'nested-projects', route: LEGACY_CHILD },
  { id: 'renovation-archived-home', ...RENOVATION_ARCHIVED, route: ROOT },
  { id: 'renovation-archived-todos', ...RENOVATION_ARCHIVED, route: `${ROOT}/pages/todos`, hiddenFrom: () => '/api/projects/project-renovation/todos' },
  { id: 'renovation-archived-reflections', ...RENOVATION_ARCHIVED, route: `${ROOT}/pages/reflections`, hiddenFrom: () => '/api/projects/project-renovation/journal' },
  { id: 'renovation-archived-archive', ...RENOVATION_ARCHIVED, route: `${ROOT}/pages/archive` },
  { id: 'renovation-archived-kitchen', ...RENOVATION_ARCHIVED, route: KITCHEN },
  // Restore, then the header's Undo: refused, because Legacy shelving is live.
  { id: 'legacy-attic-restore', seed: 'nested-projects', route: LEGACY,
    act: async c => {
      if (!await bannerRestore(c)) return;
      await restoreLanded(c);
      await snapshot(c, 'restored');
      await undoRestore(c, 'Legacy attic');
      // The refusal is the toast the header's Undo raises, as in the e2e.
      c.entry['undoRefused'] = await c.page.locator('[data-toast]:popover-open').filter({ hasText: 'Could not undo' })
        .waitFor({ timeout: 8_000 }).then(() => true, () => false);
    } },
  // Restoring the ancestor from the live child's banner: the toast offers Undo and Open owner.
  { id: 'legacy-shelving-restore', seed: 'nested-projects', route: LEGACY_CHILD,
    act: async c => {
      if (!await bannerRestore(c)) return;
      await c.page.locator('[data-toast]:popover-open').waitFor().catch(() => undefined);
    } },
  // An archived root with nothing live: Restore, then the header's Undo puts the banner back.
  { id: 'renovation-restore-undo', ...RENOVATION_ARCHIVED, route: ROOT,
    act: async c => {
      if (!await bannerRestore(c)) return;
      await restoreLanded(c);
      await snapshot(c, 'restored');
      await undoRestore(c, 'Home renovation');
      c.entry['bannerBack'] = await c.page.locator('app-archived-banner').waitFor().then(() => true, () => false);
    } },
  { id: 'banner-restore-failing', seed: 'nested-projects', route: LEGACY, reason: 'Audit: restore failed',
    setup: c => refuse(c.page, /^\/api\/projects\/project-legacy$/, 500, 'internal_error', 'Audit: restore failed'),
    act: async c => { if (await bannerRestore(c)) await waitForFailure(c.page, 'app-archived-banner', 'Audit: restore failed'); } },
  { id: 'kitchen-archive-blocked', seed: 'nested-projects', route: KITCHEN, act: openArchiveConfirm },
  { id: 'renovation-archive-blocked', seed: 'nested-projects', route: ROOT, act: openArchiveConfirm },
  { id: 'cabinets-archive-commit', seed: 'nested-projects', route: '/projects/project-cabinets', act: openArchiveConfirm },
  { id: 'cabinets-late-refusal', seed: 'nested-projects', route: '/projects/project-cabinets', reason: 'Audit: Cabinets still has live work',
    setup: c => refuse(c.page, /^\/api\/projects\/project-cabinets$/, 409, 'rule_violation', 'Audit: Cabinets still has live work'),
    act: async c => {
      await openArchiveConfirm(c);
      await c.page.locator('[data-project-archive-confirm-yes]').click();
      await waitForFailure(c.page, 'app-project-header', 'Audit: Cabinets still has live work');
    } },
  // At rest, then after choosing another status (the main capture is at rest).
  { id: 'archive-restore-choice', seed: 'nested-projects', route: `${ROOT}/pages/archive`,
    after: async c => { await c.page.locator(ARCHIVE_ROW).locator('select').first().selectOption('on_hold'); await snapshot(c, 'chosen'); } },
  { id: 'settings-restore-choice', seed: 'nested-projects', route: '/settings/archived-projects',
    after: async c => { await c.page.locator(SETTINGS_ROW).locator('select').first().selectOption('on_hold'); await snapshot(c, 'chosen'); } },
  { id: 'digest-overdue-chaos', seed: 'overdue-chaos', route: '/app' },
  { id: 'digest-busy-week', seed: 'busy-week', route: '/app' },
  // W4-028's own repro: Sam's one project with a task due 2026-08-20.
  { id: 'digest-sam', seed: 'overdue-chaos', route: '/app', persona: 'user-sam',
    prepare: async () => {
      const project = await createProject({ workspaceId: 'workspace-sam' as WorkspaceId, kind: 'root', name: 'Sam overdue repro' }, 'user-sam');
      const { section: tasks } = await api.post<{ section: { id: string } }>(`/api/projects/${project.id}/sections`, { type: 'task-list', title: 'Tasks' }, 'user-sam');
      await api.post('/api/tasks', { projectId: project.id, sectionId: tasks.id, title: 'Sam overdue task', dueAt: '2026-08-20T12:00:00.000Z' }, 'user-sam');
    } },
  { id: 'digest-owner-section', seed: 'overdue-chaos', route: '/app',
    act: async c => {
      const link = c.page.locator(`${DIGEST_R} [data-digest-overdue] a`).first();
      c.entry['overdueLinkPresent'] = await link.count() > 0;
      if (!await link.count()) return;
      c.entry['followed'] = { text: (await link.textContent())?.trim() ?? null, href: await link.getAttribute('href') };
      await link.click();
      await expect(c.page).toHaveURL(/#section-/);
    } },
  { id: 'markdown-draft', seed: 'nested-projects', route: KITCHEN, act: typeDraft },
  { id: 'markdown-cancel-edit', seed: 'nested-projects', route: KITCHEN,
    act: async c => { await typeDraft(c); await cancelEdit(c); await editAgain(c); } },
  // In-app navigation, so an in-memory draft store survives: the sidebar's Cabinets, then Back.
  { id: 'markdown-navigate-back', seed: 'nested-projects', route: KITCHEN,
    act: async c => {
      await typeDraft(c);
      await openPhoneMenu(c.page);
      await c.page.locator('app-sidebar').getByRole('link', { name: 'Cabinets', exact: true }).click();
      await expect(c.page).toHaveURL(/project-cabinets/);
      await c.page.goBack();
      await expect(c.page.locator(KITCHEN_BRIEF)).toBeVisible();
      await editAgain(c);
    } },
  { id: 'markdown-discard', seed: 'nested-projects', route: KITCHEN,
    act: async c => {
      await typeDraft(c); await cancelEdit(c); await editAgain(c);
      const discard = c.page.locator(KITCHEN_BRIEF).getByRole('button', { name: 'Discard draft', exact: true });
      // Waited for, not counted: the editor renders the kept draft a frame after Edit.
      c.entry['discardPresent'] = await discard.waitFor({ timeout: 5_000 }).then(() => true, () => false);
      if (c.entry['discardPresent']) await discard.click();
    } },
  { id: 'markdown-preview', seed: 'nested-projects', route: KITCHEN,
    act: async c => { await typeDraft(c); await c.page.locator(KITCHEN_BRIEF).locator('[data-markdown-preview]').click(); } },
  { id: 'count-kitchen', seed: 'nested-projects', route: KITCHEN },
  // L4-023's own repro: about thirty tasks in Work Manager's list.
  { id: 'count-dense', seed: 'agent-heavy', route: '/projects/project-work-manager',
    prepare: async () => {
      for (let i = 1; i <= 26; i += 1) await api.post('/api/tasks', { projectId: 'project-work-manager', sectionId: 'section-project-work-manager-tasks', title: `Audit dense ${String(i).padStart(2, '0')}` });
    } },
  { id: 'count-shortcut', seed: 'nested-projects', route: ROOT },
  // The last row is dragged so the first stays in the list; the capture is taken mid-drag.
  { id: 'drag-start', seed: 'nested-projects', route: KITCHEN, widths: [1440],
    act: async c => {
      const rows = c.page.locator(`${KITCHEN_TASKS} [data-task-row]`);
      const top = () => rows.first().evaluate(e => e.getBoundingClientRect().top);
      const before = await top();
      const handle = (await rows.last().boundingBox())!;
      await c.page.mouse.move(handle.x + handle.width - 24, handle.y + handle.height / 2);
      await c.page.mouse.down();
      await c.page.mouse.move(handle.x + handle.width - 24, handle.y + handle.height / 2 - 12, { steps: 6 });
      await c.page.waitForTimeout(400);
      c.entry['drag'] = { firstRowTopBefore: before, firstRowTopDuring: await top(), dragging: await c.page.locator('.cdk-drag-preview').count() > 0 };
    },
    after: async c => { await c.page.mouse.up(); } },
  // Cabinets' completion held: Shift+Tab from Kitchen's title link lands on, or skips, Kitchen's Complete.
  { id: 'todos-pending', seed: 'nested-projects', route: `${ROOT}/pages/todos`, themes: ['light'], widths: [1440], held: true,
    setup: c => holdWrite(c, /^\/api\/projects\/project-cabinets$/, 60_000),
    act: async c => {
      const todo = (name: string) => c.page.locator('[data-todo-row]').filter({ has: c.page.locator('[data-todo-link]', { hasText: new RegExp(`^\\s*${name}\\s*$`) }) });
      await todo('Cabinets').locator('[data-todo-complete]').click();
      await c.page.waitForTimeout(300);
      await todo('Kitchen').locator('[data-todo-link]').focus();
      await c.page.keyboard.press('Shift+Tab');
    } },
  { id: 'lab', seed: 'nested-projects', route: '/prototype/design', frames: ['[data-panel="state-messages"]', '[data-panel="section-frame"]'],
    // In the matrix's coordinates (the page unscrolled): the frame shots leave the Lab scrolled to a
    // panel, and how far depends on that panel's height, which this slice changes.
    after: async c => { c.entry['panels'] = await c.page.locator('[data-panel]').evaluateAll(panels => panels.map(panel => {
      const r = panel.getBoundingClientRect();
      let x = r.x, y = r.y;
      for (let ancestor = panel.parentElement; ancestor; ancestor = ancestor.parentElement) { x += ancestor.scrollLeft; y += ancestor.scrollTop; }
      return { id: panel.getAttribute('data-panel'), x, y, width: r.width, height: r.height };
    })); } },
];

/**
 * Browser-side evidence for profile 79's rules: each region's text, controls (with native
 * `disabled`, `aria-disabled` and primary weight), selects and their options, visible write
 * controls, empty hooks and their sentences, section and shortcut frame headers with their
 * rendered task rows, editor sources, failures and Details; and, page-wide, the banner, the
 * project header's controls, the open toast, the URL and where focus is.
 */
function probe({ regions, writeControls }: { regions: string[]; writeControls: string[] }) {
  const box = (e: Element) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const inClosedDetails = (e: Element) => { const d = e.closest('details:not([open])'); return !!d && !e.closest('summary'); };
  const shown = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && e.checkVisibility({ visibilityProperty: true }) && !inClosedDetails(e); };
  const text = (e: Element) => ((e as HTMLElement).innerText ?? e.textContent ?? '').trim();
  const name = (e: Element) => (e.getAttribute('aria-label') || text(e) || ((e as HTMLInputElement).labels?.[0] ? text((e as HTMLInputElement).labels![0]!) : '') || e.getAttribute('title') || '').trim();
  const hooks = (e: Element) => [...e.attributes].map(a => a.name).filter(n => n.startsWith('data-'));
  const control = (e: Element) => ({ name: name(e).slice(0, 200), tag: e.tagName.toLowerCase(), hooks: hooks(e), visible: shown(e), box: box(e),
    href: e.getAttribute('href'), disabled: (e as HTMLButtonElement).disabled === true, ariaDisabled: e.getAttribute('aria-disabled') === 'true',
    primary: e.classList.contains('button--primary'), background: getComputedStyle(e).backgroundColor });
  // A region's or the banner's restore choice: its value, its shown default and its option list.
  const selectOf = (e: Element) => { const s = e as HTMLSelectElement; return { name: name(s) || (s.labels?.[0] ? text(s.labels[0]) : ''), hooks: hooks(s), visible: shown(s), value: s.value, selectedText: s.selectedOptions[0]?.text.trim() ?? null, options: [...s.options].map(o => ({ value: o.value, text: o.text.trim() })), disabled: s.disabled, box: box(s) }; };
  const isFailure = (e: Element) => (e.getAttribute('role') === 'alert' && !!e.textContent?.trim()) || hooks(e).some(n => /error/.test(n)) || (e.matches('[data-failure-sentence]') && !!e.textContent?.trim());
  const regionData = regions.map(region => {
    const el = document.querySelector(region);
    if (!el) return { region, present: false };
    const all = [...el.querySelectorAll('*')];
    const frames = [...new Set([...(el.matches('[data-section-frame], [data-shortcut-id]') ? [el] : []), ...el.querySelectorAll('[data-section-frame], [data-shortcut-id]')])];
    return {
      region, present: true, box: box(el), text: text(el).slice(0, 3000),
      controls: all.filter(e => e.matches('button, a[href], [role=button], summary, input, textarea')).map(control),
      selects: all.filter(e => e.tagName === 'SELECT').map(selectOf),
      writeControls: writeControls.map(selector => ({ selector, visible: [...el.querySelectorAll(selector)].filter(shown).length })).filter(w => w.visible > 0),
      emptyHooks: [el, ...all].filter(shown).flatMap(e => [...e.attributes].map(a => a.name).filter(n => /^data-.*-empty$|^data-empty-canvas$/.test(n)).map(hook => ({ hook, text: text(e).slice(0, 300) }))),
      frames: frames.map(f => ({ section: f.getAttribute('data-section-id'), shortcut: f.getAttribute('data-shortcut-id'), type: f.getAttribute('data-section-type'),
        header: text(f.querySelector('header') ?? f).slice(0, 300), rows: [...f.querySelectorAll('[data-task-row]')].filter(shown).length })),
      sources: all.filter(e => e.tagName === 'TEXTAREA').map(e => ({ hooks: hooks(e), name: name(e), value: (e as HTMLTextAreaElement).value })),
      failures: [el, ...all].filter(e => isFailure(e) && shown(e)).slice(0, 10).map(e => ({ hooks: hooks(e), text: text(e).slice(0, 300) })),
      details: all.filter(e => e.tagName === 'DETAILS').map(d => ({ open: (d as HTMLDetailsElement).open, summary: text(d.querySelector('summary') ?? d), text: (d.textContent ?? '').trim().slice(0, 1000) })),
      digestOverdue: [...(el.matches('[data-digest-overdue]') ? [el] : []), ...el.querySelectorAll('[data-digest-overdue]')].filter(shown).map(e => {
        const link = e.matches('a[href]') ? e : e.querySelector('a[href]');
        return { text: text(e).slice(0, 200), href: link?.getAttribute('href') ?? null, linkBox: link ? box(link) : null };
      }),
      ariaBusyWithin: [el, ...all].some(e => e.getAttribute('aria-busy') === 'true'),
    };
  });
  const bannerEl = document.querySelector('app-archived-banner');
  // A host with no box of its own (`display: contents`) is shown when any of its content is.
  const bannerShown = bannerEl ? [bannerEl, ...bannerEl.querySelectorAll('*')].find(shown) : undefined;
  const banner = bannerEl && bannerShown ? { text: text(bannerEl).slice(0, 600), box: box(bannerShown), controls: [...bannerEl.querySelectorAll('button, a[href], select')].map(control), selects: [...bannerEl.querySelectorAll('select')].map(selectOf) } : null;
  const header = document.querySelector('app-project-header');
  const toastEl = document.querySelector('[data-toast]:popover-open');
  const active = document.activeElement;
  const focus = active && active !== document.body ? { ...control(active), focusVisible: active.matches(':focus-visible'), inRegion: regions.findIndex(r => document.querySelector(r)?.contains(active)) } : null;
  const firstFrame = document.querySelector('main [data-section-frame], main [data-shortcut-id], main [data-empty-canvas]');
  const hashTarget = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  return { url: location.pathname + location.hash, regions: regionData, banner,
    firstFrame: firstFrame ? box(firstFrame) : null,
    hashTarget: hashTarget ? { id: hashTarget.id, box: box(hashTarget), visible: shown(hashTarget) } : null,
    header: header ? { box: box(header), text: text(header).slice(0, 600), controls: [...header.querySelectorAll('button, a[href], select, input')].map(control) } : null,
    toast: toastEl ? { text: text(toastEl).slice(0, 300), controls: [...toastEl.querySelectorAll('button, a[href]')].map(control) } : null,
    dialogs: [...document.querySelectorAll('dialog[open]')].map(d => ({ hooks: hooks(d), text: text(d).slice(0, 600) })),
    focus };
}

/** Slice 79's own evidence; frozen earlier verification journeys are deliberately not re-run. */
test('Empty, archived and editing evidence and core tasks', async ({ browser }) => {
  await mkdir(out, { recursive: true });
  const ids = new Set(CONTEXTS.map(c => c.id));
  expect(ROWS.filter(r => !ids.has(r.context)).map(r => r.context), 'every row names a context').toEqual([]);
  expect(CONTEXTS.filter(c => c.id !== 'lab' && !ROWS.some(r => r.context === c.id)).map(c => c.id), 'every context but lab has a row').toEqual([]);
  const match = process.env['UX_STATES_MATCH'];
  const entries: Record<string, unknown>[] = match ? await readFile(resolve(out, 'empty-archived-verification.json'), 'utf8').then(text => JSON.parse(text).entries).catch(() => []) : [];
  const key = (e: Record<string, unknown>) => [e['context'], e['theme'], e['width']].join('|');
  const write = (complete: boolean, tasks?: unknown) => writeFile(resolve(out, 'empty-archived-verification.json'), JSON.stringify({ commit, complete, writeControls: WRITE_CONTROLS, rows: ROWS, entries, tasks }, null, 2));
  const combos = (fixture: Context) => (fixture.themes ?? ['dark', 'light'] as const).flatMap(theme => (fixture.widths ?? [1440, 375]).map(width => ({ theme, width })));
  for (const fixture of CONTEXTS) for (const { theme, width } of combos(fixture)) {
    if (match && !new RegExp(match).test([fixture.id, theme, width].join('|'))) continue;
    const started = Date.now();
    const rows = ROWS.filter(r => r.context === fixture.id);
    const regions = rows.map(r => r.region);
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
    const base = `empty-archived-${fixture.id}-${theme}-${width}`;
    const c: Ctx = { page, entry, state, regions, releases: [], shot: async suffix => { const file = `${base}-${suffix}.png`; await page.screenshot({ path: resolve(out, file), fullPage: true }); return file; } };
    try {
      await fixture.prepare?.(state);
      const route = typeof fixture.route === 'function' ? fixture.route(state) : fixture.route;
      entry['route'] = route;
      await fixture.setup?.(c);
      const documentResponse = await page.goto('http://localhost:4200' + route, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle');
      if (!documentResponse) throw new Error('Static document response is missing');
      entry['servedBuild'] = { indexSha256: createHash('sha256').update(await documentResponse.body()).digest('hex'), captureLabel: commit, workingTree: !process.env['UX_BEFORE'] };
      await page.locator('[data-theme-toggle]').first().waitFor({ state: 'attached' }).catch(() => undefined);
      const toggle = page.getByRole('button', { name: `Switch to the ${theme} theme` });
      if (await page.locator('html').getAttribute('data-theme') !== theme && await toggle.count()) await toggle.click();
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      await fixture.act?.(c);
      if (!fixture.held) await page.waitForLoadState('networkidle').catch(() => undefined);
      // The value is read when the page is, so the Q7 rule compares like with like. The before
      // host has no such field: it is recorded as null, never as 0.
      if (fixture.hiddenFrom) entry['hiddenItemCount'] = (await api.get<{ hiddenItemCount?: number }>(fixture.hiddenFrom(state))).hiddenItemCount ?? null;
      entry['screenshot'] = `${base}.png`;
      await page.screenshot({ path: resolve(out, String(entry['screenshot'])), fullPage: true });
      Object.assign(entry, await page.evaluate(probe, { regions, writeControls: [...WRITE_CONTROLS] }));
      entry['controls'] = await page.evaluate(collectControls);
      const scan = await new AxeBuilder({ page }).options({ rules: { 'target-size': { enabled: true } } }).analyze();
      for (const violation of scan.violations) for (const node of violation.nodes) {
        const selector = node.target.at(-1);
        if (typeof selector === 'string') (node as typeof node & { stableAnchor?: string }).stableAnchor = String(await page.evaluate(axeNodeIdentity, selector).catch(() => selector));
      }
      entry['axe'] = { violations: scan.violations, incomplete: scan.incomplete };
      entry['aria'] = await page.locator('body').ariaSnapshot();
      const shots: Record<string, unknown> = {};
      for (const [i, region] of [...new Set([...regions, ...(fixture.frames ?? [])])].entries()) {
        const target = page.locator(region).first();
        if (!await target.count() || !await target.isVisible()) { shots[region] = { absent: true }; continue; }
        const file = `${base}-r${i}.png`;
        await target.screenshot({ path: resolve(out, file) }).then(() => { shots[region] = file; }, () => { shots[region] = { absent: true }; });
      }
      entry['regionScreenshots'] = shots;
      // Open every closed Details in the rows' regions (and the banner), record what it reveals.
      const scopes = [...regions, 'app-archived-banner'];
      const closed = page.locator(scopes.map(r => `${r} details:not([open]) > summary`).join(', '));
      if (await closed.count()) {
        for (const summary of await closed.elementHandles()) await summary.click({ timeout: 2000 }).catch(() => summary.evaluate(s => (s as HTMLElement).click()));
        entry['detailsOpen'] = await page.evaluate(probe, { regions: scopes, writeControls: [...WRITE_CONTROLS] });
        entry['detailsOpenScreenshot'] = await c.shot('details');
        await page.evaluate(sel => document.querySelectorAll(sel).forEach(s => { (s.parentElement as HTMLDetailsElement).open = false; }), scopes.map(r => `${r} details > summary`).join(', '));
      }
      await fixture.after?.(c);
    } catch (error) { entry['error'] = String(error); }
    finally {
      for (const release of c.releases) release();
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
  const expected = CONTEXTS.reduce((n, fixture) => n + combos(fixture).length, 0);
  await write(entries.length === expected && entries.every(e => !e['error']) && tasks !== null, tasks);
  expect(entries.filter(e => e['error']).map(e => `${key(e)}: ${String(e['error'])}`), 'all contexts captured').toEqual([]);
  if (!match) expect(entries.length, 'every context at its themes and widths').toBe(expected);
});
