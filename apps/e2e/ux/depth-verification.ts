import { expect, test, type Page, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { seed, setClock } from '../seed';
import { SEED_NOW } from './matrix';

const before = Boolean(process.env['UX_BEFORE']);
const commit = process.env['UX_BEFORE'] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve('ux-output', commit);
const planeSelector = '.top-bar,.sidebar,app-project-page-navigation,.project-header,.section-frame,.shortcut-frame,app-dashboard-widget-frame';
const tokenNames = [
  '--plane-ground-solid', '--color-text', '--color-text-muted', '--color-accent',
  '--color-accent-contrast', '--focus-ring-color', '--art-warm', '--art-cool', '--art-teal', '--ground-art-strength',
  ...['pane', 'sheet', 'lift'].flatMap(plane => ['tint', 'alpha', 'solid'].map(part => '--plane-' + plane + '-' + part)),
];

async function planes(page: Page) {
  return page.locator(planeSelector).evaluateAll(elements => elements.map((element, index) => {
    const style = getComputedStyle(element);
    return { selector: element.tagName.toLowerCase() + '.' + element.className, index, background: style.backgroundColor, filter: style.backdropFilter };
  }));
}

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 180; index++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element => document.activeElement === element)) return;
  }
  throw new Error('Keyboard Tab never reached ' + await target.evaluate(element => element.outerHTML.slice(0, 200)));
}

test('Depth runtime evidence', async ({ browser }) => {
  test.skip(!process.env['UX_DEPTH'] && !before);
  await mkdir(out, { recursive: true });
  await seed('busy-week');
  await setClock(SEED_NOW);
  const tokens: Record<string, unknown> = {};
  const fallbacks: unknown[] = [];
  const focus: unknown[] = [];
  let cssFallback: unknown;
  for (const theme of ['dark', 'light'] as const) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'no-preference' });
    await configureContext(context);
    const page = await context.newPage();
    await page.goto('http://localhost:4200/projects/project-launch');
    await expect(page.locator('[data-project-more]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForLoadState('networkidle');
    tokens[theme] = await page.evaluate(names => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map(name => [name, style.getPropertyValue(name).trim()]));
    }, tokenNames);

    // CDP media sessions reset their overrides on detach. First prove the device-selected
    // theme above, then use the real control to persist this theme during fallback checks.
    // Both toggles are observed so this cannot silently become a session-only DOM patch.
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'dark' ? 'light' : 'dark');
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const expectedRingColor = before ? null : await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--focus-ring-color)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });

    // Read the actual built stylesheet's CSSOM, preserving the fallback selectors.
    const blocks = await page.evaluate(() => {
      const reduced: string[] = [];
      const unsupported: string[] = [];
      const visit = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-reduced-transparency')) {
            reduced.push(...Array.from(rule.cssRules).map(child => child.cssText));
          } else if (rule instanceof CSSSupportsRule && rule.conditionText.includes('not') && rule.conditionText.includes('backdrop-filter')) {
            unsupported.push(...Array.from(rule.cssRules).map(child => child.cssText));
          } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
      return { reduced, unsupported };
    });
    if (!before) {
      expect(blocks.reduced.length, 'built CSS has reduced-transparency fallback').toBeGreaterThan(0);
      expect(blocks.unsupported, 'built no-filter fallback equals reduced transparency').toEqual(blocks.reduced);
    }
    cssFallback = { ...blocks, equal: before ? null : true, source: 'CSSOM of production stylesheets', baselineSolidStyling: before };

    // A Lab sheet-blur experiment must not defeat the real solid fallback cascade.
    if (!before) {
      await page.locator('html').evaluate(element => {
        (element as HTMLElement).style.setProperty('--plane-sheet-blur', '18px');
        (element as HTMLElement).style.setProperty('--lab-sheet-filter', 'blur(var(--plane-sheet-blur)) saturate(var(--glass-saturation))');
      });
      expect(await page.locator('.section-frame').first().evaluate(element => getComputedStyle(element).backdropFilter)).toContain('blur(18px)');
    }

    for (const mode of ['forced-colors', 'reduced-transparency', 'simulated-no-filter'] as const) {
      const cdp = await context.newCDPSession(page);
      if (mode === 'forced-colors') await page.emulateMedia({ forcedColors: 'active' });
      if (mode === 'reduced-transparency') {
        await cdp.send('Emulation.setEmulatedMedia', { features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-transparency', value: 'reduce' },
        ] });
        expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
      }
      const injected = mode === 'simulated-no-filter' ? await page.addStyleTag({ content: blocks.unsupported.join('\n') || '/* Baseline solid styling has no unsupported-filter block. */' }) : null;
      await expect(page.locator('html'), `${theme} remains selected during ${mode}`).toHaveAttribute('data-theme', theme);
      const computed = await planes(page);
      expect(computed.length).toBeGreaterThan(4);
      for (const plane of before ? [] : computed) {
        expect(plane.filter, plane.selector).toBe('none');
        expect(plane.background, plane.selector).not.toBe('rgba(0, 0, 0, 0)');
        expect(plane.background, plane.selector).not.toMatch(/rgba\([^)]*,\s*0?\.\d+\)/);
      }
      const screenshot = 'depth-' + theme + '-' + mode + '.png';
      await page.screenshot({ path: resolve(out, screenshot), fullPage: true, animations: 'disabled' });
      fallbacks.push({ theme, mode, simulated: mode === 'simulated-no-filter', baselineSolidStyling: before, screenshot, planes: computed });
      if (injected) await injected.evaluate(element => element.parentNode?.removeChild(element));
      await page.emulateMedia({ forcedColors: 'none' });
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      await cdp.detach();
      await expect(page.locator('html'), `${theme} survives media reset and CDP detach`).toHaveAttribute('data-theme', theme);
    }
    await page.locator('html').evaluate(element => {
      (element as HTMLElement).style.removeProperty('--plane-sheet-blur');
      (element as HTMLElement).style.removeProperty('--lab-sheet-filter');
    });

    const rings: Array<{ target: string; outline: string; screenshot: string }> = [];
    await expect(page.locator('html'), 'focus strip has its labelled theme').toHaveAttribute('data-theme', theme);
    for (const [name, target] of [
      ['More', page.locator('[data-project-more]')],
      ['sidebar', page.locator('app-sidebar a').first()],
      ['navigation', page.locator('[data-project-page-tab]').first()],
    ] as const) {
      await tabTo(page, target);
      const outline = await target.evaluate(element => getComputedStyle(element).outline);
      if (expectedRingColor !== null) expect(await target.evaluate(element => getComputedStyle(element).outlineColor)).toBe(expectedRingColor);
      const screenshot = 'depth-focus-' + theme + '-' + name + '.png';
      await page.screenshot({ path: resolve(out, screenshot), animations: 'disabled' });
      rings.push({ target: name, outline, screenshot });
    }
    await page.getByRole('button', { name: 'Insert at the end', exact: true }).click();
    const field = page.locator('[data-create-section-name]');
    await expect(field).toBeVisible();
    await tabTo(page, field);
    if (expectedRingColor !== null) expect(await field.evaluate(element => getComputedStyle(element).outlineColor)).toBe(expectedRingColor);
    const screenshot = 'depth-focus-' + theme + '-dialog.png';
    await page.screenshot({ path: resolve(out, screenshot), animations: 'disabled' });
    rings.push({ target: 'dialog field', outline: await field.evaluate(element => getComputedStyle(element).outline), screenshot });
    if (!before) {
      expect(new Set(rings.map(ring => ring.outline)).size).toBe(1);
      expect(rings[0].outline).not.toContain('none');
    }
    focus.push({ theme, expectedRingColor, rings });
    await context.close();
  }

  if (before) {
    await writeFile(resolve(out, 'depth-verification.json'), JSON.stringify({ commit, baseline: true, themeSelection: 'Device checked on entry, then explicitly locked with two observed top-bar toggles before CDP media checks', tokens, fallbacks, focus, cssFallback }, null, 2));
    return;
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'no-preference' });
  await configureContext(context);
  const page = await context.newPage();
  await page.goto('http://localhost:4200/prototype/design');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const topBar = page.locator('.top-bar');
  const original = await topBar.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.locator('#design-lab-paneAlpha').evaluate(element => {
    (element as HTMLInputElement).value = '20';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => topBar.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(original);
  const changed = await topBar.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.locator('#design-lab-solid-planes').check();
  expect(await topBar.evaluate(element => getComputedStyle(element).backdropFilter)).toBe('none');
  await page.locator('#design-lab-reduced-motion').check();
  const duration = await page.locator('[data-design-lab-motion]').evaluate(element => getComputedStyle(element).transitionDuration);
  expect(Math.max(...duration.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000)))).toBeLessThanOrEqual(80);
  await page.locator('[data-design-lab-reset]').click();
  expect(await topBar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(original);
  expect(await page.locator('html').evaluate(element => element.getAttribute('style') ?? '')).not.toContain('--plane-');
  const labScreenshot = 'depth-lab-light.png';
  await page.screenshot({ path: resolve(out, labScreenshot), fullPage: true, animations: 'disabled' });
  await page.goto('http://localhost:4200/app');
  await page.locator('[data-theme-toggle]').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const deviceScreenshot = 'depth-device-light-explicit-dark-reload.png';
  await page.screenshot({ path: resolve(out, deviceScreenshot), animations: 'disabled' });
  await page.goto('http://localhost:4200/settings');
  await page.locator('[data-settings-match-device]').check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await context.close();

  await writeFile(resolve(out, 'depth-verification.json'), JSON.stringify({
    commit, themeSelection: 'Device checked on entry, then explicitly locked with two observed top-bar toggles before CDP media checks', tokens, fallbacks, focus, cssFallback,
    lab: { directEntry: 'light', original, changed, reducedMotionDuration: duration, reset: true, screenshot: labScreenshot },
    deviceTheme: { emulated: 'light', persisted: 'dark', matchDeviceAfterReload: 'light', screenshot: deviceScreenshot },
  }, null, 2));
});
