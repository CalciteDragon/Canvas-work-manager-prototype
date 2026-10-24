/** Slice 77: openable rows reach real owners without changing persisted placement state. */
import type { ProjectSection, Task, TaskWriteResult } from '@cwm/contracts';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addSection, addShortcut, api, createRoot, createSubprojects, seed, setClock, setLayout, setPageEnabled } from './seed';
import { configureContext } from './ux/isolation';

const NOW = '2026-10-01T12:00:00.000Z';
const addTask = async (projectId: string, sectionId: string, title: string) =>
  (await api.post<TaskWriteResult>('/api/tasks', {
    projectId, sectionId, title, startAt: '2026-09-28T12:00:00.000Z', dueAt: '2026-09-30T12:00:00.000Z',
  })).task;
const frameOf = (page: Page, id: string) => page.locator(`[id="section-${id}"]`);
const taskOf = (page: Page, id: string) => page.locator(`[data-task-row][data-task-id="${id}"]`);

async function ownerReached(page: Page, projectId: string, sectionId: string, taskId: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}(?:/pages/home)?#section-${sectionId}$`));
  const frame = frameOf(page, sectionId);
  await expect(frame.locator('[data-section-title]')).toBeFocused();
  await expect(frame.locator('[data-section-content]')).toBeVisible();
  await expect(taskOf(page, taskId)).toBeVisible();
  await expect(page.locator('[data-task-details]')).toHaveCount(0);
}

test.beforeEach(async ({ context }) => {
  if (process.env['UX_STATIC_ORIGIN']) await configureContext(context);
  await seed('nested-projects');
  await setClock(NOW);
});

for (const mode of ['mouse', 'keyboard', 'touch'] as const) {
  test.describe(`dashboard owner links by ${mode}`, () => {
    test.use({ viewport: mode === 'touch' ? { width: 375, height: 812 } : { width: 1440, height: 900 }, hasTouch: mode === 'touch' });
    test('opens an overdue task and reveals its collapsed owner without saving an expansion', async ({ page }) => {
      await seed('overdue-chaos');
      await setClock(NOW);
      const root = await createRoot(`Objects ${mode}`);
      const section = await addSection(root.id, { type: 'task-list', title: 'Collapsed owner' });
      const task = await addTask(root.id, section.id, `Open overdue with ${mode}`);
      await api.patch(`/api/sections/${section.id}`, { collapsed: true });
      await page.goto('/app');
      const link = page.locator('[data-widget-task]', { hasText: task.title }).getByRole('link', { name: task.title, exact: true });
      await expect(link).toHaveAttribute('href', `/projects/${root.id}/pages/home#section-${section.id}`);
      if (mode === 'keyboard') { await link.focus(); await page.keyboard.press('Enter'); }
      else if (mode === 'touch') await link.tap();
      else await link.click();
      await ownerReached(page, root.id, section.id, task.id);
      const persisted = await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections`);
      expect(persisted.find(item => item.id === section.id)?.collapsed).toBe(true);
      await page.reload();
      await ownerReached(page, root.id, section.id, task.id);
      await page.goto(`/projects/${root.id}/pages/home`);
      await expect(frameOf(page, section.id).locator('[data-section-content]')).toHaveCount(0);
    });
  });
}

test('Todos, descendant Timeline and shortcut titles open the canonical task section', async ({ page }) => {
  const root = await createRoot('Objects owner paths');
  const [child] = await createSubprojects(root.id, 1);
  const source = await addSection(child!.id, { type: 'task-list', title: 'Child tasks' });
  const task = await addTask(child!.id, source.id, 'One task, three owner links');
  const timeline = await addSection(root.id, { type: 'timeline', title: 'Whole tree dates' });
  await setPageEnabled(root.id, 'todos', true);
  const pages = await api.get<Array<{ id: string; kind: string }>>(`/api/projects/${root.id}/pages`);
  const shortcut = await addShortcut(root.id, { pageId: pages.find(item => item.kind === 'home')!.id, sourceSectionId: source.id });

  await page.goto(`/projects/${root.id}/pages/todos`);
  await page.locator(`[data-todo-id="${task.id}"] [data-todo-link]`).press('Enter');
  await ownerReached(page, child!.id, source.id, task.id);

  await page.goto(`/projects/${root.id}/pages/home`);
  const timelineFrame = frameOf(page, timeline.id);
  await expect(timelineFrame.locator('[data-timeline-details], [data-timeline-row] [aria-expanded]')).toHaveCount(0);
  await timelineFrame.locator(`[data-timeline-id="${task.id}"] a`).press('Enter');
  await ownerReached(page, child!.id, source.id, task.id);

  await page.goto(`/projects/${root.id}/pages/home`);
  const shortcutFrame = page.locator(`[data-shortcut-id="${shortcut.id}"] [data-shortcut-frame]`);
  await expect(shortcutFrame).toContainText('Read-only here. Open the source to change it.');
  await expect(shortcutFrame.locator('[data-task-complete], [data-task-delete]')).toHaveCount(0);
  await shortcutFrame.locator(`[data-task-id="${task.id}"] a`).click();
  await ownerReached(page, child!.id, source.id, task.id);
});

async function beginDrag(page: Page, title: Locator): Promise<void> {
  const box = await title.boundingBox();
  if (!box) throw new Error('Task title has no drag geometry');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 4 });
  await expect(page.locator('.cdk-drag-preview')).toBeVisible();
}

test('drag explains fixed ordering and still moves tasks between Task Lists', async ({ page }) => {
  const root = await createRoot('Objects drag');
  await setLayout(root.id, 'grid');
  const source = await addSection(root.id, { type: 'task-list', title: 'Source', columnSpan: 6 });
  const destination = await addSection(root.id, { type: 'task-list', title: 'Destination', columnSpan: 6 });
  const first = await addTask(root.id, source.id, 'First, then moved');
  const second = await addTask(root.id, source.id, 'Second stays here');
  const target = await addTask(root.id, destination.id, 'Destination anchor');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${root.id}/pages/home`);
  const sourceFrame = frameOf(page, source.id);
  const ids = () => sourceFrame.locator('[data-task-row]').evaluateAll(rows => rows.map(row => row.getAttribute('data-task-id')));
  await expect.poll(ids).toEqual([first.id, second.id]);
  await beginDrag(page, taskOf(page, first.id).locator('[data-task-title]'));
  await expect(sourceFrame.locator('[data-task-drag-hint]')).toContainText('Drop on another Task List to move it.');
  await expect(sourceFrame.locator('[data-task-drag-hint]')).toContainText(/Order within a list can.t be changed yet\./);
  const secondBox = await taskOf(page, second.id).boundingBox();
  if (!secondBox) throw new Error('Second task did not render');
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(sourceFrame.locator('[data-task-drag-hint]')).toHaveCount(0);
  await expect.poll(ids).toEqual([first.id, second.id]);
  expect((await api.get<Task>(`/api/tasks/${first.id}`)).sectionId).toBe(source.id);

  await beginDrag(page, taskOf(page, first.id).locator('[data-task-title]'));
  const targetBox = await taskOf(page, target.id).boundingBox();
  if (!targetBox) throw new Error('Destination task did not render');
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect.poll(async () => (await api.get<Task>(`/api/tasks/${first.id}`)).sectionId).toBe(destination.id);
  await expect(frameOf(page, destination.id).locator(`[data-task-id="${first.id}"]`)).toBeVisible();
  await expect(page.locator('[data-task-details]')).toHaveCount(0);
});
