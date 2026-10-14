// Walkthrough daemon: one persistent headless browser page per auditor, driven over HTTP.
// Browser requests to localhost:4200 go to the static build on 4201 and requests to the
// host on 4310 go to this auditor's own isolated host, so no auditor touches another's data
// or the developer's live workspace.
// Disposable Slice 70 audit rig (Phase 1). Not part of pnpm test or e2e.
// Usage: node walkd.mjs --name demo --host 4321 --ctl 5321 [--viewport 1440x900] [--touch] [--theme dark]
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const REPO = resolve(import.meta.dirname, '..', '..', '..', '..');
const require = createRequire(`${REPO}/apps/e2e/package.json`);
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => { const [k, ...v] = s.trim().split(' '); return [k, v.join(' ') || true]; }));
const SEED_NOW = '2026-08-24T16:00:00.000Z';
const hostPort = Number(args.host), ctl = Number(args.ctl);
const [w, h] = String(args.viewport ?? (args.touch ? '375x812' : '1440x900')).split('x').map(Number);
const out = resolve(import.meta.dirname, '..', '..', 'ux-output', 'walk', String(args.name));
mkdirSync(out, { recursive: true });
process.on('unhandledRejection', e => console.error('unhandled', e?.message));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!args.touch, isMobile: !!args.touch, colorScheme: args.theme ?? 'dark', timezoneId: 'UTC', locale: 'en-US' });
await context.route('http://localhost:4200/**', r => r.fallback({ url: r.request().url().replace('http://localhost:4200', 'http://localhost:4201') }));
await context.route(/^http:\/\/(localhost|127\.0\.0\.1):4310\//, r => r.fallback({ url: r.request().url().replace(/^http:\/\/(localhost|127\.0\.0\.1):4310/, `http://127.0.0.1:${hostPort}`) }));
const page = await context.newPage();
await page.clock.install({ time: new Date(SEED_NOW) });
await page.clock.resume();
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
const hostPost = async (path, body) => { const r = await fetch(`http://127.0.0.1:${hostPort}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`); };
let n = 0;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const commands = {
  async run({ code }) { const result = await new AsyncFunction('page', 'context', 'expect', 'out', code)(page, context, expect, out); return { result }; },
  async shot({ name, full, selector }) { const file = resolve(out, `${String(++n).padStart(3, '0')}-${name ?? 'shot'}.png`); if (selector) await page.locator(selector).first().screenshot({ path: file }); else await page.screenshot({ path: file, fullPage: !!full }); return { file }; },
  async aria({ selector }) { return { aria: await page.locator(selector ?? 'body').first().ariaSnapshot() }; },
  async axe({ name }) { const scan = await new AxeBuilder({ page }).analyze(); const file = resolve(out, `${String(++n).padStart(3, '0')}-${name ?? 'axe'}.axe.json`); writeFileSync(file, JSON.stringify(scan, null, 2)); return { file, violations: scan.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 5).map(x => x.target.join(' ')) })) }; },
  async seed({ seed }) { await hostPost('/prototype/seed', { seed }); await hostPost('/prototype/clock', { now: SEED_NOW }); return {}; },
  async goto({ path }) { await page.goto(`http://localhost:4200${path ?? '/app'}`); await page.waitForLoadState('networkidle').catch(() => {}); return {}; },
  async console() { return { errors: consoleErrors.splice(0) }; },
  async quit() { setTimeout(async () => { await browser.close(); process.exit(0); }, 50); return {}; },
};
createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    const cmd = new URL(req.url, 'http://x').pathname.slice(1);
    let payload;
    try { payload = { ok: true, ...(await commands[cmd](body ? JSON.parse(body) : {})) }; }
    catch (e) { payload = { ok: false, error: String(e?.message ?? e).slice(0, 4000) }; }
    try { payload.url = page.url().replace('http://localhost:4200', ''); payload.title = await page.title(); } catch {}
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload));
  });
}).listen(ctl, '127.0.0.1', () => console.log(`walkd ${args.name} ctl ${ctl} host ${hostPort} ${w}x${h}${args.touch ? ' touch' : ''} out ${out}`));
