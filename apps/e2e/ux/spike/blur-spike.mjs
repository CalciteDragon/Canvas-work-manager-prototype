// Slice 71's disposable, opt-in measurement. No product source or developer data is changed.
// Build first: pnpm --filter web build. Run from any directory with node blur-spike.mjs.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = resolve(import.meta.dirname, '../../../..');
const require = createRequire(resolve(repo, 'apps/e2e/package.json'));
const hostRequire = createRequire(resolve(repo, 'apps/prototype-host/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = resolve(repo, 'apps/e2e/ux-output/spike');
const smoke = process.argv.includes('--smoke');
const resultPath = smoke ? resolve(out, 'smoke.json') : resolve(repo, 'docs/roadmap/70-ui-ux/blur-spike.json');
const dist = resolve(repo, 'apps/web/dist/web/browser');
const now = '2026-08-24T16:00:00.000Z';
const sheetSelector = '.section-frame,.shortcut-frame,app-dashboard-widget-frame,.project-header';
const variants = ['V0', 'V1', 'V2', 'V3', 'V4'];
const environments = [
  { id: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, cpuRate: 1 },
  { id: 'touch', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, cpuRate: 4 },
];
const surfaces = [
  { id: 'busy-work', seed: 'busy-week', route: '/projects/project-launch' },
  { id: 'agent-work', seed: 'agent-heavy', route: '/projects/project-work-manager' },
  { id: 'agent-dashboard', seed: 'agent-heavy', route: '/app' },
];
const children = [];
const percentile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)] ?? null;
const median = values => percentile(values, 0.5);
async function freePort(port, host) {
  await new Promise((ok, fail) => {
    const server = createServer();
    server.once('error', () => fail(new Error(`Port ${port} on ${host} is already occupied; stop the other rig. No existing process was killed.`)));
    server.listen(port, host, () => server.close(ok));
  });
}
async function start(args, env, logName, ready) {
  const log = [];
  const child = spawn(process.execPath, args, { cwd: repo, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.stdout.on('data', bytes => log.push(bytes.toString()));
  child.stderr.on('data', bytes => log.push(bytes.toString()));
  child.once('exit', () => { void writeFile(resolve(out, logName), log.join('')); });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      await writeFile(resolve(out, logName), log.join(''));
      throw new Error(`${logName} exited ${child.exitCode}: ${log.join('')}`);
    }
    try { if ((await fetch(ready)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  await writeFile(resolve(out, logName), log.join(''));
  throw new Error(`${logName} did not become ready within 60 s`);
}
async function stop() {
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue;
    const exited = new Promise(r => child.once('exit', r));
    child.kill();
    await Promise.race([exited, new Promise(r => setTimeout(r, 3000))]);
  }
}
async function post(path, body) {
  const response = await fetch(`http://127.0.0.1:4321${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
}
async function prepare(browser, environment, surface, variant, theme, css) {
  const { id: _id, cpuRate, ...contextOptions } = environment;
  const context = await browser.newContext({ ...contextOptions, colorScheme: theme, timezoneId: 'UTC', locale: 'en-US' });
  await context.route('http://localhost:4200/**', route => route.fallback({ url: route.request().url().replace('http://localhost:4200', 'http://localhost:4201') }));
  await context.route(/^http:\/\/(localhost|127\.0\.0\.1):4310\//, route => route.fallback({ url: route.request().url().replace(/^http:\/\/(localhost|127\.0\.0\.1):4310/, 'http://127.0.0.1:4321') }));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  await page.goto(`http://localhost:4200${surface.route}`);
  await expect(page.locator('[data-identity-name]')).toHaveText('Demo User');
  await page.waitForLoadState('networkidle');
  if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to the ${theme} theme` }).click();
  if (variant !== 'V0') {
    await page.evaluate(value => { document.documentElement.dataset.blurVariant = value; }, variant);
    await page.addStyleTag({ content: css });
  }
  if (variant === 'V4') await page.evaluate(selector => {
    const root = [...document.querySelectorAll('main.workspace,.project-workspace__main')]
      .filter(element => /auto|scroll/.test(getComputedStyle(element).overflowY))
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
    if (!root) throw new Error('V4 requires the actual main scroll region as its observer root');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) entry.target.setAttribute('data-spike-blur', 'active');
        else entry.target.removeAttribute('data-spike-blur');
      }
    }, { root, rootMargin: `${innerHeight}px 0px` });
    document.querySelectorAll(selector).forEach(element => observer.observe(element));
    window.__spikeObserver = observer;
  }, sheetSelector);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { context, page, cdp };
}
async function traceEnd(cdp, path) {
  const complete = new Promise(r => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  const { stream } = await complete;
  let content = '';
  while (true) {
    const part = await cdp.send('IO.read', { handle: stream });
    content += part.base64Encoded ? Buffer.from(part.data, 'base64').toString() : part.data;
    if (part.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  await writeFile(path, content);
  const events = JSON.parse(content).traceEvents;
  const names = {};
  for (const event of events) if (/frame/i.test(event.name)) names[event.name] = (names[event.name] ?? 0) + 1;
  const signalAvailable = Object.keys(names).some(name => /^(BeginFrame|DrawFrame|DroppedFrame|FrameDropped)$/.test(name));
  return { dropped: signalAvailable ? events.filter(event => event.name === 'DroppedFrame' || event.name === 'FrameDropped').length : null, signalAvailable, softwareCompositor: Object.keys(names).some(name => /SoftwareRenderer::/.test(name)), frameEventCounts: names };
}
async function measure(page, cdp, tracePath, surface) {
  // Idle vsync is measured on this page at the run's DPR and CPU throttle, without clock mocks.
  const idle = await page.evaluate(() => new Promise(resolve => {
    const deltas = []; let previous;
    function tick(time) { if (previous !== undefined) deltas.push(time - previous); previous = time; if (deltas.length < 90) requestAnimationFrame(tick); else resolve(deltas); }
    requestAnimationFrame(tick);
  }));
  const vsyncMs = median(idle);
  await cdp.send('Performance.enable');
  const getMetrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
  const before = await getMetrics();
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,viz', transferMode: 'ReturnAsStream' });
  await page.evaluate(() => {
    window.__spikeFrames = []; window.__spikeRunning = true; let previous;
    function tick(time) { if (!window.__spikeRunning) return; if (previous !== undefined) window.__spikeFrames.push(time - previous); previous = time; requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  });
  const scroll = await page.evaluate(async () => {
    const regions = [...document.querySelectorAll('main.workspace,.project-workspace__main')].filter(element => /auto|scroll/.test(getComputedStyle(element).overflowY));
    const region = regions.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
    if (!region) throw new Error('No main scroll region');
    region.scrollTop = 0;
    const distance = region.scrollHeight - region.clientHeight;
    // Time-based, fixed 600 CSS px/s. A non-scrollable region is disclosed, not padded.
    const duration = distance / 600 * 1000;
    await new Promise(resolve => {
      let start;
      function tick(time) { start ??= time; region.scrollTop = Math.min(distance, (time - start) * 0.6); if (time - start < duration) requestAnimationFrame(tick); else resolve(); }
      requestAnimationFrame(tick);
    });
    return { selector: region.matches('.project-workspace__main') ? '.project-workspace__main' : 'main.workspace', distanceCssPx: distance, durationMs: duration };
  });
  const titles = page.getByRole('button', { name: /, open details$/ });
  let drawer;
  if (await titles.count()) {
    await titles.first().click();
    await expect(page.locator('[data-task-drawer]')).toBeVisible();
    await page.waitForTimeout(400);
    await page.locator('[data-close-drawer]').click();
    await expect(page.locator('[data-task-drawer]')).toHaveCount(0);
    await page.waitForTimeout(400);
    drawer = { exercised: true };
  } else {
    if (surface.route !== '/app') throw new Error(`${surface.id} must expose a task-details button to satisfy the drawer measurement`);
    drawer = { exercised: false, reason: 'This surface exposes no task-details button. Dashboard scroll is measured; its task drawer segment is unavailable.' };
  }
  const intervals = await page.evaluate(() => { window.__spikeRunning = false; return window.__spikeFrames; });
  const after = await getMetrics();
  const trace = await traceEnd(cdp, tracePath);
  const visual = await page.evaluate(() => {
    const filters = [...document.querySelectorAll('*')].filter(element => getComputedStyle(element).backdropFilter !== 'none');
    const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl'); const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return { backdropFilterElements: filters.length, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? 'unavailable' };
  });
  return { vsyncMs, frames: intervals.length, p50Ms: median(intervals), p95Ms: percentile(intervals, 0.95), longPercent: 100 * intervals.filter(value => value > 1.5 * vsyncMs).length / intervals.length, droppedPercent: 100 * intervals.filter(value => value > 2 * vsyncMs).length / intervals.length, trace, performance: Object.fromEntries(['LayoutDuration','RecalcStyleDuration','TaskDuration','LayoutCount','RecalcStyleCount'].map(key => [key, after[key] - before[key]])), ...visual, pessimisticSoftwareRenderer: trace.softwareCompositor || /swiftshader|llvmpipe|software/i.test(visual.renderer), scroll, drawer, tracePath: tracePath.replace(repo + '/', '').replaceAll('\\', '/') };
}
let browser;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void (async () => { await browser?.close(); await stop(); process.exit(130); })();
});
try {
  await access(resolve(dist, 'index.html'));
  const css = await readFile(resolve(import.meta.dirname, 'variants.css'), 'utf8');
  await mkdir(out, { recursive: true });
  for (const port of [4201, 4321]) for (const host of ['localhost', '127.0.0.1']) await freePort(port, host);
  const dataFile = resolve(out, 'data.json');
  await copyFile(resolve(repo, 'prototype/seeds/empty.json'), dataFile);
  await start([resolve(repo, 'apps/e2e/ux/walk/static.mjs'), dist, '4201'], {}, 'static.log', 'http://localhost:4201');
  // Same host environment as env.sh, without its extra walkthrough browser.
  await start(['--import', pathToFileURL(hostRequire.resolve('tsx')).href, resolve(repo, 'apps/prototype-host/main.ts')], { CWM_HOST_PORT: '4321', CWM_DATA_FILE: dataFile }, 'host.log', 'http://127.0.0.1:4321/prototype/state');
  browser = await chromium.launch();
  const result = { slice: 71, smoke, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), environment: { staticPort: 4201, hostPort: 4321, environments, browserVersion: browser.version(), platform: process.platform }, method: { repeats: smoke ? 1 : 3, summary: 'Per-cell medians across three fresh contexts, dark theme; paired dark/light captures separately.', scrollCssPxPerSecond: 600, traceCategories: 'devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,viz', thresholds: { sanityLongPercent: 2, desktop: { longPercent: 2, droppedPercent: 0.5 }, touch: { longPercent: 5, droppedPercent: 2 } }, knownLimit: 'CPU throttling slows the main thread, not most blur raster/compositor work. DPR 3 is a raster-load proxy. This is not a real phone. Software renderers are pessimistic. Trace dropped counts only count explicit DroppedFrame/FrameDropped events; available frame-event names are retained.' }, cells: [], captures: [], recommendation: null };
  for (const environment of smoke ? environments.slice(0, 1) : environments) for (const surface of smoke ? surfaces.slice(0, 1) : surfaces) for (const variant of smoke ? ['V0','V3'] : variants) {
    const runs = [];
    for (let repeat = 1; repeat <= result.method.repeats; repeat++) {
      console.log(`Starting ${environment.id} ${surface.id} ${variant} repeat ${repeat}/${result.method.repeats}`);
      await post('/prototype/seed', { seed: surface.seed }); await post('/prototype/clock', { now });
      const { context, page, cdp } = await prepare(browser, environment, surface, variant, 'dark', css);
      try { runs.push(await measure(page, cdp, resolve(out, `${environment.id}-${surface.id}-${variant}-${repeat}.trace.json`), surface)); }
      finally { await context.close(); }
    }
    const keys = ['vsyncMs','frames','p50Ms','p95Ms','longPercent','droppedPercent','backdropFilterElements'];
    const summary = Object.fromEntries(keys.map(key => [key, median(runs.map(run => run[key]))]));
    summary.traceDropped = median(runs.map(run => run.trace.dropped).filter(value => value !== null));
    summary.softwareCompositor = runs.some(run => run.trace.softwareCompositor);
    summary.pessimisticSoftwareRenderer = runs.some(run => run.pessimisticSoftwareRenderer);
    summary.performance = Object.fromEntries(Object.keys(runs[0].performance).map(key => [key, median(runs.map(run => run.performance[key]))]));
    result.cells.push({ environment: environment.id, surface: surface.id, variant, seed: surface.seed, route: surface.route, summary, runs });
    await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`${environment.id} ${surface.id} ${variant}: long ${summary.longPercent.toFixed(2)}%, dropped ${summary.droppedPercent.toFixed(2)}%, p95 ${summary.p95Ms.toFixed(2)} ms`);
  }
  for (const variant of ['V2','V3','V4']) for (const theme of ['dark','light']) {
    await post('/prototype/seed', { seed: 'busy-week' }); await post('/prototype/clock', { now });
    const { context, page } = await prepare(browser, environments[0], surfaces[0], variant, theme, css);
    const file = resolve(out, `${variant}-${theme}.png`);
    try { await page.screenshot({ path: file }); result.captures.push({ variant, theme, surface: 'busy-work', environment: 'desktop', file }); }
    finally { await context.close(); }
  }
  const noisy = result.cells.filter(cell => cell.variant === 'V0' && cell.summary.longPercent > 2);
  const smooth = variant => result.cells.filter(cell => cell.variant === variant).every(cell => {
    const threshold = result.method.thresholds[cell.environment];
    return cell.summary.longPercent <= threshold.longPercent && cell.summary.droppedPercent <= threshold.droppedPercent;
  });
  result.recommendation = smoke ? { status: 'smoke-only', variant: null, reason: 'Incomplete smoke matrix cannot rank variants.' } : noisy.length ? { status: 'environment-too-noisy', variant: null, reason: 'V0 failed the pre-registered sanity gate; variants must not be ranked.', noisyCells: noisy.map(cell => `${cell.environment}/${cell.surface}`) } : { status: 'measured', variant: ['V3','V4','V2','V1'].find(smooth) ?? null, reason: 'Most expressive variant satisfying both frame thresholds on every surface and environment. The user chooses the blur rule.' };
  result.acceptanceLimitations = result.cells.filter(cell => cell.runs.some(run => !run.drawer.exercised)).map(cell => `${cell.environment}/${cell.surface}/${cell.variant}: no task drawer on this surface`);
  result.method.canvasNaming = 'The specified project-launch and project-work-manager seeds are roots. Their canonical canvases are labelled Home in the current app, although the plan calls them Work. The specified project routes were measured without changing seeds.';
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
  result.method.traceSignal = 'The Chromium smoke emitted explicit DroppedFrame events with V3 and frame lifecycle events with V0. Per-run independent counts are unavailable (null) if no BeginFrame/DrawFrame/DroppedFrame family is emitted. SoftwareRenderer:: frame events additionally label software compositor measurements pessimistic, even if WebGL reports the physical GPU.';
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
  const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const number = value => value === null || value === undefined ? 'n/a' : Number(value).toFixed(2);
  const rows = environments.flatMap(environment => surfaces.map(surface => `<tr><th>${escape(environment.id)}<br>${escape(surface.id)}</th>${variants.map(variant => {
    const cell = result.cells.find(candidate => candidate.environment === environment.id && candidate.surface === surface.id && candidate.variant === variant);
    return cell ? `<td><b>${number(cell.summary.longPercent)} / ${number(cell.summary.droppedPercent)}%</b><br>p95 ${number(cell.summary.p95Ms)} ms<br>trace dropped ${cell.summary.traceDropped ?? 'unavailable'}${cell.summary.pessimisticSoftwareRenderer ? '<br>software: pessimistic' : ''}</td>` : '<td>not measured</td>';
  }).join('')}</tr>`));
  const pairs = ['V2','V3','V4'].map(variant => `<section><h2>${variant}</h2><div class="pair">${['dark','light'].map(theme => `<figure><a href="${variant}-${theme}.png"><img src="${variant}-${theme}.png" alt="${variant} ${theme}, busy-week Work desktop"></a><figcaption>${theme}</figcaption></figure>`).join('')}</div></section>`).join('');
  await writeFile(resolve(out, smoke ? 'smoke-checkpoint.html' : 'checkpoint.html'), `<!doctype html><meta charset="utf-8"><title>Slice 71 blur checkpoint</title><style>body{font:14px system-ui;background:#10131b;color:#e5e7ed;margin:24px;max-width:1500px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #525864;padding:8px;font-size:12px}th{background:#202634}p{max-width:1100px;line-height:1.5}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;display:block}figcaption{text-align:center;margin:6px}h2{margin-top:32px}</style><h1>Slice 71 blur spike${smoke ? ' — smoke only' : ''}</h1><p><b>${escape(result.recommendation.status)}:</b> ${escape(result.recommendation.reason)} ${result.recommendation.variant ?? ''}</p><p>Cells show median long / dropped rAF frame shares; p95 interval; independent trace dropped count. Long &gt;1.5× measured vsync; dropped &gt;2×. V0 sanity requires ≤2% long on every cell. Desktop smooth ≤2% / 0.5%; touch smooth ≤5% / 2%. Dark theme, three repeats. Dashboard exposes no drawer; drawer actions measured on Work surfaces only.</p><table><thead><tr><th>Environment / surface</th>${variants.map(variant => `<th>${variant}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table><p>${escape(result.method.knownLimit)}</p><p>Measured renderer: ${escape([...new Set(result.cells.flatMap(cell => cell.runs.map(run => run.renderer)))].join('; '))}</p>${pairs}`);
  console.log(JSON.stringify(result.recommendation));
} finally {
  await browser?.close();
  await stop();
}
