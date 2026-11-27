// Slice 82 step 4b: the dashboard's Get started New project button, the sidebar name field, focus on the new
// project's title, and how a project without an emoji sits in the sidebar. Run after `seed empty` at 1440, dark.
const r = {};
const main = () => page.locator('main').first();
await page.emulateMedia({ colorScheme: 'dark' });
await page.goto('http://localhost:4200/app'); await page.waitForTimeout(1500);
const btn = main().getByRole('button', { name: 'New project' }).first();
r.btnBox = await btn.boundingBox();
await btn.click(); await page.waitForTimeout(500);
r.focus = await page.evaluate(() => { const a = document.activeElement; const b = a.getBoundingClientRect(); return { tag: a.tagName, label: a.getAttribute('aria-label') || a.labels?.[0]?.innerText || a.placeholder, x: Math.round(b.x), w: Math.round(b.width), inSidebar: !!a.closest('aside,nav'), mainStill: document.querySelector('main').innerText.includes('No projects yet') }; });
await page.keyboard.type('Community garden plan');
r.field = await page.evaluate(() => { const a = document.activeElement; return { clientW: a.clientWidth, scrollW: a.scrollWidth, scrollLeft: a.scrollLeft }; });
await page.screenshot({ path: `${out}/empty-new-project-form.png` });
await page.keyboard.press('Enter'); await page.waitForTimeout(1800);
r.afterCreate = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { url: location.pathname, tag: a.tagName, focusVisible: a.matches(':focus-visible'), outline: `${cs.outlineColor} ${cs.outlineWidth} ${cs.outlineStyle}`, w: Math.round(a.getBoundingClientRect().width) }; });
await page.screenshot({ path: `${out}/empty-new-project-h1.png` });
// keyboard path as W3 did it: the sidebar's + by keyboard
await page.goto('http://localhost:4200/app'); await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'New project' }).last().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
await page.keyboard.type('Second plan'); await page.keyboard.press('Enter'); await page.waitForTimeout(1800);
r.afterKeyboardCreate = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { tag: a.tagName, focusVisible: a.matches(':focus-visible'), outline: `${cs.outlineColor} ${cs.outlineWidth} ${cs.outlineStyle}`, w: Math.round(a.getBoundingClientRect().width) }; });
await page.goto('http://localhost:4200/app'); await page.waitForTimeout(1200);
r.sidebarRows = await page.getByRole('navigation').first().getByRole('link').evaluateAll(as => as.filter(a => /plan/.test(a.textContent)).map(a => { const leaf = [...a.querySelectorAll('*')].filter(e => !e.children.length && /plan/.test(e.textContent))[0] ?? a; return { t: a.textContent.trim(), textLeft: Math.round(leaf.getBoundingClientRect().left) }; }));
await page.emulateMedia({ colorScheme: 'light' });
return r;
