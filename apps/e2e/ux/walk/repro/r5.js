// Orchestrator reproduction 5: reruns on fresh seed + persona claims.
const facts = {};
const host = 'http://127.0.0.1:4320';
const post = (p, b) => fetch(host + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' }, body: JSON.stringify(b) });
const seed = async s => { await post('/prototype/seed', { seed: s }); await post('/prototype/clock', { now: '2026-08-24T16:00:00.000Z' }); };
const go = async p => { await page.goto('http://localhost:4200' + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300); };
const tryit = async (k, fn) => { try { facts[k] = await fn(); } catch (e) { facts[k] = 'ERROR ' + String(e.message).slice(0, 200); } };
await page.setViewportSize({ width: 1440, height: 900 });
await seed('nested-projects');
await go('/projects/project-kitchen');
await tryit('addTaskPending', async () => { await page.route('**/api/**', async r => { if (r.request().method() !== 'GET') await new Promise(s => setTimeout(s, 2500)); await r.fallback(); }); const sec = page.getByRole('region', { name: 'Rename Task List' }); await sec.getByRole('textbox', { name: 'Task title' }).fill('Pending probe'); await sec.getByRole('button', { name: 'Add task', exact: true }).click(); await page.waitForTimeout(700); const b = sec.getByRole('button', { name: /Add/ }).first(); const during = { btnText: await b.innerText(), btnDisabled: await b.isDisabled(), busy: await page.locator('[aria-busy=true]').count(), probeVisible: await sec.getByText('Pending probe').count(), fieldValue: await sec.getByRole('textbox', { name: 'Task title' }).inputValue() }; await page.waitForTimeout(2600); await page.unrouteAll({ behavior: 'ignoreErrors' }); return during; });
await seed('nested-projects');
await go('/projects/project-kitchen');
await tryit('taskDrag', async () => { const sec = page.getByRole('region', { name: 'Rename Task List' }); const rows = sec.locator('[aria-label$=", open details"]'); const before = await rows.evaluateAll(es => es.map(e => e.getAttribute('aria-label'))); const a = await rows.nth(0).boundingBox(), b = await rows.nth(1).boundingBox(); await page.mouse.move(a.x + 40, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(a.x + 40, b.y + b.height - 2, { steps: 15 }); await page.mouse.up(); await page.waitForTimeout(1000); const after = await rows.evaluateAll(es => es.map(e => e.getAttribute('aria-label'))); return { before, after }; });
await seed('nested-projects');
await go('/projects/project-kitchen');
await tryit('reflectionError', async () => { const sec = page.getByRole('region', { name: 'Rename Reflections' }); await sec.getByRole('button', { name: 'Add reflection' }).click(); await page.waitForTimeout(300); const body = sec.locator('textarea').first(); await body.fill('Real reflection body'); await sec.getByRole('button', { name: 'Add reflection' }).click(); await page.waitForTimeout(1200); const t = await sec.innerText(); return { errorStill: /body is required/.test(t), saved: t.includes('Real reflection body') }; });
await go('/projects/project-renovation/pages/archive');
await tryit('itemsCount', async () => (await page.locator('main').first().innerText()).match(/\d+ items?/g));
// Open Archive from More enables page and becomes newest undo step?
await seed('nested-projects');
await go('/projects/project-renovation');
await tryit('openArchiveUndo', async () => { const pages = page.getByRole('button', { name: /Project page settings/ }).first(); await pages.click(); const cb = page.getByRole('checkbox', { name: /Archive/ }).first(); if (await cb.isChecked()) { await cb.click(); await page.waitForTimeout(800); } await page.keyboard.press('Escape'); await go('/projects/project-renovation'); const undoBefore = await page.getByRole('button', { name: /^Undo:/ }).first().getAttribute('aria-label').catch(() => null); await page.getByRole('button', { name: /More project actions/ }).click(); await page.getByRole('button', { name: /Open Archive/ }).click(); await page.waitForTimeout(1200); await go('/projects/project-renovation'); const undoAfter = await page.getByRole('button', { name: /^Undo:/ }).first().getAttribute('aria-label').catch(() => null); return { undoBefore, undoAfter, archiveTab: await page.getByRole('link', { name: 'Archive', exact: true }).count() }; });
// Alex opens Demo URL
await seed('nested-projects');
await go('/app');
await tryit('alexDirectUrl', async () => { await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/persona/i.test(k)) localStorage.setItem(k, 'user-alex'); }); const keys = await page.evaluate(() => Object.keys(localStorage)); await go('/projects/project-kitchen'); const t = (await page.locator('main').first().innerText()).slice(0, 400); const who = await page.locator('[data-identity-name]').innerText().catch(() => null); const links = await page.locator('main').first().getByRole('link').allInnerTexts(); return { keys, who, text: t, linksInMain: links }; });
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/persona/i.test(k)) localStorage.removeItem(k); });
return facts;
