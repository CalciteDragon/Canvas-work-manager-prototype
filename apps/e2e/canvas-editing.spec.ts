import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ProjectPage, ProjectSection, SectionShortcut } from '@cwm/contracts';
import { addSection, api, createRoot, createSubprojects, seed, setClock, setLayout } from './seed';

const PINNED_NOW = '2026-09-15T12:00:00.000Z';
const HOME_RENOVATION = 'project-renovation';
const KITCHEN = 'project-kitchen';

type PlacementRow = { id: string; kind: 'section' | 'shortcut'; position: number; columnSpan: number };

const pageId = async (projectId: string, kind = 'home'): Promise<string> => {
  const pages = await api.get<ProjectPage[]>(`/api/projects/${projectId}/pages`);
  const page = pages.find((candidate) => candidate.kind === kind);
  if (page === undefined) throw new Error(`Project ${projectId} has no ${kind} page`);
  return page.id;
};

const orderOf = async (projectId: string, id?: string): Promise<PlacementRow[]> => {
  const resolvedPageId = id ?? (await pageId(projectId));
  const [sections, shortcuts] = await Promise.all([
    api.get<ProjectSection[]>(`/api/projects/${projectId}/sections?pageId=${resolvedPageId}`),
    api.get<SectionShortcut[]>(`/api/projects/${projectId}/shortcuts?pageId=${resolvedPageId}`),
  ]);
  return [
    ...sections.map((section) => ({
      id: section.id,
      kind: 'section' as const,
      position: section.position,
      columnSpan: section.columnSpan,
    })),
    ...shortcuts.map((shortcut) => ({
      id: shortcut.id,
      kind: 'shortcut' as const,
      position: shortcut.position,
      columnSpan: shortcut.columnSpan,
    })),
  ].sort((left, right) => left.position - right.position);
};

const openFailurePanel = async (page: Page, rate: '0' | '1'): Promise<void> => {
  await page.keyboard.press('Control+Shift+D');
  const panel = page.locator('[data-dev-panel]');
  await expect(panel).toBeVisible();
  await panel.locator(`[data-panel-failure][data-rate="${rate}"]`).click();
  await panel.locator('[data-dev-panel-close]').click();
  await expect(panel).toHaveCount(0);
};

const dragResize = async (page: Page, handle: Locator, delta: number): Promise<void> => {
  const box = await handle.boundingBox();
  if (box === null) throw new Error('Resize handle has no browser box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const steps = 8;
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(box.x + box.width / 2 + (delta * step) / steps, box.y + box.height / 2);
  }
  await page.mouse.up();
};

const resizeDelta = async (
  canvas: Locator,
  from: 4 | 6 | 8 | 12,
  to: 4 | 6 | 8 | 12,
  mode: 'flow' | 'grid' = 'grid',
): Promise<number> =>
  canvas.evaluate((element, spans) => {
    const width = element.getBoundingClientRect().width;
    const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
    const column = (width - 11 * gap) / 12;
    const widthFor = (span: number) => span * column + (span - 1) * gap;
    const flowWidthFor = (span: number) => (span / 12) * width;
    return spans.mode === 'flow'
      ? flowWidthFor(spans.to) - flowWidthFor(spans.from)
      : widthFor(spans.to) - widthFor(spans.from);
  }, { from, to, mode });

const expectOnlyCanvasChrome = async (page: Page): Promise<void> => {
  for (const selector of [
    '[data-layout-edit-toggle]',
    '[data-project-quick-add]',
    '[data-project-add-shortcut]',
    '[data-section-size]',
    '[data-shortcut-size]',
    '[data-section-duplicate]',
    '[data-project-nav-open-archive]',
    '[data-section-name]',
  ]) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
};

test('the navigation column follows the viewport and keeps long and narrow navigation reachable', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  const empty = await createRoot('Empty canvas');
  await page.goto(`/projects/${empty.id}`);
  await expect(page.locator('[data-empty-canvas-add]')).toBeVisible();

  const checkViewportHeight = async (): Promise<void> => {
    const metrics = await page.evaluate(() => {
      const navigation = document.querySelector('app-project-page-navigation');
      const topBar = document.querySelector('app-top-bar');
      if (navigation === null || topBar === null) throw new Error('Workspace chrome did not render');
      const navRect = navigation.getBoundingClientRect();
      const topRect = topBar.getBoundingClientRect();
      return { navHeight: navRect.height, navTop: navRect.top, topHeight: topRect.height, innerHeight };
    });
    expect(Math.abs(metrics.navHeight - (metrics.innerHeight - metrics.topHeight))).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.navTop - metrics.topHeight)).toBeLessThanOrEqual(1);
  };

  await checkViewportHeight();
  await addSection(empty.id, { type: 'rich-text', columnSpan: 12 });
  await page.reload();
  await expect(page.locator('[data-section-frame]')).toHaveCount(1);
  await checkViewportHeight();

  await seed('nested-projects');
  await api.patch(`/api/projects/${HOME_RENOVATION}/pages/archive`, { enabled: false });
  await page.goto(`/projects/${HOME_RENOVATION}`);
  await expect(page.locator('[data-section-frame]')).toHaveCount(7);
  await checkViewportHeight();
  // The shell's workspace region is the scroller, not the window; scrolling the window moves
  // nothing and would let a column that scrolls away with the canvas pass.
  const scrolled = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('main.workspace');
    if (workspace === null) throw new Error('Workspace scroller did not render');
    workspace.scrollTop = workspace.scrollHeight;
    return workspace.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  await checkViewportHeight();

  await seed('empty');
  const long = await createRoot('Long navigation');
  await createSubprojects(long.id, 40);
  await page.goto(`/projects/${long.id}`);
  await expect(page.locator('[data-work-project-id]')).toHaveCount(40);
  await page.evaluate(() => {
    const navigation = document.querySelector('.project-nav');
    if (navigation === null) throw new Error('Project navigation did not render');
    navigation.scrollTop = navigation.scrollHeight;
  });
  const lastLink = page.locator('[data-work-project-id]').last();
  await expect(lastLink).toBeVisible();
  const scrollMetrics = await page.evaluate(() => {
    const navigation = document.querySelector('.project-nav')!;
    const last = navigation.querySelectorAll('[data-work-project-id]')[
      navigation.querySelectorAll('[data-work-project-id]').length - 1
    ]!;
    const navRect = navigation.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    return { scrollHeight: navigation.scrollHeight, clientHeight: navigation.clientHeight, top: navRect.top, bottom: navRect.bottom, lastTop: lastRect.top, lastBottom: lastRect.bottom };
  });
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  expect(scrollMetrics.lastTop).toBeGreaterThanOrEqual(scrollMetrics.top);
  expect(scrollMetrics.lastBottom).toBeLessThanOrEqual(scrollMetrics.bottom);

  await page.setViewportSize({ width: 375, height: 812 });
  const toggle = page.locator('[data-project-nav-toggle]');
  await expect(toggle).toHaveText('Show project navigation');
  const narrowHeight = await page.locator('app-project-page-navigation').evaluate((element) => element.getBoundingClientRect().height);
  const toggleHeight = await toggle.evaluate((element) => element.getBoundingClientRect().height);
  expect(narrowHeight).toBeLessThanOrEqual(toggleHeight + 1);
  await toggle.click();
  await expect(page.locator('[data-project-page-tab]')).toHaveCount(1);
  await expect(page.locator('[data-work-project-id]').last()).toBeVisible();
});

test('frame indicators and direct controls work in both themes and collapse states without edit mode', async ({ page }) => {
  await seed('nested-projects');
  await page.goto(`/projects/${HOME_RENOVATION}`);
  await expect(page.locator('[data-section-frame]')).toHaveCount(7);
  await expect(page.locator('[data-shortcut-frame]')).toHaveCount(4);
  await expectOnlyCanvasChrome(page);

  const firstSection = page.locator('[data-section-frame]').first();
  const collapse = firstSection.locator('[data-section-collapse]');
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await expect(collapse).toHaveAttribute('aria-label', /^Collapse /);
  await expect(firstSection.locator('[data-section-drag-handle] svg')).toHaveCount(1);
  await expect(firstSection.locator('[data-section-collapse] svg')).toHaveCount(1);
  expect(await firstSection.locator('[data-section-drag-handle]').innerText()).toBe('');
  await collapse.click();
  await expect(collapse).toHaveAttribute('aria-expanded', 'false');
  await expect(collapse).toHaveAttribute('aria-label', /^Expand /);
  await expect(firstSection.locator('[data-section-content]')).toHaveCount(0);
  await collapse.click();
  await expect(firstSection.locator('[data-section-content]')).toBeVisible();

  const shortcut = page.locator('[data-shortcut-frame]').first();
  const shortcutCollapse = shortcut.locator('[data-shortcut-collapse]');
  await expect(shortcut.locator('[data-shortcut-drag-handle] svg')).toHaveCount(1);
  await expect(shortcutCollapse.locator('svg')).toHaveCount(1);
  await shortcutCollapse.click();
  await expect(shortcutCollapse).toHaveAttribute('aria-expanded', 'false');
  await expect(shortcutCollapse).toHaveAttribute('aria-label', /^Expand /);
  await shortcutCollapse.click();
  await expect(shortcutCollapse).toHaveAttribute('aria-expanded', 'true');

  for (const theme of ['dark', 'light'] as const) {
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme) await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const icon of [
      firstSection.locator('[data-section-drag-handle] svg'),
      firstSection.locator('[data-section-collapse] svg'),
      shortcut.locator('[data-shortcut-drag-handle] svg'),
      shortcut.locator('[data-shortcut-collapse] svg'),
    ]) {
      await expect(icon).toBeVisible();
      expect(await icon.textContent()).toBe('');
    }

    await collapse.click();
    await shortcutCollapse.click();
    await expect(collapse).toHaveAttribute('aria-expanded', 'false');
    await expect(shortcutCollapse).toHaveAttribute('aria-expanded', 'false');
    await collapse.click();
    await shortcutCollapse.click();
  }

  await page.goto(`/projects/${KITCHEN}`);
  await expectOnlyCanvasChrome(page);
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-open-archive]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${HOME_RENOVATION}/pages/archive$`));
});

test('contextual insertion preserves a combined order, remembers anchors and reports failed creates', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  const root = await createRoot('Insertion journey');
  await setLayout(root.id, 'flow');
  const home = await pageId(root.id);
  const first = await addSection(root.id, { type: 'rich-text', title: 'First notes', columnSpan: 12 });
  const second = await addSection(root.id, { type: 'rich-text', title: 'Second notes', columnSpan: 6 });
  const third = await addSection(root.id, { type: 'task-list', title: 'Third list', columnSpan: 6 });
  const [child] = await createSubprojects(root.id, 1);
  const source = await addSection(child!.id, { type: 'rich-text', title: 'Shortcut source', columnSpan: 8 });
  await addSection(child!.id, { type: 'task-list', title: 'Shortcut candidate', columnSpan: 6 });
  const shortcut = await api.post<SectionShortcut>(`/api/projects/${root.id}/shortcuts`, {
    pageId: home,
    sourceSectionId: source.id,
    position: 1,
  });
  await page.goto(`/projects/${root.id}`);
  await expect(page.locator('[data-section-item], [data-shortcut-item]')).toHaveCount(4);

  const beforeThird = page.locator(`app-insertion-point[data-insertion-point="before"][data-before-id="${third.id}"] button`);
  const initialOrder = await orderOf(root.id, home);
  await beforeThird.click();
  await page.locator('[data-create-section-cancel]').click();
  expect(await orderOf(root.id, home)).toEqual(initialOrder);

  await beforeThird.click();
  await page.locator('[data-section-create-dialog]').press('Escape');
  await expect(page.locator('[data-section-create-dialog]')).toHaveCount(0);
  expect(await orderOf(root.id, home)).toEqual(initialOrder);

  await beforeThird.click();
  await page.locator('[data-create-section-type]').selectOption('rich-text');
  await page.locator('[data-create-section-name]').fill('Inserted notes');
  await page.locator('[data-create-section-submit]').click();
  const inserted = page.locator('[data-section-frame]', { hasText: 'Inserted notes' });
  await expect(inserted).toBeVisible();
  const insertedId = (await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections?pageId=${home}`)).find((section) => section.title === 'Inserted notes')?.id;
  if (insertedId === undefined) throw new Error('The inserted section is missing from the API read');
  const orderAfterInsert = await orderOf(root.id, home);
  expect(orderAfterInsert.map(({ id }) => id)).toEqual([first.id, shortcut.id, second.id, insertedId, third.id]);
  expect(orderAfterInsert.map(({ position }) => position)).toEqual([0, 1, 2, 3, 4]);
  await page.reload();
  expect((await orderOf(root.id, home)).map(({ id }) => id)).toEqual([first.id, shortcut.id, second.id, insertedId, third.id]);

  await page.locator(`app-insertion-point[data-insertion-point="before"][data-before-id="${first.id}"] button`).click();
  await page.locator('[data-create-section-type]').selectOption('rich-text');
  await page.locator('[data-create-section-name]').fill('First placement');
  await page.locator('[data-create-section-submit]').click();
  await expect(page.locator('[data-section-frame]', { hasText: 'First placement' })).toBeVisible();
  const firstPlacement = (await orderOf(root.id, home))[0]!;
  expect(firstPlacement.position).toBe(0);

  await page.locator('app-insertion-point[data-insertion-point="end"] button').click();
  await page.locator('[data-create-section-type]').selectOption('rich-text');
  await page.locator('[data-create-section-name]').fill('Last placement');
  await page.locator('[data-create-section-submit]').click();
  await expect(page.locator('[data-section-create-dialog]')).toHaveCount(0);
  const afterAppend = await orderOf(root.id, home);
  expect(afterAppend.at(-1)?.position).toBe(afterAppend.length - 1);
  await expect(page.locator('[data-section-frame]', { hasText: 'Last placement' })).toBeVisible();

  // Insert a shortcut through the same contextual dialog. The source is in the root's tree,
  // so the picker can offer it; position is shared with sections rather than a second order.
  await page.locator(`app-insertion-point[data-insertion-point="before"][data-before-id="${second.id}"] button`).click();
  await page.locator('[data-create-shortcut-mode]').click();
  const sourceOption = page.locator('[data-shortcut-source-option]', { hasText: 'Shortcut candidate' });
  await expect(sourceOption).toBeVisible();
  await sourceOption.locator('[data-shortcut-add]').click();
  await expect(page.locator('[data-section-create-dialog]')).toHaveCount(0);
  const combined = await orderOf(root.id, home);
  const shortcutIndex = combined.findIndex((item) => item.kind === 'shortcut' && item.id !== shortcut.id);
  expect(combined[shortcutIndex - 1]?.id).not.toBe(second.id);
  expect(combined[shortcutIndex + 1]?.id).toBe(second.id);
  await page.reload();
  expect((await orderOf(root.id, home)).find(({ id }) => id === combined[shortcutIndex]!.id)?.position).toBe(shortcutIndex);

  // The popup holds a stable anchor id: a live insertion before it changes its index, not the
  // user's chosen destination.
  const anchoredOrder = await orderOf(root.id, home);
  const anchor = anchoredOrder[2]!;
  await page.locator(`app-insertion-point[data-insertion-point="before"][data-before-id="${anchor.id}"] button`).click();
  const live = await addSection(root.id, { type: 'rich-text', title: 'Live insertion', position: 0 });
  await expect(page.locator(`[data-section-item][data-section-id="${live.id}"]`)).toBeVisible();
  await page.locator('[data-create-section-type]').selectOption('rich-text');
  await page.locator('[data-create-section-name]').fill('After live insertion');
  await page.locator('[data-create-section-submit]').click();
  // The dialog closes only once the create resolved; reading before that races the write.
  await expect(page.locator('[data-section-create-dialog]')).toHaveCount(0);
  const afterLive = await orderOf(root.id, home);
  const anchorIndex = afterLive.findIndex(({ id }) => id === anchor.id);
  expect(afterLive[anchorIndex - 1]?.position).toBe(anchorIndex - 1);
  const afterLiveSection = (await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections?pageId=${home}`)).find((section) => section.title === 'After live insertion');
  expect(afterLive[anchorIndex - 1]?.id).toBe(afterLiveSection?.id);
  expect(afterLive.find(({ id }) => id === live.id)?.position).toBe(0);
  expect(afterLive[anchorIndex - 1]?.position).toBe(anchorIndex - 1);

  // A failed create keeps the form state for correction. The host failure panel is client-side,
  // so it is enabled only after the page and popup have loaded and always reset in finally.
  await page.locator('app-insertion-point[data-insertion-point="end"] button').click();
  await page.locator('[data-create-section-type]').selectOption('rich-text');
  await page.locator('[data-create-section-name]').fill('Retry after failure');
  try {
    await openFailurePanel(page, '1');
    await page.locator('[data-create-section-submit]').click();
    await expect(page.locator('[data-create-section-error]')).toContainText('prototype failure injection');
    await expect(page.locator('[data-create-section-name]')).toHaveValue('Retry after failure');
    await expect(page.locator('[data-create-section-type]')).toHaveValue('rich-text');
  } finally {
    await openFailurePanel(page, '0');
  }
  await page.locator('[data-create-section-submit]').click();
  await expect(page.locator('[data-section-frame]', { hasText: 'Retry after failure' })).toBeVisible();

  let createRequests = 0;
  await page.route(`**/api/projects/${root.id}/sections`, async (route) => {
    if (route.request().method() === 'POST') {
      createRequests += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
    }
    await route.continue();
  });
  try {
    await page.locator('app-insertion-point[data-insertion-point="end"] button').click();
    await page.locator('[data-create-section-type]').selectOption('rich-text');
    await page.locator('[data-create-section-name]').fill('One click only');
    const submit = page.locator('[data-create-section-submit]');
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveCount(1);
  } finally {
    await page.unroute(`**/api/projects/${root.id}/sections`);
  }
  await expect(page.locator('[data-section-frame]', { hasText: 'One click only' })).toBeVisible();
  expect(createRequests).toBe(1);
});

test('grid insertion fills only supported gaps and insertion overlays stay inert during CDK sorting', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  const root = await createRoot('Grid insertion');
  await setLayout(root.id, 'grid');
  const wide = await addSection(root.id, { type: 'rich-text', title: 'Eight columns', columnSpan: 8 });
  const narrow = await addSection(root.id, { type: 'rich-text', title: 'Six columns', columnSpan: 6 });
  await page.goto(`/projects/${root.id}`);
  const firstFrame = page.locator(`[data-section-item][data-section-id="${wide.id}"]`);
  const beforeBox = await firstFrame.boundingBox();
  if (beforeBox === null) throw new Error('First grid placement has no bounding box');
  const gap = firstFrame.locator('app-insertion-point[data-insertion-point="gap"]');
  await expect(gap).toHaveCount(1);
  const gapButton = gap.locator('[data-insertion-point-button]');
  await gapButton.click();
  await page.locator('[data-create-section-type]').selectOption('rich-text');
  await page.locator('[data-create-section-name]').fill('Fills the gap');
  await page.locator('[data-create-section-submit]').click();
  await expect(page.locator('[data-section-create-dialog]')).toHaveCount(0);
  const fitted = await orderOf(root.id);
  const fittedSection = fitted.find(({ id }) => id !== wide.id && id !== narrow.id)!;
  expect(fitted.map(({ id }) => id)).toEqual([wide.id, fittedSection.id, narrow.id]);
  expect(fittedSection.columnSpan).toBe(4);
  const afterBox = await firstFrame.boundingBox();
  if (afterBox === null) throw new Error('First grid placement disappeared after insertion');
  expect(Math.abs(afterBox.x - beforeBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(afterBox.width - beforeBox.width)).toBeLessThanOrEqual(1);

  const noGap = await createRoot('No grid gap');
  await setLayout(noGap.id, 'grid');
  await addSection(noGap.id, { type: 'rich-text', title: 'Four columns', columnSpan: 4 });
  await addSection(noGap.id, { type: 'rich-text', title: 'Six columns', columnSpan: 6 });
  await addSection(noGap.id, { type: 'rich-text', title: 'Full row', columnSpan: 12 });
  await page.goto(`/projects/${noGap.id}`);
  await expect(page.locator('app-insertion-point[data-insertion-point="gap"]')).toHaveCount(0);

  const sorting = await createRoot('Sorting over gap');
  await setLayout(sorting.id, 'grid');
  const eight = await addSection(sorting.id, { type: 'rich-text', title: 'Anchor eight', columnSpan: 8 });
  const six = await addSection(sorting.id, { type: 'rich-text', title: 'Next six', columnSpan: 6 });
  const twelve = await addSection(sorting.id, { type: 'rich-text', title: 'Dragged twelve', columnSpan: 12 });
  await page.goto(`/projects/${sorting.id}`);
  const anchorItem = page.locator(`[data-section-item][data-section-id="${eight.id}"]`);
  const canvas = page.locator('[data-section-canvas]');
  const gapButtonInAnchor = anchorItem.locator('app-insertion-point[data-insertion-point="gap"] button');
  await expect(gapButtonInAnchor).toHaveCount(1);
  await expect(gapButtonInAnchor).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(gapButtonInAnchor).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(gapButtonInAnchor).toBeVisible();
  const gapBox = await gapButtonInAnchor.boundingBox();
  const canvasBox = await canvas.boundingBox();
  const viewport = page.viewportSize();
  const eightBox = await page.locator(`[data-section-item][data-section-id="${eight.id}"]`).boundingBox();
  const sixBox = await page.locator(`[data-section-item][data-section-id="${six.id}"]`).boundingBox();
  const twelveBox = await page.locator(`[data-section-item][data-section-id="${twelve.id}"]`).boundingBox();
  if (gapBox === null || canvasBox === null || viewport === null || eightBox === null || sixBox === null || twelveBox === null) {
    throw new Error('Grid sorting gap or placement geometry did not render');
  }
  const gapPoint = { x: gapBox.x + gapBox.width / 2, y: gapBox.y + gapBox.height / 2 };
  const gapHitIsInsideAnchor = await page.evaluate(({ x, y, sectionId }) => {
    const wrapper = document.querySelector(`[data-section-item][data-section-id="${sectionId}"]`);
    const hit = document.elementFromPoint(x, y);
    return wrapper !== null && hit !== null && wrapper.contains(hit);
  }, { ...gapPoint, sectionId: eight.id });
  expect(gapHitIsInsideAnchor).toBe(true);

  const dragGrip = page.locator(`[id="section-${twelve.id}"] [data-section-drag-handle]`);
  const dragBox = await dragGrip.boundingBox();
  if (dragBox === null) throw new Error('Section move grip has no browser box');
  const startPoint = { x: dragBox.x + dragBox.width / 2, y: dragBox.y + dragBox.height / 2 };
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(startPoint.x + 20, startPoint.y, { steps: 2 });
  await expect(page.locator(`[id="section-${twelve.id}"]`)).toHaveClass(/cdk-drag-dragging/);
  const hitSamples: Array<{
    hit: { tag: string; id: string | null; className: string | null; point: string | null } | null;
    section: string | null;
    gap: { pointerEvents: string; opacity: string } | null;
    before: Array<{ section: string | null; pointerEvents: string; opacity: string }>;
    listDragging: boolean;
  }> = [];
  const outsideX = Math.ceil(canvasBox.x + canvasBox.width + 8);
  expect(outsideX).toBeLessThan(viewport.width);
  const route = [
    { x: outsideX, y: startPoint.y },
    { x: outsideX, y: gapPoint.y },
    gapPoint,
  ];
  let routeStart = { x: startPoint.x + 20, y: startPoint.y };
  for (const target of route) {
    for (let step = 1; step <= 5; step += 1) {
      const x = routeStart.x + ((target.x - routeStart.x) * step) / 5;
      const y = routeStart.y + ((target.y - routeStart.y) * step) / 5;
      await page.mouse.move(x, y);
      hitSamples.push(await page.evaluate(({ x, y, sectionId }) => {
        const hit = document.elementFromPoint(x, y);
        const gap = document.querySelector(`[data-section-id="${sectionId}"] app-insertion-point[data-insertion-point="gap"]`);
        const before = [...document.querySelectorAll('app-insertion-point[data-insertion-point="before"]')]
          .filter((host) => host.closest('[data-section-canvas]') !== null);
        const canvas = document.querySelector('[data-section-canvas]');
        return {
          hit: hit === null ? null : {
            tag: hit.tagName.toLowerCase(),
            id: hit.id || null,
            className: typeof hit.className === 'string' ? hit.className : null,
            point: hit.closest('app-insertion-point')?.getAttribute('data-insertion-point') ?? null,
          },
          section: hit?.closest('[data-section-item]')?.getAttribute('data-section-id') ?? null,
          gap: gap === null ? null : {
            pointerEvents: getComputedStyle(gap).pointerEvents,
            opacity: getComputedStyle(gap).opacity,
          },
          before: before.map((host) => ({
            section: host.closest('[data-section-item]')?.getAttribute('data-section-id') ?? null,
            pointerEvents: getComputedStyle(host).pointerEvents,
            opacity: getComputedStyle(host).opacity,
          })),
          listDragging: canvas?.classList.contains('cdk-drop-list-dragging') ?? false,
        };
      }, { x, y, sectionId: eight.id }));
    }
    routeStart = target;
  }
  const routePoints = route.flatMap((target, segmentIndex) => {
    const from = segmentIndex === 0 ? { x: startPoint.x + 20, y: startPoint.y } : route[segmentIndex - 1]!;
    return Array.from({ length: 5 }, (_, index) => ({
      x: from.x + ((target.x - from.x) * (index + 1)) / 5,
      y: from.y + ((target.y - from.y) * (index + 1)) / 5,
    }));
  });
  const avoidsOtherPlacementRects = routePoints.every(({ x, y }) => [eightBox, sixBox].every((box) =>
    x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height,
  ));
  expect(avoidsOtherPlacementRects).toBe(true);
  expect(
    hitSamples.every((sample) => sample.listDragging && sample.gap?.pointerEvents === 'none'),
    `Expected inert gap overlay while CDK sorting: ${JSON.stringify(hitSamples)}`,
  ).toBe(true);
  expect(
    hitSamples.every((sample) => sample.before.every((before) => before.pointerEvents === 'none')),
    `Expected inert before overlays while CDK sorting: ${JSON.stringify(hitSamples)}`,
  ).toBe(true);
  await page.mouse.up();
  expect((await orderOf(sorting.id)).map(({ id }) => id)).toEqual([eight.id, six.id, twelve.id]);
});

test('resize previews, snapping, Escape, failure rollback, keyboard resizing and narrow widths preserve placement widths', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Failure injection logs errors on purpose; a ResizeObserver loop report never belongs here.
  const resizeObserverErrors: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('ResizeObserver')) resizeObserverErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (error.message.includes('ResizeObserver')) resizeObserverErrors.push(error.message);
  });
  const root = await createRoot('Resize journey');
  await setLayout(root.id, 'grid');
  const wide = await addSection(root.id, { type: 'rich-text', title: 'Resizable notes', columnSpan: 12 });
  const neighbor = await addSection(root.id, { type: 'rich-text', title: 'Neighbor notes', columnSpan: 4 });
  const [child] = await createSubprojects(root.id, 1);
  const source = await addSection(child!.id, { type: 'rich-text', title: 'Shortcut source', columnSpan: 12 });
  const home = await pageId(root.id);
  const shortcut = await api.post<SectionShortcut>(`/api/projects/${root.id}/shortcuts`, {
    pageId: home,
    sourceSectionId: source.id,
    position: 2,
    columnSpan: 12,
  });
  await page.goto(`/projects/${root.id}`);

  const canvas = page.locator('[data-section-canvas]');
  const wideWrapper = page.locator(`[data-section-item][data-section-id="${wide.id}"]`);
  const neighborWrapper = page.locator(`[data-section-item][data-section-id="${neighbor.id}"]`);
  const endHandle = wideWrapper.locator('app-section-resize-handle[data-edge="end"] [data-resize-handle]');
  const wideBox = await wideWrapper.boundingBox();
  const neighborBox = await neighborWrapper.boundingBox();
  if (wideBox === null || neighborBox === null) throw new Error('Grid item geometry did not render');
  expect(neighborBox.y).toBeGreaterThan(wideBox.y);

  const deltaToEight = await resizeDelta(canvas, 12, 8);
  const handleBox = await endHandle.boundingBox();
  if (handleBox === null) throw new Error('Resize handle has no box');
  let widthPatches = 0;
  const countPatch = (request: import('@playwright/test').Request): void => {
    if (request.method() === 'PATCH' && request.url().endsWith(`/api/sections/${wide.id}`)) widthPatches += 1;
  };
  page.on('request', countPatch);
  await endHandle.focus();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + deltaToEight, handleBox.y + handleBox.height / 2, { steps: 6 });
  await expect(wideWrapper).toHaveClass(/section-canvas__item--span-8/);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  page.off('request', countPatch);
  await expect(wideWrapper).toHaveClass(/section-canvas__item--span-12/);
  expect(widthPatches).toBe(0);

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + deltaToEight, handleBox.y + handleBox.height / 2, { steps: 6 });
  await expect(wideWrapper).toHaveClass(/section-canvas__item--span-8/);
  const neighborPreview = await neighborWrapper.boundingBox();
  if (neighborPreview === null) throw new Error('Neighbor disappeared during resize preview');
  expect(neighborPreview.y).toBe(wideBox.y);
  expect(neighborPreview.x).toBeGreaterThan(wideBox.x);

  const deltaToSix = await resizeDelta(canvas, 12, 6);
  await page.mouse.move(handleBox.x + handleBox.width / 2 + deltaToSix, handleBox.y + handleBox.height / 2, { steps: 4 });
  await expect(wideWrapper).toHaveClass(/section-canvas__item--span-6/);
  await page.mouse.up();
  await expect.poll(async () => (await orderOf(root.id))[0]?.columnSpan).toBe(6);
  await page.reload();
  await expect(page.locator(`[data-section-item][data-section-id="${wide.id}"]`)).toHaveClass(/section-canvas__item--span-6/);

  const currentHandle = page.locator(`[data-section-item][data-section-id="${wide.id}"] app-section-resize-handle[data-edge="end"] [data-resize-handle]`);

  try {
    await openFailurePanel(page, '1');
    await dragResize(page, currentHandle, await resizeDelta(page.locator('[data-section-canvas]'), 6, 4));
    await expect(page.locator('[data-section-error]')).toContainText('prototype failure injection');
    await expect(page.locator(`[data-section-item][data-section-id="${wide.id}"]`)).toHaveClass(/section-canvas__item--span-6/);
    await expect.poll(async () => (await orderOf(root.id))[0]?.columnSpan).toBe(6);
  } finally {
    await openFailurePanel(page, '0');
  }

  // Keyboard uses the end handle's slider path and commits once with Enter.
  await currentHandle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(currentHandle).toHaveAttribute('aria-valuenow', '4');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await orderOf(root.id))[0]?.columnSpan).toBe(4);

  // Each committed width offers an Undo notice fixed at the viewport's end corner; dismiss it so
  // the pointer drag below reaches the shortcut's handle rather than the notice over it.
  await page.locator('[data-dismiss-undo-notice]').click();
  await expect(page.locator('[data-undo-notice]')).toHaveCount(0);

  const shortcutWrapper = page.locator(`[data-shortcut-item][data-shortcut-id="${shortcut.id}"]`);
  const shortcutHandle = shortcutWrapper.locator('app-section-resize-handle[data-edge="end"] [data-resize-handle]');
  await dragResize(page, shortcutHandle, await resizeDelta(canvas, 12, 8));
  await expect.poll(async () => (await orderOf(root.id))[2]?.columnSpan).toBe(8);
  await page.reload();
  await expect(shortcutWrapper).toHaveClass(/section-canvas__item--span-8/);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(shortcutHandle).toBeHidden();
  expect((await orderOf(root.id))[2]?.columnSpan).toBe(8);

  // Flow height remains content-driven: the narrower editor wraps a realistic body and pushes
  // the next item down, while the canonical ordered position stays fixed.
  await api.patch(`/api/sections/${wide.id}`, { columnSpan: 12 });
  await setLayout(root.id, 'flow');
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 900 });
  const flowText = page.locator(`[data-section-item][data-section-id="${wide.id}"] [data-rich-text-body]`);
  const flowWrapper = page.locator(`[data-section-item][data-section-id="${wide.id}"]`);
  const nextWrapper = page.locator(`[data-section-item][data-section-id="${neighbor.id}"]`);
  await flowText.fill('The canvas keeps the content height. '.repeat(90));
  await flowText.press('Tab');
  await expect.poll(async () => (await orderOf(root.id)).map(({ id }) => id).indexOf(neighbor.id)).toBe(1);
  const nextBefore = await nextWrapper.boundingBox();
  const textBeforeResize = await flowText.boundingBox();
  if (nextBefore === null || textBeforeResize === null) throw new Error('Flow neighbor did not render');
  // The blur save offered an Undo notice over the viewport's end corner; clear it before dragging.
  await page.locator('[data-dismiss-undo-notice]').click();
  await dragResize(
    page,
    flowWrapper.locator('app-section-resize-handle[data-edge="end"] [data-resize-handle]'),
    await resizeDelta(page.locator('[data-section-canvas]'), 12, 4, 'flow'),
  );
  const textAfterResize = await flowText.boundingBox();
  const nextAfter = await nextWrapper.boundingBox();
  if (textAfterResize === null || nextAfter === null) throw new Error('Flow resize geometry did not render');
  // The editor itself grows to the rewrapped text in any engine, not only where CSS
  // `field-sizing` exists, and that growth is what moves the neighbour down.
  expect(textAfterResize.height).toBeGreaterThan(textBeforeResize.height);
  expect(nextAfter.y).toBeGreaterThan(nextBefore.y);
  expect((await orderOf(root.id)).map(({ id }) => id).indexOf(neighbor.id)).toBe(1);
  expect(resizeObserverErrors).toEqual([]);
});

test('inline rename, archive choices, shortcut removal and type settings remain available on the canvas', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  const root = await createRoot('Frame actions');
  await setLayout(root.id, 'flow');
  const view = await addSection(root.id, { type: 'rich-text', title: 'Rename me', columnSpan: 12 });
  const firstList = await addSection(root.id, { type: 'task-list', title: 'Move from here', columnSpan: 12 });
  const secondList = await addSection(root.id, { type: 'task-list', title: 'Move to here', columnSpan: 12 });
  const progress = await addSection(root.id, { type: 'progress', title: 'Progress controls', columnSpan: 12 });
  const firstTask = await api.post<{ id: string }>('/api/tasks', {
    projectId: root.id,
    sectionId: firstList.id,
    title: 'Keep this task',
  });
  const [child] = await createSubprojects(root.id, 1);
  const source = await addSection(child!.id, { type: 'task-list', title: 'Canonical source', columnSpan: 12 });
  const sourceTask = await api.post<{ id: string }>('/api/tasks', {
    projectId: child!.id,
    sectionId: source.id,
    title: 'Keep source work',
  });
  const home = await pageId(root.id);
  const shortcut = await api.post<SectionShortcut>(`/api/projects/${root.id}/shortcuts`, {
    pageId: home,
    sourceSectionId: source.id,
    position: 4,
  });
  await page.goto(`/projects/${root.id}`);

  const renameFrame = page.locator(`[data-section-item][data-section-id="${view.id}"]`);
  await renameFrame.locator('[data-section-title-edit]').click();
  const renameInput = renameFrame.locator('[data-section-name]');
  await expect(renameInput).toBeFocused();
  await renameInput.fill('Named on the canvas');
  await renameInput.press('Enter');
  await expect(renameFrame.locator('[data-section-title-edit]')).toContainText('Named on the canvas');
  expect((await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections?pageId=${home}`)).find(({ id }) => id === view.id)?.title).toBe('Named on the canvas');
  await page.reload();
  await expect(page.locator(`[data-section-item][data-section-id="${view.id}"] [data-section-title-edit]`)).toContainText('Named on the canvas');

  const namedFrame = page.locator(`[data-section-item][data-section-id="${view.id}"]`);
  await namedFrame.locator('[data-section-title-edit]').click();
  const clearName = namedFrame.locator('[data-section-name]');
  await clearName.fill('Temporary title');
  await clearName.press('Escape');
  await expect(namedFrame.locator('[data-section-title-edit]')).toContainText('Named on the canvas');
  await namedFrame.locator('[data-section-title-edit]').click();
  await namedFrame.locator('[data-section-name]').fill('');
  await namedFrame.locator('[data-section-name]').press('Enter');
  await expect(namedFrame.locator('[data-section-title-edit]')).toContainText('Rich Text');
  expect((await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections?pageId=${home}`)).find(({ id }) => id === view.id)?.title).toBeUndefined();

  try {
    await openFailurePanel(page, '1');
    await namedFrame.locator('[data-section-title-edit]').click();
    const refused = namedFrame.locator('[data-section-name]');
    await refused.fill('Keep draft after failure');
    await refused.press('Enter');
    await expect(namedFrame.locator('[data-section-name]')).toHaveValue('Keep draft after failure');
    await expect(page.locator('[data-section-error]')).toContainText('prototype failure injection');
  } finally {
    await openFailurePanel(page, '0');
  }
  await expect(namedFrame.locator('[data-section-name]')).toHaveCount(0);
  await expect(namedFrame.locator('[data-section-title-edit]')).toContainText('Keep draft after failure');
  await expect.poll(async () => (await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections?pageId=${home}`)).find(({ id }) => id === view.id)?.title).toBe('Keep draft after failure');

  // A title click enters rename directly and must not start a drag or toggle collapse.
  const frameAfterRename = page.locator(`[data-section-item][data-section-id="${view.id}"]`);
  const placementBefore = await frameAfterRename.boundingBox();
  if (placementBefore === null) throw new Error('Renamed frame has no bounding box');
  await frameAfterRename.locator('[data-section-title-edit]').click();
  await frameAfterRename.locator('[data-section-name]').press('Escape');
  await expect(frameAfterRename.locator('[data-section-collapse]')).toHaveAttribute('aria-expanded', 'true');
  await expect(frameAfterRename).not.toHaveClass(/cdk-drag-dragging/);

  const progressFrame = page.locator(`[data-section-item][data-section-id="${progress.id}"]`);
  await progressFrame.getByRole('button', { name: 'Weighted' }).click();
  await expect(progressFrame.getByRole('button', { name: 'Weighted' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator(`[data-section-item][data-section-id="${view.id}"] [data-rich-text-body]`).fill('Body editing is available without a mode.');
  await page.locator(`[data-section-item][data-section-id="${view.id}"] [data-rich-text-body]`).press('Tab');

  // Removal keeps meaningful Rich Text in Archive, while the action describes the operation.
  await expect(page.locator(`[data-section-item][data-section-id="${view.id}"] [data-section-remove]`)).toHaveAttribute('aria-label', 'Remove section Keep draft after failure');
  await page.locator(`[data-section-item][data-section-id="${view.id}"] [data-section-remove]`).click();
  await expect(page.locator(`[data-section-item][data-section-id="${view.id}"]`)).toHaveCount(0);
  await page.locator('[data-project-more]').click();
  await page.locator('[data-project-open-archive]').click();
  await expect(page.locator(`[data-archived-item][data-archived-id="${view.id}"]`)).toBeVisible();

  await page.goto(`/projects/${root.id}`);
  const shortcutFrame = page.locator(`[data-shortcut-frame]`).filter({ hasText: 'Canonical source' });
  await expect(shortcutFrame.locator('[data-section-title-edit]')).toHaveCount(0);
  await expect(shortcutFrame.locator('[data-shortcut-open-source]')).toBeVisible();
  await expect(shortcutFrame.locator('[data-shortcut-remove]')).toHaveAttribute('aria-label', 'Remove shortcut to Canonical source');
  await shortcutFrame.locator('[data-shortcut-open-source]').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${child!.id}$`));
  await expect(page.locator(`[data-section-item][data-section-id="${source.id}"]`)).toBeVisible();
  await page.goto(`/projects/${root.id}`);
  const currentShortcutFrame = page.locator('[data-shortcut-frame]', { hasText: 'Canonical source' });
  await currentShortcutFrame.locator('[data-shortcut-remove]').click();
  await expect(page.locator(`[data-shortcut-item][data-shortcut-id="${shortcut.id}"]`)).toHaveCount(0);
  expect((await api.get<ProjectSection[]>(`/api/projects/${child!.id}/sections?pageId=${await pageId(child!.id, 'work')}`)).some(({ id }) => id === source.id)).toBe(true);
  expect((await api.get<unknown[]>(`/api/tasks?projectId=${child!.id}&includeArchived=true`)).some((task) => JSON.stringify(task).includes(sourceTask.id))).toBe(true);

  // A non-empty container retains both existing choices. Reassignment preserves the row and
  // archives only the emptied container.
  await page.goto(`/projects/${root.id}`);
  await page.locator(`[data-section-item][data-section-id="${firstList.id}"] [data-section-remove]`).click();
  const removalDialog = page.locator('[data-section-removal-dialog] [role="dialog"]');
  await expect(removalDialog).toBeVisible();
  await expect(removalDialog.locator('[data-section-removal-message]')).toContainText('1 task');
  await expect(removalDialog.locator('[data-section-removal-cascade]')).toBeVisible();
  await expect(removalDialog.locator('[data-section-removal-reassign]')).toBeVisible();
  await removalDialog.locator('[data-section-removal-target]').selectOption(secondList.id);
  await removalDialog.locator('[data-section-removal-reassign]').click();
  await expect(page.locator(`[data-section-item][data-section-id="${firstList.id}"]`)).toHaveCount(0);
  expect((await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections?pageId=${home}`)).some(({ id }) => id === firstList.id)).toBe(false);
  expect((await api.get<unknown[]>(`/api/tasks?projectId=${root.id}&includeArchived=true`)).some((task) => JSON.stringify(task).includes(firstTask.id))).toBe(true);
});

test('keyboard users can insert, move sections and shortcuts, resize, rename and remove', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  const root = await createRoot('Keyboard journey');
  await setLayout(root.id, 'grid');
  const first = await addSection(root.id, { type: 'rich-text', title: 'First keyboard section', columnSpan: 12 });
  const second = await addSection(root.id, { type: 'rich-text', title: 'Second keyboard section', columnSpan: 8 });
  const [child] = await createSubprojects(root.id, 1);
  const source = await addSection(child!.id, { type: 'rich-text', title: 'Keyboard shortcut source', columnSpan: 6 });
  const home = await pageId(root.id);
  const shortcut = await api.post<SectionShortcut>(`/api/projects/${root.id}/shortcuts`, {
    pageId: home,
    sourceSectionId: source.id,
    position: 2,
    columnSpan: 12,
  });
  await page.goto(`/projects/${root.id}`);

  const secondInsert = page.locator(`app-insertion-point[data-insertion-point="before"][data-before-id="${second.id}"] [data-insertion-point-button]`);
  await secondInsert.press('Enter');
  await expect(page.locator('[data-section-create-dialog]')).toBeVisible();
  await page.locator('[data-create-section-type]').selectOption('rich-text');
  await page.locator('[data-create-section-name]').fill('Keyboard inserted section');
  await page.locator('[data-create-section-submit]').press('Enter');
  await expect(page.locator('[data-section-create-dialog]')).toHaveCount(0);
  const insertedSection = (await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections?pageId=${home}`)).find(({ title }) => title === 'Keyboard inserted section');
  if (insertedSection === undefined) throw new Error('Keyboard insertion did not create a section');
  await expect.poll(async () => (await orderOf(root.id, home))[1]?.id).toBe(insertedSection.id);

  const moveHandle = page.locator(`[data-section-item][data-section-id="${insertedSection.id}"] [data-section-drag-handle]`);
  await moveHandle.press('ArrowDown');
  await expect.poll(async () => (await orderOf(root.id, home)).findIndex(({ id }) => id === insertedSection.id)).toBe(2);
  // The host commits before it answers, and the grip's pending state renders a tick after the
  // key: neither the API order nor `aria-disabled="false"` alone proves the move settled, and a
  // key pressed while it is pending is deliberately ignored. The announcement follows the answer.
  await expect(page.locator('[data-canvas-live-region]')).toContainText('position 3 of 4');
  await expect(moveHandle).toHaveAttribute('aria-disabled', 'false');
  await moveHandle.press('ArrowDown');
  await expect.poll(async () => (await orderOf(root.id, home)).findIndex(({ id }) => id === insertedSection.id)).toBe(3);
  await expect(page.locator('[data-canvas-live-region]')).toContainText('position 4 of 4');

  const shortcutHandle = page.locator(`[data-shortcut-item][data-shortcut-id="${shortcut.id}"] [data-shortcut-drag-handle]`);
  await shortcutHandle.press('ArrowUp');
  await expect.poll(async () => (await orderOf(root.id, home)).findIndex(({ id }) => id === shortcut.id)).toBe(1);
  await expect(page.locator('[data-canvas-live-region]')).toContainText('position 2 of 4');

  const insertedWrapper = page.locator(`[data-section-item][data-section-id="${insertedSection.id}"]`);
  const resizeHandle = insertedWrapper.locator('app-section-resize-handle[data-edge="end"] [data-resize-handle]');
  await resizeHandle.press('ArrowLeft');
  await resizeHandle.press('Enter');
  await expect.poll(async () => (await orderOf(root.id, home)).find(({ id }) => id === insertedSection.id)?.columnSpan).toBe(8);

  await insertedWrapper.locator('[data-section-title-edit]').click();
  await insertedWrapper.locator('[data-section-name]').fill('Keyboard renamed section');
  await insertedWrapper.locator('[data-section-name]').press('Enter');
  await expect(insertedWrapper.locator('[data-section-title-edit]')).toContainText('Keyboard renamed section');
  await insertedWrapper.locator('[data-section-remove]').press('Enter');
  await expect(insertedWrapper).toHaveCount(0);
  const archived = await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections?includeArchived=true&pageId=${home}`);
  expect(archived.some(({ id }) => id === insertedSection.id)).toBe(false);
  await expect(page.locator('[data-undo-notice]')).toContainText('Undo is available');
  expect((await orderOf(root.id, home)).map(({ id }) => id)).toEqual([first.id, shortcut.id, second.id]);
});

test.describe('coarse pointer', () => {
  test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true });

  test('touch users can see and tap canvas controls and resize through captured pointer events', async ({ page }) => {
    await seed('empty');
    await setClock(PINNED_NOW);
    const root = await createRoot('Touch journey');
    await setLayout(root.id, 'grid');
    const first = await addSection(root.id, { type: 'rich-text', title: 'Touch notes', columnSpan: 12 });
    const neighbor = await addSection(root.id, { type: 'rich-text', title: 'Touch neighbor', columnSpan: 6 });
    await page.goto(`/projects/${root.id}`);
    expect(await page.evaluate(() => matchMedia('(hover: none), (any-pointer: coarse)').matches)).toBe(true);

    const item = page.locator(`[data-section-item][data-section-id="${first.id}"]`);
    const grip = item.locator('[data-section-drag-handle]');
    const archive = item.locator('[data-section-remove]');
    const resize = item.locator('app-section-resize-handle[data-edge="end"] [data-resize-handle]');
    const insertion = page.locator('app-insertion-point[data-insertion-point="before"] [data-insertion-point-button]').first();
    for (const control of [grip, archive, resize, insertion]) {
      await expect(control).toBeVisible();
    }
    const touchTargetsHit = await Promise.all([grip, archive, resize, insertion].map((control) =>
      control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === element || (hit !== null && element.contains(hit));
      }),
    ));
    expect(touchTargetsHit).toEqual([true, true, true, true]);

    await insertion.tap();
    await page.locator('[data-create-section-type]').selectOption('rich-text');
    await page.locator('[data-create-section-name]').fill('Touch-created notes');
    await page.locator('[data-create-section-submit]').tap();
    await expect(page.locator('[data-section-frame]', { hasText: 'Touch-created notes' })).toBeVisible();
    const home = await pageId(root.id);
    const inserted = (await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections?pageId=${home}`))
      .find(({ title }) => title === 'Touch-created notes');
    if (inserted === undefined) throw new Error('Touch insertion did not create a section');
    const [child] = await createSubprojects(root.id, 1);
    const source = await addSection(child!.id, { type: 'rich-text', title: 'Touch shortcut source' });
    const shortcut = await api.post<SectionShortcut>(`/api/projects/${root.id}/shortcuts`, {
      pageId: home,
      sourceSectionId: source.id,
      position: 2,
    });
    await expect(page.locator(`[data-shortcut-item][data-shortcut-id="${shortcut.id}"]`)).toBeVisible();
    expect((await orderOf(root.id, home)).map(({ id }) => id)).toEqual([inserted.id, first.id, shortcut.id, neighbor.id]);

    const touchRename = page.locator(`[data-section-item][data-section-id="${first.id}"] [data-section-title-edit]`);
    await touchRename.tap();
    await page.locator(`[data-section-item][data-section-id="${first.id}"] [data-section-name]`).fill('Renamed by touch');
    await page.locator(`[data-section-item][data-section-id="${first.id}"] [data-section-name]`).press('Enter');
    await expect(touchRename).toContainText('Renamed by touch');

    const resizeBox = await resize.boundingBox();
    const canvasBox = await page.locator('[data-section-canvas]').boundingBox();
    if (resizeBox === null || canvasBox === null) throw new Error('Touch resize geometry did not render');
    const width = await resizeDelta(page.locator('[data-section-canvas]'), 12, 8);
    const session = await page.context().newCDPSession(page);
    const dispatch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      session.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    try {
      await dispatch('touchStart', resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
      for (let step = 1; step <= 8; step += 1) {
        await dispatch(
          'touchMove',
          resizeBox.x + resizeBox.width / 2 + (width * step) / 8,
          resizeBox.y + resizeBox.height / 2,
        );
      }
      await dispatch('touchEnd', 0, 0);
    } finally {
      await session.detach();
    }
    await expect.poll(async () => (await orderOf(root.id)).find(({ id }) => id === first.id)?.columnSpan).toBe(8);

    // Drag the section onto the lower edge of a shortcut so touch sorting changes their
    // combined section/shortcut sequence, then reload to prove the host persisted it.
    const gripBox = await grip.boundingBox();
    const shortcutItem = page.locator(`[data-shortcut-item][data-shortcut-id="${shortcut.id}"]`);
    const shortcutBox = await shortcutItem.boundingBox();
    if (gripBox === null || shortcutBox === null) throw new Error('Touch move geometry did not render');
    const dragSession = await page.context().newCDPSession(page);
    try {
      const from = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 };
      const to = { x: shortcutBox.x + shortcutBox.width / 2, y: shortcutBox.y + shortcutBox.height * 0.8 };
      await dragSession.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...from, id: 1 }],
      });
      for (let step = 1; step <= 10; step += 1) {
        await dragSession.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: from.x + ((to.x - from.x) * step) / 10, y: from.y + ((to.y - from.y) * step) / 10, id: 1 }],
        });
      }
      await dragSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await dragSession.detach();
    }
    await expect.poll(async () => (await orderOf(root.id)).map(({ id }) => id))
      .toEqual([inserted.id, shortcut.id, first.id, neighbor.id]);
    await page.reload();
    expect((await orderOf(root.id)).map(({ id }) => id)).toEqual([inserted.id, shortcut.id, first.id, neighbor.id]);

    const orderBeforeArchive = await orderOf(root.id);
    const archiveBox = await archive.boundingBox();
    if (archiveBox === null) throw new Error('Touch archive control has no box');
    const archiveSession = await page.context().newCDPSession(page);
    try {
      await archiveSession.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: archiveBox.x + archiveBox.width / 2, y: archiveBox.y + archiveBox.height / 2, id: 1 }],
      });
      await archiveSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await archiveSession.detach();
    }
    await expect(item).toHaveCount(0);
    expect((await orderOf(root.id)).map(({ id }) => id)).toEqual(orderBeforeArchive.filter(({ id }) => id !== first.id).map(({ id }) => id));
  });
});

test('revealing controls does not shift the canvas or turn text and edge interactions into drags', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  const root = await createRoot('No layout shift');
  await setLayout(root.id, 'grid');
  const notes = await addSection(root.id, { type: 'rich-text', title: 'Selectable notes', columnSpan: 8 });
  const list = await addSection(root.id, { type: 'task-list', title: 'Task selection', columnSpan: 4 });
  await api.post('/api/tasks', { projectId: root.id, sectionId: list.id, title: 'Select this row title with a pointer drag' });
  await page.goto(`/projects/${root.id}`);
  const wrappers = page.locator('[data-section-item]');
  await expect(wrappers).toHaveCount(2);
  await expect(page.locator('[data-task-row]')).toHaveCount(1);
  const rects = async () => wrappers.evaluateAll((items) => items.map((item) => {
    const { x, y, width, height } = item.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const before = await rects();
  const firstWrapper = page.locator(`[data-section-item][data-section-id="${notes.id}"]`);
  await firstWrapper.hover();
  await firstWrapper.locator('[data-section-drag-handle]').focus();
  await expect(firstWrapper.locator('[data-section-remove]')).toBeVisible();
  const after = await rects();
  expect(after).toEqual(before);

  let moveRequests = 0;
  const observeMoves = (request: import('@playwright/test').Request): void => {
    if (request.method() === 'POST' && /\/api\/(sections|shortcuts)\/[^/]+\/move$/.test(new URL(request.url()).pathname)) moveRequests += 1;
  };
  page.on('request', observeMoves);
  const textarea = firstWrapper.locator('[data-rich-text-body]');
  await textarea.fill('Drag across this text selection without moving the section.');
  const textareaBox = await textarea.boundingBox();
  if (textareaBox === null) throw new Error('Rich Text editor has no browser geometry');
  await page.mouse.move(textareaBox.x + 18, textareaBox.y + 14);
  await page.mouse.down();
  await page.mouse.move(textareaBox.x + 110, textareaBox.y + 14, { steps: 4 });
  await page.mouse.up();
  expect(await textarea.evaluate((element) => (element as HTMLTextAreaElement).selectionEnd)).toBeGreaterThan(0);

  const taskTitle = page.locator(`[data-section-item][data-section-id="${list.id}"] [data-task-title]`);
  const taskBox = await taskTitle.boundingBox();
  if (taskBox === null) throw new Error('Task title has no browser geometry');
  await page.mouse.move(taskBox.x + 2, taskBox.y + taskBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(taskBox.x + Math.min(taskBox.width - 1, 110), taskBox.y + taskBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(`[data-section-item][data-section-id="${list.id}"] [data-task-row]`)).toBeVisible();
  await expect(page.locator(`[data-section-item][data-section-id="${list.id}"] [data-task-title-editor]`)).toHaveCount(0);

  for (const inset of [4, 8]) {
    const frameBox = await firstWrapper.locator('[data-section-frame]').boundingBox();
    if (frameBox === null) throw new Error('Section frame has no browser geometry');
    await page.mouse.move(frameBox.x + inset, frameBox.y + inset);
    await page.mouse.down();
    await page.mouse.move(frameBox.x + inset + 24, frameBox.y + inset + 12, { steps: 3 });
    await page.mouse.up();
    await expect(firstWrapper).not.toHaveClass(/cdk-drag-dragging/);
  }
  page.off('request', observeMoves);
  expect(moveRequests).toBe(0);
  expect((await orderOf(root.id)).map(({ id }) => id)).toEqual([notes.id, list.id]);
});

test('hover and focus actually reveal chrome, neighbouring handles resize their own section, and chrome never overflows', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  const root = await createRoot('Revealed chrome');
  await setLayout(root.id, 'grid');
  const left = await addSection(root.id, { type: 'rich-text', title: 'Left half', columnSpan: 6 });
  const right = await addSection(root.id, { type: 'rich-text', title: 'Right half', columnSpan: 6 });
  await addSection(root.id, { type: 'rich-text', title: 'Below', columnSpan: 12 });
  await page.goto(`/projects/${root.id}`);
  const leftItem = page.locator(`[data-section-item][data-section-id="${left.id}"]`);
  const rightItem = page.locator(`[data-section-item][data-section-id="${right.id}"]`);
  await expect(leftItem).toBeVisible();

  // `toBeVisible` ignores opacity, which is exactly how an always-transparent reveal passed.
  const opacityOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).opacity);
  const grip = leftItem.locator('[data-section-drag-handle]');
  const before = rightItem.locator(':scope > app-insertion-point[data-insertion-point="before"]');
  await page.mouse.move(5, 5);
  expect(await opacityOf(grip)).toBe('0');
  await leftItem.hover({ position: { x: 200, y: 60 } });
  expect(await opacityOf(grip)).toBe('1');
  expect(await opacityOf(leftItem.locator('app-section-resize-handle').first())).toBe('1');
  // Hovering a section does not paint its insertion line; hovering or focusing the line does.
  expect(await opacityOf(leftItem.locator(':scope > app-insertion-point'))).toBe('0');
  await page.mouse.move(5, 5);
  await rightItem.locator('[data-section-remove]').focus();
  expect(await opacityOf(rightItem.locator('.section-frame__controls'))).toBe('1');
  await before.locator('button').focus();
  expect(await opacityOf(before)).toBe('1');

  const overflow = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('main.workspace')!;
    return workspace.scrollWidth - workspace.clientWidth;
  });
  expect(overflow).toBe(0);

  // Adjacent grid items: the left section's end handle is on top at its own centre.
  const endHandle = leftItem.locator('app-section-resize-handle[data-edge="end"] [data-resize-handle]');
  await leftItem.hover();
  const endBox = await endHandle.boundingBox();
  if (endBox === null) throw new Error('End handle has no browser geometry');
  const hitsOwnHandle = await endHandle.evaluate((button, point) => {
    const hit = document.elementFromPoint(point.x, point.y);
    return hit !== null && button.contains(hit);
  }, { x: endBox.x + endBox.width / 2, y: endBox.y + endBox.height / 2 });
  expect(hitsOwnHandle).toBe(true);
  const frameBox = await leftItem.locator('[data-section-frame]').boundingBox();
  const contentBox = await leftItem.locator('[data-section-content]').boundingBox();
  if (frameBox === null || contentBox === null) throw new Error('Frame has no browser geometry');
  expect(endBox.x).toBeGreaterThanOrEqual(contentBox.x + contentBox.width);

  // Escape cancels a pointer resize even though the pressed handle never takes focus.
  let patches = 0;
  const observePatches = (request: import('@playwright/test').Request): void => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname.startsWith('/api/sections/')) patches += 1;
  };
  page.on('request', observePatches);
  const canvas = page.locator('[data-section-canvas]');
  await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2);
  await page.mouse.down();
  const delta = await resizeDelta(canvas, 6, 8);
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(endBox.x + endBox.width / 2 + (delta * step) / 6, endBox.y + endBox.height / 2);
  }
  await expect(leftItem).toHaveClass(/section-canvas__item--span-8/);
  await page.keyboard.press('Escape');
  await expect(leftItem).toHaveClass(/section-canvas__item--span-6/);
  await page.mouse.up();
  page.off('request', observePatches);
  expect(patches).toBe(0);
  expect((await orderOf(root.id)).map(({ columnSpan }) => columnSpan)).toEqual([6, 6, 12]);
});
