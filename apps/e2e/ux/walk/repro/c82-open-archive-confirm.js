// Slice 82 step 4a: open Kitchen's archive confirmation (items 10, 11, 16) and report its text and button gaps.
await page.goto('http://localhost:4200/projects/project-kitchen');
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'More project actions' }).click();
await page.getByRole('menuitem', { name: /^Archive/ }).click();
const dialog = page.getByRole('dialog').first();
await dialog.waitFor();
const boxes = await dialog.getByRole('button').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return { name: b.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) }; }));
return { text: await dialog.innerText(), buttons: boxes };
