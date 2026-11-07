import { expect, test, type Locator, type Page } from '@playwright/test';
import { redoFromHeader, undoFromHeader } from './history-controls';
import { api, seed } from './seed';

/**
 * Slice 80's journeys on `nested-projects` (§23, §26, §31): a project archived with what is beneath
 * it, the same group back from every entry point, and the states a stale list or a changed group
 * leaves. Journeys 3–6 are one chained test because each starts where the last ended; every other
 * journey reseeds. Run as the plan's Acceptance item 4 names: all with a mouse, then the ones it
 * lists again by touch and by keyboard alone.
 */
const ROOT = 'project-renovation';
const KITCHEN = 'project-kitchen';
const CABINETS = 'project-cabinets';
const GARDEN = 'project-garden';
const LEGACY = 'project-legacy';
const SHELVING = 'project-legacy-child';
const route = (id: string) => `/projects/${id}`;

type Mode = 'mouse' | 'touch' | 'keyboard';
const press = async (locator: Locator, mode: Mode) => {
  if (mode === 'touch') await locator.tap();
  else if (mode === 'keyboard') { await locator.focus(); await locator.press('Enter'); }
  else await locator.click();
};
type Stored = { status: string; completedAt?: string; archivedWithProject?: { projectId: string; status: string; completedAt?: string } };
const stored = (id: string) => api.get<Stored>(`/api/projects/${id}`);
const more = (page: Page) => page.getByRole('button', { name: 'More project actions', exact: true });
const confirm = (page: Page) => page.locator('[data-project-archive-confirm]');
const toast = (page: Page) => page.locator('[data-toast]:popover-open');
const banner = (page: Page) => page.locator('app-archived-banner');
const sentence = (page: Page) => banner(page).locator('[data-archived-sentence]');
const heading = (page: Page) => page.locator('h1[data-project-name]');

const openConfirm = async (page: Page, mode: Mode = 'mouse') => {
  await press(more(page), mode);
  await press(page.getByRole('menuitem', { name: /^Archive (project|workstream)…$/ }), mode);
  await expect(confirm(page)).toBeVisible();
};
/** Waits for the page's tree before it can name anything. */
const loaded = async (page: Page, id: string) => {
  await page.goto(route(id));
  await expect(heading(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
};
const expectGroupDown = async () => {
  expect(await stored(KITCHEN)).toMatchObject({ status: 'archived', archivedWithProject: { projectId: ROOT, status: 'active' } });
  expect(await stored(CABINETS)).toMatchObject({ status: 'archived', archivedWithProject: { projectId: ROOT } });
  expect(await stored(GARDEN)).toMatchObject({ status: 'archived', archivedWithProject: { projectId: ROOT, status: 'completed' } });
  expect(await stored(LEGACY)).not.toHaveProperty('archivedWithProject');
  expect((await stored(LEGACY)).status).toBe('archived');
  expect((await stored(SHELVING)).status).toBe('active');
};

const MODES: { mode: Mode; use: { viewport: { width: number; height: number }; hasTouch?: boolean } }[] = [
  { mode: 'mouse', use: { viewport: { width: 1440, height: 900 } } },
  { mode: 'touch', use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
  { mode: 'keyboard', use: { viewport: { width: 1440, height: 900 } } },
];

for (const { mode, use } of MODES) {
  test.describe(`cascading archive, ${mode}`, () => {
    test.use(use);
    test.beforeEach(async () => { await seed('nested-projects'); });

    test('1: Kitchen’s confirmation lists Cabinets, and Cancel writes nothing', async ({ page }) => {
      await loaded(page, KITCHEN);
      await openConfirm(page, mode);
      await expect(confirm(page).locator('h2')).toHaveText('Archive “Kitchen” and its 1 workstream?');
      await expect(confirm(page).locator('[data-project-archive-row]')).toHaveText(['Cabinets · Active']);
      await expect(page.locator('[data-project-archive-cancel]')).toBeFocused();
      await press(page.locator('[data-project-archive-cancel]'), mode);
      await expect(confirm(page)).toHaveCount(0);
      await expect(more(page)).toBeFocused();
      expect((await stored(KITCHEN)).status).toBe('active');
      expect((await stored(CABINETS)).status).toBe('active');
    });

    test('3–6: commit, Undo from the toast, Redo from the header, restore from the banner, and Home’s Undo', async ({ page }) => {
      const gardenBefore = await stored(GARDEN);
      await loaded(page, ROOT);
      await openConfirm(page, mode);
      await press(page.locator('[data-project-archive-confirm-yes]'), mode);

      // 3: the toast counts it, the page stays with its banner, and focus returns to More.
      await expect(toast(page).locator('.toast__message')).toHaveText('Archived Home renovation and 3 workstreams.');
      await expect(sentence(page)).toHaveText('“Home renovation” is archived. Restoring it brings back 3 workstreams as they were.');
      await expect(more(page)).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`${route(ROOT)}$`));
      await expectGroupDown();

      // 4: Undo from the toast: all four live, Garden Completed at its original time.
      await press(toast(page).getByRole('button', { name: 'Undo', exact: true }), mode);
      await expect(banner(page)).toHaveCount(0);
      expect((await stored(ROOT)).status).not.toBe('archived');
      expect((await stored(KITCHEN)).status).toBe('active');
      expect((await stored(CABINETS)).status).toBe('active');
      expect(await stored(GARDEN)).toMatchObject({ status: 'completed', completedAt: gardenBefore.completedAt });
      expect(await stored(KITCHEN)).not.toHaveProperty('archivedWithProject');
      expect((await stored(LEGACY)).status).toBe('archived');

      // 5: Redo from the header: the same state, the same markers.
      await redoFromHeader(page, 'Archived "Home renovation" and 3 workstreams');
      await expect(banner(page)).toBeVisible();
      await expectGroupDown();

      // 6: restore from the banner as On hold: the owner takes the choice, the three what they were.
      await banner(page).locator('select[data-restore-status]').selectOption('on_hold');
      await press(banner(page).locator('[data-restore-action]'), mode);
      await expect(banner(page)).toHaveCount(0);
      expect((await stored(ROOT)).status).toBe('on_hold');
      expect((await stored(KITCHEN)).status).toBe('active');
      expect((await stored(CABINETS)).status).toBe('active');
      expect(await stored(GARDEN)).toMatchObject({ status: 'completed', completedAt: gardenBefore.completedAt });
      expect(await stored(CABINETS)).not.toHaveProperty('archivedWithProject');
      expect((await stored(LEGACY)).status).toBe('archived');
      const listed = await api.get<{ items: { project: { id: string } }[] }>('/api/archived-projects');
      expect(listed.items.map(({ project }) => project.id)).toContain(LEGACY);

      // The chain's end: Home's Undo re-archives the group.
      await undoFromHeader(page, 'Reactivated "Home renovation" and 3 workstreams');
      await expect(banner(page)).toBeVisible();
      await expectGroupDown();
    });

    test('8: on a child alone, the banner names its owner, restores it, and focus lands on the heading', async ({ page }) => {
      await api.patch(`/api/projects/${KITCHEN}`, { status: 'archived', archiveWorkstreamIds: [CABINETS] });
      await loaded(page, CABINETS);
      await expect(sentence(page)).toHaveText('“Cabinets” was archived with “Kitchen”. Restoring “Kitchen” brings it back.');
      await press(more(page), mode);
      await expect(page.locator('[data-project-status-option]')).toHaveCount(0);
      await page.keyboard.press('Escape');
      const archive = await api.get<{ items: { kind: string; project?: { id: string } }[] }>(`/api/projects/${ROOT}/archive`);
      expect(archive.items.flatMap(({ project }) => (project ? [project.id] : []))).not.toContain(CABINETS);
      const listed = await api.get<{ items: { project: { id: string } }[] }>('/api/archived-projects');
      expect(listed.items.map(({ project }) => project.id)).not.toContain(CABINETS);

      await press(banner(page).locator('[data-restore-action]'), mode);

      await expect(banner(page)).toHaveCount(0);
      await expect(heading(page)).toBeFocused();
      await expect(toast(page).locator('.toast__message')).toHaveText('Reactivated “Kitchen” and 1 workstream.');
      expect((await stored(CABINETS)).status).toBe('active');
      await page.goto(route(KITCHEN));
      await expect(heading(page)).toBeVisible();
      await expect(banner(page)).toHaveCount(0);
    });

    if (mode !== 'keyboard') {
      test('10: a late refusal closes the dialog, says so, and the next confirmation shows the new list', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (message) => {
          if (message.type() === 'error' && !message.text().includes('net::ERR_FAILED') && !message.text().includes('status of 409')) errors.push(message.text());
        });
        await page.route((url) => url.pathname === '/prototype/events', (live) => live.abort());
        await loaded(page, KITCHEN);
        await openConfirm(page, mode);
        await api.post('/api/projects', { workspaceId: 'workspace-demo', kind: 'subproject', parentProjectId: KITCHEN, name: 'Late drawers' });

        await press(page.locator('[data-project-archive-confirm-yes]'), mode);

        await expect(confirm(page)).toHaveCount(0);
        await expect(more(page)).toBeFocused();
        const error = page.locator('[data-project-write-error]');
        await expect(error).toContainText('The workstreams under “Kitchen” changed. Choose Archive again to confirm the current list.');
        await expect(error.locator('details')).toContainText('still has active workstreams');
        await expect(error.getByRole('button', { name: /Try again/ })).toHaveCount(0);
        expect((await stored(KITCHEN)).status).toBe('active');
        expect((await stored(CABINETS)).status).toBe('active');

        await openConfirm(page, mode);
        await expect(confirm(page).locator('h2')).toHaveText('Archive “Kitchen” and its 2 workstreams?');
        await expect(confirm(page).locator('[data-project-archive-row]')).toContainText(['Late drawers']);
        expect(errors).toEqual([]);
      });
    }
  });
}

test.describe('cascading archive, the rest at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async () => { await seed('nested-projects'); });

  test('2: Home renovation lists the whole subtree, nested, and nothing separately archived', async ({ page }) => {
    await loaded(page, ROOT);
    await openConfirm(page);
    await expect(confirm(page).locator('h2')).toHaveText('Archive “Home renovation” and its 3 workstreams?');
    const rows = confirm(page).locator('[data-project-archive-row] > span');
    await expect(rows).toHaveText(['Kitchen · Active', 'Cabinets · Active', 'Garden · Completed']);
    await expect(confirm(page).locator('[data-project-archive-row] [data-project-archive-row] > span')).toHaveText(['Cabinets · Active']);
    await expect(confirm(page)).not.toContainText('Legacy');
    const offset = async (name: string) => (await confirm(page).locator('[data-project-archive-row] > span', { hasText: name }).boundingBox())!.x;
    expect(await offset('Cabinets')).toBeGreaterThan(await offset('Kitchen'));
  });

  test('7: restored from root Archive, then from Settings, each row and toast saying what comes back', async ({ page }) => {
    const archiveKitchen = () => api.patch(`/api/projects/${KITCHEN}`, { status: 'archived', archiveWorkstreamIds: [CABINETS] });
    await archiveKitchen();
    await page.goto(`${route(ROOT)}/pages/archive`);
    const row = page.locator(`[data-archived-item][data-archived-id="${KITCHEN}"]`);
    await expect(row.locator('[data-archived-cascade-count]')).toHaveText('Comes back with 1 workstream');
    await row.locator('[data-restore-action]').click();
    await expect(toast(page).locator('.toast__message')).toHaveText('Restored Kitchen as Active. 1 workstream came back as it was.');
    expect((await stored(CABINETS)).status).toBe('active');

    await archiveKitchen();
    await page.goto('/settings/archived-projects');
    const setting = page.locator(`[data-archived-project][data-project-id="${KITCHEN}"]`);
    await expect(setting.locator('[data-archived-cascade-count]')).toHaveText('Comes back with 1 workstream');
    await setting.locator('[data-restore-action]').click();
    await expect(toast(page).locator('.toast__message')).toHaveText('Restored Kitchen as Active. 1 workstream came back as it was.');
    expect((await stored(CABINETS)).status).toBe('active');
  });

  test('Undo from the Archive restore toast takes the group down again', async ({ page }) => {
    await api.patch(`/api/projects/${KITCHEN}`, { status: 'archived', archiveWorkstreamIds: [CABINETS] });
    await page.goto(`${route(ROOT)}/pages/archive`);
    await page.locator(`[data-archived-item][data-archived-id="${KITCHEN}"] [data-restore-action]`).click();
    await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await stored(CABINETS)).status).toBe('archived');
    expect(await stored(CABINETS)).toMatchObject({ archivedWithProject: { projectId: KITCHEN } });
  });

  test('9: archived separately first, the commit form is unchanged, and it stays archived as the next owner', async ({ page }) => {
    await api.patch(`/api/projects/${CABINETS}`, { status: 'archived' });
    await loaded(page, KITCHEN);
    await openConfirm(page);
    await expect(confirm(page).locator('h2')).toHaveText('Archive “Kitchen”?');
    await expect(page.locator('[data-project-archive-confirm-yes]')).toHaveText('Archive it');
    await page.locator('[data-project-archive-confirm-yes]').click();
    await expect(toast(page).locator('.toast__message')).toHaveText('Archived Kitchen.');

    await banner(page).locator('[data-restore-action]').click();
    await expect(banner(page)).toHaveCount(0);
    expect((await stored(CABINETS)).status).toBe('archived');
    const listed = await api.get<{ items: { project: { id: string } }[] }>('/api/archived-projects');
    expect(listed.items.map(({ project }) => project.id)).toContain(CABINETS);
  });

  test('11: a Redo over a workstream added since refuses, nothing moves, and the header keeps its Redo', async ({ page }) => {
    await loaded(page, KITCHEN);
    await openConfirm(page);
    await page.locator('[data-project-archive-confirm-yes]').click();
    await expect(toast(page)).toBeVisible();
    await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(banner(page)).toHaveCount(0);
    await api.post('/api/projects', { workspaceId: 'workspace-demo', kind: 'subproject', parentProjectId: KITCHEN, name: 'Late drawers' });

    const { response } = await redoFromHeader(page, 'Archived "Kitchen" and 1 workstream');

    expect(response.status()).toBe(409);
    expect((await stored(KITCHEN)).status).toBe('active');
    expect((await stored(CABINETS)).status).toBe('active');
    await expect(page.locator('[data-history-redo]')).toHaveAttribute('aria-label', 'Redo: Archived "Kitchen" and 1 workstream');
  });

  test('12: an archived root’s Todos count equals what a restore shows, including under the group', async ({ page }) => {
    const live = await api.get<{ items: unknown[] }>(`/api/projects/${ROOT}/todos`);
    expect(live.items.length).toBeGreaterThan(0);
    await api.patch(`/api/projects/${ROOT}`, { status: 'archived', archiveWorkstreamIds: [KITCHEN, CABINETS, GARDEN] });

    await page.goto(`${route(ROOT)}/pages/todos`);

    await expect(page.locator('app-todos-page')).toContainText(`Restore to view ${live.items.length} hidden todos.`);
    await api.patch(`/api/projects/${ROOT}`, { status: 'active' });
    expect((await api.get<{ items: unknown[] }>(`/api/projects/${ROOT}/todos`)).items).toHaveLength(live.items.length);
  });

  test('an archived root’s navigation does not say it has no workstreams', async ({ page }) => {
    await api.patch(`/api/projects/${ROOT}`, { status: 'archived', archiveWorkstreamIds: [KITCHEN, CABINETS, GARDEN] });
    await page.goto(route(ROOT));
    await expect(banner(page)).toBeVisible();
    await expect(page.locator('[data-work-empty]')).toHaveCount(0);
  });
});
