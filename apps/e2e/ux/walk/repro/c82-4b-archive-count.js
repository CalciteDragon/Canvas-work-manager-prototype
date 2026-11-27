// Slice 82 step 4b: the item count on an Archive page with one item (a new root project with one removed
// section), and the Restore as default for an archived Planning workstream. Run on nested-projects after
// a Planning workstream 'Pantry' under Kitchen has been archived (this file's second half does it if absent).
const r = {};
const main = () => page.locator('main').first();
const go = async p => { await page.goto('http://localhost:4200' + p); await page.waitForTimeout(1300); };
await go('/projects/project-renovation/pages/archive');
if (!(await main().innerText()).includes('Pantry')) {
  await go('/projects/project-kitchen');
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Add workstream' }).click(); await page.waitForTimeout(500);
  const d = page.getByRole('dialog').last(); await d.getByRole('textbox').first().fill('Pantry');
  await d.getByRole('button', { name: 'Create' }).click(); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: /Archive workstream/ }).click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Archive/ }).last().click(); await page.waitForTimeout(1500);
  await go('/projects/project-renovation/pages/archive');
}
const item = main().locator('li,article').filter({ hasText: 'Pantry' }).last();
r.pantry = (await item.innerText()).slice(0, 200);
r.restoreAs = await item.locator('select').first().evaluate(s => s.selectedOptions[0]?.text);
// new root project with one removed section
await go('/app');
await page.getByRole('button', { name: 'New project' }).first().click(); await page.waitForTimeout(400);
await page.keyboard.type('Solo archive'); await page.keyboard.press('Enter'); await page.waitForTimeout(1800);
r.newProject = page.url();
await main().getByRole('button', { name: /^Add a section$/ }).last().click(); await page.waitForTimeout(500);
const d2 = page.getByRole('dialog').last(); await d2.getByRole('button', { name: 'Create' }).click(); await page.waitForTimeout(1200);
await main().getByRole('button', { name: /^Remove section/ }).first().click(); await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'More project actions' }).click();
await page.getByRole('menuitem', { name: /Open archive/ }).click(); await page.waitForTimeout(1300);
r.soloCount = (await main().innerText()).match(/\n(\d+ items?)\n/)?.[1];
await page.screenshot({ path: `${out}/solo-archive-1440.png` });
return r;
