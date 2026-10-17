// Opt-in evidence report. Run with before/after capture directories and an output directory.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
// An optional fourth directory supplies the runtime verification run when it was re-run at a
// later commit than the after matrix; its own commit is shown on the sheet.
// `--profile 71` (the default) gates Depth's paint-only change on geometry; `--profile 72` lets
// geometry move, reports it, and gates on slice 72's control census and accessibility names.
const args = process.argv.slice(2);
const profileAt = args.indexOf('--profile');
const profile = profileAt === -1 ? '71' : args[profileAt + 1];
if (!['71', '72', '73'].includes(profile)) throw new Error(`Unknown profile ${profile}`);
const positional = args.filter((_, index) => profileAt === -1 || (index !== profileAt && index !== profileAt + 1));
const [beforeDir, afterDir, output, verificationDir = afterDir] = positional.map(p => resolve(p));
if (!output) throw new Error('Usage: node build-sheet.mjs <before> <after> <output> [verification] [--profile 71|72|73]');
const liftCell = cell => ['more', 'project-details', 'archive-confirm', 'page-settings', 'task-drawer', 'task-drawer-scrolled', 'section-create', 'work-create'].includes(cell.state) || cell.route === '/prototype/design';
/**
 * Slice 72's pre-listed census exceptions, each owned by a later slice. A matching control is
 * reported on the sheet, never silently passed; anything else that is too small fails.
 */
const CENSUS_EXCEPTIONS = [
  { owner: 'slice 5, TH08: canvas insertion points', classes: ['insertion-point'], test: c => /^Insert (before |at the end)/.test(c.text ?? '') },
  { owner: 'slice 5, L6-009: section title button', classes: ['section-frame__title-button'], test: c => /\bsection-frame__title-button\b/.test(c.class ?? '') },
  { owner: 'slice 6, TH09: task row title', classes: ['task-row__title'], test: c => /\btask-row__title\b/.test(c.class ?? '') },
  { owner: 'slice 7: project navigation breadcrumbs (listed after the after census; see the plan)', classes: ['project-nav__breadcrumb'], test: c => /\bproject-nav__breadcrumb\b/.test(c.class ?? '') },
  { owner: 'slice 6: dashboard widget row links', classes: ['widget-row__title'], test: c => /\bwidget-row__title\b/.test(c.class ?? '') },
];
const exceptionFor = c => CENSUS_EXCEPTIONS.find(e => e.test(c));
const censusFailures = [], censusExceptions = [], intendedChanges = [], geometryReport = [];
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
    if (profile === '71' && a.route === '/prototype/design' && family === 'controls') {
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
    if (profile === '72') {
      // Geometry may move in this slice, but corrupt evidence and a changed set of planes still fail.
      const integrity = changes.filter(change => ['plane identity', 'missing numeric geometry'].includes(change.reason) || (family === 'planes' && change.reason === 'count'));
      if (integrity.length) failures.push({ cell: a.id, family, changes: integrity });
      const intended = changes.filter(change => family === 'controls' && ['control identity', 'count'].includes(change.reason));
      if (intended.length) intendedChanges.push({ cell: a.id, changes: intended });
      const moved = changes.filter(change => !intended.includes(change) && !integrity.includes(change));
      if (moved.length) geometryReport.push({ cell: a.id, family, changes: moved });
    } else if (profile === '73' && liftCell(a)) {
      const corrupt = changes.filter(change => change.reason === 'missing numeric geometry');
      if (corrupt.length) failures.push({ cell: a.id, family, changes: corrupt });
      if (changes.length) geometryReport.push({ cell: a.id, family, changes });
    } else if (changes.length) failures.push({ cell: a.id, family, changes });
  }
  if (profile === '73') {
    const touch = a.viewport?.width === 375;
    if (touch && al.document > al.viewport + 1) failures.push({ cell: a.id, reason: 'scrolls sideways', document: al.document, viewport: al.viewport });
    for (const [index, region] of (touch ? al.scrollRegions ?? [] : []).entries()) {
      if (region.scrollWidth <= region.width + 1) continue;
      const baseline = bl.scrollRegions?.[index];
      const knownLab = a.route === '/prototype/design' && region.tag === 'MAIN' && region.class === 'workspace'
        && baseline?.tag === region.tag && baseline.class === region.class
        && baseline.width === region.width && region.scrollWidth <= baseline.scrollWidth
        && baseline.scrollWidth > baseline.width + 1;
      if (knownLab) exceptions.push({ cell: a.id, reason: 'Lab workspace phone overflow no wider than the genuine baseline; Lab has no phone layout', baselineScrollWidth: baseline.scrollWidth, region: region.class, width: region.width, scrollWidth: region.scrollWidth });
      else failures.push({ cell: a.id, reason: 'scroll region scrolls sideways', region: region.class, width: region.width, scrollWidth: region.scrollWidth, baseline });
    }
    if (liftCell(a)) {
      const axe = await read(join(afterDir, a.artifacts.axe));
      for (const violation of axe.violations ?? []) {
        if (['aria-allowed-role', 'aria-required-children', 'aria-dialog-name', 'nested-interactive'].includes(violation.id)) failures.push({ cell: a.id, reason: `axe ${violation.id}`, nodes: violation.nodes.map(node => node.target) });
      }
    }
  }
  if (profile === '72') {
    const touch = (a.viewport?.width ?? Number(a.id.split('-').at(-1))) === 375;
    const product = al.controls.filter(c => c.scope === 'product');
    for (const c of product) {
      const box = c.target ?? c;
      const small = touch ? box.height < 44 || box.width < 24 : box.height < 24 || box.width < 24;
      if (!small) continue;
      const entry = { cell: a.id, reason: touch ? 'touch target under 44 px' : 'target under 24 px', text: c.text, class: c.class, width: box.width, height: box.height };
      const exception = exceptionFor(c);
      if (exception) censusExceptions.push({ ...entry, owner: exception.owner });
      else censusFailures.push(entry);
    }
    const distinct = heights => heights.sort((x, y) => x - y).filter((h, i, all) => i === 0 || h - all[i - 1] > 0.5);
    if (!touch) {
      const buttons = distinct(product.filter(c => /(^|\s)button(\s|$)/.test(c.class ?? '') && !/\bbutton--row\b/.test(c.class ?? '')).map(c => c.height));
      if (buttons.length > 2) censusFailures.push({ cell: a.id, reason: 'more than two button heights', heights: buttons });
      const fields = distinct(product.filter(c => (c.tag === 'select' || (c.tag === 'input' && !['checkbox', 'radio', 'hidden', 'range', 'color', 'file'].includes(c.type))) && /\b(field|select)\b/.test(c.class ?? '')).map(c => c.height));
      if (fields.length > 1) censusFailures.push({ cell: a.id, reason: 'more than one field height', heights: fields });
    }
    if (touch && al.document > al.viewport) censusFailures.push({ cell: a.id, reason: 'scrolls sideways', document: al.document, viewport: al.viewport });
    // The shell scrolls inside its own regions, so the document can fit while a region overflows.
    for (const region of touch && !a.route.startsWith('/prototype/') ? al.scrollRegions ?? [] : []) {
      if (region.scrollWidth > region.width + 1) censusFailures.push({ cell: a.id, reason: 'scroll region scrolls sideways', region: region.class, width: region.width, scrollWidth: region.scrollWidth });
    }
    if (a.route === '/prototype/design' && !al.controls.some(c => c.text === 'Primary · Rest')) censusFailures.push({ cell: a.id, reason: 'Lab Controls panel missing' });
    const axe = await read(join(afterDir, a.artifacts.axe));
    for (const v of axe.violations ?? []) {
      if (['select-name', 'aria-progressbar-name', 'button-name'].includes(v.id)) censusFailures.push({ cell: a.id, reason: `axe ${v.id}`, nodes: v.nodes.map(n => n.target) });
      if (v.id === 'target-size') {
        const unlisted = v.nodes.filter(n => !CENSUS_EXCEPTIONS.some(e => e.classes.some(name => n.target.join(' ').includes(name))));
        if (unlisted.length) censusFailures.push({ cell: a.id, reason: 'axe target-size', nodes: unlisted.map(n => n.target) });
      }
    }
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
const optional = path => read(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const lifts = profile === '73' ? await optional(join(verificationDir, 'lifts-verification.json')) : null;
const liftBaseline = profile === '73' ? await optional(join(beforeDir, 'lift-baseline.json')) : null;
const captureProvenance = profile === '73' ? await optional(join(afterDir, 'production-build.json')) : null;
const finalBuild = profile === '73' ? await optional(join(afterDir, 'final-production-build.json')) : null;
const tasks = profile === '73' ? await optional(join(afterDir, 'tasks/tasks.json')) : null;
if (profile === '73') {
  for (const [id, clicks, keystrokes] of [['T03', 10, 38], ['T04', 1, 0], ['T08', 3, 0]]) {
    const task = tasks?.find(task => task.id === id);
    if (!task || task.status !== 'completed' || task.deadEnds !== 0 || !Number.isFinite(task.clicks) || !Number.isFinite(task.keystrokes) || task.clicks > clicks || task.keystrokes > keystrokes) failures.push({ reason: 'core task regression', id, task, budget: { clicks, keystrokes } });
  }
}
if (profile === '73' && !lifts) failures.push({ reason: 'lifts-verification.json missing; run UX_LIFTS=1' });
if (profile === '73' && lifts) {
  if (!liftBaseline?.complete || liftBaseline.commit !== before.commit) failures.push({ reason: 'genuine before persistent-blur evidence missing' });
  if (!lifts.complete) failures.push({ reason: 'incomplete lift evidence' });
  for (const theme of ['dark', 'light']) for (const finding of ['W3-003', 'W3-005', 'W3-006', 'L5-009', 'L5-010']) {
    if (!lifts.focus?.some(entry => entry.theme === theme && entry.passed && entry.findings?.includes(finding))) failures.push({ reason: 'focus evidence missing', theme, finding });
  }
  for (const theme of ['dark', 'light']) for (const kind of ['side', 'sheet', 'menu', 'popover', 'details', 'confirm']) {
    const entry = lifts.lifts?.find(entry => entry.theme === theme && entry.kind === kind);
    if (!entry) { failures.push({ reason: 'incomplete lift evidence', theme, kind }); continue; }
    const baseline = liftBaseline?.layers?.find(layer => layer.theme === theme && layer.width === (kind === 'sheet' ? 375 : 1440));
    if (!baseline || !Number.isFinite(baseline.persistent) || entry.persistentBefore > baseline.persistent || entry.persistent > baseline.persistent) failures.push({ reason: 'persistent blur exceeds genuine before or baseline measurement is missing', theme, kind, baseline, closedAfter: entry.persistentBefore, openAfter: entry.persistent });
    if (!Number.isFinite(entry.transient) || !Number.isFinite(entry.persistent) || !Number.isFinite(entry.persistentBefore) || entry.transient > 1 || entry.persistent > entry.persistentBefore) failures.push({ reason: 'lift adds blur layers or its measurement is missing', theme, kind });
    for (const mode of ['forced-colors', 'reduced-transparency']) {
      const fallback = entry.fallbacks?.find(fallback => fallback.mode === mode);
      if (!fallback || fallback.backdropFilter !== 'none') failures.push({ reason: 'lift solid fallback missing', theme, kind, mode });
    }
  }
}
const primitives = profile === '72' ? await optional(join(verificationDir, 'primitives-verification.json')) : null;
const primitivesLab = profile === '72' ? await optional(join(verificationDir, 'primitives-lab.json')) : null;
const baselinePrimitives = profile === '72' ? await optional(join(beforeDir, 'primitives-verification.json')) : null;
if (profile === '72' && !primitives) failures.push({ reason: 'primitives-verification.json missing; run the after capture with UX_PRIMITIVES=1' });
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
failures.push(...censusFailures);
const report = { profile, before: before.commit, after: after.commit, pairs: pairs.length, geometryFailures: failures, censusFailures, censusExceptions, intendedChanges, geometryReport, intentionalLabChanges: exceptions, contrast, composites, verification, baselineVerification, primitives, baselinePrimitives, lifts, liftBaseline, tasks, captureProvenance, finalBuild };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
const figure = (file, caption) => `<figure><figcaption>${esc(caption)}</figcaption><a href="${esc(file)}"><img loading="lazy" src="${esc(file)}" alt="${esc(caption)}"></a></figure>`;
// Profile 73's "Visual acceptance pairs" table: which findings each core cell demonstrates.
const shows = profile === '73' ? {
  'overdue-chaos-task-drawer-dark-1440': 'W1-032, W3-014', 'overdue-chaos-task-drawer-light-375': 'W2-016',
  'kitchen-more-dark-1440': 'W1-045, W2-027, W4-018', 'kitchen-more-light-375': 'W1-045, W2-027, W4-018',
  'kitchen-project-details-dark-1440': 'L3-025, L1-021, L2-006', 'kitchen-project-details-light-375': 'L3-025, L1-021, L2-006',
  'kitchen-archive-confirm-dark-1440': 'L2-006 (danger apart)', 'kitchen-page-settings-light-1440': 'L5-010',
  'kitchen-page-settings-light-375': 'L5-010', 'kitchen-section-create-light-1440': 'creation dialog lift paint only',
  'prototype-design-dark-1440': 'Lab lift foundations', 'prototype-design-light-1440': 'Lab lift foundations',
} : {};
const phoneExceptions = exceptions.filter(e => e.reason?.includes('Lab workspace phone overflow'));
const card = p => `<article><h3>${esc(p.id)}</h3>${shows[p.id] ? `<p>Shows ${esc(shows[p.id])}</p>` : ''}<div class="pair">${['before','after'].map(phase => figure(`${phase}-${p.id}.png`, phase)).join('')}</div></article>`;
const coreIds = profile === '73'
  ? ['overdue-chaos-task-drawer-dark-1440', 'overdue-chaos-task-drawer-light-375', 'kitchen-more-dark-1440', 'kitchen-more-light-375', 'kitchen-project-details-dark-1440', 'kitchen-project-details-light-375', 'kitchen-archive-confirm-dark-1440', 'kitchen-page-settings-light-1440', 'kitchen-page-settings-light-375', 'kitchen-section-create-light-1440', 'prototype-design-dark-1440', 'prototype-design-light-1440']
  : profile === '72'
  ? ['busy-week-project-dark-1440', 'nested-projects-project-dark-1440', 'kitchen-section-create-light-1440', 'kitchen-more-dark-1440', 'archive-dark-1440', 'todos-light-1440', 'settings-agents-dark-1440', 'settings-light-1440', 'settings-archived-projects-light-1440', 'new-project-dark-1440', 'new-project-light-375', 'nested-projects-project-light-1440', 'kitchen-task-drawer-dark-1440', 'kitchen-more-light-375', 'kitchen-page-settings-light-375', 'archive-light-375', 'settings-agents-light-375', 'prototype-design-dark-1440', 'prototype-design-light-1440']
  : ['busy-week-project-dark-1440', 'busy-week-project-light-1440', 'agent-heavy-dashboard-dark-1440', 'kitchen-grid-light-375', 'prototype-design-dark-1440', 'prototype-design-light-1440'];
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
for (const forced of primitives?.forcedColors ?? []) {
  const baseline = baselinePrimitives?.forcedColors?.find(old => old.surface === forced.surface && old.theme === forced.theme);
  auxiliary.push({ file:forced.screenshot, caption:`forced colours · ${forced.surface} · ${forced.theme}`, baseline: baseline && { file:baseline.screenshot, caption:'before' } });
}
for (const lab of primitivesLab?.lab ?? []) auxiliary.push({ file:lab.screenshot, caption:`Lab Controls · ${lab.theme} · ${lab.width}` });
if (verification.lab?.screenshot) auxiliary.push({ file:verification.lab.screenshot, caption:'Light Lab · reset after live knob and reduced-motion checks' });
for (const item of auxiliary) {
  await copyFile(join(verificationDir,item.file),join(output,item.file));
  if (item.baseline) await copyFile(join(beforeDir,item.baseline.file),join(output,'before-'+item.baseline.file));
}
let verificationSection = `<section><h2>Runtime verification captures</h2><p>Verification run at ${esc(String(verification.commit ?? after.commit).slice(0,8))}. ${baselineVerification ? 'Keyboard and fallback captures pair genuine baseline and after evidence.' : 'Only after verification was supplied; baseline keyboard and fallback captures are unavailable.'} Keyboard focus after implementation uses the same computed outline on More, sidebar, navigation and dialog fields in both themes. Fallback captures show solid planes with no backdrop filter; the no-filter browser case is explicitly simulated. Device persistence and Lab reset are shown separately.</p><div class="verification">${auxiliary.map(item => `<article><h3>${esc(item.caption)}</h3><div class="pair">${item.baseline ? figure('before-'+item.baseline.file,item.baseline.caption) : ''}${figure(item.file,'after')}</div></article>`).join('')}</div></section>`;
if (profile === '73') {
  const source = await readFile(new URL('../../../../apps/e2e/lifts.spec.ts', import.meta.url), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (source) {
    await writeFile(join(output, 'lifts.spec.ts.txt'), source);
    const names = [...source.matchAll(/test\('([^']+)'/g)].map(match => match[1]);
    verificationSection += `<section><h2>Behaviour journeys</h2><p><a href="lifts.spec.ts.txt">Browser acceptance source</a>. These tests are defined for both themes at desktop and touch widths; the focus log above records the separate runtime observations.</p><ul>${names.map(name => `<li>${esc(name)}</li>`).join('')}</ul></section>`;
  }
  const liftImages = (lifts?.lifts ?? []).flatMap(entry => [{ file: entry.screenshot, caption: `${entry.theme} ${entry.kind}` }, ...(entry.fallbacks ?? []).map(fallback => ({ file: fallback.screenshot, caption: `${entry.theme} ${entry.kind} ${fallback.mode}` }))]).filter(entry => entry.file);
  for (const entry of liftImages) await copyFile(join(verificationDir, entry.file), join(output, entry.file));
  await writeFile(join(output, 'lifts-verification.json'), JSON.stringify(lifts, null, 2));
  await writeFile(join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Slice 73 · Lifts and focus · Gate 2</title><style>:root{color-scheme:dark}body{font:16px/1.5 system-ui;background:#11151f;color:#f2f4fa;margin:24px}a{color:#ffad7f}.overview,.verification{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.overview{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.overview h3{font-size:12px;overflow-wrap:anywhere;margin:0 0 4px}.overview img{height:130px}.overview figcaption{font-size:11px}.overview article{min-width:0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;max-height:70vh;object-fit:contain;object-position:top}figure{margin:0}pre{white-space:pre-wrap;overflow-wrap:anywhere}td,th{padding:8px;border-bottom:1px solid #455}section{margin-block:30px}@media(max-width:700px){.overview,.verification,.pair{grid-template-columns:1fr}}</style><h1>Lifts and focus / Slice 73</h1>${captureProvenance ? `<p>Capture provenance: ${esc(captureProvenance.note)} ${finalBuild ? esc(finalBuild.note) : "Final rebuild evidence pending."} Asset hashes and byte counts are in the full report.</p>` : ""}<p>Gate 2 · awaiting visual acceptance. Before ${esc(before.commit.slice(0,8))} → after ${esc(after.commit.slice(0,8))}. ${pairs.length} paired cells · ${failures.length} gate failures. Closed-state boxes stay within 1 px. Open lifts and Lab changes are reported. All phone cells are checked for overflow${phoneExceptions.length ? ` (listed exception: ${esc(phoneExceptions.map(e => `${e.cell} ${e.region} ${e.scrollWidth}/${e.width} px, baseline ${e.baselineScrollWidth} px`).join("; "))} — the Lab has no phone layout and its overflow may not grow)` : ""}; open lifts are checked for named dialogs, valid roles and nested controls.</p><p><a href="report.json">Full gate report</a> · <a href="lifts-verification.json">Focus log and computed lift evidence</a>. Keyboard and touch journeys: apps/e2e/lifts.spec.ts (More, details, confirm, page settings, one lift, route focus, anchoring, canvas lift release) and apps/e2e/task-lifts.spec.ts (W3-014 drawer focus, below-fold drawer, sheet, forced close and reopen). The task drawer still displays the raw projectId fact, deferred to slice 9. Muted contrast is reported, without a gate.</p><section><h2>Visual acceptance</h2><div class="overview">${core.map(card).join('')}</div></section><details><summary>All ${pairs.length} pairs</summary>${[...core,...extras].map(card).join('')}</details><section><h2>Focus and layers</h2><p>Persistent layers are compared with each closed page. Transient blur is at most one. Focus logs cover W3-003, W3-005, W3-006, L5-009 and L5-010.</p><pre>${esc(JSON.stringify(lifts?.focus ?? [], null, 2))}</pre><div class="verification">${liftImages.map(entry => figure(entry.file, entry.caption)).join('')}</div></section><section><h2>Gate failures</h2><pre>${esc(JSON.stringify(failures, null, 2))}</pre><details><summary>Intended geometry movement</summary><pre>${esc(JSON.stringify(geometryReport, null, 2))}</pre></details></section><section><h2>Contrast</h2>${contrastTable}${compositeTable}${serious}</section>${verificationSection}</html>`);
}
if (profile !== '73')
await writeFile(join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${profile === '72' ? 'Slice 72 · Primitives' : 'Slice 71 · Depth'} · Gate 2</title><style>:root{color-scheme:dark}
body{font:16px/1.5 system-ui;background:#11151f;color:#f2f4fa;margin:24px}h1{margin-bottom:0}h2{font-size:21px}h3{font-size:15px;overflow-wrap:anywhere}p{max-width:110ch}a{color:#ffad7f}section,details{margin-block:24px}.overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0;min-width:0}img{width:100%;max-height:75vh;object-fit:contain;object-position:top;background:#20253a}.overview img{height:190px}.verification{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.verification img{height:220px}figcaption{font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:8px 14px;border-bottom:1px solid #394156}summary{cursor:pointer}article{margin-bottom:24px}@media(max-width:900px){.overview,.verification{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){body{margin:12px}.overview,.verification,.pair{grid-template-columns:1fr}table{font-size:12px}th,td{padding:5px}}
</style><h1>${profile === '72' ? 'Primitives / Slice 72' : 'Depth / Slice 71'}</h1><p>Gate 2 · awaiting visual acceptance. Before ${esc(before.commit.slice(0,8))} → after ${esc(after.commit.slice(0,8))}. ${profile === '72' ? 'Shared control primitives adopted on every product surface.' : 'V2: blurred panes, translucent sheets without blur.'}</p><p>${pairs.length} paired cells · ${failures.length} ${profile === '72' ? 'gate failures (census, axe names, overflow) · ' + censusExceptions.length + ' listed census exceptions · ' + intendedChanges.length + ' cells with intended control renames · ' + geometryReport.length + ' cell families with reported geometry movement. Geometry is reported, not gated, in this slice.' : 'geometry failures · ' + exceptions.length + ' intentional Lab additions. All other recorded boxes must stay within 1px.'} Click any image for full resolution. <a href="report.json">Full geometry and axe report</a></p><section><h2>Visual acceptance</h2><div class="overview">${core.map(card).join('')}</div></section><details><summary>All ${pairs.length} before / after pairs</summary>${[...core,...extras].map(card).join('')}</details>${profile === '72' ? `<section><h2>Control census</h2><p>Gated: product-scope controls are at least 24 px with a pointer and 44 px tall on touch, buttons use at most two heights and fields one, no 375 cell scrolls sideways, and axe reports no select-name, aria-progressbar-name or button-name violation.</p><h3>Failures (${censusFailures.length})</h3><pre>${esc(JSON.stringify(censusFailures,null,2))}</pre><details><summary>Listed exceptions and their owners (${censusExceptions.length})</summary><pre>${esc(JSON.stringify(censusExceptions,null,2))}</pre></details><details><summary>Intended control renames and count changes (${intendedChanges.length} cells)</summary><pre>${esc(JSON.stringify(intendedChanges,null,2))}</pre></details><details><summary>Reported geometry movement (${geometryReport.length})</summary><pre>${esc(JSON.stringify(geometryReport,null,2))}</pre></details></section>` : ''}<section><h2>Contrast report</h2><p>Axe counts are affected-node assessments summed across captured cells in each theme. Incomplete translucent-background assessments are included; the same node may be assessed on several surfaces.</p>${contrastTable}<h3>Worst-case composite contrast</h3><p>Backings are what really sits behind each plane. Panes and sheets sit on the ground: its solid colour and each art glow at full strength. Lifts float over page content, so they are also measured over the solid sheet and text-coloured busy content. Values below use the after tokens.</p>${compositeTable}${serious}<details><summary>Per-cell before / after axe counts and all accepted exceptions</summary><pre>${esc(JSON.stringify(contrast,null,2))}</pre></details></section>${verificationSection}</html>`);
console.log(JSON.stringify({ pairs: pairs.length, geometryFailures: failures.length, intentionalLabChanges: exceptions.length, composites, output }));
if (failures.length) process.exitCode = 1;
