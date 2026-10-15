/**
 * Slice 72's primitives in a real browser: what jsdom cannot show. New project focuses a label
 * that has a visible box (W2-001, W1-003), the restyled native checkbox keeps its keyboard
 * behaviour, and icon conversions keep their accessible names. The last two are guards: they pass
 * before adoption and protect it.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seed } from './seed';

const PHONE = { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } as const;

const tabTo = async (page: Page, target: Locator) => {
  for (let index = 0; index < 200; index += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  throw new Error('Tab never reached the target');
};

test('at 375 on touch, New project focuses a visibly labelled name field', async ({ browser }) => {
  await seed('personal-workspace');
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await page.goto('/app');
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');

  await page.locator('[data-shell-menu]').tap();
  await page.locator('[data-new-project]').tap();

  await expect(page.locator('[data-create-project-name]')).toBeFocused();
  const label = page.locator('label[for="new-project-name"]');
  await expect(label).toHaveText('Project name');
  expect((await label.boundingBox())?.height ?? 0).toBeGreaterThan(1);
  await context.close();
});

test('Tab reaches a task checkbox and Space completes the task', async ({ page }) => {
  await seed('busy-week');
  await page.goto('/projects/project-launch');
  const checkbox = page.getByRole('checkbox', { name: /^Complete / }).first();
  const title = (await checkbox.getAttribute('aria-label'))!.replace(/^Complete /, '');

  await tabTo(page, checkbox);
  await page.keyboard.press('Space');

  const reopened = page.getByRole('checkbox', { name: `Reopen task ${title}` });
  await expect(reopened).toBeChecked();
});

test('icon conversions keep the drawer Close names', async ({ browser }) => {
  await seed('busy-week');
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await page.goto('/projects/project-launch');
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');

  await page.locator('[data-shell-menu]').tap();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).tap();

  await page.getByRole('button', { name: /, open details$/ }).first().tap();
  await expect(page.getByRole('button', { name: 'Close task details' })).toBeVisible();
  await context.close();
});
