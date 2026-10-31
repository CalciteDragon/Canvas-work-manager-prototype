import { expect, test, type Locator, type Page } from '@playwright/test';
import { seed, jsonRequest } from './seed';
import { configureContext } from './ux/isolation';
import type { ProjectWriteResult } from '@cwm/contracts';

const toast = (page: Page) => page.locator('[data-toast]:popover-open');
const kitchen = '/projects/project-kitchen';

test.beforeEach(async ({ context }) => {
  await seed('nested-projects');
  if (process.env['UX_STATIC_ORIGIN']) await configureContext(context);
});

for (const touch of [false, true]) {
  test.describe(touch ? 'Feedback at 375 touch' : 'Feedback with keyboard at 1440', () => {
    test.use({ viewport: { width: touch ? 375 : 1440, height: touch ? 812 : 900 }, hasTouch: touch, isMobile: touch });

    test('removal offers Undo first, Undo morphs and returns focus to the section', async ({ page }) => {
      await page.goto(kitchen);
      const remove = page.getByRole('button', { name: /^Remove section / }).first();
      const label = await remove.getAttribute('aria-label');
      await remove.focus();
      if (touch) await remove.tap(); else await remove.press('Enter');
      const undo = toast(page).getByRole('button', { name: 'Undo', exact: true });
      await expect(undo).toBeFocused();
      await expect(undo).not.toHaveAttribute('aria-disabled', 'true');
      await expect(page.locator('[data-toast]:popover-open')).toHaveCount(1);
      await undo.press('Enter');
      await expect(toast(page)).toContainText('Undone:');
      await expect(page.getByRole('button', { name: label!, exact: true })).toBeVisible();
      await expect(page.locator('[data-section-title]:focus')).toHaveCount(1);
    });

    test('Open archive writes nothing and leaves the removal as the latest Undo', async ({ page }) => {
      await page.goto(kitchen);
      const writes: string[] = [];
      page.on('request', request => { if (['POST', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes('/api/')) writes.push(request.url()); });
      await page.getByRole('button', { name: /^Remove section / }).first().click();
      await expect(page.locator('[data-history-undo]')).toHaveAttribute('aria-label', /^Undo: Removed /);
      const latest = await page.locator('[data-history-undo]').getAttribute('aria-label');
      await expect(toast(page)).toBeVisible();
      const count = writes.length;
      await toast(page).getByRole('button', { name: 'Open archive', exact: true }).click();
      // The archived region below carries its own Archive heading once anything is archived.
      await expect(page.locator('#archive-page-title')).toBeFocused();
      expect(writes).toHaveLength(count);
      await page.goto(kitchen);
      await expect(page.locator('[data-history-undo]')).toHaveAttribute('aria-label', latest!);
    });

    test('timer pauses on focus, a newer write replaces feedback, and navigation closes it', async ({ page }) => {
      await page.clock.install();
      await page.goto(kitchen);
      await page.getByRole('button', { name: /^Remove section / }).first().click();
      await expect(toast(page)).toBeVisible();
      await toast(page).getByRole('button', { name: 'Undo', exact: true }).focus();
      await page.clock.fastForward(9000);
      await expect(toast(page)).toBeVisible();
      const second = page.getByRole('button', { name: /^Remove section / }).first();
      await second.click();
      await expect(toast(page)).toBeVisible();
      await expect(toast(page)).toHaveCount(1);
      await page.getByRole('heading', { level: 1 }).focus();
      await page.mouse.move(0, 0);
      await page.clock.fastForward(8001);
      await expect(toast(page)).toHaveCount(0);
      await page.goto('/app');
      await expect(toast(page)).toHaveCount(0);
    });
  });
}

test('hidden Archive directly loads for Alex and Sam without a write', async ({ browser }) => {
  for (const persona of ['user-alex', 'user-sam'] as const) {
    const { project } = await jsonRequest<ProjectWriteResult>('/api/projects', { method: 'POST', persona,
      body: { workspaceId: persona === 'user-alex' ? 'workspace-alex' : 'workspace-sam', kind: 'root', name: 'Hidden Archive test' },
    });
    const context = await browser.newContext();
    if (process.env['UX_STATIC_ORIGIN']) await configureContext(context);
    await context.addInitScript(persona => localStorage.setItem('cwm.prototype.persona', persona), persona);
    const page = await context.newPage();
    await page.goto(`/projects/${project.id}/pages/archive`);
    await expect(page.locator('[data-archive-page]')).toBeVisible();
    await expect(page.locator('[data-page-notice]')).toHaveCount(0);
    await context.close();
  }
});

test('a stale cross-owner receipt refuses Undo without replacing the displayed history', async ({ page }) => {
  await page.goto('/projects/project-renovation/pages/todos');
  const row = page.locator('[data-todo-row]').filter({ hasText: 'Kitchen' }).filter({ has: page.locator('[data-todo-complete]') }).first();
  await row.locator('[data-todo-complete]').click();
  await expect(toast(page)).toContainText('Completed Kitchen.');
  await jsonRequest('/api/projects/project-kitchen', { method: 'PATCH', body: { description: 'A newer change by the same actor' } });
  await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(toast(page)).toContainText('no longer the latest change');
  await expect(toast(page).getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/project-renovation\/pages\/todos/);
});

test('a long task title keeps Undo and Dismiss inside the phone toast when focus stays outside', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(kitchen);
  const id = await page.locator('[data-task-row]').first().getAttribute('data-task-id');
  const title = 'A long planning detail '.repeat(70).trim();
  await jsonRequest(`/api/tasks/${id}`, { method: 'PATCH', body: { title } });
  await page.reload();
  let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  await page.route('**/api/tasks/*/archive', async route => { await gate; await route.fallback(); });
  await page.locator('[data-task-delete]').first().click();
  await page.getByRole('heading', { level: 1 }).focus();
  release();
  await expect(toast(page)).toContainText(title);
  const box = (await toast(page).boundingBox())!;
  for (const name of ['Undo', 'Dismiss']) {
    const control = (await toast(page).getByRole('button', { name, exact: true }).boundingBox())!;
    expect(control.y).toBeGreaterThanOrEqual(box.y);
    expect(control.y + control.height).toBeLessThanOrEqual(box.y + box.height);
  }
});

test.describe('A failed write toast at 375 touch', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  // Slice 78, Open question 5: the 44 px actions and the Details row fit under the touch cap.
  test('shows its whole message, Try again included, without scrolling it', async ({ page }) => {
    await page.route(url => /^\/api\/sections\/[^/]+$/.test(url.pathname), route => route.request().method() === 'DELETE'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'Section removal failed' }) })
      : route.fallback());
    await page.goto(kitchen);
    await page.getByRole('button', { name: /^Remove section / }).first().tap();
    const message = toast(page).locator('.toast__message');
    await expect(message).toContainText('Try again.');
    const fit = await message.evaluate(e => ({ scroll: e.scrollHeight, client: e.clientHeight }));
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    const box = (await toast(page).boundingBox())!;
    for (const control of [toast(page).getByRole('button', { name: 'Dismiss', exact: true }), toast(page).locator('summary')]) {
      const b = (await control.boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height);
    }
  });
});

type Mode = 'keyboard' | 'pointer' | 'touch';
const press = async (control: Locator, mode: Mode) => {
  if (mode === 'keyboard') { await control.focus(); await control.press('Enter'); }
  else if (mode === 'touch') await control.tap();
  else await control.click();
};
const listed = (page: Page) => page.getByRole('button', { name: /^Remove section (?!Progress)/ }).first();

/** Acceptance 9's starred rows: the toast's words and actions, and where focus lands. */
const starred: { row: string; route: string; act: (page: Page, mode: Mode) => Promise<void>; message: RegExp; expected: (string | RegExp)[]; focusInToast: boolean }[] = [
  { row: 'Section Remove, listed', route: kitchen, message: /^Removed the .+ section\.$/, expected: ['Undo', 'Open archive', 'Dismiss'], focusInToast: true,
    act: (page, mode) => press(listed(page), mode) },
  { row: 'Section Remove, unlisted', route: kitchen, message: /^Removed the Progress section\.$/, expected: ['Undo', 'Dismiss'], focusInToast: true,
    act: (page, mode) => press(page.getByRole('button', { name: 'Remove section Progress', exact: true }), mode) },
  { row: 'Task Delete', route: kitchen, message: /^Archived “.+”\.$/, expected: ['Undo', 'Open archive', 'Dismiss'], focusInToast: true,
    act: (page, mode) => press(page.locator('[data-task-delete]').first(), mode) },
  { row: 'Project archive from More', route: '/projects/project-garden', message: /^Archived Garden\.$/, expected: ['Undo', 'Dismiss'], focusInToast: false,
    act: async (page, mode) => {
      await press(page.getByRole('button', { name: 'More project actions', exact: true }), mode);
      await press(page.getByRole('menuitem', { name: /^Archive workstream/ }), mode);
      await press(page.locator('[data-project-archive-confirm-yes]'), mode);
      // The confirmation closes before its toast appears.
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    } },
  { row: 'Header Undo result', route: kitchen, message: /^Undone: /, expected: ['Dismiss'], focusInToast: false,
    act: async (page, mode) => {
      await press(listed(page), mode);
      await expect(toast(page)).toBeVisible();
      await expect(page.locator('[data-history-undo]')).not.toHaveAttribute('aria-disabled', 'true');
      await press(page.locator('[data-history-undo]'), mode);
    } },
  { row: 'Cross-owner write', route: kitchen, message: /\.$/, expected: ['Undo', /^Open /, 'Dismiss'], focusInToast: false,
    act: async (page, mode) => {
      const expand = page.getByRole('button', { name: 'Show project navigation', exact: true });
      if (await expand.isVisible()) await press(expand, mode);
      await press(page.getByRole('button', { name: 'Add workstream', exact: true }), mode);
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Lighting');
      await dialog.getByRole('combobox', { name: 'Parent', exact: true }).selectOption('project-kitchen');
      await press(dialog.getByRole('button', { name: 'Create', exact: true }), mode);
    } },
  { row: 'Archive-page Restore', route: '/projects/project-renovation/pages/archive', message: /^Restored (“.+” to .+|.+ as .+)\.$/, expected: ['Undo', 'Dismiss'], focusInToast: true,
    act: (page, mode) => press(page.locator('[data-archived-restore]:not([disabled])').first(), mode) },
  { row: 'Todos workstream Complete', route: '/projects/project-renovation/pages/todos', message: /^Completed Kitchen\.$/, expected: ['Undo', 'Open Kitchen', 'Dismiss'], focusInToast: true,
    act: (page, mode) => press(page.getByRole('button', { name: 'Complete Kitchen', exact: true }), mode) },
];

for (const mode of ['keyboard', 'pointer', 'touch'] as const) {
  test.describe(`Starred feedback rows, ${mode}`, () => {
    test.use(mode === 'touch' ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
    for (const { row, route, act, message, expected, focusInToast } of starred) {
      test(row, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await act(page, mode);
        await expect(toast(page)).toHaveCount(1);
        await expect(toast(page).locator('.toast__message')).toHaveText(message);
        const names = (await toast(page).locator('button, a').allTextContents()).map(text => text.trim());
        for (const name of expected) {
          expect(names.some(text => typeof name === 'string' ? text === name : name.test(text)), `${row}: ${String(name)} in ${names.join(', ')}`).toBe(true);
        }
        if (focusInToast) await expect(toast(page).locator(':focus')).toHaveCount(1);
        else expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
      });
    }
  });
}

test.describe('Feedback beside other lifts at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the toast sits beside an open drawer, and Escape in the toast closes only the toast', async ({ page }) => {
    await page.goto(kitchen);
    await listed(page).click();
    await expect(toast(page)).toBeVisible();
    await page.getByRole('button', { name: /, open details$/ }).first().click();
    const drawer = page.locator('[data-task-drawer]');
    await expect(drawer).toBeVisible();
    await expect(toast(page)).toBeVisible();
    const [a, b] = [(await toast(page).boundingBox())!, (await drawer.boundingBox())!];
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    await toast(page).getByRole('button', { name: 'Dismiss', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(toast(page)).toHaveCount(0);
    await expect(drawer).toBeVisible();
  });

  test('the insertion dialog suppresses the toast, which returns when the dialog closes', async ({ page }) => {
    await page.goto(kitchen);
    await listed(page).click();
    await expect(toast(page)).toBeVisible();
    await page.getByRole('button', { name: 'Add a section', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(toast(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(toast(page)).toBeVisible();
  });
});

test('the phone navigation drawer hides the toast, which returns when it closes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(kitchen);
  await listed(page).click();
  await expect(toast(page)).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(toast(page)).toHaveCount(0);
  await page.locator('[data-shell-drawer-close]').click();
  await expect(toast(page)).toBeVisible();
});

test('the toasts’ live regions never make the document itself scroll on a long phone page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/projects/project-renovation/pages/todos');
  await expect(page.locator('[data-todo-row]').first()).toBeVisible();
  const { height, viewport } = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: innerHeight }));
  expect(height).toBeLessThanOrEqual(viewport);
});

test('an untouched status toast closes after 8 s', async ({ page }) => {
  await page.clock.install();
  await page.goto(kitchen);
  await listed(page).click();
  await expect(toast(page)).toBeVisible();
  await page.getByRole('heading', { level: 1 }).focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(7000);
  await expect(toast(page)).toBeVisible();
  await page.clock.fastForward(1001);
  await expect(toast(page)).toHaveCount(0);
});
