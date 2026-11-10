// Slice 81 R1 (disposable, deleted at step 3): writes the navigation alternatives comparison
// sheet from the capture index that `apps/e2e/ux/navigation-alternatives.ts` writes.
// Usage: node docs/roadmap/70-ui-ux/tooling/build-navigation-alternatives.mjs [apps/e2e/ux-output/slice81-alternatives]
// One row per context and view (theme, width, drawer state), one column per option. A row
// missing an option's capture fails the build, so an incomplete run cannot pass as a sheet.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const dir = resolve(process.argv[2] ?? join(REPO, 'apps/e2e/ux-output/slice81-alternatives'));
const indexFile = join(dir, 'index.json');
if (!existsSync(indexFile)) { console.error(`${indexFile} missing: run the alternatives captures first.`); process.exit(1); }
const index = JSON.parse(readFileSync(indexFile, 'utf8'));

const OPTIONS = [['a', 'A · One expanded tree'], ['b', 'B · Focused tree that drills in'], ['c', 'C · Pages in the header']];
const KEYS = [['links', 'Disclosure links (Q4 a)'], ['tree', 'Treeview (Q4 b)']];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const img = (file, alt) => `<a href="${esc(file)}"><img src="${esc(file)}" alt="${esc(alt)}" loading="lazy"></a>`;

// Every context has these views (R1: light and dark; 1440, and 375 with Menu closed and open);
// a context may add more (renovation-root at 1024).
const REQUIRED_VIEWS = ['light', 'dark'].flatMap(theme => ['1440 closed', '375 closed', '375 open'].map(view => `${theme} ${view}`));
const failures = [];
const rows = [];
for (const context of index.contexts) {
  const views = [];
  for (const shot of index.shots.filter(s => s.context === context.id)) {
    const key = `${shot.theme} ${shot.width} ${shot.state}`;
    if (!views.includes(key)) views.push(key);
  }
  for (const view of REQUIRED_VIEWS) if (!views.includes(view)) failures.push(`${context.id}: no ${view} view`);
  for (const view of views) {
    const [theme, width, state] = view.split(' ');
    const cells = OPTIONS.map(([option, label]) => {
      const shot = index.shots.find(s => s.context === context.id && s.option === option && s.theme === theme && String(s.width) === width && s.state === state);
      if (!shot) { failures.push(`${context.id} ${view}: no capture for option ${option}`); return '<td class="missing">missing</td>'; }
      return `<td>${img(shot.file, `${label}, ${context.id}, ${view}`)}</td>`;
    });
    rows.push(`<tr data-row="${esc(`${context.id} ${view}`)}"><th scope="row"><b>${esc(context.id)}</b><br>${esc(theme)} · ${esc(width)} px${state === 'open' ? ' · Menu open' : ''}<br><small>${esc(context.seed)} · <code>${esc(context.at)}</code><br>${esc(context.shows)}</small></th>${cells.join('')}</tr>`);
  }
}
for (const [option] of OPTIONS) for (const [keys] of KEYS) if (!index.measurements?.[option]?.[keys]) failures.push(`measurements missing for option ${option}, ${keys}`);
if (failures.length > 0) { console.error(`Sheet not written:\n${failures.join('\n')}`); process.exit(1); }

// axe over every context capture, per option (each capture records its own scan).
const sweep = OPTIONS.map(([option, label]) => {
  const scanned = index.shots.filter(s => s.option === option && s.axe);
  const serious = scanned.reduce((n, s) => n + s.axe.serious, 0), critical = scanned.reduce((n, s) => n + s.axe.critical, 0);
  const rules = [...new Set(scanned.flatMap(s => s.axe.rules))];
  const where = scanned.filter(s => s.axe.serious + s.axe.critical > 0).map(s => `${s.context} ${s.theme} ${s.width} ${s.state}`);
  const small = [...new Set(index.shots.filter(s => s.option === option && s.smallTargets?.length).flatMap(s => s.smallTargets.map(name => `${name} in ${s.context}`)))];
  return `<tr><th scope="row">${esc(label)}</th><td>${scanned.length}</td><td>${serious} / ${critical}</td><td>${esc(rules.join(', ') || '—')}</td><td><small>${esc(where.join('; ') || '—')}</small></td><td>${small.length}<br><small>${esc(small.slice(0, 12).join('; '))}</small></td></tr>`;
});

const fmt = v => v === null || v === undefined ? '—' : typeof v === 'object' ? esc(JSON.stringify(v)) : esc(v);
const measureRows = OPTIONS.flatMap(([option, label]) => KEYS.map(([keys, keysLabel]) => {
  const m = index.measurements?.[option]?.[keys];
  if (!m) return `<tr><th scope="row">${esc(label)}<br><small>${esc(keysLabel)}</small></th><td colspan="9">not measured</td></tr>`;
  const trip = o => `${fmt(o?.garden)} / ${fmt(o?.todos)} / ${fmt(o?.launch)}`;
  return `<tr><th scope="row">${esc(label)}<br><small>${esc(keysLabel)}</small></th>
    <td>${trip(m.clicks)}</td><td>${trip(m.keys)}</td><td>${trip(m.taps)}</td>
    <td>${fmt(m.tabsToContent?.withoutSkip)} / ${fmt(m.tabsToContent?.withSkip)}</td>
    <td>${fmt(m.header375?.height)} px; ends at ${fmt(m.header375?.bottom)} px (${Math.round((m.header375?.share ?? 0) * 100)} % of 812)</td>
    <td>${fmt(m.deepestPath?.wide)} · ${fmt(m.deepestPath?.drawer)}</td>
    <td>${fmt(m.smallTargets?.count)}${m.smallTargets?.names?.length ? `<br><small>${esc(m.smallTargets.names.join(', '))}</small>` : ''}</td>
    <td>${fmt(m.axe?.serious)} / ${fmt(m.axe?.critical)}${m.axe?.rules?.length ? `<br><small>${esc(m.axe.rules.join(', '))}</small>` : ''}</td>
    <td>${m.forcedColours?.distinct ? 'yes' : '<b>no</b>'}<br><small>${esc((m.forcedColours?.differs ?? []).join(', '))}</small></td></tr>`;
}));

const extras = (index.extras ?? []).map(extra => `<section class="extra"><h2>${esc(extra.title)}</h2><p>${esc(extra.note)}</p><div class="cells">${extra.cells.map(cell =>
  `<figure>${img(cell.file, `${extra.title}: ${cell.label}`)}<figcaption>${esc(cell.label)}</figcaption></figure>`).join('')}</div></section>`).join('');

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Slice 81 · Navigation alternatives</title>
<style>body{font:15px system-ui;background:#111820;color:#eef3f7;margin:24px}h1{font-size:28px}a{color:#9cc8ff}p{max-width:90ch}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #33404d;padding:8px;vertical-align:top;text-align:left}
thead th{position:sticky;top:0;background:#1a232d}tbody th{width:14rem}td img{width:100%;max-height:420px;object-fit:contain;object-position:top;background:#000}
.measures td{font-variant-numeric:tabular-nums}.missing{color:#f88}.cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
figure{margin:0;background:#202a35;padding:8px;border-radius:8px}figure img{width:100%;max-height:380px;object-fit:contain;object-position:top}code{font-size:12px}</style>
<h1>Slice 81 · One navigation tree: alternatives A, B and C</h1>
<p>Live specimens at <code>/prototype/navigation/:option</code> over the real seeds, commit <code>${esc(index.commit)}</code>, Chromium ${esc(index.chromium)}.
${rows.length} rows × 3 options. Click an image for full resolution. The stand-in workspace (header copy and grey frames) is the same in every option, so differences are the navigation's.
The summary and recommendation are in <code>docs/roadmap/70-ui-ux/alternatives/slice81-navigation.md</code>.</p>
<h2>Measurements</h2>
<p>Activations are from Cabinets (depth 2, nested-projects) to Garden / to the root's Todos / to Website launch's first page (a second root created for the measurement). Clicks and keys at 1440; taps at 375 include Menu. Keys start with focus on the document.</p>
<table class="measures"><thead><tr><th>Option and keyboard model</th><th>Clicks</th><th>Keys</th><th>Taps (375)</th><th>Tab to first content (no skip / skip)</th><th>Header at 375</th><th>Deepest path rows (1440 · drawer)</th><th>Targets &lt; 44 px (375)</th><th>axe serious / critical</th><th>Current distinct in forced colours</th></tr></thead>
<tbody>${measureRows.join('')}</tbody></table>
<h2>axe and small targets over every capture</h2>
<p>Serious and critical axe nodes inside the specimen, scanned at each context capture (links model), and distinct controls under 44 px at 375 (bar and header with Menu closed; the drawer open).</p>
<table class="measures"><thead><tr><th>Option</th><th>Captures scanned</th><th>Serious / critical nodes</th><th>Rules</th><th>Where</th><th>Targets &lt; 44 px at 375</th></tr></thead><tbody>${sweep.join('')}</tbody></table>
<h2>Contexts</h2>
<table><thead><tr><th>Context</th>${OPTIONS.map(([, label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>
${extras}
<p><a href="index.json">Capture index</a></p></html>`;
writeFileSync(join(dir, 'index.html'), html);
console.log(`Wrote ${join(dir, 'index.html')}: ${rows.length} rows × 3 options, ${(index.extras ?? []).length} extra panels.`);
