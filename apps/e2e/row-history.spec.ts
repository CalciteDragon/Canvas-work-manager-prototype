import type { OperationHistorySummary, OperationHistoryTransitionResult, ProjectPage, ReflectionAddResult, TaskAddResult } from '@cwm/contracts';
import { expect, test } from '@playwright/test';
import { addSection, api, connectMcp, createRoot, seed, setClock } from './seed';

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
  await api.patch(`/api/projects/${root.id}/pages/todos`, { enabled: true });
  await api.patch(`/api/projects/${root.id}/pages/reflections`, { enabled: true });
  await api.patch(`/api/projects/${root.id}/pages/archive`, { enabled: true });
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

  await page.locator('[data-task-archive]').click();
  await expect(page.locator('[data-task-row]')).toHaveCount(0);
  const archive = await context.newPage();
  await archive.goto(`/projects/${root.id}/pages/archive`);
  await expect(archive.getByText('Committed title', { exact: true })).toBeVisible();
  await step(root.id, 'undo');
  await expect(page.locator('[data-task-title]')).toHaveText('Committed title');
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
  const reflectionsPage = await api.patch<ProjectPage>(`/api/projects/${root.id}/pages/reflections`, { enabled: true });
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
