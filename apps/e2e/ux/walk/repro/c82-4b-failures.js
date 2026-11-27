// Slice 82 step 4b: (1) every workspace read failing, then lifted, and Home's main Try again: does the sidebar
// recover too? (2) task POST and PATCH aborted (connection failure), reads untouched: is the title field or the
// Priority control marked invalid? Routed with route.fallback() for everything else. Run after `seed nested-projects`.
const r = {};
const main = () => page.locator('main').first();
let failAll = true;
const all = route => (failAll && route.request().url().includes('/api/') ? route.fulfill({ status: 500, body: '{}' }) : route.fallback());
await context.route(/127\.0\.0\.1:4310|localhost:4310/, all);
await page.goto('http://localhost:4200/app'); await page.waitForTimeout(2000);
r.failedMain = (await main().innerText()).match(/[^\n]*(Couldn’t|couldn’t)[^\n]*/g);
failAll = false;
await main().getByRole('button', { name: 'Try again' }).first().click(); await page.waitForTimeout(2000);
r.afterMainRetry = { main: (await main().innerText()).match(/[^\n]*(Couldn’t|couldn’t)[^\n]*/g), sidebar: (await page.getByRole('navigation').first().innerText()).slice(0, 250).replace(/\n/g, '|') };
await page.screenshot({ path: `${out}/np-home-after-main-retry.png` });
await context.unroute(/127\.0\.0\.1:4310|localhost:4310/, all);
const writes = route => (['POST', 'PATCH'].includes(route.request().method()) && /\/api\/tasks/.test(route.request().url()) ? route.abort('failed') : route.fallback());
await context.route(/127\.0\.0\.1:4310|localhost:4310/, writes);
await page.goto('http://localhost:4200/projects/project-kitchen'); await page.waitForTimeout(1500);
const list = main().getByRole('region', { name: 'Task List' }).first();
await list.getByRole('textbox').first().fill('Order hinges');
await list.getByRole('button', { name: 'Add task' }).click(); await page.waitForTimeout(1500);
r.titleField = await list.getByRole('textbox').first().evaluate(i => ({ value: i.value, invalid: i.getAttribute('aria-invalid'), border: getComputedStyle(i).borderColor, msg: i.closest('form,div')?.parentElement?.innerText.slice(0, 200) }));
await list.getByRole('button', { name: /Choose appliance finishes, open details/ }).click(); await page.waitForTimeout(800);
const d = page.getByRole('dialog').last();
await d.getByLabel('Priority').selectOption('high'); await page.waitForTimeout(2000);
r.priority = await d.getByLabel('Priority').evaluate(s => ({ value: s.value, invalid: s.getAttribute('aria-invalid'), border: getComputedStyle(s).borderColor }));
r.drawerMsg = (await d.innerText()).match(/[^\n]*(Couldn’t|couldn’t|failed|not saved)[^\n]*/gi);
await page.screenshot({ path: `${out}/np-priority-failed.png` });
await context.unroute(/127\.0\.0\.1:4310|localhost:4310/, writes);
return r;
