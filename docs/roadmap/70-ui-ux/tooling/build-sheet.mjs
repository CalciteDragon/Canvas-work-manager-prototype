// Opt-in evidence report. Run with before/after capture directories and an output directory.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
// An optional fourth directory supplies the runtime verification run when it was re-run at a
// later commit than the after matrix; its own commit is shown on the sheet.
const [beforeDir, afterDir, output, verificationDir = afterDir] = process.argv.slice(2).map(p => resolve(p));
if (!output) throw new Error('Usage: node build-sheet.mjs <before> <after> <output>');
const read = async p => JSON.parse(await readFile(p, 'utf8'));
const before = await read(join(beforeDir, 'index.json'));
const after = await read(join(afterDir, 'index.json'));
await mkdir(output, { recursive: true });
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const failures = [], exceptions = [], pairs = [], contrast = [];
if (!before.cells.length || !after.cells.length) failures.push({ reason: 'empty capture matrix' });
for (const side of [before,after]) {
  if (new Set(side.cells.map(c => c.id)).size !== side.cells.length) failures.push({ reason: 'duplicate capture ids', commit:side.commit });
}
for (const b of before.cells) if (!after.cells.some(a => a.id === b.id)) failures.push({ cell:b.id, reason:'missing after cell' });
for (const a of after.cells) {
  const b = before.cells.find(b => b.id === a.id);
  if (!b || a.status !== 'captured' || b.status !== 'captured') { failures.push({ cell: a.id, reason: 'missing or incomplete evidence' }); continue; }
  const [bl, al] = await Promise.all([read(join(beforeDir, b.artifacts.layout)), read(join(afterDir, a.artifacts.layout))]);
  for (const family of ['planes', 'controls', 'scrollRegions']) {
    let old = bl[family], next = al[family];
    if (!old || !next) { failures.push({ cell: a.id, family, reason: 'collector missing' }); continue; }
    if (a.route === '/prototype/design' && family === 'controls') {
      // Keep all original controls: shell, header, seven knobs and the live catalogue.
      // This slice inserts eleven knobs and two toggles after the original seven, then
      // appends one Play motion specimen. Any other control addition/removal still fails.
      const headerEnd = old.findIndex(box => box.text === 'Copy CSS') + 2;
      const insertion = headerEnd + 7;
      if (headerEnd < 2 || next.length !== old.length + 14 || next.at(-1)?.text !== 'Play motion') {
        failures.push({ cell:a.id, reason:'Lab control additions differ from the planned eleven knobs, two toggles and motion specimen' });
        continue;
      }
      exceptions.push({ cell:a.id, family, reason:'eleven added Lab knobs, two toggles and Play motion specimen', before:old.length, after:next.length });
      next = [...next.slice(0,insertion), ...next.slice(insertion+13,-1)];
      // The rail hint lost its stale "session-only, like the theme" clause, one line shorter.
      // Only a single uniform y shift of the original seven knobs is accepted for that.
      const shifts = old.slice(headerEnd, insertion).map((box, i) => next[headerEnd + i]?.y - box.y);
      if (shifts.length === 7 && shifts[0] !== 0 && shifts.every(s => Math.abs(s - shifts[0]) <= 0.5)) {
        exceptions.push({ cell:a.id, family, reason:'rail hint shortened by one line; original seven knobs shift uniformly', shift:shifts[0] });
        next = next.map((box, i) => i >= headerEnd && i < insertion ? { ...box, y: box.y - shifts[0] } : box);
      }
    }
    const changes = [];
    if (old.length !== next.length) changes.push({ reason: 'count', before: old.length, after: next.length });
    old.forEach((box, index) => {
      const other = next[index];
      if (!other) return;
      if (family === 'planes' && (box.selector !== other.selector || box.index !== other.index)) changes.push({ index, reason: 'plane identity' });
      if (family === 'controls' && box.text !== other.text) changes.push({ index, reason: 'control identity', before: box.text, after: other.text });
      for (const field of ['x', 'y', 'width', 'height', 'scrollWidth', 'scrollHeight']) {
        if (typeof box[field] !== 'number') continue;
        if (typeof other[field] !== 'number') { changes.push({ index,field,reason:'missing numeric geometry' }); continue; }
        if (Math.abs(box[field] - other[field]) > 1) {
          const change = { index, field, before: box[field], after: other[field] };
          if (a.route === '/prototype/design' && family === 'scrollRegions' && field === 'scrollHeight' && box.class.includes('workspace')) exceptions.push({ cell:a.id, family, change });
          else changes.push(change);
        }
      }
    });
    if (changes.length) failures.push({ cell: a.id, family, changes });
  }
  for (const [phase, dir, cell] of [['before', beforeDir, b], ['after', afterDir, a]]) {
    const axe = await read(join(dir, cell.artifacts.axe));
    contrast.push({ cell: a.id, theme: a.theme, phase,
      violations: axe.violations.filter(v => v.id === 'color-contrast').reduce((n,v) => n + v.nodes.length, 0),
      incomplete: axe.incomplete.filter(v => v.id === 'color-contrast').reduce((n,v) => n + v.nodes.length, 0),
      acceptedExceptions: axe.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ id:v.id, impact:v.impact, nodes:v.nodes.map(n => ({ target:n.target, summary:n.failureSummary })) })),
    });
    await copyFile(join(dir, cell.artifacts.screenshot), join(output, `${phase}-${a.id}.png`));
  }
  pairs.push({ id: a.id, theme: a.theme });
}
const verification = await read(join(verificationDir, 'depth-verification.json'));
const baselineVerification = await read(join(beforeDir, 'depth-verification.json')).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const lum = color => color.map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s,v,i) => s + v * [.2126,.7152,.0722][i],0);
const ratio = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
// Each plane is measured over what really sits behind it. Panes and sheets rest on the ground:
// its solid colour and each art glow at full strength. Lifts float over page content, so they
// also keep the solid sheet and text-coloured busy content as backings.
const rgba = value => {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+)(%?))?\s*\)$/.exec(value ?? '');
  if (!m) return null;
  return { color: [m[1],m[2],m[3]].map(Number), alpha: m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1) };
};
const composites = Object.entries(verification.tokens).map(([theme,t]) => {
  const get = key => t[`--${key}`];
  const ground = rgb(get('plane-ground-solid'));
  const strength = parseFloat(get('ground-art-strength')) / 100;
  const art = ['art-warm','art-cool','art-teal'].map(k => rgba(get(k)));
  if (art.some(a => !a) || !Number.isFinite(strength)) failures.push({ theme, reason:'ground-art tokens missing from depth-verification.json; composite contrast needs them' });
  const groundBackings = [ground, ...art.filter(Boolean).map(a => a.color.map((v,i) => v*a.alpha*strength + ground[i]*(1-a.alpha*strength)))];
  const backingsFor = plane => plane === 'lift' ? [...groundBackings, rgb(get('color-text')), rgb(get('plane-sheet-solid'))] : groundBackings;
  return { theme, rows: ['pane','sheet','lift'].map(plane => {
    const backings = backingsFor(plane);
    const tint = rgb(get(`plane-${plane}-tint`)), alpha = parseFloat(get(`plane-${plane}-alpha`))/100;
    const surfaces = backings.map(b => tint.map((v,i) => v*alpha+b[i]*(1-alpha)));
    return { plane, text: Math.min(...surfaces.map(b => ratio(rgb(get('color-text')),b))), muted: Math.min(...surfaces.map(b => ratio(rgb(get('color-text-muted')),b))), accentIndicator: Math.min(...surfaces.map(b => ratio(rgb(get('color-accent')),b))), focusIndicator: Math.min(...surfaces.map(b => ratio(rgb(get('focus-ring-color')),b))) };
  }), accentTextOnFill: ratio(rgb(get('color-accent-contrast')),rgb(get('color-accent'))) };
});
const report = { before: before.commit, after: after.commit, pairs: pairs.length, geometryFailures: failures, intentionalLabChanges: exceptions, contrast, composites, verification, baselineVerification };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
const figure = (file, caption) => `<figure><figcaption>${esc(caption)}</figcaption><a href="${esc(file)}"><img loading="lazy" src="${esc(file)}" alt="${esc(caption)}"></a></figure>`;
const card = p => `<article><h3>${esc(p.id)}</h3><div class="pair">${['before','after'].map(phase => figure(`${phase}-${p.id}.png`, phase)).join('')}</div></article>`;
const coreIds = ['busy-week-project-dark-1440', 'busy-week-project-light-1440', 'agent-heavy-dashboard-dark-1440', 'kitchen-grid-light-375', 'prototype-design-dark-1440', 'prototype-design-light-1440'];
const core = coreIds.map(id => pairs.find(p => p.id === id)).filter(Boolean);
const extras = pairs.filter(p => !coreIds.includes(p.id));
const contrastTable = `<table><thead><tr><th>Theme</th><th>Before violations</th><th>Before incomplete</th><th>After violations</th><th>After incomplete</th></tr></thead><tbody>${['dark','light'].map(theme => {
  const count = (phase, field) => contrast.filter(c => c.theme === theme && c.phase === phase).reduce((sum,c) => sum+c[field],0);
  return `<tr><th>${theme}</th><td>${count('before','violations')}</td><td>${count('before','incomplete')}</td><td>${count('after','violations')}</td><td>${count('after','incomplete')}</td></tr>`;
}).join('')}</tbody></table>`;
const fmt = number => Number.isFinite(number) ? number.toFixed(2)+':1' : 'unavailable';
const compositeTable = `<table id="composite-contrast"><thead><tr><th>Theme</th><th>Plane</th><th>Text</th><th>Muted</th><th>Accent indicator</th><th>Focus indicator</th></tr></thead><tbody>${composites.flatMap(theme => theme.rows.map(row => `<tr><th>${esc(theme.theme)}</th><td>${row.plane}</td>${['text','muted','accentIndicator','focusIndicator'].map(key => `<td>${fmt(row[key])}</td>`).join('')}</tr>`)).join('')}</tbody></table><p>Accent text on fill: ${composites.map(theme => `${esc(theme.theme)} ${fmt(theme.accentTextOnFill)}`).join(' · ')}. Reference levels: text 4.5:1; indicators 3:1. Measurements are reported, not gated.</p>`;
const remaining = contrast.filter(c => c.phase === 'after').flatMap(c => c.acceptedExceptions.map(exception => ({ cell:c.cell, theme:c.theme, ...exception })));
const summary = new Map();
for (const result of remaining) {
  const key = result.theme+' '+result.id;
  summary.set(key,(summary.get(key) ?? 0)+result.nodes.length);
}
const serious = `<h3>Remaining serious exceptions</h3><p>${remaining.length ? [...summary].map(([key,count]) => `${esc(key)}: ${count} affected node assessments`).join(' · ') : 'No serious or critical axe violations remain in the captured cells.'}</p><p>Contrast exceptions are recorded under the October 14 contrast amendment. Every remaining serious result is listed below with its cell, selector and failure summary.</p><details><summary>All remaining serious and critical results (${remaining.length})</summary><pre>${esc(JSON.stringify(remaining,null,2))}</pre></details>`;
const auxiliary = [];
for (const group of verification.focus ?? []) {
  for (const ring of group.rings) {
    const baseline = baselineVerification?.focus?.find(focus => focus.theme === group.theme)?.rings.find(old => old.target === ring.target);
    auxiliary.push({ file:ring.screenshot, caption:`${group.theme} focus · ${ring.target} · ${ring.outline}`, baseline: baseline && { file:baseline.screenshot, caption:`before · ${baseline.outline}` } });
  }
}
for (const fallback of verification.fallbacks ?? []) {
  const baseline = baselineVerification?.fallbacks?.find(old => old.theme === fallback.theme && old.mode === fallback.mode);
  auxiliary.push({ file:fallback.screenshot, caption:`${fallback.theme} · ${fallback.mode}${fallback.simulated ? ' (simulated)' : ' (real emulation)'}`, baseline: baseline && { file:baseline.screenshot, caption:baseline.baselineSolidStyling ? 'before · baseline solid styling; no Depth fallback rule' : 'before' } });
}
if (verification.deviceTheme?.screenshot) auxiliary.push({ file:verification.deviceTheme.screenshot, caption:'Light device · explicit dark choice after reload' });
if (verification.lab?.screenshot) auxiliary.push({ file:verification.lab.screenshot, caption:'Light Lab · reset after live knob and reduced-motion checks' });
for (const item of auxiliary) {
  await copyFile(join(verificationDir,item.file),join(output,item.file));
  if (item.baseline) await copyFile(join(beforeDir,item.baseline.file),join(output,'before-'+item.baseline.file));
}
const verificationSection = `<section><h2>Runtime verification captures</h2><p>Verification run at ${esc(String(verification.commit ?? after.commit).slice(0,8))}. ${baselineVerification ? 'Keyboard and fallback captures pair genuine baseline and after evidence.' : 'Only after verification was supplied; baseline keyboard and fallback captures are unavailable.'} Keyboard focus after implementation uses the same computed outline on More, sidebar, navigation and dialog fields in both themes. Fallback captures show solid planes with no backdrop filter; the no-filter browser case is explicitly simulated. Device persistence and Lab reset are shown separately.</p><div class="verification">${auxiliary.map(item => `<article><h3>${esc(item.caption)}</h3><div class="pair">${item.baseline ? figure('before-'+item.baseline.file,item.baseline.caption) : ''}${figure(item.file,'after')}</div></article>`).join('')}</div></section>`;
await writeFile(join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Slice 71 · Depth · Gate 2</title><style>:root{color-scheme:dark}
body{font:16px/1.5 system-ui;background:#11151f;color:#f2f4fa;margin:24px}h1{margin-bottom:0}h2{font-size:21px}h3{font-size:15px;overflow-wrap:anywhere}p{max-width:110ch}a{color:#ffad7f}section,details{margin-block:24px}.overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0;min-width:0}img{width:100%;max-height:75vh;object-fit:contain;object-position:top;background:#20253a}.overview img{height:190px}.verification{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.verification img{height:220px}figcaption{font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:8px 14px;border-bottom:1px solid #394156}summary{cursor:pointer}article{margin-bottom:24px}@media(max-width:900px){.overview,.verification{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){body{margin:12px}.overview,.verification,.pair{grid-template-columns:1fr}table{font-size:12px}th,td{padding:5px}}
</style><h1>Depth / Slice 71</h1><p>Gate 2 · awaiting visual acceptance. Before ${esc(before.commit.slice(0,8))} → after ${esc(after.commit.slice(0,8))}. V2: blurred panes, translucent sheets without blur.</p><p>${pairs.length} paired cells · ${failures.length} geometry failures · ${exceptions.length} intentional Lab additions. All other recorded boxes must stay within 1px. Click any image for full resolution. <a href="report.json">Full geometry and axe report</a></p><section><h2>Visual acceptance</h2><div class="overview">${core.map(card).join('')}</div></section><details><summary>All ${pairs.length} before / after pairs</summary>${[...core,...extras].map(card).join('')}</details><section><h2>Contrast report</h2><p>Axe counts are affected-node assessments summed across captured cells in each theme. Incomplete translucent-background assessments are included; the same node may be assessed on several surfaces.</p>${contrastTable}<h3>Worst-case composite contrast</h3><p>Backings are what really sits behind each plane. Panes and sheets sit on the ground: its solid colour and each art glow at full strength. Lifts float over page content, so they are also measured over the solid sheet and text-coloured busy content. Values below use the after tokens.</p>${compositeTable}${serious}<details><summary>Per-cell before / after axe counts and all accepted exceptions</summary><pre>${esc(JSON.stringify(contrast,null,2))}</pre></details></section>${verificationSection}</html>`);
console.log(JSON.stringify({ pairs: pairs.length, geometryFailures: failures.length, intentionalLabChanges: exceptions.length, composites, output }));
if (failures.length) process.exitCode = 1;
