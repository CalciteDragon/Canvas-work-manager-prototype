// Slice 82 step 4a, comb item 6: a write fails while the workspace is unreachable; what does the header history show?
// Non-GET /api requests and history reads fail at the network (unreachable); everything else falls through (route.fallback()).
let unreachable = true;
const pattern = /:(4310|4320)\/api\//;
const handler = route => {
  const r = route.request();
  if (unreachable && (r.method() !== 'GET' || /history/.test(r.url()))) return route.abort('connectionrefused');
  return route.fallback();
};
await context.route(pattern, handler);
await page.goto('http://localhost:4200/projects/project-kitchen');
await page.waitForTimeout(1200);
const list = page.getByRole('region', { name: 'Task List' }).first();
await list.getByRole('textbox').first().fill('Order hinges');
await list.getByRole('button', { name: /Add task/ }).click();
await page.waitForTimeout(2500);
const history = page.getByRole('group', { name: 'Project history' });
const during = { history: await history.innerText().catch(() => null), historyButtons: await history.getByRole('button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label') || b.textContent.trim())).catch(() => null), live: (await page.locator('[role=status],[role=alert]').allInnerTexts()).filter(Boolean) };
unreachable = false;
await page.waitForTimeout(4000);
const after = { historyButtons: await history.getByRole('button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label') || b.textContent.trim())).catch(() => null) };
await context.unroute(pattern, handler); // only this handler: walkd's own 4200/4310 routes must stay
return { during, afterReachableAgain4s: after };
