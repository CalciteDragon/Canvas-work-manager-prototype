import type {
  OperationHistorySummary,
  OperationHistoryTransitionResult,
  ProjectPage,
  ProjectSection,
  SectionShortcut,
} from '@cwm/contracts';
import { expect, test } from '@playwright/test';
import { addSection, api, createRoot, createSubprojects, seed, setClock } from './seed';

/**
 * Slice 37's browser half. There is no header Undo control yet — that is explicitly later Stage C
 * work — so the person's gestures come from the real UI and the transitions are driven through the
 * **same user's** HTTP history endpoint, which is what a header control will call. What is under
 * test here is reconciliation: that a canvas someone is looking at, in this tab and in another,
 * shows what the history just did.
 */

const history = (projectId: string) => api.get<OperationHistorySummary>(`/api/projects/${projectId}/history`);

const step = async (projectId: string, direction: 'undo' | 'redo') => {
  const summary = await history(projectId);
  const next = summary[direction];
  if (summary.historyId === null || next === null) throw new Error(`nothing to ${direction} in ${projectId}`);
  return api.post<OperationHistoryTransitionResult>(`/api/history/${summary.historyId}/transition`, {
    actionId: next.actionId,
    expectedRevision: summary.revision,
    direction,
  });
};

const pageId = async (projectId: string, kind = 'home'): Promise<string> => {
  const pages = await api.get<ProjectPage[]>(`/api/projects/${projectId}/pages`);
  const page = pages.find((candidate) => candidate.kind === kind);
  if (page === undefined) throw new Error(`Project ${projectId} has no ${kind} page`);
  return page.id;
};

const placements = (projectId: string, home: string) =>
  api.get<SectionShortcut[]>(`/api/projects/${projectId}/shortcuts?pageId=${home}`);

test('shortcut gestures record once and HTTP history reconciles both open canvases', async ({ page, context }) => {
  await seed('empty');
  await setClock('2026-09-20T12:00:00.000Z');
  const root = await createRoot('Shortcut history');
  const [child] = await createSubprojects(root.id, 1);
  const source = await addSection(child!.id, { type: 'task-list', title: 'Shortcut candidate' });
  await addSection(root.id, { type: 'rich-text', title: 'Local prose' });
  const home = await pageId(root.id);

  await page.goto(`/projects/${root.id}`);
  const watcher = await context.newPage();
  await watcher.goto(`/projects/${root.id}`);
  await expect(page.locator('[data-section-frame]', { hasText: 'Local prose' })).toBeVisible();
  const baseline = (await history(root.id)).revision;

  // Add through the contextual dialog the canvas actually offers.
  await page.locator('app-insertion-point[data-insertion-point="end"] button').click();
  await page.locator('[data-create-shortcut-mode]').click();
  await page.locator('[data-shortcut-source-option]', { hasText: 'Shortcut candidate' })
    .locator('[data-shortcut-add]').click();
  await expect(page.locator('[data-section-create-dialog]')).toHaveCount(0);
  const frame = page.locator('[data-shortcut-frame]', { hasText: 'Shortcut candidate' });
  await expect(frame).toBeVisible();
  await expect(watcher.locator('[data-shortcut-frame]')).toHaveCount(1);
  expect((await history(root.id)).revision).toBe(baseline + 1);
  const [placed] = await placements(root.id, home);

  // Collapsing is one committed gesture, so it is one action; collapsing back is another.
  await frame.locator('[data-shortcut-collapse]').click();
  await expect(frame.locator('[data-shortcut-collapse]')).toHaveAttribute('aria-expanded', 'false');
  expect((await history(root.id)).revision).toBe(baseline + 2);

  await page.locator(`[data-shortcut-frame] [data-shortcut-remove]`).click();
  await expect(page.locator('[data-shortcut-frame]')).toHaveCount(0);
  await expect(watcher.locator('[data-shortcut-frame]')).toHaveCount(0);
  expect((await history(root.id)).revision).toBe(baseline + 3);

  // Undo the removal, the collapse and the add in the only order a cursor allows, watching both
  // tabs follow along.
  await step(root.id, 'undo');
  await expect(page.locator('[data-shortcut-frame]')).toHaveCount(1);
  await expect(watcher.locator('[data-shortcut-frame]')).toHaveCount(1);
  expect((await placements(root.id, home))[0]?.id).toBe(placed!.id);
  await step(root.id, 'undo');
  await expect(page.locator('[data-shortcut-frame] [data-shortcut-collapse]')).toHaveAttribute('aria-expanded', 'true');
  await step(root.id, 'undo');
  await expect(page.locator('[data-shortcut-frame]')).toHaveCount(0);
  await expect(watcher.locator('[data-shortcut-frame]')).toHaveCount(0);

  // The source section is untouched by every one of those steps: a shortcut owns a placement.
  expect(
    (await api.get<ProjectSection[]>(`/api/projects/${child!.id}/sections`)).some(({ id }) => id === source.id),
  ).toBe(true);

  for (const direction of ['redo', 'redo', 'redo'] as const) await step(root.id, direction);
  await expect(page.locator('[data-shortcut-frame]')).toHaveCount(0);
  await step(root.id, 'undo');
  await page.reload();
  await expect(page.locator('[data-shortcut-frame]', { hasText: 'Shortcut candidate' })).toBeVisible();
  expect((await placements(root.id, home))[0]).toMatchObject({ id: placed!.id, collapsed: true });
});

test('Archive Restore records its own action and the canvas follows Undo and Redo of it', async ({ page, context }) => {
  await seed('empty');
  await setClock('2026-09-20T12:00:00.000Z');
  const root = await createRoot('Restore history');
  await api.patch(`/api/projects/${root.id}/pages/archive`, { enabled: true });
  const prose = await addSection(root.id, { type: 'rich-text', title: 'Worth keeping' });
  await api.patch(`/api/sections/${prose.id}`, { config: { text: 'Prose worth keeping' } });

  await page.goto(`/projects/${root.id}`);
  const frame = page.locator(`[data-section-item][data-section-id="${prose.id}"]`);
  await expect(frame).toBeVisible();
  await frame.locator('[data-section-remove]').click();
  await expect(page.locator(`[data-section-item][data-section-id="${prose.id}"]`)).toHaveCount(0);

  const archive = await context.newPage();
  await archive.goto(`/projects/${root.id}/pages/archive`);
  const entry = archive.locator(`[data-archived-item][data-archived-id="${prose.id}"]`);
  await expect(entry).toBeVisible();
  const beforeRestore = (await history(root.id)).revision;

  await entry.locator('[data-archived-restore]').click();
  await expect(archive.locator(`[data-archived-item][data-archived-id="${prose.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-section-item][data-section-id="${prose.id}"]`)).toBeVisible();
  // Restore records an action of its own — it is not the removal reversed.
  expect((await history(root.id)).revision).toBe(beforeRestore + 1);
  expect((await history(root.id)).undo?.operation).toBe('section.restore');

  await step(root.id, 'undo');
  await expect(page.locator(`[data-section-item][data-section-id="${prose.id}"]`)).toHaveCount(0);
  await expect(archive.locator(`[data-archived-item][data-archived-id="${prose.id}"]`)).toBeVisible();
  await step(root.id, 'redo');
  await expect(page.locator(`[data-section-item][data-section-id="${prose.id}"]`)).toBeVisible();

  // The removal underneath is still its own step, reachable once the Restore is undone.
  await step(root.id, 'undo');
  expect((await history(root.id)).undo?.operation).toBe('section.remove');
  await step(root.id, 'undo');
  await page.reload();
  await expect(page.locator(`[data-section-item][data-section-id="${prose.id}"]`)).toBeVisible();
  expect((await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections`)).some(({ id }) => id === prose.id)).toBe(true);
});

test('duplication records the add it is, and Undo and Redo keep the copy’s identity', async ({ page }) => {
  await seed('empty');
  await setClock('2026-09-20T12:00:00.000Z');
  const root = await createRoot('Duplicate history');
  const original = await addSection(root.id, { type: 'rich-text', title: 'Original' });
  await api.patch(`/api/sections/${original.id}`, { config: { text: 'Copy me' } });
  await page.goto(`/projects/${root.id}`);
  await expect(page.locator(`[data-section-item][data-section-id="${original.id}"]`)).toBeVisible();

  // Duplication is an HTTP action in this phase: the frame offers no Duplicate control yet.
  const copy = await api.post<{ section: ProjectSection; operation: { operation: string } }>(
    `/api/sections/${original.id}/duplicate`,
    undefined,
  );
  expect(copy.operation.operation).toBe('section.add');
  await expect(page.locator(`[data-section-item][data-section-id="${copy.section.id}"]`)).toBeVisible();
  // The copy is directly below its original, with a detached config and no rows of its own.
  const order = await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections`);
  expect(order.map(({ id }) => id)).toEqual([original.id, copy.section.id]);
  expect(copy.section.config).toEqual({ text: 'Copy me' });

  await step(root.id, 'undo');
  await expect(page.locator(`[data-section-item][data-section-id="${copy.section.id}"]`)).toHaveCount(0);
  await step(root.id, 'redo');
  await expect(page.locator(`[data-section-item][data-section-id="${copy.section.id}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-section-item][data-section-id="${copy.section.id}"]`)).toBeVisible();
});
