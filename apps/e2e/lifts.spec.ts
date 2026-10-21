import { expect, test, type Page } from '@playwright/test';
import { undoFromHeader } from './history-controls';
import { seed, setClock } from './seed';

const ROOT = 'project-renovation';
const onlyOneLift = async (page: Page) => {
  // A toast coexists with one interactive lift; the other lift's exclusivity is unchanged.
  await expect.poll(() => page.locator('.lift:not(.lift--toast):popover-open, dialog.lift[open]').count()).toBeLessThanOrEqual(1);
};
const more = (page: Page) => page.locator('[data-project-more]');
const editDetails = async (page: Page) => {
  await more(page).click();
  await page.locator('[data-project-edit-details]').click();
  await expect(page.locator('[data-project-rename-input]')).toBeFocused();
  await onlyOneLift(page);
};

for (const theme of ['dark', 'light'] as const) {
  for (const width of [1440, 375]) {
    test.describe(`${theme} ${width}: native lifts`, () => {
      test.use({ viewport: { width, height: 900 }, hasTouch: width === 375, colorScheme: theme });
      test.beforeEach(async ({ page }) => {
        await seed('nested-projects');
        await setClock('2026-10-16T12:00:00.000Z');
        await page.goto(`/projects/${ROOT}`);
        await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-theme-toggle]').click();
      });
      test.afterEach(async () => { await setClock(null); });

      test('More and page settings open beside their openers, inside the viewport', async ({ page }) => {
        const pairs = [
          { opener: more(page), lift: page.locator('[data-project-more-menu]') },
          { opener: page.locator('[data-project-settings-toggle]'), lift: page.locator('[data-project-page-manager]') },
        ];
        for (const { opener, lift } of pairs) {
          // At 375 the gear is in the collapsed project column.
          if (!(await opener.isVisible())) await page.locator('[data-project-nav-toggle]').click();
          await opener.click();
          await expect(lift).toBeVisible();
          await expect.poll(() => lift.evaluate((node) => getComputedStyle(node).transform)).toBe('none');
          const o = (await opener.boundingBox())!;
          const l = (await lift.boundingBox())!;
          const viewport = page.viewportSize()!;
          const boxes = JSON.stringify({ opener: o, lift: l });
          expect(l.x, boxes).toBeGreaterThanOrEqual(0);
          expect(l.x + l.width, boxes).toBeLessThanOrEqual(viewport.width + 1);
          expect(l.y + l.height, boxes).toBeLessThanOrEqual(viewport.height + 1);
          // Below (or, flipped, above) the opener, and sharing a column edge with it.
          const below = l.y >= o.y + o.height - 1 && l.y - (o.y + o.height) <= 24;
          const above = l.y + l.height <= o.y + 1 && o.y - (l.y + l.height) <= 24;
          expect(below || above, boxes).toBe(true);
          expect(l.x <= o.x + o.width && l.x + l.width >= o.x, boxes).toBe(true);
          await page.keyboard.press('Escape');
          await expect(lift).toBeHidden();
        }
      });

      test('browser Back from an open Add section releases the canvas lift', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const openProject = async () => {
          if (width === 375) await page.locator('[data-shell-menu]').click();
          await page.locator(`a[href="/projects/${ROOT}"]`).first().click();
          await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
        };
        await page.goto('/app');
        await openProject();
        await page.getByRole('button', { name: 'Add a section', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.goBack();
        await expect(page.locator('[data-project-name]')).toHaveCount(0);
        await openProject();
        await more(page).click();
        await expect(page.locator('[data-project-edit-details]')).toBeFocused();
        await onlyOneLift(page);
        expect(errors).toEqual([]);
      });

      test('More keyboard geometry, one details PATCH and one Undo', async ({ page }) => {
        const header = page.locator('.project-header');
        const before = await header.boundingBox();
        await more(page).press('Enter');
        const menu = page.getByRole('menu', { name: 'Project actions' });
        await expect(page.locator('[data-project-edit-details]')).toBeFocused();
        await expect(menu.getByRole('menuitemradio')).toHaveCount(4);
        await onlyOneLift(page);
        const after = await header.boundingBox();
        expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1);
        await page.keyboard.press('End');
        await expect(page.locator('[data-project-archive]')).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('[data-project-edit-details]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(more(page)).toBeFocused();
        await more(page).press('Enter');
        await expect(page.locator('[data-project-edit-details]')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(menu).toBeHidden();

        let patches = 0;
        page.on('request', (request) => { if (request.method() === 'PATCH' && request.url().endsWith(`/api/projects/${ROOT}`)) patches += 1; });
        await more(page).click();
        await page.locator('[data-status="active"]').click();
        await expect(more(page)).toBeFocused();
        expect(patches).toBe(0);
        await editDetails(page);
        await page.locator('[data-project-rename-input]').fill('Kitchen refit');
        await page.locator('[data-project-description-input]').fill('Finishes first');
        await page.locator('[data-project-target-date-input]').fill('2026-11-20');
        await page.locator('[data-project-details-save]').click();
        await expect(page.locator('[data-project-details-dialog]')).toHaveCount(0);
        await expect(more(page)).toBeFocused();
        await expect(page.locator('[data-project-name]')).toHaveText('Kitchen refit');
        expect(patches).toBe(1);
        await undoFromHeader(page, 'Edited "Kitchen refit"');
        await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
        await onlyOneLift(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await more(page).click();
        await page.locator('[data-status="on_hold"]').click();
        await expect(page.locator('[data-project-status]')).toHaveText('on hold');
        await expect(more(page)).toBeFocused();
      });

      test('dirty double Escape, backdrop and failed Save keep the draft until Discard', async ({ page }) => {
        await editDetails(page);
        await page.locator('[data-project-rename-input]').fill('Uncommitted draft');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-project-discard-confirm]')).toBeVisible();
        await expect(page.locator('[data-project-rename-input]')).toHaveValue('Uncommitted draft');
        await page.locator('[data-project-keep-editing]').click();
        if (width === 375) await page.touchscreen.tap(1, 1);
        else await page.mouse.click(1, 1);
        await expect(page.locator('[data-project-discard-confirm]')).toBeVisible();
        await page.locator('[data-project-keep-editing]').click();
        await page.route(`**/api/projects/${ROOT}`, (route) => route.request().method() === 'PATCH'
          ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'conflict', message: 'Details refused for this journey' }) })
          : route.fallback());
        await page.locator('[data-project-details-save]').click();
        await expect(page.locator('[data-project-details-dialog] [role="alert"]')).toContainText('Details refused');
        await expect(page.locator('[data-project-write-error]')).toHaveCount(0);
        await expect(page.locator('[data-project-rename-input]')).toHaveValue('Uncommitted draft');
        await page.locator('[data-project-details-cancel]').click();
        await page.locator('[data-project-discard]').click();
        await expect(page.locator('[data-project-details-dialog]')).toHaveCount(0);
        await expect(page.locator('[data-project-write-error]')).toHaveCount(0);
        await expect(more(page)).toBeFocused();
        await onlyOneLift(page);
      });

      test('refused archive returns to More, page toggles retain focus and Archive gets a landing', async ({ page }) => {
        await more(page).click();
        await page.locator('[data-project-archive]').click();
        await expect(page.locator('[data-project-archive-cancel]')).toBeFocused();
        await onlyOneLift(page);
        await page.locator('[data-project-archive-confirm-yes]').click();
        await expect(page.locator('[data-project-archive-confirm]')).toHaveCount(0);
        await expect(page.locator('[data-project-write-error]')).toBeVisible();
        await expect(more(page)).toBeFocused();

        if (width === 375) await page.locator('[data-project-nav-toggle]').click();
        const gear = page.locator('[data-project-settings-toggle]');
        await gear.press('Enter');
        const panel = page.locator('[data-project-page-manager]');
        const toggle = panel.locator('input:not([disabled])').first();
        await expect(toggle).toBeFocused();
        await onlyOneLift(page);
        await toggle.press('Space');
        await expect(toggle).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
        await expect(gear).toBeFocused();
        await more(page).click();
        await page.locator('[data-project-open-archive]').click();
        await expect(page.locator('#archive-page-title')).toBeFocused();
        await onlyOneLift(page);
      });

      test('fresh loads keep focus and in-page navigation lands on the new heading', async ({ page }) => {
        await page.goto('/settings');
        await expect(page.locator('main h1')).toHaveText('Settings');
        await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
        await page.locator('[data-settings-agents]').click();
        await expect(page.locator('main h1')).toBeFocused();

        await page.goto(`/projects/${ROOT}`);
        await expect(page.locator('[data-project-name]')).toHaveText('Home renovation');
        const brief = page.locator('[data-section-item][data-section-id="section-project-renovation-brief"]');
        await brief.locator('[data-section-remove]').click();
        await page.locator('[data-toast]:popover-open [data-open-archive]').click();
        await expect(page.locator('#archive-page-title')).toBeFocused();

        await page.goto(`/projects/${ROOT}`);
        if (width === 375) await page.locator('[data-project-nav-toggle]').click();
        await page.locator('[data-project-page-tab][data-page-kind="todos"]').click();
        if (width === 375) await expect(page.locator('[data-project-nav-toggle]')).toBeFocused();
        else await expect(page.locator('[data-route-page-focus]')).toBeFocused();

        await page.goto('/app');
        await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
        if (width === 375) await page.locator('[data-shell-menu]').click();
        await page.locator('[data-new-project]').click();
        await page.locator('[data-create-project-name]').fill('Focus landing');
        await page.locator('[data-create-project-submit]').click();
        await expect(page.locator('[data-project-name]')).toHaveText('Focus landing');
        if (width === 375) await expect(page.locator('main')).toBeFocused();
        else await expect(page.locator('[data-project-name]')).toBeFocused();
      });
    });
  }
}
