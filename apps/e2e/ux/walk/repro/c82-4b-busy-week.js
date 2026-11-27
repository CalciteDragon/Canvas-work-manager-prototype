// Slice 82 step 4b: busy-week Timeline status, Daily Digest wording, and the failed task-list read (T12 setup):
// the add field during the failure and adding a task before Try again. Run after `seed busy-week` at 1440.
const r = {};
const main = () => page.locator('main').first();
await page.goto('http://localhost:4200/app'); await page.waitForTimeout(1300);
r.digest = (await main().innerText()).match(/[^\n]*closest deadline[^\n]*/)?.[0];
await page.goto('http://localhost:4200/projects/project-launch'); await page.waitForTimeout(1300);
r.timelineQA = (await main().innerText()).match(/Run launch QA\n[^\n]*\n[^\n]*/g);
r.timelineComms = (await main().innerText()).match(/Launch communications\n[^\n]*/g);
// T12 setup inlined: GET /api/tasks fails until lifted
let fail = true;
const handler = route => (fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, body: '{}' }) : route.fallback());
await context.route('**/api/tasks**', handler);
await page.reload(); await page.waitForTimeout(1800);
const list = main().getByRole('region', { name: 'Task List' }).first();
r.failed = { txt: (await list.innerText()).slice(0, 250), input: await list.getByRole('textbox').first().isEnabled(), add: await list.getByRole('button', { name: 'Add task' }).isEnabled() };
await list.getByRole('textbox').first().fill('Added during failure');
await list.getByRole('button', { name: 'Add task' }).click(); await page.waitForTimeout(1500);
r.afterAdd = (await list.innerText()).slice(0, 300);
await page.screenshot({ path: `${out}/bw-add-during-failure.png` });
fail = false;
await list.getByRole('button', { name: 'Try again' }).click(); await page.waitForTimeout(1500);
r.afterRetry = (await list.innerText()).slice(0, 300);
await context.unroute('**/api/tasks**', handler);
return r;
