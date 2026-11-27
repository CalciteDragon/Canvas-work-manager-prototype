// Slice 82 step 4b: a failed task read on a canvas that holds both a Task List shortcut and a Task List: how many
// failures show, and what the first Try again repairs. Run after `seed nested-projects` at 1440.
const r = {};
const main = () => page.locator('main').first();
const failures = async () => (await main().innerText()).match(/Couldn’t load[^\n]*/g) ?? [];
await page.goto('http://localhost:4200/projects/project-renovation'); await page.waitForTimeout(1300);
r.shortcuts = (await main().innerText()).match(/[^\n]*\((Kitchen|Home renovation|Cabinets|Garden)\)/g);
let fail = true;
const handler = route => (fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, body: '{}' }) : route.fallback());
await context.route('**/api/tasks**', handler);
await page.reload(); await page.waitForTimeout(1800);
r.failed = await failures();
fail = false;
await main().getByRole('button', { name: 'Try again' }).first().click(); await page.waitForTimeout(1500);
r.afterFirstTry = await failures();
await context.unroute('**/api/tasks**', handler);
return r;
