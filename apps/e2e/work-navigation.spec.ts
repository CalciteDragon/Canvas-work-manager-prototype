/** Slice 60: column settings and work creation, including real live and refusal paths. */
import type { Project, ProjectWriteResult } from '@cwm/contracts';
import { expect, test, type Page } from '@playwright/test';
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
  test(`${theme}: gear settings work by keyboard on Home, Todos and third-level work`, async ({ page }) => {
    for (const path of [`/projects/${ROOT}/pages/home`, `/projects/${ROOT}/pages/todos`, '/projects/project-cabinets']) {
      await page.goto(path);
      await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-theme-toggle]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const gear = page.locator('[data-project-settings-toggle]');
      const panel = page.locator('[data-project-page-manager]');
      await expect(gear).toHaveAccessibleName('Project page settings for Home renovation');
      await expect(panel).toBeHidden();
      await gear.press('Enter');
      await expect(panel).toBeVisible();
      await expect(gear).toHaveAttribute('aria-expanded', 'true');
      await expect(panel.locator('[data-page-toggle-kind="home"] input')).toBeDisabled();
      await expect(panel.locator('[data-page-toggle-kind="work"]')).toHaveCount(0);
      const reflections = panel.locator('[data-page-toggle-kind="reflections"] input');
      await expect(reflections).toBeChecked();
      await reflections.click();
      await expect(reflections).not.toBeChecked();
      await expect(page.locator('[data-project-page-tab][data-page-kind="reflections"]')).toHaveCount(0);
      await reflections.click();
      await expect(reflections).toBeChecked();
      await expect(page.locator('[data-project-page-tab][data-page-kind="reflections"]')).toBeVisible();

      await page.route(`**/api/projects/${ROOT}/pages/reflections`, (route) =>
        route.request().method() === 'PATCH'
          ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'conflict', message: 'Reflections toggle refused for this journey' }) })
          : route.fallback());
      await reflections.click();
      await expect(reflections).toBeChecked();
      await expect(panel.locator('[data-page-toggle-error]')).toContainText('Reflections toggle refused');
      await reflections.press('Escape');
      await expect(panel).toBeHidden();
      await expect(gear).toBeFocused();
      await gear.press('Space');
      await expect(panel).toBeVisible();
      await gear.click();
      await expect(panel).toBeHidden();
      await page.unroute(`**/api/projects/${ROOT}/pages/reflections`);
    }
  });
}

test('Work plus creates once without navigation, refreshes a second tab and resets a departed parent', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/projects/${ROOT}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
  const before = await projects();
  await page.locator('[data-work-create]').click();
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
  await expect(page.locator('[data-work-create]')).toBeFocused();

  const watcher = await page.context().newPage();
  const stream = watcher.waitForResponse((response) => response.url().includes('/prototype/events') && response.status() === 200);
  await watcher.goto(`/projects/${ROOT}/pages/todos`);
  await stream;
  await expect(watcher.locator('section.todos')).toBeVisible();
  const url = page.url();
  await page.locator('[data-work-create]').click();
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
  await expect(page.locator('[data-history-feedback]')).toContainText('Created "Paint samples" was recorded in Paint samples’s history.');
  await expect(page.locator('[data-history-open]')).toHaveAttribute('href', `/projects/${child.id}`);
  await expect(watcher.locator(`[data-work-project-id="${child.id}"]`)).toBeVisible();
  await expect(watcher.locator(`[data-todo-id="${child.id}"]`)).toContainText('Workstream');

  await page.goto('/projects/project-cabinets');
  await page.locator('[data-work-create]').click();
  await expect(parentOf(page)).toHaveValue(ROOT);
  await parentOf(page).selectOption('project-kitchen');
  await expect(dialogOf(page)).toContainText('Inside Kitchen');
  await nameOf(page).fill('Cabinet hardware');
  const nestedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/projects'));
  await dialogOf(page).getByRole('button', { name: 'Create', exact: true }).click();
  const nested = ((await (await nestedResponse).json()) as ProjectWriteResult).project;
  expect((await api.get<Project>(`/api/projects/${nested.id}`)).parentProjectId).toBe('project-kitchen');
  await expect(page).toHaveURL(/\/projects\/project-cabinets$/);

  await page.locator('[data-work-create]').click();
  await parentOf(page).selectOption('project-garden');
  await api.patch('/api/projects/project-garden', { status: 'archived' });
  await expect(parentOf(page)).toHaveValue(ROOT);
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
  await page.locator('[data-work-create]').click();
  await parentOf(page).selectOption('project-cabinets');
  await nameOf(page).fill('Refused draft');
  const before = await projects();
  await api.patch('/api/projects/project-cabinets', { status: 'archived' });
  await dialogOf(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialogOf(page).getByRole('alert')).toContainText('archived');
  await expect(nameOf(page)).toHaveValue('Refused draft');
  await expect(parentOf(page)).toHaveValue('project-cabinets');
  expect((await projects()).length).toBe(before.length);
  expect(errors).toEqual([]);
});

test('a failed create keeps its draft and an archived root explains why the plus is unavailable', async ({ page }) => {
  await page.goto(`/projects/${ROOT}`);
  await page.locator('[data-work-create]').click();
  await nameOf(page).fill('Transport draft');
  await parentOf(page).selectOption('project-kitchen');
  const before = await projects();
  await page.route('**/api/projects', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'Create failed for this journey' }) })
    : route.fallback());
  await dialogOf(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialogOf(page).getByRole('alert')).toContainText('Create failed for this journey');
  await expect(nameOf(page)).toHaveValue('Transport draft');
  await expect(parentOf(page)).toHaveValue('project-kitchen');
  expect((await projects()).length).toBe(before.length);
  await page.unroute('**/api/projects');
  await dialogOf(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  const root = await createRoot('Archived scratch');
  await api.patch(`/api/projects/${root.id}`, { status: 'archived' });
  await page.goto(`/projects/${root.id}`);
  const plus = page.locator('[data-work-create]');
  await expect(plus).toHaveAttribute('aria-disabled', 'true');
  await expect(plus).toHaveAccessibleName('Add workstream — unavailable while Archived scratch is archived');
  await plus.focus();
  await expect(plus).toBeFocused();
  await plus.press('Enter');
  await expect(dialogOf(page)).toHaveCount(0);
});
