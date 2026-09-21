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

type TaskAddResult = { task: { id: string } };
type ReflectionAddResult = { reflection: { id: string } };

const addTask = async (body: Record<string, unknown>): Promise<{ id: string }> =>
  (await api<TaskAddResult>('POST', '/api/tasks', body)).task;

const addReflection = async (body: Record<string, unknown>): Promise<{ id: string }> =>
  (await api<ReflectionAddResult>('POST', '/api/reflections', body)).reflection;

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
  const sectionResult = await api<{ section: { id: string } }>('POST', `/api/projects/${root.id}/sections`, {
    type: 'task-list',
    title: 'Cascade section',
  });
  const taskSectionResult = await api<{ section: { id: string } }>('POST', `/api/projects/${root.id}/sections`, {
    type: 'task-list',
    title: 'Task section',
  });
  const section = sectionResult.section;
  const taskSection = taskSectionResult.section;
  const parent = await addTask({
    projectId: root.id,
    sectionId: taskSection.id,
    title: 'Parent task',
  });
  const child = await addTask({
    projectId: root.id,
    sectionId: taskSection.id,
    parentTaskId: parent.id,
    title: 'Child task',
  });
  await addTask({ projectId: root.id, sectionId: section.id, title: 'Section task' });
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

  const restoreSection = page.locator(`[data-archived-item][data-archived-id="${section.id}"] [data-archived-restore]`);
  await expect(restoreSection).toHaveText('Restore saved content');
  await expect(restoreSection).toHaveAttribute('aria-label', 'Restore saved content for Cascade section');
  await restoreSection.click();
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

  const mcpTask = await addTask({
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

  const addSection = async (body: Record<string, unknown>) =>
    (await api<{ section: { id: string } }>('POST', `/api/projects/${ROOT}/sections`, body)).section;
  const addTaskToSection = (sectionId: string, title: string) =>
    addTask({ projectId: ROOT, sectionId, title });

  const views = ['sub-projects', 'progress', 'timeline', 'recent-activity'].map((type) => `section-${ROOT}-${type}`);
  for (const id of views) await api('DELETE', `/api/sections/${id}`);

  const notes = await addSection({ type: 'rich-text', title: 'Kept notes', config: { text: 'Measure the hallway shelf' } });
  const blank = await addSection({ type: 'rich-text', title: 'Blank notes', config: { text: '  \n ' } });
  await api('DELETE', `/api/sections/${notes.id}`);
  await api('DELETE', `/api/sections/${blank.id}`);

  const cascaded = await addSection({ type: 'task-list', title: 'Cascaded list' });
  const cascadedTask = await addTaskToSection(cascaded.id, 'Comes back with its list');
  const filedEarly = await addTaskToSection(cascaded.id, 'Filed before removal');
  await api('POST', `/api/tasks/${filedEarly.id}/archive`);
  await api('DELETE', `/api/sections/${cascaded.id}?policy=cascade`);

  const reassigned = await addSection({ type: 'task-list', title: 'Reassigned source' });
  const moved = await addTaskToSection(reassigned.id, 'Moves to the main list');
  await api('DELETE', `/api/sections/${reassigned.id}?policy=reassign&reassignToSectionId=section-${ROOT}-tasks`);

  const oldTasks = await addSection({ type: 'task-list', title: 'Old tasks' });
  const oldTask = await addTaskToSection(oldTasks.id, 'Archived on its own');
  const oldSubtask = await addTask({
    projectId: ROOT,
    sectionId: oldTasks.id,
    parentTaskId: oldTask.id,
    title: 'Archived with its parent',
  });
  await api('POST', `/api/tasks/${oldTask.id}/archive`);
  await api('DELETE', `/api/sections/${oldTasks.id}`);

  const oldReflections = await addSection({ type: 'reflections', title: 'Old reflections' });
  const oldReflection = await addReflection({
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
      recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 2, separateRestoreCount: 1 },
    });
    // Two rows, one Restore: the subtask comes back with its parent.
    expect(entry(oldTasks.id)).toMatchObject({
      cascadeCount: 0,
      recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 2, separateRestoreCount: 1 },
    });
    expect(entry(oldReflections.id)).toMatchObject({
      cascadeCount: 0,
      recovery: { kind: 'owned-content', ownedData: 'reflections', contentCount: 1, separateRestoreCount: 1 },
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
  await expect(row(cascaded.id)).toContainText('1 other task stays archived; restore it separately afterwards.');
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
  await expect(row(oldSubtask.id)).toContainText('Restore “Archived on its own” first');
  await row(oldTask.id).locator('[data-archived-restore]').click();
  await expect(row(oldTask.id)).toHaveCount(0);
  await expect(row(oldSubtask.id)).toHaveCount(0);

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
  const retried = await api<{ section: { position: number; updatedAt: string }; operation: unknown }>(
    'POST',
    `/api/sections/${cascaded.id}/restore`,
  );
  expect(retried.section).toMatchObject({ position: restored.position, updatedAt: restored.updatedAt });
  // A retry on a live section writes nothing at all, so it has no receipt and no event either.
  expect(retried.operation).toBeNull();
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

    // An agent's Notes section created without config stores `{}`; removed untouched, it holds
    // nothing and stays out of Archive.
    const agentNotes = await client.callTool({ name: 'create_section', arguments: { projectId: ROOT, type: 'rich-text' } });
    expect(agentNotes.isError).not.toBe(true);
    const agentNotesId = (agentNotes.structuredContent as { section: { id: string; config: Record<string, unknown> } }).section.id;
    expect((agentNotes.structuredContent as { section: { config: Record<string, unknown> } }).section.config).toEqual({});
    expect((await client.callTool({ name: 'remove_section', arguments: { sectionId: agentNotesId } })).isError).not.toBe(true);
    const afterAgent = await client.callTool({ name: 'get_project_archive', arguments: { projectId: ROOT } });
    expect((afterAgent.structuredContent as { items: ProjectedItem[] }).items.map(keyOf)).not.toContain(`section:${agentNotesId}`);

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

/** Slice 33 (Refactor §26.10): one starting placement, two recoveries, two different answers. */
test('Archive Restore appends while Undo returns between surviving shortcut neighbors', async ({ page }) => {
  // nested-projects for its agent connection; the journey builds its own root beside the seeded one.
  await seed('nested-projects');
  await setClock(PINNED_NOW);
  const { workspace } = await api<{ workspace: { id: string } }>('GET', '/api/me');
  const root = await api<{ id: string; name: string }>('POST', '/api/projects', { workspaceId: workspace.id, kind: 'root', name: 'Placement contrast' });
  const child = await api<{ id: string }>('POST', '/api/projects', { workspaceId: workspace.id, kind: 'subproject', parentProjectId: root.id, name: 'Source unit' });
  const home = (await api<{ id: string; kind: string }[]>('GET', `/api/projects/${root.id}/pages`)).find(({ kind }) => kind === 'home')!;
  const add = async (projectId: string, body: Record<string, unknown>) =>
    (await api<{ section: { id: string } }>('POST', `/api/projects/${projectId}/sections`, body)).section;
  const source = await add(child.id, { type: 'rich-text', title: 'Shortcut source', config: { text: 'Source prose' } });
  const first = await add(root.id, { type: 'rich-text', title: 'First notes', config: { text: 'First' } });
  const shortcut = (await api<{ shortcut: { id: string } }>('POST', `/api/projects/${root.id}/shortcuts`, { pageId: home.id, sourceSectionId: source.id })).shortcut;
  const middle = await add(root.id, { type: 'rich-text', title: 'Middle notes', config: { text: 'Keep the middle prose' } });
  const last = await add(root.id, { type: 'progress', title: 'Last view' });
  const combined = async () => {
    const sections = await api<{ id: string; position: number }[]>('GET', `/api/projects/${root.id}/sections?pageId=${home.id}`);
    const shortcuts = await api<{ id: string; position: number }[]>('GET', `/api/projects/${root.id}/shortcuts?pageId=${home.id}`);
    return [...sections, ...shortcuts].sort((a, b) => a.position - b.position).map(({ id }) => id);
  };
  const initial = [first.id, shortcut.id, middle.id, last.id];
  expect(await combined()).toEqual(initial);
  const rendered = () => page.locator('[data-section-canvas] > [data-section-item], [data-section-canvas] > [data-shortcut-item]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-section-id') ?? item.getAttribute('data-shortcut-id')));

  const client = new Client({ name: 'cwm-slice-33-placement', version: '0.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${PROTOTYPE_HOST}/mcp`), { authProvider: { token: async () => TOKEN } }));
  const sdkSectionOrder = async () => {
    const listed = await client.callTool({ name: 'list_sections', arguments: { projectId: root.id } });
    return (JSON.parse((listed.content as { text: string }[])[0]!.text) as { id: string; position: number }[])
      .sort((a, b) => a.position - b.position).map(({ id }) => id);
  };
  try {
    await page.goto(`/projects/${root.id}`);
    const middleFrame = page.locator(`[data-section-item][data-section-id="${middle.id}"]`);

    // Undo: neighbour-aware, back between the shortcut and the view.
    const firstRemoval = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith(`/api/sections/${middle.id}`));
    await middleFrame.locator('[data-section-remove]').click();
    const firstReceipt = ((await (await firstRemoval).json()) as { operation: { historyId: string; actionId: string } }).operation;
    await expect(middleFrame).toHaveCount(0);
    expect(await archiveKeys(root.id)).toContain(`section:${middle.id}`);
    await page.locator('[data-undo-action]').click();
    await expect(middleFrame).toBeVisible();
    await expect.poll(combined).toEqual(initial);
    await page.reload();
    await expect.poll(rendered).toEqual(initial);
    expect(await sdkSectionOrder()).toEqual([first.id, middle.id, last.id]);

    // Restore: durable, needing no receipt to invoke, and appended after everything on the page.
    // Since Slice 37 it also records an action of its own, which the refusals below depend on.
    const secondRemoval = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith(`/api/sections/${middle.id}`));
    await middleFrame.locator('[data-section-remove]').click();
    const secondReceipt = ((await (await secondRemoval).json()) as { operation: { historyId: string; actionId: string } }).operation;
    await expect(middleFrame).toHaveCount(0);
    await page.locator('[data-open-archive]').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/archive$`));
    const row = page.locator(`[data-archived-item][data-archived-id="${middle.id}"]`);
    await row.locator('[data-archived-restore]').click();
    await expect(row).toHaveCount(0);
    const appended = [first.id, shortcut.id, last.id, middle.id];
    await expect.poll(combined).toEqual(appended);
    await page.goto(`/projects/${root.id}`);
    await expect.poll(rendered).toEqual(appended);
    expect(await sdkSectionOrder()).toEqual([first.id, last.id, middle.id]);
    expect((await api<{ config: { text: string } }[]>('GET', `/api/projects/${root.id}/sections?pageId=${home.id}`)).find((section) => (section as unknown as { id: string }).id === middle.id))
      .toMatchObject({ config: { text: 'Keep the middle prose' } });

    // Neither removal receipt can move the section right now, and for the same reason in both
    // cases: the Restore this person just made is the next step in their stack. The first receipt
    // was undone and then discarded by the second removal's write; the second is one step below the
    // Restore. Recording Restore turned what used to be a retirement into an ordinary "not next",
    // which is the point — the way back is to undo the Restore, not to lose the removal.
    const eventsBeforeRefusals = await api<unknown[]>('GET', '/api/activity?limit=5');
    for (const receipt of [firstReceipt, secondReceipt]) {
      const { revision } = await api<{ revision: number }>('GET', `/api/projects/${root.id}/history`);
      const refused = await fetch(`${PROTOTYPE_HOST}/api/history/${receipt.historyId}/transition`, {
        method: 'POST', headers: PERSONA, body: JSON.stringify({ actionId: receipt.actionId, direction: 'undo', expectedRevision: revision }),
      });
      expect(refused.status).toBe(409);
      expect(((await refused.json()) as { details: { reason: string } }).details.reason).toBe('history_not_next');
    }
    const eventsAfterRefusals = await api<unknown[]>('GET', '/api/activity?limit=5');
    expect(eventsAfterRefusals).toEqual(eventsBeforeRefusals);

    // Undoing the Restore puts the section back in Archive and makes the second removal reachable,
    // which is exactly the sequence Slice 37 exists to allow.
    const summary = await api<{ historyId: string; revision: number; undo: { actionId: string; operation: string } }>(
      'GET', `/api/projects/${root.id}/history`,
    );
    expect(summary.undo.operation).toBe('section.restore');
    await api('POST', `/api/history/${summary.historyId}/transition`, {
      actionId: summary.undo.actionId, direction: 'undo', expectedRevision: summary.revision,
    });
    await expect.poll(combined).toEqual([first.id, shortcut.id, last.id]);
    const afterRestoreUndo = await api<{ revision: number; undo: { actionId: string; operation: string } }>(
      'GET', `/api/projects/${root.id}/history`,
    );
    expect(afterRestoreUndo.undo).toMatchObject({ actionId: secondReceipt.actionId, operation: 'section.remove' });
    // Put it back the way the page showed it, so the checks below read the restored canvas.
    await api('POST', `/api/history/${summary.historyId}/transition`, {
      actionId: summary.undo.actionId, direction: 'redo', expectedRevision: afterRestoreUndo.revision,
    });
    await expect.poll(combined).toEqual(appended);
    // The person's history is not the agent connection's to reach. The baseline is re-read here:
    // the Restore Undo/Redo above are real transitions and each recorded its own event.
    const eventsBeforeSdk = await api<unknown[]>('GET', '/api/activity?limit=5');
    const { revision } = await api<{ revision: number }>('GET', `/api/projects/${root.id}/history`);
    const sdkRepeat = await client.callTool({
      name: 'undo_operation',
      arguments: { historyId: secondReceipt.historyId, actionId: secondReceipt.actionId, expectedRevision: revision },
    });
    expect(sdkRepeat.isError).toBe(true);
    expect(await combined()).toEqual(appended);
    // Refusals are not activity (Refactor §26.7).
    expect(await api<unknown[]>('GET', '/api/activity?limit=5')).toEqual(eventsBeforeSdk);
  } finally {
    await client.close();
  }
});
