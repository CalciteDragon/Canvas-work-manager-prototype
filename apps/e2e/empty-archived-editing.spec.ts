import { expect, test, type Locator, type Page } from '@playwright/test';
import { toastDetails, undoFromHeader } from './history-controls';
import { api, seed, setClock } from './seed';

/**
 * Slice 79's journeys end to end (§23, §24, §26, §29, §30, §31, §34): the first project from an
 * empty workspace, an archived project read only with its restore in place, the archive refusal
 * said before the write, a Markdown draft kept across Cancel and navigation, the digest's overdue
 * line, and a Task List's count. Fixtures are made through the host API, never by editing seeds.
 */
const SEED_NOW = '2026-08-24T16:00:00.000Z';
const ROOT = '/projects/project-renovation';
const KITCHEN = '/projects/project-kitchen';
const CABINETS = '/projects/project-cabinets';
const LEGACY = '/projects/project-legacy';
const LEGACY_CHILD = '/projects/project-legacy-child';
const section = (project: string, id: string) => `[data-section-id="section-${project}-${id}"]`;
const KITCHEN_TASKS = section('project-kitchen', 'tasks');
const KITCHEN_BRIEF = section('project-kitchen', 'brief');
const DIGEST = '[data-dashboard-tile][data-widget-type="daily_digest"]';
const CONFIRM = '[data-project-archive-confirm]';

/** The write controls a read-only page must not show (the rig's list, `ux/empty-archived-verification.ts`). */
const WRITE_CONTROLS = [
  '[data-canvas-add]', '[data-empty-canvas-add]', 'app-insertion-point', '[data-insertion-point-button]',
  'app-section-resize-handle', '[data-section-drag-handle]', '[data-section-remove]', '[data-section-config]',
  '[data-section-title-edit]', '[data-shortcut-drag-handle]', '[data-shortcut-remove]',
  '[data-unknown-section-drag-handle]', '[data-unknown-section-remove]', '[data-quick-create]',
  '[data-task-complete]', '[data-task-delete]', '[data-markdown-edit]', '[data-reflection-create]',
  '[data-reflection-edit]', '.progress-section__controls', '[data-todo-toggle]', '[data-todo-complete]',
  '[data-todo-delete]', 'app-task-row.cdk-drag', 'button[aria-label$=", open details"]',
].join(', ');

const archive = (id: string) => api.patch(`/api/projects/${id}`, { status: 'archived' });
/** Home renovation archived as a root with nothing live under it: every workstream archived first. */
const archiveRenovation = async () => {
  for (const id of ['project-cabinets', 'project-kitchen', 'project-garden', 'project-legacy-child', 'project-renovation']) await archive(id);
};

const banner = (page: Page) => page.locator('app-archived-banner');
const heading = (page: Page) => page.locator('h1[data-project-name]');
const header = (page: Page) => page.locator('app-project-header');
const isFocused = (locator: Locator) => locator.evaluate((element) => element === document.activeElement);

/** Presses `key` until `target` has focus, failing after `limit` presses. */
const tabTo = async (page: Page, target: Locator, limit = 60, key: 'Tab' | 'Shift+Tab' = 'Tab') => {
  for (let index = 0; index < limit; index += 1) {
    if (await isFocused(target)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
};

/** At phone width the sidebar is in the Menu drawer: wait for the shell's Menu and open it. */
const openPhoneMenu = async (page: Page) => {
  if (page.viewportSize()!.width > 600) return;
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(menu).toBeVisible();
  await menu.click();
};

const openArchiveConfirm = async (page: Page) => {
  await page.getByRole('button', { name: 'More project actions', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Archive (project|workstream)…$/ }).click();
  await expect(page.locator(CONFIRM)).toBeVisible();
};

/** A read-only page: the banner under the header, no write control, rename and Parent kept in More. */
const expectReadOnly = async (page: Page, sentence: string) => {
  await expect(banner(page).locator('[data-archived-sentence]')).toHaveText(sentence);
  // Sections still reading have no row controls either way: count only once every read has landed.
  await expect(page.locator('main [data-tasks-loading], main [aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('main').locator(WRITE_CONTROLS).filter({ visible: true })).toHaveCount(0);
  const headerBox = (await header(page).boundingBox())!;
  const bannerBox = (await banner(page).locator('[data-archived-sentence]').boundingBox())!;
  expect(bannerBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
  await page.getByRole('button', { name: 'More project actions', exact: true }).click();
  await expect(page.locator('[data-project-edit-details]')).toBeVisible();
  await page.keyboard.press('Escape');
};

test.beforeEach(async () => {
  await setClock(SEED_NOW);
});
test.afterEach(async () => {
  await setClock(null);
});

for (const width of [1440, 375]) {
  test.describe(`${width}: an empty workspace`, () => {
    test.use({ viewport: { width, height: width === 375 ? 812 : 900 }, hasTouch: width === 375 });

    test('first run creates a project from the main column, and archiving it leaves the archived-only sidebar', async ({ page }) => {
      await seed('empty');
      await page.goto('/app');
      const create = page.locator('app-dashboard-page [data-first-run-create]');
      await expect(create).toBeVisible();
      await create.click();
      const name = page.locator('[data-create-project-name]');
      await expect(name).toBeFocused();
      await name.fill('First journey');
      await name.press('Enter');
      await openPhoneMenu(page);
      await page.locator('app-sidebar').getByRole('link', { name: 'First journey', exact: true }).click();
      await expect(heading(page)).toHaveText('First journey');

      await openArchiveConfirm(page);
      await page.locator('[data-project-archive-confirm-yes]').click();
      await expect(banner(page).locator('[data-archived-sentence]')).toHaveText('“First journey” is archived.');
      await page.goto('/app');
      await openPhoneMenu(page);
      const sidebar = page.locator('app-sidebar');
      await expect(sidebar.getByText('No active projects.')).toBeVisible();
      await expect(sidebar).not.toContainText('No projects yet');
      // The shell's read has landed, so a first-run block would be showing by now.
      await expect(page.locator('app-dashboard-page [data-first-run-create]')).toHaveCount(0);
      await expect(sidebar.getByRole('link', { name: 'Archived projects are in Settings.' })).toHaveAttribute('href', '/settings/archived-projects');
    });
  });
}

test.describe('archived pages', () => {
  test.beforeEach(async () => {
    await seed('nested-projects');
  });

  test('Legacy attic and Legacy shelving are read only, and the attic restores from its banner while Undo is refused', async ({ page }) => {
    await page.goto(LEGACY_CHILD);
    await expectReadOnly(page, '“Legacy shelving” is inside “Legacy attic”, which is archived.');
    await page.goto(LEGACY);
    await expectReadOnly(page, '“Legacy attic” is archived.');
    await expect(banner(page).locator('select[data-restore-status]')).toHaveValue('active');

    await banner(page).getByRole('button', { name: 'Restore Legacy attic', exact: true }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(heading(page)).toBeFocused();
    await expect(page.locator('main').locator(WRITE_CONTROLS).filter({ visible: true }).first()).toBeVisible();

    // Undo would archive the attic again under its now-live shelving: the transition is refused.
    const { response, body } = await undoFromHeader(page, 'Reactivated "Legacy attic"');
    expect(response.ok()).toBe(false);
    expect((body as unknown as { details: { reason: string } }).details.reason).toBe('history_conflict');
    // The toast says it short; the reason and the repair open from View details (Slice 79 Q9).
    const refusal = page.locator('[data-toast]:popover-open');
    await expect(refusal.locator('.toast__message')).toHaveText('Couldn’t undo.');
    await expect(refusal).not.toContainText('Legacy shelving');
    await expect(refusal.getByRole('button')).toHaveText(['View details', 'Dismiss']);
    await expect(page.locator('[role=alert]').filter({ hasText: 'Couldn’t undo.' })).toContainText('Legacy shelving');
    const opener = refusal.getByRole('button', { name: 'View details' });
    const details = await toastDetails(page);
    await expect(details.getByRole('heading', { name: 'Couldn’t undo.' })).toBeVisible();
    await expect(details).toContainText('“Reactivated “Legacy attic”” can’t be undone: something it changed has changed since.');
    await expect(details.locator('li')).toContainText('Legacy shelving');
    await expect(details.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    await expect(refusal).toBeVisible();
    await expect(opener).toBeFocused();
    await opener.press('Enter');
    await details.getByRole('button', { name: 'Close' }).click();
    await expect(details).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(banner(page)).toHaveCount(0);
  });

  test('restoring the ancestor from Legacy shelving’s banner offers Undo and the owner', async ({ page }) => {
    await page.goto(LEGACY_CHILD);
    await banner(page).getByRole('button', { name: 'Restore Legacy attic', exact: true }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(heading(page)).toBeFocused();
    const toast = page.locator('[data-toast]:popover-open');
    await expect(toast.getByRole('button', { name: /^Undo/ })).toBeVisible();
    await expect(toast.getByRole('link', { name: 'Open Legacy attic' }).or(toast.getByRole('button', { name: 'Open Legacy attic' }))).toBeVisible();
  });

  test('archived twice: restoring the outer owner moves focus to the next owner’s choice', async ({ page }) => {
    await archive('project-legacy-child');
    await page.goto(LEGACY_CHILD);
    await expectReadOnly(page, '“Legacy shelving” is archived, and so is “Legacy attic”, which holds it.');
    // Keyboard only: Tab reaches the banner's Restore, Enter presses it.
    const restore = banner(page).getByRole('button', { name: 'Restore Legacy attic', exact: true });
    await tabTo(page, restore);
    await page.keyboard.press('Enter');
    await expect(banner(page).locator('[data-archived-sentence]')).toHaveText('“Legacy shelving” is archived.');
    await expect(banner(page).locator('select[data-restore-status]')).toBeFocused();
    await expect(banner(page).locator('select[data-restore-status]')).toHaveValue('active');
    await page.keyboard.press('Tab');
    await expect(banner(page).getByRole('button', { name: 'Restore Legacy shelving', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(banner(page)).toHaveCount(0);
    await expect(heading(page)).toBeFocused();
  });

  test('Home renovation, archived with nothing live, restores from the banner and the header’s Undo puts the banner back', async ({ page }) => {
    await archiveRenovation();
    for (const [suffix, region] of [['', 'main'], ['/pages/todos', 'app-todos-page'], ['/pages/reflections', 'app-reflections-page']] as const) {
      await page.goto(ROOT + suffix);
      await expect(page.locator(region)).toBeVisible();
      await expectReadOnly(page, '“Home renovation” is archived.');
    }
    await page.goto(KITCHEN);
    await expectReadOnly(page, '“Kitchen” is archived, and so is “Home renovation”, which holds it.');

    await page.goto(ROOT);
    await banner(page).getByRole('button', { name: 'Restore Home renovation', exact: true }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(heading(page)).toBeFocused();
    // The archives above were the same person's, so Undo is offered before the restore: wait for
    // the restore's own step, by which time an own restore's toast would have shown.
    await expect(page.locator('[data-history-undo]')).toHaveAttribute('aria-label', 'Undo: Reactivated "Home renovation"', { timeout: 15_000 });
    await expect(page.locator('[data-toast]:popover-open')).toHaveCount(0);
    await undoFromHeader(page, 'Reactivated "Home renovation"');
    await expect(banner(page).locator('[data-archived-sentence]')).toHaveText('“Home renovation” is archived.');
  });

  test('a banner restore failure shows in the banner with Details and Try again', async ({ page }) => {
    await page.route((url) => /^\/api\/projects\/project-legacy$/.test(url.pathname), (route) =>
      route.request().method() === 'GET'
        ? route.fallback()
        : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'E2E: restore failed' }) }));
    await page.goto(LEGACY);
    await banner(page).getByRole('button', { name: 'Restore Legacy attic', exact: true }).click();
    const failure = banner(page).locator('[data-archived-restore-error]');
    await expect(failure).toBeVisible();
    await expect(failure.locator('details')).toContainText('E2E: restore failed');
    await expect(failure.getByRole('button', { name: /Try again/ })).toBeVisible();
    await expect(banner(page).locator('[data-archived-sentence]')).toHaveText('“Legacy attic” is archived.');
  });
});

test.describe('archive refusal and restore', () => {
  test.beforeEach(async () => {
    await seed('nested-projects');
  });

  test('archiving Kitchen names Cabinets as a link and offers no commit; following it lands on Cabinets', async ({ page }) => {
    await page.goto(KITCHEN);
    await openArchiveConfirm(page);
    const confirm = page.locator(CONFIRM);
    await expect(confirm.locator('[data-project-archive-confirm-yes]')).toHaveCount(0);
    await expect(confirm.getByRole('button')).toHaveText(['Close']);
    await expect(confirm.locator('a[data-project-archive-child]')).toHaveText(['Cabinets']);
    await confirm.locator('a[data-project-archive-child]').click();
    await expect(page).toHaveURL(new RegExp(`${CABINETS}$`));
    await expect(heading(page)).toHaveText('Cabinets');
    await expect(confirm).toHaveCount(0);
  });

  test('a late refusal says what to do', async ({ page }) => {
    await page.route((url) => /^\/api\/projects\/project-cabinets$/.test(url.pathname), (route) =>
      route.request().method() === 'GET'
        ? route.fallback()
        : route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'rule_violation', message: 'E2E: Cabinets still has live work' }) }));
    await page.goto(CABINETS);
    await openArchiveConfirm(page);
    await page.locator('[data-project-archive-confirm-yes]').click();
    const error = page.locator('[data-project-write-error]');
    await expect(error).toContainText('“Cabinets” still has live workstreams. Archive them first.');
    await expect(error.locator('details')).toContainText('E2E: Cabinets still has live work');
    await expect(heading(page)).toHaveText('Cabinets');
  });

  test('Archive and Settings restore through the same control', async ({ page }) => {
    const optionsOf = (select: Locator) => select.locator('option').allTextContents();
    await page.goto(`${ROOT}/pages/archive`);
    const archiveRow = page.locator('[data-archived-item][data-archived-id="project-legacy"]');
    const archiveSelect = archiveRow.locator('select[data-restore-status]');
    await expect(archiveSelect).toHaveValue('active');
    const archiveOptions = await optionsOf(archiveSelect);

    await page.goto('/settings/archived-projects');
    const settingsRow = page.locator('[data-archived-project][data-project-id="project-legacy"]');
    const settingsSelect = settingsRow.locator('select[data-restore-status]');
    await expect(settingsSelect).toHaveValue('active');
    expect(await optionsOf(settingsSelect)).toEqual(archiveOptions);
    await settingsSelect.selectOption('on_hold');
    await settingsRow.locator('button[data-restore-action]').click();
    await expect(settingsRow).toHaveCount(0);
    expect((await api.get<{ status: string }>('/api/projects/project-legacy')).status).toBe('on_hold');

    // Archive's own row restores through the same control (the shelving first: it is live again).
    await archive('project-legacy-child');
    await archive('project-legacy');
    await page.goto(`${ROOT}/pages/archive`);
    await expect(archiveSelect).toHaveValue('active');
    await archiveRow.locator('button[data-restore-action]').click();
    await expect(archiveRow).toHaveCount(0);
    expect((await api.get<{ status: string }>('/api/projects/project-legacy')).status).toBe('active');
  });
});

test('the digest’s overdue line reaches the overdue task', async ({ page }) => {
  await seed('overdue-chaos');
  await setClock(SEED_NOW);
  await page.goto('/app');
  const rows = page.locator(`${DIGEST} [data-digest-overdue]`);
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(5);
  const link = rows.first().locator('a').first();
  const title = (await link.textContent())!.trim();
  await link.click();
  await expect(page).toHaveURL(/#section-/);
  const target = page.locator(`[id="${decodeURIComponent(new URL(page.url()).hash.slice(1))}"]`);
  await expect(target).toBeVisible();
  await expect(target).toContainText(title);
});

test.describe('editing', () => {
  test.beforeEach(async () => {
    await seed('nested-projects');
  });

  test('a Markdown draft survives Cancel and navigation, Preview captions it, and Discard draft drops it', async ({ page }) => {
    const draft = '# E2E draft\n\nTyped, then left unsaved.';
    await page.goto(KITCHEN);
    const brief = page.locator(KITCHEN_BRIEF);
    await brief.locator('[data-markdown-edit]').click();
    const source = brief.locator('[data-markdown-source]');
    const saved = await source.inputValue();
    await source.fill(draft);
    await brief.locator('[data-markdown-preview]').click();
    await expect(brief).toContainText('Unsaved preview');
    await brief.locator('[data-markdown-preview]').click();
    await brief.locator('[data-markdown-cancel]').click();
    await brief.locator('[data-markdown-edit]').click();
    await expect(source).toHaveValue(draft);
    await expect(brief).toContainText('Your unsaved draft is back.');

    // In-app navigation away and Back: the draft is still kept.
    await page.locator('app-sidebar').getByRole('link', { name: 'Cabinets', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${CABINETS}$`));
    await page.goBack();
    await brief.locator('[data-markdown-edit]').click();
    await expect(source).toHaveValue(draft);

    // Keyboard reaches Discard draft, which sits above the source.
    await source.focus();
    const discard = brief.getByRole('button', { name: 'Discard draft', exact: true });
    await tabTo(page, discard, 10, 'Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(source).toHaveValue(saved);
    await expect(discard).toHaveCount(0);
    await brief.locator('[data-markdown-cancel]').click();
    await brief.locator('[data-markdown-edit]').click();
    await expect(source).toHaveValue(saved);
    await expect(brief).not.toContainText('Your unsaved draft is back.');
  });

  test('a Task List header counts its rows, and the first row holds still as a drag starts', async ({ page }) => {
    await page.goto(KITCHEN);
    const tasks = page.locator(KITCHEN_TASKS);
    const rows = tasks.locator('[data-task-row]');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    await expect(tasks.locator('[data-section-summary]')).toHaveText(count === 1 ? '1 task' : `${count} tasks`);

    // The open task is dragged (a completed one is not draggable); no row may move as the hint shows.
    const open = rows.filter({ has: page.getByRole('checkbox', { checked: false }) }).first();
    const still = rows.filter({ hasNot: page.getByRole('checkbox', { checked: false }) }).first();
    const tops = () => rows.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    const before = await still.evaluate((element) => element.getBoundingClientRect().top);
    const firstBefore = (await tops())[0]!;
    const box = (await open.locator('[data-task-title]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 4 });
    await expect(page.locator('.cdk-drag-preview')).toBeVisible();
    await expect(tasks.locator('[data-task-drag-hint]')).toBeVisible();
    expect(Math.abs((await still.evaluate((element) => element.getBoundingClientRect().top)) - before)).toBeLessThanOrEqual(1);
    expect(Math.abs((await tops())[0]! - firstBefore)).toBeLessThanOrEqual(1);
    await page.mouse.up();
  });
});
