import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { api, createRoot, seed, setClock, setPageEnabled } from '../seed';
import { SEED_NOW } from './matrix';
import { configureContext } from './isolation';

/**
 * Slice 81's alternatives specimens (R1, disposable, deleted at step 3). Step 1 holds the
 * specimens' smoke check in a real browser and the `showPopover({ source })` probe R2 asks for
 * before step 6 relies on it; step 2 adds the captures and the measurements R1 lists, written to
 * `ux-output/slice81-alternatives/index.json` for `build-navigation-alternatives.mjs`.
 * Run: `pnpm --filter web build`, then
 * `cd apps/e2e && pnpm exec playwright test --config ux/slice81-alternatives.config.ts`.
 */
const out = resolve('ux-output', 'slice81-alternatives');
const specimen = (option: string, at: string, extra = '') => `http://localhost:4200/prototype/navigation/${option}?at=${encodeURIComponent(at)}${extra}`;

type Width = 1440 | 1024 | 375;
type Theme = 'light' | 'dark';
const open = async (browser: Browser, width: Width, theme: Theme = 'light', forcedColors: 'active' | 'none' = 'none') => {
  const base = { timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce', colorScheme: theme, forcedColors } as const;
  const context = await browser.newContext(width === 375
    ? { ...base, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true }
    : { ...base, viewport: { width, height: 900 } });
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

// ---------------------------------------------------------------------------------------------
// Step 2: captures and measurements (R1, "Contexts" and "Measured per option and keyboard model").
// Run subsets with `--grep 'captures'`, `--grep 'measurements'`, then `--grep 'index'`.

const OPTIONS = ['a', 'b', 'c'] as const;
type Option = (typeof OPTIONS)[number];
type Keys = 'links' | 'tree';
type Shot = { context: string; option: Option; theme: Theme; width: Width; state: 'closed' | 'open'; file: string };

/** R1's contexts, grouped by the seed each needs. `archived-only` archives every root through the host API. */
const CONTEXTS = [
  { id: 'dashboard', seed: 'busy-week', at: '/app', shows: 'Workspace destination current; "Home" naming' },
  { id: 'many-roots', seed: 'busy-week', at: '/projects/project-launch', shows: 'Several roots, most collapsed' },
  { id: 'renovation-root', seed: 'nested-projects', at: '/projects/project-renovation', shows: "Root's first page; pages under a root", wide1024: true },
  { id: 'renovation-todos', seed: 'nested-projects', at: '/projects/project-renovation/pages/todos', shows: 'Another root page' },
  { id: 'kitchen', seed: 'nested-projects', at: '/projects/project-kitchen', shows: 'Depth 1; root-page scope (L7-020)' },
  { id: 'cabinets', seed: 'nested-projects', at: '/projects/project-cabinets', shows: 'Depth 2; breadcrumb ends at current' },
  { id: 'legacy-archived', seed: 'nested-projects', at: '/projects/project-legacy', shows: 'Archived current item (L7-008)' },
  { id: 'legacy-shelving', seed: 'nested-projects', at: '/projects/project-legacy-child', shows: 'Live work hidden under an archived parent, while current' },
  { id: 'settings-agents', seed: 'agent-heavy', at: '/settings/agents', shows: 'Settings child (L7-010)' },
  { id: 'archived-only', seed: 'archived-only', at: '/app', shows: '"No active projects. View archives"' },
  { id: 'empty', seed: 'empty', at: '/app', shows: 'No projects' },
] as const;

const shotDir = resolve(out, 'shots');
const loadSeed = async (name: string) => {
  if (name === 'archived-only') {
    await seed('nested-projects');
    await api.patch('/api/projects/project-renovation', { status: 'archived', archiveWorkstreamIds: ['project-kitchen', 'project-cabinets', 'project-garden'] });
  } else await seed(name);
  await setClock(SEED_NOW);
};

/** Opens a specimen and waits until no row is still loading. */
const visit = async (page: Page, option: string, at: string, extra = '') => {
  await page.goto(specimen(option, at, extra));
  await expect(page.locator('[data-specimen-heading]')).toBeVisible();
  await expect(page.locator('[data-specimen]')).not.toContainText(/Loading/);
  await page.evaluate(() => document.fonts.ready);
};
const atOf = (page: Page) => new URL(page.url()).searchParams.get('at');

test('captures: every context × option, light and dark, 1440 and 375 (Menu closed and open), renovation-root at 1024', async ({ browser }) => {
  await mkdir(shotDir, { recursive: true });
  const shots: Shot[] = [];
  const extras: Array<{ id: string; title: string; note: string; cells: Array<{ label: string; file: string }> }> = [];
  const take = async (page: Page, name: string) => { await expect(page.locator('[data-specimen]')).not.toContainText('Loading'); await page.screenshot({ path: resolve(shotDir, name), fullPage: false }); return `shots/${name}`; };
  for (const seedName of [...new Set(CONTEXTS.map((c) => c.seed))]) {
    await loadSeed(seedName);
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 1024, 375] as const) {
        const contexts = CONTEXTS.filter((c) => c.seed === seedName && (width !== 1024 || ('wide1024' in c && c.wide1024)));
        if (contexts.length === 0) continue;
        const { context, page, errors } = await open(browser, width, theme);
        for (const ctx of contexts) {
          for (const option of OPTIONS) {
            await visit(page, option, ctx.at);
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            const name = (state: string) => `${ctx.id}--${option}--${theme}-${width}-${state}.png`;
            shots.push({ context: ctx.id, option, theme, width, state: 'closed', file: await take(page, name('closed')) });
            if (width === 375) {
              await visit(page, option, ctx.at, '&menu=open');
              await expect(page.locator('#specimen-navigation')).toHaveAttribute('role', 'dialog');
              shots.push({ context: ctx.id, option, theme, width, state: 'open', file: await take(page, name('open')) });
            }
          }
        }
        expect(errors).toEqual([]);
        await context.close();
      }
    }
  }

  // Q4: the treeview's look beside the links model (focus shown on the current row).
  await loadSeed('nested-projects');
  {
    const { context, page } = await open(browser, 1440);
    const cells = [];
    for (const option of OPTIONS) for (const keys of ['links', 'tree'] as const) {
      await visit(page, option, '/projects/project-cabinets', `&keys=${keys}`);
      await page.locator('[data-specimen-nav] [aria-current="page"]').focus();
      cells.push({ label: `${option.toUpperCase()} · ${keys === 'tree' ? 'treeview (Q4 b)' : 'disclosure links (Q4 a)'}`, file: await take(page, `q4--${option}--${keys}.png`) });
    }
    extras.push({ id: 'q4', title: 'Q4 · Keyboard model', note: 'Cabinets at 1440, light, focus on the current row. The treeview has one Tab stop and chevrons drawn as decoration; the links model has a button per disclosure.', cells });
    // Q5: "Home" naming on the root's first page, option A.
    const q5 = [];
    for (const [home, label] of [['a', '(a) "Overview"'], ['b', '(b) dashboard "Dashboard"'], ['c', '(c) both "Home"'], ['d', '(d) no separate row (default)']] as const) {
      await visit(page, 'a', '/projects/project-renovation', `&home=${home}`);
      q5.push({ label, file: await take(page, `q5--${home}.png`) });
    }
    extras.push({ id: 'q5', title: 'Q5 · Does "Home" keep its name?', note: 'Home renovation\'s first page in option A, 1440 light.', cells: q5 });
    await context.close();
  }
  // Q16: a root opened but not current, options A and C. nested-projects plus a second root with
  // Todos and Archive enabled, so (b)'s read has optional pages to show.
  await loadSeed('nested-projects');
  {
    const second = await createRoot('Website launch');
    await setPageEnabled(second.id, 'todos', true);
    await setPageEnabled(second.id, 'archive', true);
    const { context, page } = await open(browser, 1440);
    const cells = [];
    for (const option of ['a', 'c'] as const) for (const [q16, label] of [['a', '(a) workstreams only'], ['b', '(b) read pages on expand (default)'], ['c', '(c) every page kind, no records']] as const) {
      await visit(page, option, '/projects/project-cabinets', `&q16=${q16}`);
      const toggle = page.locator('[data-specimen-nav]').getByRole('button', { name: 'Contents of Website launch' });
      if (await toggle.count() > 0 && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
      // (b) reads the pages on expand: in A, wait for the rows it brings.
      if (q16 === 'b' && option === 'a') await expect(page.locator(`[data-specimen-nav] [data-node-id="page:${second.id}:todos"]`)).toBeVisible();
      cells.push({ label: `${option.toUpperCase()} · ${label}`, file: await take(page, `q16--${option}--${q16}.png`) });
    }
    extras.push({ id: 'q16', title: 'Q16 · A root opened but not current', note: 'Cabinets (nested-projects) at 1440, light, with a second root, Website launch (Todos and Archive enabled, created for the capture), opened from its disclosure.', cells });
    await context.close();
  }
  // Forced colours: the current item at Cabinets.
  await loadSeed('nested-projects');
  {
    const { context, page } = await open(browser, 1440, 'light', 'active');
    const cells = [];
    for (const option of OPTIONS) { await visit(page, option, '/projects/project-cabinets'); cells.push({ label: option.toUpperCase(), file: await take(page, `forced--${option}.png`) }); }
    for (const option of ['c'] as const) { await visit(page, option, '/projects/project-renovation/pages/todos'); cells.push({ label: 'C · Todos (tab row current, tree location)', file: await take(page, `forced--c-todos.png`) }); }
    extras.push({ id: 'forced', title: 'Forced colours (Playwright forcedColors: active)', note: 'Cabinets at 1440. The current item must stay distinct without colour.', cells });
    await context.close();
  }
  await writeFile(resolve(out, 'captures.json'), JSON.stringify({ contexts: CONTEXTS, shots, extras }, null, 2));
});

/** Presses Tab (or Shift+Tab, when the target precedes focus) until the target has focus. */
const tabTo = async (page: Page, target: Locator) => {
  let presses = 0;
  for (; presses < 300; presses++) {
    const relation = await target.evaluate((node) => {
      const active = document.activeElement;
      if (node === active) return 'here';
      if (active === null || active === document.body) return 'after';
      return active.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING ? 'before' : 'after';
    });
    if (relation === 'here') return presses;
    await page.keyboard.press(relation === 'before' ? 'Shift+Tab' : 'Tab');
  }
  throw new Error('tabTo: target never took focus');
};
/** Inside a treeview: Tab to its one stop, then arrows to the target. */
const arrowTo = async (page: Page, target: Locator) => {
  const inTree = () => page.evaluate(() => document.activeElement?.closest('[role="tree"]') !== null && document.activeElement?.getAttribute('role') === 'treeitem');
  let presses = 0;
  if (!(await inTree())) presses += await tabTo(page, page.locator('[data-specimen-nav] [role="treeitem"][tabindex="0"]').first());
  for (let i = 0; i < 300; i++) {
    const delta = await target.evaluate((node) => {
      const items = [...document.querySelectorAll('[data-specimen-nav] [role="treeitem"]')];
      return items.indexOf(node) - items.indexOf(document.activeElement!);
    });
    if (delta === 0) return presses;
    await page.keyboard.press(delta > 0 ? 'ArrowDown' : 'ArrowUp');
    presses++;
  }
  throw new Error('arrowTo: target never took focus');
};

type Step = { activate: (page: Page) => Locator };
const nav = (page: Page) => page.locator('[data-specimen-nav]');
const node = (id: string) => (page: Page) => nav(page).locator(`[data-node-id="${id}"]`);
const rootNamed = (name: string) => (page: Page) => nav(page).locator('a[data-node-id^="project:"]', { hasText: name });
const tab = (name: string) => (page: Page) => page.locator('[data-specimen-page-tabs] a', { hasText: name });

/** The shortest route from Cabinets per option, as the specimen offers it. */
const routes = (option: Option, launchId: string): Record<'garden' | 'todos' | 'launch', { steps: Step[]; at: string }> => ({
  garden: { at: '/projects/project-garden', steps: [{ activate: node('project:project-garden') }] },
  todos: { at: '/projects/project-renovation/pages/todos', steps: [{ activate: option === 'c' ? tab('Todos') : node('page:project-renovation:todos') }] },
  launch: { at: `/projects/${launchId}`, steps: option === 'b' ? [{ activate: node('all-projects') }, { activate: rootNamed('Website launch') }] : [{ activate: rootNamed('Website launch') }] },
});

const walk = async (page: Page, steps: Step[], mode: 'click' | 'tap' | Keys) => {
  let count = 0;
  for (const step of steps) {
    const target = step.activate(page);
    if (mode === 'click' || mode === 'tap') {
      if (mode === 'tap' && await page.locator('[data-specimen-menu]').getAttribute('aria-expanded') === 'false' && !(await target.isVisible())) { await page.locator('[data-specimen-menu]').tap(); count++; }
      await (mode === 'tap' ? target.tap() : target.click());
      count++;
      continue;
    }
    const isTreeItem = mode === 'tree' && await target.getAttribute('role') === 'treeitem';
    count += isTreeItem ? await arrowTo(page, target) : await tabTo(page, target);
    await page.keyboard.press('Enter');
    count++;
  }
  return count;
};

test('measurements: activations, Tab counts, header share, path rows, small targets, axe, forced colours', async ({ browser }) => {
  await seed('nested-projects');
  await setClock(SEED_NOW);
  const launch = await createRoot('Website launch');
  const measurements: Record<string, Record<string, unknown>> = {};
  for (const option of OPTIONS) {
    measurements[option] = {};
    for (const keys of ['links', 'tree'] as const) {
      const m: Record<string, unknown> = {};
      const extra = `&keys=${keys}`;
      const r = routes(option, launch.id);
      // Activations from Cabinets.
      for (const [mode, width] of [['click', 1440], ['keys', 1440], ['tap', 375]] as const) {
        const { context, page, errors } = await open(browser, width);
        const result: Record<string, number> = {};
        for (const [name, route] of Object.entries(r)) {
          await visit(page, option, '/projects/project-cabinets', extra);
          result[name] = await walk(page, route.steps, mode === 'keys' ? keys : mode);
          await expect.poll(() => atOf(page)).toBe(route.at);
        }
        m[mode === 'click' ? 'clicks' : mode === 'keys' ? 'keys' : 'taps'] = result;
        expect(errors).toEqual([]);
        await context.close();
      }
      {
        const { context, page } = await open(browser, 1440);
        // Tab presses from load to the first content control, without and with the skip link.
        await visit(page, option, '/projects/project-cabinets', extra);
        const withoutSkip = await tabTo(page, page.locator('[data-specimen-first-content]'));
        await visit(page, option, '/projects/project-cabinets', extra);
        await page.keyboard.press('Tab');
        await expect(page.locator('[data-specimen-skip-link]')).toBeFocused();
        await page.keyboard.press('Enter');
        const withSkip = 2 + await tabTo(page, page.locator('[data-specimen-first-content]'));
        m['tabsToContent'] = { withoutSkip, withSkip };
        // Rows of the deepest path visible at 1440 without scrolling.
        m['deepestPath'] = { wide: await pathRows(page) };
        m['axe'] = await axe(page);
        await context.close();
      }
      {
        const { context, page } = await open(browser, 375);
        await visit(page, option, '/projects/project-cabinets', extra);
        const header = await box(page, '[data-specimen-header]');
        m['header375'] = { height: Math.round(header.height), bottom: Math.round(header.y + header.height), share: Number(((header.y + header.height) / 812).toFixed(3)) };
        const closedSmall = await smallTargets(page, '[data-specimen] > .specimen__bar, [data-specimen-header]');
        await visit(page, option, '/projects/project-cabinets', `${extra}&menu=open`);
        (m['deepestPath'] as Record<string, string>)['drawer'] = await pathRows(page);
        const openSmall = await smallTargets(page, '#specimen-navigation');
        m['smallTargets'] = { count: closedSmall.length + openSmall.length, names: [...closedSmall, ...openSmall] };
        const phoneAxe = await axe(page);
        const wide = m['axe'] as { serious: number; critical: number; rules: string[] };
        m['axe'] = { serious: wide.serious + phoneAxe.serious, critical: wide.critical + phoneAxe.critical, rules: [...new Set([...wide.rules, ...phoneAxe.rules])] };
        await context.close();
      }
      {
        const { context, page } = await open(browser, 1440, 'light', 'active');
        await visit(page, option, '/projects/project-cabinets', extra);
        m['forcedColours'] = await forcedDistinct(page);
        await context.close();
      }
      measurements[option][keys] = m;
    }
  }
  await writeFile(resolve(out, 'measurements.json'), JSON.stringify({ launchRoot: launch.id, measurements }, null, 2));
});

/** How many of Home renovation › Kitchen › Cabinets are on screen inside the navigation's visible area. */
const pathRows = (page: Page) => page.evaluate(() => {
  const ids = ['project:project-renovation', 'project:project-kitchen', 'project:project-cabinets'];
  const navigation = document.querySelector('#specimen-navigation')!.getBoundingClientRect();
  const visible = ids.filter((id) => {
    const row = document.querySelector(`[data-specimen-nav] [data-node-id="${id}"]`);
    if (row === null) return false;
    const r = row.getBoundingClientRect();
    return r.height > 0 && r.top >= Math.max(0, navigation.top) && r.bottom <= Math.min(innerHeight, navigation.bottom);
  });
  return `${visible.length}/${ids.length}`;
});
/** Interactive controls under 44 px in either dimension, inside the given regions. */
const smallTargets = (page: Page, selector: string) => page.evaluate((regions) => {
  const names: string[] = [];
  for (const region of document.querySelectorAll(regions)) {
    for (const control of region.querySelectorAll<HTMLElement>('a[href], button, [role="treeitem"], [tabindex="0"]')) {
      if (control.closest('[inert]') !== null) continue;
      const r = control.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 44 || r.height < 44) names.push(`${(control.getAttribute('aria-label') ?? control.textContent ?? '').trim().slice(0, 32)} (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
  }
  return names;
}, selector);
const axe = async (page: Page) => {
  const scan = await new AxeBuilder({ page }).include('[data-specimen]').options({ rules: { 'target-size': { enabled: true } } }).analyze();
  const bad = scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return {
    serious: bad.filter((v) => v.impact === 'serious').reduce((n, v) => n + v.nodes.length, 0),
    critical: bad.filter((v) => v.impact === 'critical').reduce((n, v) => n + v.nodes.length, 0),
    rules: bad.map((v) => v.id),
  };
};
/** Compares the current item's row with a non-current sibling's under forced colours. */
const forcedDistinct = (page: Page) => page.evaluate(() => {
  const current = document.querySelector('[data-specimen-nav] [aria-current="page"]')?.closest('.specimen-tree__row');
  const other = document.querySelector('[data-specimen-nav] [data-node-id="project:project-kitchen"]')?.closest('.specimen-tree__row');
  if (!current || !other) return { distinct: false, differs: ['current or comparison row missing'] };
  const props = ['background-color', 'color', 'border-left-style', 'border-left-width', 'border-left-color', 'outline-style', 'outline-width', 'text-decoration-line', 'font-weight'];
  const read = (row: Element) => {
    const link = row.querySelector('a')!;
    return Object.fromEntries(props.flatMap((p) => [[`row ${p}`, getComputedStyle(row).getPropertyValue(p)], [`link ${p}`, getComputedStyle(link).getPropertyValue(p)]]));
  };
  const a = read(current), b = read(other);
  const differs = Object.keys(a).filter((k) => a[k] !== b[k]);
  return { distinct: differs.length > 0, differs };
});

test('sheet index: merges the capture and measurement files', async ({ browser }) => {
  const { readFile } = await import('node:fs/promises');
  const captures = JSON.parse(await readFile(resolve(out, 'captures.json'), 'utf8'));
  const { measurements, launchRoot } = JSON.parse(await readFile(resolve(out, 'measurements.json'), 'utf8'));
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  await writeFile(resolve(out, 'index.json'), JSON.stringify({ commit, chromium: browser.version(), launchRoot, ...captures, measurements }, null, 2));
});
