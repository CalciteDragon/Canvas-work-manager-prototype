import { expect, test, type Locator, type Route } from '@playwright/test';
import type { ProjectId, WorkspaceId } from '@cwm/contracts';
import { api, createProject, seed, setClock } from './seed';

const NOW = '2026-09-15T12:00:00.000Z';
type ArchivedEntry = { project: { id: ProjectId; status: string }; breadcrumb: { projectId: ProjectId }[] };
type ArchiveEntry = {
  kind: string;
  project?: { id: string };
  section?: { id: string };
  task?: { id: string };
  restoration: { kind: string; permission: string };
  recovery?: { separateRestoreCount?: number };
};
const archivedIds = async () => (await api.get<{ items: ArchivedEntry[] }>('/api/archived-projects')).items.map(({ project }) => project.id);
const archive = async (rootId: string) => (await api.get<{ items: ArchiveEntry[] }>(`/api/projects/${rootId}/archive`)).items;
const keys = (items: ArchiveEntry[]) => items.map((item) => `${item.kind}:${item.project?.id ?? item.section?.id ?? item.task?.id}`);
const row = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-archived-project][data-project-id="${id}"]`);

test('Settings restores the highest project owner first while Archive reveals separately archived content in sequence', async ({ page }) => {
  await seed('nested-projects');
  await setClock(NOW);
  const { workspace } = await api.get<{ workspace: { id: WorkspaceId } }>('/api/me');
  const rootId = (await createProject({ workspaceId: workspace.id, kind: 'root', name: 'Recovery root' })).id;
  const childId = (await createProject({ workspaceId: workspace.id, kind: 'subproject', parentProjectId: rootId, name: 'Recovery child' })).id;
  const taskSectionId = (await api.post<{ section: { id: string } }>(`/api/projects/${rootId}/sections`, {
    type: 'task-list', title: 'Independent-only list',
  })).section.id;
  const independent = (await api.post<{ task: { id: string } }>('/api/tasks', {
    projectId: rootId, sectionId: taskSectionId, title: 'Independently filed task',
  })).task.id;
  await api.post(`/api/tasks/${independent}/archive`, {});
  await api.delete(`/api/sections/${taskSectionId}`);
  await api.patch(`/api/projects/${childId}`, { status: 'archived' });
  await api.patch(`/api/projects/${rootId}/pages/archive`, { enabled: true });
  await api.patch(`/api/projects/${rootId}/pages/archive`, { enabled: false });
  await api.patch(`/api/projects/${rootId}`, { status: 'archived' });

  expect((await archivedIds()).filter((id) => [rootId, childId].includes(id))).toEqual([rootId]);
  const hidden = await archive(rootId);
  expect(keys(hidden)).not.toContain(`subproject:${childId}`);
  expect(keys(hidden)).not.toContain(`task:${independent}`);

  await page.goto('/settings');
  await page.locator('[data-settings-archived-projects]').click();
  await expect(page).toHaveURL(/\/settings\/archived-projects$/);
  await expect(row(page, rootId)).toBeVisible();
  await expect(row(page, childId)).toHaveCount(0);
  await expect(row(page, rootId).locator('[data-archived-open]')).toHaveAttribute('href', `/projects/${rootId}`);
  await expect(row(page, rootId).locator('[data-archived-restore]')).toBeDisabled();
  await row(page, rootId).locator('[data-archived-status]').selectOption('active');
  await row(page, rootId).locator('[data-archived-restore]').click();
  await expect(row(page, rootId)).toHaveCount(0);
  await expect(row(page, childId)).toBeVisible();
  expect((await api.get<{ status: string }>(`/api/projects/${rootId}`)).status).toBe('active');
  expect((await api.get<{ status: string }>(`/api/projects/${childId}`)).status).toBe('archived');
  const nowReady = await archive(rootId);
  expect(keys(nowReady)).toContain(`subproject:${childId}`);
  expect(keys(nowReady)).toContain(`section:${taskSectionId}`);
  expect(keys(nowReady)).not.toContain(`task:${independent}`);
  expect(nowReady.find(({ section }) => section?.id === taskSectionId)?.recovery?.separateRestoreCount).toBe(1);
  expect(nowReady.every(({ restoration }) => restoration.kind === 'ready')).toBe(true);

  await page.reload();
  await expect(row(page, childId)).toBeVisible();
  await row(page, childId).locator('[data-archived-status]').selectOption('on_hold');
  await row(page, childId).locator('[data-archived-restore]').click();
  await expect(row(page, childId)).toHaveCount(0);
  await expect(row(page, childId)).toHaveCount(0);
  expect((await api.get<{ status: string }>(`/api/projects/${childId}`)).status).toBe('on_hold');
  await api.post(`/api/sections/${taskSectionId}/restore`, {});
  expect(keys(await archive(rootId))).toContain(`task:${independent}`);
  await api.post(`/api/tasks/${independent}/restore`, {});
  expect(keys(await archive(rootId))).not.toContain(`task:${independent}`);
});

test('Settings scopes archived projects to the persona and refuses a stale child restore without changing its status', async ({ page }) => {
  await seed('nested-projects');
  await setClock(NOW);
  const { workspace } = await api.get<{ workspace: { id: WorkspaceId } }>('/api/me');
  const root = await createProject({ workspaceId: workspace.id, kind: 'root', name: 'Race root' });
  const child = await createProject({ workspaceId: workspace.id, kind: 'subproject', parentProjectId: root.id, name: 'Race child' });
  await api.patch(`/api/projects/${child.id}`, { status: 'archived' });
  expect((await api.get<{ items: ArchivedEntry[] }>('/api/archived-projects', 'user-alex')).items).toEqual([]);

  await page.goto('/settings/archived-projects');
  await expect(row(page, child.id)).toBeVisible();
  await api.patch(`/api/projects/${root.id}`, { status: 'archived' });
  await expect(api.patch(`/api/projects/${child.id}`, { status: 'active' })).rejects.toThrow('409');
  await expect(row(page, child.id)).toHaveCount(0, { timeout: 15_000 });
  await expect(row(page, root.id)).toBeVisible();
  expect((await api.get<{ status: string }>(`/api/projects/${child.id}`)).status).toBe('archived');
  expect(await archivedIds()).toContain(root.id);
  expect(await archivedIds()).not.toContain(child.id);
});

test.describe('narrow touch recovery', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('status and Restore remain reachable by keyboard and touch in both themes, then return focus to the heading', async ({ page }) => {
    await seed('personal-workspace');
    await setClock(NOW);
    const { workspace } = await api.get<{ workspace: { id: WorkspaceId } }>('/api/me');
    await page.goto('/settings/archived-projects');
    for (const theme of ['dark', 'light'] as const) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-theme-toggle]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const project = await createProject({ workspaceId: workspace.id, kind: 'root', name: `${theme} recovery` });
      await api.patch(`/api/projects/${project.id}`, { status: 'archived' });
      await expect(row(page, project.id)).toBeVisible();
      const status = row(page, project.id).locator('[data-archived-status]');
      await status.focus();
      await expect(status).toBeFocused();
      await status.selectOption('planning');
      const restore = row(page, project.id).locator('[data-archived-restore]');
      await expect(restore).toBeEnabled();
      await restore.focus();
      if (theme === 'dark') await restore.press('Enter');
      else await restore.tap();
      await expect(row(page, project.id)).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Archived projects' })).toBeFocused();
      await expect(page.locator('[data-archived-empty]')).toBeVisible();
    }
  });

  // Slice 47: a later row's Restore is disabled until its status is chosen, so focus moves to
  // the next enabled status selector — or Retry, or the heading — and never away from where
  // the person deliberately put it.
  test('focus lands on the remaining row, a revealed child, Retry, or stays where it was moved, in both themes', async ({ page }) => {
    await seed('personal-workspace');
    await setClock(NOW);
    const { workspace } = await api.get<{ workspace: { id: WorkspaceId } }>('/api/me');
    await page.goto('/settings/archived-projects');
    const status = (id: ProjectId) => row(page, id).locator('[data-archived-status]');
    const restore = (id: ProjectId) => row(page, id).locator('[data-archived-restore]');
    // Each theme uses both methods, alternating by step. A tap is not pre-focused: the rescue
    // depends on the tap itself giving the control focus.
    let step = 0;
    const activate = async (control: Locator, theme: 'dark' | 'light') => {
      step += 1;
      if ((step + (theme === 'dark' ? 0 : 1)) % 2 === 0) {
        await control.focus();
        await control.press('Enter');
      } else {
        await control.tap();
      }
    };
    for (const theme of ['dark', 'light'] as const) {
      step = 0;
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-theme-toggle]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const parent = await createProject({ workspaceId: workspace.id, kind: 'root', name: `${theme} parent` });
      const child = await createProject({ workspaceId: workspace.id, kind: 'subproject', parentProjectId: parent.id, name: `${theme} child` });
      const sibling = await createProject({ workspaceId: workspace.id, kind: 'root', name: `${theme} sibling` });
      await api.patch(`/api/projects/${child.id}`, { status: 'archived' });
      await api.patch(`/api/projects/${parent.id}`, { status: 'archived' });
      await api.patch(`/api/projects/${sibling.id}`, { status: 'archived' });
      await expect(row(page, parent.id)).toBeVisible();
      await expect(row(page, sibling.id)).toBeVisible();
      await expect(row(page, child.id)).toHaveCount(0);

      // Another row remains: focus its status, not its still-disabled Restore.
      await status(sibling.id).selectOption('planning');
      await activate(restore(sibling.id), theme);
      await expect(row(page, sibling.id)).toHaveCount(0);
      await expect(status(parent.id)).toBeFocused();

      // Restoring the parent reveals its child, which takes the focus.
      await status(parent.id).selectOption('active');
      await activate(restore(parent.id), theme);
      await expect(row(page, parent.id)).toHaveCount(0);
      await expect(status(child.id)).toBeFocused();

      // A failed refresh keeps the row blocked and focuses Retry; a successful Retry moves on.
      await status(child.id).selectOption('on_hold');
      const failList = (route: Route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
      await page.route('**/api/archived-projects', failList);
      await activate(restore(child.id), theme);
      await expect(page.locator('[data-archived-error]')).toContainText('Restore succeeded');
      await expect(restore(child.id)).toBeDisabled();
      await expect(page.locator('[data-archived-retry]')).toBeFocused();
      await page.unroute('**/api/archived-projects', failList);
      await activate(page.locator('[data-archived-retry]'), theme);
      await expect(row(page, child.id)).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Archived projects' })).toBeFocused();
      expect((await api.get<{ status: string }>(`/api/projects/${child.id}`)).status).toBe('on_hold');

      // Focus the person moved elsewhere while the request was pending stays there.
      const last = await createProject({ workspaceId: workspace.id, kind: 'root', name: `${theme} last` });
      await api.patch(`/api/projects/${last.id}`, { status: 'archived' });
      await expect(row(page, last.id)).toBeVisible();
      await status(last.id).selectOption('completed');
      let release!: () => void;
      const released = new Promise<void>((resolve) => { release = resolve; });
      const holdWrite = async (route: Route) => {
        if (route.request().method() === 'PATCH') await released;
        await route.continue();
      };
      await page.route(`**/api/projects/${last.id}`, holdWrite);
      await activate(restore(last.id), theme);
      await expect(restore(last.id)).toHaveText('Restoring…');
      const toggle = page.locator('[data-theme-toggle]');
      await toggle.focus();
      release();
      await expect(row(page, last.id)).toHaveCount(0);
      await expect(toggle).toBeFocused();
      await page.unroute(`**/api/projects/${last.id}`, holdWrite);
      await expect(page.locator('[data-archived-empty]')).toBeVisible();
      expect((await api.get<{ status: string }>(`/api/projects/${last.id}`)).status).toBe('completed');
    }
  });
});
