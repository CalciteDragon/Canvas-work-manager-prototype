import { expect, test } from '@playwright/test';
import { seed, setClock } from './seed';

/**
 * §69's web path: load a seed, create a project, create a task, see it on the dashboard.
 *
 * The clock is pinned to **mid-day UTC** and the due date is a **hard-coded** `YYYY-MM-DD`
 * matching it. The drawer writes `${date}T23:59:59.999Z` and `DashboardService` compares
 * UTC days, so a date derived from `new Date()` on a machine west of UTC would land the
 * task in Overdue instead of Today. Mid-day keeps the two unambiguous.
 */
const PINNED_NOW = '2026-09-15T12:00:00.000Z';
const DUE_DATE = '2026-09-15';

test('create a project, add a task list, add a task, and see it on Today', async ({ page }) => {
  await seed('empty');
  await setClock(PINNED_NOW);

  await page.goto('/app');

  // Wait for the persona, not merely for the page. The sidebar renders "No projects yet"
  // and offers **New project** before `/api/me` has answered, and creating a project needs
  // the workspace that answer carries — so clicking too early gets the store's honest
  // "there is nowhere to put it" instead of a project.
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');

  // The empty seed has no projects at all — the state §81's "create project" starts from.
  await expect(page.locator('[data-projects-empty]')).toHaveText('No projects yet');

  await page.locator('[data-new-project]').click();
  await page.locator('[data-create-project-name]').fill('Prototype review');
  await page.locator('[data-create-project-submit]').click();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.locator('[data-project-name]')).toHaveText('Prototype review');
  await expect(page.locator('[data-project-status]')).toHaveText('planning');
  await expect(page.locator('[data-project]')).toHaveText('Prototype review');

  // Quick add renders only under §32's Edit Layout Mode.
  await page.locator('[data-layout-edit-toggle]').click();
  await page.locator('[data-project-quick-add]').click();
  await page.locator('[data-add-section][data-section-type="task-list"]').click();
  await expect(page.locator('[data-section-frame][data-section-type="task-list"]')).toBeVisible();

  await page.locator('[data-quick-task-title]').fill('Write the walkthrough');
  await page.locator('[data-quick-create] button[type="submit"]').click();
  await expect(page.locator('[data-task-row]')).toHaveCount(1);

  await page.locator('[data-task-details]').first().click();
  await expect(page.locator('[data-task-drawer]')).toBeVisible();
  await page.locator('[data-task-due-date]').fill(DUE_DATE);
  await page.locator('[data-task-due-date]').blur();

  await page.goto('/app');
  const today = page.locator('app-dashboard-widget-frame', {
    has: page.locator('[data-widget-title]:text-is("Today")'),
  });
  await expect(today.locator('[data-widget-task]')).toContainText('Write the walkthrough');
});
