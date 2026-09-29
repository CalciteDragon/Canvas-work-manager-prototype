/**
 * Slice 58's phone layout: the global navigation drawer, the project column's re-collapse and
 * the Task List details drawer at 375 px, by touch and keyboard, in both themes, and across a
 * resize. Everything here is what jsdom cannot show — a real focus trap, `inert` actually
 * blocking the workspace, container-query stacking, horizontal overflow and `matchMedia`.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { addSection, createRoot, seed, setClock } from './seed';

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

/** The persona's preference decides `data-theme`, so the toggle, not `colorScheme`, sets it. */
const useTheme = async (page: Page, theme: Theme) => {
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

test.beforeEach(async () => {
  await seed('nested-projects');
  await setClock('2026-09-01T12:00:00.000Z');
});

for (const theme of THEMES) {
  test(`${theme}: the drawer opens by tap, Enter and Space, traps focus, and closes by Escape, backdrop and Close`, async ({ browser }) => {
    const context = await phoneContext(browser, theme);
    const page = await context.newPage();
    await page.goto('/app');
    await useTheme(page, theme);

    // Closed at phone width: the inline sidebar is gone from sight, tab order and grid.
    await expectDrawerClosed(page);
    await expect(sidebarLink(page, 'Home')).toBeHidden();
    const menuBox = (await menu(page).boundingBox())!;
    expect(menuBox.height, 'Menu meets the touch target').toBeGreaterThanOrEqual(44);

    await openByTap(page);
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
      ['Archive', '/projects/project-renovation/pages/archive', '[data-project-name]'],
      ['Settings', '/settings', 'main.workspace h1'],
    ] as const) {
      await page.goto(path);
      await expect(page.locator(ready).first()).toBeVisible();
      await expectNoHorizontalOverflow(page, label);
    }

    await context.close();
  });
}

test.describe('at phone width', () => {
  test.use(PHONE);

  test('choosing a destination closes the drawer, navigates and focuses the workspace', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');

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
    await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');

    // Failure first, from a routed POST, so the host keeps no half-made project.
    await page.route('**/api/projects', (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.fallback());
    await openByTap(page);
    await page.locator('[data-new-project]').tap();
    await page.locator('[data-create-project-name]').fill('Phone field notes');
    await page.locator('[data-create-project-submit]').tap();
    await expect(page.locator('[data-create-error]')).toBeVisible();
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
    await expect(panel).toBeHidden();
    // Todos on the same root: no project reload.
    await choose('[data-project-page-tab][data-page-kind="todos"]', /\/pages\/todos$/, 'Home renovation');
    // A unit of work: the project reloads and the toggle is a new one.
    await choose('[data-work-project-id="project-kitchen"] > a', /\/projects\/project-kitchen$/, 'Kitchen');
    // A root page tab from that unit of work reloads back to the root.
    await choose('[data-project-page-tab][data-page-kind="home"]', /\/projects\/project-renovation\/pages\/home$/, 'Home renovation');
  });

  test('a Task List row’s Delete stays tappable while its details drawer is open', async ({ page }) => {
    const root = await createRoot('Phone Task List');
    await addSection(root.id, { type: 'task-list' });
    await page.goto(`/projects/${root.id}`);
    await page.locator('[data-quick-task-title]').fill('Phone delete task');
    await page.locator('[data-quick-create] button[type="submit"]').tap();
    await expect(page.locator('[data-task-drawer]')).toBeVisible();

    // Stacked below the rows, not a second track laid over them.
    const row = (await page.locator('[data-task-row]').boundingBox())!;
    const details = (await page.locator('[data-task-drawer]').boundingBox())!;
    expect(details.y).toBeGreaterThanOrEqual(row.y + row.height);

    await page.locator('[data-task-delete]').tap();
    await expect(page.locator('[data-task-row]')).toHaveCount(0);
    await expect(page.locator('[data-task-delete-recovery]')).toContainText('Phone delete task');
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
  });
});
