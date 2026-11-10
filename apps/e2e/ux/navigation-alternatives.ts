import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';
import { configureContext } from './isolation';

/**
 * Slice 81's alternatives specimens (R1, disposable, deleted at step 3). Step 1 holds the
 * specimens' smoke check in a real browser and the `showPopover({ source })` probe R2 asks for
 * before step 6 relies on it; step 2 adds the captures and the measurements.
 * Run: `pnpm --filter web build`, then
 * `cd apps/e2e && pnpm exec playwright test --config ux/slice81-alternatives.config.ts`.
 */
const out = resolve('ux-output', 'slice81-alternatives');
const specimen = (option: string, at: string, extra = '') => `http://localhost:4200/prototype/navigation/${option}?at=${encodeURIComponent(at)}${extra}`;

const open = async (browser: Browser, width: 1440 | 375) => {
  const context = await browser.newContext(width === 375
    ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'UTC', reducedMotion: 'reduce' }
    : { viewport: { width: 1440, height: 900 }, timezoneId: 'UTC', reducedMotion: 'reduce' });
  await configureContext(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return { context, page, errors };
};

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const liftOpen = (page: Page) => page.locator('[data-specimen-lift]').evaluate((node) => node.matches(':popover-open'));

test.beforeAll(async () => { await seed('nested-projects'); await setClock(SEED_NOW); await mkdir(out, { recursive: true }); });

test('each option renders over the seed with one current item, in both keyboard models', async ({ browser }) => {
  const { context, page, errors } = await open(browser, 1440);
  for (const option of ['a', 'b', 'c']) {
    for (const keys of ['links', 'tree']) {
      await page.goto(specimen(option, '/projects/project-cabinets', `&keys=${keys}`));
      const nav = page.locator('[data-specimen-nav]');
      await expect(nav.locator('[aria-current="page"]')).toHaveText('Cabinets');
      await expect(page.locator('[data-specimen-breadcrumb] [aria-current="page"]')).toHaveText('Cabinets');
      // The shell's own chrome is inert underneath the layer.
      await expect(page.locator('app-shell app-top-bar')).toHaveAttribute('inert', '');
    }
  }
  expect(errors).toEqual([]);
  await context.close();
});

test('showPopover({ source }) anchors with position-anchor: auto; light dismiss does not exempt the source (R2 probe)', async ({ browser }) => {
  const result: Record<string, unknown> = {};
  const { context, page, errors } = await open(browser, 1440);
  await page.goto(specimen('a', '/projects/project-kitchen'));
  const opener = page.locator('[data-specimen-nav] [data-specimen-action="page-settings"]');
  await expect(opener).toHaveText('Pages of Home renovation…');

  await opener.click();
  expect(await liftOpen(page)).toBe(true);
  await expect(opener).toHaveAttribute('aria-expanded', 'true');
  const anchor = await box(page, '[data-specimen-nav] [data-specimen-action="page-settings"]');
  const lift = await box(page, '[data-specimen-lift]');
  result['desktop'] = {
    opener: anchor,
    lift,
    userAgent: await page.evaluate(() => navigator.userAgent),
    // Chromium's initial value is `normal`, under which `anchor()` ignores the implicit anchor;
    // the specimen's lift sets `auto` (navigation-alternatives-page.scss).
    initialPositionAnchor: await page.evaluate(() => { const probe = document.createElement('div'); document.body.append(probe); const value = getComputedStyle(probe).getPropertyValue('position-anchor'); probe.remove(); return value; }),
    liftPositionAnchor: await page.locator('[data-specimen-lift]').evaluate((node) => getComputedStyle(node).getPropertyValue('position-anchor')),
    supportsSource: await page.evaluate(() => {
    let read = false;
    const probe = document.createElement('div');
    probe.popover = 'manual';
    document.body.append(probe);
    probe.showPopover({ get source() { read = true; return document.body; } } as ShowPopoverOptions);
    probe.remove();
    return read;
  }) };
  // The implicit anchor resolved: the lift sits just below its opener (`.lift--popover` places it at
  // `anchor(bottom)` and `anchor(left)`, which only resolve with an anchor).
  expect(Math.abs(lift.x - anchor.x)).toBeLessThan(2);
  expect(lift.y - (anchor.y + anchor.height)).toBeGreaterThanOrEqual(0);
  expect(lift.y - (anchor.y + anchor.height)).toBeLessThan(24);

  // The raw platform behaviour, with no guard: does a press on the `source` light-dismiss?
  result['sourceExemptFromLightDismiss'] = await (async () => {
    await page.evaluate(() => {
      const button = Object.assign(document.createElement('button'), { id: 'probe-source', textContent: 'probe' });
      document.querySelector('[data-specimen-first-content]')!.after(button);
      document.querySelector<HTMLElement>('[data-specimen-lift]')!.hidePopover();
      document.querySelector<HTMLElement>('[data-specimen-lift]')!.showPopover({ source: button } as ShowPopoverOptions);
    });
    await page.locator('#probe-source').click();
    const exempt = await liftOpen(page);
    await page.evaluate(() => { document.querySelector<HTMLElement>('[data-specimen-lift]')!.hidePopover?.(); document.querySelector('#probe-source')!.remove(); });
    return exempt;
  })();
  // An invoker command is exempt, and anchors the same way (step 6's alternative).
  result['commandInvokerExempt'] = await (async () => {
    await page.evaluate(() => {
      const button = Object.assign(document.createElement('button'), { id: 'probe-command', textContent: 'probe' });
      button.setAttribute('commandfor', 'specimen-lift');
      button.setAttribute('command', 'toggle-popover');
      document.querySelector('[data-specimen-first-content]')!.after(button);
    });
    await page.locator('#probe-command').click();
    const opened = await liftOpen(page);
    const command = await box(page, '#probe-command');
    const placed = await box(page, '[data-specimen-lift]');
    result['commandInvokerLift'] = { opener: command, lift: placed };
    expect(Math.abs(placed.x - command.x)).toBeLessThan(2);
    expect(placed.y - (command.y + command.height)).toBeGreaterThanOrEqual(0);
    await page.locator('#probe-command').click();
    const exempt = opened && !(await liftOpen(page));
    await page.evaluate(() => document.querySelector('#probe-command')!.remove());
    return exempt;
  })();
  // Under the initial `position-anchor: normal` the same `source` does not place the lift: it
  // falls to the viewport's corner.
  result['normalLift'] = await page.evaluate(() => {
    const lift = document.querySelector<HTMLElement>('[data-specimen-lift]')!;
    const opener = document.querySelector<HTMLElement>('[data-specimen-nav] [data-specimen-action="page-settings"]')!;
    lift.style.setProperty('position-anchor', 'normal');
    lift.showPopover({ source: opener } as ShowPopoverOptions);
    const { x, y } = lift.getBoundingClientRect();
    lift.hidePopover();
    lift.style.removeProperty('position-anchor');
    return { x, y };
  });
  // The findings the plan's State header and R2 rely on. A Chromium that changes either fails here,
  // and step 6's mechanism is re-checked.
  expect(result['desktop']).toMatchObject({ initialPositionAnchor: 'normal', liftPositionAnchor: 'auto', supportsSource: true });
  expect(result['sourceExemptFromLightDismiss']).toBe(false);
  expect(result['commandInvokerExempt']).toBe(true);
  expect((result['normalLift'] as { x: number }).x).toBeLessThan(2);
  await opener.click();
  expect(await liftOpen(page)).toBe(true);

  // A second press closes. `source` is not exempt from light dismiss in this Chromium, so the
  // specimen remembers the press that dismissed its lift and its click does not reopen it.
  await opener.click();
  expect(await liftOpen(page)).toBe(false);
  await expect(opener).toHaveAttribute('aria-expanded', 'false');

  // A press elsewhere light-dismisses it.
  await opener.click();
  await page.locator('.specimen-frame').nth(1).click();
  expect(await liftOpen(page)).toBe(false);

  // Escape closes it and focus returns to the opener.
  await opener.click();
  await expect(page.locator('[data-specimen-lift-close]')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await liftOpen(page)).toBe(false);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
  await context.close();

  // From the phone drawer: the drawer closes first, the lift opens with no source as a sheet, and
  // Escape returns focus to Menu.
  const phone = await open(browser, 375);
  await phone.page.goto(specimen('a', '/projects/project-kitchen'));
  await phone.page.locator('[data-specimen-menu]').click();
  await phone.page.locator('[data-specimen-nav] [data-specimen-action="page-settings"]').click();
  await expect(phone.page.locator('#specimen-navigation')).not.toHaveAttribute('role', 'dialog');
  await expect.poll(() => liftOpen(phone.page)).toBe(true);
  const sheet = await box(phone.page, '[data-specimen-lift]');
  result['phone'] = { lift: sheet };
  expect(sheet.y).toBeLessThan(24);
  await phone.page.keyboard.press('Escape');
  await expect(phone.page.locator('[data-specimen-menu]')).toBeFocused();
  expect(phone.errors).toEqual([]);
  await phone.context.close();

  await writeFile(resolve(out, 'popover-probe.json'), JSON.stringify(result, null, 2));
});
