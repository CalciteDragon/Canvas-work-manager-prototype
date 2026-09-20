import { expect, test } from '@playwright/test';
import { PROTOTYPE_HOST, api as requestApi, seed, setClock } from './seed';

/**
 * §69's web path: load a seed, create a project, create a task, see it on the dashboard —
 * then remove the list that holds it and put both back from the root Archive page.
 *
 * The clock is pinned to **mid-day UTC** and the due date is a **hard-coded** `YYYY-MM-DD`
 * matching it. The drawer writes `${date}T23:59:59.999Z` and `DashboardService` compares
 * UTC days, so a date derived from `new Date()` on a machine west of UTC would land the
 * task in Overdue instead of Today. Mid-day keeps the two unambiguous.
 */
const PINNED_NOW = '2026-09-15T12:00:00.000Z';
const DUE_DATE = '2026-09-15';

test('create a project, add a task list, add a task, and see it on Today', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);

  await page.goto('/app');

  // Wait for the persona, not merely for the page. The sidebar renders "No projects yet"
  // and offers **New project** before `/api/me` has answered, and creating a project needs
  // the workspace that answer carries — so clicking too early gets the store's honest
  // "there is nowhere to put it" instead of a project.
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');

  // The empty seed has no projects at all — the state §81's "create project" starts from.
  await expect(page.locator('[data-projects-empty]')).toHaveText('No projects yet');

  await page.locator('[data-new-project]').click();
  await page.locator('[data-create-project-name]').fill('Prototype review');
  await page.locator('[data-create-project-submit]').click();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.locator('[data-project-name]')).toHaveText('Prototype review');
  await expect(page.locator('[data-project-status]')).toHaveText('planning');
  await expect(page.locator('[data-project]')).toHaveText('Prototype review');

  // Slice 25.7's optional renderer is a persisted page capability, not a second canvas. Enable
  // it through the host, visit the canonical route, and return to Home before continuing the
  // existing task/archive journey.
  const projectId = new URL(page.url()).pathname.split('/').at(-1)!;
  const enabled = await page.request.patch(`${PROTOTYPE_HOST}/api/projects/${projectId}/pages/reflections`, {
    headers: { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' },
    data: { enabled: true },
  });
  expect(enabled.ok()).toBe(true);
  await page.goto(`/projects/${projectId}/pages/reflections`);
  await expect(page.locator('[data-reflections-page]')).toBeVisible();
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Prototype review');

  // Slice 27 creates the first section from the empty canvas itself; task entry remains
  // available inside the section without enabling a separate layout mode.
  await page.locator('[data-empty-canvas-add]').click();
  await page.locator('[data-create-section-type]').selectOption('task-list');
  await page.locator('[data-create-section-submit]').click();
  await expect(page.locator('[data-section-frame][data-section-type="task-list"]')).toBeVisible();

  await page.locator('[data-quick-task-title]').fill('Write the walkthrough');
  await page.locator('[data-quick-create] button[type="submit"]').click();
  await expect(page.locator('[data-task-row]')).toHaveCount(1);

  await page.locator('[data-task-details]').first().click();
  await expect(page.locator('[data-task-drawer]')).toBeVisible();
  await page.locator('[data-task-due-date]').fill(DUE_DATE);

  // Wait for the write to land before navigating. `fill` dispatches the `change` the drawer
  // binds, but `page.goto` cancels in-flight fetches from the old document — so without this
  // the assertion below races the PATCH that makes it true. The row is the drawer's own
  // read-back, so seeing the date there means the store has the server's record.
  await expect(page.locator('[data-task-row]').first()).toContainText(DUE_DATE);

  await page.goto('/app');
  const today = page.locator('app-dashboard-widget-frame', {
    has: page.locator('[data-widget-title]:text-is("Today")'),
  });
  await expect(today.locator('[data-widget-task]')).toContainText('Write the walkthrough');

  // Removing the project's **only** container and restoring it is the case that decided
  // this design: under the rejected alternative, restoring a row had to invent somewhere to
  // put it. Here the section comes back and the row comes back with it.
  await page.locator('[data-project]').click();
  await expect(page.locator('[data-task-row]')).toHaveCount(1);

  await page.locator('[data-section-remove]').click();
  // A container still holding live rows asks what should happen to them.
  await page.locator('[data-section-removal-cascade]').click();
  await expect(page.locator('[data-section-frame][data-section-type="task-list"]')).toHaveCount(0);

  // Archive is root-wide. The project menu can enable and open it even though this fixture
  // never enabled the optional tab.
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-open-archive]').click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pages\/archive$/);
  await expect(page.locator('[data-archive-page]')).toBeVisible();
  await expect(page.locator('[data-archived-item][data-archived-kind="section"]')).toContainText('Task List');
  await expect(page.locator('[data-archived-cascade-count]')).toHaveText('1 task restores with this section');

  await page.locator('[data-archived-item][data-archived-kind="section"] [data-archived-restore]').click();

  // The canonical section restore repaints Archive, and the next root navigation reads the
  // section and its exact cascade member back onto the canvas.
  await expect(page.locator('[data-archived-item]')).toHaveCount(0);
  await page.locator('[data-project-nav-root]').click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(page.locator('[data-section-frame][data-section-type="task-list"]')).toBeVisible();
  await expect(page.locator('[data-task-row]')).toContainText('Write the walkthrough');
});

const SHOWCASE_ROOT = 'project-renovation';
const SHOWCASE_HOME = 'page-project-renovation';
const SHOWCASE_KITCHEN = 'project-kitchen';
const SHOWCASE_LEGACY = 'project-legacy';
const SHOWCASE_LEGACY_CHILD = 'project-legacy-child';

const todoId = (item: { kind: 'task' | 'subproject'; task?: { id: string }; project?: { id: string } }): string =>
  item.kind === 'task' ? item.task!.id : item.project!.id;

test('nested-projects is a coherent multi-page showcase across chronology, shortcuts, journal, archive and reload', async ({
  page,
}) => {
  await seed('nested-projects');
  await setClock(PINNED_NOW);

  await page.goto(`/projects/${SHOWCASE_ROOT}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
  await expect(page.locator('[data-project-page-tab]')).toHaveCount(4);
  expect(await page.locator('[data-project-page-tab]').evaluateAll((tabs) => tabs.map((tab) => tab.dataset['pageKind']))).toEqual([
    'home',
    'todos',
    'archive',
    'reflections',
  ]);
  await expect(page.locator('[data-work-project-id="project-kitchen"]')).toBeVisible();
  await expect(page.locator('[data-work-project-id="project-kitchen"] [data-work-project-id="project-cabinets"]')).toBeVisible();
  await expect(page.locator('[data-shortcut-frame]')).toHaveCount(4);
  await expect(page.locator('[data-section-item]')).toHaveCount(7);

  // The committed seed, not a test-only fixture, drives the exact chronology. The equality at
  // 23:59:59.999Z includes Kitchen (a date-only unit) and two tasks, then ids settle the tasks.
  const todos = await requestApi.get<{
    items: Array<{ kind: 'task' | 'subproject'; task?: { id: string }; project?: { id: string } }>;
  }>(`/api/projects/${SHOWCASE_ROOT}/todos`);
  expect(todos.items.map(todoId)).toEqual([
    'task-renovation-budget',
    'project-kitchen',
    'task-renovation-done',
    'task-renovation-equal-a',
    'task-renovation-equal-z',
    'task-renovation-cancelled',
    'task-kitchen-appliances',
    'project-cabinets',
    'project-garden',
    'task-garden-plan',
    'task-kitchen-completed',
    'task-renovation-undated',
  ]);

  await page.goto(`/projects/${SHOWCASE_ROOT}/pages/todos`);
  await expect(page.locator('[data-todo-row]')).toHaveCount(todos.items.length);
  expect(await page.locator('[data-todo-row]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-todo-id')))).toEqual(
    todos.items.map(todoId),
  );

  await page.locator('[data-todo-link]', { hasText: 'Choose appliance finishes' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${SHOWCASE_KITCHEN}#section-section-project-kitchen-tasks$`));
  await expect(page.locator('[data-project-name]')).toHaveText('Kitchen');

  // A nested source is updated through its canonical row while the Home aggregate stays open.
  // Removing the placement later must not remove or duplicate that source data.
  const sourceSnapshot = async () => ({
    sections: await requestApi.get<unknown[]>(`/api/projects/${SHOWCASE_KITCHEN}/sections?pageId=page-${SHOWCASE_KITCHEN}`),
    tasks: await requestApi.get<unknown[]>(`/api/tasks?projectId=${SHOWCASE_KITCHEN}&includeArchived=true`),
    shortcuts: await requestApi.get<unknown[]>(`/api/projects/${SHOWCASE_ROOT}/shortcuts?pageId=${SHOWCASE_HOME}`),
  });
  await page.goto(`/projects/${SHOWCASE_ROOT}`);
  const kitchenShortcut = page.locator('[data-shortcut-frame]', { hasText: 'Choose appliance finishes' });
  await expect(kitchenShortcut).toBeVisible();
  const beforeComplete = await sourceSnapshot();
  await requestApi.post(`/api/tasks/task-kitchen-appliances/complete`, undefined);
  await expect(kitchenShortcut.locator('[data-task-row]').filter({ hasText: 'Choose appliance finishes' })).toHaveClass(/task-row--completed/, { timeout: 15_000 });
  const afterComplete = await sourceSnapshot();
  expect(afterComplete.sections).toEqual(beforeComplete.sections);
  expect(afterComplete.shortcuts).toEqual(beforeComplete.shortcuts);

  await kitchenShortcut.locator('[data-shortcut-remove]').click();
  await expect(page.locator('[data-shortcut-frame]', { hasText: 'Choose appliance finishes' })).toHaveCount(0);
  const afterRemove = await sourceSnapshot();
  expect(afterRemove.sections).toEqual(afterComplete.sections);
  expect(afterRemove.tasks).toEqual(afterComplete.tasks);
  expect(afterRemove.shortcuts).toHaveLength((afterComplete.shortcuts as unknown[]).length - 1);

  // The seeded Reflections page combines general history with linked completed work. A new
  // linked entry remains attached to its canonical subject when that subject is reopened.
  await page.goto(`/projects/${SHOWCASE_ROOT}/pages/reflections`);
  await expect(page.locator('[data-reflections-entry]')).toHaveCount(3);
  await requestApi.post(`/api/tasks/task-renovation-budget/complete`, undefined);
  const newReflection = (await requestApi.post<{ reflection: { id: string } }>(`/api/reflections`, {
    projectId: SHOWCASE_ROOT,
    sectionId: 'section-project-renovation-reflections-page',
    subject: { kind: 'task', id: 'task-renovation-budget' },
    title: 'Budget checkpoint',
    body: 'The budget is ready for review.',
  })).reflection;
  await expect(page.locator(`[data-reflections-entry][data-reflection-id="${newReflection.id}"]`)).toContainText('Budget checkpoint');
  await requestApi.patch(`/api/tasks/task-renovation-budget`, { status: 'todo' });
  await expect(page.locator(`[data-reflections-entry][data-reflection-id="${newReflection.id}"] [data-reflections-subject]`)).toContainText('Todo');

  // Restore directly archived rows and then the archived ancestor. Restoring the ancestor
  // makes the still-live Legacy shelving visible again; it does not rewrite that child.
  await page.goto(`/projects/${SHOWCASE_ROOT}/pages/archive`);
  await expect(page.locator('[data-archived-item][data-archived-id="task-renovation-archived"]')).toBeVisible();
  await expect(page.locator(`[data-archived-item][data-archived-id="${SHOWCASE_LEGACY}"]`)).toBeVisible();
  await expect(page.locator(`[data-archived-item][data-archived-id="${SHOWCASE_LEGACY_CHILD}"]`)).toContainText('Hidden by an archived project');
  await page.locator('[data-archived-item][data-archived-id="task-renovation-archived"] [data-archived-restore]').click();
  await expect(page.locator('[data-archived-item][data-archived-id="task-renovation-archived"]')).toHaveCount(0);
  await page.locator('[data-archived-item][data-archived-id="section-project-renovation-archived-notes"] [data-archived-restore]').click();
  await expect(page.locator('[data-archived-item][data-archived-id="section-project-renovation-archived-notes"]')).toHaveCount(0);
  await page.locator(`[data-archived-item][data-archived-id="${SHOWCASE_LEGACY}"] [data-archived-restore]`).click();
  await expect(page.locator(`[data-archived-item][data-archived-id="${SHOWCASE_LEGACY}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-archived-item][data-archived-id="${SHOWCASE_LEGACY_CHILD}"]`)).toHaveCount(0);
  expect((await requestApi.get<{ status: string }>(`/api/projects/${SHOWCASE_LEGACY}`)).status).toBe('active');
  expect((await requestApi.get<{ status: string }>(`/api/projects/${SHOWCASE_LEGACY_CHILD}`)).status).toBe('active');

  await page.reload();
  await expect(page.locator('[data-archive-page]')).toBeVisible();
  await expect(page.locator('[data-archived-item][data-archived-id="task-renovation-archived"]')).toHaveCount(0);
});

test('a person can manage optional pages, re-enable a disabled route, and keep the manager root-scoped', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  await page.goto('/app');
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
  await page.locator('[data-new-project]').click();
  await page.locator('[data-create-project-name]').fill('Page management journey');
  await page.locator('[data-create-project-submit]').click();
  await expect(page.locator('[data-project-name]')).toHaveText('Page management journey');
  const projectId = new URL(page.url()).pathname.split('/').at(-1)!;

  await expect(page.locator('[data-project-page-tab]')).toHaveCount(1);
  await expect(page.locator('[data-project-page-tab][data-page-kind="home"]')).toBeVisible();
  await expect(page.locator('[data-page-toggle-kind="home"] input')).toBeDisabled();
  for (const kind of ['todos', 'archive', 'reflections'] as const) {
    await expect(page.locator(`[data-page-toggle-kind="${kind}"] input`)).not.toBeChecked();
  }

  const pageToggle = (kind: 'todos' | 'archive' | 'reflections') => page.locator(`[data-page-toggle-kind="${kind}"] input`);
  const pageRecord = async (kind: string) => {
    const pages = await requestApi.get<Array<{ kind: string; enabled: boolean }>>(`/api/projects/${projectId}/pages`);
    return pages.find((candidate) => candidate.kind === kind);
  };

  const manager = page.locator('[data-project-page-manager]');
  await manager.locator('summary').click();
  for (const kind of ['todos', 'archive', 'reflections'] as const) {
    await pageToggle(kind).click();
    await expect(pageToggle(kind)).toBeChecked();
    await expect(page.locator(`[data-project-page-tab][data-page-kind="${kind}"]`)).toBeVisible();
    await expect.poll(async () => (await pageRecord(kind))?.enabled).toBe(true);
  }

  await pageToggle('todos').click();
  await expect(pageToggle('todos')).not.toBeChecked();
  await expect(page.locator('[data-project-page-tab][data-page-kind="todos"]')).toHaveCount(0);
  await expect.poll(async () => (await pageRecord('todos'))?.enabled).toBe(false);
  await page.reload();
  await expect(pageToggle('todos')).not.toBeChecked();
  await manager.locator('summary').click();
  await pageToggle('todos').click();
  await expect(pageToggle('todos')).toBeChecked();
  await page.reload();
  await expect(page.locator('[data-project-page-tab][data-page-kind="todos"]')).toBeVisible();

  await manager.locator('summary').click();
  await pageToggle('reflections').click();
  await expect(page.locator('[data-project-page-tab][data-page-kind="reflections"]')).toHaveCount(0);
  await page.goto(`/projects/${projectId}/pages/reflections`);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/pages/home$`));
  await expect(page.locator('[data-page-notice-enable]')).toHaveText('Enable Reflections');
  await page.locator('[data-page-notice-enable]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/pages/reflections$`));
  await expect(page.locator('[data-reflections-page]')).toBeVisible();

  const workspace = await requestApi.get<{ workspace: { id: string } }>('/api/me');
  const child = await requestApi.post<{ id: string }>('/api/projects', {
    workspaceId: workspace.workspace.id,
    kind: 'subproject',
    parentProjectId: projectId,
    name: 'Child unit',
  });
  const grandchild = await requestApi.post<{ id: string }>('/api/projects', {
    workspaceId: workspace.workspace.id,
    kind: 'subproject',
    parentProjectId: child.id,
    name: 'Nested unit',
  });
  await page.goto(`/projects/${grandchild.id}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Nested unit');
  await expect(page.locator('[data-project-nav-root]')).toContainText('Page management journey');
  await expect(page.locator('[data-project-page-manager]')).toBeVisible();
  await expect(page.locator('[data-page-toggle-kind="work"]')).toHaveCount(0);
  await expect(page.locator('[data-page-toggle-kind="home"] input')).toBeDisabled();

  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-description-input]').fill('A nested unit with an explicit handoff.');
  await page.locator('[data-project-description-submit]').click();
  await expect(page.locator('[data-project-description]')).toHaveText('A nested unit with an explicit handoff.');
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-target-date-input]').fill('2026-10-02');
  await page.locator('[data-project-target-date-submit]').click();
  await expect(page.locator('[data-project-target-date]')).toContainText('2026-10-02');
});

test('injected gateway failures roll back a task but preserve confirmed optional-page state, and Alex cannot see Demo data', async ({ page }) => {
  await seed('nested-projects');
  await setClock(PINNED_NOW);
  await page.goto(`/projects/${SHOWCASE_ROOT}/pages/todos`);
  await expect(page.locator('[data-todo-id="task-renovation-budget"]')).toBeVisible();

  const openDevPanel = async () => {
    await page.keyboard.press('Control+Shift+D');
    await expect(page.locator('[data-dev-panel]')).toBeVisible();
  };
  const closeDevPanel = async () => {
    await page.locator('[data-dev-panel-close]').click();
    await expect(page.locator('[data-dev-panel]')).toHaveCount(0);
  };

  await openDevPanel();
  await page.locator('[data-panel-failure][data-rate="1"]').click();
  await closeDevPanel();
  try {
    const task = page.locator('[data-todo-id="task-renovation-budget"]');
    await task.locator('[data-todo-complete]').click();
    await expect(task).not.toHaveClass(/todos__row--finished/);
    await expect(page.locator('[data-todo-write-error]')).toContainText('prototype failure injection');

    await page.locator('[data-project-page-manager] summary').click();
    const todosToggle = page.locator('[data-page-toggle-kind="todos"] input');
    await todosToggle.click();
    await expect(todosToggle).toBeChecked();
    await expect(page.locator('[data-page-toggle-error]')).toContainText('prototype failure injection');
    expect((await requestApi.get<Array<{ kind: string; enabled: boolean }>>(`/api/projects/${SHOWCASE_ROOT}/pages`)).find(({ kind }) => kind === 'todos')?.enabled).toBe(true);
    expect((await requestApi.get<Array<{ id: string; status: string }>>(`/api/tasks?projectId=${SHOWCASE_ROOT}`)).find(({ id }) => id === 'task-renovation-budget')?.status).toBe('todo');
  } finally {
    await openDevPanel();
    await page.locator('[data-panel-failure][data-rate="0"]').click();
    await closeDevPanel();
  }

  await openDevPanel();
  await page.locator('[data-panel-persona][data-persona-id="user-alex"]').click();
  await expect(page.locator('[data-identity-name]')).toHaveText('Alex');
  await expect(page.locator('[data-project-error]')).toContainText('not found');
  await openDevPanel();
  await page.locator('[data-panel-persona][data-persona-id="user-demo"]').click();
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
  await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
});
