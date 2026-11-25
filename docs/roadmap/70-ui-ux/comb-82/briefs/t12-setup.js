// T12's starting condition: the Task List on the current page fails to read, once.
// Run from the repository root, after seeding and navigating with the daemon's own commands:
//   node apps/e2e/ux/walk/walk.mjs <ctl> seed busy-week
//   node apps/e2e/ux/walk/walk.mjs <ctl> goto /projects/project-launch
//   node apps/e2e/ux/walk/walk.mjs <ctl> run -f docs/roadmap/70-ui-ux/comb-82/briefs/t12-setup.js
// (W4: go to your persona's own project, which must hold a Task List, instead of project-launch.)
// The body runs inside walkd's `run` with only page, context, expect and out in scope.
// It routes every GET of the task list read to a 500 (all other requests fall back to the
// rig's own routing), reloads, waits until the failure has rendered inside a Task List frame,
// then lifts the failure, so whatever the walker does next reaches the real host.
// What the page offers for recovering is the walker's to find; this file never touches it.
const frameSelector = '[data-section-frame][data-section-type="task-list"]';
const reason = 'Audit: tasks read failed';
let failing = true;
const matcher = url => url.pathname === '/api/tasks';
const handler = route => (failing && route.request().method() === 'GET'
  ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: reason }) })
  : route.fallback());
await page.route(matcher, handler);
try {
  await page.reload();
  await page.waitForFunction(({ root, reason }) => {
    const shown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.checkVisibility({ visibilityProperty: true }); };
    for (const scope of document.querySelectorAll(root)) {
      for (const e of scope.querySelectorAll('[role=alert]')) if (e.textContent?.trim() && shown(e)) return true;
      for (const e of [scope, ...scope.querySelectorAll('*')]) if ([...e.attributes].some(a => /^data-.*error/.test(a.name)) && shown(e)) return true;
      for (const e of scope.querySelectorAll('[data-failure-sentence]')) if (e.textContent?.trim() && shown(e)) return true;
      if (scope.innerText?.includes(reason) || (scope.querySelector('details') && scope.textContent?.includes(reason))) return true;
    }
    return false;
  }, { root: frameSelector, reason }, { timeout: 15000 });
} finally {
  failing = false;
  await page.unroute(matcher, handler);
}
return { ready: true, taskListFrames: await page.locator(frameSelector).count(), url: page.url().replace('http://localhost:4200', '') };
