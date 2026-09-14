import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { PROTOTYPE_HOST, seed, setClock } from './seed';

const TOKEN = 'prototype-user-a-readwrite';
const PINNED_NOW = '2026-09-15T12:00:00.000Z';
const PERSONA = { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' };

const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${PROTOTYPE_HOST}${path}`, {
    method,
    headers: PERSONA,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
};

type ArchiveItem = {
  kind: 'subproject' | 'section' | 'task' | 'reflection';
  project?: { id: string };
  section?: { id: string };
  task?: { id: string };
  reflection?: { id: string };
};

const keyOf = (item: ArchiveItem): string => {
  const record = item.project ?? item.section ?? item.task ?? item.reflection;
  return `${item.kind}:${record?.id}`;
};

const archiveKeys = async (projectId: string): Promise<string[]> => {
  const result = await api<{ items: ArchiveItem[] }>('GET', `/api/projects/${projectId}/archive`);
  return result.items.map(keyOf);
};

test('the root Archive keeps cascades and archived subprojects reachable across UI and MCP', async ({ page }) => {
  await seed('agent-heavy');
  await setClock(PINNED_NOW);

  const workspace = await api<{ workspace: { id: string } }>('GET', '/api/me');
  const root = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId: workspace.workspace.id,
    kind: 'root',
    name: 'Archive journey',
  });
  const section = await api<{ id: string }>('POST', `/api/projects/${root.id}/sections`, {
    type: 'task-list',
    title: 'Cascade section',
  });
  const taskSection = await api<{ id: string }>('POST', `/api/projects/${root.id}/sections`, {
    type: 'task-list',
    title: 'Task section',
  });
  const parent = await api<{ id: string }>('POST', '/api/tasks', {
    projectId: root.id,
    sectionId: taskSection.id,
    title: 'Parent task',
  });
  const child = await api<{ id: string }>('POST', '/api/tasks', {
    projectId: root.id,
    sectionId: taskSection.id,
    parentTaskId: parent.id,
    title: 'Child task',
  });
  await api('POST', '/api/tasks', { projectId: root.id, sectionId: section.id, title: 'Section task' });
  const leaf = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId: workspace.workspace.id,
    kind: 'subproject',
    parentProjectId: root.id,
    name: 'Restorable unit',
  });

  await api('POST', `/api/tasks/${parent.id}/archive`);
  await api('DELETE', `/api/sections/${section.id}?policy=cascade`);
  await api('PATCH', `/api/projects/${leaf.id}`, { status: 'archived' });

  expect(await archiveKeys(root.id)).toEqual(
    expect.arrayContaining([
      `section:${section.id}`,
      `task:${parent.id}`,
      `task:${child.id}`,
      `subproject:${leaf.id}`,
    ]),
  );

  await page.goto(`/projects/${root.id}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Archive journey');
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-open-archive]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/archive$`));
  await expect(page.locator('[data-archive-page]')).toBeVisible();

  // The section and its task are separate entries, while the task cascade remains blocked by
  // its parent. The root page is the one place where all of those identities coexist.
  await expect(page.locator(`[data-archived-item][data-archived-id="${section.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-archived-item][data-archived-id="${parent.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-archived-item][data-archived-id="${child.id}"]`)).toContainText('Restore “Parent task” first');
  await expect(page.locator(`[data-archived-item][data-archived-id="${leaf.id}"]`)).toBeVisible();

  await page.locator(`[data-archived-item][data-archived-id="${section.id}"] [data-archived-restore]`).click();
  await expect(page.locator(`[data-archived-item][data-archived-id="${section.id}"]`)).toHaveCount(0);
  expect(await archiveKeys(root.id)).not.toContain(`section:${section.id}`);

  await page.locator(`[data-archived-item][data-archived-id="${parent.id}"] [data-archived-restore]`).click();
  await expect(page.locator(`[data-archived-item][data-archived-id="${parent.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-archived-item][data-archived-id="${child.id}"]`)).toHaveCount(0);
  expect(await archiveKeys(root.id)).not.toEqual(expect.arrayContaining([`task:${parent.id}`, `task:${child.id}`]));

  const projectStatus = page.locator(`[data-archived-item][data-archived-id="${leaf.id}"] [data-archived-project-status]`);
  await projectStatus.selectOption('on_hold');
  await page.locator(`[data-archived-item][data-archived-id="${leaf.id}"] [data-archived-restore]`).click();
  await expect(page.locator(`[data-archived-item][data-archived-id="${leaf.id}"]`)).toHaveCount(0);
  await expect.poll(async () => (await api<{ status: string }>('GET', `/api/projects/${leaf.id}`)).status).toBe('on_hold');

  // Reload the actual page before repeating the same archive/restore through the real MCP
  // transport. This checks persistence and the combined read permission path, not a shared UI
  // fixture or a mocked gateway.
  await page.reload();
  await expect(page.locator('[data-archive-page]')).toBeVisible();

  const client = new Client(
    { name: 'cwm-archive-e2e', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${PROTOTYPE_HOST}/mcp`), {
      authProvider: { token: async () => TOKEN },
    }),
  );

  const mcpTask = await api<{ id: string }>('POST', '/api/tasks', {
    projectId: root.id,
    sectionId: taskSection.id,
    title: 'MCP archive task',
  });

  try {
    const archived = await client.callTool({ name: 'archive_task', arguments: { taskId: mcpTask.id } });
    expect(archived.isError).not.toBe(true);

    const projection = await client.callTool({ name: 'get_project_archive', arguments: { projectId: root.id } });
    expect(projection.isError).not.toBe(true);
    expect((projection.structuredContent as { items: ArchiveItem[] }).items.map(keyOf)).toContain(`task:${mcpTask.id}`);

    const restored = await client.callTool({ name: 'restore_task', arguments: { taskId: mcpTask.id } });
    expect(restored.isError).not.toBe(true);
  } finally {
    await client.close();
  }
  await expect(page.locator(`[data-archived-item][data-archived-id="${mcpTask.id}"]`)).toHaveCount(0);

  // Turning the optional tab off does not strand the archive. Its old URL falls back to Home,
  // where the same root navigation control enables it again and opens the page.
  await api('PATCH', `/api/projects/${root.id}/pages/archive`, { enabled: false });
  await page.goto(`/projects/${root.id}/pages/archive`);
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/home$`));
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-open-archive]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/archive$`));
  await expect(page.locator('[data-archive-page]')).toBeVisible();
});

type ProjectedItem = ArchiveItem & {
  section?: { id: string; config: Record<string, unknown> };
  cascadeCount?: number;
  recovery?: { kind: string; ownedData?: string; contentCount?: number };
  restoration: { kind: string };
};

const archiveItems = async (projectId: string): Promise<ProjectedItem[]> =>
  (await api<{ items: ProjectedItem[] }>('GET', `/api/projects/${projectId}/archive`)).items;

/**
 * Slice 29's content-oriented projection, over the integrated showcase seed. Everything is
 * asserted by the ids this journey creates, through the host API, the browser and a real MCP
 * client — one domain projection through every transport, never a UI-side filter.
 */
test('Archive lists recoverable content only, and independently archived rows keep a way back', async ({ page }) => {
  await seed('nested-projects');
  await setClock(PINNED_NOW);
  const ROOT = 'project-renovation';
  const HOME = 'page-project-renovation';

  const addSection = (body: Record<string, unknown>) => api<{ id: string }>('POST', `/api/projects/${ROOT}/sections`, body);
  const addTask = (sectionId: string, title: string) =>
    api<{ id: string }>('POST', '/api/tasks', { projectId: ROOT, sectionId, title });

  const views = ['sub-projects', 'progress', 'timeline', 'recent-activity'].map((type) => `section-${ROOT}-${type}`);
  for (const id of views) await api('DELETE', `/api/sections/${id}`);

  const notes = await addSection({ type: 'rich-text', title: 'Kept notes', config: { text: 'Measure the hallway shelf' } });
  const blank = await addSection({ type: 'rich-text', title: 'Blank notes', config: { text: '  \n ' } });
  await api('DELETE', `/api/sections/${notes.id}`);
  await api('DELETE', `/api/sections/${blank.id}`);

  const cascaded = await addSection({ type: 'task-list', title: 'Cascaded list' });
  const cascadedTask = await addTask(cascaded.id, 'Comes back with its list');
  const filedEarly = await addTask(cascaded.id, 'Filed before removal');
  await api('POST', `/api/tasks/${filedEarly.id}/archive`);
  await api('DELETE', `/api/sections/${cascaded.id}?policy=cascade`);

  const reassigned = await addSection({ type: 'task-list', title: 'Reassigned source' });
  const moved = await addTask(reassigned.id, 'Moves to the main list');
  await api('DELETE', `/api/sections/${reassigned.id}?policy=reassign&reassignToSectionId=section-${ROOT}-tasks`);

  const oldTasks = await addSection({ type: 'task-list', title: 'Old tasks' });
  const oldTask = await addTask(oldTasks.id, 'Archived on its own');
  await api('POST', `/api/tasks/${oldTask.id}/archive`);
  await api('DELETE', `/api/sections/${oldTasks.id}`);

  const oldReflections = await addSection({ type: 'reflections', title: 'Old reflections' });
  const oldReflection = await api<{ id: string }>('POST', '/api/reflections', {
    projectId: ROOT,
    sectionId: oldReflections.id,
    body: 'A reflection filed away',
  });
  await api('POST', `/api/reflections/${oldReflection.id}/archive`);
  await api('DELETE', `/api/sections/${oldReflections.id}`);

  // The optional tab is off for the reads below: Archive is a projection, not a page's data.
  await api('PATCH', `/api/projects/${ROOT}/pages/archive`, { enabled: false });

  const assertProjection = (items: ProjectedItem[]) => {
    const keys = items.map(keyOf);
    const entry = (id: string) => items.find((item) => item.kind === 'section' && item.section?.id === id);
    for (const id of [...views, blank.id, reassigned.id]) expect(keys).not.toContain(`section:${id}`);
    expect(entry(notes.id)).toMatchObject({ recovery: { kind: 'config' }, section: { config: { text: 'Measure the hallway shelf' } } });
    expect(entry(cascaded.id)).toMatchObject({
      cascadeCount: 1,
      recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 2 },
    });
    expect(entry(oldTasks.id)).toMatchObject({
      cascadeCount: 0,
      recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 1 },
    });
    expect(entry(oldReflections.id)).toMatchObject({
      cascadeCount: 0,
      recovery: { kind: 'owned-content', ownedData: 'reflections', contentCount: 1 },
    });
    expect(keys).toEqual(
      expect.arrayContaining([
        `task:${cascadedTask.id}`,
        `task:${filedEarly.id}`,
        `task:${oldTask.id}`,
        `reflection:${oldReflection.id}`,
      ]),
    );
  };
  assertProjection(await archiveItems(ROOT));
  expect((await api<{ sectionId: string }>('GET', `/api/tasks/${moved.id}`)).sectionId).toBe(`section-${ROOT}-tasks`);

  // From a nested route, More → Open archive enables the tab and opens the root's Archive.
  await page.goto('/projects/project-kitchen');
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-open-archive]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${ROOT}/pages/archive$`));
  const row = (id: string) => page.locator(`[data-archived-item][data-archived-id="${id}"]`);
  await expect(row(notes.id)).toContainText('Keeps its text');
  for (const id of [...views, blank.id, reassigned.id]) await expect(row(id)).toHaveCount(0);
  await expect(row(cascaded.id)).toContainText('2 tasks in this section');
  await expect(row(cascaded.id)).toContainText('1 task restores with this section');
  await expect(row(oldTasks.id)).toContainText('Restore this section first, then restore its archived task separately.');
  await expect(row(oldTask.id)).toContainText('Restore “Old tasks” first');

  // Reload: the same ids and config come back from the persisted file.
  await page.reload();
  await expect(row(notes.id)).toBeVisible();
  assertProjection(await archiveItems(ROOT));

  // A Home shortcut placed while the containers are away: each restore appends after it.
  await api('POST', `/api/projects/${ROOT}/shortcuts`, { pageId: HOME, sourceSectionId: 'section-project-kitchen-brief' });
  const placements = async () => {
    const sections = await api<{ id: string; position: number }[]>('GET', `/api/projects/${ROOT}/sections?pageId=${HOME}`);
    const shortcuts = await api<{ id: string; position: number }[]>('GET', `/api/projects/${ROOT}/shortcuts?pageId=${HOME}`);
    return [...sections, ...shortcuts].sort((a, b) => a.position - b.position).map(({ id }) => id);
  };
  const before = await placements();

  // Two-step recovery in the browser: the container, then its independently archived row.
  await row(oldTasks.id).locator('[data-archived-restore]').click();
  await expect(row(oldTasks.id)).toHaveCount(0);
  expect(await placements()).toEqual([...before, oldTasks.id]);
  await expect(row(oldTask.id).locator('[data-archived-restore]')).toBeEnabled();
  await row(oldTask.id).locator('[data-archived-restore]').click();
  await expect(row(oldTask.id)).toHaveCount(0);

  // A cascaded container brings back exactly its cascade; the earlier archive stays put.
  await row(cascaded.id).locator('[data-archived-restore]').click();
  await expect(row(cascaded.id)).toHaveCount(0);
  await expect(row(cascadedTask.id)).toHaveCount(0);
  await expect(row(filedEarly.id)).toBeVisible();
  expect(await placements()).toEqual([...before, oldTasks.id, cascaded.id]);

  // Retrying a restore is idempotent: no move, no timestamp, no second event.
  const homeSections = await api<{ id: string; position: number; updatedAt: string }[]>(
    'GET',
    `/api/projects/${ROOT}/sections?pageId=${HOME}`,
  );
  const restored = homeSections.find(({ id }) => id === cascaded.id)!;
  const events = await api<unknown[]>('GET', '/api/activity?limit=5');
  const retried = await api<{ position: number; updatedAt: string }>('POST', `/api/sections/${cascaded.id}/restore`);
  expect(retried).toMatchObject({ position: restored.position, updatedAt: restored.updatedAt });
  expect(await api<unknown[]>('GET', '/api/activity?limit=5')).toEqual(events);

  const client = new Client(
    { name: 'cwm-archive-content-e2e', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${PROTOTYPE_HOST}/mcp`), { authProvider: { token: async () => TOKEN } }),
  );
  try {
    const projection = await client.callTool({ name: 'get_project_archive', arguments: { projectId: ROOT } });
    expect(projection.isError).not.toBe(true);
    const items = (projection.structuredContent as { items: ProjectedItem[] }).items;
    expect(items.find((item) => item.section?.id === oldReflections.id)).toMatchObject({
      cascadeCount: 0,
      recovery: { kind: 'owned-content', ownedData: 'reflections', contentCount: 1 },
      restoration: { kind: 'ready' },
    });
    for (const id of views) expect(items.map(keyOf)).not.toContain(`section:${id}`);

    const steps = [
      { name: 'restore_section', arguments: { sectionId: oldReflections.id } },
      { name: 'restore_reflection', arguments: { reflectionId: oldReflection.id } },
      { name: 'restore_task', arguments: { taskId: filedEarly.id } },
    ];
    for (const step of steps) expect((await client.callTool(step)).isError).not.toBe(true);
  } finally {
    await client.close();
  }

  await expect(row(oldReflections.id)).toHaveCount(0);
  await expect(row(oldReflection.id)).toHaveCount(0);
  await expect(row(filedEarly.id)).toHaveCount(0);
  const remaining = (await archiveItems(ROOT)).map(keyOf);
  expect(remaining).toContain(`section:${notes.id}`);
  expect(remaining).not.toContain(`section:${oldReflections.id}`);
});
