import type { Browser, Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { seed, setClock } from '../seed';
import { configureContext } from './isolation';
import { SEED_NOW } from './matrix';

/** Counts only completed input actions, retaining attempted costs on blocked steps. */
export class TaskCounter {
  steps: { action: string; surface: string; clicks: number; keystrokes: number; status: string; error?: string }[] = [];
  async step(action: string, surface: string, cost: { clicks?: number; keystrokes?: number }, run: () => Promise<unknown>): Promise<void> {
    const row = { action, surface, clicks: cost.clicks ?? 0, keystrokes: cost.keystrokes ?? 0, status: 'passed' };
    try { await run(); this.steps.push(row); }
    catch (error) { this.steps.push({ ...row, status: 'blocked', error: error instanceof Error ? error.message : String(error) }); throw error; }
  }
  summary() { const passed = this.steps.filter(s => s.status === 'passed'); return { clicks: passed.reduce((n,s)=>n+s.clicks,0), keystrokes: passed.reduce((n,s)=>n+s.keystrokes,0), surfaces: [...new Set(passed.map(s=>s.surface))], deadEnds: this.steps.filter(s=>s.status==='blocked').length }; }
}
export const TASKS = [
  { id:'T01', title:'Create a root project', seed:'empty', route:'/app', spec:'§23, §26' },
  { id:'T02', title:'Create a workstream under Kitchen', seed:'nested-projects', route:'/projects/project-kitchen', spec:'§26' },
  { id:'T03', title:'Add a Task List and complete two tasks', seed:'nested-projects', route:'/projects/project-kitchen', spec:'§31' },
  { id:'T04', title:'Find an overdue task and reschedule it', seed:'overdue-chaos', route:'/projects/project-client-migration', spec:'§31' },
  { id:'T05', title:'Remove a section and undo removal', seed:'nested-projects', route:'/projects/project-kitchen', spec:'§26' },
  { id:'T06', title:'Edit and save Markdown', seed:'nested-projects', route:'/projects/project-kitchen', spec:'§30' },
  { id:'T07', title:'Place a shortcut on Work', seed:'nested-projects', route:'/projects/project-kitchen', spec:'§26' },
  { id:'T08', title:'Hide and re-enable Reflections', seed:'nested-projects', route:'/projects/project-renovation', spec:'§26' },
  { id:'T09', title:'Restore an archived item', seed:'nested-projects', route:'/projects/project-renovation/pages/archive', spec:'§26' },
  { id:'T10', title:'Inspect permissions and connect an agent', seed:'agent-heavy', route:'/settings/agents', spec:'§53' },
] as const;
async function execute(page: Page, id: string, c: TaskCounter) {
  const button=(name: string|RegExp)=>page.getByRole('button',{name,exact:typeof name==='string'});
  const click=(l: Locator, name: string, surface: string)=>c.step(name,surface,{clicks:1},()=>l.click());
  const type=async(l: Locator, text: string, surface: string)=>{
    if(!await l.evaluate(e=>document.activeElement===e)) await click(l,'Focus text field',surface);
    await c.step(`Type ${text}`,surface,{keystrokes:text.length},()=>l.pressSequentially(text));
  };
  const nav=async()=>{if(await button('Show project navigation').isVisible())await click(button('Show project navigation'),'Expand project navigation','Project navigation');};
  switch(id){
    case 'T01':
      await click(button('New project'),'New project','Sidebar'); await type(page.getByRole('textbox',{name:'Project name'}),'Baseline project','Create project');
      await click(button('Create'),'Create','Create project'); await expect(page.getByRole('heading',{name:'Baseline project',exact:true})).toBeVisible(); break;
    case 'T02':
      await nav(); await click(button('Add workstream'),'Add workstream','Project navigation');
      await type(page.getByRole('dialog').getByRole('textbox',{name:'Name',exact:true}),'Baseline workstream','Workstream dialog');
      await c.step('Choose Kitchen as parent','Workstream dialog',{clicks:1},()=>page.getByRole('combobox',{name:'Parent',exact:true}).selectOption('project-kitchen'));
      await expect(page.getByRole('combobox',{name:'Parent',exact:true})).toHaveValue('project-kitchen');
      await click(page.getByRole('dialog').getByRole('button',{name:'Create',exact:true}),'Create','Workstream dialog'); await expect(page.getByRole('dialog')).toHaveCount(0); break;
    case 'T03': {
      await click(button('Insert at the end'),'Insert at end','Work canvas');
      await c.step('Choose Task List','Section dialog',{clicks:1},()=>page.getByRole('combobox',{name:'Section type'}).selectOption('task-list'));
      await type(page.getByRole('dialog').getByRole('textbox'),'Baseline tasks','Section dialog');
      await click(page.getByRole('dialog').getByRole('button',{name:'Create',exact:true}),'Create','Section dialog');
      const section=page.getByRole('region',{name:'Rename Baseline tasks',exact:true});
      for(const title of ['Baseline one','Baseline two']){
        await type(section.getByRole('textbox',{name:'Task title'}),title,'Task List'); await click(section.getByRole('button',{name:'Add task',exact:true}),'Add task','Task List');
        await click(section.getByRole('checkbox',{name:`Complete ${title}`,exact:true}),'Complete task','Task List'); await expect(section.getByRole('checkbox',{name:`Reopen task ${title}`})).toBeChecked();
      } break;
    }
    case 'T04': {
      const overdue = page.getByRole('article').filter({hasText:'Overdue'}).first();
      await expect(overdue).toBeVisible();
      const taskName = await overdue.getByRole('button',{name:/, open details$/}).getAttribute('aria-label');
      await click(overdue.getByRole('button',{name:/, open details$/}),'Open overdue task details','Task List');
      await c.step('Set due date using native date input (physical key count unavailable)','Task drawer',{},()=>page.getByLabel('Due date',{exact:true}).fill('2026-09-01'));
      await page.waitForLoadState('networkidle'); await page.reload();
      await button(taskName!).click();
      await c.step('Verify saved due date after reload (verification actions excluded from task cost)','Task drawer',{},()=>expect(page.getByLabel('Due date',{exact:true})).toHaveValue('2026-09-01')); break; }
    case 'T05': {
      const removedName = await button(/^Remove section /).first().getAttribute('aria-label');
      await click(button(/^Remove section /).first(),'Remove first section','Work canvas');
      await page.waitForLoadState('networkidle');
      await c.step('Verify exact section left the canvas','Work canvas',{},()=>expect(button(removedName!)).toHaveCount(0));
      await click(button(/^Undo:/),'Undo removal','Project history');
      await c.step('Verify removed section returns','Work canvas',{},()=>expect(button(removedName!)).toBeVisible()); break; }
    case 'T06':
      await click(button(/^Edit Markdown for/).first(),'Edit Markdown','Markdown');
      await c.step('Select source','Markdown editor',{keystrokes:1},()=>page.getByRole('textbox',{name:/Markdown source/}).press('Control+A'));
      await type(page.getByRole('textbox',{name:/Markdown source/}),'# Baseline edit','Markdown editor');
      await click(button('Save'),'Save Markdown','Markdown editor'); await expect(page.getByRole('heading',{name:'Baseline edit'})).toBeVisible(); break;
    case 'T07':
      await click(button('Insert at the end'),'Insert at end','Work canvas'); await click(button('Add shortcut'),'Add shortcut','Section dialog');
      await click(page.getByRole('dialog').getByRole('button',{name:'Add',exact:true}).first(),'Add source shortcut','Shortcut picker'); await expect(page.getByRole('dialog')).toHaveCount(0); break;
    case 'T08':
      await nav(); await click(button('Project page settings for Home renovation'),'Page settings','Project navigation');
      await click(page.getByRole('checkbox',{name:'Show Reflections page'}),'Hide Reflections','Page settings');
      await expect(page.getByRole('checkbox',{name:'Show Reflections page'})).not.toBeChecked();
      await click(page.getByRole('checkbox',{name:'Show Reflections page'}),'Enable Reflections','Page settings');
      await expect(page.getByRole('checkbox',{name:'Show Reflections page'})).toBeChecked(); break;
    case 'T09': {
      const restore = button(/^Restore /).first(); const label = await restore.getAttribute('aria-label');
      await click(restore,'Restore first ready item','Archive');
      await c.step('Verify exact restored entry leaves Archive','Archive',{},()=>expect(button(label!)).toHaveCount(0)); break; }
    case 'T10':
      await expect(page.getByRole('heading',{name:'AI & Agents'})).toBeVisible();
      await c.step('Inspect permission labels','Agent settings',{},()=>expect(page.getByRole('checkbox').first()).toBeVisible());
      await c.step('Find Connect agent control','Agent settings',{},async()=>{ if(!await button(/Connect agent/i).count())throw new Error('No Connect agent control exists; this page manages seeded connections.'); }); break;
  }
}
/** Runs reproducible expert paths, not a novice discoverability study. */
export async function runCoreTasks(browser: Browser, outputDir: string): Promise<void> {
  await mkdir(outputDir,{recursive:true}); const results: unknown[]=[];
  for(const task of TASKS){
    await seed(task.seed); await setClock(SEED_NOW);
    const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'UTC'}); await configureContext(context);
    const page=await context.newPage(); await page.clock.install({time:new Date(SEED_NOW)}); await page.clock.setFixedTime(new Date(SEED_NOW)); page.setDefaultTimeout(8000); const counter=new TaskCounter(); let status='completed'; let error: string|undefined;
    try{await page.goto(`${process.env['CWM_E2E_WEB']??'http://localhost:4200'}${task.route}`);await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');await page.waitForLoadState('networkidle');await execute(page,task.id,counter);await page.waitForLoadState('networkidle');}
    catch(e){status='blocked';error=String(e); if(counter.steps.at(-1)?.status !== 'blocked') { try { await counter.step('Verify task postcondition',task.title,{},async()=>{throw e;}); } catch { /* The failure is now recorded. */ } }}
    await page.screenshot({path:resolve(outputDir,`${task.id}.png`),fullPage:true}); await writeFile(resolve(outputDir,`${task.id}.aria.yml`),await page.locator('body').ariaSnapshot());
    results.push({...task,status,error,...counter.summary(),steps:counter.steps,discoverability:'pending independent walkthrough',counting:'Completed pointer actions and typed characters/chords. Native selects count as one selection; native date physical keystrokes unmeasured. Setup navigation excluded.',persona:'user-demo',viewport:'1440x900'});
    await writeFile(resolve(outputDir,'tasks.json'),JSON.stringify(results,null,2));await context.close();
  }
}


