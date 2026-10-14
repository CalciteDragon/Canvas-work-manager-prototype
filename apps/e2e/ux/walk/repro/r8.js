// Orchestrator reproduction 8: archiving a root, archived-root pages, Alex archived-only sidebar.
const facts = {};
const host = 'http://127.0.0.1:4320';
const H = { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' };
const post = (p, b) => fetch(host + p, { method: 'POST', headers: H, body: JSON.stringify(b) });
const seed = async s => { await post('/prototype/seed', { seed: s }); await post('/prototype/clock', { now: '2026-08-24T16:00:00.000Z' }); };
const go = async p => { await page.goto('http://localhost:4200' + p); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(300); };
const main = async () => (await page.locator('main').first().innerText()).replace(/\n+/g, ' | ').slice(0, 500);
const tryit = async (k, fn) => { try { facts[k] = await fn(); } catch (e) { facts[k] = 'ERROR ' + String(e.message).slice(0, 200); } };
await seed('busy-week');
await go('/projects/project-home');
await tryit('archiveRootUi', async () => { await page.getByRole('button', { name: /More project actions/ }).click(); await page.getByRole('button', { name: /^Archive Project/ }).click(); await page.waitForTimeout(400); const confirmText = (await page.locator('main').first().innerText()).match(/[^\n]*(sidebar|archive)[^\n]*/gi)?.slice(0, 4); const confirm = page.getByRole('button', { name: /^(Confirm|Archive)/ }).last(); const label = await confirm.innerText(); await confirm.click(); await page.waitForTimeout(1000); return { confirmText, label, after: (await page.getByRole('alert').allInnerTexts()).slice(0, 2), url: page.url() }; });
// archive a root directly (API) and inspect
await seed('busy-week');
await tryit('apiArchive', async () => (await fetch(host + '/api/projects/project-course', { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'archived' }) })).status);
await go('/projects/project-course');
await tryit('archivedRootControls', async () => ({ text: (await main()).slice(0, 260), enabled: await page.locator('main').first().getByRole('button').evaluateAll(es => es.filter(e => !e.disabled && e.getAttribute('aria-disabled') !== 'true').map(e => e.getAttribute('aria-label') || e.textContent.trim()).slice(0, 14)) }));
await tryit('archivedRootWrite', async () => { const f = page.getByRole('textbox', { name: 'Task title' }).first(); if (!(await f.count())) return 'no task field'; await f.fill('Probe'); await page.getByRole('button', { name: 'Add task', exact: true }).first().click(); await page.waitForTimeout(900); return (await page.getByRole('alert').allInnerTexts()).slice(0, 2); });
await go('/projects/project-course/pages/todos');
await tryit('archivedRootTodos', main);
// Alex archived-only sidebar
await seed('nested-projects');
await fetch(host + '/api/projects/project-alex-private', { method: 'PATCH', headers: { ...H, 'x-prototype-user': 'user-alex' }, body: JSON.stringify({ status: 'archived' }) });
await go('/app');
await tryit('alexArchivedOnly', async () => { await page.keyboard.press('Control+Shift+D'); await page.waitForTimeout(600); await page.locator('[data-persona-id="user-alex"]').click(); await page.waitForTimeout(1500); await page.keyboard.press('Escape'); await go('/app'); return { who: await page.locator('[data-identity-name]').innerText(), nav: (await page.locator('nav').first().innerText()).replace(/\n+/g, ' | ').slice(0, 160) }; });
await go('/app'); await page.keyboard.press('Control+Shift+D'); await page.waitForTimeout(600); await page.locator('[data-persona-id="user-demo"]').click().catch(() => {}); await page.waitForTimeout(1200);
return facts;
