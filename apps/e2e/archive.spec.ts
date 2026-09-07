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
  await page.locator('[data-project-nav-open-archive]').click();
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
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}$`));
  await expect(page.locator('[data-project-nav-open-archive]')).toBeVisible();
  await page.locator('[data-project-nav-open-archive]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/archive$`));
  await expect(page.locator('[data-archive-page]')).toBeVisible();
});
