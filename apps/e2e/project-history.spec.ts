/**
 * Slice 41's acceptance: the project header's Undo and Redo, driven by the server summary, on every
 * project page (docs/decisions/2026-09-project-header-history-controls.md).
 */
import type { OperationHistorySummary, ProjectPage, ProjectSection, Task } from '@cwm/contracts';
import { expect, test, type Page } from '@playwright/test';
import { historyControl, historyFeedback, redoFromHeader, stepFromHeader, undoFromHeader } from './history-controls';
import { api, connectMcp, seed, setClock } from './seed';

const NOW = '2026-09-15T12:00:00.000Z';
const ROOT = 'project-renovation';
const HOME = 'page-project-renovation';

const summaryOf = (projectId: string) => api.get<OperationHistorySummary>(`/api/projects/${projectId}/history`);
const sectionsOf = (projectId: string, pageId: string) => api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${pageId}`);

/** Both controls exist, name the empty history, and are unavailable without leaving the tab order. */
const expectEmptyControls = async (page: Page, where: string) => {
  const undo = historyControl(page, 'undo');
  const redo = historyControl(page, 'redo');
  await expect(undo, where).toHaveAttribute('aria-label', 'Nothing to undo');
  await expect(redo, where).toHaveAttribute('aria-label', 'Nothing to redo');
  await expect(undo, where).toHaveAttribute('aria-disabled', 'true');
  await expect(redo, where).toHaveAttribute('aria-disabled', 'true');
};

test.beforeEach(async () => {
  await seed('nested-projects');
  await setClock(NOW);
});

test('1. both controls render on every project page, are reachable, and fit a phone width', async ({ page }) => {
  for (const url of [
    `/projects/${ROOT}`,
    `/projects/${ROOT}/pages/todos`,
    `/projects/${ROOT}/pages/archive`,
    `/projects/${ROOT}/pages/reflections`,
    '/projects/project-kitchen',
    '/projects/project-legacy',
    '/projects/project-legacy-child',
    // A sub-project has no Todos page: the shell falls back to its work canvas with an explanation.
    '/projects/project-kitchen/pages/todos',
  ]) {
    await page.goto(url);
    await expectEmptyControls(page, url);
    // 8. No surface but the header offers Undo.
    await expect(page.locator('[data-undo-action]'), url).toHaveCount(0);
  }

  // A root made through the sidebar: creation is not recorded, so its history is empty.
  await page.goto('/app');
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
  await page.locator('[data-new-project]').click();
  await page.locator('[data-create-project-name]').fill('Fresh root');
  await page.locator('[data-create-project-submit]').click();
  await expect(page.locator('[data-project-name]')).toHaveText('Fresh root');
  await expectEmptyControls(page, 'sidebar-created root');

  // Keyboard: Tab moves Undo → Redo → More, so both unavailable controls stay in the tab order.
  await historyControl(page, 'undo').focus();
  expect(await historyControl(page, 'undo').evaluate((element) => (element as HTMLElement).tabIndex)).toBe(0);
  await page.keyboard.press('Tab');
  await expect(historyControl(page, 'redo')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-project-more]')).toBeFocused();

  // Each box meets the hit target (--size-hit-target, 2.75rem), at a desktop and a phone width.
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(`/projects/${ROOT}`);
    await expectEmptyControls(page, `${width} px`);
    for (const direction of ['undo', 'redo'] as const) {
      const box = await historyControl(page, direction).boundingBox();
      expect(box!.width, `${direction} at ${width} px`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${direction} at ${width} px`).toBeGreaterThanOrEqual(44);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('2–3, 8. every family is undone and redone from the header, survives reload, and the notice offers no Undo', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(`/projects/${ROOT}`);
  await expectEmptyControls(page, 'seeded Home');
  const undoLabel = historyControl(page, 'undo');

  // Tasks: add, rename, complete, archive.
  const list = page.locator(`[data-section-item][data-section-id="section-project-renovation-tasks"]`);
  await list.locator('[data-quick-task-title]').fill('Order grout');
  await list.locator('[data-quick-create] button[type="submit"]').click();
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Created "Order grout"');
  await list.locator('[data-task-row]', { hasText: 'Order grout' }).locator('button[data-task-title]').click();
  // The row's text leaves with its title once the editor opens, so find the editor itself.
  await list.locator('[data-task-title-editor]').fill('Order tile grout');
  await list.locator('[data-task-title-editor]').press('Enter');
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Updated "Order tile grout"');
  const renamedRow = list.locator('[data-task-row]', { hasText: 'Order tile grout' });
  await renamedRow.locator('[data-task-complete]').click();
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Completed "Order tile grout"');
  await renamedRow.locator('[data-task-archive]').click();
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Archived "Order tile grout"');

  // Sections: resize, move, and remove a Rich Text section with prose.
  const progress = page.locator('[data-section-item][data-section-id="section-project-renovation-progress"]');
  const resize = progress.locator('app-section-resize-handle[data-edge="end"] [data-resize-handle]');
  await resize.focus();
  await resize.press('ArrowLeft');
  await resize.press('Enter');
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Updated the Progress section');
  await progress.locator('[data-section-drag-handle]').press('ArrowUp');
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Moved the Progress section');
  const brief = page.locator('[data-section-item][data-section-id="section-project-renovation-brief"]');
  await brief.locator('[data-section-remove]').click();
  await expect(brief).toHaveCount(0);
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Removed the Rich Text section');
  // 8. The recovery notice keeps Archive and says where Undo lives; it has no Undo of its own.
  await expect(page.locator('[data-recovery-message]')).toHaveText('Removed the Rich Text section. Undo is in the header.');
  await expect(page.locator('[data-recovery-notice] [data-open-archive]')).toBeVisible();
  await page.locator('[data-dismiss-recovery-notice]').click();

  // A Home shortcut: add through the contextual dialog, collapse, remove.
  await page.locator('app-insertion-point[data-insertion-point="end"] [data-insertion-point-button]').click();
  await page.locator('[data-create-shortcut-mode]').click();
  // The seed already places Kitchen's Task List on Home; Kitchen's Progress view is still free.
  const option = page.locator('[data-shortcut-source-option]').filter({ hasText: 'Kitchen' }).filter({ hasText: 'Progress' }).first();
  const created = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/projects/${ROOT}/shortcuts`));
  await option.locator('[data-shortcut-add]').click();
  const shortcutId = ((await (await created).json()) as { shortcut: { id: string } }).shortcut.id;
  await expect(page.locator('[data-section-create-dialog]')).toHaveCount(0);
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Added the Progress shortcut');
  const shortcut = page.locator(`[data-shortcut-item][data-shortcut-id="${shortcutId}"]`);
  await shortcut.locator('[data-shortcut-collapse]').click();
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Collapsed the Progress shortcut');
  await shortcut.locator('[data-shortcut-remove]').click();
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Removed the Progress shortcut');
  // A shortcut removal leaves nothing for Archive, so there is no notice at all.
  await expect(page.locator('[data-recovery-notice]')).toHaveCount(0);

  // The project itself, through the header's More menu.
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-rename-input]').fill('House renovation');
  await page.locator('[data-project-rename-submit]').click();
  await expect(page.locator('[data-project-name]')).toHaveText('House renovation');
  await expect(undoLabel).toHaveAttribute('aria-label', 'Undo: Renamed "Home renovation" to "House renovation"');
  await expect(page.locator('[data-undo-action]')).toHaveCount(0);

  const progressSpan = async () => (await sectionsOf(ROOT, HOME)).find(({ id }) => id === 'section-project-renovation-progress')?.columnSpan;
  const progressIndex = async () => (await sectionsOf(ROOT, HOME)).sort((a, b) => a.position - b.position).findIndex(({ id }) => id === 'section-project-renovation-progress');
  const originalIndex = 3;
  /** Where the page itself draws Progress among the canvas's sections. */
  const renderedProgressIndex = () => page.locator('[data-section-canvas] > [data-section-item]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-section-id')).indexOf('section-project-renovation-progress'));
  const steps: Array<{ label: string; undone: () => Promise<void>; redone: () => Promise<void> }> = [
    { label: 'Renamed "Home renovation" to "House renovation"',
      undone: () => expect(page.locator('[data-project-name]')).toHaveText('Home renovation'),
      redone: () => expect(page.locator('[data-project-name]')).toHaveText('House renovation') },
    { label: 'Removed the Progress shortcut',
      undone: () => expect(shortcut).toBeVisible(),
      redone: () => expect(shortcut).toHaveCount(0) },
    { label: 'Collapsed the Progress shortcut',
      undone: () => expect(shortcut.locator('[data-shortcut-collapse]')).toHaveAttribute('aria-expanded', 'true'),
      redone: () => expect(shortcut.locator('[data-shortcut-collapse]')).toHaveAttribute('aria-expanded', 'false') },
    { label: 'Added the Progress shortcut',
      undone: () => expect(shortcut).toHaveCount(0),
      redone: () => expect(shortcut).toBeVisible() },
    { label: 'Removed the Rich Text section',
      undone: () => expect(brief).toBeVisible(),
      redone: () => expect(brief).toHaveCount(0) },
    { label: 'Moved the Progress section',
      undone: async () => {
        await expect.poll(renderedProgressIndex).toBe(originalIndex);
        expect(await progressIndex()).toBe(originalIndex);
      },
      redone: async () => {
        await expect.poll(renderedProgressIndex).toBe(originalIndex - 1);
        expect(await progressIndex()).toBe(originalIndex - 1);
      } },
    { label: 'Updated the Progress section',
      undone: async () => {
        await expect(progress).toHaveClass(/section-canvas__item--span-12/);
        expect(await progressSpan()).toBe(12);
      },
      redone: async () => {
        await expect(progress).toHaveClass(/section-canvas__item--span-8/);
        expect(await progressSpan()).toBe(8);
      } },
    { label: 'Archived "Order tile grout"',
      undone: () => expect(list.locator('[data-task-row]', { hasText: 'Order tile grout' })).toBeVisible(),
      redone: () => expect(list.locator('[data-task-row]', { hasText: 'Order tile grout' })).toHaveCount(0) },
    { label: 'Completed "Order tile grout"',
      undone: () => expect(list.locator('[data-task-row]', { hasText: 'Order tile grout' }).locator('[data-task-complete]')).not.toBeChecked(),
      redone: () => expect(list.locator('[data-task-row]', { hasText: 'Order tile grout' }).locator('[data-task-complete]')).toBeChecked() },
    { label: 'Updated "Order tile grout"',
      undone: () => expect(list.locator('[data-task-row]', { hasText: 'Order grout' })).toBeVisible(),
      redone: () => expect(list.locator('[data-task-row]', { hasText: 'Order tile grout' })).toBeVisible() },
    { label: 'Created "Order grout"',
      undone: () => expect(list.locator('[data-task-row]', { hasText: 'grout' })).toHaveCount(0),
      redone: () => expect(list.locator('[data-task-row]', { hasText: 'Order grout' })).toBeVisible() },
  ];

  let revision = (await summaryOf(ROOT)).revision;
  for (const [index, step] of steps.entries()) {
    const { body } = await undoFromHeader(page, step.label);
    expect(body.summary.revision, step.label).toBe(revision + 1);
    revision = body.summary.revision;
    await step.undone();

    if (index === 2) {
      // 3. Reload and navigation show the same history, read while the header says it is loading.
      const expected = { undo: await historyControl(page, 'undo').getAttribute('aria-label'), redo: await historyControl(page, 'redo').getAttribute('aria-label') };
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route(`**/api/projects/${ROOT}/history`, async (route) => {
        await held;
        await route.continue().catch(() => undefined);
      });
      await page.reload();
      await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', 'Loading history…');
      release();
      await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', expected.undo!);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      for (const where of [`/projects/${ROOT}/pages/todos`, `/projects/${ROOT}`]) {
        await page.goto(where);
        await expect(historyControl(page, 'undo'), where).toHaveAttribute('aria-label', expected.undo!);
        await expect(historyControl(page, 'redo'), where).toHaveAttribute('aria-label', expected.redo!);
      }
    }
  }
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', 'Nothing to undo');

  for (const step of [...steps].reverse()) {
    const { body } = await redoFromHeader(page, step.label);
    expect(body.summary.revision, step.label).toBe(revision + 1);
    revision = body.summary.revision;
    await step.redone();
  }
  await expect(historyControl(page, 'redo')).toHaveAttribute('aria-label', 'Nothing to redo');
});

test('2. an optional page toggle is undone and redone from the header', async ({ page }) => {
  await seed('personal-workspace');
  // personal-workspace's one root has only its Home page record.
  const pages = await api.get<ProjectPage[]>('/api/projects/project-personal/pages');
  expect(pages.map(({ kind }) => kind)).toEqual(['home']);
  await page.goto('/projects/project-personal');
  await page.locator('[data-project-page-manager] summary').click();
  await page.locator('[data-page-toggle-kind="reflections"] input').click();
  const tab = page.locator('[data-project-page-tab][data-page-kind="reflections"]');
  await expect(tab).toBeVisible();
  const before = (await summaryOf('project-personal')).revision;
  const undone = await undoFromHeader(page, 'Enabled the reflections page');
  expect(undone.body.summary.revision).toBe(before + 1);
  await expect(tab).toHaveCount(0);
  const redone = await redoFromHeader(page, 'Enabled the reflections page');
  expect(redone.body.summary.revision).toBe(before + 2);
  await expect(tab).toBeVisible();
});

test('4. a write recorded in another project’s history says so, and its link leads to the step', async ({ page }) => {
  await page.goto(`/projects/${ROOT}/pages/todos`);
  await expectEmptyControls(page, 'Todos');
  const row = page.locator('[data-todo-row][data-todo-id="task-kitchen-appliances"]');
  await row.locator('[data-todo-complete]').click();
  await expect(historyFeedback(page)).toHaveText('Completed "Choose appliance finishes" was recorded in Kitchen’s history.');
  await expectEmptyControls(page, 'Todos after a cross-owner write');

  await page.locator('[data-history-open]').click();
  await expect(page).toHaveURL(/\/projects\/project-kitchen$/);
  await undoFromHeader(page, 'Completed "Choose appliance finishes"');
  await expect.poll(async () => (await api.get<Task>('/api/tasks/task-kitchen-appliances')).status).toBe('todo');
});

test('5. archiving from the header stays on the project with its Undo, and an archived ancestor blocks', async ({ page }) => {
  await page.goto('/projects/project-garden');
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-archive]').click();
  await page.locator('[data-project-archive-confirm-yes]').click();
  await expect(page).toHaveURL(/\/projects\/project-garden$/);
  await expect(page.locator('[data-project-status]')).toHaveText(/archived/i);
  await expect(historyFeedback(page)).toHaveText('Garden is archived. Undo is available here.');
  await page.locator('[data-project-more]').click();
  await expect(page.locator('[data-project-archive]')).toHaveCount(0);
  await page.locator('[data-project-more]').click();
  // Enabled even though the summary's project-level blocker names Garden itself.
  expect((await summaryOf('project-garden')).blockedBy?.projectId).toBe('project-garden');
  await undoFromHeader(page, 'Archived "Garden"');
  await expect(page.locator('[data-project-status]')).toHaveText(/completed/i);
  expect(await api.get<{ status: string; completedAt?: string }>('/api/projects/project-garden')).toMatchObject({
    status: 'completed', completedAt: '2026-08-22T17:00:00.000Z',
  });

  // A rename checks no ancestry, so it records under the archived Legacy attic — and is blocked by it.
  await api.patch('/api/projects/project-legacy-child', { name: 'Legacy shelving, renamed' });
  await page.goto('/projects/project-legacy-child');
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', 'Undo unavailable while Legacy attic is archived');
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-disabled', 'true');
  await expect(historyControl(page, 'redo')).toHaveAttribute('aria-label', 'Nothing to redo');
});

test('6. controls are pending through a write and its re-read, and a stale tab is refused and reconciles', async ({ page }) => {
  await page.goto(`/projects/${ROOT}`);
  await expectEmptyControls(page, 'Home');
  const progress = page.locator('[data-section-item][data-section-id="section-project-renovation-progress"]');

  // Hold the section write: both controls stay unavailable until the summary read after it lands.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/sections/section-project-renovation-progress', async (route) => {
    if (route.request().method() === 'PATCH') await held;
    await route.continue();
  });
  // …and hold the summary read that follows, so the window after the write's response is visible.
  let releaseRead!: () => void;
  const readHeld = new Promise<void>((resolve) => { releaseRead = resolve; });
  await page.route(`**/api/projects/${ROOT}/history`, async (route) => {
    await readHeld;
    await route.continue().catch(() => undefined);
  });
  const writeAnswered = page.waitForResponse((response) =>
    response.request().method() === 'PATCH' && response.url().endsWith('/api/sections/section-project-renovation-progress'));
  await progress.locator('[data-section-collapse]').click();
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-disabled', 'true');
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', 'Saving a change…');
  await expect(historyControl(page, 'redo')).toHaveAttribute('aria-disabled', 'true');
  release();
  await writeAnswered;
  // The write has answered; its re-read has not. The controls must not offer the pre-write state.
  await expect(progress.locator('[data-section-collapse]')).toHaveAttribute('aria-expanded', 'false');
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', 'Saving a change…');
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-disabled', 'true');
  releaseRead();
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', 'Undo: Updated the Progress section');
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // Two tabs on one history.
  const tabB = await page.context().newPage();
  try {
    await tabB.goto(`/projects/${ROOT}`);
    await expect(historyControl(tabB, 'undo')).toHaveAttribute('aria-label', 'Undo: Updated the Progress section');
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    // Holds tab B's summary reads at the pre-Undo revision until released; a read released after
    // the tab moved on may find its route already settled, which is not this journey's concern.
    await tabB.route(`**/api/projects/${ROOT}/history`, async (route) => {
      await gate;
      await route.continue().catch(() => undefined);
    });

    await undoFromHeader(page, 'Updated the Progress section');
    const refused = await stepFromHeader(tabB, 'undo', 'Updated the Progress section');
    expect(refused.response.status()).toBe(409);
    expect((refused.body as unknown as { details: { reason: string } }).details.reason).toBe('history_revision_stale');
    await expect(historyFeedback(tabB)).toContainText('history changed elsewhere');
    open();
    for (const direction of ['undo', 'redo'] as const) {
      await expect(historyControl(tabB, direction)).toHaveAttribute('aria-label', (await historyControl(page, direction).getAttribute('aria-label'))!);
    }
    await tabB.unrouteAll({ behavior: 'ignoreErrors' });
  } finally {
    await tabB.close();
  }

  // An agent's write lands in the agent's own history: the person's labels do not change.
  const before = { undo: await historyControl(page, 'undo').getAttribute('aria-label'), redo: await historyControl(page, 'redo').getAttribute('aria-label') };
  const client = await connectMcp('prototype-user-a-readwrite', 'cwm-slice-41-agent');
  try {
    const written = await client.callTool({ name: 'update_section', arguments: { sectionId: 'section-project-renovation-brief', config: { text: 'An agent’s plan.' } } });
    expect(written.isError).not.toBe(true);
  } finally {
    await client.close();
  }
  await expect(page.locator('[data-section-item][data-section-id="section-project-renovation-brief"] [data-rich-text-body]')).toHaveValue('An agent’s plan.');
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', before.undo!);
  await expect(historyControl(page, 'redo')).toHaveAttribute('aria-label', before.redo!);
});

test('7. a conflicting later edit refuses with its subject and next step, and expiry empties the history', async ({ page }) => {
  await page.goto(`/projects/${ROOT}`);
  const list = page.locator('[data-section-item][data-section-id="section-project-renovation-tasks"]');
  await list.locator('[data-task-row]', { hasText: 'Call the salvage yard' }).locator('button[data-task-title]').click();
  await list.locator('[data-task-title-editor]').fill('Call the reclamation yard');
  await list.locator('[data-task-title-editor]').press('Enter');
  const label = 'Updated "Call the reclamation yard"';
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', `Undo: ${label}`);

  // Another actor renames the same task after them. The plan named a second persona, but every seed
  // gives each persona its own workspace, so the person's agent connection is the other actor here.
  const client = await connectMcp('prototype-user-a-readwrite', 'cwm-slice-41-conflict');
  try {
    const renamed = await client.callTool({ name: 'update_task', arguments: { taskId: 'task-renovation-undated', title: 'Call the yard (agent)' } });
    expect(renamed.isError).not.toBe(true);
  } finally {
    await client.close();
  }
  await expect(list.locator('[data-task-row]', { hasText: 'Call the yard (agent)' })).toBeVisible();

  await undoFromHeader(page, label);
  await expect(page.locator('[data-history-conflict]')).toHaveCount(1);
  await expect(page.locator('[data-history-conflict]')).toContainText('Call the yard (agent)');
  await expect(page.locator('[data-history-conflict]')).toContainText('Make the change again by hand.');

  // Twenty-five hours on: the clock change reloads the host, and nothing is offered any more.
  await setClock('2026-09-16T13:00:00.000Z');
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', 'Nothing to undo');
  await expect(historyControl(page, 'redo')).toHaveAttribute('aria-label', 'Nothing to redo');
});
