import type { OperationHistorySummary, ProjectPage, ProjectTodosResult, ProjectWriteResult } from '@cwm/contracts';
import { expect, test, type Page } from '@playwright/test';
import { historyControl, redoFromHeader, undoFromHeader } from './history-controls';
import { api, seed, setClock } from './seed';

const PERSONA_STORAGE_KEY = 'cwm.prototype.persona';
const NOW = '2026-09-15T12:00:00.000Z';

const rawGet = (persona: string, projectId: string): Promise<Response> =>
  fetch(`http://127.0.0.1:4310/api/projects/${projectId}`, {
    headers: { 'x-prototype-user': persona },
  });

test('project creation Undo and Redo recover roots and sub-projects at the same URL', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const browserErrors: string[] = [];
  const expectedMissingProjectIds = new Set<string>();
  const observeBrowser = (observed: Page): void => {
    observed.on('pageerror', (error) => browserErrors.push(error.message));
    observed.on('response', (response) => {
      if (response.status() !== 404) return;
      const url = new URL(response.url());
      const expected = response.request().method() === 'GET' && [...expectedMissingProjectIds].some((id) => {
        const projectPath = `/api/projects/${id}`;
        return url.pathname === projectPath || url.pathname.startsWith(`${projectPath}/`);
      });
      if (!expected) browserErrors.push(`Unexpected 404: ${response.url()}`);
    });
    observed.on('console', (message) => {
      if (message.type() !== 'error') return;
      // Chromium also reports handled fetch 404s as resource errors. The response listener above
      // checks that each response names one of this journey's intentionally absent projects.
      if (/^Failed to load resource: the server responded with a status of 404/.test(message.text())) return;
      browserErrors.push(message.text());
    });
  };
  observeBrowser(page);

  await seed('empty');
  await setClock(NOW);
  await page.goto('/app');
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');

  const rootCreatedResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/projects'));
  await page.locator('[data-new-project]').click();
  await page.locator('[data-create-project-name]').fill('Research prototype');
  await page.locator('[data-create-project-submit]').click();
  const rootResult = await (await rootCreatedResponse).json() as ProjectWriteResult;
  const root = rootResult.project;
  expectedMissingProjectIds.add(root.id);
  const rootOperation = rootResult.operation;
  if (rootOperation === null) throw new Error('Project creation did not return its operation receipt');
  expect(rootOperation).toMatchObject({ operation: 'project.add', label: 'Created "Research prototype"' });
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}$`));
  await expect(page.locator('[data-project-name]')).toHaveText('Research prototype');

  const rootPage = (await api.get<ProjectPage[]>(`/api/projects/${root.id}/pages`))[0]!;
  const rootSummary = await api.get<OperationHistorySummary>(`/api/projects/${root.id}/history`);
  expect(rootSummary.undo).toMatchObject({ operation: 'project.add', actionId: rootOperation.actionId });
  expect(rootSummary.revision).toBe(rootOperation.revision);

  await undoFromHeader(page, 'Created "Research prototype"');
  await expect(page.locator('[data-project-creation-recovery]')).toContainText('Creation undone');
  await expect(page.locator('[data-project-creation-recovery]')).toContainText('Research prototype');
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}$`));
  expect((await rawGet('user-demo', root.id)).status).toBe(404);
  const rootUndoSummary = await api.get<OperationHistorySummary>(`/api/projects/${root.id}/history`);
  expect(rootUndoSummary.redo).toMatchObject({ operation: 'project.add', actionId: rootOperation.actionId });
  await page.reload();
  await expect(page.locator('[data-project-creation-recovery]')).toContainText('Creation undone');
  await expect(historyControl(page, 'redo')).toHaveAttribute('aria-label', 'Redo: Created "Research prototype"');

  await redoFromHeader(page, 'Created "Research prototype"');
  await expect(page.locator('[data-project-name]')).toHaveText('Research prototype');
  expect((await api.get<ProjectPage[]>(`/api/projects/${root.id}/pages`)).map(({ id }) => id)).toEqual([rootPage!.id]);

  // Build the child through the root's visible Sub-Projects section. A second open browser page
  // proves the frame uses the root id and refreshes a tree that is already mounted.
  await page.locator('[data-empty-canvas-add]').click();
  await page.locator('[data-create-section-type]').selectOption('sub-projects');
  await page.locator('[data-create-section-submit]').click();
  const subProjectsFrame = page.locator('[data-section-frame][data-section-type="sub-projects"]');
  await expect(subProjectsFrame).toBeVisible();

  const watcher = await page.context().newPage();
  observeBrowser(watcher);
  const watcherStream = watcher.waitForResponse((response) => response.url().includes('/prototype/events') && response.status() === 200);
  await watcher.goto(`/projects/${root.id}`);
  await watcherStream;
  const watcherFrame = watcher.locator('[data-section-frame][data-section-type="sub-projects"]');

  const childCreatedResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/projects'));
  await subProjectsFrame.locator('input').fill('Field study');
  await subProjectsFrame.getByRole('button', { name: 'Create child' }).click();
  const childResult = await (await childCreatedResponse).json() as ProjectWriteResult;
  const child = childResult.project;
  expectedMissingProjectIds.add(child.id);
  const childOperation = childResult.operation;
  if (childOperation === null) throw new Error('Sub-project creation did not return its operation receipt');
  expect(child.kind).toBe('subproject');
  expect(child.parentProjectId).toBe(root.id);
  expect(childOperation).toMatchObject({ operation: 'project.add', label: 'Created "Field study"' });
  await expect(page.locator('[data-history-feedback]')).toContainText('recorded in Field study’s history');
  await expect(watcherFrame.getByRole('link', { name: /Field study/ })).toBeVisible();
  await page.locator('[data-history-open]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${child.id}$`));
  await expect(page.locator('[data-project-name]')).toHaveText('Field study');

  const childPage = (await api.get<ProjectPage[]>(`/api/projects/${child.id}/pages`))[0]!;
  const childSummary = await api.get<OperationHistorySummary>(`/api/projects/${child.id}/history`);
  expect(childSummary.undo).toMatchObject({ operation: 'project.add', actionId: childOperation.actionId });
  await undoFromHeader(page, 'Created "Field study"');
  await expect(page.locator('[data-project-creation-recovery]')).toContainText('Creation undone');
  await expect(page).toHaveURL(new RegExp(`/projects/${child.id}$`));
  expect((await rawGet('user-demo', child.id)).status).toBe(404);
  const childUndoSummary = await api.get<OperationHistorySummary>(`/api/projects/${child.id}/history`);
  expect(childUndoSummary.redo).toMatchObject({ operation: 'project.add', actionId: childOperation.actionId });
  await expect(watcherFrame.getByRole('link', { name: /Field study/ })).toHaveCount(0);

  const outsiderContext = await browser.newContext();
  await outsiderContext.addInitScript((key: string) => localStorage.setItem(key, 'user-alex'), PERSONA_STORAGE_KEY);
  const outsider = await outsiderContext.newPage();
  observeBrowser(outsider);
  await outsider.goto(`/projects/${child.id}`);
  await expect(outsider.locator('[data-identity-name]')).toHaveText('Alex');
  await expect(outsider.locator('[data-project-error]')).toContainText('not found');

  await page.reload();
  await expect(page.locator('[data-project-creation-recovery]')).toContainText('Creation undone');
  await expect(historyControl(page, 'redo')).toHaveAttribute('aria-label', 'Redo: Created "Field study"');
  await redoFromHeader(page, 'Created "Field study"');
  await expect(page.locator('[data-project-name]')).toHaveText('Field study');
  expect((await api.get<ProjectPage[]>(`/api/projects/${child.id}/pages`)).map(({ id }) => id)).toEqual([childPage!.id]);
  await expect(watcherFrame.getByRole('link', { name: /Field study/ })).toBeVisible();

  await undoFromHeader(page, 'Created "Field study"');
  await expect(page.locator('[data-project-creation-recovery]')).toContainText('Creation undone');
  await setClock(new Date(Date.parse(NOW) + 25 * 60 * 60 * 1000).toISOString());
  await page.reload();
  await expect(page.locator('[data-project-error]')).toContainText('not found');
  await expect(page.locator('[data-project-creation-recovery]')).toHaveCount(0);

  expect(browserErrors).toEqual([]);
  await outsiderContext.close();
  await watcher.close();
});

test('creation under a live sub-project refreshes the ancestor work, Todos and Archive projections', async ({ page }) => {
  test.setTimeout(180_000);
  const rootId = 'project-renovation';
  const parentId = 'project-kitchen';
  await seed('nested-projects');
  await setClock(NOW);

  const parentSections = await api.get<Array<{ type: string }>>(`/api/projects/${parentId}/sections`);
  if (!parentSections.some(({ type }) => type === 'sub-projects')) {
    await api.post(`/api/projects/${parentId}/sections`, { type: 'sub-projects' });
  }

  const watch = async (path: string): Promise<Page> => {
    const observed = await page.context().newPage();
    const stream = observed.waitForResponse((response) => response.url().includes('/prototype/events') && response.status() === 200);
    await observed.goto(path);
    await stream;
    return observed;
  };
  const rootWatcher = await watch(`/projects/${rootId}`);
  const parentWatcher = await watch(`/projects/${parentId}`);
  const todosWatcher = await watch(`/projects/${rootId}/pages/todos`);
  const archiveWatcher = await watch(`/projects/${rootId}/pages/archive`);

  await page.goto(`/projects/${parentId}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Kitchen');
  const parentFrame = page.locator('[data-section-frame][data-section-type="sub-projects"]');
  await expect(parentFrame).toBeVisible();

  const todosBefore = await api.get<ProjectTodosResult>(`/api/projects/${rootId}/todos`);
  const archiveBefore = await api.get(`/api/projects/${rootId}/archive`);
  const childCreatedResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/projects'));
  await parentFrame.locator('input').fill('Field study follow-up');
  await parentFrame.getByRole('button', { name: 'Create child' }).click();
  const childResult = await (await childCreatedResponse).json() as ProjectWriteResult;
  const child = childResult.project;
  expect(child.parentProjectId).toBe(parentId);
  expect(childResult.operation).toMatchObject({ operation: 'project.add', label: 'Created "Field study follow-up"' });

  await expect(rootWatcher.locator(`[data-work-project-id="${child.id}"]`)).toBeVisible();
  const parentWatcherFrame = parentWatcher.locator('[data-section-frame][data-section-type="sub-projects"]');
  await expect(parentWatcherFrame.getByRole('link', { name: /Field study follow-up/ })).toBeVisible();
  expect((await api.get<Array<{ id: string; parentProjectId?: string }>>('/api/projects'))
    .find(({ id }) => id === child.id)?.parentProjectId).toBe(parentId);
  const todosWithChild = await api.get<ProjectTodosResult>(`/api/projects/${rootId}/todos`);
  expect(todosWithChild.items.some((item) => item.kind === 'subproject' && item.project.id === child.id)).toBe(true);
  expect(await api.get(`/api/projects/${rootId}/archive`)).toEqual(archiveBefore);
  await expect(todosWatcher.locator('section.todos')).toBeVisible();
  await expect(archiveWatcher.locator('[data-archive-page]')).toBeVisible();

  await page.locator('[data-history-open]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${child.id}$`));
  await undoFromHeader(page, 'Created "Field study follow-up"');
  await expect(page.locator('[data-project-creation-recovery]')).toContainText('Creation undone');
  await expect(rootWatcher.locator(`[data-work-project-id="${child.id}"]`)).toHaveCount(0);
  await expect(parentWatcherFrame.getByRole('link', { name: /Field study follow-up/ })).toHaveCount(0);
  expect((await api.get<Array<{ id: string }>>('/api/projects')).some(({ id }) => id === child.id)).toBe(false);
  expect(await api.get<ProjectTodosResult>(`/api/projects/${rootId}/todos`)).toEqual(todosBefore);
  expect(await api.get(`/api/projects/${rootId}/archive`)).toEqual(archiveBefore);

  await redoFromHeader(page, 'Created "Field study follow-up"');
  await expect(page.locator('[data-project-name]')).toHaveText('Field study follow-up');
  await expect(rootWatcher.locator(`[data-work-project-id="${child.id}"]`)).toBeVisible();
  await expect(parentWatcherFrame.getByRole('link', { name: /Field study follow-up/ })).toBeVisible();
  expect((await api.get<Array<{ id: string; parentProjectId?: string }>>('/api/projects'))
    .find(({ id }) => id === child.id)?.parentProjectId).toBe(parentId);
  const todosAfterRedo = await api.get<ProjectTodosResult>(`/api/projects/${rootId}/todos`);
  expect(todosAfterRedo.items.some((item) => item.kind === 'subproject' && item.project.id === child.id)).toBe(true);
  expect(todosAfterRedo.items.filter((item) => item.kind !== 'subproject' || item.project.id !== child.id)).toEqual(todosBefore.items);
  expect(await api.get(`/api/projects/${rootId}/archive`)).toEqual(archiveBefore);

  await rootWatcher.close();
  await parentWatcher.close();
  await todosWatcher.close();
  await archiveWatcher.close();
});
