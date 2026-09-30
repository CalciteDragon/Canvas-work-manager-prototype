import type { OperationHistorySummary, OperationHistoryTransitionResult, ReflectionAddResult, TaskAddResult } from '@cwm/contracts';
import { expect, test } from '@playwright/test';
import { addSection, api, connectMcp, createRoot, seed, setClock, setPageEnabled } from './seed';
import { undoFromHeader } from './history-controls';

const history = (projectId: string) => api.get<OperationHistorySummary>(`/api/projects/${projectId}/history`);
const step = async (projectId: string, direction: 'undo' | 'redo') => {
  const summary = await history(projectId);
  return api.post<OperationHistoryTransitionResult>(`/api/history/${summary.historyId}/transition`, {
    actionId: summary[direction]!.actionId, expectedRevision: summary.revision, direction,
  });
};

test('browser row commits record once and HTTP history updates Home, Todos, Archive and journal live', async ({ page, context }) => {
  await seed('empty');
  await setClock('2026-09-15T12:00:00.000Z');
  const root = await createRoot('Row history');
  await addSection(root.id, { type: 'task-list' });
  await addSection(root.id, { type: 'reflections' });
  await setPageEnabled(root.id, 'todos', true);
  await setPageEnabled(root.id, 'reflections', true);
  await setPageEnabled(root.id, 'archive', true);
  const baseline = (await history(root.id)).revision;
  await page.goto(`/projects/${root.id}`);
  await page.locator('[data-quick-task-title]').fill('First title');
  await page.locator('[data-quick-create] button[type="submit"]').click();
  await expect(page.locator('[data-task-title]')).toHaveText('First title');
  expect((await history(root.id)).revision).toBe(baseline + 1);

  await page.locator('[data-task-title]').click();
  await page.locator('[data-task-title-editor]').fill('Discarded draft');
  await page.locator('[data-task-title-editor]').press('Escape');
  await expect(page.locator('[data-task-title]')).toHaveText('First title');
  expect((await history(root.id)).revision).toBe(baseline + 1);
  await page.locator('[data-task-title]').click();
  await page.locator('[data-task-title-editor]').fill('Committed title');
  await page.locator('[data-task-title-editor]').press('Enter');
  await page.locator('[data-project-name]').click();
  await expect(page.locator('[data-task-title]')).toHaveText('Committed title');
  expect((await history(root.id)).revision).toBe(baseline + 2);
  await step(root.id, 'undo');
  await expect(page.locator('[data-task-title]')).toHaveText('First title');
  await step(root.id, 'redo');
  await expect(page.locator('[data-task-title]')).toHaveText('Committed title');

  const todos = await context.newPage();
  await todos.goto(`/projects/${root.id}/pages/todos`);
  await todos.locator('[data-todo-complete]').click();
  await expect(page.locator('[data-task-row]')).toHaveClass(/task-row--completed/);
  expect((await history(root.id)).revision).toBe(baseline + 5);
  await step(root.id, 'undo');
  await expect(page.locator('[data-task-row]')).not.toHaveClass(/task-row--completed/);
  await expect(todos.locator('[data-todo-complete]')).toBeEnabled();
  await step(root.id, 'redo');
  await expect(todos.locator('[data-todo-status]')).toHaveText('Done');

  const deleteTask = page.locator('[data-task-delete]');
  await deleteTask.focus();
  await deleteTask.press('Enter');
  await expect(page.locator('[data-task-row]')).toHaveCount(0);
  await expect(page.locator('[data-quick-task-title]')).toBeFocused();
  const recovery = page.locator('[data-task-delete-recovery]');
  await expect(recovery).toHaveAttribute('role', 'status');
  await expect(recovery).toContainText('Committed title');
  await expect(recovery).toContainText(/archived/i);
  await expect(recovery).toContainText('Archive');
  await expect(recovery).toContainText(/header Undo/i);
  await expect(page.locator('[data-task-delete-recovery] [data-history-undo]')).toHaveCount(0);
  const archive = await context.newPage();
  await archive.goto(`/projects/${root.id}/pages/archive`);
  await expect(archive.getByText('Committed title', { exact: true })).toBeVisible();
  await undoFromHeader(page, (await history(root.id)).undo!.label);
  await expect(page.locator('[data-task-title]')).toHaveText('Committed title');
  await expect(recovery).toHaveCount(0);
  await expect(archive.getByText('Committed title', { exact: true })).toHaveCount(0);
  await deleteTask.focus();
  await deleteTask.press('Space');
  await expect(page.locator('[data-task-row]')).toHaveCount(0);
  await expect(page.locator('[data-quick-task-title]')).toBeFocused();
  await expect(recovery).toContainText('Committed title');
  await expect(archive.getByText('Committed title', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  for (const theme of ['dark', 'light'] as const) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(recovery).toBeVisible();
    expect(await recovery.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
  await page.reload();
  await expect(recovery).toHaveCount(0);
  await archive.locator('[data-archived-item]').filter({ hasText: 'Committed title' }).locator('[data-archived-restore]').click();
  await expect(page.locator('[data-task-title]')).toHaveText('Committed title');
  await expect(recovery).toHaveCount(0);
  await expect(archive.getByText('Committed title', { exact: true })).toHaveCount(0);

  const beforeReflection = (await history(root.id)).revision;
  await page.locator('[data-reflection-body]').fill('Canvas reflection');
  await page.locator('[data-reflection-create] button[type="submit"]').click();
  await expect(page.locator('[data-reflection-entry]')).toContainText('Canvas reflection');
  expect((await history(root.id)).revision).toBe(beforeReflection + 1);
  await page.locator('[data-reflection-edit]').click();
  await page.locator('[data-reflection-edit-body]').fill('Unsaved reflection');
  await page.locator('[data-reflection-cancel]').click();
  expect((await history(root.id)).revision).toBe(beforeReflection + 1);
  await page.locator('[data-reflection-edit]').click();
  await page.locator('[data-reflection-edit-body]').fill('Edited reflection');
  await page.locator('[data-reflection-edit-form] button[type="submit"]').click();
  await expect(page.locator('[data-reflection-entry]')).toContainText('Edited reflection');
  expect((await history(root.id)).revision).toBe(beforeReflection + 2);
  await step(root.id, 'undo');
  await expect(page.locator('[data-reflection-entry]')).toContainText('Canvas reflection');

  const journal = await context.newPage();
  await journal.goto(`/projects/${root.id}/pages/reflections`);
  await journal.locator('[data-reflections-add-container]').click();
  await expect(journal.locator('[data-reflection-body]')).toBeVisible();
  const beforeJournal = (await history(root.id)).revision;
  await journal.locator('[data-reflection-body]').fill('Page reflection');
  await journal.locator('[data-reflection-create] button[type="submit"]').click();
  await expect(journal.locator('[data-reflections-entry]')).toHaveCount(2);
  expect((await history(root.id)).revision).toBe(beforeJournal + 1);
  await step(root.id, 'undo');
  await expect(journal.locator('[data-reflections-entry]')).toHaveCount(1);
  await step(root.id, 'redo');
  await expect(journal.locator('[data-reflections-entry]')).toHaveCount(2);
  await page.reload();
  await journal.reload();
  await expect(page.locator('[data-task-title]')).toHaveText('Committed title');
  await expect(journal.locator('[data-reflections-entry]')).toHaveCount(2);
});

test('agent compound history removes and restores containers in open Home and Reflections pages', async ({ page, context }) => {
  await seed('agent-heavy');
  await setClock('2026-09-15T12:00:00.000Z');
  const root = await createRoot('Compound history');
  const reflectionsPage = await setPageEnabled(root.id, 'reflections', true);
  await page.goto(`/projects/${root.id}`);
  await expect(page.locator('[data-empty-canvas-add]')).toBeVisible();
  const journal = await context.newPage();
  await journal.goto(`/projects/${root.id}/pages/reflections`);
  await expect(journal.locator('[data-reflections-no-container]')).toBeVisible();
  const client = await connectMcp('prototype-user-a-readwrite', 'row-history-live');
  try {
    for (const family of ['task', 'reflection'] as const) {
      const created = await client.callTool({ name: family === 'task' ? 'create_task' : 'add_reflection', arguments: {
        projectId: root.id,
        ...(family === 'task' ? { title: 'Agent task' } : { body: 'Agent reflection', pageId: reflectionsPage.id }),
      } });
      expect(created.isError).not.toBe(true);
      const result = created.structuredContent as unknown as TaskAddResult | ReflectionAddResult;
      const receipt = result.operation;
      if (family === 'task') await expect(page.locator('[data-task-title]')).toHaveText('Agent task');
      else await expect(journal.locator('[data-reflection-body]')).toBeVisible();
      for (const direction of ['undo', 'redo'] as const) {
        const read = await client.callTool({ name: 'get_operation_history', arguments: { projectId: root.id } });
        const summary = read.structuredContent as unknown as OperationHistorySummary;
        const transition = await client.callTool({ name: `${direction}_operation`, arguments: {
          historyId: receipt.historyId, actionId: receipt.actionId, expectedRevision: summary.revision,
        } });
        expect(transition.isError).not.toBe(true);
        if (family === 'task') await expect(page.locator('[data-task-row]')).toHaveCount(direction === 'undo' ? 0 : 1);
        else await expect(journal.locator('[data-reflection-body]')).toHaveCount(direction === 'undo' ? 0 : 1);
      }
    }
    await page.reload();
    await journal.reload();
    await expect(page.locator('[data-task-title]')).toHaveText('Agent task');
    await expect(journal.locator('[data-reflections-entry]')).toContainText('Agent reflection');
  } finally { await client.close(); }
});

test('Task List Delete refuses permission and transport failures without archive recovery feedback', async ({ page }) => {
  await seed('nested-projects');
  await setClock('2026-09-15T12:00:00.000Z');
  const root = await createRoot('Refused Task List Delete');
  await addSection(root.id, { type: 'task-list' });
  await page.goto(`/projects/${root.id}`);
  await page.locator('[data-quick-task-title]').fill('Keep this task');
  await page.locator('[data-quick-create] button[type="submit"]').click();
  await expect(page.locator('[data-task-title]')).toHaveText('Keep this task');
  const task = (await api.get<{ id: string }[]>(`/api/tasks?projectId=${root.id}`))[0]!;
  const path = `**/api/tasks/${task.id}/archive`;

  for (const failure of ['permission', 'transport'] as const) {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(path, async (route) => {
      await held;
      if (failure === 'permission') {
        await route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"forbidden"}' });
      } else await route.abort('failed');
    });
    await page.locator('[data-task-delete]').click();
    await expect(page.locator('[data-task-delete-recovery]')).toHaveCount(0);
    release();
    await expect(page.locator('[data-tasks-error]')).toBeVisible();
    await expect(page.locator('[data-task-title]')).toHaveText('Keep this task');
    await expect(page.locator('[data-task-delete-recovery]')).toHaveCount(0);
    await page.unroute(path);
  }
  expect((await api.get<{ archivedAt?: string }>(`/api/tasks/${task.id}`)).archivedAt).toBeUndefined();
});

test.describe('coarse pointer Task List Delete', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('touch Delete leaves its archive recovery cue at phone width', async ({ page }) => {
    await seed('nested-projects');
    const root = await createRoot('Touch Task List Delete');
    await addSection(root.id, { type: 'task-list' });
    await page.goto(`/projects/${root.id}`);
    await page.locator('[data-quick-task-title]').fill('Tap recovery task');
    await page.locator('[data-quick-create] button[type="submit"]').tap();
    await page.locator('[data-task-delete]').tap();
    await expect(page.locator('[data-task-row]')).toHaveCount(0);
    const recovery = page.locator('[data-task-delete-recovery]');
    await expect(recovery).toContainText('Tap recovery task');
    await expect(recovery).toContainText(/archived/i);
    expect(await recovery.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  });
});
