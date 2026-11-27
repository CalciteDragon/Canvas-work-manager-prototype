// Slice 82 step 4b: dashboard task links, dashboard row gutters and meta, keyboard focus after route changes,
// the development dialog's Escape, and All projects. Run after `seed overdue-chaos` at 1440.
const r = {};
const t = async (k, f) => { try { r[k] = await f(); } catch (e) { r[k] = 'ERR ' + String(e.message).split('\n')[0].slice(0, 160); } };
const go = async p => { await page.goto('http://localhost:4200' + p); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(800); };
const main = () => page.locator('main').first();
const active = () => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()} ${(a.getAttribute('aria-label') ?? a.textContent).trim().slice(0, 40)}` : null; });
await go('/app');
await t('todayHrefs', async () => main().getByRole('region', { name: /Today|Daily Digest/ }).getByRole('link').evaluateAll(as => as.map(a => a.innerText.trim().slice(0, 30) + ' -> ' + a.getAttribute('href'))));
await t('rowGutter', async () => main().getByRole('link', { name: 'Notify stakeholders' }).first().evaluate(a => { const card = a.closest('li,article'); const c = card.getBoundingClientRect(), b = a.getBoundingClientRect(); return { gutter: Math.round(b.left - c.left) }; }));
await t('overdueMeta', async () => main().getByText('Overdue', { exact: true }).nth(1).evaluate(e => ({ color: getComputedStyle(e).color, parent: e.parentElement.innerText.slice(0, 60) })));
await t('activeProjects', async () => main().getByRole('region', { name: /Active Projects/ }).first().evaluate(s => [...s.querySelectorAll('a')].slice(0, 2).map(a => { const sp = a.querySelectorAll('span'); return { txt: a.innerText.slice(0, 40), spans: [...sp].map(x => Math.round(x.getBoundingClientRect().left)) }; })));
await t('followToday', async () => { await main().getByRole('link', { name: 'Notify stakeholders' }).first().click(); await page.waitForTimeout(1500); const row = main().getByText('Notify stakeholders').first(); const rb = await row.boundingBox(); const marked = await row.evaluate(e => { const li = e.closest('li,article'); return { cls: String(li?.className).slice(0, 60), current: li?.getAttribute('aria-current'), focusedInside: li?.contains(document.activeElement) }; }); await page.screenshot({ path: `${out}/oc-today-follow.png` }); return { url: page.url().replace('http://localhost:4200', ''), focus: await active(), rowY: Math.round(rb.y), vh: 900, marked }; });
await t('taskListOverdue', async () => main().getByRole('region', { name: 'Task List' }).first().getByText('Overdue').first().evaluate(e => getComputedStyle(e).color));
await t('sidebarInProject', async () => page.getByRole('navigation').first().innerText().then(s => s.slice(0, 200)));
await t('allProjects', async () => { await page.getByRole('button', { name: 'All projects' }).click(); await page.waitForTimeout(600); return { url: page.url().replace('http://localhost:4200', ''), nav: (await page.locator('aside, nav').first().innerText()).slice(0, 300) }; });
await go('/settings');
await t('devDialogEscape', async () => { await page.getByRole('link', { name: 'Settings' }).first().focus(); await page.keyboard.press('Control+Shift+D'); await page.waitForTimeout(600); await page.keyboard.press('Escape'); await page.waitForTimeout(500); return active(); });
return r;
