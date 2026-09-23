import type {
  OperationHistorySummary,
  OperationHistoryTransitionResult,
  OperationReceipt,
  ProjectSection,
  ResolvedSectionShortcut,
  SectionAddResult,
  SectionWriteResult,
} from '@cwm/contracts';
import { expect, test } from '@playwright/test';
import { historyControl, historyFeedback, undoFromHeader } from './history-controls';
import { PROTOTYPE_HOST, addSection, api, connectMcp, createRoot, seed, setClock, setLayout } from './seed';

const NOW = '2026-09-15T12:00:00.000Z';
const PERSONA = { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' };

const orderOf = async (projectId: string, pageId: string): Promise<string[]> => {
  const [sections, shortcuts] = await Promise.all([
    api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${pageId}`),
    api.get<ResolvedSectionShortcut[]>(`/api/projects/${projectId}/shortcuts?pageId=${pageId}`),
  ]);
  return [...sections, ...shortcuts].sort((left, right) => left.position - right.position).map(({ id }) => id);
};

const summaryOf = (projectId: string): Promise<OperationHistorySummary> => api.get<OperationHistorySummary>(`/api/projects/${projectId}/history`);

/** One step of `receipt`'s action through the transition route, at the history's current revision. */
const step = async (projectId: string, receipt: OperationReceipt, direction: 'undo' | 'redo' = 'undo') => {
  const { revision } = await summaryOf(projectId);
  const transition = await api.post<OperationHistoryTransitionResult>(`/api/history/${receipt.historyId}/transition`, {
    actionId: receipt.actionId, direction, expectedRevision: revision,
  });
  return transition.result;
};

test('HTTP and MCP section edits return typed receipts and restore only their own work', async ({ page }) => {
  await seed('nested-projects');
  await setClock(NOW);
  const projectId = 'project-renovation';
  const homePageId = 'page-project-renovation';

  const added = await api.post<SectionAddResult>(`/api/projects/${projectId}/sections`, {
    type: 'rich-text',
    title: 'Added through HTTP',
    config: { text: 'Initial prose' },
  });
  expect(added.operation.operation).toBe('section.add');
  const addUndo = await step(projectId, added.operation);
  expect(addUndo).toMatchObject({ operation: 'section.add', outcome: 'removed', sectionId: added.section.id });
  expect((await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homePageId}`)).some(({ id }) => id === added.section.id)).toBe(false);
  // Redo brings the same section id back; Undo takes it away again.
  expect(await step(projectId, added.operation, 'redo')).toMatchObject({ operation: 'section.add', section: { id: added.section.id } });
  expect((await summaryOf(projectId)).undo?.actionId).toBe(added.operation.actionId);
  await step(projectId, added.operation);

  const editable = await addSection(projectId, {
    type: 'rich-text',
    title: 'Original title',
    columnSpan: 12,
    config: { text: 'Original prose', tone: 'calm' },
  });
  const updated = await api.patch<SectionWriteResult>(`/api/sections/${editable.id}`, {
    title: 'Edited title',
    config: { text: 'Edited prose', tone: 'loud' },
    collapsed: true,
    columnSpan: 8,
  });
  expect(updated.operation?.operation).toBe('section.update');
  const updateUndo = await step(projectId, updated.operation!);
  expect(updateUndo).toMatchObject({ operation: 'section.update', outcome: 'restored', section: { id: editable.id } });
  const restored = (await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homePageId}`)).find(({ id }) => id === editable.id);
  expect(restored).toMatchObject({
    id: editable.id,
    title: editable.title,
    config: editable.config,
    collapsed: editable.collapsed,
    columnSpan: editable.columnSpan,
  });

  const client = await connectMcp('prototype-user-a-readwrite', 'cwm-section-edit-undo-e2e');
  try {
    const disjoint = await addSection(projectId, {
      type: 'rich-text',
      title: 'User title',
      config: { text: 'User prose' },
    });
    const userUpdate = await api.patch<SectionWriteResult>(`/api/sections/${disjoint.id}`, { title: 'User renamed' });
    const agentUpdate = await client.callTool({
      name: 'update_section',
      arguments: { sectionId: disjoint.id, config: { text: 'Agent prose' } },
    });
    expect(agentUpdate.isError).not.toBe(true);
    const disjointUndo = await step(projectId, userUpdate.operation!);
    expect(disjointUndo).toMatchObject({ operation: 'section.update', section: { id: disjoint.id, title: 'User title' } });
    const disjointAfter = (await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homePageId}`)).find(({ id }) => id === disjoint.id);
    expect(disjointAfter).toMatchObject({ title: 'User title', config: { text: 'Agent prose' } });

    const overlapping = await api.patch<SectionWriteResult>(`/api/sections/${editable.id}`, { title: 'User change' });
    const agentOverlap = await client.callTool({
      name: 'update_section',
      arguments: { sectionId: editable.id, title: 'Agent change' },
    });
    expect(agentOverlap.isError).not.toBe(true);
    const refusal = await fetch(`${PROTOTYPE_HOST}/api/history/${overlapping.operation!.historyId}/transition`, {
      method: 'POST',
      headers: PERSONA,
      body: JSON.stringify({ actionId: overlapping.operation!.actionId, direction: 'undo', expectedRevision: (await summaryOf(projectId)).revision }),
    });
    expect(refusal.status).toBe(409);
    expect((await refusal.json()).details.reason).toBe('history_conflict');
  } finally {
    await client.close();
  }

  const moved = await addSection(projectId, { type: 'progress', title: 'Move me' });
  const originalOrder = await orderOf(projectId, homePageId);
  const move = await api.post<SectionWriteResult>(`/api/sections/${moved.id}/move`, { position: 0 });
  expect(move.operation?.operation).toBe('section.move');
  const movedOrder = await orderOf(projectId, homePageId);
  expect(movedOrder).not.toEqual(originalOrder);
  const moveUndo = await step(projectId, move.operation!);
  expect(moveUndo).toMatchObject({ operation: 'section.move', outcome: 'restored', section: { id: moved.id } });
  expect(await orderOf(projectId, homePageId)).toEqual(originalOrder);
  // The undo-then-redo round trip over the transition route: Redo reapplies exactly the move.
  expect((await summaryOf(projectId)).redo?.actionId).toBe(move.operation!.actionId);
  expect(await step(projectId, move.operation!, 'redo')).toMatchObject({ operation: 'section.move', section: { id: moved.id } });
  expect(await orderOf(projectId, homePageId)).toEqual(movedOrder);
  await step(projectId, move.operation!);
  expect(await orderOf(projectId, homePageId)).toEqual(originalOrder);

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator(`[data-section-item][data-section-id="${moved.id}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-section-item][data-section-id="${moved.id}"]`)).toBeVisible();
});

test('canvas gestures and the Reflections page are undone from the header, and survive reload', async ({ page }) => {
  await seed('nested-projects');
  await setClock(NOW);
  const projectId = 'project-renovation';
  const homePageId = 'page-project-renovation';
  await setLayout(projectId, 'grid');

  const notes = await addSection(projectId, {
    type: 'rich-text',
    title: 'Undo notes',
    columnSpan: 12,
    config: { text: 'Keep this prose' },
  });
  const beforeOrder = await orderOf(projectId, homePageId);
  await page.goto(`/projects/${projectId}`);

  const endInsertion = page.locator('app-insertion-point[data-insertion-point="end"] [data-insertion-point-button]');
  await endInsertion.click();
  await page.locator('[data-create-section-type]').selectOption('rich-text');
  await page.locator('[data-create-section-name]').fill('Contextual add');
  await page.locator('[data-create-section-submit]').click();
  const added = (await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homePageId}`)).find(({ title }) => title === 'Contextual add');
  if (added === undefined) throw new Error('The contextual section was not created');
  // Slice 41: a forward write shows no notice; the header's label is its confirmation.
  await undoFromHeader(page, 'Added the Contextual add section');
  await expect(page.locator('[data-recovery-notice]')).toHaveCount(0);
  await expect(page.locator(`[data-section-item][data-section-id="${added.id}"]`)).toHaveCount(0);

  const notesFrame = page.locator(`[data-section-item][data-section-id="${notes.id}"]`);
  await notesFrame.locator('[data-section-title-edit]').click();
  await notesFrame.locator('[data-section-name]').fill('Renamed notes');
  await notesFrame.locator('[data-section-name]').press('Enter');
  await undoFromHeader(page, 'Updated the Undo notes section');
  await expect(notesFrame.locator('[data-section-title-edit]')).toContainText('Undo notes');

  await notesFrame.locator('[data-rich-text-body]').fill('Changed prose');
  await notesFrame.locator('[data-rich-text-body]').press('Tab');
  await undoFromHeader(page, 'Updated the Undo notes section');
  expect((await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homePageId}`)).find(({ id }) => id === notes.id)?.config).toEqual({ text: 'Keep this prose' });

  await notesFrame.locator('[data-section-collapse]').click();
  await expect(notesFrame.locator('[data-section-collapse]')).toHaveAttribute('aria-expanded', 'false');
  await undoFromHeader(page, 'Updated the Undo notes section');
  await expect(notesFrame.locator('[data-section-collapse]')).toHaveAttribute('aria-expanded', 'true');

  const resize = notesFrame.locator('app-section-resize-handle[data-edge="end"] [data-resize-handle]');
  await resize.press('ArrowLeft');
  await resize.press('Enter');
  await expect(notesFrame).toHaveClass(/section-canvas__item--span-8/);
  await undoFromHeader(page, 'Updated the Undo notes section');
  await expect(notesFrame).toHaveClass(/section-canvas__item--span-12/);

  const moveHandle = notesFrame.locator('[data-section-drag-handle]');
  await moveHandle.press('ArrowUp');
  await undoFromHeader(page, 'Moved the Undo notes section');
  await expect.poll(() => orderOf(projectId, homePageId)).toEqual(beforeOrder);
  await page.reload();
  // The history is the server's: after a reload the header offers the move's Redo.
  await expect(historyControl(page, 'redo')).toHaveAttribute('aria-label', 'Redo: Moved the Undo notes section');
  await expect(page.locator(`[data-section-item][data-section-id="${notes.id}"]`)).toBeVisible();

  const reflectionsProject = await createRoot('Reflections Undo journey');
  await api.patch(`/api/projects/${reflectionsProject.id}/pages/reflections`, { enabled: true });
  await page.goto(`/projects/${reflectionsProject.id}/pages/reflections`);
  await expect(page.locator('[data-reflections-page]')).toBeVisible();
  await expect(page.locator('[data-reflections-no-container]')).toBeVisible();
  await page.locator('[data-reflections-add-container]').click();
  await expect(page.locator('[data-reflections-container-name]')).toBeVisible();
  await expect(page.locator('[data-recovery-notice]')).toHaveCount(0);
  // The container add's live frame returns the page to its prompt without a reload.
  await undoFromHeader(page, 'Added the Reflections section');
  await expect(page.locator('[data-reflections-no-container]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-reflections-no-container]')).toBeVisible();

  // A reflection authored into the added container is the next step, not the add beneath it.
  await page.locator('[data-reflections-add-container]').click();
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', 'Undo: Added the Reflections section');
  await page.locator('[data-reflection-body]').fill('Written after the add.');
  await page.locator('[data-reflections-composer-region] [data-reflection-create] button[type="submit"]').click();
  await expect(page.locator('[data-reflections-entry]')).toHaveCount(1);
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', /^Undo: Wrote /);
  await page.reload();
  await expect(page.locator('[data-reflections-entry]')).toContainText('Written after the add.');
});

/**
 * Slice 33 (Refactor §26.8–10): real pointer gestures on the nested Kitchen canvas, an injected
 * failure that must keep the receipt, and an agent's overlapping edit that must refuse Undo.
 */
const KITCHEN = 'project-kitchen';
const KITCHEN_PAGE = 'page-project-kitchen';

/** A sub-project canvas holds no shortcuts, so its order is its sections alone. */
const kitchenOrder = async (): Promise<string[]> =>
  (await api.get<ProjectSection[]>(`/api/projects/${KITCHEN}/sections?pageId=${KITCHEN_PAGE}`))
    .sort((left, right) => left.position - right.position).map(({ id }) => id);

const spanOf = async (sectionId: string): Promise<number | undefined> =>
  (await api.get<ProjectSection[]>(`/api/projects/${KITCHEN}/sections?pageId=${KITCHEN_PAGE}`)).find(({ id }) => id === sectionId)?.columnSpan;

const pointerResize = async (page: import('@playwright/test').Page, sectionId: string, from: 12 | 6, to: 12 | 6, mode: 'flow' | 'grid') => {
  const canvas = page.locator('[data-section-canvas]');
  const delta = await canvas.evaluate((element, spans) => {
    const width = element.getBoundingClientRect().width;
    const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
    const column = (width - 11 * gap) / 12;
    const widthFor = (span: number) => spans.mode === 'flow' ? (span / 12) * width : span * column + (span - 1) * gap;
    return widthFor(spans.to) - widthFor(spans.from);
  }, { from, to, mode });
  const handle = page.locator(`[data-section-item][data-section-id="${sectionId}"] app-section-resize-handle[data-edge="end"] [data-resize-handle]`);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (box === null) throw new Error('Resize handle has no browser box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) await page.mouse.move(box.x + box.width / 2 + (delta * step) / 8, box.y + box.height / 2);
  await page.mouse.up();
};

const pointerMoveBefore = async (page: import('@playwright/test').Page, sectionId: string, targetId: string) => {
  const grip = page.locator(`[data-section-item][data-section-id="${sectionId}"] [data-section-drag-handle]`);
  const target = page.locator(`[data-section-item][data-section-id="${targetId}"]`);
  await target.scrollIntoViewIfNeeded();
  const gripBox = await grip.boundingBox();
  const targetBox = await target.boundingBox();
  if (gripBox === null || targetBox === null) throw new Error('Move geometry did not render');
  const start = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y, { steps: 3 });
  // CDK clones the item into a preview and a placeholder while sorting, so ask the list instead.
  await expect(page.locator('[data-section-canvas]')).toHaveClass(/cdk-drop-list-dragging/);
  const end = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + 8 };
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(start.x + 12 + ((end.x - start.x - 12) * step) / 12, start.y + ((end.y - start.y) * step) / 12);
  }
  await page.mouse.up();
};

const openFailurePanel = async (page: import('@playwright/test').Page, rate: '0' | '1'): Promise<void> => {
  await page.keyboard.press('Control+Shift+D');
  const panel = page.locator('[data-dev-panel]');
  await expect(panel).toBeVisible();
  await panel.locator(`[data-panel-failure][data-rate="${rate}"]`).click();
  await panel.locator('[data-dev-panel-close]').click();
  await expect(panel).toHaveCount(0);
};

for (const mode of ['flow', 'grid'] as const) {
  test(`nested pointer move and resize Undo preserve persisted layout (${mode})`, async ({ page }) => {
    await seed('nested-projects');
    await setClock(NOW);
    await setLayout(KITCHEN, mode);
    await page.setViewportSize({ width: 1440, height: 1200 });
    const brief = 'section-project-kitchen-brief';
    const subProjects = 'section-project-kitchen-sub-projects';
    const originalOrder = await kitchenOrder();
    await page.goto(`/projects/${KITCHEN}`);
    await expect(page.locator('[data-project-name]')).toHaveText('Kitchen');

    await pointerResize(page, brief, 12, 6, mode);
    await expect.poll(() => spanOf(brief)).toBe(6);
    await expect(page.locator(`[data-section-item][data-section-id="${brief}"]`)).toHaveClass(/section-canvas__item--span-6/);
    await undoFromHeader(page, /^Undo: Updated the .+ section$/);
    await expect.poll(() => spanOf(brief)).toBe(12);
    await page.reload();
    await expect(page.locator(`[data-section-item][data-section-id="${brief}"]`)).toHaveClass(/section-canvas__item--span-12/);
    expect(await spanOf(brief)).toBe(12);

    await pointerMoveBefore(page, subProjects, brief);
    await expect.poll(async () => (await kitchenOrder()).indexOf(subProjects)).toBe(0);
    await undoFromHeader(page, /^Undo: Moved the .+ section$/);
    await expect.poll(() => kitchenOrder()).toEqual(originalOrder);
    await page.reload();
    await expect(page.locator('[data-section-item]').first()).toHaveAttribute('data-section-id', brief);
    expect(await kitchenOrder()).toEqual(originalOrder);
  });
}

test('nested injected failure leaves the history readable again and the step retryable', async ({ page }) => {
  await seed('nested-projects');
  await setClock(NOW);
  const timeline = 'section-project-kitchen-timeline';
  const originalOrder = await kitchenOrder();
  await page.goto(`/projects/${KITCHEN}`);
  const grip = page.locator(`[data-section-item][data-section-id="${timeline}"] [data-section-drag-handle]`);
  await grip.focus();
  await grip.press('ArrowUp');
  await expect.poll(async () => (await kitchenOrder()).indexOf(timeline)).toBe(originalOrder.indexOf(timeline) - 1);
  const moved = await kitchenOrder();
  const undoRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/history/')) undoRequests.push(request.url());
  });

  const undo = historyControl(page, 'undo');
  await expect(undo).toHaveAttribute('aria-label', /^Undo: Moved the .+ section$/);
  try {
    // Reads have settled; only now make every client request fail before it reaches the host.
    await openFailurePanel(page, '1');
    await undo.click();
    // The transition may or may not have landed, so the store re-reads rather than guessing —
    // and that read fails too, which leaves the controls honest: unavailable, with Retry.
    await expect(historyFeedback(page)).toContainText('may not have completed');
    await expect(undo).toHaveAttribute('aria-label', 'History unavailable');
    expect(undoRequests).toEqual([]);
  } finally {
    await openFailurePanel(page, '0');
  }
  expect(await kitchenOrder()).toEqual(moved);

  await page.locator('[data-history-retry]').click();
  await undoFromHeader(page, /^Undo: Moved the .+ section$/);
  await expect.poll(() => kitchenOrder()).toEqual(originalOrder);
  expect(undoRequests).toHaveLength(1);
  await page.reload();
  expect(await kitchenOrder()).toEqual(originalOrder);
});

test('agent overlap refuses Undo without losing newer content', async ({ page }) => {
  await seed('nested-projects');
  await setClock(NOW);
  const brief = 'section-project-kitchen-brief';
  await page.goto(`/projects/${KITCHEN}`);
  const frame = page.locator(`[data-section-item][data-section-id="${brief}"]`);
  await frame.locator('[data-section-title-edit]').click();
  await frame.locator('[data-section-name]').fill('User heading');
  await frame.locator('[data-section-name]').press('Enter');
  const label = /^Undo: Updated the .+ section$/;
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', label);

  const client = await connectMcp('prototype-user-a-readwrite', 'cwm-slice-33-overlap');
  try {
    const agentEdit = await client.callTool({ name: 'update_section', arguments: { sectionId: brief, title: 'Agent heading' } });
    expect(agentEdit.isError).not.toBe(true);
  } finally {
    await client.close();
  }
  await expect(frame.locator('[data-section-title-edit]')).toContainText('Agent heading');

  await undoFromHeader(page, label);
  await expect(page.locator('[data-history-conflict]')).toHaveCount(1);
  // The agent's edit is in the agent connection's own history, never this person's, so the repair
  // is to make the change by hand — never a receipt this person cannot use (note-2026-09-15-005).
  await expect(page.locator('[data-history-conflict]')).toContainText('Someone else changed it since. Make the change again by hand.');
  // A changed field can be changed back, so the refusal is repairable and Undo stays enabled.
  await expect(historyControl(page, 'undo')).toHaveAttribute('aria-label', label);
  await expect(historyControl(page, 'undo')).not.toHaveAttribute('aria-disabled', 'true');
  await page.reload();
  await expect(frame.locator('[data-section-title-edit]')).toContainText('Agent heading');
  expect((await api.get<ProjectSection[]>(`/api/projects/${KITCHEN}/sections?pageId=${KITCHEN_PAGE}`)).find(({ id }) => id === brief)?.title).toBe('Agent heading');
});
