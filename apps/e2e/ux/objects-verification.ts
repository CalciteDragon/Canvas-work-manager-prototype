import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureContext } from './isolation';
import { addSection, addShortcut, api, createRoot, seed, setClock } from '../seed';
import type { ProjectPage } from '@cwm/contracts';
import { SEED_NOW } from './matrix';
import { runCoreTasks } from './tasks';
import AxeBuilder from '@axe-core/playwright';
// @ts-expect-error Browser-serializable helper also exercised by node:test.
import { axeNodeIdentity, collectControls } from './layout.mjs';

const commit=process.env['UX_BEFORE'] || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const out=resolve('ux-output',commit);
const ids=[...Array.from({length:9},(_,i)=>'T'+String(i+1).padStart(2,'0')),'T11'];
const fixtures=[
  {row:'timeline',seed:'nested-projects',route:'/projects/project-kitchen'},
  {row:'timeline-busy',seed:'busy-week',route:'/projects/project-launch'},
  {row:'todos',seed:'nested-projects',route:'/projects/project-renovation/pages/todos'},
  {row:'task-list',seed:'nested-projects',route:'/projects/project-kitchen'},
  {row:'shortcut',seed:'nested-projects',route:'/projects/project-renovation/pages/home'},
  {row:'shortcut-empty',seed:'nested-projects',route:'/projects/project-renovation/pages/home'},
  {row:'picker-preview',seed:'nested-projects',route:'/projects/project-kitchen'},
  {row:'drag',seed:'nested-projects',route:'/projects/project-kitchen'},
  {row:'archived-projects',seed:'nested-projects',route:'/settings/archived-projects'},
  {row:'archived-projects-root',seed:'nested-projects',route:'/settings/archived-projects'},
  {row:'progress',seed:'nested-projects',route:'/projects/project-kitchen'},
  {row:'reflections',seed:'nested-projects',route:'/projects/project-renovation/pages/reflections'},
  {row:'lab',seed:'nested-projects',route:'/prototype/design'},
  {row:'dashboard-owner',seed:'overdue-chaos',route:'/app'},
  ...['overdue-chaos','busy-week','nested-projects','agent-heavy'].flatMap(seed=>['user-demo','user-alex','user-sam'].map(persona=>({row:'dashboard-'+seed+'-'+persona,seed,route:'/app',persona}))),
];

/** Title columns are grouped by their own list; coordinates are observed on the genuine before too. */
async function titles(page:Page,row:string) {
  if(row==='todos')return page.locator('[data-todos-list]').evaluateAll(lists=>lists.map((list,index)=>({id:String(index),titles:[...list.querySelectorAll('[data-todo-link]')].map(e=>e.getBoundingClientRect().left)})));
  if(row.startsWith('timeline'))return page.locator('app-timeline-section').evaluateAll(sections=>sections.map((section,index)=>({id:section.closest('[data-section-id]')?.getAttribute('data-section-id')??String(index),titles:[...section.querySelectorAll('[data-timeline-row]')].map(e=>(e.querySelector('.object-row__title, strong')??e).getBoundingClientRect().left)})));
  return [];
}

/** Slice 77's own evidence: frozen earlier verification journeys are deliberately not re-run. */
test('Objects runtime evidence and core tasks',async({browser})=>{
  await mkdir(out,{recursive:true});
  const entries:Record<string,unknown>[]=process.env['UX_OBJECTS_MATCH']?await readFile(resolve(out,'objects-verification.json'),'utf8').then(text=>JSON.parse(text).entries).catch(()=>[]):[];
  const key=(e:Record<string,unknown>)=>[e['row'],e['theme'],e['width']].join('|');
  for(const fixture of fixtures)for(const theme of ['dark','light'] as const)for(const width of (fixture.row.startsWith('dashboard-')?[1440,1024,375]:[1440,375])) {
    if(process.env['UX_OBJECTS_MATCH'] && !new RegExp(process.env['UX_OBJECTS_MATCH']).test([fixture.row,theme,width].join('|')))continue;
    await seed(fixture.seed);await setClock(SEED_NOW);
    const context=await browser.newContext({viewport:{width,height:width===375?812:900},hasTouch:width===375,isMobile:width===375,colorScheme:theme,timezoneId:'UTC',reducedMotion:'reduce'});
    await configureContext(context);
    if('persona' in fixture)await context.addInitScript(persona=>localStorage.setItem('cwm.prototype.persona',persona),fixture.persona);
    const page=await context.newPage();await page.clock.install({time:new Date(SEED_NOW)});await page.clock.setFixedTime(new Date(SEED_NOW));
    page.setDefaultTimeout(8000);
    const entry:Record<string,unknown>={...fixture,theme,width};
    try {
      let rootId:string|undefined,shortcutId:string|undefined;
      if(fixture.row==='archived-projects-root') {
        const root=await createRoot('Archived root project');rootId=root.id;
        await api.patch(`/api/projects/${root.id}`,{status:'archived'});
      }
      if(fixture.row==='shortcut-empty') {
        const source=await addSection('project-kitchen',{type:'task-list',title:'Empty source tasks'});
        const pages=await api.get<ProjectPage[]>('/api/projects/project-renovation/pages');
        const home=pages.find(page=>page.kind==='home');if(!home)throw new Error('Root Home page is missing');
        const shortcut=await addShortcut('project-renovation',{pageId:home.id,sourceSectionId:source.id});shortcutId=shortcut.id;
      }
      const documentResponse=await page.goto('http://localhost:4200'+fixture.route);await page.waitForLoadState('networkidle');
      if(!documentResponse)throw new Error('Static document response is missing');
      entry['servedBuild']={indexSha256:createHash('sha256').update(await documentResponse.body()).digest('hex'),captureLabel:commit,workingTree:!process.env['UX_BEFORE']};
      if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:`Switch to the ${theme} theme`}).click();
      await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
      if(rootId) {
        const card=page.locator(`[data-archived-project][data-project-id="${rootId}"]`);
        await expect(card).toBeVisible();await card.scrollIntoViewIfNeeded();
      }
      if(shortcutId) {
        const frame=page.locator(`[data-shortcut-id="${shortcutId}"] [data-shortcut-frame]`);
        await frame.scrollIntoViewIfNeeded();await expect(frame.locator('app-task-list-section')).toBeVisible();
        await expect(frame.locator('[data-tasks-empty]')).toBeVisible();
        await expect(frame.locator('[data-task-row]')).toHaveCount(0);
      }
      if(fixture.row==='picker-preview') {
        await page.getByRole('button',{name:'Add a section',exact:true}).click();await page.getByRole('button',{name:'Add shortcut',exact:true}).click();
        const preview=page.getByRole('button',{name:/^Preview/}).first();
        const summary=page.locator('summary').filter({hasText:/Preview/}).first();
        if(await preview.count())await preview.click();else if(await summary.count())await summary.click();
        await page.waitForLoadState('networkidle');
      }
      if(fixture.row==='dashboard-owner') {
        const link=page.locator('[data-widget-type="today"] a.object-row__title').first();
        const title=await link.count()?link:page.locator('[data-widget-type="today"] .widget-row__title').first();
        if(await title.count()) {
          await title.hover();entry['hoverScreenshot']=`objects-dashboard-hover-${theme}-${width}.png`;
          await page.screenshot({path:resolve(out,String(entry['hoverScreenshot'])),fullPage:true});
          if(await link.count()) {await link.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');}
          entry['focusScreenshot']=`objects-dashboard-focus-${theme}-${width}.png`;
          await page.screenshot({path:resolve(out,String(entry['focusScreenshot'])),fullPage:true});
        }
        entry['ownerAvailable']=await link.count()>0;
        if(await link.count()) {await link.click();await expect(page).toHaveURL(/#section-/);entry['ownerUrl']=page.url();entry['ownerFocused']=await page.locator(new URL(page.url()).hash+' h2').evaluate(e=>e===document.activeElement);}
      }
      if(fixture.row==='drag' && width===1440) {
        const row=page.locator('app-task-row [cdkdrag], app-task-row .task-row, app-task-row article').first();
        const box=await row.boundingBox();
        if(!box)throw new Error('Task drag fixture has no row');
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height+60,{steps:12});
        entry['dragging']=await page.locator('.cdk-drag-preview').count()>0;
      }
      // Full-page screenshots do not expand the application's nested scrollport.
      // Bring the actual finding into view before collecting its geometry and pixels.
      const targetSelector=fixture.row.startsWith('timeline')?'[data-timeline-row]':
        fixture.row==='task-list'?'[data-task-row]':
        fixture.row==='shortcut'?'[data-shortcut-frame] [data-task-row]':
        fixture.row==='progress'?'app-progress-section .progress-section__controls':
        fixture.row==='reflections'?'[data-reflections-entry] article > p':null;
      const screenshotTarget=targetSelector?page.locator(targetSelector).first():null;
      if(screenshotTarget) {
        await screenshotTarget.scrollIntoViewIfNeeded();
        await expect(screenshotTarget,'the named visual finding is inside the nested viewport').toBeInViewport({ratio:0.95});
      }
      entry['immutable']=await page.evaluate(()=>{
        const boxes:{id:string;x:number;y:number;width:number;height:number}[]=[];
        const add=(id:string,e:Element,origin?:Element)=>{
          const r=e.getBoundingClientRect(),p=origin?.getBoundingClientRect();let x=r.x-(p?.x??0),y=r.y-(p?.y??0);
          let anchored=false;for(let current:Element|null=e;current;current=current.parentElement)if(['sticky','fixed'].includes(getComputedStyle(current).position)){anchored=true;break;}
          if(!origin && !anchored && e.matches('app-top-bar,app-sidebar,app-project-page-navigation,app-project-header'))for(let ancestor=e.parentElement;ancestor;ancestor=ancestor.parentElement){x+=ancestor.scrollLeft;y+=ancestor.scrollTop;}
          if(r.width>0&&r.height>0)boxes.push({id,x,y,width:r.width,height:r.height});
        };
        for(const selector of ['app-top-bar','app-sidebar','app-project-page-navigation','app-project-header','[data-task-drawer]'])document.querySelectorAll(selector).forEach((e,i)=>add(selector+':'+i,e));
        document.querySelectorAll('app-project-section-frame,app-shortcut-frame').forEach((frame,index)=>{
          const id=frame.querySelector('[data-section-id],[data-shortcut-id]')?.getAttribute('data-section-id')??String(index);
          const header=frame.querySelector('header');if(!header)return;
          add('frame:'+id+':header',header,frame);
          header.querySelectorAll('button,[role=slider]').forEach((e,i)=>add('frame:'+id+':tool:'+i,e,header));
        });
        const changing=new Set(['cards','object-rows','primitives','task-row','widget-frame','activity']);
        document.querySelectorAll('[data-panel]').forEach(panel=>{
          const id=panel.getAttribute('data-panel')!;if(changing.has(id))return;
          panel.querySelectorAll('button,input,select,textarea,a,[role=slider]').forEach((e,i)=>add('lab:'+id+':'+i,e,panel));
        });
        return boxes;
      });
      entry['groups']=await titles(page,fixture.row);
      entry['controls']=await page.evaluate(collectControls);
      const scan=await new AxeBuilder({page}).options({rules:{'target-size':{enabled:true}}}).analyze();
      for(const violation of scan.violations)for(const node of violation.nodes) {
        const selector=node.target.at(-1);
        if(typeof selector==='string')(node as typeof node & {stableAnchor?:string}).stableAnchor=String(await page.evaluate(axeNodeIdentity,selector).catch(()=>selector));
      }
      entry['axe']={violations:scan.violations,incomplete:scan.incomplete};
      entry['aria']=await page.locator('body').ariaSnapshot();
      entry['screenshot']=`objects-${fixture.row}-${theme}-${width}.png`;
      if(screenshotTarget) {
        await expect(screenshotTarget,'the named target remains visible immediately before its screenshot').toBeInViewport({ratio:0.95});
        entry['screenshotTarget']={selector:targetSelector,visible:true,box:await screenshotTarget.boundingBox()};
      }
      await page.screenshot({path:resolve(out,String(entry['screenshot'])),fullPage:true});
      if(fixture.row==='drag')await page.mouse.up();
      // The untouched panel controls remain measured by the matrix's panel-aware collector.
      if(fixture.row==='lab')entry['panels']=await page.locator('[data-panel]').evaluateAll(panels=>panels.map(panel=>{const r=panel.getBoundingClientRect();return {id:panel.getAttribute('data-panel'),x:r.x,y:r.y,width:r.width,height:r.height};}));
    }catch(error){entry['error']=String(error);}
    const prior=entries.findIndex(e=>key(e)===key(entry));if(prior>=0)entries.splice(prior,1);entries.push(entry);await context.close();
    await writeFile(resolve(out,'objects-verification.json'),JSON.stringify({commit,complete:false,entries},null,2));
  }
  await runCoreTasks(browser,resolve(out,'tasks'),ids);
  const tasks=JSON.parse(await readFile(resolve(out,'tasks/tasks.json'),'utf8'));
  const expected=fixtures.reduce((count,fixture)=>count+(fixture.row.startsWith('dashboard-')?6:4),0);
  await writeFile(resolve(out,'objects-verification.json'),JSON.stringify({commit,complete:entries.length===expected && entries.every(e=>!e['error']),entries,tasks},null,2));
  expect(entries.filter(e=>e['error']),'all objects runtime contexts captured').toEqual([]);
});
