import { test, type Browser, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ProjectSection, Task, TaskWriteResult } from '@cwm/contracts';
import { configureContext } from './isolation';
import { api, jsonRequest, seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';

/**
 * Slice 75's runtime evidence (Acceptance 23). It measures steps 3, 6, 11, 13, 14 and 16 and takes
 * the supplemental visual captures that need a delayed or failing route. It runs unchanged
 * against the "before" build, where pending rows and save cues do not exist, so every row
 * records what it observed and never asserts. Label: `UX_BEFORE`, or HEAD.
 */
const commit = process.env['UX_BEFORE'] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve('ux-output', commit);
const web = 'http://localhost:4200';
type Theme = 'dark' | 'light';
interface Entry { row: string; theme: Theme; width: number; screenshot?: string; [key: string]: unknown }
const entries: Entry[] = [];

const failure = { status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'Injected failure' }) };
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function open(browser: Browser, theme: Theme, width: number, persona?: string) {
  const touch = width === 375;
  const context = await browser.newContext({ viewport: { width, height: touch ? 812 : 900 }, hasTouch: touch, isMobile: touch, colorScheme: theme, reducedMotion: 'reduce' });
  await configureContext(context);
  if (persona) await context.addInitScript((value) => localStorage.setItem('cwm.prototype.persona', value), persona);
  const page = await context.newPage();
  return { context, page };
}

async function shot(page: Page, entry: Entry) {
  entry.screenshot = `placement-${entry.row}-${entry.theme}-${entry.width}.png`;
  await page.screenshot({ path: resolve(out, entry.screenshot), animations: 'disabled' });
}

/** Records one row; a step the build cannot do is recorded as such, never thrown. */
async function record(browser: Browser, row: string, theme: Theme, width: number, run: (page: Page, entry: Entry) => Promise<void>, persona?: string) {
  const { context, page } = await open(browser, theme, width, persona);
  const entry: Entry = { row, theme, width };
  try {
    await run(page, entry);
  } catch (error) {
    entry['error'] = String(error).slice(0, 300);
    if (entry.screenshot === undefined) await shot(page, entry).catch(() => undefined);
  }
  entries.push(entry);
  await writeFile(resolve(out, 'placement-verification.json'), JSON.stringify({ commit, complete: false, entries }, null, 2));
  await context.close();
}

const focusFacts = (page: Page) => page.evaluate(() => {
  const active = document.activeElement as HTMLElement | null;
  const rect = active?.getBoundingClientRect();
  return { tag: active?.tagName, heading: active?.matches('[data-section-title], [data-shortcut-title]') ?? false,
    text: active?.textContent?.trim().slice(0, 80), top: rect?.top, bottom: rect?.bottom, viewport: window.innerHeight,
    inView: rect !== undefined && rect.top >= 0 && rect.top < window.innerHeight };
});

const addTask = async (projectId: string, section: { id: string }, title: string) =>
  (await api.post<TaskWriteResult>('/api/tasks', { projectId, sectionId: section.id, title })).task as Task;
const firstTaskList = async (projectId: string) =>
  (await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections`)).find((section) => section.type === 'task-list')!;

/** Keydown to the first visible answer in the list: a pending row, or the real row once it lands. */
const firstFeedback = (page: Page, section: string, title: string) => page.locator(`${section} [data-quick-task-title]`).evaluate((input, title) => new Promise<number | null>((done) => {
  const root = input.closest('[data-section-id]')!;
  const started = performance.now();
  const seen = () => root.querySelector('[data-task-pending]') !== null
    || [...root.querySelectorAll('[data-task-title]')].some((node) => node.textContent?.trim() === title);
  const observer = new MutationObserver(() => { if (seen()) { observer.disconnect(); done(performance.now() - started); } });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  setTimeout(() => { observer.disconnect(); done(null); }, 4000);
  (input as HTMLInputElement).value = title;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  (input as HTMLInputElement).form!.requestSubmit();
}), title);

test('Placement runtime evidence', async ({ browser }) => {
  test.skip(!process.env['UX_PLACEMENT']);
  test.setTimeout(1_200_000);
  await mkdir(out, { recursive: true });

  // Steps 13 and 14 (W1-024, W2-008, W3-016, W1-043).
  for (const [theme, width] of [['dark', 1440], ['light', 375]] as const) {
    await seed('nested-projects'); await setClock(SEED_NOW);
    await record(browser, 'section-create', theme, width, async (page, entry) => {
      await page.goto(`${web}/projects/project-kitchen`);
      await page.locator('[data-section-canvas]').waitFor();
      await page.getByRole('button', { name: 'Insert at the end', exact: true }).click();
      await page.getByRole('combobox', { name: 'Section type' }).selectOption('task-list');
      await page.getByRole('dialog').getByRole('textbox').fill('Shopping');
      await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      await delay(600);
      entry['focus'] = await focusFacts(page);
      await shot(page, entry);
    });
  }
  await seed('nested-projects'); await setClock(SEED_NOW);
  await record(browser, 'shortcut-create', 'dark', 1440, async (page, entry) => {
    // Shortcuts are placed on a root's Home; Kitchen's own canvas does not offer them.
    await page.goto(`${web}/projects/project-renovation/pages/home`);
    const insert = page.getByRole('button', { name: /^Insert before / }).first();
    await insert.focus(); await insert.press('Enter');
    const mode = page.getByRole('button', { name: 'Add shortcut', exact: true });
    await mode.focus(); await mode.press('Enter');
    const add = page.locator('[data-shortcut-add]:not([disabled])').first();
    await add.focus(); await add.press('Enter');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await delay(600);
    entry['focus'] = await focusFacts(page);
    await shot(page, entry);
  });

  // Step 3 (L3-007, L4-004): five runs with POST held 2 s, the worst reported.
  for (const [theme, width] of [['dark', 1440], ['light', 375]] as const) {
    await seed('busy-week'); await setClock(SEED_NOW);
    const launch = await firstTaskList('project-launch');
    await record(browser, 'quick-add-pending', theme, width, async (page, entry) => {
      await page.route('**/api/tasks', async (route) => {
        if (route.request().method() === 'POST') await delay(2000);
        await route.fallback();
      });
      await page.goto(`${web}/projects/project-launch`);
      const section = `[data-section-id="${launch.id}"]`;
      await page.locator(`${section} [data-quick-task-title]`).scrollIntoViewIfNeeded();
      const runs: (number | null)[] = [];
      for (let run = 1; run <= 5; run += 1) {
        const pending = firstFeedback(page, section, `Order tiles ${run}`);
        if (run === 1) { await delay(100); await shot(page, entry); }
        runs.push(await pending);
        await delay(2300);
      }
      entry['runs'] = runs;
      entry['worstMs'] = runs.some((value) => value === null) ? null : Math.max(...(runs as number[]));
    });
  }

  // Step 6 (L4-023): agent-heavy's Work Manager list filled to 30 tasks.
  await seed('agent-heavy'); await setClock(SEED_NOW);
  const workList = await firstTaskList('project-work-manager');
  const existing = (await api.get<Task[]>(`/api/tasks?sectionId=${workList.id}`)).length;
  for (let index = existing + 1; index <= 30; index += 1) await addTask('project-work-manager', workList, `Fixture task ${index}`);
  await record(browser, 'long-list', 'dark', 1440, async (page, entry) => {
    await page.goto(`${web}/projects/project-work-manager`);
    const field = page.locator(`[data-section-id="${workList.id}"] [data-quick-task-title]`);
    await field.scrollIntoViewIfNeeded();
    await field.fill('Thirty-first task');
    await field.press('Enter');
    const row = page.locator(`[data-section-id="${workList.id}"] [data-task-row]`, { hasText: 'Thirty-first task' });
    await row.waitFor();
    await delay(600);
    const inView = (element: Element) => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= window.innerHeight; };
    entry['rowInView'] = await row.evaluate(inView);
    entry['fieldInView'] = await field.evaluate(inView);
    entry['fieldFocused'] = await field.evaluate((element) => document.activeElement === element);
    await shot(page, entry);
  });

  // Step 11 (L3-008) at 1440 dark, and W2-018's phone due-date edit.
  await seed('nested-projects'); await setClock(SEED_NOW);
  await record(browser, 'drawer-save', 'dark', 1440, async (page, entry) => {
    await page.route('**/api/tasks/*', async (route) => {
      if (route.request().method() === 'PATCH') await delay(2000);
      await route.fallback();
    });
    await page.goto(`${web}/projects/project-kitchen`);
    const title = page.getByRole('button', { name: /, open details$/ }).first();
    const row = title.locator('xpath=ancestor::*[@data-task-row][1]');
    await title.click();
    const priority = page.locator('[data-task-priority]');
    await priority.waitFor();
    const next = (await priority.inputValue()) === 'high' ? 'low' : 'high';
    const timing = priority.evaluate((select, next) => new Promise<{ savingMs: number | null; rowMs: number | null }>((done) => {
      const started = performance.now();
      const row = document.querySelector(`[data-task-row][aria-current="true"], [data-task-row].task-row--selected`) ?? document.querySelector('[data-task-row]');
      const result: { savingMs: number | null; rowMs: number | null } = { savingMs: null, rowMs: null };
      const check = () => {
        if (result.savingMs === null && document.querySelector('[data-field-status="priority"]')?.textContent?.includes('Saving')) result.savingMs = performance.now() - started;
        if (result.rowMs === null && row?.textContent?.includes(`${next} priority`)) result.rowMs = performance.now() - started;
      };
      const observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
      setTimeout(() => { observer.disconnect(); done(result); }, 3000);
      (select as HTMLSelectElement).value = next;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }), next);
    await delay(150);
    await shot(page, entry);
    Object.assign(entry, await timing);
    entry['rowText'] = await row.innerText();
    await delay(400);
    entry['statusAfter'] = await page.locator('[data-field-status="priority"]').textContent().catch(() => null);
    const saved = { ...entry, row: 'drawer-saved' };
    await shot(page, saved);
    entries.push(saved);
  });
  await seed('overdue-chaos'); await setClock(SEED_NOW);
  await record(browser, 'phone-due-date', 'light', 375, async (page, entry) => {
    await page.goto(`${web}/projects/project-client-migration`);
    const overdue = page.getByRole('article').filter({ hasText: 'Overdue' }).first();
    await overdue.getByRole('button', { name: /, open details$/ }).click();
    const status = page.locator('[data-task-drawer] dd').filter({ hasText: /todo|in_progress|blocked/ }).first();
    entry['statusBefore'] = await status.textContent().catch(() => null);
    await page.getByRole('textbox', { name: 'Due date', exact: true }).fill('2026-12-01');
    await page.getByRole('textbox', { name: 'Due date', exact: true }).dispatchEvent('change');
    await delay(1200);
    entry['statusAfter'] = await status.textContent().catch(() => null);
    entry['fieldStatus'] = await page.locator('[data-field-status="dueAt"]').textContent().catch(() => null);
    await shot(page, entry);
  });

  // L4-005: two row failures, and a permission failure in its card.
  await seed('busy-week'); await setClock(SEED_NOW);
  const launch = await firstTaskList('project-launch');
  await record(browser, 'row-failures', 'dark', 1440, async (page, entry) => {
    await page.route('**/api/tasks/*/complete', (route) => route.fulfill(failure));
    await page.goto(`${web}/projects/project-launch`);
    const boxes = page.locator(`[data-section-id="${launch.id}"] [data-task-complete]:not(:checked)`);
    await boxes.first().scrollIntoViewIfNeeded();
    for (let index = 0; index < 2; index += 1) { await boxes.nth(index).click(); await delay(500); }
    entry['rowErrors'] = await page.locator(`[data-section-id="${launch.id}"] [data-task-error]`).count();
    entry['sectionBanner'] = await page.locator(`[data-section-id="${launch.id}"] [data-tasks-error]`).count();
    await shot(page, entry);
  });
  await seed('agent-heavy'); await setClock(SEED_NOW);
  await record(browser, 'permission-failure', 'dark', 1440, async (page, entry) => {
    await page.route('**/api/agent-connections/*', (route) => route.request().method() === 'PATCH' ? route.fulfill(failure) : route.fallback());
    await page.goto(`${web}/settings/agents`);
    await page.locator('[data-connection-id="agent-cursor"] [data-permission="tasks.write"]').click();
    await delay(500);
    entry['inCard'] = await page.locator('[data-connection-id="agent-cursor"] [data-agent-permission-error]').count();
    entry['pageAlert'] = await page.locator('[data-agents-error]').count();
    await shot(page, entry);
  });

  // L4-024: empty Create in the sidebar and in Add workstream.
  await seed('nested-projects'); await setClock(SEED_NOW);
  await record(browser, 'empty-project-name', 'dark', 1440, async (page, entry) => {
    await page.goto(`${web}/projects/project-kitchen`);
    await page.locator('[data-new-project]').click();
    await page.locator('[data-create-project-name]').press('Enter');
    await delay(300);
    entry['message'] = await page.locator('[data-create-project-name-error]').textContent().catch(() => null);
    await shot(page, entry);
  });
  await record(browser, 'empty-work-name', 'dark', 1440, async (page, entry) => {
    await page.goto(`${web}/projects/project-kitchen`);
    await page.locator('[data-work-create]').click();
    await page.locator('[data-create-work-submit]').click();
    await delay(300);
    entry['message'] = await page.locator('[data-create-work-name-error]').textContent().catch(() => null);
    await shot(page, entry);
  });

  // Step 16 (W1-030, W2-010): two frames per width, before and after two completions.
  for (const [theme, width] of [['dark', 1440], ['light', 375]] as const) {
    await seed('nested-projects'); await setClock(SEED_NOW);
    const shopping = (await api.post<{ section: ProjectSection }>('/api/projects/project-kitchen/sections', { type: 'task-list', title: 'Shopping' })).section;
    const tasks = [await addTask('project-kitchen', shopping, 'Tiles'), await addTask('project-kitchen', shopping, 'Grout'), await addTask('project-kitchen', shopping, 'Sealant')];
    await record(browser, 'hold-before', theme, width, async (page, entry) => {
      await page.goto(`${web}/projects/project-kitchen`);
      const section = page.locator(`[data-section-id="${shopping.id}"]`);
      await section.locator('[data-task-row]').last().scrollIntoViewIfNeeded();
      await delay(400);
      const top = () => section.evaluate((element) => element.getBoundingClientRect().top);
      entry['scrollTop'] = await page.locator('main.workspace').evaluate((main) => main.scrollTop);
      const before = await top();
      await shot(page, entry);
      const deltas: number[] = [];
      for (const task of tasks.slice(0, 2)) {
        const was = await top();
        await section.locator(`[data-task-row][data-task-id="${task.id}"] [data-task-complete]`).click();
        await delay(1500);
        deltas.push((await top()) - was);
      }
      entry['deltas'] = deltas;
      entry['totalDelta'] = (await top()) - before;
      const after = { ...entry, row: 'hold-after' };
      await shot(page, after);
      entries.push(after);
    });
  }

  // W1-026, W3-012, W2-009, W4-008: three quick-adds as Sam; "before" is the pre-73 build. Sam's
  // workspace cannot open Kitchen, so Sam gets a root of their own with one Task List.
  for (const [theme, width] of [['dark', 1440], ['light', 375]] as const) {
    await seed('nested-projects'); await setClock(SEED_NOW);
    const { project } = await jsonRequest<{ project: { id: string } }>('/api/projects', { method: 'POST', persona: 'user-sam', body: { workspaceId: 'workspace-sam', kind: 'root', name: 'Sam’s errands' } });
    await jsonRequest(`/api/projects/${project.id}/sections`, { method: 'POST', persona: 'user-sam', body: { type: 'task-list', title: 'Errands' } });
    await record(browser, 'three-quick-adds', theme, width, async (page, entry) => {
      await page.goto(`${web}/projects/${project.id}`);
      const field = page.locator('[data-quick-task-title]').first();
      await field.scrollIntoViewIfNeeded();
      for (const title of ['First', 'Second', 'Third']) {
        await field.fill(title); await field.press('Enter'); await delay(700);
      }
      entry['drawerOpen'] = await page.locator('[data-task-drawer]:popover-open, dialog[data-task-drawer][open]').count() > 0;
      entry['fieldFocused'] = await field.evaluate((element) => document.activeElement === element);
      await shot(page, entry);
    }, 'user-sam');
  }

  await writeFile(resolve(out, 'placement-verification.json'), JSON.stringify({ commit, complete: true, entries }, null, 2));
});
