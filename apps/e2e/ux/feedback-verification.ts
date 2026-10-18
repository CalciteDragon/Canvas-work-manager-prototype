import { expect, test, type Page, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve('ux-output', commit);
const toast = (page: Page) => page.locator('[data-toast]:popover-open');
const rows = ['remove-listed', 'remove-unlisted', 'task-delete', 'project-archive', 'header-transition', 'cross-owner', 'archive-restore', 'todos-complete'] as const;

async function activate(control: Locator, touch: boolean): Promise<void> {
  await control.focus();
  if (touch) await control.tap(); else await control.press('Enter');
}

async function feedbackAction(page: Page, row: typeof rows[number], touch: boolean) {
  const route = row === 'archive-restore' ? '/projects/project-renovation/pages/archive'
    : row === 'todos-complete' ? '/projects/project-renovation/pages/todos'
      : row === 'project-archive' ? '/projects/project-garden' : '/projects/project-kitchen';
  await page.goto(`http://localhost:4200${route}`);
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
  await page.waitForLoadState('networkidle');
  let acted = page.locator('[data-project-name]');
  if (row === 'remove-listed' || row === 'remove-unlisted' || row === 'header-transition') {
    acted = page.locator(row === 'remove-unlisted' ? '[data-section-id="section-project-kitchen-progress"]' : '[data-section-id="section-project-kitchen-notes"]');
    const remove = row === 'remove-unlisted' ? page.getByRole('button', { name: 'Remove section Progress', exact: true }) : page.getByRole('button', { name: /^Remove section / }).first();
    acted = remove.locator('xpath=ancestor::*[@data-section-id][1]');
    const box = await acted.boundingBox();
    await activate(remove, touch);
    await expect(toast(page)).toBeVisible();
    if (row === 'header-transition') {
      await expect(page.locator('[data-history-undo]')).not.toHaveAttribute('aria-disabled', 'true');
      await activate(page.locator('[data-history-undo]'), touch);
      await expect(toast(page)).toContainText('Undone:');
    }
    return box;
  }
  if (row === 'task-delete') {
    const remove = page.locator('[data-task-delete]').first();
    acted = remove.locator('xpath=ancestor::*[@data-task-row][1]');
    const box = await acted.boundingBox();
    await activate(remove, touch);
    return box;
  }
  if (row === 'project-archive') {
    await page.getByRole('button', { name: 'More project actions', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Archive workstream/ }).click();
    await activate(page.locator('[data-project-archive-confirm-yes]'), touch);
  } else if (row === 'cross-owner') {
    const expand = page.getByRole('button', { name: 'Show project navigation', exact: true });
    if (await expand.isVisible()) await expand.click();
    await page.getByRole('button', { name: 'Add workstream', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Lighting');
    await dialog.getByRole('combobox', { name: 'Parent', exact: true }).selectOption('project-kitchen');
    await activate(dialog.getByRole('button', { name: 'Create', exact: true }), touch);
  } else if (row === 'archive-restore') {
    const restore = page.locator('[data-archived-restore]:not([disabled])').first();
    acted = restore.locator('xpath=ancestor::*[@data-archived-item][1]');
    const box = await acted.boundingBox();
    await activate(restore, touch);
    return box;
  } else if (row === 'todos-complete') {
    const complete = page.getByRole('button', { name: 'Complete Kitchen', exact: true });
    acted = complete.locator('xpath=ancestor::*[@data-todo-row][1]');
    const box = await acted.boundingBox();
    await activate(complete, touch);
    return box;
  }
  return acted.boundingBox();
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-toast]:popover-open')!;
    const track = document.querySelector<HTMLElement>('.project-workspace__main') ?? document.querySelector<HTMLElement>('main')!;
    const box = element.getBoundingClientRect(), bounds = track.getBoundingClientRect();
    const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const drawer = document.querySelector<HTMLElement>('[data-task-drawer]:popover-open');
    const column = document.querySelector<HTMLElement>('app-project-page-navigation');
    const focused = document.activeElement;
    const probe = document.createElement('span');
    probe.style.width = 'var(--space-4)'; probe.style.position = 'absolute'; element.append(probe);
    const gutter = probe.getBoundingClientRect().width; probe.remove();
    const visible = (node: Element) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
    const layers = [...document.querySelectorAll('*')].filter(node => visible(node) && getComputedStyle(node).backdropFilter !== 'none');
    const transient = layers.filter(node => node.matches('.lift') || node.closest('.lift')).length;
    return { inlineClearance: Math.min(box.left - bounds.left - gutter, bounds.right - gutter - box.right),
      drawerIntersection: drawer !== null && intersects(box, drawer.getBoundingClientRect()),
      columnIntersection: column !== null && visible(column) && intersects(box, column.getBoundingClientRect()),
      focusedIntersection: focused instanceof HTMLElement && !element.contains(focused) && intersects(box, focused.getBoundingClientRect()),
      transient, persistent: layers.length - transient, background: getComputedStyle(element).backgroundColor,
      backdropFilter: getComputedStyle(element).backdropFilter, muted: getComputedStyle(element).getPropertyValue('--color-text-muted'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      track: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      focus: { tag: focused?.tagName, text: focused?.textContent?.trim().slice(0, 100), inside: focused !== null && element.contains(focused) },
    };
  });
}

/** Backdrop-filter layers and the toast's state while another lift is open, which may suppress the toast. */
async function layers(page: Page) {
  return page.evaluate(() => {
    const visible = (node: Element) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
    const blurred = [...document.querySelectorAll('*')].filter(node => visible(node) && getComputedStyle(node).backdropFilter !== 'none');
    const transient = blurred.filter(node => node.matches('.lift') || node.closest('.lift')).length;
    const element = document.querySelector<HTMLElement>('[data-toast]:popover-open');
    const drawer = document.querySelector<HTMLElement>('[data-task-drawer]:popover-open, dialog[open] [data-task-drawer]');
    const a = element?.getBoundingClientRect(), b = drawer?.getBoundingClientRect();
    return { toastOpen: element !== null, transient, persistent: blurred.length - transient,
      drawerIntersection: a !== undefined && b !== undefined && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top };
  });
}

/** Muted text over the toast's backing composited on the page background; reported, never gated. */
async function contrast(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-toast]:popover-open')!;
    // Computed colours arrive as hex, rgb()/rgba() or color(srgb …); each becomes 0–255 channels and alpha.
    const rgba = (value: string): readonly [number, number, number, number] => {
      const hex = /^#([0-9a-f]{6})$/i.exec(value);
      if (hex) return [0, 2, 4].map(i => parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as unknown as [number, number, number, number];
      const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(value);
      if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
      const rgb = /rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:(?:,| \/) ([\d.]+))?\)/.exec(value);
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
      throw new Error(`Unparsed colour ${value}`);
    };
    const page = rgba(getComputedStyle(document.body).backgroundColor);
    const [r, g, b, a] = rgba(getComputedStyle(element).backgroundColor);
    const backing = [r, g, b].map((channel, index) => channel * a + page[index]! * (1 - a));
    const muted = rgba(getComputedStyle(element).getPropertyValue('--color-text-muted').trim());
    const luminance = (rgb: readonly number[]) => rgb.slice(0, 3).map(channel => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
      .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index]!, 0);
    const [light, dark] = [luminance(muted), luminance(backing)].sort((x, y) => y - x);
    return { mutedOverBacking: Math.round(((light! + 0.05) / (dark! + 0.05)) * 100) / 100, note: 'Composited over the page background without the blur; reported only.' };
  });
}

test('Feedback runtime evidence', async ({ browser }) => {
  test.skip(!process.env['UX_FEEDBACK']);
  await mkdir(out, { recursive: true });
  const entries: unknown[] = [], focus: unknown[] = [];
  for (const theme of ['dark', 'light'] as const) for (const width of [1440, 375]) {
    const touch = width === 375;
    for (const row of rows) {
      await seed('nested-projects'); await setClock(SEED_NOW);
      const context = await browser.newContext({ viewport: { width, height: touch ? 812 : 900 }, hasTouch: touch, isMobile: touch, colorScheme: theme, reducedMotion: 'reduce' });
      await configureContext(context);
      const page = await context.newPage();
      const acted = await feedbackAction(page, row, touch);
      await expect(toast(page)).toBeVisible();
      await expect(page.locator('[data-toast]:popover-open')).toHaveCount(1);
      const measured = await geometry(page);
      expect(measured.inlineClearance).toBeGreaterThanOrEqual(-1);
      expect(measured.focusedIntersection).toBe(false);
      expect(measured.columnIntersection).toBe(false);
      const screenshot = `feedback-${row}-${theme}-${width}.png`;
      await page.screenshot({ path: resolve(out, screenshot), animations: 'disabled' });
      const active = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0, 100) }));
      expect(active.tag).not.toBe('BODY');
      focus.push({ row, theme, width, active, screenshot, measured, acted,
        intersectsActedRegion: acted !== null && measured.box.x < acted.x + acted.width && measured.box.x + measured.box.width > acted.x && measured.box.y < acted.y + acted.height && measured.box.y + measured.box.height > acted.y,
        passed: true });
      if (row === 'remove-listed') {
        const fallbacks: unknown[] = [];
        for (const mode of ['forced-colors', 'reduced-transparency'] as const) {
          const cdp = await context.newCDPSession(page);
          if (mode === 'forced-colors') await page.emulateMedia({ forcedColors: 'active' });
          else await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-transparency', value: 'reduce' }] });
          const fallback = await geometry(page);
          expect(fallback.backdropFilter).toBe('none');
          fallbacks.push({ mode, ...fallback });
          await page.emulateMedia({ forcedColors: 'none' });
          await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
          await cdp.detach();
        }
        let suppression = null;
        if (touch) {
          await page.getByRole('button', { name: 'Menu', exact: true }).click();
          await expect(toast(page)).toHaveCount(0);
          await page.locator('[data-shell-drawer-close]').click();
          await expect(toast(page)).toBeVisible();
          suppression = { hidden: true, returned: true };
        }
        // Blur and clearance with another lift open beside the toast (Acceptance 13).
        const reported = await contrast(page);
        const beside: Record<string, unknown> = {};
        const title = page.getByRole('button', { name: /, open details$/ }).first();
        await title.scrollIntoViewIfNeeded(); await title.click();
        await expect(page.locator('[data-task-drawer]')).toBeVisible();
        beside['drawer'] = await layers(page);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'More project actions', exact: true }).click();
        beside['more'] = await layers(page);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Insert at the end', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        beside['dialog'] = await layers(page);
        await page.keyboard.press('Escape');
        for (const [state, value] of Object.entries(beside) as [string, Awaited<ReturnType<typeof layers>>][]) {
          expect(value.transient, state).toBeLessThanOrEqual(1);
          expect(value.drawerIntersection, state).toBe(false);
        }
        entries.push({ theme, width, ...measured, contrast: reported, fallbacks, suppression, beside });
      }
      await writeFile(resolve(out, 'feedback-verification.json'), JSON.stringify({ commit, complete: false, entries, focus }, null, 2));
      await context.close();
    }
  }
  await writeFile(resolve(out, 'feedback-verification.json'), JSON.stringify({ commit, complete: true, entries, focus }, null, 2));
});
