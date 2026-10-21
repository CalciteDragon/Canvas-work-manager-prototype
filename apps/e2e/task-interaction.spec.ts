/** Slice 61: real native checkbox, selection, title draft and recovery journeys. */
import type { Task, TaskWriteResult } from '@cwm/contracts';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addSection, addShortcut, api, createRoot, createSubprojects, seed, setClock, setPageEnabled } from './seed';
import { redoFromHeader, undoFromHeader } from './history-controls';

const row = (page: Page, id: string) => page.locator(`[data-task-row][data-task-id="${id}"]`);
const todo = (page: Page, id: string) => page.locator(`[data-todo-id="${id}"]`);
const read = (id: string) => api.get<Task>(`/api/tasks/${id}`);
const changed = (page: Page, id: string) => page.waitForResponse((response) =>
  response.request().method() === 'PATCH' && response.url().endsWith(`/api/tasks/${id}`));
const complete = (id: string) => api.post(`/api/tasks/${id}/complete`, {});
const addTask = async (projectId: string, sectionId: string, title: string, status = 'todo') =>
  (await api.post<TaskWriteResult>('/api/tasks', { projectId, sectionId, title, status })).task;

const lab = async () => {
  const root = await createRoot('Reopen lab');
  await setPageEnabled(root.id, 'todos', true);
  await setPageEnabled(root.id, 'reflections', true);
  const tasks = await addSection(root.id, { type: 'task-list' });
  const reflections = await addSection(root.id, { type: 'reflections' });
  const a = await addTask(root.id, tasks.id, 'A');
  const b = await addTask(root.id, tasks.id, 'B');
  const c = await addTask(root.id, tasks.id, 'C');
  const d = await addTask(root.id, tasks.id, 'D', 'cancelled');
  return { root, tasks, reflections, a, b, c, d };
};

test.beforeEach(async () => {
  await seed('nested-projects');
  await setClock('2026-10-01T12:00:00.000Z');
});

for (const theme of ['dark', 'light'] as const) {
  test(`${theme}: task reopen persists, updates progress and reflections, and reverses exactly`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: theme });
    const { root, reflections, a } = await lab();
    const home = `/projects/${root.id}/pages/home`;
    await page.goto(home);
    await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const progress = page.locator('[data-project-progress]');
    const before = await progress.innerText();
    const completedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/tasks/${a.id}/complete`));
    await row(page, a.id).locator('[data-task-complete]').click();
    await completedResponse;
    await expect(progress).not.toHaveText(before);
    expect(Number.parseFloat(await progress.innerText())).toBeGreaterThan(Number.parseFloat(before));
    const completed = await read(a.id);
    expect(completed.completedAt).toBeDefined();
    await api.post('/api/reflections', { projectId: root.id, sectionId: reflections.id, body: 'A is finished', subject: { kind: 'task', id: a.id } });
    await page.goto(`/projects/${root.id}/pages/reflections`);
    const picker = page.locator('[data-reflections-subject-picker]');
    await expect(picker).toBeVisible();
    await expect(picker.locator(`[data-subject-id="${a.id}"]`)).toHaveCount(1);
    await expect(page.locator('[data-reflections-page]')).toContainText('About A · Done');
    await page.goto(home);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/tasks/${a.id}`, async (route) => {
      if (route.request().method() === 'PATCH') await gate;
      await route.continue();
    });
    const response = changed(page, a.id);
    await row(page, a.id).locator('[data-task-complete]').click();
    await expect(row(page, a.id).locator('[data-task-complete]')).not.toBeChecked();
    release();
    await response;
    await page.unroute(`**/api/tasks/${a.id}`);
    await page.reload();
    expect(await read(a.id)).toMatchObject({ status: 'todo' });
    expect(await read(a.id)).not.toHaveProperty('completedAt');
    await expect(progress).toHaveText(before);
    await undoFromHeader(page, /Undo: Updated "A"/);
    expect(await read(a.id)).toMatchObject({ status: 'done', completedAt: completed.completedAt });
    await expect(row(page, a.id).locator('[data-task-complete]')).toBeChecked();
    await redoFromHeader(page, /Redo: Updated "A"/);
    expect(await read(a.id)).not.toHaveProperty('completedAt');
    await expect(row(page, a.id).locator('[data-task-complete]')).not.toBeChecked();
    await page.goto(`/projects/${root.id}/pages/reflections`);
    await expect(picker).toBeVisible();
    await expect(picker.locator(`[data-subject-id="${a.id}"]`)).toHaveCount(0);
    await expect(page.locator('[data-reflections-page]')).toContainText('About A · Todo');
  });
}

test('refused reopen restores native checkboxes in Task List and Todos', async ({ page }) => {
  const { root, a } = await lab();
  await complete(a.id);
  await page.goto(`/projects/${root.id}/pages/home`);
  await page.route(`**/api/tasks/${a.id}`, (route) => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'conflict', message: 'Reopen refused for this journey' }) })
    : route.continue());
  await row(page, a.id).locator('[data-task-complete]').click();
  // Slice 75: on the row, beside the reverted checkbox.
  await expect(row(page, a.id).locator('[data-task-error]')).toContainText('Reopen refused');
  await expect(page.locator('[data-tasks-error]')).toHaveCount(0);
  await expect(row(page, a.id).locator('[data-task-complete]')).toBeChecked();
  expect((await read(a.id)).status).toBe('done');
  await page.unroute(`**/api/tasks/${a.id}`);
  await page.goto(`/projects/${root.id}/pages/todos`);
  await page.keyboard.press('Control+Shift+D');
  await page.locator('[data-panel-failure][data-rate="1"]').click();
  await page.locator('[data-dev-panel-close]').click();
  try {
    await todo(page, a.id).locator('[data-todo-toggle]').click();
    await expect(todo(page, a.id).locator('[data-todo-row-error]')).toBeVisible();
    await expect(todo(page, a.id).locator('[data-todo-toggle]')).toBeChecked();
  } finally {
    await page.keyboard.press('Control+Shift+D');
    await page.locator('[data-panel-failure][data-rate="0"]').click();
    await page.locator('[data-dev-panel-close]').click();
  }
  expect((await read(a.id)).status).toBe('done');
});

const spaceTwice = async (page: Page, toggle: Locator, id: string) => {
  await toggle.focus();
  const completed = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/tasks/${id}/complete`));
  await toggle.press('Space');
  await completed;
  await expect(toggle).toBeChecked();
  await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
  await expect(toggle).toBeFocused();
  const reopened = changed(page, id);
  await toggle.press('Space');
  await reopened;
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeFocused();
  expect(await read(id)).toMatchObject({ status: 'todo' });
  expect(await read(id)).not.toHaveProperty('completedAt');
};

test('Todos toggles persist, keep keyboard focus, and record descendant history in its owner', async ({ page }) => {
  const { root, a, b, d } = await lab();
  await page.goto(`/projects/${root.id}/pages/home`);
  await spaceTwice(page, row(page, a.id).locator('[data-task-complete]'), a.id);
  await complete(b.id);
  await page.goto(`/projects/${root.id}/pages/todos`);
  await todo(page, b.id).locator('[data-todo-toggle]').click();
  await expect(todo(page, b.id).locator('[data-todo-status]')).toHaveText('To do');
  await page.reload();
  expect(await read(b.id)).not.toHaveProperty('completedAt');
  await spaceTwice(page, todo(page, b.id).locator('[data-todo-toggle]'), b.id);
  await todo(page, b.id).locator('[data-todo-toggle]').click();
  await expect(todo(page, b.id).locator('[data-todo-status]')).toHaveText('Done');
  await expect.poll(async () => (await read(b.id)).completedAt).toBeDefined();
  await expect(todo(page, d.id).locator('[data-todo-toggle]')).toHaveCount(0);
  await page.goto('/projects/project-renovation/pages/todos');
  await todo(page, 'task-kitchen-completed').locator('[data-todo-toggle]').click();
  const title = (await read('task-kitchen-completed')).title;
  await expect(page.locator('[data-toast]:popover-open .toast__message')).toHaveText(`Updated “${title}”.`);
  await expect(page.locator('[data-todo-kind="subproject"] [data-todo-complete]')).not.toHaveCount(0);
  await page.locator('[data-toast]:popover-open [data-toast-open]').click();
  await undoFromHeader(page, new RegExp('Undo: Updated'));
  expect(await read('task-kitchen-completed')).toMatchObject({ status: 'done', completedAt: '2026-08-22T18:00:00.000Z' });
  await redoFromHeader(page, new RegExp('Redo: Updated'));
  expect(await read('task-kitchen-completed')).not.toHaveProperty('completedAt');
});

test('title and background selection, drawer drafts, focus return and read-only shortcuts', async ({ page }) => {
  const { root, a, b, c } = await lab();
  await page.goto(`/projects/${root.id}/pages/home`);
  await expect(page.locator('[data-task-details]')).toHaveCount(0);
  const aTitle = row(page, a.id).locator('[data-task-title]');
  await row(page, a.id).locator('[data-task-complete]').focus();
  await page.keyboard.press('Tab');
  await expect(aTitle).toBeFocused();
  await aTitle.press('Enter');
  await expect(aTitle).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-task-drawer] h2')).toBeFocused();
  const bTitle = row(page, b.id).locator('[data-task-title]');
  await bTitle.press('Space');
  const drawer = page.locator('[data-task-drawer]');
  await expect(drawer.locator('h2')).toHaveText('B');
  await row(page, b.id).locator('.task-row__metadata').click();
  await expect(drawer.locator('h2')).toHaveText('B');
  await row(page, a.id).locator('[data-task-complete]').click();
  await row(page, c.id).locator('[data-task-delete]').click();
  await expect(drawer.locator('h2')).toHaveText('B');
  const requests: string[] = [];
  page.on('request', (request) => { if (request.method() === 'PATCH' && request.url().includes('/api/tasks/')) requests.push(request.url()); });
  const box = (await aTitle.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(drawer.locator('h2')).toHaveText('B');
  expect(requests).toHaveLength(0);
  const editor = drawer.locator('[data-task-drawer-title]');
  await editor.fill('');
  await editor.press('Tab');
  await expect(drawer.getByRole('alert')).toContainText('A task title is required.');
  await editor.fill('Discarded');
  await editor.press('Escape');
  await expect(editor).toHaveValue('B');
  await expect(drawer).toBeVisible();
  expect(requests).toHaveLength(0);
  await editor.fill('Renamed B');
  const response = changed(page, b.id);
  await editor.press('Enter');
  await editor.press('Tab');
  await response;
  await expect(bTitle).toHaveText('Renamed B');
  expect(requests).toHaveLength(1);
  expect((await read(b.id)).title).toBe('Renamed B');
  await drawer.locator('[data-close-drawer]').press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(bTitle).toBeFocused();
  const [child] = await createSubprojects(root.id, 1);
  const list = await addSection(child!.id, { type: 'task-list' });
  await addTask(child!.id, list.id, 'Read only');
  const pages = await api.get<Array<{ id: string; kind: string }>>(`/api/projects/${root.id}/pages`);
  await addShortcut(root.id, { pageId: pages.find((item) => item.kind === 'home')!.id, sourceSectionId: list.id });
  await page.reload();
  const readonly = page.locator('[data-shortcut-frame] [data-task-row]');
  await expect(readonly).toHaveCount(1);
  await expect(readonly.locator('[data-task-complete], button[data-task-title], [data-task-delete]')).toHaveCount(0);
  await readonly.click();
  await expect(drawer).toHaveCount(0);
});
