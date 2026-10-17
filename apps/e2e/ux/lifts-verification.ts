import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve('ux-output', commit);
const openLift = '.lift:popover-open,dialog.lift[open]';
const kinds = ['side', 'sheet', 'menu', 'popover', 'details', 'confirm'] as const;

async function open(page: Page, kind: typeof kinds[number]) {
  if (kind === 'side' || kind === 'sheet') {
    const row = page.getByRole('button', { name: /, open details$/ }).last();
    await row.scrollIntoViewIfNeeded();
    await row.click();
    return row;
  }
  if (kind === 'popover') {
    const expand = page.getByRole('button', { name: 'Show project navigation', exact: true });
    if (await expand.isVisible()) await expand.click();
    const gear = page.getByRole('button', { name: 'Project page settings for Home renovation', exact: true });
    await gear.click();
    return gear;
  }
  const more = page.getByRole('button', { name: 'More project actions', exact: true });
  await more.click();
  if (kind !== 'menu') await page.getByRole('menuitem', { name: kind === 'details' ? 'Edit details…' : /^Archive (project|workstream)…$/, exact: true }).click();
  return more;
}

async function measure(page: Page) {
  return page.evaluate(selector => {
    const visible = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    const lift = document.querySelector(selector)!;
    const style = getComputedStyle(lift);
    const layers = [...document.querySelectorAll('*')].filter(element => visible(element) && getComputedStyle(element).backdropFilter !== 'none');
    const transient = layers.filter(element => element.matches('.lift') || element.closest('.lift'));
    const focused = document.activeElement;
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-text-muted)';
    lift.append(probe);
    const muted = getComputedStyle(probe).color;
    probe.style.color = 'var(--color-text)';
    const text = getComputedStyle(probe).color;
    probe.style.color = 'var(--plane-sheet-solid)';
    const sheet = getComputedStyle(probe).color;
    probe.remove();
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const paint = canvas.getContext('2d')!;
    const rgba = (color: string) => {
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = color;
      paint.fillRect(0, 0, 1, 1);
      return Array.from(paint.getImageData(0, 0, 1, 1).data);
    };
    const luminance = (color: number[]) => color.slice(0, 3).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index]!, 0);
    const foreground = luminance(rgba(muted));
    const tint = rgba(style.backgroundColor);
    const alpha = tint[3]! / 255;
    const ratios = [sheet, text].map(backing => {
      const backingColor = rgba(backing);
      const composite = tint.slice(0, 3).map((channel, index) => channel * alpha + backingColor[index]! * (1 - alpha));
      const background = luminance(composite);
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    });
    return {
      backdropFilter: style.backdropFilter, background: style.backgroundColor, border: style.border,
      solidToken: style.getPropertyValue('--plane-lift-solid').trim(),
      mutedToken: style.getPropertyValue('--color-text-muted').trim(),
      persistent: layers.length - transient.length, transient: transient.length,
      openCount: document.querySelectorAll(selector).length,
      focus: { tag: focused?.tagName, name: focused?.getAttribute('aria-label') ?? focused?.textContent?.trim().slice(0, 100), inside: Boolean(focused && lift.contains(focused)) },
      contrast: { status: 'reported-only', muted, minimumRatio: Math.min(...ratios), method: 'Computed lift tint composited over the solid sheet and text-coloured busy content; sRGB canvas decoding.' },
    };
  }, openLift);
}

test('Lift runtime evidence', async ({ browser }) => {
  test.skip(!process.env['UX_LIFTS']);
  await mkdir(out, { recursive: true });
  const lifts: unknown[] = [];
  const focus: unknown[] = [];
  for (const theme of ['dark', 'light'] as const) {
    for (const kind of kinds) {
      await seed('nested-projects');
      await setClock(SEED_NOW);
      const phone = kind === 'sheet';
      const context = await browser.newContext({ viewport: phone ? { width: 375, height: 812 } : { width: 1440, height: 900 }, hasTouch: phone, isMobile: phone, colorScheme: theme, reducedMotion: 'reduce' });
      await configureContext(context);
      const page = await context.newPage();
      await page.goto('http://localhost:4200/projects/project-kitchen');
      await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
      await expect(page.getByRole('button', { name: 'More project actions' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.locator('[data-theme-toggle]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'dark' ? 'light' : 'dark');
      await page.locator('[data-theme-toggle]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const persistentBefore = await page.evaluate(() => [...document.querySelectorAll('*')].filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).backdropFilter !== 'none').length);
      const opener = await open(page, kind);
      await expect(page.locator(openLift)).toHaveCount(1);
      await expect.poll(() => page.locator(openLift).evaluate(element => element.contains(document.activeElement))).toBe(true);
      const computed = await measure(page);
      expect(computed.focus.inside).toBe(true);
      expect(computed.transient).toBeLessThanOrEqual(1);
      // The budget forbids adding layers; retain both counts for visual review.
      expect(computed.persistent).toBeLessThanOrEqual(persistentBefore);
      const screenshot = `lift-${kind}-${theme}.png`;
      await page.screenshot({ path: resolve(out, screenshot), animations: 'disabled' });
      const fallbacks: unknown[] = [];
      for (const mode of ['forced-colors', 'reduced-transparency'] as const) {
        const cdp = await context.newCDPSession(page);
        if (mode === 'forced-colors') await page.emulateMedia({ forcedColors: 'active' });
        else await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-transparency', value: 'reduce' }] });
        const fallback = await measure(page);
        expect(fallback.backdropFilter).toBe('none');
        expect(fallback.background).not.toBe('rgba(0, 0, 0, 0)');
        expect(fallback.background).not.toMatch(/rgba\([^)]*,\s*0?\.\d+\)/);
        const file = `lift-${kind}-${theme}-${mode}.png`;
        await page.screenshot({ path: resolve(out, file), animations: 'disabled' });
        fallbacks.push({ mode, screenshot: file, ...fallback });
        await page.emulateMedia({ forcedColors: 'none' });
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        await cdp.detach();
      }
      await page.keyboard.press('Escape');
      await expect(page.locator(openLift)).toHaveCount(0);
      await expect(opener).toBeFocused();
      focus.push({ theme, kind, findings: kind === 'popover' ? ['L5-010'] : kind === 'side' || kind === 'sheet' ? ['W3-014', 'L5-010'] : ['W3-006', 'L5-009'], open: computed.focus, closed: 'recorded opener', passed: true });
      lifts.push({ theme, kind, screenshot, persistentBefore, ...computed, fallbacks });
      await writeFile(resolve(out, 'lifts-verification.json'), JSON.stringify({ commit, lifts, focus, complete: false }, null, 2));
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    await configureContext(context);
    const page = await context.newPage();
    await page.goto('http://localhost:4200/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.locator('body')).toBeFocused();
    await page.getByRole('link', { name: 'AI & Agents', exact: true }).click();
    const heading = page.getByRole('heading', { name: 'AI & Agents', exact: true });
    await expect(heading).toBeFocused();
    focus.push({ theme, findings: ['W3-003'], path: 'Settings > AI & Agents', target: await heading.textContent(), passed: true });
    await page.goto('http://localhost:4200/projects/project-kitchen');
    await expect(page.getByRole('button', { name: 'More project actions' })).toBeVisible();
    await open(page, 'popover');
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolveGate => { release = resolveGate; });
    await page.route('**/api/projects/*/pages/reflections', async route => {
      if (route.request().method() === 'GET') return route.fallback();
      await gate;
      await route.fallback();
    });
    const toggle = page.getByRole('checkbox', { name: 'Show Reflections page', exact: true });
    try {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-disabled', 'true');
      await expect(toggle).toBeFocused();
      focus.push({ theme, findings: ['W3-005'], path: 'Page settings > toggle Reflections while saving', target: 'Show Reflections page', passed: true });
    } finally { release?.(); }
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Escape');
    await page.goto('http://localhost:4200/app');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Lift focus project');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const createdHeading = page.getByRole('heading', { name: 'Lift focus project', exact: true });
    await expect(createdHeading).toBeFocused();
    focus.push({ theme, findings: ['W3-003'], path: 'New project > Create', target: 'Lift focus project', passed: true });
    await page.goto('http://localhost:4200/projects/project-kitchen');
    await page.getByRole('button', { name: /^Remove section / }).first().click();
    await page.locator('[data-open-archive]').click();
    await expect(page.locator('#archive-page-title')).toBeFocused();
    focus.push({ theme, findings: ['W3-003'], path: 'Section removal notice > Open Archive', target: 'Archive', passed: true });
    await context.close();
  }
  await writeFile(resolve(out, 'lifts-verification.json'), JSON.stringify({ commit, lifts, focus, complete: true }, null, 2));
});
