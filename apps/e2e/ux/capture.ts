import { inventoryCoverage, validateMatrix } from './coverage';
import { runCoreTasks } from './tasks';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { seed, setClock, setLayout } from '../seed';
import { MATRIX, SEED_NOW, COVERAGE_GAPS, type CaptureCell } from './matrix';
// @ts-expect-error Small JS helper is also exercised directly by node:test.
import { collectEvidence } from './evidence.mjs';
// @ts-expect-error Browser-serializable helper is also exercised by node:test.
import { collectControls, collectPlaneBoxes } from './layout.mjs';

const commit = process.env['UX_BEFORE'] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
/** Only Slice 73's baseline predates the native details and confirmation lifts; it opened the inline More panel instead. */
const inlineMoreBaseline = process.env['UX_BEFORE'] === 'e56c7d7ca9f442b3d3dd6fd954e25ccee6d3ad78';
const out = resolve('ux-output', commit);
const escape = (s: string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
async function state(page: Page, cell: CaptureCell) {
  const button = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });
  if (['page-settings','work-create'].includes(cell.state)) {
    const show = button('Show project navigation');
    if (await show.isVisible()) await show.click();
  }
  switch (cell.state) {
    case 'more': await button('More project actions').click(); break;
    case 'project-details': case 'archive-confirm':
      await button('More project actions').click();
      if (!inlineMoreBaseline) await page.getByRole('menuitem', { name: cell.state === 'project-details' ? 'Edit details…' : /^Archive (project|workstream)…$/, exact: true }).click();
      break;
    case 'page-settings': await button('Project page settings for Home renovation').click(); break;
    case 'work-create': await button('Add workstream').click(); break;
    case 'section-create': case 'shortcut-picker':
      await button(process.env['UX_BEFORE'] ? 'Insert at the end' : 'Add a section').click();
      if (cell.state === 'shortcut-picker') await button('Add shortcut').click();
      break;
    case 'markdown-edit': await button(/^Edit Markdown for/).first().click(); break;
    case 'task-drawer': await button(/, open details$/).first().click(); break;
    case 'task-drawer-scrolled': {
      const title = button(/, open details$/).last();
      await title.scrollIntoViewIfNeeded();
      await title.click();
      break;
    }
    case 'collapsed': await button(/^Collapse /).first().click(); break;
    case 'remove-feedback': await button(/^Remove section /).first().click(); break;
    case 'refused':
      await page.route('**/api/projects/*/sections', route => route.request().method() === 'POST'
        ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'conflict', message: 'The insertion location is no longer available. Reload and retry.' }) }) : route.fallback());
      await button(process.env['UX_BEFORE'] ? 'Insert at the end' : 'Add a section').click(); await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
      // Scoped: the toasts' persistent live regions are alerts too (Slice 74).
      await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible(); break;
    case 'dev-panel': await page.keyboard.press('Control+Shift+D'); await expect(page.getByRole('heading', { name: 'Prototype controls' })).toBeVisible(); break;
    case 'new-project':
      if (await button('Menu').isVisible()) await button('Menu').click();
      await button('New project').click(); break;
    case 'phone-menu': await button('Menu').click(); break;
  }
}

test('capture matrix', async ({ browser }) => {
  await mkdir(out, { recursive: true });
  validateMatrix();
  await writeFile(resolve(out,'coverage.json'),JSON.stringify(await inventoryCoverage(),null,2));
  const index: Record<string, unknown>[] = process.env['UX_MATCH'] ? await readFile(resolve(out,'index.json'),'utf8').then(s => JSON.parse(s).cells).catch(error => { if (error.code === 'ENOENT') return []; throw error; }) : [];
  const selected = process.env['UX_SMOKE'] ? MATRIX.filter(c => ['empty-dashboard-dark-1440','nested-projects-project-light-375','kitchen-task-drawer-dark-1440'].includes(c.id)) : MATRIX.filter(c => !process.env['UX_MATCH'] || new RegExp(process.env['UX_MATCH']).test(c.id));
  for (const cell of selected) {
    await seed(cell.seed); await setClock(SEED_NOW);
    if (cell.state === 'grid') await setLayout('project-kitchen' as never, 'grid');
    const context = await browser.newContext({ viewport: cell.viewport, hasTouch: cell.viewport.width === 375, isMobile: cell.viewport.width === 375, colorScheme: cell.theme, timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce' });
    await configureContext(context);
    const page = await context.newPage();
    await page.clock.install({ time: new Date(SEED_NOW) });
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const record: Record<string, unknown> = { ...cell, commit, clock: SEED_NOW, status: 'failed' };
    if (inlineMoreBaseline && ['project-details', 'archive-confirm'].includes(cell.state)) record['baselineEquivalent'] = 'The pre-slice inline More panel; separate details and confirmation lifts do not exist at the baseline.';
    let release: (() => void) | undefined;
    try {
      // Initial settled page establishes persona and theme before inducing loading/error.
      await page.goto(`http://localhost:4200${cell.route}`);
      await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
      if (await page.locator('html').getAttribute('data-theme') !== cell.theme) await page.getByRole('button', { name: `Switch to the ${cell.theme} theme` }).click();
      await page.addStyleTag({ content: '*,*::before,*::after { animation:none!important; transition:none!important; caret-color:transparent!important }' });
      await page.waitForLoadState('networkidle');
      if (cell.state === 'loading' || cell.state === 'error') {
        const gate = new Promise<void>(r => { release = r; });
        await page.route('**/api/projects/project-kitchen', async route => {
          if (cell.state === 'loading') { await gate; await route.abort(); }
          else await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'Audit: project read failed' }) });
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByText(cell.state === 'loading' ? 'Loading project…' : 'Audit: project read failed', { exact: true })).toBeVisible();
        if (await page.locator('html').getAttribute('data-theme') !== cell.theme) await page.getByRole('button', { name: `Switch to the ${cell.theme} theme` }).click();
        record['networkIdleException'] = cell.state === 'loading' ? 'Deliberately held read, asserted loading text; cannot wait for idle.' : undefined;
      } else { await state(page, cell); await page.waitForLoadState('networkidle'); }
      Object.assign(record, await collectEvidence({
        screenshot: async () => { const file = `${cell.id}.png`; await page.screenshot({ path: resolve(out,file), fullPage: true, animations: 'disabled' }); return file; },
        axe: async () => { const file = `${cell.id}.axe.json`; const scan = await new AxeBuilder({ page }).options({ rules: { 'target-size': { enabled: true } } }).analyze(); for (const violation of scan.violations) for (const node of violation.nodes) {
          const selector=node.target.at(-1);
          if(typeof selector==='string') (node as typeof node & {stableAnchor?:string}).stableAnchor=await page.evaluate(selector=>{
            const element=document.querySelector(selector);if(!element)return selector;
            let anchor:Element|null=element;while(anchor&&!anchor.getAttributeNames().some(name=>name.startsWith('data-')))anchor=anchor.parentElement;
            const attributes=anchor?.getAttributeNames().filter(name=>name.startsWith('data-')).map(name=>name+'='+anchor!.getAttribute(name)).join('|')??selector;
            return attributes+'|'+(element.getAttribute('aria-label')??element.textContent?.trim().slice(0,80));
          },selector).catch(()=>selector);
        } await writeFile(resolve(out,file), JSON.stringify(scan,null,2)); return file; },
        tree: async () => { const file = `${cell.id}.aria.yml`; await writeFile(resolve(out,file), await page.locator('body').ariaSnapshot()); return file; },
        console: async () => { const file = `${cell.id}.console.json`; await writeFile(resolve(out,file), JSON.stringify(consoleErrors,null,2)); return file; },
        scrolls: async () => {
          const files: string[] = [];
          const regions = page.locator('main.workspace,.project-workspace__main');
          for(let r=0;r<await regions.count();r++){
            const region=regions.nth(r); const size=await region.evaluate(e=>({height:e.clientHeight,total:e.scrollHeight,overflow:getComputedStyle(e).overflowY}));
            if(!['auto','scroll'].includes(size.overflow)||size.total<=size.height)continue;
            for(let y=size.height*.8, n=1;y<size.total && n<=16;y+=size.height*.8,n++){
              await region.evaluate((e,top)=>{e.scrollTop=top;},y);
              const file=`${cell.id}.scroll-${r}-${n}.png`;
              await page.screenshot({path:resolve(out,file),animations:'disabled'});files.push(file);
            }
            await region.evaluate(e=>{e.scrollTop=0;});
          } return files;
        },
        layout: async () => { const file = `${cell.id}.layout.json`; const planes = await page.evaluate(collectPlaneBoxes); const metrics = await page.evaluate(() => ({
          viewport: innerWidth, document: document.documentElement.scrollWidth,
          sectionContents: [...document.querySelectorAll('[data-section-content]')].map(e => { const r = e.getBoundingClientRect(); return { id: e.closest('[data-section-id]')?.getAttribute('data-section-id'), x: r.x, y: r.y, width: r.width, height: r.height }; }),
          scrollRegions: [...document.querySelectorAll('main.workspace,.project-workspace__main,[data-task-drawer]')].map(e => ({ tag: e.tagName, class: e.className, width: e.clientWidth, scrollWidth: e.scrollWidth, height: e.clientHeight, scrollHeight: e.scrollHeight })),
        })); const controls = await page.evaluate(collectControls); await writeFile(resolve(out,file), JSON.stringify({ ...metrics, controls, planes },null,2)); return file; },
      }));
    } catch (error) { record['error'] = String(error); }
    finally {
      release?.(); const prior = index.findIndex(r=>r['id']===cell.id); if(prior>=0)index.splice(prior,1); index.push(record);
      await writeFile(resolve(out,'index.json'), JSON.stringify({ commit, capturedWorkingTree: true, cells:index, gaps:COVERAGE_GAPS },null,2));
      await context.close();
    }
    console.log(`${record['status']}: ${cell.id}`);
  }
  const cards = index.map(r => { const a = r['artifacts'] as { screenshot?: string } | undefined; return `<figure><a href="${a?.screenshot ?? '#'}">${a?.screenshot ? `<img loading="lazy" src="${a.screenshot}" alt="${escape(String(r['id']))}">` : '<p>Capture failed</p>'}</a><figcaption>${escape(String(r['id']))}<br>${escape(String(r['status']))}</figcaption></figure>`; }).join('');
  await writeFile(resolve(out,'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Canvas — Gate 0 baseline</title><style>body{font:16px system-ui;background:#111820;color:#eef3f7;margin:32px}h1{font-size:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}figure{margin:0;padding:12px;background:#202a35;border-radius:12px}img{width:100%;height:230px;object-fit:contain;object-position:top}figcaption{margin-top:12px;overflow-wrap:anywhere}a{color:inherit}p{max-width:80ch}</style><h1>Canvas / before the redesign</h1><p>Gate 0 · ${index.length} selected cells · commit ${commit.slice(0,8)} plus capture tooling. Both themes, all six seeds, three widths. Click an image for full resolution. This is evidence, not an approved inventory.</p><p>${COVERAGE_GAPS.map(g=>escape(g.surface+': '+g.reason)).join('<br>')}</p><a href="index.json">Evidence index</a><main>${cards}</main></html>`);
  expect(index.filter(r => r['status'] !== 'captured'), 'every selected cell has all evidence').toEqual([]);
});



 test('core task baseline', async ({ browser }) => { test.skip(Boolean(process.env['UX_SMOKE'])); await runCoreTasks(browser, resolve(out, 'tasks')); });


