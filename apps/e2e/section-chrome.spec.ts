import { test, expect } from '@playwright/test';
import { seed, setClock, setLayout, createRoot, addSection } from './seed';
import { configureContext } from './ux/isolation';
import { SEED_NOW } from './ux/matrix';
test.beforeEach(async ({ context }) => { await configureContext(context); await seed('nested-projects'); await setClock(SEED_NOW); });
for (const theme of ['dark','light'] as const) test.describe(`Section chrome ${theme}`,()=>{
  test.use({colorScheme:theme});
  test('plain named headings and roving tools retain rename focus',async({page})=>{
    await page.goto('/projects/project-kitchen');
    const frame=page.getByRole('region',{name:'Markdown',exact:true}).first();
    await expect(frame.getByRole('heading',{name:'Markdown',exact:true,level:2})).toBeVisible();
    const toolbar=frame.getByRole('toolbar',{name:'Markdown tools'});
    await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1);
    const rename=toolbar.getByRole('button',{name:'Rename Markdown',exact:true});
    await rename.focus();await page.keyboard.press('ArrowLeft');
    await expect(toolbar.getByRole('button',{name:'Remove section Markdown',exact:true})).toBeFocused();
    await page.keyboard.press('Home');await expect(rename).toBeFocused();await rename.click();
    const input=frame.locator('input');await expect(input).toHaveValue('Markdown');
    expect(await input.evaluate(e=>[(e as HTMLInputElement).selectionStart,(e as HTMLInputElement).selectionEnd])).toEqual([0,8]);
    await input.press('Escape');await expect(rename).toBeFocused();
  });
  test('persistent add is outside the drop list and reveals the created heading',async({page})=>{
    await page.goto('/projects/project-kitchen');const add=page.getByRole('button',{name:'Add a section',exact:true});
    expect(await add.evaluate(e=>e.closest('.cdk-drop-list')===null)).toBe(true);await add.click();
    await page.getByRole('dialog').getByRole('textbox').fill('Chrome test');await page.getByRole('dialog').getByRole('button',{name:'Create',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Chrome test',exact:true})).toBeFocused();
  });
  test('collapse paints within100ms under a delayed write and refusal stays on its frame',async({page})=>{
    let refuse=false;
    await page.route('**/api/sections/*',async route=>{if(route.request().method()==='PATCH'){await new Promise(r=>setTimeout(r,2000));if(refuse){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'rule_violation',message:'Chrome refusal'})});return;}}await route.fallback();});
    await page.goto('/projects/project-kitchen');const frame=page.getByRole('region',{name:'Markdown',exact:true}).first();const runs:number[]=[];
    for(let i=0;i<5;i++){
      runs.push(await frame.getByRole('button',{name:/^Collapse /}).evaluate(button=>new Promise<number>(done=>{const start=performance.now();const observer=new MutationObserver(()=>{if(button.getAttribute('aria-expanded')==='false'){observer.disconnect();done(performance.now()-start);}});observer.observe(button,{attributes:true});setTimeout(()=>{observer.disconnect();done(4000);},4000);(button as HTMLButtonElement).click();})));
      await expect(frame).toHaveAttribute('aria-busy','true');await expect(frame.locator('[data-section-content]')).toHaveCount(0);await page.waitForTimeout(2200);
      await frame.getByRole('button',{name:/^Expand /}).click();await page.waitForTimeout(2200);
    }
    expect(Math.max(...runs)).toBeLessThan(100);refuse=true;await frame.getByRole('button',{name:/^Collapse /}).click();
    await expect(frame.getByRole('alert')).toContainText("Couldn't collapse");await expect(frame.locator('[data-section-content]')).toBeVisible();await expect(page.locator('[data-section-error]')).toHaveCount(0);
  });
  test('grid grip moves onUp/Down and roves onLeft/Right',async({page})=>{
    await setLayout('project-kitchen' as never,'grid');await page.goto('/projects/project-kitchen');const grip=page.getByRole('button',{name:'Move Markdown',exact:true}).first();
    await grip.focus();await page.keyboard.press('ArrowRight');await expect(grip).not.toBeFocused();await grip.focus();await page.keyboard.press('ArrowDown');await expect(grip).toBeFocused();await expect(grip).toHaveAttribute('tabindex','0');
  });
});
test.describe('Section chrome touch',()=>{
  test.use({viewport:{width:375,height:812},hasTouch:true,isMobile:true});
  test('a title tap leaves rename to the explicit tool',async({page})=>{
    await page.goto('/projects/project-kitchen');const frame=page.getByRole('region',{name:'Markdown',exact:true}).first();await frame.getByRole('heading',{name:'Markdown',exact:true,level:2}).tap();await expect(frame.locator('input')).toHaveCount(0);
    await frame.getByRole('button',{name:'Rename Markdown',exact:true}).tap();await expect(frame.locator('input')).toHaveValue('Markdown');
  });
});

test('each insertion mark owns its full painted plus at rest and focus',async({page})=>{
  const root=await createRoot('Grid mark hit areas');await setLayout(root.id,'grid');
  for(const [title,columnSpan] of [['First six',6],['Second six',6],['First eight',8],['Second eight',8]] as const)await addSection(root.id,{type:'markdown',title,columnSpan});
  await page.goto(`/projects/${root.id}`);await expect(page.locator('app-insertion-point[data-insertion-point=gap]')).not.toHaveCount(0);const marks=page.locator('[data-insertion-point-button]:not([data-canvas-add])');
  for(let index=0;index<await marks.count();index++)for(const active of [false,true]){
    const mark=marks.nth(index);if(!await mark.isVisible())continue;
    await mark.evaluate(e=>e.scrollIntoView({block:'center'}));
    if(active){await mark.focus();await mark.press('ArrowLeft');}else {await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();});await page.mouse.move(1,1);}
    expect(await mark.evaluate(button=>{const r=button.querySelector('app-icon')!.getBoundingClientRect();return Array.from({length:9},(_,i)=>{const a=(i-1)*Math.PI/4;return document.elementFromPoint(r.x+r.width/2+(i?Math.cos(a)*r.width*.4:0),r.y+r.height/2+(i?Math.sin(a)*r.height*.4:0))?.closest('button')===button;});})).toEqual(Array(9).fill(true));
  }
});

for (const touch of [false, true]) test.describe(touch ? 'Chrome at 375 touch' : 'Chrome at 1440', () => {
  test.use({ viewport: { width: touch ? 375 : 1440, height: touch ? 812 : 900 }, hasTouch: touch, isMobile: touch });
  for (const theme of ['dark', 'light'] as const) test(`all names, rest emphasis, muted danger ink and tool hit areas (${theme})`, async ({ page }) => {
    await page.goto('/projects/project-kitchen');
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to the ${theme} theme` }).click();
    await page.mouse.move(1, 1);
    for (const frame of await page.locator('[data-section-frame]').all()) {
      const heading = frame.locator('[data-section-title]'); const name = (await heading.textContent())!.trim();
      await expect(frame).toHaveAccessibleName(name); await expect(heading).toHaveAccessibleName(name);
      const tools = frame.getByRole('toolbar').locator('button');
      for (const tool of await tools.all()) {
        const facts = await tool.evaluate(tool => { let opacity = 1; for (let e: Element | null = tool; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity); return { opacity, expected: Number(getComputedStyle(tool).getPropertyValue('--canvas-chrome-rest-opacity')) }; });
        expect(facts.opacity).toBeCloseTo(facts.expected, 4);
      }
      const remove = frame.locator('[data-section-remove]');
      expect(await remove.evaluate(e => getComputedStyle(e).color)).toBe(await frame.locator('[data-section-drag-handle]').evaluate(e => getComputedStyle(e).color));
      await frame.scrollIntoViewIfNeeded(); await tools.first().focus();
      for (const tool of await tools.all()) { await tool.scrollIntoViewIfNeeded(); expect(await tool.evaluate(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true); }
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur()); await page.mouse.move(1, 1);
    }
    const marks = page.locator('[data-insertion-point-button]');
    for (const mark of await marks.all()) for (const active of [false, true]) {
      if (!await mark.isVisible()) continue; await mark.evaluate(e => e.scrollIntoView({ block: 'center' }));
      if (active) { await mark.focus(); await mark.press('ArrowLeft'); } else { await page.evaluate(() => (document.activeElement as HTMLElement)?.blur()); await page.mouse.move(1, 1); }
      expect(await mark.evaluate(button => { const r = button.querySelector('app-icon')!.getBoundingClientRect(); return Array.from({ length: 9 }, (_, i) => { const a = (i - 1) * Math.PI / 4; return document.elementFromPoint(r.x + r.width / 2 + (i ? Math.cos(a) * r.width * .4 : 0), r.y + r.height / 2 + (i ? Math.sin(a) * r.height * .4 : 0))?.closest('button') === button; }); })).toEqual(Array(9).fill(true));
    }
  });
});

for (const layout of ['flow', 'grid'] as const) for (const fixture of [['nested-projects', 'project-kitchen'], ['overdue-chaos', 'project-client-migration']] as const) test(`${fixture[0]} ${layout}: at most two chrome stops before content and three per section`, async ({ page }) => {
  await seed(fixture[0]); await setLayout(fixture[1] as never, layout); await page.goto(`/projects/${fixture[1]}`);
  await page.locator('[data-insertion-point-button]').first().focus();
  const stops: { section: string | null; kind: string; content: boolean }[] = [];
  for (let index = 0; index < 400; index++) {
    const stop = await page.evaluate(() => { const e = document.activeElement as HTMLElement; const item = e.closest('[data-section-item]'); return { section: item?.getAttribute('data-section-id') ?? null, kind: e.closest('app-insertion-point')?.getAttribute('data-insertion-point') ?? (e.matches('[role=slider]') ? 'resize' : e.closest('[role=toolbar]') ? 'toolbar' : 'content'), content: Boolean(e.closest('[data-section-content]')) }; });
    if (index > 0 && !await page.evaluate(() => Boolean(document.activeElement?.closest('[data-section-canvas]')))) break;
    stops.push(stop); await page.keyboard.press('Tab');
  }
  const ids = [...new Set(stops.map(stop => stop.section).filter(Boolean))];
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) { const section = stops.filter(stop => stop.section === id && stop.kind !== 'gap'); const chrome = section.filter(stop => !stop.content); expect(chrome.length).toBeLessThanOrEqual(3); const firstContent = section.findIndex(stop => stop.content); if (firstContent >= 0) expect(section.slice(0, firstContent).filter(stop => !stop.content).length).toBeLessThanOrEqual(2); }
  test.info().annotations.push({ type: 'gap-stops', description: String(stops.filter(stop => stop.kind === 'gap').length) });
});

test('resize handles own their borders without taking the neighbour across a grid gap', async ({ page }) => {
  const root = await createRoot('Chrome resize geometry'); await setLayout(root.id, 'grid');
  const left = await addSection(root.id, { type: 'markdown', title: 'Left', columnSpan: 6 });
  const right = await addSection(root.id, { type: 'markdown', title: 'Right', columnSpan: 6 });
  await page.goto(`/projects/${root.id}`);
  const leftItem = page.locator(`[data-section-item][data-section-id="${left.id}"]`), rightItem = page.locator(`[data-section-item][data-section-id="${right.id}"]`);
  await leftItem.hover(); await rightItem.hover();
  const facts = await page.evaluate(({ left, right }) => {
    const a = document.querySelector(`[data-section-item][data-section-id="${left}"]`)!, b = document.querySelector(`[data-section-item][data-section-id="${right}"]`)!;
    const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect(), y = ar.top + ar.height / 2;
    const end = a.querySelector('app-section-resize-handle[data-edge=end] [data-resize-handle]')!, start = b.querySelector('app-section-resize-handle[data-edge=start] [data-resize-handle]')!;
    const hit = (e: Element, x: number) => e.contains(document.elementFromPoint(x, y));
    return { width: end.getBoundingClientRect().width, inside: [1, 5].flatMap(n => [hit(end, ar.right - n), hit(start, br.left + n)]), gap: Array.from({ length: Math.ceil(br.left - ar.right) }, (_, i) => { const x = ar.right + i + .5; return { side: x < (ar.right + br.left) / 2 ? 'left' : 'right', left: hit(end, x), right: hit(start, x) }; }) };
  }, { left: left.id, right: right.id });
  expect(facts.width).toBeGreaterThanOrEqual(24); expect(facts.inside).toEqual([true, true, true, true]);
  expect(facts.gap.every(point => point.side === 'left' ? !point.right : !point.left)).toBe(true);
});

test('a failed collapse owes one quiet read and the read can confirm it committed', async ({ page }) => {
  await page.goto('/projects/project-kitchen'); await page.waitForLoadState('networkidle'); let reads = 0;
  await page.route('**/api/projects/project-kitchen/sections**', async route => { if (route.request().method() === 'GET') reads++; await route.fallback(); });
  await page.route('**/api/sections/*', async route => { if (route.request().method() !== 'PATCH') { await route.fallback(); return; } const response = await route.fetch({ url: route.request().url().replace('http://localhost:4310',process.env['CWM_E2E_HOST'] ?? 'http://127.0.0.1:4310').replace('http://127.0.0.1:4310',process.env['CWM_E2E_HOST'] ?? 'http://127.0.0.1:4310') }); expect(response.ok()).toBe(true); await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'Lost response after commit' }) }); });
  const frame = page.getByRole('region', { name: 'Markdown', exact: true }).first(); await frame.getByRole('button', { name: 'Collapse Markdown', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'Expand Markdown', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => reads).toBeGreaterThanOrEqual(1); await page.waitForLoadState('networkidle'); await expect(frame.getByRole('button', { name: 'Expand Markdown', exact: true })).toHaveAttribute('aria-expanded', 'false'); await expect(frame.getByRole('alert')).toHaveCount(0);
});

test('prototype failure injection refuses collapse on that frame', async ({ page }) => {
  await page.goto('/projects/project-kitchen'); await expect(page.getByRole('region', { name: 'Markdown', exact: true }).first()).toBeVisible(); await page.waitForLoadState('networkidle'); await page.keyboard.press('Control+Shift+D');
  await page.locator('[data-panel-failure][data-rate="1"]').click(); await page.locator('[data-dev-panel-close]').click();
  const frame = page.getByRole('region', { name: 'Markdown', exact: true }).first(); await frame.getByRole('button', { name: 'Collapse Markdown', exact: true }).click();
  await expect(frame.getByRole('alert')).toContainText('prototype failure injection'); await expect(page.locator('[data-section-error]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+D'); await page.locator('[data-panel-failure][data-rate="0"]').click(); await page.locator('[data-dev-panel-close]').click();
});


test('sorting hides insertion and add, then a refused keyboard move restores order and active grip', async ({ page }) => {
  const root = await createRoot('Chrome sorting'); await setLayout(root.id, 'grid');
  const a = await addSection(root.id, { type: 'markdown', title: 'First', columnSpan: 6 });
  const b = await addSection(root.id, { type: 'markdown', title: 'Second', columnSpan: 6 });
  await page.goto(`/projects/${root.id}`);
  const grip = page.getByRole('button', { name: 'Move First', exact: true }); const box = await grip.boundingBox();
  if (!box) throw new Error('Move grip has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 3 });
  await expect(page.locator('.cdk-drop-list-dragging')).toHaveCount(1);
  const add = page.locator('[data-canvas-add]'); await expect(add).toHaveAttribute('inert', '');
  expect(await add.evaluate(e => getComputedStyle(e).visibility)).toBe('hidden');
  for (const mark of await page.locator('app-insertion-point').all()) expect(await mark.evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none');
  await page.mouse.up();
  await page.route('**/api/sections/*/move', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'conflict', message: 'Move refused' }) }));
  await grip.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-section-error]')).toContainText('Move refused');
  await expect.poll(() => page.locator('[data-section-item]').evaluateAll(items => items.map(item => item.getAttribute('data-section-id')))).toEqual([a.id, b.id]);
  await expect(grip).toBeFocused(); await expect(grip).toHaveAttribute('tabindex', '0');
});
