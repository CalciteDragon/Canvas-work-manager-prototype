import type {
  OperationHistorySummary,
  OperationHistoryTransitionResult,
  ProjectPage,
  ProjectPageWriteResult,
  ReflectionAddResult,
  SectionAddResult,
} from '@cwm/contracts';
import { expect, test } from '@playwright/test';
import { api, connectMcp, createRoot, createSubprojects, seed, setClock } from './seed';

/**
 * Slice 38 (§§26, 31, 63, 68): the optional-page toggle and its inverses in the real browser.
 *
 * The toggles are driven through the **page manager and Open archive**, the controls a person
 * actually uses, while the transitions go through the same-persona HTTP history endpoints — Undo
 * and Redo have no header controls yet, and inventing one here would test a surface the phase
 * deliberately did not build. A second tab watches the live frames, and a reload proves the state
 * came from the file rather than from a signal.
 */

const history = (projectId: string) => api.get<OperationHistorySummary>(`/api/projects/${projectId}/history`);

/** Undo or Redo the caller's next action, the way a client that re-read the summary would. */
const step = async (projectId: string, direction: 'undo' | 'redo') => {
  const summary = await history(projectId);
  expect(summary[direction], `nothing to ${direction}`).not.toBeNull();
  return api.post<OperationHistoryTransitionResult>(`/api/history/${summary.historyId}/transition`, {
    actionId: summary[direction]!.actionId,
    expectedRevision: summary.revision,
    direction,
  });
};

const pagesOf = (projectId: string) => api.get<ProjectPage[]>(`/api/projects/${projectId}/pages`);

const pageOf = async (projectId: string, kind: string) => (await pagesOf(projectId)).find((page) => page.kind === kind);

/**
 * Everything under one root that a toggle or a transition could write, read back through the
 * ordinary API so a refusal can be shown to have written nothing: the pages, every section live or
 * archived, the Home placements, the journal, and the caller's own history summary.
 */
const rootState = async (projectId: string) =>
  JSON.stringify(
    await Promise.all([
      pagesOf(projectId),
      api.get(`/api/projects/${projectId}/sections?includeArchived=true`),
      api.get(`/api/projects/${projectId}/shortcuts`),
      api.get(`/api/projects/${projectId}/journal`),
      api.get(`/api/projects/${projectId}/archive`),
      history(projectId),
    ]),
  );

test('a first enable is reversible in the browser, and its page returns under the same id', async ({ page, context }) => {
  await seed('nested-projects');
  await setClock('2026-09-21T12:00:00.000Z');
  // A root created here is Home-only, so the next enable is genuinely the one that creates a record.
  const root = await createRoot('Page history');
  await createSubprojects(root.id, 1);
  expect((await pagesOf(root.id)).map(({ kind }) => kind)).toEqual(['home']);

  await page.goto(`/projects/${root.id}`);
  await expect(page.locator('[data-project-page-tab]')).toHaveCount(1);
  const manager = page.locator('[data-project-page-manager]');
  const toggle = (kind: 'todos' | 'archive' | 'reflections') => page.locator(`[data-page-toggle-kind="${kind}"] input`);
  const tab = (kind: string) => page.locator(`[data-project-page-tab][data-page-kind="${kind}"]`);

  // A second tab, watching the same root through the live stream.
  const watcher = await context.newPage();
  await watcher.goto(`/projects/${root.id}`);
  await expect(watcher.locator('[data-project-page-tab]')).toHaveCount(1);

  await manager.locator('summary').click();
  await toggle('reflections').click();
  await expect(tab('reflections')).toBeVisible();
  const created = (await pageOf(root.id, 'reflections'))!;
  await expect(watcher.locator('[data-project-page-tab][data-page-kind="reflections"]')).toBeVisible();
  expect((await history(root.id)).undo?.operation).toBe('page.add');

  // Undo removes the record entirely — "off" and "never existed" are different states.
  const undone = await step(root.id, 'undo');
  expect(undone.result).toMatchObject({ operation: 'page.add', outcome: 'removed', pageId: created.id });
  expect(await pageOf(root.id, 'reflections')).toBeUndefined();
  await expect(tab('reflections')).toHaveCount(0);
  await expect(watcher.locator('[data-project-page-tab][data-page-kind="reflections"]')).toHaveCount(0);

  // Redo brings back the same page id, and the tab with it.
  const redone = await step(root.id, 'redo');
  expect(redone.result).toMatchObject({ operation: 'page.add', outcome: 'reapplied' });
  expect((await pageOf(root.id, 'reflections'))?.id).toBe(created.id);
  await expect(tab('reflections')).toBeVisible();
  await page.reload();
  await expect(tab('reflections')).toBeVisible();
  await watcher.close();
});

test('Open archive records one action, and reversing it sends a viewer of that page back to Home', async ({ page, context }) => {
  await seed('nested-projects');
  await setClock('2026-09-21T12:00:00.000Z');
  const root = await createRoot('Archive history');
  const [child] = await createSubprojects(root.id, 1);
  await page.goto(`/projects/${root.id}`);

  // Open archive from More: a committed state change, hence exactly one action.
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-open-archive]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/archive$`));
  const archivePage = (await pageOf(root.id, 'archive'))!;
  const afterOpen = await history(root.id);
  expect(afterOpen.undo).toMatchObject({ operation: 'page.add' });
  const revisionAfterOpen = afterOpen.revision;

  // Opening an already-enabled page is navigation, not a write: no second action.
  await page.goto(`/projects/${root.id}/pages/home`);
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-open-archive]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/archive$`));
  expect((await history(root.id)).revision).toBe(revisionAfterOpen);

  // A toggle from a nested work route still belongs to the root's history.
  await page.goto(`/projects/${child.id}`);
  const manager = page.locator('[data-project-page-manager]');
  await manager.locator('summary').click();
  await page.locator('[data-page-toggle-kind="archive"] input').click();
  await expect.poll(async () => (await pageOf(root.id, 'archive'))?.enabled).toBe(false);
  const afterNested = await history(root.id);
  expect(afterNested.undo).toMatchObject({ operation: 'page.update' });
  expect((await history(child.id)).historyId).toBeNull();

  // Undo the disable, then Undo the enable beneath it while a second tab is on that very page:
  // removing the displayed page returns to Home with the existing explanation.
  await step(root.id, 'undo');
  const viewer = await context.newPage();
  await viewer.goto(`/projects/${root.id}/pages/archive`);
  await expect(viewer.locator('[data-archive-page]')).toBeVisible();

  const removed = await step(root.id, 'undo');
  expect(removed.result).toMatchObject({ operation: 'page.add', outcome: 'removed', pageId: archivePage.id });
  await expect(viewer).toHaveURL(new RegExp(`/projects/${root.id}/pages/home$`), { timeout: 15_000 });
  // The explanation, without the re-enable offer: there is no record left to switch back on,
  // which is exactly what distinguishes an undone creation from a disabled page.
  await expect(viewer.locator('[data-page-notice]')).toBeVisible();
  await expect(viewer.locator('[data-page-notice-enable]')).toHaveCount(0);
  // Enabling again restores the tab; it does not drag anyone to it.
  await step(root.id, 'redo');
  await expect(viewer.locator('[data-project-page-tab][data-page-kind="archive"]')).toBeVisible();
  await expect(viewer).toHaveURL(new RegExp(`/projects/${root.id}/pages/home$`));
  expect((await pageOf(root.id, 'archive'))?.id).toBe(archivePage.id);
  await viewer.close();
});

test('a dependent added by another actor blocks the first-enable Undo and changes nothing', async ({ page }) => {
  await seed('agent-heavy');
  await setClock('2026-09-21T12:00:00.000Z');
  const root = await createRoot('Blocked page Undo');
  await page.goto(`/projects/${root.id}`);
  const manager = page.locator('[data-project-page-manager]');
  await manager.locator('summary').click();
  await page.locator('[data-page-toggle-kind="reflections"] input').click();
  await expect(page.locator('[data-project-page-tab][data-page-kind="reflections"]')).toBeVisible();
  const created = (await pageOf(root.id, 'reflections'))!;

  // The container and its row belong to an agent, so the person's next Undo is still the enable.
  // The seed's connection does not hold `projects.write`, and a canvas write needs it.
  const connections = await api.get<Array<{ id: string; permissions: string[] }>>('/api/agent-connections');
  const claude = connections.find(({ id }) => id === 'agent-claude')!;
  await api.patch(`/api/agent-connections/${claude.id}`, {
    permissions: [...new Set([...claude.permissions, 'projects.write'])],
  });
  const agent = await connectMcp('prototype-user-a-readwrite', 'page-history-e2e');
  let containerId: string;
  try {
    const container = await agent.callTool({
      name: 'create_section',
      arguments: { projectId: root.id, type: 'reflections', pageId: created.id, title: 'Agent journal' },
    });
    expect(container.isError).not.toBe(true);
    containerId = (container.structuredContent as unknown as SectionAddResult).section.id;
    const row = await agent.callTool({
      name: 'add_reflection',
      arguments: { projectId: root.id, sectionId: containerId, body: 'Agent reflection' },
    });
    expect(row.isError).not.toBe(true);
    expect((row.structuredContent as unknown as ReflectionAddResult).reflection.sectionId).toBe(containerId);
  } finally {
    await agent.close();
  }

  const before = await rootState(root.id);
  const summary = await history(root.id);
  expect(summary.undo).toMatchObject({ operation: 'page.add' });
  await expect(
    api.post(`/api/history/${summary.historyId}/transition`, {
      actionId: summary.undo!.actionId,
      expectedRevision: summary.revision,
      direction: 'undo',
    }),
  ).rejects.toThrow(/history_conflict|refused/);

  // Not one byte of business or history state moved, and the page is still there and on.
  expect(await rootState(root.id)).toBe(before);
  expect(await pageOf(root.id, 'reflections')).toMatchObject({ id: created.id, enabled: true });
  await page.reload();
  await expect(page.locator('[data-project-page-tab][data-page-kind="reflections"]')).toBeVisible();

  // The ordinary disable is still available, and is what the person actually wants here.
  await manager.locator('summary').click();
  await page.locator('[data-page-toggle-kind="reflections"] input').click();
  await expect.poll(async () => (await pageOf(root.id, 'reflections'))?.enabled).toBe(false);
  const disabled = await api.patch<ProjectPageWriteResult>(`/api/projects/${root.id}/pages/reflections`, { enabled: false });
  expect(disabled.operation).toBeNull();
  // And its content is untouched by the disable, in either direction.
  await step(root.id, 'undo');
  await expect.poll(async () => (await pageOf(root.id, 'reflections'))?.enabled).toBe(true);
  expect(await rootState(root.id)).not.toBe(before);
  await expect(page.locator('[data-project-page-tab][data-page-kind="reflections"]')).toBeVisible();
});
