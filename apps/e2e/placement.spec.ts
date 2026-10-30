/**
 * Slice 75: feedback pending and placement. Browser-only facts — timing, geometry, focus, native
 * validation — that unit specs cannot prove. Runs on the regular e2e servers, or on the isolated
 * slice rig through `ux/slice75-behavior.config.ts`.
 */
import type { Page, Route } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { ProjectSection, Task, TaskWriteResult } from '@cwm/contracts';
import { addSection, api, seed } from './seed';
import { configureContext } from './ux/isolation';

const KITCHEN = 'project-kitchen';
const failure = (message: string) => ({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message }) });
const list = (page: Page, section: ProjectSection) => page.locator(`[data-section-id="${section.id}"]`);
const addTask = async (section: ProjectSection, title: string): Promise<Task> =>
  (await api.post<TaskWriteResult>('/api/tasks', { projectId: KITCHEN, sectionId: section.id, title })).task;
/** A gate a route handler waits on, so a write is held in flight for as long as the test needs. */
const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { opened, open };
};
const inViewport = (page: Page, selector: string) => page.locator(selector).evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return rect.top >= 0 && rect.bottom <= window.innerHeight;
});
const scrollerTop = (page: Page, section: ProjectSection) =>
  list(page, section).evaluate((element) => element.getBoundingClientRect().top);

test.beforeEach(async ({ context }) => {
  await seed('nested-projects');
  if (process.env['UX_STATIC_ORIGIN']) await configureContext(context);
});

for (const touch of [false, true]) {
  test.describe(touch ? 'at 375 touch' : 'at 1440', () => {
    test.use({ viewport: { width: touch ? 375 : 1440, height: touch ? 812 : 900 }, hasTouch: touch, isMobile: touch });

    test('quick-add paints a pending row within 100 ms and refuses a second submit (B3, B4)', async ({ page }) => {
      const shopping = await addSection(KITCHEN, { type: 'task-list', title: 'Shopping' });
      const held = gate();
      let posts = 0;
      await page.route('**/api/tasks', async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        posts += 1;
        await held.opened;
        await route.fallback();
      });
      await page.goto(`/projects/${KITCHEN}`);
      const section = list(page, shopping);
      await expect(section.locator('[data-tasks-empty]')).toBeVisible();
      const field = section.locator('[data-quick-task-title]');
      await field.fill('Order tiles');
      const elapsed = await field.evaluate((input) => new Promise<number>((resolve) => {
        const root = input.closest('[data-section-id]')!;
        const started = performance.now();
        const seen = new MutationObserver(() => {
          if (root.querySelector('[data-task-pending]') === null) return;
          seen.disconnect();
          resolve(performance.now() - started);
        });
        seen.observe(root, { childList: true, subtree: true });
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        (input as HTMLInputElement).form!.requestSubmit();
      }));
      expect(elapsed).toBeLessThan(100);

      const pending = section.locator('[data-task-pending]');
      await expect(pending).toContainText('Order tiles');
      await expect(pending).toContainText('Adding…');
      await expect(pending).toHaveAttribute('aria-busy', 'true');
      // It replaces the empty state, and it is not a draggable row.
      await expect(section.locator('[data-tasks-empty]')).toHaveCount(0);
      // The section's own placement wrapper is a drag item; the pending row's host is not.
      expect(await pending.evaluate((element) => element.closest('app-pending-task-row')!.classList.contains('cdk-drag'))).toBe(false);
      await expect(field).toHaveValue('');
      await expect(field).toBeFocused();
      const submit = section.locator('[data-quick-create] button[type="submit"]');
      await expect(submit).toHaveText('Adding…');
      await expect(submit).toHaveAttribute('aria-disabled', 'true');

      await field.fill('Second');
      await field.press('Enter');
      await expect(field).toHaveValue('Second');
      expect(posts).toBe(1);

      held.open();
      await expect(pending).toHaveCount(0);
      await expect(section.locator('[data-task-row]')).toHaveCount(1);
      await expect(section.locator('[data-task-title]')).toHaveText('Order tiles');
      await expect(section.locator('[data-quick-create-status]')).toHaveText('Added “Order tiles”.');
    });

    test('a failed add returns its title and says why beside the field; an unconfirmable one does not (B5)', async ({ page }) => {
      const shopping = await addSection(KITCHEN, { type: 'task-list', title: 'Shopping' });
      let failRead = false;
      let posted = false;
      await page.route('**/api/tasks**', async (route: Route) => {
        const method = route.request().method();
        if (method === 'POST' && new URL(route.request().url()).pathname === '/api/tasks') {
          posted = true;
          return route.fulfill(failure('Injected create failure'));
        }
        if (method === 'GET' && posted && failRead) return route.fulfill(failure('Injected read failure'));
        return route.fallback();
      });
      await page.goto(`/projects/${KITCHEN}`);
      const section = list(page, shopping);
      const field = section.locator('[data-quick-task-title]');
      await field.fill('Order tiles');
      await field.press('Enter');
      const createFailure = section.locator('[data-quick-create-error]');
      const message = createFailure.locator('[data-failure-sentence]');
      await expect(message).toHaveText('Couldn’t add “Order tiles”. Try again.');
      // Slice 78: the reason is behind Details, outside the field's description.
      await createFailure.locator('summary').click();
      await expect(createFailure.locator('details')).toContainText('Injected create failure');
      await expect(field).toHaveValue('Order tiles');
      await expect(field).toHaveAttribute('aria-describedby', (await message.getAttribute('id'))!);
      await expect(section.locator('[data-task-pending]')).toHaveCount(0);

      failRead = true;
      posted = false;
      await field.fill('Order grout');
      await field.press('Enter');
      await expect(message).toHaveText('Couldn’t confirm “Order grout” was added. Check the list before adding it again.');
      await expect(field).toHaveValue('');
    });

    test('an empty add is refused beside the field and sends nothing (B7)', async ({ page }) => {
      const shopping = await addSection(KITCHEN, { type: 'task-list', title: 'Shopping' });
      let posts = 0;
      await page.route('**/api/tasks', (route) => {
        if (route.request().method() === 'POST') posts += 1;
        return route.fallback();
      });
      await page.goto(`/projects/${KITCHEN}`);
      const section = list(page, shopping);
      const field = section.locator('[data-quick-task-title]');
      await field.focus();
      await field.press('Enter');
      await expect(section.locator('[data-quick-create-error]')).toHaveText('Enter a task title.');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toBeFocused();
      expect(posts).toBe(0);
      await field.pressSequentially('O');
      await expect(section.locator('[data-quick-create-error]')).toHaveCount(0);
    });

    test('a long list brings the new row into view with the field still on screen and focused (B6)', async ({ page }) => {
      const shopping = await addSection(KITCHEN, { type: 'task-list', title: 'Shopping' });
      for (let index = 1; index <= 30; index += 1) await addTask(shopping, `Item ${index}`);
      await page.goto(`/projects/${KITCHEN}`);
      const section = list(page, shopping);
      const field = section.locator('[data-quick-task-title]');
      await field.scrollIntoViewIfNeeded();
      await field.fill('Item 31');
      await field.press('Enter');
      const created = section.locator('[data-task-row]', { hasText: 'Item 31' });
      await expect(created).toHaveCount(1);
      await expect.poll(() => created.evaluate((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      })).toBe(true);
      await expect(field).toBeFocused();
      expect(await inViewport(page, `[data-section-id="${shopping.id}"] [data-quick-task-title]`)).toBe(true);
    });

    test('row writes fail on their own rows, never as a section banner (B8)', async ({ page }) => {
      const shopping = await addSection(KITCHEN, { type: 'task-list', title: 'Shopping' });
      const first = await addTask(shopping, 'Tiles');
      const second = await addTask(shopping, 'Grout');
      await page.route('**/api/tasks/*/complete', (route) => route.fulfill(failure('Injected completion failure')));
      await page.goto(`/projects/${KITCHEN}`);
      const section = list(page, shopping);
      for (const task of [first, second]) {
        const row = section.locator(`[data-task-row][data-task-id="${task.id}"]`);
        await row.locator('[data-task-complete]').click();
        await expect(row.locator('[data-task-error] [data-failure-sentence]')).toHaveText(`Couldn’t complete “${task.title}”. Try again.`);
        await row.locator('[data-task-error] summary').click();
        await expect(row.locator('[data-task-error] details')).toContainText('Injected completion failure');
        await expect(row.locator('[data-task-complete]')).not.toBeChecked();
      }
      await expect(section.locator('[data-task-error]')).toHaveCount(2);
      await expect(section.locator('[data-tasks-error]')).toHaveCount(0);
    });

    test('the drawer edits at once, says Saving… then Saved, and reverts on failure (C10–C12)', async ({ page }) => {
      const shopping = await addSection(KITCHEN, { type: 'task-list', title: 'Shopping' });
      const task = await addTask(shopping, 'Tiles');
      const held = gate();
      let fail = false;
      await page.route(`**/api/tasks/${task.id}`, async (route) => {
        if (route.request().method() !== 'PATCH') return route.fallback();
        if (fail) return route.fulfill(failure('Injected save failure'));
        await held.opened;
        return route.fallback();
      });
      await page.goto(`/projects/${KITCHEN}`);
      const row = list(page, shopping).locator(`[data-task-row][data-task-id="${task.id}"]`);
      await row.locator('button[data-task-title]').click();
      const drawer = page.locator('[data-task-drawer]');
      await expect(drawer.locator('[data-task-autosave]')).toHaveText('Changes save automatically.');

      const priority = drawer.locator('[data-task-priority]');
      await priority.selectOption('high');
      await expect(drawer.locator('[data-field-status="priority"]')).toHaveText('Saving…');
      // The status sits beside the label but never joins the field's accessible name.
      await expect(drawer.getByRole('combobox', { name: 'Priority', exact: true })).toBeVisible();
      await expect(row).toHaveClass(/task-row--high-priority/);
      held.open();
      await expect(drawer.locator('[data-field-status="priority"]')).toHaveText('Saved');

      fail = true;
      await priority.selectOption('low');
      await expect(drawer.locator('[data-field-status="priority"]')).toHaveText('Not saved. Try again.');
      await drawer.locator('[data-field-details="priority"] summary').click();
      await expect(drawer.locator('[data-field-details="priority"]')).toContainText('Injected save failure');
      await expect(priority).toHaveValue('high');
      await expect(row).toHaveClass(/task-row--high-priority/);
    });

    test('a created section is scrolled to and its heading focused (D13)', async ({ page }) => {
      await page.goto(`/projects/${KITCHEN}`);
      const insert = page.getByRole('button', { name: 'Add a section', exact: true });
      if (touch) await insert.tap(); else await insert.click();
      await page.getByRole('combobox', { name: 'Section type' }).selectOption('task-list');
      await page.getByRole('dialog').getByRole('textbox').fill('Shopping');
      await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const heading = page.locator('[data-section-item]').last().locator('[data-section-title]');
      await expect(heading).toBeFocused();
      await expect(heading).toContainText('Shopping');
      expect(await heading.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight;
      })).toBe(true);
    });

    test('completing tasks below Recent Activity leaves their list where it was (E16, E17)', async ({ page }) => {
      const shopping = await addSection(KITCHEN, { type: 'task-list', title: 'Shopping' });
      const tasks = [await addTask(shopping, 'Tiles'), await addTask(shopping, 'Grout'), await addTask(shopping, 'Sealant')];
      await page.goto(`/projects/${KITCHEN}`);
      const section = list(page, shopping);
      await section.locator('[data-task-row]').last().scrollIntoViewIfNeeded();
      expect(await page.locator('main.workspace').evaluate((main) => main.scrollTop)).toBeGreaterThan(0);
      const activity = page.locator('[data-activity-entry]');
      for (const task of tasks.slice(0, 2)) {
        const rows = await activity.count();
        const before = await scrollerTop(page, shopping);
        await section.locator(`[data-task-row][data-task-id="${task.id}"] [data-task-complete]`).click();
        await expect(activity).toHaveCount(rows + 1);
        await expect.poll(async () => Math.abs((await scrollerTop(page, shopping)) - before)).toBeLessThanOrEqual(1);
      }
    });
  });
}

test('keyboard: a created shortcut is revealed and its heading focused (D14)', async ({ page }) => {
  await page.goto('/projects/project-renovation/pages/home');
  const insert = page.getByRole('button', { name: /^Insert before / }).first();
  await insert.focus();
  await insert.press('Enter');
  const shortcutMode = page.getByRole('button', { name: 'Add shortcut', exact: true });
  await shortcutMode.focus();
  await shortcutMode.press('Enter');
  // The first source not already placed here; placed ones are disabled "Added".
  const add = page.locator('[data-shortcut-add]:not([disabled])').first();
  await add.focus();
  await add.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Home already has shortcuts, so the new one is found by focus, not by order.
  const heading = page.locator('[data-shortcut-title]:focus');
  await expect(heading).toHaveCount(1);
  expect(await heading.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  })).toBe(true);
});

test('blank names are refused beside the field, with no browser bubble first (F20)', async ({ page }) => {
  await page.goto(`/projects/${KITCHEN}`);
  await page.locator('[data-new-project]').click();
  const projectName = page.locator('[data-create-project-name]');
  await projectName.press('Enter');
  await expect(page.locator('[data-create-project-name-error]')).toHaveText('Enter a name.');
  await expect(projectName).toHaveAttribute('aria-invalid', 'true');
  await expect(projectName).toBeFocused();

  await page.locator('[data-work-create]').click();
  const workName = page.locator('[data-create-work-name]');
  await expect(workName).toBeFocused();
  await page.locator('[data-create-work-submit]').click();
  // `novalidate`: the browser's bubble no longer blocks the submit, so the dialog's own message shows.
  expect(await workName.evaluate((input) => input.closest('form')!.noValidate)).toBe(true);
  await expect(page.locator('[data-create-work-name-error]')).toHaveText('Enter a name.');
  await expect(workName).toBeFocused();
});

test('a refused agent permission change is said in that agent’s card (F21)', async ({ page }) => {
  await seed('agent-heavy');
  await page.route('**/api/agent-connections/*', (route) => route.request().method() === 'PATCH'
    ? route.fulfill(failure('Injected permission failure'))
    : route.fallback());
  await page.goto('/settings/agents');
  const cursor = page.locator('[data-connection-id="agent-cursor"]');
  const box = cursor.locator('[data-permission="tasks.write"]');
  await box.click();
  const permissionFailure = cursor.locator('[data-agent-permission-error]');
  const message = permissionFailure.locator('[data-failure-sentence]');
  await expect(message).toHaveText('Couldn’t change Modify tasks for Cursor. Try again.');
  await permissionFailure.locator('summary').click();
  await expect(permissionFailure.locator('details')).toContainText('Injected permission failure');
  await expect(box).toHaveAttribute('aria-describedby', (await message.getAttribute('id'))!);
  await expect(box).not.toBeChecked();
  await expect(page.locator('[data-agents-error]')).toHaveCount(0);
});

test.describe('live regions at 375 touch', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('hidden live regions never stretch the phone document, with a dialog open', async ({ page }) => {
    await page.goto(`/projects/${KITCHEN}`);
    await page.locator('[data-section-canvas]').waitFor();
    const expand = page.getByRole('button', { name: 'Show project navigation', exact: true });
    if (await expand.isVisible()) await expand.click();
    await page.getByRole('button', { name: 'Add workstream', exact: true }).click();
    await expect(page.locator('[data-create-work-name]')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
  });
});
