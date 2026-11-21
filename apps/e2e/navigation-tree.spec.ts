import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { api, createProject, seed, setPageEnabled } from './seed';

// Acceptance item 4: every journey runs at 1440 unless it names another size.
test.use({ viewport: { width: 1440, height: 900 } });

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

/**
 * J7 (Acceptance item 4, step 9's part; the breadcrumb and the header's height join at step 12): at
 * 375 by touch one navigation control, Menu; the drawer opens on the root level with the current
 * item in view, the chevron and the pencil on its top row and nothing named "Close" (decision 4).
 */
test('J7: the phone drawer opens on the root level with Cabinets current, its action row on top, and every dismissal returns to Menu', async ({ browser }) => {
  await seed('nested-projects');
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/projects/project-cabinets');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const drawer = page.locator('#shell-navigation');
  const isFocused = (locator: Locator) => locator.evaluate((element) => element === document.activeElement);
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeHidden();
  await expect(page.getByRole('button', { name: /navigation/i })).toHaveCount(0);

  const open = async () => {
    await menu.tap();
    await expect(drawer).toHaveAttribute('role', 'dialog');
    // The entrance (a lift's slide) has ended, so boxes measure where they rest.
    await page.locator('.side').evaluate((side) => Promise.all(side.getAnimations().map((animation) => animation.finished)));
  };
  await open();
  const cabinets = drawer.getByRole('link', { name: 'Cabinets', exact: true });
  await expect(cabinets).toHaveAttribute('aria-current', 'page');
  await expect(cabinets).toBeInViewport();
  await expect(drawer.locator('[data-nav-root]')).toHaveAccessibleName(/Home renovation/);
  await expect(drawer.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
  const up = (await drawer.getByRole('button', { name: 'All projects' }).boundingBox())!;
  const pencil = (await drawer.getByRole('button', { name: 'Edit project' }).boundingBox())!;
  for (const box of [up, pencil]) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  expect(Math.abs(up.y + up.height / 2 - (pencil.y + pencil.height / 2))).toBeLessThanOrEqual(2);
  expect(up.x).toBeLessThan(pencil.x);
  const firstRow = (await drawer.locator('[data-nav-root]').boundingBox())!;
  expect(up.y + up.height).toBeLessThanOrEqual(firstRow.y);

  await drawer.getByRole('link', { name: 'Garden Completed', exact: true }).tap();
  await expect(drawer).not.toHaveAttribute('role', 'dialog');
  await expect(page).toHaveURL(/\/projects\/project-garden$/);
  await expect.poll(() => isFocused(page.locator('main'))).toBe(true);

  await open();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toHaveAttribute('role', 'dialog');
  await expect.poll(() => isFocused(menu)).toBe(true);

  await open();
  await page.touchscreen.tap(360, 600);
  await expect(drawer).not.toHaveAttribute('role', 'dialog');
  await expect.poll(() => isFocused(menu)).toBe(true);

  // Reached by Tab from the last row, and visible once focused.
  await open();
  const dismiss = drawer.getByRole('button', { name: 'Close navigation' });
  const lastRow = drawer.locator('app-sidebar :is(a[href], button):not([tabindex="-1"])').last();
  await lastRow.focus();
  await expect.poll(() => isFocused(lastRow)).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => isFocused(dismiss)).toBe(true);
  const box = (await dismiss.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThan(44);
  await page.keyboard.press('Enter');
  await expect(drawer).not.toHaveAttribute('role', 'dialog');
  await expect.poll(() => isFocused(menu)).toBe(true);
  await context.close();
});

test('J7: a resize to 1440 closes the drawer', async ({ page }) => {
  await seed('nested-projects');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/projects/project-cabinets');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.locator('#shell-navigation')).toHaveAttribute('role', 'dialog');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#shell-navigation')).not.toHaveAttribute('role', 'dialog');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveCount(0);
  await expect(page.locator('app-sidebar [aria-current="page"]')).toHaveAccessibleName('Cabinets');
});

/*
 * Step 12: the journeys (Acceptance item 4), on `nested-projects` unless named; each reseeds. All run at
 * 1440 with a mouse; J1, J4, J5, J6, J7 and J8 again at 375 by touch; J3, J5, J6 and J9 by keyboard
 * alone (focus moves only by Tab and keys; `locator.press` is a key press on the focused control).
 */

type Device = 'desktop' | 'phone';
const ROOT = 'project-renovation';

/** A 1440 mouse page or a 375 touch page in its own context. */
const open = async (browser: import('@playwright/test').Browser, device: Device) => {
  const context = await browser.newContext(device === 'desktop'
    ? { viewport: { width: 1440, height: 900 } }
    : { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  return { context, page: await context.newPage() };
};

const navTree = (page: Page) => page.getByRole('navigation', { name: 'Workspace' });
const drawer = (page: Page) => page.locator('#shell-navigation');
const menuButton = (page: Page) => page.getByRole('button', { name: 'Menu', exact: true });
const isFocused = (locator: Locator) => locator.evaluate((element) => element === document.activeElement);
const focusInside = (locator: Locator) => locator.evaluate((element) => element.contains(document.activeElement));
const heading = (page: Page) => page.locator('main h1').first();

/** Opens the phone drawer and waits for its entrance to finish, so boxes measure where they rest. */
const openDrawer = async (page: Page) => {
  await menuButton(page).tap();
  await expect(drawer(page)).toHaveAttribute('role', 'dialog');
  await page.locator('.side').evaluate((side) => Promise.all(side.getAnimations().map((animation) => animation.finished)));
};

/** J1's places: the URL and the current item's name, less any status mark. */
const PLACES = [
  ['/app', 'Home'],
  ['/calendar', 'Calendar'],
  ['/search', 'Search'],
  ['/settings', 'Settings'],
  ['/settings/agents', 'AI & Agents'],
  ['/settings/archived-projects', 'Archived projects'],
  [`/projects/${ROOT}`, 'Home renovation'],
  [`/projects/${ROOT}/pages/todos`, 'Todos'],
  [`/projects/${ROOT}/pages/archive`, 'Archive'],
  [`/projects/${ROOT}/pages/reflections`, 'Reflections'],
  ['/projects/project-kitchen', 'Kitchen'],
  ['/projects/project-cabinets', 'Cabinets'],
  ['/projects/project-legacy', 'Legacy attic'],
  ['/projects/project-legacy-child', 'Legacy shelving'],
] as const;

/** The current item's drawn edge, so a neighbour without it can be told apart. */
const edgeOf = (item: Locator) => item.evaluate((element) => {
  const style = getComputedStyle(element);
  return [style.borderInlineStartStyle, style.borderInlineStartWidth, style.borderInlineStartColor, style.outlineStyle, style.outlineWidth, style.boxShadow].join('|');
});

for (const device of ['desktop', 'phone'] as const) {
  test(`J1 (${device}): one current item per place, named as the page's h1 and in the title; a shape under forced colours`, async ({ browser }) => {
    test.setTimeout(180_000);
    await seed('nested-projects');
    const { context, page } = await open(browser, device);
    for (const forcedColors of ['none', 'active'] as const) {
      await page.emulateMedia({ forcedColors });
      for (const [url, name] of PLACES) {
        await page.goto(url);
        await expect(heading(page)).toBeVisible();
        if (device === 'phone') await openDrawer(page);
        const current = navTree(page).locator('[aria-current="page"]');
        await expect(current, url).toHaveCount(1);
        await expect(current, url).toHaveAccessibleName(new RegExp(`^${name.replace(/[&]/g, '\\$&')}( Archived)?$`));
        await expect(heading(page), url).toHaveText(name);
        expect(await page.title(), url).toContain(name);
        if (forcedColors === 'active') {
          const neighbour = navTree(page).locator('a.tree-link:not([aria-current])').first();
          // The weight differs on every place, so only the drawn edge is compared (a lost bar must fail).
          expect(await edgeOf(current), url).not.toBe(await edgeOf(neighbour));
          expect(await current.evaluate((element) => getComputedStyle(element).borderInlineStartStyle), url).toBe('solid');
        }
        if (device === 'phone') {
          await page.keyboard.press('Escape');
          await expect(drawer(page)).not.toHaveAttribute('role', 'dialog');
        }
      }
    }
    await context.close();
  });
}

test('J1: Q5 (d): the root’s first page is called by its project, not "Home", in Archive’s origins and a fallback notice', async ({ page }) => {
  await seed('nested-projects');
  await page.goto(`/projects/${ROOT}/pages/archive`);
  const origins = page.locator('[data-archived-origin]');
  await expect(origins.first()).toBeVisible();
  for (const text of await origins.allInnerTexts()) expect(text.split(/\s*›\s*|:\s*/).map((step) => step.trim())).not.toContain('Home');
  await setPageEnabled(ROOT, 'reflections', false);
  await page.goto(`/projects/${ROOT}/pages/reflections`);
  const notice = page.locator('[data-page-notice] span').first();
  await expect(notice).toBeVisible();
  expect((await notice.innerText()).replaceAll('Home renovation', '')).not.toMatch(/\bHome\b/);
});

test('J1: the chevron shows Home renovation as the location with nothing current; Kitchen’s pill returns to the root level', async ({ page }) => {
  await seed('nested-projects');
  await page.goto('/projects/project-cabinets');
  await page.getByRole('button', { name: 'All projects' }).click();
  await expect(navTree(page).locator('[aria-current="location"]')).toHaveAccessibleName(/Home renovation/);
  await expect(navTree(page).locator('[aria-current="page"]')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Kitchen' }).click();
  await expect(page).toHaveURL(/\/projects\/project-kitchen$/);
  await expect(navTree(page).locator('[data-nav-root]')).toBeVisible();
  await expect(navTree(page).locator('[aria-current="page"]')).toHaveAccessibleName('Kitchen');
});

test('J2: one tree: Kitchen has one link in the tree and no "Show project navigation"', async ({ page }) => {
  await seed('nested-projects');
  await page.goto('/projects/project-kitchen');
  await expect(heading(page)).toHaveText('Kitchen');
  await expect(navTree(page).locator('a[href="/projects/project-kitchen"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Show project navigation' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Show project navigation' })).toHaveCount(0);
});

test('J3 (keyboard): the first Tab is Skip to content into main; every place has one main and opens on its h1', async ({ page }) => {
  await seed('nested-projects');
  await page.goto('/projects/project-cabinets');
  await expect(heading(page)).toHaveText('Cabinets');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => focusInside(page.locator('main'))).toBe(true);
  for (const [url, name] of PLACES) {
    await page.goto(url);
    await expect(heading(page), url).toHaveText(name);
    await expect(page.locator('main'), url).toHaveCount(1);
    const first = await page.evaluate(() => document.querySelector('h1, h2, h3, h4, h5, h6')?.tagName);
    expect(first, url).toBe('H1');
  }
});

for (const device of ['desktop', 'phone'] as const) {
  test(`J4 (${device}): the breadcrumb: path, current text, themed pills with a focus ring${device === 'phone' ? ', 44 px tall' : ''}`, async ({ browser }) => {
    await seed('nested-projects');
    const { context, page } = await open(browser, device);
    await page.goto('/projects/project-cabinets');
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.locator('li')).toHaveText(['Home renovation', /Kitchen/, /Cabinets/]);
    await expect(crumbs.locator('li').last().locator('[aria-current="page"]')).toHaveText('Cabinets');
    const links = crumbs.getByRole('link');
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      const rest = await link.evaluate((element) => {
        const style = getComputedStyle(element);
        return { decoration: style.textDecorationLine, background: style.backgroundColor, height: element.getBoundingClientRect().height, ring: `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}` };
      });
      expect(rest.decoration).not.toContain('underline');
      expect(rest.background).not.toBe('rgba(0, 0, 0, 0)');
      if (device === 'phone') expect(rest.height).toBeGreaterThanOrEqual(44);
      await link.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      const ring = await link.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth), shadow: style.boxShadow };
      });
      expect(ring.outline !== 'none' && ring.width > 0 || ring.shadow !== 'none').toBe(true);
      // Step 14 review: the ring is drawn by focus, not a resting style that would pass anyway.
      expect(`${ring.outline} ${ring.width}px ${ring.shadow}`).not.toBe(rest.ring);
    }
    if (device === 'desktop') {
      const underlined = await navTree(page).evaluate((root) => [...root.querySelectorAll('a')].filter((item) => getComputedStyle(item).textDecorationLine.includes('underline')).length);
      expect(underlined).toBe(0);
    }
    await (device === 'phone' ? links.filter({ hasText: 'Kitchen' }).tap() : links.filter({ hasText: 'Kitchen' }).click());
    await expect(page).toHaveURL(/\/projects\/project-kitchen$/);
    await expect(heading(page)).toHaveText('Kitchen');
    await page.goto('/settings/agents');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('li')).toHaveText(['Settings', /AI & Agents/]);
    await context.close();
  });
}

const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Add workstream' });
const parentOf = (page: Page) => dialogOf(page).locator('[data-create-work-parent]');
const pencilOf = (page: Page) => page.locator('app-sidebar [data-edit-project]');
const moreOf = (page: Page) => page.locator('[data-project-more]');
const toastOf = (page: Page) => page.locator('[data-toast]:popover-open');

/** Moves focus down an open menu with ArrowDown until it reaches `item`. */
const arrowTo = async (page: Page, item: Locator) => {
  for (let step = 0; step < 12 && !(await isFocused(item)); step += 1) await page.keyboard.press('ArrowDown');
  await expect(item).toBeFocused();
};

/** Opens Add workstream from the pencil or from More, by mouse, touch or keys. */
const openAdd = async (page: Page, from: 'pencil' | 'more', input: 'mouse' | 'touch' | 'keyboard') => {
  if (input === 'touch' && from === 'pencil') await openDrawer(page);
  const opener = from === 'pencil' ? pencilOf(page) : moreOf(page);
  const item = page.locator(from === 'pencil' ? '[data-edit-project-add]' : '[data-project-add-workstream]');
  if (input === 'keyboard') {
    await opener.press('Enter');
    await expect(page.locator(from === 'pencil' ? '[data-edit-project-pages]' : '[data-project-edit-details]')).toBeFocused();
    await arrowTo(page, item);
    await page.keyboard.press('Enter');
  } else if (input === 'touch') {
    await opener.tap();
    await item.tap();
  } else {
    await opener.click();
    await item.click();
  }
  await expect(dialogOf(page)).toBeVisible();
};

for (const input of ['mouse', 'touch', 'keyboard'] as const) {
  test(`J5 (${input}): Add workstream preselects the open place, opens the new one, and its toast Undo returns to Kitchen`, async ({ browser }) => {
    test.setTimeout(120_000);
    await seed('nested-projects');
    const { context, page } = await open(browser, input === 'touch' ? 'phone' : 'desktop');
    const returnTarget = (from: 'pencil' | 'more') => (input === 'touch' && from === 'pencil' ? menuButton(page) : from === 'pencil' ? pencilOf(page) : moreOf(page));
    for (const [url, parent] of [['/projects/project-kitchen', 'project-kitchen'], [`/projects/${ROOT}`, ROOT], ['/projects/project-legacy-child', ROOT]] as const) {
      await page.goto(url);
      await expect(heading(page)).toBeVisible();
      for (const from of ['pencil', 'more'] as const) {
        await openAdd(page, from, input);
        await expect(parentOf(page), `${url} ${from}`).toHaveValue(parent);
        await page.keyboard.press('Escape');
        await expect(dialogOf(page)).toHaveCount(0);
        await expect.poll(() => isFocused(returnTarget(from)), `${url} ${from}`).toBe(true);
      }
    }

    await page.goto('/projects/project-kitchen');
    await openAdd(page, 'pencil', input);
    const name = dialogOf(page).locator('[data-create-work-name]');
    await name.fill('Pantry');
    // A refused create (host fault) keeps the dialog, the draft and focus.
    await page.route('**/api/projects', (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'Create failed for this journey' }) })
      : route.fallback());
    await name.press('Enter');
    await expect(dialogOf(page).getByRole('alert')).toHaveText('Couldn’t add “Pantry”. Try again.');
    await expect(name).toHaveValue('Pantry');
    await expect.poll(() => focusInside(dialogOf(page))).toBe(true);
    await page.unroute('**/api/projects');

    const created = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/projects'));
    await name.press('Enter');
    const pantry = ((await (await created).json()) as { project: { id: string } }).project.id;
    await expect(page).toHaveURL(new RegExp(`/projects/${pantry}$`));
    await expect(heading(page)).toHaveText('Pantry');
    await expect(heading(page)).toBeFocused();
    const row = (id: string) => page.locator(`app-sidebar li[data-nav-work-id="${id}"] > .tree-row > a`);
    await expect(page.locator(`app-sidebar li[data-nav-work-id="project-kitchen"] li[data-nav-work-id="${pantry}"]`)).toHaveCount(1);
    await expect(row(pantry)).toHaveAttribute('aria-current', 'page');
    const shape = (link: Locator) => link.evaluate((element) => [element.className.replace(/\bactive\b/, '').replace(/\s+/g, ' ').trim(), element.getBoundingClientRect().height, element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingInlineStart) + parseFloat(getComputedStyle(element).borderInlineStartWidth)].join('|'));
    expect(await shape(row(pantry))).toBe(await shape(row('project-cabinets')));
    await expect(toastOf(page)).toContainText('Created Pantry under Kitchen.');

    const undo = toastOf(page).locator('[data-toast-undo]:not([aria-disabled])');
    await (input === 'touch' ? undo.tap() : input === 'keyboard' ? undo.press('Enter') : undo.click());
    await expect(page).toHaveURL(/\/projects\/project-kitchen$/);
    await expect(heading(page)).toHaveText('Kitchen');
    await expect(heading(page)).toBeFocused();
    await expect(page.locator(`app-sidebar li[data-nav-work-id="${pantry}"]`)).toHaveCount(0);
    await expect(toastOf(page)).toContainText('Undone: Created “Pantry”.');
    const redo = toastOf(page).locator('[data-toast-open]');
    await expect(redo).toHaveText('Open Pantry to redo');
    await (input === 'touch' ? redo.tap() : input === 'keyboard' ? redo.press('Enter') : redo.click());
    await expect(page).toHaveURL(new RegExp(`/projects/${pantry}$`));
    await expect(page.locator('[data-project-creation-recovery]')).toContainText('Creation undone');
    await expect(page.locator('[data-project-creation-recovery]').getByRole('button', { name: /Redo/ })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/projects\/project-kitchen$/);
    await expect(toastOf(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/projects/${pantry}$`));
    await expect(page.locator('[data-project-creation-recovery]')).toContainText('Creation undone');
    await context.close();
  });
}

for (const input of ['mouse', 'touch', 'keyboard'] as const) {
  test(`J6 (${input}): page settings from the pencil, anchored under it, and from More; Reflections joins after Todos and Archive`, async ({ browser }) => {
    test.setTimeout(120_000);
    await seed('nested-projects');
    await setPageEnabled(ROOT, 'reflections', false);
    const { context, page } = await open(browser, input === 'touch' ? 'phone' : 'desktop');
    const panel = page.locator('[data-project-page-manager]');
    const reflections = panel.locator('[data-page-toggle-kind="reflections"] input');
    const pages = page.locator('[data-edit-project-pages]');
    const kinds = () => page.locator('app-sidebar [data-nav-page]').evaluateAll((links) => links.map((link) => link.getAttribute('data-nav-page')));
    await page.goto('/projects/project-kitchen');
    await expect(heading(page)).toHaveText('Kitchen');

    if (input === 'touch') await openDrawer(page);
    await expect(pages).toHaveCount(1);
    if (input === 'keyboard') {
      await pencilOf(page).press('Enter');
      await expect(pages).toBeFocused();
    } else await (input === 'touch' ? pencilOf(page).tap() : pencilOf(page).click());
    await expect(pages).toHaveAccessibleName('Pages of Home renovation…');
    await (input === 'touch' ? pages.tap() : input === 'keyboard' ? pages.press('Enter') : pages.click());
    await expect(panel).toBeVisible();
    if (input === 'touch') {
      await expect(drawer(page)).not.toHaveAttribute('role', 'dialog');
    } else {
      const opener = (await pencilOf(page).boundingBox())!;
      const box = (await panel.boundingBox())!;
      expect(box.y - (opener.y + opener.height)).toBeGreaterThanOrEqual(0);
      expect(box.y - (opener.y + opener.height)).toBeLessThanOrEqual(16);
      expect(box.x < opener.x + opener.width && box.x + box.width > opener.x).toBe(true);
    }
    await expect(reflections).not.toBeChecked();
    await (input === 'touch' ? reflections.tap() : input === 'keyboard' ? reflections.press('Space') : reflections.click());
    await expect(reflections).toBeChecked();
    await expect.poll(kinds).toEqual(['todos', 'archive', 'reflections']);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect.poll(() => isFocused(input === 'touch' ? menuButton(page) : pencilOf(page))).toBe(true);

    // The same item in More, its focus returning to More.
    if (input === 'keyboard') {
      await moreOf(page).press('Enter');
      await arrowTo(page, page.locator('[data-project-pages]'));
      await expect(page.locator('[data-project-pages]')).toHaveAccessibleName('Pages of Home renovation…');
      await page.keyboard.press('Enter');
    } else {
      await (input === 'touch' ? moreOf(page).tap() : moreOf(page).click());
      await expect(page.locator('[data-project-pages]')).toHaveAccessibleName('Pages of Home renovation…');
      await (input === 'touch' ? page.locator('[data-project-pages]').tap() : page.locator('[data-project-pages]').click());
    }
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect.poll(() => isFocused(moreOf(page))).toBe(true);
    await context.close();
  });
}

test('J6: a page change from another tab reaches the tree through the live frame', async ({ page }) => {
  await seed('nested-projects');
  const stream = page.waitForResponse((response) => response.url().includes('/prototype/events') && response.status() === 200);
  await page.goto('/projects/project-kitchen');
  await stream;
  await expect(page.locator('app-sidebar [data-nav-page="reflections"]')).toBeVisible();
  await setPageEnabled(ROOT, 'reflections', false);
  await expect(page.locator('app-sidebar [data-nav-page="reflections"]')).toHaveCount(0);
  await setPageEnabled(ROOT, 'reflections', true);
  await expect(page.locator('app-sidebar [data-nav-page="reflections"]')).toBeVisible();
});

// J7 as written: the header's own height. Whether Q10 means its bottom edge instead is Open question 20.
test('J7: at 375 Cabinets’s breadcrumb shows the path and the header is at most 203 px with the drawer closed', async ({ browser }) => {
  await seed('nested-projects');
  const { context, page } = await open(browser, 'phone');
  await page.goto('/projects/project-cabinets');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('li')).toHaveText(['Home renovation', /Kitchen/, /Cabinets/]);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
  const header = (await page.locator('header.project-header').boundingBox())!;
  expect(header.height).toBeLessThanOrEqual(203);
  await context.close();
});

for (const device of ['desktop', 'phone'] as const) {
  test(`J8 (${device}): archived places are current and marked, pass contrast in both themes, and leave the tree when left`, async ({ browser }) => {
    test.setTimeout(120_000);
    await seed('nested-projects');
    const { context, page } = await open(browser, device);
    const scope = () => (device === 'phone' ? '#shell-navigation' : 'app-sidebar');
    for (const theme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/projects/project-legacy');
      await page.evaluate((choice) => localStorage.setItem('cwm.theme', choice), theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      if (device === 'phone') await openDrawer(page);
      await expect(navTree(page).locator('[aria-current="page"]')).toHaveAccessibleName('Legacy attic Archived');
      expect((await new AxeBuilder({ page }).include(scope()).withRules(['color-contrast']).analyze()).violations, theme).toEqual([]);
      if (device === 'phone') await page.keyboard.press('Escape');

      await page.goto('/projects/project-legacy-child');
      if (device === 'phone') await openDrawer(page);
      await expect(navTree(page).locator('[aria-current="page"]')).toHaveAccessibleName(/^Legacy shelving/);
      const attic = page.locator('app-sidebar li[data-nav-work-id="project-legacy"]');
      await expect(attic.locator(':scope > .tree-row > a')).toHaveAccessibleName('Legacy attic Archived');
      await expect(attic.locator('li[data-nav-work-id="project-legacy-child"]')).toHaveCount(1);
      expect((await new AxeBuilder({ page }).include(scope()).withRules(['color-contrast']).analyze()).violations, theme).toEqual([]);
      if (device === 'phone') await page.keyboard.press('Escape');
    }
    await page.goto('/projects/project-kitchen');
    await expect(heading(page)).toHaveText('Kitchen');
    await expect(page.locator('app-sidebar [data-nav-work-id^="project-legacy"]')).toHaveCount(0);
    await expect(page.locator('app-sidebar')).not.toContainText('No workstreams yet');
    // Leaving Legacy attic itself (not only its child) removes it too.
    await page.goto('/projects/project-legacy');
    await expect(page.locator('app-sidebar li[data-nav-work-id="project-legacy"]')).toHaveCount(1);
    await page.goto('/projects/project-kitchen');
    await expect(heading(page)).toHaveText('Kitchen');
    await expect(page.locator('app-sidebar [data-nav-work-id^="project-legacy"]')).toHaveCount(0);
    await context.close();
  });
}

test('J9 (keyboard): Tab runs chevron, pencil, root, pages, then each workstream and its expand button; disclosures, chevron and pencil by keys', async ({ page }) => {
  await seed('nested-projects');
  const { workspace } = await api.get<{ workspace: { id: string } }>('/api/me');
  await createProject({ workspaceId: workspace.id, kind: 'subproject', parentProjectId: 'project-garden', name: 'Raised beds' } as never);
  await page.goto('/projects/project-cabinets');
  await expect(heading(page)).toHaveText('Cabinets');
  const sidebar = page.locator('app-sidebar');
  const stops = await sidebar.locator('[data-nav-root-level] :is(a[href], button):visible').evaluateAll((items) => items.map((item) => item.outerHTML.slice(0, 120)));
  await page.locator('[data-nav-up]').focus();
  const visited: string[] = [];
  const actionCount = await sidebar.locator('[data-nav-actions] button:visible').count();
  for (let index = 0; index < stops.length + actionCount; index += 1) {
    visited.push(await page.evaluate(() => document.activeElement!.outerHTML.slice(0, 120)));
    await page.keyboard.press('Tab');
  }
  // The action row precedes the root level in the DOM.
  const actions = await sidebar.locator('[data-nav-actions] button:visible').evaluateAll((items) => items.map((item) => item.outerHTML.slice(0, 120)));
  expect(visited.slice(0, actions.length)).toEqual(actions);
  expect(visited.slice(actions.length)).toEqual(stops);
  expect(visited[0]).toContain('data-nav-up');
  expect(visited[1]).toContain('data-edit-project');
  expect(visited[2]).toContain('data-nav-root');
  // Step 14 review: the walk names its stops, so a missing page link or disclosure fails.
  const count = (marker: string) => stops.filter((stop) => stop.includes(marker)).length;
  expect(stops.filter((stop) => /data-nav-root(?!-)/.test(stop))).toHaveLength(1);
  expect(count('data-nav-page')).toBeGreaterThanOrEqual(1);
  expect(count('data-nav-disclosure')).toBe(2);
  for (const id of ['project-kitchen', 'project-cabinets', 'project-garden']) expect(stops.some((stop) => stop.includes(`/projects/${id}"`))).toBe(true);

  const garden = page.locator('app-sidebar li[data-nav-work-id="project-garden"] > .tree-row > [data-nav-disclosure]');
  await expect(garden).toHaveAttribute('aria-expanded', 'false');
  await garden.press('Enter');
  await expect(garden).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar.getByRole('link', { name: 'Raised beds' })).toBeVisible();
  await garden.press('Space');
  await expect(garden).toHaveAttribute('aria-expanded', 'false');
  await garden.press('Enter');
  await sidebar.locator('[data-nav-page="todos"]').press('Enter');
  await expect(page).toHaveURL(/\/pages\/todos$/);
  await expect(garden).toHaveAttribute('aria-expanded', 'true');

  await page.goto('/projects/project-cabinets');
  const pencil = pencilOf(page);
  await pencil.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(pencil).toBeFocused();
  expect((await tooltipOf(pencil)).display).toBe('block');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-edit-project-pages]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-edit-project-add]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-edit-project-pages]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pencil).toBeFocused();
  await expect(pencil).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-edit-project-pages]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(pencil).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-edit-project-menu]')).toBeHidden();
  await pencil.hover();
  expect((await tooltipOf(pencil)).display).toBe('block');

  await page.locator('[data-nav-up]').press('Enter');
  await expect(page.locator('app-sidebar [data-project-id="project-renovation"] a')).toBeFocused();
});

test('J9: at 375 in the open drawer, Escape in the pencil menu closes only the menu', async ({ browser }) => {
  await seed('nested-projects');
  const { context, page } = await open(browser, 'phone');
  await page.goto('/projects/project-cabinets');
  await openDrawer(page);
  await pencilOf(page).press('Enter');
  await expect(page.locator('[data-edit-project-pages]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveAttribute('role', 'dialog');
  await expect.poll(() => isFocused(pencilOf(page))).toBe(true);
  await context.close();
});

test('J10: five levels under Cabinets: the deepest current, its ancestors open, and the breadcrumb names all eight', async ({ page }) => {
  await seed('nested-projects');
  let parent = 'project-cabinets';
  const ids: string[] = [];
  const { workspace } = await api.get<{ workspace: { id: string } }>('/api/me');
  for (const level of [1, 2, 3, 4, 5]) ids.push(parent = (await createProject({ workspaceId: workspace.id, kind: 'subproject', parentProjectId: parent, name: `Level ${level}` } as never)).id);
  await page.goto(`/projects/${parent}`);
  await expect(page.locator('app-sidebar [aria-current="page"]')).toHaveAccessibleName('Level 5');
  for (const id of ['project-kitchen', 'project-cabinets', ...ids.slice(0, 4)]) {
    await expect(page.locator(`app-sidebar li[data-nav-work-id="${id}"] > .tree-row > [data-nav-disclosure]`), id).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('li')).toHaveText(['Home renovation', 'Kitchen', 'Cabinets', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'].map((name, index) => (index === 0 ? name : new RegExp(name))));
});

test('J11: at 1024×768 the tree is at most 256 px, the first section is in view, and the tree stays while main scrolls', async ({ page }) => {
  await seed('nested-projects');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`/projects/${ROOT}`);
  const nav = navTree(page);
  await expect(nav).toBeVisible();
  expect((await nav.boundingBox())!.width).toBeLessThanOrEqual(256);
  const frame = page.locator('app-project-section-frame').first();
  await expect(frame).toBeVisible();
  const top = (await frame.boundingBox())!.y;
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(768);
  const before = (await nav.boundingBox())!.y;
  await page.locator('main').hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => Math.max(window.scrollY, document.querySelector('main')!.scrollTop, ...[...document.querySelectorAll('main, main *')].map((element) => element.scrollTop)))).toBeGreaterThan(0);
  await expect(nav).toBeInViewport();
  await expect.poll(async () => (await nav.boundingBox())!.y).toBe(before);
});

test('J12: document titles, most specific first', async ({ page }) => {
  await seed('nested-projects');
  for (const [url, title] of [
    ['/projects/project-cabinets', 'Cabinets · Home renovation · Canvas Work Manager'],
    [`/projects/${ROOT}/pages/todos`, 'Todos · Home renovation · Canvas Work Manager'],
    ['/settings/agents', 'AI & Agents · Settings · Canvas Work Manager'],
    ['/projects/project-does-not-exist', 'Project not available · Canvas Work Manager'],
  ] as const) {
    await page.goto(url);
    await expect(page, url).toHaveTitle(title);
  }
});
