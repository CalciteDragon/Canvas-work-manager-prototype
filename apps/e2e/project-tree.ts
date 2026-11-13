/**
 * The global navigation tree's root level, as journeys drive it (Slice 81). Inside a project the
 * sidebar shows the root's row, its enabled pages and its workstream hierarchy; the pencil opens
 * the root's page settings and Add workstream.
 */
import { expect, type Locator, type Page } from '@playwright/test';

type Scope = Page | Locator;

/** The sidebar tree. */
export const tree = (scope: Scope): Locator => scope.locator('app-sidebar');

/** A page's entry in the tree. Home is the root's own row; every other page has its own link. */
export const treePage = (scope: Scope, kind: string): Locator =>
  kind === 'home' ? tree(scope).locator('[data-nav-root]') : tree(scope).locator(`[data-nav-page="${kind}"]`);

/** Every page link below the root's row (Home, the first page, is the row itself). */
export const treePages = (scope: Scope): Locator => tree(scope).locator('[data-nav-page]');

/** A workstream's list item; its children render only while it is open. */
export const treeWork = (scope: Scope, id: string): Locator => tree(scope).locator(`li[data-nav-work-id="${id}"]`);

/** Opens a workstream's children, if it is not already open. */
export const openDisclosure = async (scope: Scope, id: string): Promise<void> => {
  const disclosure = treeWork(scope, id).locator(':scope > .tree-row > [data-nav-disclosure]');
  if ((await disclosure.getAttribute('aria-expanded')) !== 'true') await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
};

/** The tree's pencil, "Edit project". */
export const pencil = (page: Page): Locator => page.locator('app-sidebar [data-edit-project]');

/** Opens the pencil's menu and chooses one of its items. */
export const fromPencil = async (page: Page, item: 'pages' | 'add'): Promise<void> => {
  await pencil(page).click();
  await page.locator(item === 'pages' ? '[data-edit-project-pages]' : '[data-edit-project-add]').click();
};
