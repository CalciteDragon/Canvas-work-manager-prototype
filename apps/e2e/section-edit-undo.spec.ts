import type {
  ProjectSection,
  ResolvedSectionShortcut,
  SectionAddResult,
  SectionWriteResult,
  UndoResult,
} from '@cwm/contracts';
import { expect, test } from '@playwright/test';
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

const undo = (undoId: string): Promise<UndoResult> => api.post<UndoResult>(`/api/undo/${undoId}`, undefined);

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
  expect(added.undo.operation).toBe('section.add');
  const addUndo = await undo(added.undo.undoId);
  expect(addUndo).toMatchObject({ operation: 'section.add', outcome: 'removed', sectionId: added.section.id });
  expect((await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homePageId}`)).some(({ id }) => id === added.section.id)).toBe(false);

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
  expect(updated.undo?.operation).toBe('section.update');
  const updateUndo = await undo(updated.undo!.undoId);
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
    const disjointUndo = await undo(userUpdate.undo!.undoId);
    expect(disjointUndo).toMatchObject({ operation: 'section.update', section: { id: disjoint.id, title: 'User title' } });
    const disjointAfter = (await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homePageId}`)).find(({ id }) => id === disjoint.id);
    expect(disjointAfter).toMatchObject({ title: 'User title', config: { text: 'Agent prose' } });

    const overlapping = await api.patch<SectionWriteResult>(`/api/sections/${editable.id}`, { title: 'User change' });
    const agentOverlap = await client.callTool({
      name: 'update_section',
      arguments: { sectionId: editable.id, title: 'Agent change' },
    });
    expect(agentOverlap.isError).not.toBe(true);
    const refusal = await fetch(`${PROTOTYPE_HOST}/api/undo/${overlapping.undo!.undoId}`, {
      method: 'POST',
      headers: PERSONA,
    });
    expect(refusal.status).toBe(409);
    expect((await refusal.json()).details.reason).toBe('undo_conflict');
  } finally {
    await client.close();
  }

  const moved = await addSection(projectId, { type: 'progress', title: 'Move me' });
  const originalOrder = await orderOf(projectId, homePageId);
  const move = await api.post<SectionWriteResult>(`/api/sections/${moved.id}/move`, { position: 0 });
  expect(move.undo?.operation).toBe('section.move');
  expect(await orderOf(projectId, homePageId)).not.toEqual(originalOrder);
  const moveUndo = await undo(move.undo!.undoId);
  expect(moveUndo).toMatchObject({ operation: 'section.move', outcome: 'restored', section: { id: moved.id } });
  expect(await orderOf(projectId, homePageId)).toEqual(originalOrder);

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator(`[data-section-item][data-section-id="${moved.id}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-section-item][data-section-id="${moved.id}"]`)).toBeVisible();
});

test('canvas gestures and the Reflections page offer operation-neutral Undo after reload', async ({ page }) => {
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
  await expect(page.locator('[data-undo-notice]')).toContainText('Undo is available');
  await page.locator('[data-undo-action]').click();
  await expect(page.locator(`[data-section-item][data-section-id="${added.id}"]`)).toHaveCount(0);

  const notesFrame = page.locator(`[data-section-item][data-section-id="${notes.id}"]`);
  await notesFrame.locator('[data-section-title-edit]').click();
  await notesFrame.locator('[data-section-name]').fill('Renamed notes');
  await notesFrame.locator('[data-section-name]').press('Enter');
  await expect(page.locator('[data-undo-notice]')).toContainText('Undo is available');
  await page.locator('[data-undo-action]').click();
  await expect(notesFrame.locator('[data-section-title-edit]')).toContainText('Undo notes');

  await notesFrame.locator('[data-rich-text-body]').fill('Changed prose');
  await notesFrame.locator('[data-rich-text-body]').press('Tab');
  await expect(page.locator('[data-undo-notice]')).toContainText('Undo is available');
  await page.locator('[data-undo-action]').click();
  expect((await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homePageId}`)).find(({ id }) => id === notes.id)?.config).toEqual({ text: 'Keep this prose' });

  await notesFrame.locator('[data-section-collapse]').click();
  await expect(notesFrame.locator('[data-section-collapse]')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('[data-undo-action]').click();
  await expect(notesFrame.locator('[data-section-collapse]')).toHaveAttribute('aria-expanded', 'true');

  const resize = notesFrame.locator('app-section-resize-handle[data-edge="end"] [data-resize-handle]');
  await resize.press('ArrowLeft');
  await resize.press('Enter');
  await expect(notesFrame).toHaveClass(/section-canvas__item--span-8/);
  await page.locator('[data-undo-action]').click();
  await expect(notesFrame).toHaveClass(/section-canvas__item--span-12/);

  const moveHandle = notesFrame.locator('[data-section-drag-handle]');
  await moveHandle.press('ArrowUp');
  await expect(page.locator('[data-undo-notice]')).toContainText('Undo is available');
  await page.locator('[data-undo-action]').click();
  expect(await orderOf(projectId, homePageId)).toEqual(beforeOrder);
  await page.reload();
  await expect(page.locator('[data-undo-notice]')).toHaveCount(0);
  await expect(page.locator(`[data-section-item][data-section-id="${notes.id}"]`)).toBeVisible();

  const reflectionsProject = await createRoot('Reflections Undo journey');
  await api.patch(`/api/projects/${reflectionsProject.id}/pages/reflections`, { enabled: true });
  await page.goto(`/projects/${reflectionsProject.id}/pages/reflections`);
  await expect(page.locator('[data-reflections-page]')).toBeVisible();
  await expect(page.locator('[data-reflections-no-container]')).toBeVisible();
  await page.locator('[data-reflections-add-container]').click();
  await expect(page.locator('[data-reflections-container-name]')).toBeVisible();
  await expect(page.locator('[data-undo-notice]')).toContainText('Undo is available');
  await page.locator('[data-undo-action]').click();
  await page.reload();
  await expect(page.locator('[data-reflections-no-container]')).toBeVisible();

  // A reflection authored into the added container makes its removal destructive.
  await page.locator('[data-reflections-add-container]').click();
  await expect(page.locator('[data-undo-notice]')).toContainText('Undo is available');
  await page.locator('[data-reflection-body]').fill('Written after the add.');
  await page.locator('[data-reflections-composer-region] [data-reflection-create] button[type="submit"]').click();
  await expect(page.locator('[data-reflections-entry]')).toHaveCount(1);
  await page.locator('[data-undo-action]').click();
  await expect(page.locator('[data-undo-conflict]')).toHaveCount(1);
  await expect(page.locator('[data-reflections-entry]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-reflections-entry]')).toContainText('Written after the add.');
});
