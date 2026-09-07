import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { PROTOTYPE_HOST, seed, setClock } from './seed';

/**
 * Slice 25.5's acceptance, as one real journey: *a deliberately scrambled seed produces the
 * specified order through UI, HTTP and MCP; links open the correct owning canvas/container;
 * totals and canonical row counts are unchanged.*
 *
 * The scenario is created **through the API** on top of `agent-heavy` rather than added to a
 * distributed seed: the integrated showcase seed belongs to Slice 25.8, and a journey that
 * builds its own fixture states what it depends on instead of inheriting it.
 *
 * Permission combinations, rollback and read/write races are covered in the faster suites. What
 * only this test can cover is the real boundary: three clients agreeing on one order, links that
 * land on a real container in a real canvas, and §62's stream moving an open chronology.
 */
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

interface Row {
  kind: 'task' | 'subproject';
  task?: { id: string; title: string; status: string; dueAt?: string };
  project?: { id: string; name: string; status: string };
  origin: { projectId: string; pageKind: string; sectionId?: string; sectionName?: string };
}

const namesOf = (items: Row[]): string[] =>
  items.map((item) => `${item.kind}:${item.kind === 'task' ? item.task!.title : item.project!.name}`);

/** The chronology this scenario is built to produce, written out once. */
const EXPECTED = [
  'task:Earliest',
  'subproject:Kitchen',
  'task:Nested at end of day',
  'task:Later',
  'subproject:Cabinets',
  'task:Undated',
];

test('a scrambled tree reads the same through the page, HTTP and MCP — and its links land where the work lives', async ({
  page,
}) => {
  await seed('agent-heavy');
  await setClock(PINNED_NOW);

  // ─── the scenario, deliberately out of chronological order ───────────────────────────────
  const workspaceId = (await api<{ workspace: { id: string } }>('GET', '/api/me')).workspace.id;
  const root = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId,
    kind: 'root',
    name: 'Todos journey',
  });
  const containerA = await api<{ id: string }>('POST', `/api/projects/${root.id}/sections`, { type: 'task-list' });
  const containerB = await api<{ id: string }>('POST', `/api/projects/${root.id}/sections`, { type: 'task-list' });
  const kitchen = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId,
    kind: 'subproject',
    parentProjectId: root.id,
    name: 'Kitchen',
    targetDate: '2026-09-18',
  });
  const cabinets = await api<{ id: string }>('POST', '/api/projects', {
    workspaceId,
    kind: 'subproject',
    parentProjectId: kitchen.id,
    name: 'Cabinets',
    targetDate: '2026-09-25',
  });

  await api('POST', '/api/tasks', { projectId: root.id, sectionId: containerA.id, title: 'Later', dueAt: '2026-09-20T09:00:00.000Z' });
  const undated = await api<{ id: string }>('POST', '/api/tasks', { projectId: root.id, sectionId: containerB.id, title: 'Undated' });
  await api('POST', '/api/tasks', { projectId: root.id, sectionId: containerA.id, title: 'Earliest', dueAt: '2026-09-16T09:00:00.000Z' });
  // The same instant as Kitchen's date-only due date, so the kind tie-break is exercised.
  await api('POST', '/api/tasks', { projectId: kitchen.id, title: 'Nested at end of day', dueAt: '2026-09-18T23:59:59.999Z' });
  const kitchenSection = (await api<{ id: string }[]>('GET', `/api/projects/${kitchen.id}/sections`))[0]!;

  // Collapsed on purpose: a link has to be able to open the container it points at.
  await api('PATCH', `/api/sections/${containerA.id}`, { collapsed: true });
  await api('PATCH', `/api/projects/${root.id}/pages/todos`, { enabled: true });

  const taskCountBefore = (await api<unknown[]>('GET', `/api/tasks?projectId=${root.id}`)).length;
  const sectionCountBefore = (await api<unknown[]>('GET', `/api/projects/${root.id}/sections`)).length;
  // Home plus the Todos page the first enable created — and nothing may add to it after that.
  const pagesBefore = (await api<{ kind: string }[]>('GET', `/api/projects/${root.id}/pages`)).map(({ kind }) => kind);
  expect(pagesBefore).toEqual(['home', 'todos']);

  // ─── HTTP ────────────────────────────────────────────────────────────────────────────────
  const overHttp = await api<{ projectId: string; items: Row[] }>('GET', `/api/projects/${root.id}/todos`);
  expect(namesOf(overHttp.items)).toEqual(EXPECTED);

  // ─── MCP ─────────────────────────────────────────────────────────────────────────────────
  const client = new Client({ name: 'cwm-e2e-todos', version: '0.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${PROTOTYPE_HOST}/mcp`), { authProvider: { token: async () => TOKEN } }),
  );

  try {
    const overMcp = await client.callTool({ name: 'get_project_todos', arguments: { projectId: root.id } });
    expect(overMcp.isError).not.toBe(true);
    expect(namesOf((overMcp.structuredContent as { items: Row[] }).items)).toEqual(EXPECTED);

    // ─── the page ──────────────────────────────────────────────────────────────────────────
    const streamOpen = page.waitForResponse(
      (response) => response.url().includes('/prototype/events') && response.status() === 200,
    );
    await page.goto(`/projects/${root.id}/pages/todos`);
    await expect(page.locator('[data-todo-row]')).toHaveCount(6);
    expect(
      await page.locator('[data-todo-row]').evaluateAll((rows) =>
        rows.map((row) => `${row.getAttribute('data-todo-kind')}:${row.querySelector('[data-todo-link]')?.textContent?.trim()}`),
      ),
    ).toEqual(EXPECTED);
    await streamOpen;

    // ─── links land on the canvas that owns the row, and open a collapsed container ────────
    await page.locator('[data-todo-link]', { hasText: 'Earliest' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/home#section-${containerA.id}$`));
    const arrived = page.locator(`[data-section-item][data-section-id="${containerA.id}"]`);
    await expect(arrived.locator('[data-section-content]')).toBeVisible();
    await expect(arrived.locator('[data-section-collapse]')).toHaveAttribute('aria-expanded', 'true');
    // The acceptance asks for the owning heading **focused and in view**, so assert both here
    // rather than trusting the jsdom test, which has no layout to scroll.
    expect(
      await page.evaluate((sectionId) => {
        const wrapper = document.querySelector(`[data-section-item][data-section-id="${sectionId}"]`);
        const heading = wrapper?.querySelector('[data-section-title]');
        const box = heading?.getBoundingClientRect();
        return {
          focused: document.activeElement === heading,
          inView: box !== undefined && box.top >= 0 && box.bottom <= window.innerHeight,
        };
      }, containerA.id),
    ).toEqual({ focused: true, inView: true });
    // Arrival wrote nothing: the container is still collapsed for everyone else.
    expect(
      (await api<{ id: string; collapsed: boolean }[]>('GET', `/api/projects/${root.id}/sections`)).find(
        ({ id }) => id === containerA.id,
      )?.collapsed,
    ).toBe(true);

    await page.goBack();
    await expect(page.locator('[data-todo-row]')).toHaveCount(6);

    await page.locator('[data-todo-link]', { hasText: 'Nested at end of day' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${kitchen.id}#section-${kitchenSection.id}$`));
    await expect(page.locator('[data-project-name]')).toHaveText('Kitchen');

    await page.goBack();
    await page.locator('[data-todo-link]', { hasText: 'Cabinets' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${cabinets.id}$`));
    await page.goBack();

    // ─── completing both kinds, read back canonically ──────────────────────────────────────
    const completeRow = async (title: string) => {
      const row = page.locator('[data-todo-row]', { has: page.locator('[data-todo-link]', { hasText: title }) });
      await row.locator('[data-todo-complete]').click();
      await expect(row.locator('[data-todo-status]')).toHaveText(title === 'Cabinets' ? 'Completed' : 'Done');
    };
    await completeRow('Later');
    await completeRow('Cabinets');

    const laterTask = (await api<{ title: string; status: string; completedAt?: string }[]>('GET', `/api/tasks?projectId=${root.id}`))
      .find(({ title }) => title === 'Later');
    expect(laterTask?.status).toBe('done');
    expect(laterTask?.completedAt).toBeTruthy();
    expect((await api<{ status: string }>('GET', `/api/projects/${cabinets.id}`)).status).toBe('completed');
    // Completing a unit of work completes nothing beneath or above it.
    expect((await api<{ status: string }>('GET', `/api/projects/${kitchen.id}`)).status).not.toBe('completed');

    // ─── an agent moves a descendant, and the open chronology follows (§62) ────────────────
    const moved = await client.callTool({
      name: 'update_task',
      arguments: { taskId: undated.id, dueAt: '2026-09-15T08:00:00.000Z' },
    });
    expect(moved.isError).not.toBe(true);

    // No reload: the stream is what re-reads this page.
    await expect(page.locator('[data-todo-row]').first().locator('[data-todo-link]')).toHaveText('Undated', {
      timeout: 15_000,
    });
  } finally {
    await client.close();
  }

  // ─── the tab is navigation, not the content ────────────────────────────────────────────
  await api('PATCH', `/api/projects/${root.id}/pages/todos`, { enabled: false });
  await page.goto(`/projects/${root.id}/pages/todos`);
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/home$`));
  await expect(page.locator('[data-page-notice]')).toContainText('switched off');

  await api('PATCH', `/api/projects/${root.id}/pages/todos`, { enabled: true });
  await page.goto(`/projects/${root.id}/pages/todos`);
  await expect(page.locator('[data-todo-row]')).toHaveCount(6);

  // A sub-project has no pages: its `/pages/todos` URL is its own canvas.
  await page.goto(`/projects/${kitchen.id}/pages/todos`);
  await expect(page).toHaveURL(new RegExp(`/projects/${kitchen.id}$`));
  await expect(page.locator('[data-section-canvas]')).toBeVisible();

  // ─── nothing was created, moved or duplicated by reading and toggling ──────────────────
  expect((await api<unknown[]>('GET', `/api/tasks?projectId=${root.id}`)).length).toBe(taskCountBefore);
  expect((await api<unknown[]>('GET', `/api/projects/${root.id}/sections`)).length).toBe(sectionCountBefore);
  // Toggling updated the existing record rather than creating a second one; reading created none.
  expect((await api<{ kind: string }[]>('GET', `/api/projects/${root.id}/pages`)).map(({ kind }) => kind)).toEqual(
    pagesBefore,
  );
  const finalRows = await api<{ items: Row[] }>('GET', `/api/projects/${root.id}/todos`);
  expect(finalRows.items.filter(({ kind }) => kind === 'task').every(({ origin }) => origin.sectionId !== undefined)).toBe(true);
  expect(new Set(namesOf(finalRows.items)).size).toBe(finalRows.items.length);
});
