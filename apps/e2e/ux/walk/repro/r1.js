// Orchestrator reproduction 1: nested-projects, Demo, 1440x900 dark. Facts only.
const facts = {};
const host = 'http://127.0.0.1:4320';
const post = (p, b) => fetch(host + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' }, body: JSON.stringify(b) });
await post('/prototype/seed', { seed: 'nested-projects' }); await post('/prototype/clock', { now: '2026-08-24T16:00:00.000Z' });
const go = async p => { await page.goto('http://localhost:4200' + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300); };
const active = () => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName}${e.getAttribute('aria-label') ? ' ' + e.getAttribute('aria-label') : ''}${e === document.body ? ' (body)' : ''}` : null; });
const style = (loc, props) => loc.evaluate((e, props) => { const s = getComputedStyle(e); return Object.fromEntries(props.map(p => [p, s[p]])); }, props);
const tryit = async (k, fn) => { try { facts[k] = await fn(); } catch (e) { facts[k] = 'ERROR ' + String(e.message).slice(0, 160); } };

await go('/app');
await tryit('dashboardMainCount', () => page.locator('main').count());
await tryit('dashboardTitle', () => page.title());
await go('/projects/project-kitchen');
await tryit('kitchenTitle', () => page.title());
await tryit('skipLink', () => page.locator('a[href^="#"]').filter({ hasText: /skip/i }).count());
await tryit('ariaCurrentCount', () => page.locator('[aria-current]').evaluateAll(es => es.map(e => e.textContent.trim().slice(0, 30) + ':' + e.getAttribute('aria-current'))));
await tryit('flowBanner', () => page.getByText('Switch layout in the development panel', { exact: false }).isVisible());
await tryit('homeLinksVisible', () => page.getByRole('link', { name: 'Home', exact: true }).evaluateAll(es => es.filter(e => e.offsetParent).length));
await tryit('kitchenLinks', () => page.getByRole('link', { name: 'Kitchen', exact: true }).count());
await tryit('breadcrumb', () => page.getByRole('navigation', { name: 'Path to this workstream' }).innerText());
await tryit('sectionRegions', () => page.getByRole('region').evaluateAll(es => es.map(e => e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent.trim()).filter(Boolean).slice(0, 8)));
await tryit('h2Names', async () => (await page.getByRole('heading', { level: 2 }).allInnerTexts()).slice(0, 10));
await tryit('headingOrder', () => page.evaluate(() => [...document.querySelectorAll('h1,h2,h3')].slice(0, 6).map(h => h.tagName + ':' + h.textContent.trim().slice(0, 20))));
await tryit('insertEndVisibleAtRest', async () => { const b = page.getByRole('button', { name: 'Insert at the end' }); return { count: await b.count(), opacity: await b.count() ? (await style(b.first(), ['opacity', 'visibility'])) : null }; });
await tryit('undoRedo', async () => { const btns = page.locator('header button, .project-header button'); return await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /undo|redo|Nothing to/i.test(b.getAttribute('aria-label') || '')).map(b => ({ name: b.getAttribute('aria-label'), disabled: b.disabled || b.getAttribute('aria-disabled'), opacity: getComputedStyle(b).opacity, color: getComputedStyle(b).color, border: getComputedStyle(b).borderColor }))); });
await tryit('gearSize', async () => page.getByRole('button', { name: /Project page settings/ }).first().boundingBox());
await tryit('newProjectPlusBox', () => page.getByRole('button', { name: 'New project' }).boundingBox());
await tryit('addTaskStyle', () => style(page.getByRole('button', { name: 'Add task', exact: true }).first(), ['backgroundColor', 'color', 'height']));
// Tab stops per section: count focusables inside first owned section
await tryit('sectionFocusables', () => page.getByRole('region').first().evaluate(r => [...r.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(e => !e.disabled).map(e => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 20))));
// New project focus
await tryit('newProject', async () => { await page.getByRole('button', { name: 'New project' }).click(); await page.waitForTimeout(200); const f = await active(); const field = page.getByRole('textbox', { name: 'Project name' }); const vis = await page.evaluate(() => [...document.querySelectorAll('label')].filter(l => /Project name/.test(l.textContent)).map(l => { const r = l.getBoundingClientRect(); return { w: r.width, h: r.height, clip: getComputedStyle(l).clip }; })); await page.keyboard.press('Escape'); return { focusAfterOpen: f, labels: vis, placeholder: await field.getAttribute('placeholder').catch(() => null) }; });
await go('/projects/project-kitchen');
// Add workstream dialog
await tryit('addWorkstream', async () => { await page.getByRole('button', { name: 'Add workstream' }).click(); const dlg = page.getByRole('dialog'); await dlg.waitFor(); const parent = dlg.getByRole('combobox', { name: 'Parent' }); const r = { parentValue: await parent.inputValue(), options: await parent.locator('option').allInnerTexts(), cancel: await style(dlg.getByRole('button', { name: 'Cancel' }), ['backgroundColor', 'color', 'borderColor']), create: await style(dlg.getByRole('button', { name: 'Create', exact: true }), ['backgroundColor', 'color', 'borderColor']) }; await dlg.getByRole('textbox', { name: 'Name', exact: true }).fill('Lighting'); await parent.selectOption('project-kitchen'); await dlg.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForTimeout(800); r.urlAfter = page.url(); r.notice = await page.getByText(/recorded in/).first().innerText().catch(() => null); return r; });
// More menu escape
await go('/projects/project-kitchen');
await tryit('moreEscape', async () => { await page.getByRole('button', { name: /More project actions/ }).click(); await page.waitForTimeout(200); const inside = page.getByRole('textbox').filter({ hasText: '' }); await page.keyboard.press('Tab'); await page.keyboard.press('Escape'); await page.waitForTimeout(200); return { after: await active() }; });
// Page settings gear escape and toggle focus
await go('/projects/project-kitchen');
await tryit('pageSettings', async () => { const g = page.getByRole('button', { name: /Project page settings/ }).first(); await g.click(); await page.waitForTimeout(300); const r = { focusAfterOpen: await active() }; const cb = page.getByRole('checkbox', { name: /Reflections/ }).first(); await cb.click(); await page.waitForTimeout(600); r.focusAfterToggle = await active(); await cb.click().catch(() => {}); await page.waitForTimeout(600); await page.keyboard.press('Escape'); await page.waitForTimeout(200); r.openAfterEscape = await page.getByRole('checkbox', { name: /Reflections/ }).first().isVisible().catch(() => false); return r; });
// Task drawer
await go('/projects/project-kitchen');
await tryit('drawer', async () => { const b = page.getByRole('button', { name: /Choose appliance finishes, open details/ }); await b.click(); await page.waitForTimeout(400); const txt = await page.locator('body').innerText(); const due = page.getByLabel('Due date', { exact: true }); return { showsId: txt.includes('project-kitchen'), showsTodo: /\btodo\b/.test(txt), focus: await active(), dueType: await due.getAttribute('type').catch(() => null), drawerTop: await page.getByText('TASK DETAILS', { exact: false }).first().boundingBox().then(b => b && Math.round(b.y)).catch(() => null), escape: await (async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(200); return await page.getByText(/Task details/i).first().isVisible().catch(() => false); })() }; });
// Section removal notice
await go('/projects/project-kitchen');
await tryit('removal', async () => { await page.getByRole('button', { name: /^Remove section / }).first().click({ force: true }); await page.waitForTimeout(800); const notice = await page.locator('body').innerText(); const m = notice.match(/[^\n]*(Archive|Undo)[^\n]*/g); return { lines: (m || []).slice(0, 6), undoButtonInNotice: await page.getByRole('button', { name: /^Undo$/ }).count(), confirmDialog: await page.getByRole('dialog').count() }; });
await tryit('activityAfterRemoval', async () => (await page.getByText(/Section (removed|added|archived)/).allInnerTexts()).slice(0, 3));
// Archive restore focus & feedback
await go('/projects/project-renovation/pages/archive');
await tryit('archive', async () => { const r = { h2: await page.getByRole('heading', { name: 'Archive' }).count(), regions: await page.getByRole('region', { name: 'Archive' }).count(), restoreLabels: await page.getByRole('button', { name: /Restore/ }).allInnerTexts() }; const first = page.getByRole('button', { name: /^Restore/ }).first(); r.restoreStyle = await style(first, ['backgroundColor', 'color', 'borderStyle', 'height']); await first.click(); await page.waitForTimeout(900); r.focusAfter = await active(); r.status = (await page.getByRole('status').allInnerTexts()).filter(Boolean).slice(0, 3); return r; });
// Agents
await post('/prototype/seed', { seed: 'agent-heavy' }); await post('/prototype/clock', { now: '2026-08-24T16:00:00.000Z' });
await go('/settings/agents');
await tryit('agents', async () => ({ connect: await page.getByRole('button', { name: /connect|new agent|add agent/i }).count(), connectLink: await page.getByRole('link', { name: /connect/i }).count(), revoke: await page.getByRole('button', { name: /Revoke/ }).evaluateAll(es => es.map(e => ({ d: e.disabled, bg: getComputedStyle(e).backgroundColor, op: getComputedStyle(e).opacity, color: getComputedStyle(e).color }))), ariaCurrent: await page.locator('[aria-current]').count() }));
await go('/settings');
await tryit('settingsCurrent', async () => page.locator('[aria-current]').evaluateAll(es => es.map(e => e.textContent.trim())));
return facts;
