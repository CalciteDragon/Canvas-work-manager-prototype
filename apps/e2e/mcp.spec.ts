import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { PROTOTYPE_HOST, api as requestApi, connectMcp, seed, setClock } from './seed';

/**
 * §69 calls this one of the most important tests in the prototype: an agent writes through
 * the real MCP server, and the open page moves without a reload (§62). So it uses a **real**
 * `@modelcontextprotocol/client` over the real Streamable HTTP transport, not a `fetch`
 * shaped like one.
 *
 * `project-work-manager` is named rather than assumed — it is the only project in the
 * `agent-heavy` seed carrying a `recent-activity` section, which is what the attribution
 * half of this test reads.
 *
 * The token is inlined with this comment rather than imported: `packages/prototype-data` is
 * source-only (`exports` points at `src/index.ts`), and Playwright does not transpile
 * dependencies reached through `node_modules`. `agent-tokens.ts` says the string is meant
 * to be pasted.
 */
const TOKEN = 'prototype-user-a-readwrite';
const PROJECT = 'project-work-manager';
const PINNED_NOW = '2026-09-15T12:00:00.000Z';

test('an agent’s task appears in the open page without a reload, attributed to Claude', async ({ page }) => {
  await seed('agent-heavy');
  await setClock(PINNED_NOW);

  // Registered *before* `goto`: `page.goto` resolving does not mean the SSE handshake
  // completed, and without this wait the test is flaky rather than wrong.
  const streamOpen = page.waitForResponse(
    (response) => response.url().includes('/prototype/events') && response.status() === 200,
  );
  await page.goto(`/projects/${PROJECT}`);
  await expect(page.locator('[data-project-name]')).toBeVisible();
  await streamOpen;

  const client = new Client(
    { name: 'cwm-e2e', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${PROTOTYPE_HOST}/mcp`), {
      authProvider: { token: async () => TOKEN },
    }),
  );

  try {
    const result = await client.callTool({
      name: 'create_task',
      arguments: { projectId: PROJECT, title: 'Written by an agent, mid-session' },
    });
    expect(result.isError).not.toBe(true);
  } finally {
    await client.close();
  }

  // No reload anywhere in this test — Slice 16's stream is what moves the page.
  await expect(page.locator('[data-task-title]', { hasText: 'Written by an agent, mid-session' })).toBeVisible({
    timeout: 15_000,
  });

  const entry = page.locator('[data-activity-entry]').first();
  await expect(entry).toContainText('Written by an agent, mid-session');
  await expect(entry.locator('[data-activity-actor]')).toContainText('Claude');
});

const SHOWCASE_ROOT = 'project-renovation';
const SHOWCASE_HOME = 'page-project-renovation';
const SHOWCASE_REFLECTIONS = 'page-project-renovation-reflections';
const SHOWCASE_KITCHEN = 'project-kitchen';
const READ_GRANTS = ['projects.read', 'tasks.read', 'reflections.read'] as const;

const contentText = (result: { content?: Array<{ type: string; text?: string }> }): string =>
  (result.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join(' ');

test('MCP mutates the nested showcase and the open browser follows every aggregate without reload', async ({ page }) => {
  await seed('nested-projects');
  await setClock(PINNED_NOW);

  const streamOpen = page.waitForResponse(
    (response) => response.url().includes('/prototype/events') && response.status() === 200,
  );
  await page.goto(`/projects/${SHOWCASE_ROOT}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
  await expect(page.locator('[data-shortcut-frame]')).toHaveCount(4);
  await streamOpen;

  const client = await connectMcp(TOKEN, 'cwm-mcp-integrated-e2e');
  let createdTaskId: string | undefined;
  try {
    const created = await client.callTool({
      name: 'create_task',
      arguments: { projectId: SHOWCASE_KITCHEN, title: 'MCP nested task', dueAt: '2026-09-19T12:00:00.000Z' },
    });
    expect(created.isError).not.toBe(true);
    createdTaskId = (created.structuredContent as { id: string }).id;
    expect((await requestApi.get<{ title: string }>(`/api/tasks/${createdTaskId}`)).title).toBe('MCP nested task');

    const nestedShortcut = page.locator('[data-shortcut-frame]', { hasText: 'MCP nested task' });
    await expect(nestedShortcut).toBeVisible({ timeout: 15_000 });

    const updated = await client.callTool({
      name: 'update_task',
      arguments: { taskId: createdTaskId, dueAt: '2026-09-20T12:00:00.000Z' },
    });
    expect(updated.isError).not.toBe(true);
    expect((await requestApi.get<{ dueAt?: string }>(`/api/tasks/${createdTaskId}`)).dueAt).toBe('2026-09-20T12:00:00.000Z');

    const addedShortcut = await client.callTool({
      name: 'add_section_shortcut',
      arguments: {
        projectId: SHOWCASE_ROOT,
        pageId: SHOWCASE_HOME,
        sourceSectionId: 'section-project-kitchen-recent-activity',
      },
    });
    expect(addedShortcut.isError).not.toBe(true);
    const shortcutId = (addedShortcut.structuredContent as { id: string }).id;
    await expect(page.locator('[data-shortcut-frame]')).toHaveCount(5, { timeout: 15_000 });
    expect((await requestApi.get<unknown[]>(`/api/projects/${SHOWCASE_ROOT}/shortcuts?pageId=${SHOWCASE_HOME}`)).length).toBe(5);

    const removedShortcut = await client.callTool({
      name: 'remove_section_shortcut',
      arguments: { shortcutId },
    });
    expect(removedShortcut.isError).not.toBe(true);
    await expect(page.locator('[data-shortcut-frame]')).toHaveCount(4, { timeout: 15_000 });

    const completed = await client.callTool({ name: 'complete_task', arguments: { taskId: createdTaskId } });
    expect(completed.isError).not.toBe(true);
    expect((await requestApi.get<{ status: string }>(`/api/tasks/${createdTaskId}`)).status).toBe('done');
    await expect(nestedShortcut.locator('[data-task-row]').filter({ hasText: 'MCP nested task' })).toHaveClass(/task-row--completed/, { timeout: 15_000 });

    await page.goto(`/projects/${SHOWCASE_ROOT}/pages/reflections`);
    await expect(page.locator('[data-reflections-page]')).toBeVisible();
    const reflection = await client.callTool({
      name: 'add_reflection',
      arguments: {
        projectId: SHOWCASE_ROOT,
        pageId: SHOWCASE_REFLECTIONS,
        subject: { kind: 'task', id: createdTaskId },
        title: 'MCP task checkpoint',
        body: 'The nested task is complete.',
      },
    });
    expect(reflection.isError).not.toBe(true);
    const reflectionId = (reflection.structuredContent as { id: string }).id;
    await expect(page.locator(`[data-reflections-entry][data-reflection-id="${reflectionId}"]`)).toContainText('MCP task checkpoint');
    expect((await requestApi.get<{ items: Array<{ reflection: { id: string } }> }>(`/api/projects/${SHOWCASE_ROOT}/journal`)).items.map(({ reflection: item }) => item.id)).toContain(reflectionId);

    await page.goto(`/projects/${SHOWCASE_ROOT}/pages/archive`);
    await expect(page.locator('[data-archive-page]')).toBeVisible();
    const archived = await client.callTool({ name: 'archive_task', arguments: { taskId: createdTaskId } });
    expect(archived.isError).not.toBe(true);
    await expect(page.locator(`[data-archived-item][data-archived-id="${createdTaskId}"]`)).toBeVisible({ timeout: 15_000 });
    const archiveProjection = await client.callTool({ name: 'get_project_archive', arguments: { projectId: SHOWCASE_ROOT } });
    expect((archiveProjection.structuredContent as { items: unknown[] }).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'task', task: expect.objectContaining({ id: createdTaskId }) })]),
    );

    const restored = await client.callTool({ name: 'restore_task', arguments: { taskId: createdTaskId } });
    expect(restored.isError).not.toBe(true);
    await expect(page.locator(`[data-archived-item][data-archived-id="${createdTaskId}"]`)).toHaveCount(0, { timeout: 15_000 });
    expect((await requestApi.get<{ archivedAt?: string }>(`/api/tasks/${createdTaskId}`)).archivedAt).toBeUndefined();

    const disabled = await client.callTool({
      name: 'set_project_page_enabled',
      arguments: { projectId: SHOWCASE_ROOT, kind: 'archive', enabled: false },
    });
    expect(disabled.isError).not.toBe(true);
    await expect(page).toHaveURL(new RegExp(`/projects/${SHOWCASE_ROOT}/pages/home$`), { timeout: 15_000 });
    await expect(page.locator('[data-page-notice]')).toContainText('switched off');
    const enabled = await client.callTool({
      name: 'set_project_page_enabled',
      arguments: { projectId: SHOWCASE_ROOT, kind: 'archive', enabled: true },
    });
    expect(enabled.isError).not.toBe(true);
    await expect(page.locator('[data-project-page-tab][data-page-kind="archive"]')).toBeVisible({ timeout: 15_000 });
    expect((await requestApi.get<Array<{ kind: string; enabled: boolean }>>(`/api/projects/${SHOWCASE_ROOT}/pages`)).find(({ kind }) => kind === 'archive')?.enabled).toBe(true);
  } finally {
    await client.close();
  }

  await page.goto(`/projects/${SHOWCASE_KITCHEN}`);
  const activity = page.locator('[data-activity-entry][data-actor="agent"]', { hasText: 'MCP nested task' });
  await expect(activity.first()).toBeVisible({ timeout: 15_000 });
  await expect(activity.first().locator('[data-activity-actor]')).toHaveText('Claude');
});

test('MCP inserts a section and shortcut at their combined canvas positions and preserves them on reload', async ({ page }) => {
  await seed('nested-projects');
  await setClock(PINNED_NOW);

  const streamOpen = page.waitForResponse(
    (response) => response.url().includes('/prototype/events') && response.status() === 200,
  );
  await page.goto(`/projects/${SHOWCASE_ROOT}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
  await streamOpen;

  const client = await connectMcp(TOKEN, 'cwm-mcp-positioned-canvas-e2e');
  let createdSectionId: string | undefined;
  let createdShortcutId: string | undefined;
  try {
    const section = await client.callTool({
      name: 'create_section',
      arguments: {
        projectId: SHOWCASE_ROOT,
        pageId: SHOWCASE_HOME,
        type: 'rich-text',
        title: 'MCP positioned note',
        columnSpan: 4,
        position: 1,
      },
    });
    expect(section.isError).not.toBe(true);
    createdSectionId = (section.structuredContent as { id: string }).id;
    await expect(page.locator('#section-' + createdSectionId)).toBeVisible({ timeout: 15_000 });

    const shortcut = await client.callTool({
      name: 'add_section_shortcut',
      arguments: {
        projectId: SHOWCASE_ROOT,
        pageId: SHOWCASE_HOME,
        sourceSectionId: 'section-project-kitchen-brief',
        columnSpan: 4,
        position: 2,
      },
    });
    expect(shortcut.isError).not.toBe(true);
    createdShortcutId = (shortcut.structuredContent as { id: string }).id;
    await expect(page.locator(`[data-shortcut-id="${createdShortcutId}"]`)).toBeVisible({ timeout: 15_000 });

    const readCombinedOrder = async (): Promise<string[]> => {
      const [sections, shortcuts] = await Promise.all([
        requestApi.get<Array<{ id: string; position: number }>>(`/api/projects/${SHOWCASE_ROOT}/sections?pageId=${SHOWCASE_HOME}`),
        requestApi.get<Array<{ id: string; position: number }>>(`/api/projects/${SHOWCASE_ROOT}/shortcuts?pageId=${SHOWCASE_HOME}`),
      ]);
      return [...sections, ...shortcuts].sort((left, right) => left.position - right.position).map(({ id }) => id);
    };

    const expectedOrder = await readCombinedOrder();
    expect(expectedOrder[1]).toBe(createdSectionId);
    expect(expectedOrder[2]).toBe(createdShortcutId);
    await expect
      .poll(() => page.locator('[data-section-item], [data-shortcut-item]').evaluateAll((items) => items.map((item) =>
        item.getAttribute('data-section-id') ?? item.getAttribute('data-shortcut-id'),
      )))
      .toEqual(expectedOrder);

    await page.reload();
    await expect(page.locator('#section-' + createdSectionId)).toBeVisible();
    await expect(page.locator(`[data-shortcut-id="${createdShortcutId}"]`)).toBeVisible();
    await expect(page.locator('[data-section-item], [data-shortcut-item]').evaluateAll((items) => items.map((item) =>
      item.getAttribute('data-section-id') ?? item.getAttribute('data-shortcut-id'),
    ))).resolves.toEqual(expectedOrder);
  } finally {
    await client.close();
  }
});

test('MCP derived reads require every grant, hide foreign roots, and the read-only token cannot write', async () => {
  await seed('nested-projects');
  await setClock(PINNED_NOW);

  const connections = await requestApi.get<Array<{ id: string; permissions: string[] }>>('/api/agent-connections');
  const cursor = connections.find(({ id }) => id === 'agent-cursor');
  expect(cursor).toBeDefined();
  const originalPermissions = cursor!.permissions;
  const client = await connectMcp('prototype-user-a-readonly', 'cwm-mcp-grant-matrix-e2e');
  const cases = [
    { tool: 'get_project_todos', grants: ['projects.read', 'tasks.read'] },
    { tool: 'get_project_archive', grants: ['projects.read', 'tasks.read', 'reflections.read'] },
    { tool: 'get_project_journal', grants: ['projects.read', 'tasks.read', 'reflections.read'] },
  ] as const;

  try {
    for (const testCase of cases) {
      for (const missing of testCase.grants) {
        const permissions = testCase.grants.filter((permission) => permission !== missing);
        await requestApi.patch('/api/agent-connections/agent-cursor', { permissions });
        const activityBefore = await requestApi.get<unknown[]>('/api/activity?projectId=project-renovation');
        const denied = await client.callTool({ name: testCase.tool, arguments: { projectId: SHOWCASE_ROOT } });
        expect(denied.isError).toBe(true);
        expect(denied.structuredContent).toBeUndefined();
        expect(contentText(denied)).toContain(missing);
        expect(await requestApi.get<unknown[]>('/api/activity?projectId=project-renovation')).toEqual(activityBefore);
      }
    }

    await requestApi.patch('/api/agent-connections/agent-cursor', { permissions: [...READ_GRANTS] });
    const foreign = await client.callTool({ name: 'get_project_todos', arguments: { projectId: 'project-alex-private' } });
    const missing = await client.callTool({ name: 'get_project_todos', arguments: { projectId: 'project-does-not-exist' } });
    expect(foreign.isError).toBe(true);
    expect(missing.isError).toBe(true);
    expect(foreign.structuredContent).toBeUndefined();
    expect(missing.structuredContent).toBeUndefined();
    expect(contentText(foreign).replace('project-alex-private', 'PROJECT')).toBe(
      contentText(missing).replace('project-does-not-exist', 'PROJECT'),
    );

    const taskCount = (await requestApi.get<unknown[]>('/api/tasks?projectId=project-renovation')).length;
    const readOnlyWrite = await client.callTool({
      name: 'create_task',
      arguments: { projectId: SHOWCASE_ROOT, title: 'Must not be created' },
    });
    expect(readOnlyWrite.isError).toBe(true);
    expect(readOnlyWrite.structuredContent).toBeUndefined();
    expect((await requestApi.get<unknown[]>('/api/tasks?projectId=project-renovation')).length).toBe(taskCount);

    const permitted = await client.callTool({ name: 'get_project_todos', arguments: { projectId: SHOWCASE_ROOT } });
    expect(permitted.isError).not.toBe(true);
  } finally {
    await requestApi.patch('/api/agent-connections/agent-cursor', { permissions: originalPermissions });
    await client.close();
  }
});
