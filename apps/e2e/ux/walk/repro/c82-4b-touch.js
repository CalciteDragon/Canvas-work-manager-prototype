// Slice 82 step 4b, on a touch 375x812 daemon: section tool opacity at rest, the Pages popover from the phone
// drawer's pencil menu, and the breadcrumb of a third-level workstream. Run after `seed nested-projects`.
const r = {};
const main = () => page.locator('main').first();
await page.goto('http://localhost:4200/projects/project-kitchen'); await page.waitForTimeout(1500);
r.toolOpacity = await main().getByRole('button', { name: 'Rename Markdown' }).evaluate(b => { let o = 1, e = b; while (e && e !== document.body) { o *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; } return { effective: o, color: getComputedStyle(b).color }; });
// Pages from the drawer's pencil menu
await page.getByRole('button', { name: 'Menu' }).tap(); await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Edit project' }).first().tap(); await page.waitForTimeout(400);
await page.getByRole('menuitem', { name: /Pages of/ }).tap(); await page.waitForTimeout(700);
r.drawerOpenAfterPages = await page.getByRole('button', { name: 'Close navigation' }).first().isVisible().catch(() => false);
const toggle = page.getByLabel('Show Reflections page');
r.before = await toggle.isChecked();
await toggle.tap(); await page.waitForTimeout(900);
r.after = await toggle.isChecked().catch(() => 'popover gone');
r.live = (await page.locator('[role=status],[role=alert]').allInnerTexts()).filter(Boolean);
await page.screenshot({ path: `${out}/touch-pages-toggle.png` });
await toggle.tap().catch(() => {}); await page.waitForTimeout(600); await page.keyboard.press('Escape');
// breadcrumb at depth (Cabinets is under Kitchen)
await page.goto('http://localhost:4200/projects/project-cabinets'); await page.waitForTimeout(1500);
r.crumbs = await page.getByRole('navigation', { name: 'Breadcrumb' }).first().locator('li,a,span').evaluateAll(es => es.filter(e => !e.children.length && e.textContent.trim()).map(e => { const b = e.getBoundingClientRect(); return { t: e.textContent.trim(), y: Math.round(b.y), h: Math.round(b.height) }; }));
await page.screenshot({ path: `${out}/touch-breadcrumb-cabinets.png` });
return r;
