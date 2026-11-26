// Slice 82 step 4a, comb item 22: header.project-header at 375x812 on Cabinets, Kitchen, root Todos and the root.
// Run it on a touch 375x812 daemon (env.sh … --touch): a resized desktop page gives lower figures (no 44 px targets).
// The viewport is set to 375x812 (a no-op there) and the one it found is restored at the end.
const before = page.viewportSize();
await page.setViewportSize({ width: 375, height: 812 });
const edges = {};
for (const path of ['/projects/project-cabinets', '/projects/project-kitchen', '/projects/project-renovation/pages/todos', '/projects/project-renovation']) {
  await page.goto(`http://localhost:4200${path}`);
  await page.waitForTimeout(1500);
  edges[path] = await page.evaluate(() => { const h = document.querySelector('header.project-header'); if (!h) return null; const r = h.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; });
}
await page.setViewportSize(before);
return edges;
