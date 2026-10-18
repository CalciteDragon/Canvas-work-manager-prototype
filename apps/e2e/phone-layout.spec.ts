/**
 * Slice 58's phone layout: the global navigation drawer, the project column's re-collapse and
 * the Task List details drawer at 375 px, by touch and keyboard, in both themes, and across a
 * resize. Everything here is what jsdom cannot show — a real focus trap, `inert` actually
 * blocking the workspace, modal task sheets, horizontal overflow and `matchMedia`.
 */
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { ProjectSection } from '@cwm/contracts';
import { addSection, api, createRoot, seed, setClock, setLayout } from './seed';

const PHONE = { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } as const;
const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];

const drawer = (page: Page) => page.locator('#shell-navigation');
const menu = (page: Page) => page.locator('[data-shell-menu]');
const sidebarLink = (page: Page, name: string) => page.locator('a[data-nav-item]', { hasText: name });

const focusMatches = (page: Page, selector: string) =>
  page.evaluate((target) => document.activeElement?.matches(target) ?? false, selector);
const focusInDrawer = (page: Page) =>
  page.evaluate(() => document.getElementById('shell-navigation')?.contains(document.activeElement) ?? false);
const expectFocus = async (page: Page, selector: string) =>
  expect.poll(() => focusMatches(page, selector), { message: `focus on ${selector}` }).toBe(true);

const phoneContext = (browser: Browser, colorScheme: Theme): Promise<BrowserContext> =>
  browser.newContext({ ...PHONE, colorScheme });

/**
 * The persona's preference decides `data-theme`, so the toggle, not `colorScheme`, sets it —
 * after the identity has loaded, or its arrival re-seeds the theme and a create finds no workspace.
 */
const useTheme = async (page: Page, theme: Theme) => {
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
  if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-theme-toggle]').tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
};

const expectDrawerClosed = async (page: Page) => {
  await expect(drawer(page)).not.toHaveAttribute('role', 'dialog');
  await expect(drawer(page)).toHaveAttribute('inert', '');
  await expect(menu(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('main.workspace')).not.toHaveAttribute('inert', '');
};

const expectDrawerOpen = async (page: Page) => {
  await expect(drawer(page)).toHaveAttribute('role', 'dialog');
  await expect(drawer(page)).toHaveAttribute('aria-modal', 'true');
  await expect(menu(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('app-top-bar')).toHaveAttribute('inert', '');
  await expect(page.locator('main.workspace')).toHaveAttribute('inert', '');
  await expect(sidebarLink(page, 'Home')).toBeVisible();
};

const openByTap = async (page: Page) => {
  await menu(page).tap();
  await expectDrawerOpen(page);
  await expectFocus(page, '#shell-navigation');
};

/** Neither the document nor the `<main>` scroll region, nor a project's main track, overflows. */
const expectNoHorizontalOverflow = async (page: Page, label: string) => {
  const widths = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('main.workspace')!;
    const track = document.querySelector<HTMLElement>('.project-workspace__main');
    return {
      document: document.documentElement.scrollWidth,
      main: main.scrollWidth - main.clientWidth,
      track: track === null ? 0 : track.scrollWidth - track.clientWidth,
    };
  });
  expect(widths.document, `${label}: document`).toBeLessThanOrEqual(375);
  expect(widths.main, `${label}: main`).toBeLessThanOrEqual(1);
  expect(widths.track, `${label}: project main track`).toBeLessThanOrEqual(1);
};

/** A long fenced line scrolls within its code block rather than widening the canvas. */
const expectScrollableCode = async (pre: Locator) => {
  await expect(pre).toBeVisible();
  expect(await pre.evaluate((element) => getComputedStyle(element).overflowX)).toMatch(/^(auto|scroll)$/);
  expect(await pre.evaluate((element) => {
    element.scrollLeft = 40;
    return element.scrollLeft;
  })).toBeGreaterThan(0);
};

test.beforeEach(async () => {
  await seed('nested-projects');
  await setClock('2026-09-01T12:00:00.000Z');
});

for (const theme of THEMES) {
  test(`${theme}: Markdown stays contained and editable on a phone and in a narrow Grid`, async ({ browser }) => {
    const root = await createRoot('Markdown containment');
    const source = `# Phone plan\n\n- One\n- Two\n\n[docs](https://example.com)\n\n\`\`\`ts\n${'x'.repeat(200)}\n\`\`\`\n`;
    const section = await addSection(root.id, {
      type: 'markdown', title: 'Narrow Markdown', columnSpan: 4, config: { markdown: source },
    });
    const phone = await phoneContext(browser, theme);
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
    try {
      const page = await phone.newPage();
      await page.goto(`/projects/${root.id}`);
      await useTheme(page, theme);
      const frame = page.locator(`[data-section-item][data-section-id="${section.id}"] [data-section-frame]`);
      await expect(frame.locator('h3')).toHaveText('Phone plan');
      await expect(frame.locator('ul li')).toHaveCount(2);
      await expect(frame.locator('pre code')).toHaveText('x'.repeat(200));
      await expect(frame.locator('a')).toHaveAttribute('rel', /\bnoopener\b/);
      await expectScrollableCode(frame.locator('pre'));
      await expectNoHorizontalOverflow(page, 'Markdown');

      const editedSource = `${source}\nSaved by touch.\n`;
      await frame.locator('[data-markdown-edit]').tap();
      await frame.locator('[data-markdown-source]').fill(editedSource);
      await frame.locator('[data-markdown-save]').tap();
      await expect(frame.locator('[data-markdown-source]')).toHaveCount(0);
      expect((await api.get<ProjectSection[]>(`/api/projects/${root.id}/sections`))
        .find(({ id }) => id === section.id)?.config).toEqual({ markdown: editedSource });

      await setLayout(root.id, 'grid');
      const gridPage = await desktop.newPage();
      await gridPage.goto(`/projects/${root.id}`);
      await expect(gridPage.locator('[data-identity-name]')).toHaveText('Demo User');
      if (await gridPage.locator('html').getAttribute('data-theme') !== theme) {
        await gridPage.locator('[data-theme-toggle]').click();
      }
      await expect(gridPage.locator('html')).toHaveAttribute('data-theme', theme);
      const grid = gridPage.locator('[data-section-canvas]');
      const item = grid.locator(`[data-section-item][data-section-id="${section.id}"]`);
      await expect(item.locator('pre code')).toHaveText('x'.repeat(200));
      const gap = await grid.evaluate((element) => Number.parseFloat(getComputedStyle(element).columnGap));
      const width = await grid.evaluate((element) => element.clientWidth);
      const itemWidth = await item.evaluate((element) => element.getBoundingClientRect().width);
      expect(Math.abs(itemWidth - (4 * (width - 11 * gap) / 12 + 3 * gap)), 'Grid applies span 4').toBeLessThanOrEqual(1);
      await expectScrollableCode(item.locator('pre'));
      const gridFrame = item.locator('[data-section-frame]');
      expect(await gridFrame.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(itemWidth + 1);
      // Sparse-grid insertion overlays intentionally extend the item's scroll box into the gap.
      // The frame must fit its item, while content and page scroll boxes remain contained.
      for (const [label, locator] of [
        ['frame', gridFrame], ['grid', grid], ['document', gridPage.locator('html')],
      ] as const) {
        expect(await locator.evaluate((element) => element.scrollWidth - element.clientWidth), label).toBeLessThanOrEqual(1);
      }
    } finally {
      await phone.close();
      await desktop.close();
    }
  });

  test(`${theme}: the drawer opens by tap, Enter and Space, traps focus, and closes by Escape, backdrop and Close`, async ({ browser }) => {
    const context = await phoneContext(browser, theme);
    const page = await context.newPage();
    await page.goto('/app');
    await useTheme(page, theme);

    // Closed at phone width: the inline sidebar is gone from sight, tab order and grid.
    await expectDrawerClosed(page);
    await expect(sidebarLink(page, 'Home')).toBeHidden();
    for (const control of ['[data-shell-menu]', '[data-theme-toggle]']) {
      expect((await page.locator(control).boundingBox())!.height, `${control} touch target`).toBeGreaterThanOrEqual(44);
    }
    // Out of sight at phone width, but still who the screen reader user is acting as.
    await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
    expect((await page.locator('[data-identity-name]').boundingBox())!.width).toBeLessThanOrEqual(1);

    await openByTap(page);
    for (const control of ['[data-shell-drawer-close]', 'a[data-nav-item]', '[data-new-project]', 'a[data-project]']) {
      expect((await page.locator(control).first().boundingBox())!.height, `${control} touch target`).toBeGreaterThanOrEqual(44);
    }
    for (const key of ['Tab', 'Shift+Tab'] as const) {
      for (let press = 0; press < 12; press += 1) {
        await page.keyboard.press(key);
        expect(await focusInDrawer(page), `${key} ${press + 1} stays in the drawer`).toBe(true);
      }
    }

    // The strip of workspace beside the drawer is the backdrop: a tap there only closes.
    const url = page.url();
    await page.touchscreen.tap(360, 600);
    await expectDrawerClosed(page);
    expect(page.url()).toBe(url);
    await expectFocus(page, '[data-shell-menu]');

    await menu(page).press('Enter');
    await expectDrawerOpen(page);
    await expectFocus(page, '#shell-navigation');
    await page.keyboard.press('Escape');
    await expectDrawerClosed(page);
    await expectFocus(page, '[data-shell-menu]');

    await menu(page).press('Space');
    await expectDrawerOpen(page);
    await page.locator('[data-shell-drawer-close]').tap();
    await expectDrawerClosed(page);
    await expectFocus(page, '[data-shell-menu]');

    await context.close();
  });

  test(`${theme}: no page overflows horizontally at 375 px`, async ({ browser }) => {
    const context = await phoneContext(browser, theme);
    const page = await context.newPage();
    await page.goto('/app');
    await useTheme(page, theme);
    await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
    await expectNoHorizontalOverflow(page, 'Home');

    for (const [label, path, ready] of [
      ['project canvas', '/projects/project-renovation', '[data-section-canvas]'],
      ['Todos', '/projects/project-renovation/pages/todos', '#todos-heading'],
      ['Archive', '/projects/project-renovation/pages/archive', '[data-archive-count]'],
      ['Settings', '/settings', 'main.workspace h1'],
    ] as const) {
      await page.goto(path);
      await expect(page.locator(ready).first()).toBeVisible();
      await expectNoHorizontalOverflow(page, label);
    }

    await context.close();
  });
}

for (const theme of THEMES) test.describe(`at phone width, ${theme}`, () => {
  test.use({ ...PHONE, colorScheme: theme });

  test('gear page settings and Work creation stay tappable and fit the viewport', async ({ page }) => {
    await page.goto('/projects/project-renovation');
    await useTheme(page, theme);
    await page.locator('[data-project-nav-toggle]').tap();
    const gear = page.locator('[data-project-settings-toggle]');
    await gear.tap();
    await expect(page.locator('[data-project-page-manager]')).toBeVisible();
    const toggle = page.locator('[data-page-toggle-kind="reflections"] input');
    await toggle.tap();
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('[data-project-page-tab][data-page-kind="reflections"]')).toHaveCount(0);
    await toggle.press('Escape');
    await expect(gear).toBeFocused();
    await expect(page.locator('[data-project-page-manager]')).toBeHidden();
    const plus = page.locator('[data-work-create]');
    for (const control of [gear, plus]) {
      const box = (await control.boundingBox())!;
      expect(box.height, 'coarse-pointer target height').toBeGreaterThanOrEqual(44);
      expect(box.width, 'coarse-pointer target width').toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    await plus.tap();
    const dialog = page.getByRole('dialog', { name: 'Add workstream' });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(812);
    await expectNoHorizontalOverflow(page, 'Work creation dialog');
    const name = `Phone workstream ${theme}`;
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await expect(dialog.getByRole('combobox', { name: 'Parent', exact: true })).toHaveValue('project-renovation');
    await expect(dialog).toContainText('Inside Home renovation');
    const url = page.url();
    await dialog.getByRole('button', { name: 'Create', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    expect(page.url()).toBe(url);
    await expect(plus).toBeFocused();
    const child = (await api.get<Array<{ id: string; name: string; parentProjectId?: string }>>('/api/projects')).find((project) => project.name === name)!;
    expect(child.parentProjectId).toBe('project-renovation');
    await expect(page.locator(`[data-work-project-id="${child.id}"]`)).toBeVisible();
    await expectNoHorizontalOverflow(page, 'Created workstream');
  });

  test('choosing a destination closes the drawer, navigates and focuses the workspace', async ({ page }) => {
    await page.goto('/app');
    await useTheme(page, theme);

    // The route already current: the router emits no navigation, and the drawer still closes.
    await openByTap(page);
    await sidebarLink(page, 'Home').tap();
    await expectDrawerClosed(page);
    await expect(page).toHaveURL(/\/app$/);
    await expectFocus(page, 'main.workspace');

    await openByTap(page);
    await page.locator('[data-project-id="project-cabinets"] > a').tap();
    await expectDrawerClosed(page);
    await expect(page).toHaveURL(/\/projects\/project-cabinets$/);
    await expect(page.locator('[data-project-name]')).toContainText('Cabinets');
    await expectFocus(page, 'main.workspace');

    await openByTap(page);
    await sidebarLink(page, 'Settings').tap();
    await expectDrawerClosed(page);
    await expect(page).toHaveURL(/\/settings$/);
    await expectFocus(page, 'main.workspace');
  });

  test('creating a project from the drawer closes it on success and keeps it, the draft and focus on failure', async ({ page }) => {
    await page.goto('/app');
    await useTheme(page, theme);

    // Failure first, from a routed POST, so the host keeps no half-made project.
    await page.route('**/api/projects', (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.fallback());
    await openByTap(page);
    await page.locator('[data-new-project]').tap();
    await page.locator('[data-create-project-name]').fill('Phone field notes');
    await page.locator('[data-create-project-submit]').tap();
    await expect(page.locator('[data-create-error]')).toContainText('could not reach');
    await expectDrawerOpen(page);
    await expect(page.locator('[data-create-project-name]')).toHaveValue('Phone field notes');
    await expectFocus(page, '[data-create-project-name]');

    await page.unroute('**/api/projects');
    await page.locator('[data-create-project-submit]').tap();
    await expect(page).toHaveURL(/\/projects\/project-/);
    await expect(page.locator('[data-project-name]')).toContainText('Phone field notes');
    await expectDrawerClosed(page);
    await expectFocus(page, 'main.workspace');
  });

  test('a chosen project page or unit of work re-collapses the column and focuses its toggle', async ({ page }) => {
    const toggle = page.locator('[data-project-nav-toggle]');
    const panel = page.locator('#project-nav-panel');
    const choose = async (link: string, url: RegExp, project: string) => {
      await toggle.tap();
      await expect(panel).toBeVisible();
      await page.locator(link).tap();
      await expect(page).toHaveURL(url);
      await expect(page.locator('[data-project-name]')).toContainText(project);
      await expect(panel).toBeHidden();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expectFocus(page, '[data-project-nav-toggle]');
    };

    await page.goto('/projects/project-renovation/pages/home');
    await useTheme(page, theme);
    await expect(panel).toBeHidden();
    // Todos on the same root: no project reload.
    await choose('[data-project-page-tab][data-page-kind="todos"]', /\/pages\/todos$/, 'Home renovation');
    // A unit of work: the project reloads and the toggle is a new one.
    await choose('[data-work-project-id="project-kitchen"] > a', /\/projects\/project-kitchen$/, 'Kitchen');
    // A root page tab from that unit of work reloads back to the root.
    await choose('[data-project-page-tab][data-page-kind="home"]', /\/projects\/project-renovation\/pages\/home$/, 'Home renovation');
  });

  test('quick-add keeps the task list usable and Delete stays tappable after closing its sheet', async ({ page }) => {
    const root = await createRoot('Phone Task List');
    await addSection(root.id, { type: 'task-list' });
    await page.goto(`/projects/${root.id}`);
    await useTheme(page, theme);
    await page.locator('[data-quick-task-title]').fill('Phone delete task');
    await page.locator('[data-quick-create] button[type="submit"]').tap();
    await expect(page.locator('[data-task-drawer]')).toHaveCount(0);
    await page.locator('button[data-task-title]').tap();
    await expect(page.locator('[data-task-drawer]')).toBeVisible();
    await expect(page.locator('[data-task-drawer]')).toHaveCSS('transform', 'none');
    const details = (await page.locator('[data-task-drawer]').boundingBox())!;
    expect(details.y).toBe(0);
    expect(details.height).toBe(812);
    await page.locator('[data-close-drawer]').tap();
    await page.locator('[data-task-delete]').tap();
    await expect(page.locator('[data-task-row]')).toHaveCount(0);
    await expect(page.locator('[data-toast]:popover-open')).toContainText('Phone delete task');
  });

  test('a title tap opens the task sheet, Close returns focus, and a done checkbox reopens by touch', async ({ page }) => {
    await page.goto('/projects/project-kitchen');
    await useTheme(page, theme);
    const row = page.locator('[data-task-row][data-task-id="task-kitchen-completed"]');
    const title = row.locator('button[data-task-title]');
    await title.tap();
    const details = page.locator('[data-task-drawer]');
    await expect(details).toBeVisible();
    await expect(title).toHaveAttribute('aria-current', 'true');
    await expect(details).toHaveCSS('transform', 'none');
    const drawerBox = (await details.boundingBox())!;
    expect(drawerBox.y).toBe(0);
    expect(drawerBox.height).toBe(812);
    await expect(details).toHaveAttribute('aria-modal', 'true');
    await expect(details.locator('h2')).toBeFocused();
    await details.getByRole('button', { name: 'Close task details' }).tap();
    await expect(details).toHaveCount(0);
    await expect(title).toBeFocused();
    await expectNoHorizontalOverflow(page, 'Task drawer closed');

    const toggle = row.locator('[data-task-complete]');
    await expect(toggle).toBeChecked();
    await toggle.tap();
    await expect(toggle).not.toBeChecked();
    await expect.poll(async () => api.get<{ status: string; completedAt?: string }>('/api/tasks/task-kitchen-completed'))
      .toMatchObject({ status: 'todo' });
    expect(await api.get('/api/tasks/task-kitchen-completed')).not.toHaveProperty('completedAt');
    await page.reload();
    await expect(toggle).not.toBeChecked();
    await expectNoHorizontalOverflow(page, 'Task reopened');
  });
});

// A separate, non-mobile context: `isMobile` emulation does not resize faithfully.
test.describe('across a resize', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const expectInlineSidebar = async (page: Page) => {
    await expect(menu(page)).toHaveCount(0);
    await expect(sidebarLink(page, 'Home')).toBeVisible();
    await expect(drawer(page)).not.toHaveAttribute('role', 'dialog');
    await expect(drawer(page)).not.toHaveAttribute('aria-modal', 'true');
    for (const region of ['#shell-navigation', 'app-top-bar', 'main.workspace']) {
      await expect(page.locator(region)).not.toHaveAttribute('inert', '');
    }
  };

  test('widening restores the inline sidebar with no stale dialog and no lost focus; narrowing rescues focus', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');

    await menu(page).click();
    await expectDrawerOpen(page);
    await sidebarLink(page, 'Settings').focus();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectInlineSidebar(page);
    await expectFocus(page, 'a[data-nav-item][href="/settings"]');

    await page.setViewportSize({ width: 375, height: 812 });
    await expectDrawerClosed(page);
    await menu(page).click();
    await expectDrawerOpen(page);
    await page.locator('[data-shell-drawer-close]').focus();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectInlineSidebar(page);
    await expectFocus(page, 'a[data-nav-item][href="/app"]');

    await sidebarLink(page, 'Settings').focus();
    await page.setViewportSize({ width: 375, height: 812 });
    await expectDrawerClosed(page);
    await expectFocus(page, '[data-shell-menu]');

    // Menu holds focus after every dismissal, and does not exist at desktop width.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectInlineSidebar(page);
    await expectFocus(page, 'a[data-nav-item][href="/app"]');
  });
});
