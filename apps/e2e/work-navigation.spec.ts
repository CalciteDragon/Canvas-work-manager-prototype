/**
 * Slice 60: page settings and work creation, including real live and refusal paths. Slice 81 moved
 * both from the deleted project column to the tree's pencil menu.
 */
import type { Project, ProjectWriteResult } from '@cwm/contracts';
import { expect, test, type Page } from '@playwright/test';
import { fromPencil, pencil, treePage, treeWork } from './project-tree';
import { api, createRoot, seed, setClock } from './seed';

const ROOT = 'project-renovation';
const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Add workstream' });
const nameOf = (page: Page) => dialogOf(page).getByRole('textbox', { name: 'Name', exact: true });
const parentOf = (page: Page) => dialogOf(page).getByRole('combobox', { name: 'Parent', exact: true });
const projects = () => api.get<Project[]>('/api/projects');

test.beforeEach(async () => {
  await seed('nested-projects');
  await setClock('2026-09-30T12:00:00.000Z');
});

for (const theme of ['dark', 'light'] as const) {
  test(`${theme}: the pencil’s page settings work by keyboard on Home, Todos and third-level work`, async ({ page }) => {
    for (const path of [`/projects/${ROOT}/pages/home`, `/projects/${ROOT}/pages/todos`, '/projects/project-cabinets']) {
      await page.goto(path);
      await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-theme-toggle]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const edit = pencil(page);
      const pages = page.locator('[data-edit-project-pages]');
      const panel = page.locator('[data-project-page-manager]');
      await expect(edit).toHaveAccessibleName('Edit project');
      await expect(panel).toBeHidden();
      await edit.press('Enter');
      await expect(pages).toBeFocused();
      await expect(pages).toHaveAccessibleName('Pages of Home renovation…');
      await pages.press('Enter');
      await expect(panel).toBeVisible();
      await expect(panel.locator('[data-page-toggle-kind="home"] input')).toBeDisabled();
      await expect(panel.locator('[data-page-toggle-kind="work"]')).toHaveCount(0);
      const reflections = panel.locator('[data-page-toggle-kind="reflections"] input');
      await expect(reflections).toBeChecked();
      await reflections.click();
      await expect(reflections).not.toBeChecked();
      await expect(treePage(page, 'reflections')).toHaveCount(0);
      await reflections.click();
      await expect(reflections).toBeChecked();
      await expect(treePage(page, 'reflections')).toBeVisible();

      await page.route(`**/api/projects/${ROOT}/pages/reflections`, (route) =>
        route.request().method() === 'PATCH'
          ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'conflict', message: 'Reflections toggle refused for this journey' }) })
          : route.fallback());
      await reflections.click();
      await expect(reflections).toBeChecked();
      await expect(panel.locator('[data-page-toggle-error]')).toContainText('Reflections toggle refused');
      await reflections.press('Escape');
      await expect(panel).toBeHidden();
      await expect(edit).toBeFocused();
      await edit.press('Space');
      await expect(pages).toBeFocused();
      await pages.press('Enter');
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(edit).toBeFocused();
      await page.unroute(`**/api/projects/${ROOT}/pages/reflections`);
    }
  });
}

test('Add workstream creates once without navigation, refreshes a second tab and resets a departed parent', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/projects/${ROOT}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
  const before = await projects();
  await fromPencil(page, 'add');
  await expect(nameOf(page)).toBeFocused();
  await expect(parentOf(page)).toHaveValue(ROOT);
  const options = await parentOf(page).locator('option').allTextContents();
  expect(options.map((label) => label.trim())).toEqual(['Home renovation', 'Kitchen', 'Cabinets', 'Garden (completed)']);
  expect(options[1]).toMatch(/^\u00a0+Kitchen$/);
  expect(options[2]).toMatch(/^\u00a0+Cabinets$/);
  expect(options[2]!.indexOf('Cabinets')).toBeGreaterThan(options[1]!.indexOf('Kitchen'));
  await dialogOf(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialogOf(page)).toHaveCount(0);
  expect((await projects()).map(({ id }) => id)).toEqual(before.map(({ id }) => id));
  await expect(pencil(page)).toBeFocused();

  const watcher = await page.context().newPage();
  const stream = watcher.waitForResponse((response) => response.url().includes('/prototype/events') && response.status() === 200);
  await watcher.goto(`/projects/${ROOT}/pages/todos`);
  await stream;
  await expect(watcher.locator('section.todos')).toBeVisible();
  const url = page.url();
  await fromPencil(page, 'add');
  await nameOf(page).fill('Paint samples');
  await expect(dialogOf(page)).toContainText('Inside Home renovation');
  const created = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/projects'));
  await dialogOf(page).getByRole('button', { name: 'Create', exact: true }).dblclick();
  const child = ((await (await created).json()) as ProjectWriteResult).project;
  await expect(dialogOf(page)).toHaveCount(0);
  expect(page.url()).toBe(url);
  const after = await projects();
  expect(after.length).toBe(before.length + 1);
  expect(after.filter(({ name }) => name === 'Paint samples')).toHaveLength(1);
  expect(child.parentProjectId).toBe(ROOT);
  await expect(page.locator('[data-toast]:popover-open')).toContainText('Created “Paint samples”.');
  await expect(page.locator('[data-toast]:popover-open [data-toast-open]')).toHaveAttribute('href', `/projects/${child.id}`);
  await expect(treeWork(watcher, child.id)).toBeVisible();
  await expect(watcher.locator(`[data-todo-id="${child.id}"]`)).toContainText('Workstream');

  await page.goto('/projects/project-cabinets');
  await fromPencil(page, 'add');
  // Slice 81, Q15 (a): Parent defaults to the open workstream.
  await expect(parentOf(page)).toHaveValue('project-cabinets');
  await expect(dialogOf(page)).toContainText('Inside Cabinets');
  await parentOf(page).selectOption('project-kitchen');
  await expect(dialogOf(page)).toContainText('Inside Kitchen');
  await nameOf(page).fill('Cabinet hardware');
  const nestedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/projects'));
  await dialogOf(page).getByRole('button', { name: 'Create', exact: true }).click();
  const nested = ((await (await nestedResponse).json()) as ProjectWriteResult).project;
  expect((await api.get<Project>(`/api/projects/${nested.id}`)).parentProjectId).toBe('project-kitchen');
  await expect(page).toHaveURL(/\/projects\/project-cabinets$/);

  await fromPencil(page, 'add');
  await parentOf(page).selectOption('project-garden');
  await api.patch('/api/projects/project-garden', { status: 'archived' });
  // A departed choice resets to the default: the open workstream (Q15 (a)).
  await expect(parentOf(page)).toHaveValue('project-cabinets');
  await expect(dialogOf(page)).toContainText('Garden is no longer available; choose another parent.');
  await dialogOf(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await watcher.close();
});

test('real archived-ancestry refusal retains the name and parent without creating', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('net::ERR_FAILED') && !message.text().includes('status of 409')) errors.push(message.text());
  });
  await page.route((url) => url.pathname === '/prototype/events', (route) => route.abort());
  await page.goto(`/projects/${ROOT}`);
  await fromPencil(page, 'add');
  await parentOf(page).selectOption('project-cabinets');
  await nameOf(page).fill('Refused draft');
  const before = await projects();
  await api.patch('/api/projects/project-cabinets', { status: 'archived' });
  await dialogOf(page).getByRole('button', { name: 'Create', exact: true }).click();
  // Slice 78: the alert is the product sentence; the host's reason is under Details.
  await expect(dialogOf(page).getByRole('alert')).toHaveText('Couldn’t add “Refused draft”. Try again.');
  await expect(dialogOf(page).locator('[data-create-work-error] details')).toContainText('archived');
  await expect(nameOf(page)).toHaveValue('Refused draft');
  await expect(parentOf(page)).toHaveValue('project-cabinets');
  expect((await projects()).length).toBe(before.length);
  expect(errors).toEqual([]);
});

test('a failed create keeps its draft and an archived root explains why Add workstream is unavailable', async ({ page }) => {
  await page.goto(`/projects/${ROOT}`);
  await fromPencil(page, 'add');
  await nameOf(page).fill('Transport draft');
  await parentOf(page).selectOption('project-kitchen');
  const before = await projects();
  await page.route('**/api/projects', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'Create failed for this journey' }) })
    : route.fallback());
  await dialogOf(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialogOf(page).getByRole('alert')).toHaveText('Couldn’t add “Transport draft”. Try again.');
  await expect(dialogOf(page).locator('[data-create-work-error] details')).toContainText('Create failed for this journey');
  await expect(nameOf(page)).toHaveValue('Transport draft');
  await expect(parentOf(page)).toHaveValue('project-kitchen');
  expect((await projects()).length).toBe(before.length);
  await page.unroute('**/api/projects');
  await dialogOf(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  const root = await createRoot('Archived scratch');
  await api.patch(`/api/projects/${root.id}`, { status: 'archived' });
  await page.goto(`/projects/${root.id}`);
  await pencil(page).click();
  const add = page.locator('[data-edit-project-add]');
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  await expect(add).toHaveAccessibleName('Add workstream');
  await expect(add).toHaveAccessibleDescription('unavailable while Archived scratch is archived');
  await add.focus();
  await expect(add).toBeFocused();
  await add.press('Enter');
  await expect(dialogOf(page)).toHaveCount(0);
});
