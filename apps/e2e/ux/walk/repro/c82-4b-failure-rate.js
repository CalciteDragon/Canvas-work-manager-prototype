// Slice 82 step 4b, C82-L4-002 as the lens did it: the development dialog's Failure rate at 100 %, reload Home,
// back to 0 % without reloading, then Home's main Try again: does the sidebar's project tree recover?
// Run after `seed nested-projects` at 1440. Changes only the Failure rate setting, and restores it to 0 %.
const r = {};
const main = () => page.locator('main').first();
const setRate = async label => { await page.keyboard.press('Control+Shift+D'); await page.waitForTimeout(600); const g = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Failure rate' }) }).last(); r.rates = await g.getByRole('button').allInnerTexts(); await g.getByRole('button', { name: label, exact: true }).click(); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(400); };
await page.goto('http://localhost:4200/app'); await page.waitForTimeout(1300);
await setRate('100%');
await page.reload(); await page.waitForTimeout(2500);
r.failed = { main: (await main().innerText()).match(/[^\n]*ouldn’t[^\n]*/g), sidebar: (await page.getByRole('navigation').first().innerText()).replace(/\n/g, '|').slice(0, 250) };
await setRate('0%');
await main().getByRole('button', { name: 'Try again' }).first().click(); await page.waitForTimeout(2000);
r.afterMainRetry = { main: (await main().innerText()).match(/[^\n]*ouldn’t[^\n]*/g), sidebar: (await page.getByRole('navigation').first().innerText()).replace(/\n/g, '|').slice(0, 250), activeProjects: (await main().innerText()).includes('Home renovation') };
await page.screenshot({ path: `${out}/np-failure-rate-after-main-retry.png` });
return r;
