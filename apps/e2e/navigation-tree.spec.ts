import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { api, createProject, seed } from './seed';

/**
 * Slice 81's one navigation tree. Step 4 starts this file with the current marker, step 5 the tree's
 * interaction styles (underlines, tooltips, sizes, the archived colour, forced-colours shapes);
 * step 12 adds the journeys (Acceptance item 4).
 *
 * L5-008, L2-012: on every place exactly one item is current, and its marker is a shape (a solid
 * bar and weight), not only hue, in both themes and under forced colours. Unit tests load no
 * global styles, so this is the browser check of `_controls.scss`'s `.tree-link`.
 */
for (const forcedColors of ['none', 'active'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`one current item, drawn as a bar and weight (${theme}, forced colours ${forcedColors})`, async ({ page }) => {
      await seed('nested-projects');
      await page.emulateMedia({ forcedColors, colorScheme: theme });
      await page.addInitScript((choice) => localStorage.setItem('cwm.theme', choice), theme);
      for (const [url, name] of [
        ['/app', 'Home'],
        ['/settings/agents', 'AI & Agents'],
        ['/projects/project-renovation', 'Home renovation'],
        ['/projects/project-cabinets', 'Cabinets'],
      ] as const) {
        await page.goto(url);
        const current = page.locator('app-sidebar [aria-current]');
        await expect(current).toHaveCount(1);
        await expect(current).toHaveAttribute('aria-current', 'page');
        await expect(current).toHaveAccessibleName(name);
        const marker = await current.evaluate((item) => {
          const style = getComputedStyle(item);
          return { style: style.borderInlineStartStyle, width: parseFloat(style.borderInlineStartWidth), weight: Number(style.fontWeight) };
        });
        expect(marker, url).toEqual({ style: 'solid', width: 2, weight: 600 });
      }
    });
  }
}

/** The `::after` tooltip a control draws from its `data-tooltip` (decision 3). */
const tooltipOf = (control: Locator) =>
  control.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return { display: style.display, content: style.content };
  });

/** The pencil only renders once a project shell registers handlers (step 6); the Lab shows it now. */
const labRootLevel = async (page: Page) => {
  await page.goto('/prototype/design');
  const tree = page.locator('[data-panel="navigation"] app-sidebar[data-lab-root-level]');
  await expect(tree.locator('[data-edit-project]')).toBeVisible();
  return tree;
};

test('decision 2: nothing in the tree is underlined at rest, at either level', async ({ page }) => {
  await seed('nested-projects');
  await page.goto('/projects/project-cabinets');
  const nav = page.locator('app-sidebar nav');
  await expect(nav.locator('[data-nav-root]')).toBeVisible();
  const underlined = () => nav.evaluate((root) => [...root.querySelectorAll('a, button')].filter((item) => getComputedStyle(item).textDecorationLine.includes('underline')).map((item) => item.textContent?.trim()));
  expect(await underlined()).toEqual([]);
  await page.locator('[data-nav-up]').click();
  await expect(nav.locator('[data-project]').first()).toBeVisible();
  expect(await underlined()).toEqual([]);
});

test('the chevron is a 32 px icon button with its tooltip on hover and keyboard focus; Enter goes up with focus on the root’s row', async ({ page }) => {
  await seed('nested-projects');
  await page.goto('/projects/project-cabinets');
  const chevron = page.getByRole('button', { name: 'All projects' });
  const box = (await chevron.boundingBox())!;
  expect([box.width, box.height]).toEqual([32, 32]);
  expect(await tooltipOf(chevron)).toEqual({ display: 'none', content: '"All projects"' });

  await chevron.hover();
  expect((await tooltipOf(chevron)).display).toBe('block');
  // WCAG 1.4.13 hoverable: the pointer moves down onto the label and it stays.
  await page.mouse.move(box.x + 4, box.y + box.height + 6, { steps: 4 });
  expect((await tooltipOf(chevron)).display).toBe('block');
  // Dismissible while only hovered (focus is elsewhere): Escape hides it.
  await page.keyboard.press('Escape');
  expect((await tooltipOf(chevron)).display).toBe('none');
  await page.mouse.move(box.x + 600, box.y + 400);
  await chevron.hover();
  expect((await tooltipOf(chevron)).display).toBe('block');
  await page.mouse.move(box.x + 600, box.y + 400);
  expect((await tooltipOf(chevron)).display).toBe('none');

  await chevron.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(chevron).toBeFocused();
  expect((await tooltipOf(chevron)).display).toBe('block');
  await page.keyboard.press('Escape');
  expect((await tooltipOf(chevron)).display).toBe('none');

  await page.keyboard.press('Enter');
  const root = page.locator('app-sidebar [data-project-id="project-renovation"] a');
  await expect(root).toBeFocused();
  await expect(root).toHaveAttribute('aria-current', 'location');
  await expect(page).toHaveURL(/\/projects\/project-cabinets$/);
});

test('Q4 (a): a disclosure toggles a workstream’s children with Enter and Space', async ({ page }) => {
  await seed('nested-projects');
  await page.goto('/projects/project-renovation');
  const kitchen = page.getByRole('button', { name: 'Show Kitchen’s workstreams' });
  await expect(kitchen).toHaveAttribute('aria-expanded', 'false');
  await kitchen.focus();
  await page.keyboard.press('Enter');
  const hide = page.getByRole('button', { name: 'Hide Kitchen’s workstreams' });
  await expect(hide).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('app-sidebar a[data-nav-work]', { hasText: 'Cabinets' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Show Kitchen’s workstreams' })).toHaveAttribute('aria-expanded', 'false');
});

for (const theme of ['dark', 'light'] as const) {
  test(`Q11 (a): archived rows pass colour contrast in the tree (${theme})`, async ({ page }) => {
    await seed('nested-projects');
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((choice) => localStorage.setItem('cwm.theme', choice), theme);
    for (const url of ['/projects/project-legacy', '/projects/project-legacy-child']) {
      await page.goto(url);
      await expect(page.locator('app-sidebar a.tree-link--archived')).toHaveCount(1);
      const results = await new AxeBuilder({ page }).include('app-sidebar').withRules(['color-contrast']).analyze();
      expect(results.violations, url).toEqual([]);
    }
  });
}

test('the pencil: 32 px, centred with the chevron on one row, its tooltip and its menu under it (Lab)', async ({ page }) => {
  const tree = await labRootLevel(page);
  const chevron = tree.getByRole('button', { name: 'All projects' });
  const pencil = tree.getByRole('button', { name: 'Edit project' });
  const [a, b] = [(await chevron.boundingBox())!, (await pencil.boundingBox())!];
  expect([b.width, b.height]).toEqual([32, 32]);
  expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThanOrEqual(2);
  expect(b.x).toBeGreaterThan(a.x);

  await pencil.hover();
  expect(await tooltipOf(pencil)).toEqual({ display: 'block', content: '"Edit project"' });

  await pencil.click();
  const first = tree.getByRole('menuitem', { name: 'Pages of Website launch…' });
  await expect(first).toBeFocused();
  // Measured after the click, which may have scrolled the Lab page.
  const opener = (await pencil.boundingBox())!;
  const menu = (await tree.locator('[data-edit-project-menu]').boundingBox())!;
  expect(menu.y - (opener.y + opener.height)).toBeGreaterThanOrEqual(0);
  expect(menu.y - (opener.y + opener.height)).toBeLessThanOrEqual(16);
  await page.keyboard.press('ArrowDown');
  await expect(tree.getByRole('menuitem', { name: 'Add workstream' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pencil).toBeFocused();
  await expect(pencil).toHaveAttribute('aria-expanded', 'false');
});

test('forced colours keep a border on the chevron, the pencil and New project', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const tree = await labRootLevel(page);
  const panel = page.locator('[data-panel="navigation"]');
  for (const control of [tree.locator('[data-nav-up]'), tree.locator('[data-edit-project]'), panel.locator('[data-new-project]').first()]) {
    const edge = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: parseFloat(style.borderTopWidth), transparent: style.borderTopColor === 'rgba(0, 0, 0, 0)' };
    });
    expect(edge.width).toBeGreaterThan(0);
    expect(edge.transparent).toBe(false);
  }
});

test('on touch the action row’s buttons are 44 px', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: false });
  const page = await context.newPage();
  const tree = await labRootLevel(page);
  for (const name of ['All projects', 'Edit project']) {
    const box = (await tree.getByRole('button', { name }).boundingBox())!;
    expect([box.width, box.height], name).toEqual([44, 44]);
  }
  await context.close();
});

test('R3: indentation stops growing after four levels', async ({ page }) => {
  await seed('nested-projects');
  let parent = 'project-cabinets';
  const { workspace } = await api.get<{ workspace: { id: string } }>('/api/me');
  for (const level of [1, 2, 3, 4, 5]) parent = (await createProject({ workspaceId: workspace.id, kind: 'subproject', parentProjectId: parent, name: `Level ${level}` } as never)).id;
  await page.goto(`/projects/${parent}`);
  const left = async (name: string) => (await page.locator('app-sidebar').getByRole('link', { name, exact: true }).boundingBox())!.x;
  // Kitchen is depth 1, Cabinets 2, Level 1 3, Level 2 4; Level 3 and deeper keep that indent.
  await expect(page.locator('app-sidebar').getByRole('link', { name: 'Level 5', exact: true })).toHaveAttribute('aria-current', 'page');
  const [kitchen, cabinets, level2, level3, level5] = [await left('Kitchen'), await left('Cabinets'), await left('Level 2'), await left('Level 3'), await left('Level 5')];
  expect(cabinets).toBeGreaterThan(kitchen);
  expect(level3).toBe(level2);
  expect(level5).toBe(level2);
});
