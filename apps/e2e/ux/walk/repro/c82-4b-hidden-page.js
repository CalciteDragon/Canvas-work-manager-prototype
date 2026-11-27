// Slice 82 step 4b: with the Reflections page switched off (Pages popover), what the Reflections shortcut on
// Home renovation's canvas shows and where its Open source goes; then All projects from Kitchen.
// Run on nested-projects after the Reflections page has been switched off (c82-4b-keyboard-new.js does it).
const r = {};
const main = () => page.locator('main').first();
await page.goto('http://localhost:4200/projects/project-renovation'); await page.waitForTimeout(1500);
const frame = main().locator('section, article').filter({ hasText: 'A clear decision' }).filter({ hasText: 'Open source' }).last();
r.frame = (await frame.innerText()).slice(0, 300);
const open = frame.getByText('Open source').first();
r.openTag = await open.evaluate(e => e.tagName + ' ' + (e.getAttribute('href') ?? ''));
const y0 = await page.evaluate(() => document.querySelector('main').scrollTop);
await open.scrollIntoViewIfNeeded(); const y1 = await page.evaluate(() => document.querySelector('main').scrollTop);
await open.click(); await page.waitForTimeout(1500);
r.after = { url: page.url().replace('http://localhost:4200', ''), y0, y1, y2: await page.evaluate(() => document.querySelector('main').scrollTop), live: (await page.locator('[role=status],[role=alert]').allInnerTexts()).filter(Boolean), notice: (await main().innerText()).match(/[^\n]*(switched off|turned off|hidden|Enable)[^\n]*/g)?.slice(0, 3) };
await page.goto('http://localhost:4200/projects/project-kitchen'); await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'All projects' }).click(); await page.waitForTimeout(800);
r.allProjects = { url: page.url().replace('http://localhost:4200', ''), nav: (await page.getByRole('navigation').first().innerText()).slice(0, 300).replace(/\n/g, '|') };
return r;
