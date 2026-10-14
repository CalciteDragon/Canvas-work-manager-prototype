// Orchestrator reproduction 2: accessible names, hover-only chrome, density, themes, narrow widths.
const facts = {};
const host = 'http://127.0.0.1:4320';
const post = (p, b) => fetch(host + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' }, body: JSON.stringify(b) });
const seed = async s => { await post('/prototype/seed', { seed: s }); await post('/prototype/clock', { now: '2026-08-24T16:00:00.000Z' }); };
const go = async p => { await page.goto('http://localhost:4200' + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300); };
const shot = async (n, opts = {}) => { const f = `${out}/r2-${n}.png`; await page.screenshot({ path: f, ...opts }); return f; };
const tryit = async (k, fn) => { try { facts[k] = await fn(); } catch (e) { facts[k] = 'ERROR ' + String(e.message).slice(0, 160); } };
await page.setViewportSize({ width: 1440, height: 900 });
await seed('nested-projects');
await go('/projects/project-kitchen');
await tryit('regionAria', async () => (await page.locator('main').first().ariaSnapshot()).split('\n').filter(l => /region|heading "/.test(l)).slice(0, 14));
await tryit('restShot', () => shot('kitchen-rest'));
await tryit('hoverShot', async () => { const sec = page.getByRole('region').nth(2); const b = await sec.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y - 8); await page.waitForTimeout(200); return shot('kitchen-hover-gap'); });
await tryit('insertionChildVisibility', () => page.getByRole('button', { name: 'Insert at the end' }).evaluate(b => [...b.querySelectorAll('*')].map(c => getComputedStyle(c).opacity).join(',') + ' self:' + b.getBoundingClientRect().height));
// make a change so Undo is enabled, compare with disabled redo
await tryit('undoEnabledVsDisabled', async () => { await page.getByRole('checkbox', { name: /^Complete / }).first().click(); await page.waitForTimeout(800); return page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /^(Undo|Redo|Nothing to)/.test(b.getAttribute('aria-label') || '')).map(b => ({ name: b.getAttribute('aria-label'), disabled: b.disabled, color: getComputedStyle(b).color, border: getComputedStyle(b).borderColor, bg: getComputedStyle(b).backgroundColor, cursor: getComputedStyle(b).cursor }))); });
await tryit('headerUndoShot', () => shot('header-undo', { clip: { x: 1200, y: 80, width: 240, height: 80 } }));
// Markdown default title and edit label
await tryit('markdownEditName', () => page.getByRole('button', { name: /^Edit Markdown for/ }).first().getAttribute('aria-label'));
// Reflections & timeline & progress
await tryit('reflectionSelects', () => page.locator('select').evaluateAll(es => es.map(s => ({ label: s.labels?.[0]?.textContent?.trim() || s.getAttribute('aria-label') || null, bg: getComputedStyle(s).backgroundColor, h: s.getBoundingClientRect().height }))));
await tryit('progressbar', () => page.locator('[role=progressbar],progress').evaluateAll(es => es.map(e => ({ name: e.getAttribute('aria-label') || e.getAttribute('aria-labelledby'), tag: e.tagName }))));
await tryit('progressModes', () => page.getByRole('button', { name: /^(Count|Weighted|Use manual)/ }).evaluateAll(es => es.map(e => ({ t: e.textContent.trim(), pressed: e.getAttribute('aria-pressed'), bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color, border: getComputedStyle(e).borderColor }))));
await tryit('timelineButtons', () => page.getByRole('region', { name: /Timeline/ }).locator('button').evaluateAll(es => es.slice(0, 3).map(e => ({ t: e.textContent.trim().slice(0, 50), bg: getComputedStyle(e).backgroundColor, border: getComputedStyle(e).borderStyle, expanded: e.getAttribute('aria-expanded') }))));
await tryit('lowerShot', async () => { await page.getByRole('region', { name: /Reflections/ }).first().scrollIntoViewIfNeeded(); return shot('kitchen-reflections-timeline'); });
// Reflections page timestamps
await go('/projects/project-renovation/pages/reflections');
await tryit('isoTimestamps', async () => ((await page.locator('main').first().innerText()).match(/\d{4}-\d\d-\d\dT[\d:.]+Z/g) || []).slice(0, 2));
await go('/projects/project-renovation/pages/todos');
await tryit('todosHeading', async () => (await page.getByRole('heading').allInnerTexts()).slice(0, 6));
await tryit('todosShot', () => shot('todos'));
// Today widget rows inert (busy-week)
await seed('busy-week');
await go('/app');
await tryit('todayRows', () => page.getByText('Verify analytics events').first().evaluate(e => { let n = e; while (n && n !== document.body) { if (['A', 'BUTTON'].includes(n.tagName) || n.getAttribute('role') === 'button' || n.getAttribute('tabindex') !== null) return n.tagName; n = n.parentElement; } return 'not interactive; cursor ' + getComputedStyle(e).cursor + ', border ' + getComputedStyle(e.closest('li') || e).borderStyle; }));
await tryit('digestFooter', async () => (await page.locator('main').first().innerText()).match(/[^\n]*prototype[^\n]*/gi));
// Theme persistence and light preference
await tryit('themePersistence', async () => { const before = await page.locator('html').getAttribute('data-theme'); await page.getByRole('button', { name: /Switch to the light theme/ }).click(); await page.reload(); await page.waitForLoadState('networkidle'); const afterReload = await page.locator('html').getAttribute('data-theme'); await page.emulateMedia({ colorScheme: 'light' }); await context.clearCookies(); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForLoadState('networkidle'); const withLightPref = await page.locator('html').getAttribute('data-theme'); await page.emulateMedia({ colorScheme: 'dark' }); return { before, afterReload, withLightPref }; });
// 1024 layout
await go('/projects/project-launch');
await page.setViewportSize({ width: 1024, height: 768 });
await page.waitForTimeout(300);
await tryit('nav1024', () => page.evaluate(() => { const navs = [...document.querySelectorAll('nav, aside')].map(n => n.getBoundingClientRect()).filter(r => r.height > 300 && r.width > 100 && r.x < 600); const sum = navs.reduce((s, r) => s + r.width, 0); return { navWidths: navs.map(r => Math.round(r.width)), share: Math.round(sum / innerWidth * 100) }; }));
await tryit('shot1024', () => shot('launch-1024'));
// 375 checks
await page.setViewportSize({ width: 375, height: 812 });
await seed('nested-projects');
await go('/projects/project-renovation/pages/archive');
await tryit('archive375', () => page.evaluate(() => ({ scrollW: document.querySelector('main')?.scrollWidth, clientW: document.querySelector('main')?.clientWidth, docW: document.documentElement.scrollWidth })));
await tryit('archive375Shot', () => shot('archive-375', { fullPage: false }));
await go('/app');
await tryit('dash375', () => page.evaluate(() => { const card = [...document.querySelectorAll('article, section')].find(e => /Today/.test(e.textContent)); return card ? Math.round(card.getBoundingClientRect().width) : null; }));
await tryit('dash375Shot', () => shot('dash-375'));
await page.setViewportSize({ width: 320, height: 640 });
for (const p of ['/app', '/projects/project-renovation/pages/archive', '/projects/project-renovation/pages/reflections']) {
  await go(p);
  await tryit('overflow320 ' + p, () => page.evaluate(() => [...document.querySelectorAll('main, body, html')].map(e => e.tagName + ':' + (e.scrollWidth - e.clientWidth)).join(' ')));
}
await page.setViewportSize({ width: 1440, height: 900 });
// forced colors progress bar
await go('/projects/project-kitchen');
await page.emulateMedia({ forcedColors: 'active' });
await tryit('forcedShot', async () => { await page.getByRole('region', { name: /Progress/ }).first().scrollIntoViewIfNeeded(); return shot('forced-progress'); });
await page.emulateMedia({ forcedColors: 'none' });
return facts;
