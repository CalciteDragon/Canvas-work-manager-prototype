import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { seed, setClock, setLayout, api } from '../seed';
import { SEED_NOW } from './matrix';

const commit = process.env['UX_BEFORE'] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve('ux-output', commit);
/** Browser measurements are deliberately observations on both builds, not assertions against the baseline. */
export async function chromeFacts(page: Page) {
  return page.evaluate(() => {
    const opacity = (element: Element | null): number => element ? Number(getComputedStyle(element).opacity) * opacity(element.parentElement) : 1;
    const box = (element: Element) => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; };
    const contrast = (tool: Element) => {
      const token=getComputedStyle(document.documentElement).getPropertyValue('--plane-sheet-solid').trim();
      const background=token.startsWith('#')?[1,3,5].map(i=>parseInt(token.slice(i,i+2),16)):[255,255,255];
      const ink=(getComputedStyle(tool).color.match(/[\d.]+/g)??[]).slice(0,3).map(Number);const alpha=opacity(tool);
      const color=ink.map((v,i)=>v*alpha+background[i]!*(1-alpha));
      const lum=(rgb:number[])=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i]!,0);
      return {ratio:(Math.max(lum(color),lum(background))+.05)/(Math.min(lum(color),lum(background))+.05),backing:token,method:'effective opacity composited over solid sheet token; reported only'};
    };
    const name = (e: Element) => e.getAttribute('aria-label') || e.textContent?.trim();
    const frames = [...document.querySelectorAll('[data-section-id], [data-shortcut-id]')].filter(e => e.querySelector('h2'));
    return {
      restToken: getComputedStyle(document.documentElement).getPropertyValue('--canvas-chrome-rest-opacity').trim(),
      frames: frames.map(frame => {
        const title = frame.querySelector('h2')!;
        const content = frame.querySelector('[data-section-content], [data-shortcut-content]');
        const icon = title.querySelector('app-icon') ?? title;
        return { id: frame.getAttribute('data-section-id') || frame.getAttribute('data-shortcut-id'), heading: title.textContent?.trim(),
          headingButton: title.querySelector('button')?.getAttribute('aria-label') ?? null,
          regionLabelledby: frame.querySelector('section')?.getAttribute('aria-labelledby'),
          titleOffset: content ? icon.getBoundingClientRect().left - content.getBoundingClientRect().left : null,
          content: content ? box(content) : null,
          tools: [...frame.querySelectorAll('header button, [role=toolbar] button, [role=slider]')].map(tool => ({ name: name(tool), opacity: opacity(tool), color: getComputedStyle(tool).color, contrast: contrast(tool), box: box(tool), tabIndex: (tool as HTMLElement).tabIndex, icon: tool.querySelector('app-icon')?.getAttribute('ng-reflect-name') ?? tool.querySelector('app-icon')?.innerHTML })),
        };
      }),
      marks: [...document.querySelectorAll('[data-insertion-point-button]:not([data-canvas-add])')].map(button => {
        const glyph = button.querySelector('app-icon')!; const r = glyph.getBoundingClientRect();
        return { name: name(button), opacity: opacity(button), box: box(button), glyph: box(glyph), points: Array.from({ length: 9 }, (_, i) => {
          const angle = (i - 1) * Math.PI / 4; const x = r.x + r.width / 2 + (i ? Math.cos(angle) * r.width * .4 : 0); const y = r.y + r.height / 2 + (i ? Math.sin(angle) * r.height * .4 : 0);
          return { x, y, hit: document.elementFromPoint(x, y)?.closest('button') === button };
        }) };
      }),
      add: [...document.querySelectorAll('button')].filter(e => e.textContent?.trim() === 'Add a section').map(e => ({ opacity: opacity(e), box: box(e) })),
    };
  });
}


/** Scroll every target into the viewport before elementFromPoint, including below-fold marks. */
async function hitMap(page: Page, active: boolean) {
  const result: unknown[] = [];
  const buttons=page.locator('[data-insertion-point-button]:not([data-canvas-add])');
  for(let index=0;index<await buttons.count();index++) {
    const button=buttons.nth(index);
    if(!await button.isVisible())continue;
    await button.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));
    if(active){await button.focus();await button.press('ArrowLeft');}else { await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();});await page.mouse.move(1,1); }
    result.push(await button.evaluate((button,active)=>{
      const glyph=button.querySelector('app-icon')!;const r=glyph.getBoundingClientRect();
      return {name:button.getAttribute('aria-label'),active,glyph:{width:r.width,height:r.height},points:Array.from({length:9},(_,i)=>{
        const a=(i-1)*Math.PI/4,x=r.x+r.width/2+(i?Math.cos(a)*r.width*.4:0),y=r.y+r.height/2+(i?Math.sin(a)*r.height*.4:0);
        return {x,y,hit:document.elementFromPoint(x,y)?.closest('button')===button};
      })};
    },active));
  }
  return result;
}

test('Section chrome runtime evidence', async ({ browser }) => {
  test.skip(!process.env['UX_CHROME']);
  await mkdir(out, { recursive: true });
  const entries: Record<string, unknown>[] = process.env['UX_CHROME_MATCH'] ? JSON.parse(await readFile(resolve(out,'chrome-verification.json'),'utf8')).entries : [];
  const key=(entry:Record<string,unknown>)=>[entry['project'],entry['layout']??'flow',entry['theme'],entry['width']].join('|');
  for (const fixture of [
    { seed: 'nested-projects', project: 'project-kitchen', layout: 'flow' },
    { seed: 'nested-projects', project: 'project-kitchen', layout: 'grid' },
    { seed: 'overdue-chaos', project: 'project-client-migration' },
    { seed: 'nested-projects', project: 'project-renovation/pages/home' },
  ]) for (const [theme, width] of [['dark', 1440], ['light', 1440], ['light', 375]] as const) {
    if(process.env['UX_CHROME_MATCH'] && !new RegExp(process.env['UX_CHROME_MATCH']).test([fixture.project,fixture.layout??'flow',theme,width].join('|')))continue;
    await seed(fixture.seed); await setClock(SEED_NOW);
    if (fixture.layout === 'grid') {
      await setLayout('project-kitchen' as never, 'grid');
      const sections=await api.get<{id:string}[]>('/api/projects/project-kitchen/sections');
      for(const section of sections.slice(0,2))await api.patch('/api/sections/'+section.id,{columnSpan:6});
      for(const section of sections.slice(2,4))await api.patch('/api/sections/'+section.id,{columnSpan:8});
    }
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, hasTouch: width === 375, isMobile: width === 375, colorScheme: theme, reducedMotion: 'reduce' });
    await configureContext(context);
    const page = await context.newPage();
    const entry: Record<string, unknown> = { ...fixture, theme, width };
    try {
      await page.goto(`http://localhost:4200/projects/${fixture.project}`);
      await page.locator('[data-section-canvas]').waitFor();
      await page.waitForLoadState('networkidle');
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to the ${theme} theme` }).click();
      await page.mouse.move(1, 1); await page.locator('body').click({ position: { x: 1, y: 1 } });
      entry['rest'] = await chromeFacts(page);
      if(fixture.layout==='grid' && width===1440)entry['resize']=await page.evaluate(()=>{
        const items=[...document.querySelectorAll('[data-section-item]')].slice(0,2),a=items[0]!,b=items[1]!;
        const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
        const end=a.querySelector('app-section-resize-handle[data-edge=end] [data-resize-handle]')!,start=b.querySelector('app-section-resize-handle[data-edge=start] [data-resize-handle]')!;
        const er=end.getBoundingClientRect(),sr=start.getBoundingClientRect(),ey=er.y+er.height/2,sy=sr.y+sr.height/2;
        const hit=(e:Element,x:number,y:number)=>e.contains(document.elementFromPoint(x,y));
        return {width:er.width,inside:[1,5].flatMap(n=>[hit(end,ar.right-n,ey),hit(start,br.left+n,sy)]),gap:Array.from({length:Math.ceil(br.left-ar.right)},(_,i)=>{const x=ar.right+i+.5;return x<(ar.right+br.left)/2?!hit(start,x,ey):!hit(end,x,sy);})};
      });
      entry['aria'] = await page.locator('[data-section-canvas]').ariaSnapshot();
      entry['screenshot'] = `chrome-rest-${fixture.project.replaceAll('/', '-')}-${fixture.layout ?? 'flow'}-${theme}-${width}.png`;
      await page.screenshot({ path: resolve(out, String(entry['screenshot'])), animations: 'disabled' });
      const first = page.locator('[data-insertion-point-button]:not([data-canvas-add])').first();
      if (await first.count()) { await first.focus(); entry['active'] = await chromeFacts(page); }
      const stops: unknown[] = [];
      for (let i = 0; i < 400; i++) {
        if(i > 0 && !await page.evaluate(()=>Boolean(document.activeElement?.closest('[data-section-canvas]'))))break;
        stops.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; return { name: e.getAttribute('aria-label') || e.textContent?.trim().slice(0, 80), section: e.closest('[data-section-id]')?.getAttribute('data-section-id'), content: Boolean(e.closest('[data-section-content], [data-shortcut-content]')), kind: e.closest('app-insertion-point')?.getAttribute('data-insertion-point') ?? (e.matches('[role=slider]') ? 'resize' : e.closest('[role=toolbar]') ? 'toolbar' : 'content'), tag: e.tagName }; }));
        await page.keyboard.press('Tab');
      }
      entry['tabWalk'] = stops;
      entry['restHitMap'] = await hitMap(page,false);
      for(const active of [false,true]) {
        const maps=active?await hitMap(page,true):entry['restHitMap'];
        if(active)entry['activeHitMap']=maps;
        const last=(maps as {points:{x:number;y:number;hit:boolean}[]}[]).at(-1);
        if(last) {
          await page.evaluate(points=>{
            const layer=document.createElement('div');layer.id='chrome-hit-overlay';layer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647';
            for(const point of points){const dot=document.createElement('span');dot.style.cssText='position:absolute;width:6px;height:6px;border-radius:50%;border:1px solid white;background:'+(point.hit?'#00a86b':'#e33')+';left:'+(point.x-3)+'px;top:'+(point.y-3)+'px';layer.append(dot);}document.body.append(layer);
          },last.points);
          const field=active?'hitScreenshot':'restHitScreenshot';
          entry[field]='chrome-hit-'+fixture.project.replaceAll('/','-')+'-'+(fixture.layout??'flow')+'-'+theme+'-'+width+'-'+(active?'active':'rest')+'.png';
          await page.screenshot({path:resolve(out,String(entry[field]))});await page.locator('#chrome-hit-overlay').evaluate(e=>e.remove());
        }
      }
      if(fixture.project === 'project-kitchen' && fixture.layout === 'flow') {
        await page.route('**/api/sections/*',async route=>{if(route.request().method()==='PATCH')await new Promise(r=>setTimeout(r,2000));await route.fallback();});
        const runs:(number|null)[]=[];
        for(let run=0;run<5;run++) {
          const collapse=page.getByRole('button',{name:/^Collapse /}).first();
          await collapse.scrollIntoViewIfNeeded();
          const timing=collapse.evaluate(button=>new Promise<number|null>(done=>{
            const start=performance.now();const observer=new MutationObserver(()=>{if(button.getAttribute('aria-expanded')==='false'){observer.disconnect();done(performance.now()-start);}});
            observer.observe(button,{attributes:true});setTimeout(()=>{observer.disconnect();done(null);},3500);(button as HTMLButtonElement).click();
          }));
          if(run===0) {await page.waitForTimeout(100);entry['pendingScreenshot']='chrome-collapse-'+theme+'-'+width+'.png';await page.screenshot({path:resolve(out,String(entry['pendingScreenshot']))});}
          runs.push(await timing);await page.waitForTimeout(2200);
          await page.getByRole('button',{name:/^Expand /}).first().click();await page.waitForTimeout(2200);
        }
        entry['collapse']={runs,worstMs:runs.some(run=>run===null)?null:Math.max(...runs as number[])};
      }
    } catch (error) { entry['error'] = String(error); }
    const prior=entries.findIndex(old=>key(old)===key(entry));if(prior>=0)entries.splice(prior,1);entries.push(entry); await context.close();
    await writeFile(resolve(out, 'chrome-verification.json'), JSON.stringify({ commit, complete: false, entries }, null, 2));
  }
  await writeFile(resolve(out, 'chrome-verification.json'), JSON.stringify({ commit, complete: entries.length===12 && entries.every(e => !e['error']), entries }, null, 2));
  expect(entries.filter(entry=>entry['error']),'all runtime contexts completed').toEqual([]);
  expect(entries.length,'all twelve runtime contexts recorded').toBe(12);
});
