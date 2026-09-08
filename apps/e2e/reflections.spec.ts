import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { PROTOTYPE_HOST, seed, setClock } from './seed';

const READWRITE = 'prototype-user-a-readwrite';
const READONLY = 'prototype-user-a-readonly';
const PERSONA = (user: string) => ({ 'content-type': 'application/json', 'x-prototype-user': user });

const rawApi = (user: string, method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(`${PROTOTYPE_HOST}${path}`, {
    method,
    headers: PERSONA(user),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await rawApi('user-demo', method, path, body);
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
};

const apiAs = async <T>(user: string, method: string, path: string, body?: unknown): Promise<T> => {
  const response = await rawApi(user, method, path, body);
  if (!response.ok) throw new Error(`${method} ${path} as ${user} answered ${response.status}: ${await response.text()}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
};

const expectStatus = async (user: string, method: string, path: string, status: number, body: unknown) => {
  const response = await rawApi(user, method, path, body);
  expect(response.status).toBe(status);
};

const clientFor = (name: string, token: string) => {
  const client = new Client(
    { name, version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  return { client, transport: new StreamableHTTPClientTransport(new URL(`${PROTOTYPE_HOST}/mcp`), { authProvider: { token: async () => token } }) };
};

test('completed work can receive retained reflections across the root journal, HTTP MCP and the UI', async ({ page }) => {
  await seed('agent-heavy');
  await setClock('2026-09-15T12:00:00.000Z');

  const workspace = await api<{ workspace: { id: string } }>('GET', '/api/me');
  const root = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId: workspace.workspace.id,
    kind: 'root',
    name: 'Reflection journey',
  });
  const reflectionsPage = await api<{ id: string }>('PATCH', `/api/projects/${root.id}/pages/reflections`, { enabled: true });
  await api('PATCH', `/api/projects/${root.id}/pages/todos`, { enabled: true });
  const homeContainer = await api<{ id: string }>('POST', `/api/projects/${root.id}/sections`, {
    type: 'reflections',
    title: 'Home journal',
  });
  const child = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId: workspace.workspace.id,
    kind: 'subproject',
    parentProjectId: root.id,
    name: 'Launch',
  });
  const grandchild = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId: workspace.workspace.id,
    kind: 'subproject',
    parentProjectId: child.id,
    name: 'Release',
  });
  const childTasks = await api<{ id: string }>('POST', `/api/projects/${child.id}/sections`, { type: 'task-list', title: 'Launch tasks' });
  const grandchildReflections = await api<{ id: string }>('POST', `/api/projects/${grandchild.id}/sections`, {
    type: 'reflections',
    title: 'Release journal',
  });
  const pageContainer = await api<{ id: string }>('POST', `/api/projects/${root.id}/sections`, {
    type: 'reflections',
    pageId: reflectionsPage.id,
    title: 'Page journal',
  });
  const firstTask = await api<{ id: string }>('POST', '/api/tasks', {
    projectId: child.id,
    sectionId: childTasks.id,
    title: 'Ship the release',
  });
  const secondTask = await api<{ id: string }>('POST', '/api/tasks', {
    projectId: child.id,
    sectionId: childTasks.id,
    title: 'Write the handoff',
  });

  await setClock('2026-09-15T12:01:00.000Z');
  await api('POST', '/api/reflections', {
    projectId: root.id,
    sectionId: homeContainer.id,
    body: 'Home journal entry',
  });
  await setClock('2026-09-15T12:02:00.000Z');
  await api('POST', '/api/reflections', {
    projectId: grandchild.id,
    sectionId: grandchildReflections.id,
    body: 'Release journal entry',
  });

  // A foreign completed task and a completed task under a different root are controls for the
  // picker and subject boundary. They never become candidates for this root.
  const otherRoot = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId: workspace.workspace.id,
    kind: 'root',
    name: 'Other root',
  });
  const otherTask = await api<{ id: string }>('POST', '/api/tasks', {
    projectId: otherRoot.id,
    title: 'Other root task',
    status: 'done',
  });
  const foreignRoot = await apiAs<{ id: string }>('user-alex', 'POST', '/api/projects', {
    workspaceId: 'workspace-alex',
    kind: 'root',
    name: 'Foreign root',
  });
  const foreignTask = await apiAs<{ id: string }>('user-alex', 'POST', '/api/tasks', {
    projectId: foreignRoot.id,
    title: 'Foreign completed task',
    status: 'done',
  });

  await setClock('2026-09-15T12:03:00.000Z');
  await api('POST', `/api/tasks/${firstTask.id}/complete`);
  await setClock('2026-09-15T12:04:00.000Z');
  await api('PATCH', `/api/projects/${grandchild.id}`, { status: 'completed' });

  const httpJournalBefore = await api<{ items: Array<{ reflection: { id: string }; origin: { pageKind: string } }> }>(
    'GET',
    `/api/projects/${root.id}/journal`,
  );
  expect(httpJournalBefore.items).toHaveLength(2);
  expect(httpJournalBefore.items.map(({ origin }) => origin.pageKind)).toEqual(expect.arrayContaining(['home', 'work']));
  const picker = await api<{ candidates: Array<{ id: string; kind: string }> }>('GET', `/api/projects/${root.id}/completed-work`);
  expect(picker.candidates.map(({ id }) => id)).toEqual(expect.arrayContaining([firstTask.id, grandchild.id]));
  expect(picker.candidates.map(({ id }) => id)).not.toContain(secondTask.id);
  expect(picker.candidates.map(({ id }) => id)).not.toContain(otherTask.id);

  await page.goto(`/projects/${root.id}/pages/reflections`);
  await expect(page.locator('[data-reflections-page]')).toBeVisible();
  await expect(page.locator('[data-reflections-entry]')).toHaveCount(2);
  await expect(page.locator('[data-reflections-picker] [data-subject-id]')).toHaveCount(2);

  const subjectPicker = page.locator('[data-reflections-subject-picker]');
  await subjectPicker.selectOption(`task:${firstTask.id}`);
  await expect(page.locator('[data-reflections-composer-region] [data-reflection-subject]')).toContainText('Ship the release');
  await page.locator('[data-reflection-title]').fill('Task checkpoint');
  await page.locator('[data-reflection-body]').fill('The task is complete.');
  await page.locator('[data-reflections-composer-region] [data-reflection-create] button[type="submit"]').click();
  await expect(page.locator('[data-reflections-entry]')).toHaveCount(3);

  await subjectPicker.selectOption(`subproject:${grandchild.id}`);
  await expect(page.locator('[data-reflections-composer-region] [data-reflection-subject]')).toContainText('Release');
  await page.locator('[data-reflection-title]').fill('Release checkpoint');
  await page.locator('[data-reflection-body]').fill('The release unit is complete.');
  await page.locator('[data-reflections-composer-region] [data-reflection-create] button[type="submit"]').click();
  await expect(page.locator('[data-reflections-entry]')).toHaveCount(4);
  expect(await page.locator('[data-reflections-composer-region] [data-reflections-entry]').count()).toBe(0);

  const ownerHrefs = await page.locator('[data-reflections-owner-link]').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  );
  expect(ownerHrefs).toContain(`/projects/${root.id}/pages/home#section-${homeContainer.id}`);
  expect(ownerHrefs).toContain(`/projects/${root.id}/pages/reflections#section-${pageContainer.id}`);
  expect(ownerHrefs).toContain(`/projects/${grandchild.id}#section-${grandchildReflections.id}`);

  // The subject is historical data, not a second task status. Reopening and archiving the
  // canonical records changes only the resolved view in the journal.
  await setClock('2026-09-15T12:05:00.000Z');
  await api('PATCH', `/api/tasks/${firstTask.id}`, { status: 'todo' });
  await api('PATCH', `/api/projects/${grandchild.id}`, { status: 'active' });
  const taskEntry = page.locator('[data-reflections-entry]', { hasText: 'The task is complete.' });
  const projectEntry = page.locator('[data-reflections-entry]', { hasText: 'The release unit is complete.' });
  await expect(taskEntry).toContainText('Todo');
  await expect(projectEntry).toContainText('Active');
  await api('POST', `/api/tasks/${firstTask.id}/archive`);
  await expect(taskEntry).toContainText('Archived');

  const journalCountBeforeRefusals = (await api<{ items: unknown[] }>('GET', `/api/projects/${root.id}/journal`)).items.length;
  await expectStatus('user-demo', 'POST', '/api/reflections', 409, {
    projectId: root.id,
    body: 'unfinished should fail',
    subject: { kind: 'task', id: secondTask.id },
  });
  await expectStatus('user-demo', 'POST', '/api/reflections', 409, {
    projectId: root.id,
    body: 'archived should fail',
    subject: { kind: 'task', id: firstTask.id },
  });
  await expectStatus('user-demo', 'POST', '/api/reflections', 409, {
    projectId: root.id,
    body: 'root should fail',
    subject: { kind: 'subproject', id: root.id },
  });
  await expectStatus('user-demo', 'POST', '/api/reflections', 409, {
    projectId: root.id,
    body: 'cross root should fail',
    subject: { kind: 'task', id: otherTask.id },
  });
  await expectStatus('user-demo', 'POST', '/api/reflections', 404, {
    projectId: root.id,
    body: 'missing and foreign are not found',
    subject: { kind: 'task', id: 'task-does-not-exist' },
  });
  await expectStatus('user-demo', 'POST', '/api/reflections', 404, {
    projectId: root.id,
    body: 'foreign is not found',
    subject: { kind: 'task', id: foreignTask.id },
  });
  expect((await api<{ items: unknown[] }>('GET', `/api/projects/${root.id}/journal`)).items).toHaveLength(journalCountBeforeRefusals);

  await api('PATCH', `/api/projects/${root.id}/pages/reflections`, { enabled: false });
  await page.goto(`/projects/${root.id}/pages/reflections`);
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/home$`));
  await expect(page.locator('[data-page-notice]')).toContainText('switched off');
  await api('PATCH', `/api/projects/${root.id}/pages/reflections`, { enabled: true });
  await page.goto(`/projects/${root.id}/pages/reflections`);
  await expect(page.locator('[data-reflections-entry]')).toHaveCount(4);

  // The second task supplies a fresh eligible subject for the transport acceptance after the
  // first one was archived. The open page must refresh from the MCP write without a reload.
  await setClock('2026-09-15T12:06:00.000Z');
  await api('POST', `/api/tasks/${secondTask.id}/complete`);
  const streamOpen = page.waitForResponse(
    (response) => response.url().includes('/prototype/events') && response.status() === 200,
  );
  await page.reload();
  await streamOpen;

  const pageOnlyRoot = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId: workspace.workspace.id,
    kind: 'root',
    name: 'Page-only MCP root',
  });
  const pageOnlyReflections = await api<{ id: string }>('PATCH', `/api/projects/${pageOnlyRoot.id}/pages/reflections`, { enabled: true });
  const pageOnlyTask = await api<{ id: string }>('POST', '/api/tasks', {
    projectId: pageOnlyRoot.id,
    title: 'Page-only completed work',
    status: 'done',
  });

  const { client, transport } = clientFor('cwm-reflections-e2e', READWRITE);
  const readOnly = clientFor('cwm-reflections-readonly-e2e', READONLY);
  await client.connect(transport);
  await readOnly.client.connect(readOnly.transport);
  try {
    const created = await client.callTool({
      name: 'add_reflection',
      arguments: {
        projectId: root.id,
        pageId: reflectionsPage.id,
        body: 'Written through HTTP MCP',
        subject: { kind: 'task', id: secondTask.id },
      },
    });
    expect(created.isError).not.toBe(true);
    const stored = created.structuredContent as { id: string; subject?: { id: string; name?: string } };
    expect(stored.subject).toEqual({ kind: 'task', id: secondTask.id });
    expect(stored.subject?.name).toBeUndefined();

    const pageOnlyCreated = await client.callTool({
      name: 'add_reflection',
      arguments: {
        projectId: pageOnlyRoot.id,
        pageId: pageOnlyReflections.id,
        body: 'The MCP page resolved its first container.',
        subject: { kind: 'task', id: pageOnlyTask.id },
      },
    });
    expect(pageOnlyCreated.isError).not.toBe(true);
    const pageOnlySections = await api<Array<{ id: string; type: string }>>(
      'GET',
      `/api/projects/${pageOnlyRoot.id}/sections?pageId=${pageOnlyReflections.id}`,
    );
    expect(pageOnlySections).toEqual([expect.objectContaining({ type: 'reflections' })]);

    const expected = await api<{ items: Array<{ reflection: { id: string } }> }>('GET', `/api/projects/${root.id}/journal`);
    const overMcp = await client.callTool({ name: 'get_project_journal', arguments: { projectId: root.id } });
    expect(overMcp.isError).not.toBe(true);
    expect((overMcp.structuredContent as { items: Array<{ reflection: { id: string } }> }).items.map(({ reflection }) => reflection.id))
      .toEqual(expected.items.map(({ reflection }) => reflection.id));

    const denied = await readOnly.client.callTool({
      name: 'add_reflection',
      arguments: { projectId: root.id, body: 'Read-only agent must not write' },
    });
    expect(denied.isError).toBe(true);

    const live = await client.callTool({
      name: 'add_reflection',
      arguments: {
        projectId: grandchild.id,
        sectionId: grandchildReflections.id,
        body: 'Written on the descendant canvas',
        subject: { kind: 'task', id: secondTask.id },
      },
    });
    expect(live.isError).not.toBe(true);
    await expect(page.locator('[data-reflections-entry]', { hasText: 'Written on the descendant canvas' })).toBeVisible({ timeout: 15_000 });
  } finally {
    await client.close();
    await readOnly.client.close();
  }

  const finalJournal = await api<{ items: unknown[] }>('GET', `/api/projects/${root.id}/journal`);
  expect(finalJournal.items).toHaveLength(6);
});
