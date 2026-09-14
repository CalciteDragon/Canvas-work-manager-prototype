import type { ProjectPage, ProjectSection, ResolvedSectionShortcut, SectionShortcut } from '@cwm/contracts';
import { expect, test } from '@playwright/test';
import { addSection, api, createRoot, createSubprojects, seed, setClock } from './seed';

const PINNED_NOW = '2026-09-15T12:00:00.000Z';

const archiveHasSection = async (projectId: string, sectionId: string): Promise<boolean> => {
  const archive = await api.get<{
    items: Array<{ kind: string; section?: { id: string } }>;
  }>(`/api/projects/${projectId}/archive`);
  return archive.items.some((item) => item.kind === 'section' && item.section?.id === sectionId);
};

const sectionById = async (projectId: string, sectionId: string): Promise<ProjectSection | undefined> =>
  (await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections`)).find(({ id }) => id === sectionId);

test('disposable sections stay out of Archive and Undo restores config, layout, and shortcut order', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  const root = await createRoot('Disposable Undo journey');
  const [child] = await createSubprojects(root.id, 1);
  if (child === undefined) throw new Error('The shortcut source project was not created');
  const pages = await api.get<ProjectPage[]>('/api/projects/' + root.id + '/pages');
  const home = pages.find(({ kind }) => kind === 'home');
  if (home === undefined) throw new Error('The root has no Home page');
  const source = await addSection(child.id, {
    type: 'rich-text',
    title: 'Shortcut source',
    config: { text: 'Retained source content.' },
  });
  const before = await addSection(root.id, {
    type: 'rich-text',
    title: 'Before removed views',
    position: 0,
    columnSpan: 6,
    config: { text: 'Before.' },
  });
  const sections = [
    await addSection(root.id, { type: 'progress', title: 'Progress', position: 1, columnSpan: 4, config: {} }),
    await addSection(root.id, { type: 'timeline', title: 'Timeline', position: 2, columnSpan: 8, config: {} }),
    await addSection(root.id, { type: 'recent-activity', title: 'Recent Activity', position: 3, columnSpan: 6, config: {} }),
    await addSection(root.id, {
      type: 'rich-text',
      title: 'Empty notes',
      position: 4,
      columnSpan: 12,
      config: { text: '  \n ' },
    }),
  ];
  const after = await addSection(root.id, {
    type: 'rich-text',
    title: 'After removed views',
    position: 5,
    columnSpan: 4,
    config: { text: 'After.' },
  });
  await api.patch('/api/sections/' + sections[1]!.id, { collapsed: true });
  await api.patch('/api/sections/' + sections[3]!.id, { collapsed: true });
  const shortcut = await api.post<SectionShortcut>('/api/projects/' + root.id + '/shortcuts', {
    pageId: home.id,
    sourceSectionId: source.id,
    position: 2,
    columnSpan: 4,
  });
  const combinedLayout = async () => {
    const [canonical, shortcuts] = await Promise.all([
      api.get<ProjectSection[]>('/api/projects/' + root.id + '/sections?pageId=' + home.id),
      api.get<ResolvedSectionShortcut[]>('/api/projects/' + root.id + '/shortcuts?pageId=' + home.id),
    ]);
    return [
      ...canonical.map(({ id, position, columnSpan, collapsed }) => ({ kind: 'section', id, position, columnSpan, collapsed })),
      ...shortcuts.map(({ id, position, columnSpan, collapsed }) => ({ kind: 'shortcut', id, position, columnSpan, collapsed })),
    ].sort((left, right) => left.position - right.position);
  };
  const originalLayout = await combinedLayout();
  const originalSections = await api.get<ProjectSection[]>('/api/projects/' + root.id + '/sections?pageId=' + home.id);
  const originalOrder = originalSections.map(({ id }) => id);
  expect(originalLayout.map(({ id }) => id)).toEqual([before.id, sections[0]!.id, shortcut.id, sections[1]!.id, sections[2]!.id, sections[3]!.id, after.id]);

  await page.goto(`/projects/${root.id}`);
  await expect(page.locator('[data-project-name]')).toHaveText(root.name);

  for (const [index, section] of sections.entries()) {
    const frame = page.locator(`[data-section-item][data-section-id="${section.id}"]`);
    const remove = frame.locator('[data-section-remove]');
    if (index === 0) {
      await remove.focus();
      await remove.press('Enter');
    } else {
      await remove.click();
    }

    await expect(page.locator('[data-undo-notice]')).toBeVisible();
    await expect(frame).toHaveCount(0);
    expect(await archiveHasSection(root.id, section.id)).toBe(false);

    const undo = page.locator('[data-undo-action]');
    if (index === 0) {
      await expect(undo).toBeFocused();
      await undo.press('Enter');
      await expect(frame.locator('[data-section-title]')).toBeFocused();
    } else {
      await undo.click();
    }

    await expect(frame).toBeVisible();
    const restored = await sectionById(root.id, section.id);
    const originalSection = originalSections.find(({ id }) => id === section.id);
    if (originalSection === undefined) throw new Error('The original section is missing from its canvas');
    expect(restored).toMatchObject({
      id: section.id,
      type: section.type,
      config: section.config,
      position: originalSection.position,
      columnSpan: originalSection.columnSpan,
      collapsed: originalSection.collapsed,
    });
    expect((await api.get<ProjectSection[]>('/api/projects/' + root.id + '/sections?pageId=' + home.id)).map(({ id }) => id)).toEqual(originalOrder);
    expect(await combinedLayout()).toEqual(originalLayout);
  }
});

test('the nested-projects seeded canvas removes and restores its Progress view in place', async ({ page }) => {
  await seed('nested-projects');
  const projectId = 'project-renovation';
  const homeId = 'page-project-renovation';
  const before = await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homeId}`);
  const progress = before.find(({ type }) => type === 'progress');
  expect(progress).toBeDefined();
  if (progress === undefined) throw new Error('nested-projects seed is missing its Home Progress view');

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
  const frame = page.locator(`[data-section-item][data-section-id="${progress.id}"]`);
  await frame.locator('[data-section-remove]').click();
  await expect(frame).toHaveCount(0);
  expect(await archiveHasSection(projectId, progress.id)).toBe(false);

  await page.locator('[data-undo-action]').click();
  await expect(frame).toBeVisible();
  const after = await api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${homeId}`);
  expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
  const restored = after.find(({ id }) => id === progress.id);
  expect(restored).toMatchObject({
    id: progress.id,
    type: progress.type,
    config: progress.config,
    position: progress.position,
  });
  expect(restored?.title).toBe(progress.title);
});

test('a shortcut on another browser page follows source removal and same-page Undo', async ({ page }) => {
  await seed('nested-projects');
  const sourceProjectId = 'project-kitchen';
  const homeProjectId = 'project-renovation';
  const sourcePages = await api.get<ProjectPage[]>(`/api/projects/${sourceProjectId}/pages`);
  const homePages = await api.get<ProjectPage[]>(`/api/projects/${homeProjectId}/pages`);
  const sourcePage = sourcePages.find(({ kind }) => kind === 'work');
  const homePage = homePages.find(({ kind }) => kind === 'home');
  if (sourcePage === undefined || homePage === undefined) throw new Error('The nested-projects seed is missing a canonical page');

  const sourceBefore = await api.get<ProjectSection[]>(
    `/api/projects/${sourceProjectId}/sections?pageId=${sourcePage.id}`,
  );
  const sourceSection = await addSection(sourceProjectId, {
    type: 'progress',
    title: 'Shortcut recovery progress',
    pageId: sourcePage.id,
    position: Math.floor(sourceBefore.length / 2),
    config: {},
  });
  const shortcut = await api.post<SectionShortcut>(`/api/projects/${homeProjectId}/shortcuts`, {
    pageId: homePage.id,
    sourceSectionId: sourceSection.id,
  });

  const sourceLayoutOf = async () =>
    (await api.get<ProjectSection[]>(`/api/projects/${sourceProjectId}/sections?pageId=${sourcePage.id}`))
      .map(({ id, position }) => ({ id, position }))
      .sort((left, right) => left.position - right.position);
  const homeLayoutOf = async () => {
    const [sections, shortcuts] = await Promise.all([
      api.get<ProjectSection[]>(`/api/projects/${homeProjectId}/sections?pageId=${homePage.id}`),
      api.get<ResolvedSectionShortcut[]>(`/api/projects/${homeProjectId}/shortcuts?pageId=${homePage.id}`),
    ]);
    return [...sections, ...shortcuts]
      .map(({ id, position }) => ({ id, position }))
      .sort((left, right) => left.position - right.position);
  };
  const sourceLayoutBefore = await sourceLayoutOf();
  const homeLayoutBefore = await homeLayoutOf();

  await page.goto(`/projects/${sourceProjectId}`);
  await expect(page.locator('[data-project-name]')).toHaveText('Kitchen');
  const sourceUrl = page.url();
  const sourceFrame = page.locator(`[data-section-item][data-section-id="${sourceSection.id}"]`);
  await expect(sourceFrame).toBeVisible();

  const homeBrowserPage = await page.context().newPage();
  try {
    await homeBrowserPage.goto(`/projects/${homeProjectId}`);
    await expect(homeBrowserPage.locator('[data-project-name]')).toHaveText('Home renovation');
    const shortcutFrame = homeBrowserPage
      .locator(`[data-shortcut-item][data-shortcut-id="${shortcut.id}"]`)
      .locator('[data-shortcut-frame]');
    await expect(shortcutFrame).toHaveAttribute('data-shortcut-availability', 'available');
    await expect(shortcutFrame.locator('[data-shortcut-content]')).toBeVisible();

    await sourceFrame.locator('[data-section-remove]').click();
    await expect(sourceFrame).toHaveCount(0);
    await expect(page.locator('[data-undo-notice]')).toBeVisible();
    await expect(shortcutFrame).toHaveAttribute('data-shortcut-availability', 'source_archived');
    await expect(shortcutFrame.locator('[data-shortcut-unavailable]')).toContainText('source section is archived');
    expect(await homeLayoutOf()).toEqual(homeLayoutBefore);
    const retained = await api.get<ProjectSection[]>(
      `/api/projects/${sourceProjectId}/sections?includeArchived=true&pageId=${sourcePage.id}`,
    );
    expect(retained.find(({ id }) => id === sourceSection.id)).toMatchObject({
      id: sourceSection.id,
      archivedAt: expect.any(String),
    });

    await page.locator('[data-undo-action]').click();
    await expect(page).toHaveURL(sourceUrl);
    await expect(sourceFrame).toBeVisible();
    await expect(shortcutFrame).toHaveAttribute('data-shortcut-availability', 'available');
    await expect(shortcutFrame.locator('[data-shortcut-content]')).toBeVisible();
    expect(await sourceLayoutOf()).toEqual(sourceLayoutBefore);
    expect(await homeLayoutOf()).toEqual(homeLayoutBefore);
    const restored = await api.get<ProjectSection[]>(`/api/projects/${sourceProjectId}/sections?pageId=${sourcePage.id}`);
    expect(restored.find(({ id }) => id === sourceSection.id)).toMatchObject({
      id: sourceSection.id,
      position: sourceSection.position,
      config: sourceSection.config,
    });
  } finally {
    await homeBrowserPage.close();
  }
});

test('retained content survives reload and Archive restore, while reassign Undo reverses every move', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  const root = await createRoot('Content and Undo journey');
  const notes = await addSection(root.id, {
    type: 'rich-text',
    title: 'Project brief',
    position: 0,
    config: { text: 'Keep the design notes.' },
  });
  const cascade = await addSection(root.id, { type: 'task-list', title: 'Saved tasks', position: 1, config: {} });
  const cascadeTask = await api.post<{ id: string }>('/api/tasks', {
    projectId: root.id,
    sectionId: cascade.id,
    title: 'Keep this task',
  });
  const reflectionSection = await addSection(root.id, {
    type: 'reflections',
    title: 'Saved reflections',
    position: 2,
    config: {},
  });
  const reflectionEntry = await api.post<{ id: string }>('/api/reflections', {
    projectId: root.id,
    sectionId: reflectionSection.id,
    body: 'Keep this reflection body.',
  });

  await page.goto(`/projects/${root.id}`);
  await page.locator(`[data-section-item][data-section-id="${notes.id}"] [data-section-remove]`).click();
  await expect(page.locator(`[data-section-item][data-section-id="${notes.id}"]`)).toHaveCount(0);
  expect(await archiveHasSection(root.id, notes.id)).toBe(true);

  await page.locator(`[data-section-item][data-section-id="${cascade.id}"] [data-section-remove]`).click();
  const dialog = page.getByRole('dialog', { name: 'Remove “Saved tasks”?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-section-removal-message]')).toContainText('1 task');
  await dialog.locator('[data-section-removal-cascade]').click();
  await expect(page.locator(`[data-section-item][data-section-id="${cascade.id}"]`)).toHaveCount(0);
  expect(await archiveHasSection(root.id, cascade.id)).toBe(true);

  await page.locator('[data-section-item][data-section-id="' + reflectionSection.id + '"] [data-section-remove]').click();
  const reflectionDialog = page.getByRole('dialog', { name: 'Remove “Saved reflections”?' });
  await expect(reflectionDialog).toBeVisible();
  await expect(reflectionDialog.locator('[data-section-removal-message]')).toContainText('1 reflection');
  await reflectionDialog.locator('[data-section-removal-cascade]').click();
  await expect(page.locator('[data-section-item][data-section-id="' + reflectionSection.id + '"]')).toHaveCount(0);
  expect(await archiveHasSection(root.id, reflectionSection.id)).toBe(true);

  await page.locator('[data-open-archive]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${root.id}/pages/archive$`));
  const notesRow = page.locator(`[data-archived-item][data-archived-id="${notes.id}"]`);
  const cascadeRow = page.locator(`[data-archived-item][data-archived-id="${cascade.id}"]`);
  const reflectionRow = page.locator('[data-archived-item][data-archived-id="' + reflectionSection.id + '"]');
  await expect(notesRow).toBeVisible();
  await expect(cascadeRow).toBeVisible();
  await expect(reflectionRow).toBeVisible();
  await expect(notesRow.locator('[data-archived-restore]')).toHaveText('Restore saved content');
  await expect(notesRow.locator('[data-archived-restore]')).toHaveAttribute(
    'aria-label',
    'Restore saved content for Project brief',
  );

  await page.reload();
  await expect(notesRow).toBeVisible();
  await notesRow.locator('[data-archived-restore]').click();
  await expect(notesRow).toHaveCount(0);
  await page.reload();
  expect(await archiveHasSection(root.id, notes.id)).toBe(false);
  expect(await sectionById(root.id, notes.id)).toMatchObject({ config: { text: 'Keep the design notes.' } });

  await cascadeRow.locator('[data-archived-restore]').click();
  await expect(cascadeRow).toHaveCount(0);
  await page.reload();
  expect(await sectionById(root.id, cascade.id)).toMatchObject({ position: 1 });
  await expect.poll(async () => (await api.get<{ sectionId: string; archivedAt?: string }>(`/api/tasks/${cascadeTask.id}`)).archivedAt)
    .toBeUndefined();
  await expect.poll(async () => (await api.get<{ sectionId: string }>(`/api/tasks/${cascadeTask.id}`)).sectionId).toBe(cascade.id);

  await reflectionRow.locator('[data-archived-restore]').click();
  await expect(reflectionRow).toHaveCount(0);
  const restoredReflections = await api.get<Array<{ id: string; sectionId: string; body: string }>>(
    '/api/reflections?projectId=' + root.id + '&sectionId=' + reflectionSection.id,
  );
  expect(restoredReflections).toContainEqual(expect.objectContaining({
    id: reflectionEntry.id,
    sectionId: reflectionSection.id,
    body: 'Keep this reflection body.',
  }));

  const source = await addSection(root.id, { type: 'task-list', title: 'Reassignment source', position: 2, config: {} });
  const target = await addSection(root.id, { type: 'task-list', title: 'Reassignment target', position: 3, config: {} });
  const parent = await api.post<{ id: string }>('/api/tasks', {
    projectId: root.id,
    sectionId: source.id,
    title: 'Move with the source',
  });
  const child = await api.post<{ id: string }>('/api/tasks', {
    projectId: root.id,
    sectionId: source.id,
    parentTaskId: parent.id,
    title: 'Keep the child relationship',
  });
  const filedParent = await api.post<{ id: string }>('/api/tasks', {
    projectId: root.id,
    sectionId: source.id,
    title: 'Archived subtree root',
  });
  const filedChild = await api.post<{ id: string }>('/api/tasks', {
    projectId: root.id,
    sectionId: source.id,
    parentTaskId: filedParent.id,
    title: 'Archived subtree child',
  });
  await api.post('/api/tasks/' + filedParent.id + '/archive', {});

  await page.goto(`/projects/${root.id}`);
  await page.locator(`[data-section-item][data-section-id="${source.id}"] [data-section-remove]`).click();
  const reassignment = page.getByRole('dialog', { name: 'Remove “Reassignment source”?' });
  await expect(reassignment).toBeVisible();
  await reassignment.locator('[data-section-removal-target]').selectOption(target.id);
  await reassignment.locator('[data-section-removal-reassign]').click();
  await expect(page.locator(`[data-section-item][data-section-id="${source.id}"]`)).toHaveCount(0);
  expect(await archiveHasSection(root.id, source.id)).toBe(false);
  await expect.poll(async () => (await api.get<{ sectionId: string }>(`/api/tasks/${parent.id}`)).sectionId).toBe(target.id);
  await expect.poll(async () => (await api.get<{ sectionId: string }>(`/api/tasks/${child.id}`)).sectionId).toBe(target.id);

  expect(await api.get<{ sectionId: string; archivedAt?: string }>('/api/tasks/' + filedParent.id)).toMatchObject({
    sectionId: target.id,
    archivedAt: expect.any(String),
  });
  expect(await api.get<{
    sectionId: string;
    parentTaskId?: string;
    archivedAt?: string;
    archivedWithTaskId?: string;
  }>('/api/tasks/' + filedChild.id)).toMatchObject({
    sectionId: target.id,
    parentTaskId: filedParent.id,
    archivedAt: expect.any(String),
    archivedWithTaskId: filedParent.id,
  });
  await api.patch('/api/tasks/' + parent.id, {
    title: 'Edited after reassignment',
    status: 'in_progress',
    description: 'Later task body survives Undo.',
  });

  await page.locator('[data-undo-action]').click();
  await expect(page.locator(`[data-section-item][data-section-id="${source.id}"]`)).toBeVisible();
  await expect.poll(async () => (await api.get<{ sectionId: string }>(`/api/tasks/${parent.id}`)).sectionId).toBe(source.id);
  await expect.poll(async () => (await api.get<{ sectionId: string; parentTaskId?: string }>(`/api/tasks/${child.id}`)).sectionId).toBe(source.id);
  expect(await api.get<{ sectionId: string; parentTaskId?: string }>(`/api/tasks/${child.id}`)).toMatchObject({
    sectionId: source.id,
    parentTaskId: parent.id,
  });
  await page.reload();
  await expect(page.locator(`[data-section-item][data-section-id="${source.id}"]`)).toBeVisible();
  expect(await sectionById(root.id, source.id)).toMatchObject({ position: source.position });
  expect(await api.get<{
    sectionId: string;
    title: string;
    status: string;
    description?: string;
  }>('/api/tasks/' + parent.id)).toMatchObject({
    sectionId: source.id,
    title: 'Edited after reassignment',
    status: 'in_progress',
    description: 'Later task body survives Undo.',
  });
  expect(await api.get<{ sectionId: string; archivedAt?: string }>('/api/tasks/' + filedParent.id)).toMatchObject({
    sectionId: source.id,
    archivedAt: expect.any(String),
  });
  expect(await api.get<{
    sectionId: string;
    parentTaskId?: string;
    archivedAt?: string;
    archivedWithTaskId?: string;
  }>('/api/tasks/' + filedChild.id)).toMatchObject({
    sectionId: source.id,
    parentTaskId: filedParent.id,
    archivedAt: expect.any(String),
    archivedWithTaskId: filedParent.id,
  });
});
