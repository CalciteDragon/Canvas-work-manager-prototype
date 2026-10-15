import { expect, test } from '@playwright/test';
import { seed } from './seed';

test.beforeEach(async () => { await seed('personal-workspace'); });

test('follows the device live, persists a toggle, and returns to Match device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/app');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('[data-theme-toggle]').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/settings');
  await page.locator('[data-settings-match-device]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('themes direct Lab entry and retains explicit choice through persona switching', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/prototype/design');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/prototype/state');
  await page.locator('[data-theme-option="dark"]').click();
  await page.locator('[data-panel-persona]').filter({ hasText: 'Alex' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('[data-panel-match-device]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('keeps theme controls usable when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Object.defineProperty(Storage.prototype, method, { value: () => { throw new Error('Blocked storage'); } });
    }
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('[data-settings-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('[data-settings-match-device]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
