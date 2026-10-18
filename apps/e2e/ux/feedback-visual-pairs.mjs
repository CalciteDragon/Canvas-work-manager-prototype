// Opt-in supplemental screenshots, run from repository root against isolated evidence servers.
import { chromium, expect } from '../node_modules/@playwright/test/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const before = process.argv.includes('--before');
const dir = option('--output', `apps/e2e/ux-output/${before ? '74b243a' : 'efe8616fa42e9c5596c69ee0e41a767946ea33a3'}`);
const host = option('--host', 'http://127.0.0.1:4342');
const webOrigin = option('--web-origin', 'http://localhost:4242');
const buildDir = option('--build-dir', before ? 'apps/e2e/ux-output/slice74-baseline-source/apps/web/dist/web/browser' : 'apps/web/dist/web/browser');
const index = JSON.parse(await readFile(`${dir}/index.json`, 'utf8'));
const file = `${dir}/feedback-verification.json`;
const report = JSON.parse(await readFile(file, 'utf8').catch(() => JSON.stringify({commit:index.commit,focus:[]})));
report.visualProvenance = { phase:before?'before':'after', matrixLabel:index.commit,
  sourceCommit:before?'74b243a':execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceChanges:before?[]:execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean), buildDir:resolve(buildDir),
  indexSha256:createHash('sha256').update(await readFile(`${buildDir}/index.html`)).digest('hex'), host, webOrigin,
  note:'Browser UI captured from the separately served build. API preparation uses only the isolated scratch host.' };
async function api(path, body, persona='user-demo') {
  const response = await fetch(`${host}${path}`, { method:'POST', headers:{'content-type':'application/json','x-prototype-user':persona}, body:JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path}: ${await response.text()}`);
  return response.json();
}
const cases = [
 ['remove-unlisted','dark',1440], ['task-delete','light',1440], ['header-transition','dark',1440], ['header-transition','light',1440],
 ['cross-owner','light',1440], ['todos-complete','dark',1440], ['archive-restore','dark',1440], ['archive-restore','dark',375],
 ['settings-restore','light',1440], ['hidden-archive','light',1440], ['drawer-toast','dark',1440], ['drawer-toast','light',1440],
];
const browser = await chromium.launch({headless:true});
try { for (const [row, theme, width] of cases) {
 await api('/prototype/seed',{seed:row==='drawer-toast'?'busy-week':'nested-projects'});
 await api('/prototype/clock',{now:'2026-08-24T16:00:00.000Z'});
 const context=await browser.newContext({viewport:{width,height:width===375?812:900},hasTouch:width===375,isMobile:width===375,colorScheme:theme,reducedMotion:'reduce'});
 await context.route('http://localhost:4200/**',r=>r.continue({url:r.request().url().replace('http://localhost:4200',webOrigin)}));
 await context.route(/^http:\/\/(localhost|127\.0\.0\.1):4310\//,r=>r.continue({url:r.request().url().replace(/^http:\/\/(localhost|127\.0\.0\.1):4310/,host)}));
 let restoreTaskId;
 if(row==='archive-restore') {
   const {task} = await api('/api/tasks',{projectId:'project-kitchen',sectionId:'section-project-kitchen-tasks',title:'Old permit copy'});
   restoreTaskId=task.id;await api(`/api/tasks/${restoreTaskId}/archive`,{});
 }
 const page=await context.newPage();
 let route=row==='archive-restore'?'/projects/project-renovation/pages/archive':row==='todos-complete'?'/projects/project-renovation/pages/todos':row==='settings-restore'?'/settings/archived-projects':row==='drawer-toast'?'/projects/project-launch':'/projects/project-kitchen';
 if(row==='hidden-archive') {
   const {project}=await api('/api/projects',{workspaceId:'workspace-alex',kind:'root',name:'Alex hidden Archive'},'user-alex');
   route=`/projects/${project.id}/pages/archive`;
   await context.addInitScript(()=>localStorage.setItem('cwm.prototype.persona','user-alex'));
 }
 await page.goto(`http://localhost:4200${route}`);await page.waitForLoadState('networkidle');
 if(['remove-unlisted','header-transition','drawer-toast'].includes(row)) {
   const remove=row==='remove-unlisted'?page.getByRole('button',{name:'Remove section Progress',exact:true}):page.getByRole('button',{name:/^Remove section /}).first();
   await remove.click();
   if(row==='header-transition') {await expect(page.locator('[data-history-undo]')).not.toHaveAttribute('aria-disabled','true');await page.locator('[data-history-undo]').click();await expect(page.locator(before?'[data-history-message]':'[data-toast]:popover-open')).toContainText(/Und/);}
   else if(row==='drawer-toast') {await page.getByRole('button',{name:/, open details$/}).first().click();await expect(page.locator('[data-task-drawer]')).toBeVisible();}
 } else if(row==='task-delete') await page.locator('[data-task-delete]').first().click();
 else if(row==='cross-owner') {
   const expand=page.getByRole('button',{name:'Show project navigation',exact:true});if(await expand.isVisible())await expand.click();
   await page.getByRole('button',{name:'Add workstream',exact:true}).click();const dialog=page.getByRole('dialog');
   await dialog.getByRole('textbox',{name:'Name',exact:true}).fill('Lighting');await dialog.getByRole('combobox',{name:'Parent',exact:true}).selectOption('project-kitchen');await dialog.getByRole('button',{name:'Create',exact:true}).click();await expect(dialog).toBeHidden();
 } else if(row==='todos-complete') await page.getByRole('button',{name:'Complete Kitchen',exact:true}).click();
 else if(row==='archive-restore') {const item=page.locator(`[data-archived-item]`).filter({hasText:'Kitchen'}).filter({hasText:'Old permit copy'});await expect(item).toHaveCount(1);await item.locator('[data-archived-restore]').click();await expect(item).toHaveCount(0);}
 else if(row==='settings-restore') {await page.locator('[data-archived-status]').first().selectOption('active');await page.locator('[data-archived-restore]').first().click();}
 if(!before && row!=='hidden-archive') await expect(page.locator('[data-toast]:popover-open')).toBeVisible();
 await page.waitForLoadState('networkidle');
 const screenshot=`feedback-visual-${row}-${theme}-${width}.png`;
 await page.screenshot({path:`${dir}/${screenshot}`,animations:'disabled'});
 const active=await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.trim().slice(0,100)}));
 const entry={row,theme,width,screenshot,active,visualSupplement:true,route,seed:row==='drawer-toast'?'busy-week':'nested-projects'};
 report.visualFocus=(report.visualFocus??[]).filter(item=>!(item.row===row&&item.theme===theme&&item.width===width));report.visualFocus.push(entry);
 await writeFile(file,JSON.stringify(report,null,2));
 console.log(`${before?'before':'after'} ${row} ${theme} ${width}`);await context.close();
}} finally {await browser.close();}
