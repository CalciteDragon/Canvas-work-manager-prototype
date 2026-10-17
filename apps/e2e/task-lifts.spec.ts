import { expect, test, type Page } from '@playwright/test';
import { addSection, api, createRoot, seed } from './seed';

const themes = ['dark', 'light'] as const;
const onlyOneLift = async (page: Page) => {
  expect(await page.locator('.lift:popover-open, dialog.lift[open]').count()).toBeLessThanOrEqual(1);
};

for (const theme of themes) {
  for (const phone of [false, true]) {
    test.describe(`task lifts ${theme} ${phone ? '375 touch' : '1440'}`, () => {
      test.use({
        viewport: { width: phone ? 375 : 1440, height: phone ? 812 : 960 },
        hasTouch: phone,
        isMobile: phone,
        colorScheme: theme,
      });

      test('opens a below-fold task in the top layer, follows keyboard focus and survives live removal', async ({ page }) => {
        await seed('overdue-chaos');
        const root = await createRoot('Task lift keyboard path');
        const section = await addSection(root.id, { type: 'task-list' });
        for (let index = 0; index < 20; index += 1) {
          await api.post('/api/tasks', { projectId: root.id, sectionId: section.id, title: `Long list task ${index}` });
        }
        await page.goto(`/projects/${root.id}`);
        await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const quick = page.locator('[data-quick-task-title]');
        for (const title of ['Quick one', 'Quick two', 'Quick three']) {
          await quick.fill(title);
          await quick.press('Enter');
          await expect(quick).toHaveValue('');
          await expect(quick).toBeFocused();
          await expect(page.locator('[data-task-drawer]')).toHaveCount(0);
        }

        const opener = page.locator('button[data-task-title]').last();
        await opener.scrollIntoViewIfNeeded();
        await opener.press('Enter');
        const drawer = page.locator('[data-task-drawer]');
        const heading = drawer.locator('h2');
        await expect(drawer).toBeVisible();
        await expect(heading).toBeFocused();
        await expect(drawer).toHaveAttribute('aria-modal', String(phone));
        await expect(drawer).toHaveCSS('transform', 'none');
        const box = (await drawer.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(phone ? 813 : 961);
        if (phone) {
          expect(box.x).toBe(0);
          expect(box.width).toBe(375);
        } else {
          await expect(drawer).toHaveAttribute('popover', 'manual');
          for (const control of await page.locator('[data-task-row] button, .project-header__actions').all()) {
            const controlBox = (await control.boundingBox())!;
            expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(box.x + 1);
          }
        }
        await onlyOneLift(page);
        await page.keyboard.press('Tab');
        const titleField = drawer.locator('[data-task-drawer-title]');
        await expect(titleField).toBeFocused();
        if (phone) {
          await opener.evaluate((element) => (element as HTMLElement).focus());
          await expect(titleField).toBeFocused();
        }
        const original = await titleField.inputValue();
        await titleField.fill('Discard this draft');
        await titleField.press('Escape');
        await expect(titleField).toHaveValue(original);
        await expect(drawer).toBeVisible();
        await titleField.press('Escape');
        await expect(drawer).toHaveCount(0);
        await expect(opener).toBeFocused();

        await opener.press('Enter');
        await expect(heading).toBeFocused();
        await titleField.focus();
        const selectedId = await opener.locator('..').locator('..').getAttribute('data-task-id');
        expect(selectedId).not.toBeNull();
        await api.post(`/api/tasks/${selectedId}/archive`, {});
        await expect(drawer).toHaveCount(0);
        await expect(quick).toBeFocused();
        await onlyOneLift(page);
      });

      if (!phone) {
        test('other lifts clear task selection, leave their own focus and permit the same row to reopen', async ({ page }) => {
          await seed('busy-week');
          await page.goto('/projects/project-launch');
          await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          const opener = page.locator('button[data-task-title]').first();
          const drawer = page.locator('[data-task-drawer]');
          const more = page.locator('[data-project-more]');
          await opener.click();
          await expect(drawer.locator('h2')).toBeFocused();
          await more.click();
          await expect(drawer).toHaveCount(0);
          await expect(page.locator('[data-project-edit-details]')).toBeFocused();
          await onlyOneLift(page);
          await page.keyboard.press('Escape');
          await expect(more).toBeFocused();
          await opener.click();
          await expect(drawer.locator('h2')).toBeFocused();
          await page.locator('[data-project-settings-toggle]').click();
          await expect(drawer).toHaveCount(0);
          await expect(page.locator('[data-project-page-manager] input:not(:disabled)').first()).toBeFocused();
          await onlyOneLift(page);
          await page.keyboard.press('Escape');
          await opener.click();
          await expect(drawer).toBeVisible();
          await page.locator('app-insertion-point[data-insertion-point="end"] button').click();
          await expect(drawer).toHaveCount(0);
          await expect(page.locator('[data-section-create-dialog]')).toBeVisible();
          await page.locator('[data-create-section-cancel]').click();
          await opener.click();
          await expect(drawer).toBeVisible();
          await page.setViewportSize({ width: 375, height: 812 });
          await expect(drawer).toHaveCount(0);
          await expect(opener).toBeFocused();
          await page.setViewportSize({ width: 1440, height: 960 });
          await opener.click();
          await expect(drawer).toHaveAttribute('aria-modal', 'false');
          await expect(drawer.locator('h2')).toBeFocused();
          await onlyOneLift(page);
        });
      }
    });
  }
}
