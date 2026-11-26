// Slice 82 step 4a, comb item 20: after header Undo (and Redo) of a creation, where is focus?
await page.goto('http://localhost:4200/projects/project-kitchen');
await page.waitForTimeout(1200);
const list = page.getByRole('region', { name: 'Task List' }).first();
await list.getByRole('textbox').first().fill('Order hinges');
await list.getByRole('button', { name: /Add task/ }).click();
await page.waitForTimeout(1200);
const focus = () => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()} ${a.getAttribute('aria-label') ?? a.textContent.trim().slice(0, 40)}` : null; });
const history = page.getByRole('group', { name: 'Project history' });
const undo = history.getByRole('button').first();
const undoLabel = await undo.getAttribute('aria-label');
await undo.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
const afterUndo = { focus: await focus(), live: (await page.locator('[role=status],[role=alert]').allInnerTexts()).filter(Boolean) };
const redo = history.getByRole('button').nth(1);
await redo.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
const afterRedo = { focus: await focus(), live: (await page.locator('[role=status],[role=alert]').allInnerTexts()).filter(Boolean) };
await page.keyboard.press('Tab');
return { undoLabel, afterUndo, afterRedo, nextTab: await focus() };
