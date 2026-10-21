// Opt-in evidence report. Run with before/after capture directories and an output directory.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
// An optional fourth directory supplies the runtime verification run when it was re-run at a
// later commit than the after matrix; its own commit is shown on the sheet.
// `--profile 71` (the default) gates Depth's paint-only change on geometry; `--profile 72` lets
// geometry move, reports it, and gates on slice 72's control census and accessibility names.
const args = process.argv.slice(2);
const flag = name => { const at = args.indexOf(name); return at === -1 ? null : args[at + 1]; };
const profile = flag('--profile') ?? '71';
if (!['71', '72', '73', '74', '75', '76'].includes(profile)) throw new Error(`Unknown profile ${profile}`);
// Profile 75's slice-73 pair has its own "before": the pre-73 build's placement run.
const pre73Dir = flag('--pre73') === null ? null : resolve(flag('--pre73'));
const positional = args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
const [beforeDir, afterDir, output, verificationDir = afterDir] = positional.map(p => resolve(p));
if (!output) throw new Error('Usage: node build-sheet.mjs <before> <after> <output> [verification] [--profile 71|72|73|74|75|76] [--pre73 <dir>]');
const liftCell = cell => ['more', 'project-details', 'archive-confirm', 'page-settings', 'task-drawer', 'task-drawer-scrolled', 'section-create', 'work-create'].includes(cell.state) || cell.route === '/prototype/design';
/** Slice 74's one listed closed-state change: the project header exactly 12 px shorter at the same top. */
const FEEDBACK_ROW = 12;
const removedFeedbackRow = (bl, al) => {
  const [was, now] = [bl, al].map(layout => layout.planes?.find(plane => plane.selector === 'app-project-header'));
  if (!was || !now || Math.abs(was.y - now.y) > 1 || Math.abs(was.height - now.height - FEEDBACK_ROW) > 0.5) return null;
  return { top: now.y, bottom: now.y + now.height, left: now.x, right: now.x + now.width, shift: was.height - now.height };
};
/** Undoes only that row: the header's height, the boxes below it, and containers that shrank by exactly it. */
const restoreFeedbackRow = (box, was, { top, bottom, left, right, shift }, family) => {
  if (box.selector === 'app-project-header') return { ...box, height: box.height + shift };
  // Only the header's own column moves; the sidebar and project column beside it do not.
  const besideHeader = typeof box.x === 'number' && (box.x + box.width <= left + 0.5 || box.x >= right - 0.5);
  if (besideHeader) return box;
  // Controls in an anchored lift (More, a dialog) stay where they were; page content moves.
  if (box.y >= bottom - 0.5) return family === 'controls' && Math.abs(was?.y - box.y) <= 0.5 ? box : { ...box, y: box.y + shift };
  if (box.y > top || box.y + box.height < bottom - 0.5 || !was) return box;
  const restored = { ...box };
  for (const field of ['height', 'scrollHeight']) {
    if (typeof box[field] === 'number' && Math.abs(was[field] - box[field] - shift) <= 0.5) restored[field] = box[field] + shift;
  }
  return restored;
};
const feedbackCell = cell => ['remove-feedback', 'page-settings'].includes(cell.state) || cell.route === '/prototype/design';
/** Slice 75's "must change" cells: the drawer's autosave line, the dialog that now reveals, and the Lab. */
/**
 * Slice 75's listed closed-state change: the canvas live region, styled by the new `.visually-hidden`,
 * no longer takes a grid row, so what follows rises by exactly the canvas gap. Any other movement fails.
 */
const LIVE_REGION_GAP = 24;
const liveRegionRise = changes => changes.length > 0 && changes.every(change => ['y', 'height', 'scrollHeight'].includes(change.field) && Math.abs(change.after - change.before + LIVE_REGION_GAP) <= 0.5);
const placementCell = cell => ['task-drawer', 'task-drawer-scrolled', 'section-create'].includes(cell.state) || cell.route === '/prototype/design';
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
const activeExceptions = profile === '76' ? CENSUS_EXCEPTIONS.slice(2) : CENSUS_EXCEPTIONS;
const exceptionFor = c => activeExceptions.find(e => e.test(c));
const chromeCell = cell => cell.route?.startsWith('/projects/') && !/\/(todos|archive|reflections)(?:$|\?)/.test(cell.route);
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
  const removedRow = profile === '74' ? removedFeedbackRow(bl, al) : null;
  for (const family of ['planes', 'controls', 'scrollRegions']) {
    let old = bl[family], next = al[family];
    if (!old || !next) { failures.push({ cell: a.id, family, reason: 'collector missing' }); continue; }
    if (removedRow) {
      // The user accepted this on 2026-10-17: the deleted wrapper was never hidden by its `:empty`
      // rule, so the baseline carried a blank row and its grid gap. Put the row back, then gate.
      if (family === 'planes') exceptions.push({ cell: a.id, reason: 'empty header feedback row removed', shift: removedRow.shift });
      next = next.map((box, index) => restoreFeedbackRow(box, old[index], removedRow, family));
    }
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
    if (profile==='76' && a.route==='/prototype/design' && family==='controls') {
      const isFrame=c=>/^(Move |Collapse |Expand |Rename |Remove section )/.test(c.text??'') || c.panel==='section-frame';
      const knob=next.find(c=>c.id==='design-lab-canvasChromeRestOpacity');
      old=old.filter(c=>!isFrame(c));next=next.filter(c=>!isFrame(c) && c!==knob);
      // Only the rail rows below the inserted knob shift; catalogue controls retain their boxes.
      if(knob)next=next.map((c,i)=>c.x<knob.x+knob.width && c.y>knob.y && old[i]?.tag===c.tag && old[i]?.text===c.text ? {...c,y:old[i].y}:c);
    }
    const changes = [];
    if (old.length !== next.length) changes.push({ reason: 'count', before: old.length, after: next.length });
    old.forEach((box, index) => {
      const other = next[index];
      if (!other) return;
      if (family === 'planes' && (box.selector !== other.selector || box.index !== other.index)) changes.push({ index, reason: 'plane identity' });
      if (profile==='76' && a.route==='/prototype/design' && family==='controls' && ['color','background','border'].some(field=>box[field]!==other[field])) changes.push({index,reason:'Lab control paint changed',text:box.text});
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
    } else if ((profile === '76' && (chromeCell(a) || (a.route === '/prototype/design' && family !== 'controls'))) || (profile === '73' && liftCell(a)) || (profile === '74' && feedbackCell(a)) || (profile === '75' && placementCell(a))) {
      const corrupt = changes.filter(change => change.reason === 'missing numeric geometry');
      if (corrupt.length) failures.push({ cell: a.id, family, changes: corrupt });
      if (changes.length) geometryReport.push({ cell: a.id, family, changes });
    } else if (profile === '75' && liveRegionRise(changes)) {
      exceptions.push({ cell: a.id, family, reason: 'canvas live region left the grid; content below rises 24 px', changes: changes.length });
    } else if (changes.length) failures.push({ cell: a.id, family, changes });
  }
  if (['73', '74', '75'].includes(profile)) {
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
        if ((['74', '75'].includes(profile) ? ['aria-allowed-role', 'region', 'nested-interactive'] : ['aria-allowed-role', 'aria-required-children', 'aria-dialog-name', 'nested-interactive']).includes(violation.id)) failures.push({ cell: a.id, reason: `axe ${violation.id}`, nodes: violation.nodes.map(node => node.target) });
      }
    }
  }
  if (['72', '76'].includes(profile)) {
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
        const unlisted = v.nodes.filter(n => !activeExceptions.some(e => e.classes.some(name => n.target.join(' ').includes(name))));
        if (unlisted.length) censusFailures.push({ cell: a.id, reason: 'axe target-size', nodes: unlisted.map(n => n.target) });
      }
    }
  }
  if (profile === '76' && chromeCell(a)) {
    for (const content of bl.sectionContents ?? []) {
      const next = al.sectionContents?.find(c => c.id === content.id);
      if (!next || ['x', 'width'].some(field => Math.abs(next[field] - content[field]) > 1)) failures.push({ cell: a.id, reason: 'section content geometry', before: content, after: next });
    }
    if (!Array.isArray(bl.sectionContents) || !Array.isArray(al.sectionContents)) failures.push({ cell: a.id, reason: 'section content collector missing' });
    const [was, now] = await Promise.all([read(join(beforeDir, b.artifacts.axe)), read(join(afterDir, a.artifacts.axe))]);
    const key = (v, n) => v.id + ':' + (n.stableAnchor ?? n.target?.join(' '));
    const known = new Set((was.violations ?? []).flatMap(v => v.nodes.flatMap(n => n.stableAnchor ? [key(v,n)] : [key(v,n), v.id + ':' + n.target?.join(' ')])));
    for (const violation of now.violations ?? []) if (violation.id !== 'color-contrast') for (const node of violation.nodes) {
      if (!known.has(key(violation,node)) && !known.has(violation.id + ':' + node.target?.join(' '))) failures.push({ cell: a.id, reason: 'new axe node ' + violation.id, target: node.target });
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
const tasks = ['73', '74', '75', '76'].includes(profile) ? await optional(join(afterDir, 'tasks/tasks.json')) : null;
const feedback = profile === '74' ? await optional(join(verificationDir, 'feedback-verification.json')) : null;
const baselineFeedback = profile === '74' ? await optional(join(beforeDir, 'feedback-verification.json')) : null;
const feedbackGroups = [
  { rows: ['remove-listed'], ids: ['W1-036', 'L4-026', 'L6-016', 'W1-037', 'W2-021', 'L1-023'], proof: 'Removal confirms with Undo in the content track.' },
  { rows: ['remove-unlisted'], ids: ['L3-010'], proof: 'Progress removal confirms with Undo.' },
  { rows: ['task-delete'], ids: ['L3-009'], proof: 'Task Delete offers Undo and Open archive.' },
  { rows: ['header-transition'], ids: ['L3-005', 'L6-015'], proof: 'Undo confirms in the toast; timer, replacement and navigation are browser-tested.' },
  { rows: ['cross-owner'], ids: ['W1-013', 'W4-007'], proof: 'Creation names the workstream and offers Undo through its owner history.' },
  { rows: ['todos-complete'], ids: ['L3-020'], proof: 'Complete offers Undo and Open Kitchen.' },
  { rows: ['archive-restore'], ids: ['W1-047', 'W2-029', 'L3-021', 'W4-021'], proof: 'Restore names the destination and offers Go to it.' },
  { rows: ['settings-restore'], ids: ['L4-010'], proof: 'Settings restore names the project and offers Open it.' },
  { rows: ['archive-restore', 'settings-restore'], ids: ['W3-004'], proof: 'Focus logs and browser tests prove first-action focus after Restore.' },
  { rows: ['hidden-archive'], ids: ['W4-020'], proof: 'Hidden Archive remains routable; browser tests verify that opening it writes nothing.' },
];
const feedbackFindings = profile === '74' ? feedbackGroups.flatMap(group => group.ids.map(id => ({ id, rows: group.rows, proof: group.proof }))) : [];
const feedbackVisualPairs = [];
if (profile === '74') {
  const required = [
    ...['dark', 'light'].flatMap(theme => [1440, 375].map(width => ['remove-listed', theme, width, `kitchen-remove-feedback-${theme}-${width}`])),
    ['remove-unlisted', 'dark', 1440], ['task-delete', 'light', 1440],
    ...['dark', 'light'].map(theme => ['header-transition', theme, 1440]),
    ['cross-owner', 'light', 1440], ['todos-complete', 'dark', 1440],
    ...[1440, 375].map(width => ['archive-restore', 'dark', width]),
    ['settings-restore', 'light', 1440], ['hidden-archive', 'light', 1440],
    ...['dark', 'light'].map(theme => ['drawer-toast', theme, 1440]),
  ];
  for (const [row, theme, width, cell] of required) {
    const pairedCell = cell && pairs.some(pair => pair.id === cell);
    const matches = entry => entry.row === row && entry.theme === theme && entry.width === width && entry.screenshot;
    const beforeShot = [...baselineFeedback?.visualFocus ?? [], ...baselineFeedback?.focus ?? []].find(matches)?.screenshot;
    const afterShot = [...feedback?.visualFocus ?? [], ...feedback?.focus ?? []].find(matches)?.screenshot;
    feedbackVisualPairs.push({ row, theme, width, cell: cell ?? null,
      before: pairedCell ? `before-${cell}.png` : beforeShot ? `before-${beforeShot}` : null,
      after: pairedCell ? `after-${cell}.png` : afterShot ?? null,
      status: pairedCell || (beforeShot && afterShot) ? 'paired' : afterShot ? 'after only' : beforeShot ? 'before only' : 'missing before and after' });
  }
}
if (profile === '74') {
  for (const [id, clicks] of [['T05', 2], ['T09', 1]]) {
    const task = tasks?.find(task => task.id === id);
    if (!task || task.status !== 'completed' || task.deadEnds !== 0 || !Number.isFinite(task.clicks) || task.clicks > clicks || task.keystrokes !== 0) failures.push({ reason: 'core task regression', id, task, budget: { clicks, keystrokes: 0 } });
  }
  if (!feedback?.complete) failures.push({ reason: 'feedback-verification.json missing or incomplete; run UX_FEEDBACK=1' });
  for (const theme of ['dark', 'light']) for (const width of [1440, 375]) {
    const entry = feedback?.entries?.find(entry => entry.theme === theme && entry.width === width);
    if (!entry) { failures.push({ reason: 'feedback geometry evidence missing', theme, width }); continue; }
    if (!Number.isFinite(entry.inlineClearance) || entry.inlineClearance < -1 || entry.drawerIntersection !== false || entry.focusedIntersection !== false) failures.push({ reason: 'toast clearance', theme, width, entry });
    if (!Number.isFinite(entry.transient) || entry.transient > 1) failures.push({ reason: 'toast blur budget', theme, width, entry });
    for (const mode of ['forced-colors', 'reduced-transparency']) {
      if (!entry.fallbacks?.some(fallback => fallback.mode === mode && fallback.backdropFilter === 'none')) failures.push({ reason: 'toast solid fallback missing', theme, width, mode });
    }
    if (width === 375 && (!entry.suppression?.hidden || !entry.suppression?.returned)) failures.push({ reason: 'toast phone suppression missing', theme });
  }
  for (const row of ['remove-listed', 'remove-unlisted', 'task-delete', 'project-archive', 'header-transition', 'cross-owner', 'archive-restore', 'todos-complete']) {
    if (!feedback?.focus?.some(entry => entry.row === row && entry.passed)) failures.push({ reason: 'feedback focus evidence missing', row });
  }
}
const placement = profile === '75' ? await optional(join(verificationDir, 'placement-verification.json')) : null;
const baselinePlacement = profile === '75' ? await optional(join(beforeDir, 'placement-verification.json')) : null;
const pre73Placement = profile === '75' && pre73Dir ? await optional(join(pre73Dir, 'placement-verification.json')) : null;
/** Visual acceptance rows: each names its findings; the slice-73 pair takes its "before" from the pre-73 build. */
const placementRows = [
  { row: 'section-create', views: [['dark', 1440], ['light', 375]], findings: 'W1-024, W2-008' },
  { row: 'shortcut-create', views: [['dark', 1440]], findings: 'W3-016, W1-043' },
  { row: 'quick-add-pending', views: [['dark', 1440], ['light', 375]], findings: 'L3-007, L4-004' },
  { row: 'long-list', views: [['dark', 1440]], findings: 'L4-023' },
  { row: 'drawer-save', views: [['dark', 1440]], findings: 'L3-008 (0.15 s after the change)' },
  { row: 'drawer-saved', views: [['dark', 1440]], findings: 'L3-008 (after the response)' },
  { row: 'phone-due-date', views: [['light', 375]], findings: 'W2-018' },
  { row: 'row-failures', views: [['dark', 1440]], findings: 'L4-005' },
  { row: 'permission-failure', views: [['dark', 1440]], findings: 'L4-005' },
  { row: 'empty-project-name', views: [['dark', 1440]], findings: 'L4-024' },
  { row: 'empty-work-name', views: [['dark', 1440]], findings: 'L4-024' },
  { row: 'hold-before', views: [['dark', 1440], ['light', 375]], findings: 'W1-030, W2-010 (first frame)' },
  { row: 'hold-after', views: [['dark', 1440], ['light', 375]], findings: 'W1-030, W2-010 (after two completions)' },
  { row: 'three-quick-adds', views: [['dark', 1440], ['light', 375]], findings: 'W1-026, W3-012, W2-009, W4-008', pre73: true },
];
const placementEntry = (source, row, theme, width) => source?.entries?.find(entry => entry.row === row && entry.theme === theme && entry.width === width);
const placementPairs = profile === '75' ? placementRows.flatMap(({ row, views, findings, pre73 }) => views.map(([theme, width]) => {
  const after = placementEntry(placement, row, theme, width);
  const before = placementEntry(pre73 ? pre73Placement : baselinePlacement, row, theme, width);
  return { row, theme, width, findings, beforeSource: pre73 ? 'pre-73 build' : 'baseline build', beforeDir: pre73 ? pre73Dir : beforeDir, after, before,
    status: after?.screenshot && before?.screenshot ? 'paired' : after?.screenshot ? 'after only' : before?.screenshot ? 'before only' : 'missing before and after' };
})) : [];
if (profile === '75') {
  const task = tasks?.find(task => task.id === 'T03');
  if (!task || task.status !== 'completed' || task.deadEnds !== 0 || !Number.isFinite(task.clicks) || !Number.isFinite(task.keystrokes) || task.clicks > 10 || task.keystrokes > 38) failures.push({ reason: 'core task regression', id: 'T03', task, budget: { clicks: 10, keystrokes: 38 } });
  if (!placement?.complete) failures.push({ reason: 'placement-verification.json missing or incomplete; run UX_PLACEMENT=1' });
  const need = (row, theme, width, test, reason) => {
    const entry = placementEntry(placement, row, theme, width);
    if (!entry) failures.push({ reason: 'placement evidence missing', row, theme, width });
    else if (entry.error || !test(entry)) failures.push({ reason, row, theme, width, entry });
  };
  for (const [theme, width] of [['dark', 1440], ['light', 375]]) {
    need('section-create', theme, width, e => e.focus?.heading && e.focus?.inView, 'created section not revealed with its heading focused');
    need('quick-add-pending', theme, width, e => Number.isFinite(e.worstMs) && e.worstMs < 100, 'pending row later than 100 ms');
    need('hold-before', theme, width, e => Array.isArray(e.deltas) && e.deltas.length === 2 && e.deltas.every(delta => Math.abs(delta) <= 1) && e.scrollTop > 0, 'working list moved more than 1 px');
    need('three-quick-adds', theme, width, e => e.drawerOpen === false && e.fieldFocused === true, 'quick-adds opened the drawer or lost the field');
  }
  need('shortcut-create', 'dark', 1440, e => e.focus?.heading && e.focus?.inView, 'created shortcut not revealed with its heading focused');
  need('long-list', 'dark', 1440, e => e.rowInView && e.fieldInView && e.fieldFocused, 'long-list add lost the row or the field');
  need('drawer-save', 'dark', 1440, e => Number.isFinite(e.savingMs) && e.savingMs < 100 && Number.isFinite(e.rowMs) && e.rowMs < 100, 'drawer edit not shown within 100 ms');
  need('drawer-saved', 'dark', 1440, e => e.statusAfter?.trim() === 'Saved', 'drawer did not say Saved');
  need('phone-due-date', 'light', 375, e => !/Overdue/.test(e.statusAfter ?? 'Overdue') && e.fieldStatus?.trim() === 'Saved', 'due-date edit still Overdue or unsaved');
  need('row-failures', 'dark', 1440, e => e.rowErrors === 2 && e.sectionBanner === 0, 'row failures not on their rows');
  need('permission-failure', 'dark', 1440, e => e.inCard === 1 && e.pageAlert === 0, 'permission failure not in its card');
  for (const row of ['empty-project-name', 'empty-work-name']) need(row, 'dark', 1440, e => e.message?.trim() === 'Enter a name.', 'blank name not refused on the field');
}
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
const chrome = profile === '76' ? await optional(join(verificationDir, 'chrome-verification.json')) : null;
const chromeBefore = profile === '76' ? await optional(join(beforeDir, 'chrome-verification.json')) : null;
if(profile==='76') {
  if(!chromeBefore?.complete || chromeBefore.entries?.length!==12)failures.push({reason:'chrome baseline runtime missing or incomplete'});
  for(const entry of chromeBefore?.entries??[]) {
    const fields=['screenshot','hitScreenshot','restHitScreenshot'];if(entry.project==='project-kitchen'&&entry.layout!=='grid')fields.push('pendingScreenshot');
    if(entry.error || fields.some(field=>typeof entry[field]!=='string') || !entry.tabWalk?.length || !entry.rest?.frames?.length || ['restHitMap','activeHitMap'].some(field=>!entry[field]?.length || entry[field].some(mark=>mark.points?.length!==9)))failures.push({reason:'chrome baseline measurement or visual incomplete',project:entry.project,theme:entry.theme,width:entry.width});
  }
}
if (profile === '76' && (!chrome?.complete || !chrome.entries?.length || chrome.entries.some(e => e.error || !e.rest || !e.tabWalk))) failures.push({ reason: 'chrome-verification.json missing or incomplete' });
if (profile === '76' && chrome?.complete) {
  for (const project of ['project-kitchen','project-client-migration','project-renovation/pages/home']) for(const [theme,width] of [['dark',1440],['light',1440],['light',375]]) {
    const entry=chrome.entries?.find(e=>e.project===project && e.theme===theme && e.width===width && e.layout!=='grid');
    if(!entry)failures.push({reason:'chrome runtime context missing',project,theme,width});
  }
  for(const [theme,width] of [['dark',1440],['light',1440],['light',375]]) {
    if(!chrome.entries?.some(e=>e.project==='project-kitchen' && e.layout==='grid' && e.theme===theme && e.width===width))failures.push({reason:'chrome grid runtime context missing',theme,width});
  }
  for(const entry of chrome.entries??[]) {
    const fail=reason=>failures.push({reason,project:entry.project,theme:entry.theme,width:entry.width,layout:entry.layout});
    for(const field of ['screenshot','hitScreenshot','restHitScreenshot'])if(typeof entry[field]!=='string')fail('chrome visual evidence missing '+field);
    if(typeof entry.aria!=='string' || !entry.aria.trim())fail('chrome ARIA snapshot missing');
    const rest=entry.rest, token=Number(rest?.restToken);
    if(!Number.isFinite(token)||token<=0||token>=1||!rest?.frames?.length||!rest?.marks?.length||!rest?.add?.length)fail('chrome rest measurement incomplete');
    if((rest?.marks??[]).some(mark=>!Number.isFinite(mark.opacity)||Math.abs(mark.opacity-token)>.001))fail('chrome rest mark opacity');
    for(const frame of rest?.frames??[]) {
      if(!frame.heading || frame.headingButton!==null)fail('chrome heading name');
      if(frame.titleOffset!==null && (!Number.isFinite(frame.titleOffset)||Math.abs(frame.titleOffset)>1))fail('chrome title alignment');
      if(!frame.tools?.length || frame.tools.some(t=>!Number.isFinite(t.opacity)||Math.abs(t.opacity-token)>.001))fail('chrome rest tool opacity');
    }
    for(const state of ['restHitMap','activeHitMap']) {
      if(!entry[state]?.length || entry[state].some(mark=>mark.points?.length!==9 || mark.points.some(p=>p.hit!==true)))fail('chrome insertion hit map '+state);
    }
    if(!entry.tabWalk?.length)fail('chrome Tab walk missing');
    for(const id of new Set((entry.tabWalk??[]).map(stop=>stop.section).filter(Boolean))) {
      const stops=entry.tabWalk.filter(stop=>stop.section===id && stop.kind!=='gap'),first=stops.findIndex(stop=>stop.content);
      if(stops.filter(stop=>!stop.content).length>3 || (first>=0 && stops.slice(0,first).filter(stop=>!stop.content).length>2))fail('chrome Tab stop budget');
    }
    if(entry.project==='project-kitchen' && entry.layout!=='grid') {
      if(typeof entry.pendingScreenshot!=='string')fail('chrome collapse100ms visual missing');
      if(entry.collapse?.runs?.length!==5 || !Number.isFinite(entry.collapse.worstMs) || entry.collapse.worstMs>=100 || entry.collapse.runs.some(n=>!Number.isFinite(n)||n>=100))fail('chrome collapse latency missing or over100ms');
    }
    if(entry.layout==='grid' && entry.width===1440 && (!entry.resize || entry.resize.width<24 || entry.resize.inside?.length!==4 || !entry.resize.inside.every(Boolean) || !entry.resize.gap?.length || !entry.resize.gap.every(Boolean)))fail('chrome resize midline measurement');
  }
}
if (profile === '76') for (const [id,clicks,keystrokes] of [['T03',10,38],['T05',2,0],['T06',2,16]]) {
  const task=tasks?.find(t=>t.id===id);
  if (!task || task.status!=='completed' || !Number.isFinite(task.clicks) || !Number.isFinite(task.keystrokes) || task.deadEnds!==0 || task.clicks>clicks || task.keystrokes>keystrokes) failures.push({reason:'chrome core task cost or completion',id,task});
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
const report = { chrome, chromeBefore, placement, baselinePlacement, pre73Placement, placementPairs: placementPairs.map(({ before, after, beforeDir: _dir, ...pair }) => ({ ...pair, before: before?.screenshot ?? null, after: after?.screenshot ?? null })), profile, before: before.commit, after: after.commit, recaptures: after.recaptures ?? [], pairs: pairs.length, geometryFailures: failures, censusFailures, censusExceptions, intendedChanges, geometryReport, intentionalLabChanges: exceptions, contrast, composites, verification, baselineVerification, primitives, baselinePrimitives, lifts, liftBaseline, tasks, captureProvenance, finalBuild, feedback, feedbackFindings, feedbackVisualPairs };
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
const coreIds = profile === '75'
  ? ['kitchen-task-drawer-dark-1440', 'overdue-chaos-task-drawer-light-375', 'kitchen-section-create-light-1440', 'prototype-design-dark-1440', 'prototype-design-light-1440']
  : profile === '74'
  ? ['kitchen-remove-feedback-dark-1440', 'kitchen-remove-feedback-dark-375', 'kitchen-remove-feedback-light-1440', 'kitchen-remove-feedback-light-375', 'kitchen-page-settings-dark-1440', 'kitchen-page-settings-light-375', 'prototype-design-dark-1440', 'prototype-design-light-1440']
  : profile === '73'
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
if (profile === '74') {
  const shots = [...feedback?.visualFocus ?? [], ...feedback?.focus ?? []].filter(entry => entry.screenshot);
  for (const entry of shots) await copyFile(join(verificationDir, entry.screenshot), join(output, entry.screenshot));
  for (const entry of [...baselineFeedback?.visualFocus ?? [], ...baselineFeedback?.focus ?? []]) if (entry.screenshot) await copyFile(join(beforeDir, entry.screenshot), join(output, 'before-' + entry.screenshot));
  await writeFile(join(output, 'feedback-verification.json'), JSON.stringify(feedback, null, 2));
  const gaps = feedbackVisualPairs.filter(pair => pair.status !== 'paired');
  const mapping = `<table><thead><tr><th>Finding</th><th>Evidence</th><th>What to inspect</th></tr></thead><tbody>${feedbackFindings.map(finding => `<tr><th>${esc(finding.id)}</th><td>${finding.rows.map(row => `<a href="#feedback-${row}">${esc(row)}</a>`).join(', ')}</td><td>${esc(finding.proof)}</td></tr>`).join('')}</tbody></table>`;
  const gallery = feedbackGroups.map(group => group.rows).flat().concat('drawer-toast').filter((row, index, rows) => rows.indexOf(row) === index).map(row => {
    const entries = shots.filter(entry => entry.row === row);
    return `<section id="feedback-${row}"><h3>${esc(row)}</h3>${entries.length ? entries.map(entry => {
      const supplemental = feedback?.visualFocus?.some(other => other.row === row && other.theme === entry.theme && other.width === entry.width);
      const beforeShot = (!supplemental || entry.visualSupplement) && [...baselineFeedback?.visualFocus ?? [], ...baselineFeedback?.focus ?? []].find(old => old.row === row && old.theme === entry.theme && old.width === entry.width)?.screenshot;
      return `<article><h4>${esc(entry.theme)} · ${entry.width} · ${entry.visualSupplement ? 'supplemental visual capture' : 'measured runtime capture'}</h4><p>${beforeShot ? 'Genuine before / after pair.' : 'After only; baseline capture unavailable.'} Focus: ${esc(entry.active?.text ?? 'unavailable')}; intersects acted region: ${esc(entry.intersectsActedRegion ?? 'unavailable')}.</p><div class="pair">${beforeShot ? figure('before-' + beforeShot, 'before') : ''}${figure(entry.screenshot, 'after')}</div></article>`;
    }).join('') : '<p>No runtime screenshot supplied. See visual evidence gaps.</p>'}</section>`;
  }).join('');
  const visualAudit = `<table><thead><tr><th>Required pair</th><th>Status</th><th>Before</th><th>After</th></tr></thead><tbody>${feedbackVisualPairs.map(pair => `<tr><th>${esc(`${pair.row} · ${pair.theme} · ${pair.width}`)}</th><td>${esc(pair.status)}</td><td>${pair.before ? `<a href="${esc(pair.before)}">before</a>` : 'missing'}</td><td>${pair.after ? `<a href="${esc(pair.after)}">after</a>` : 'missing'}</td></tr>`).join('')}</tbody></table>`;
  await writeFile(join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Slice 74 · Feedback · Gate 2</title><style>:root{color-scheme:dark}body{font:16px/1.5 system-ui;background:#11151f;color:#f2f4fa;margin:24px}a{color:#ffad7f}section{margin-block:28px}.overview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}figure{margin:0;min-width:0}img{width:100%;max-height:80vh;object-fit:contain;object-position:top}th,td{text-align:left;padding:8px;border-bottom:1px solid #455}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:700px){.overview,.pair{grid-template-columns:1fr}}</style><h1>Feedback / Slice 74</h1><p>Gate 2 · awaiting visual acceptance. Matrix labels: before ${esc(before.commit)} → after ${esc(after.commit)}. Runtime verification label: ${esc(feedback?.commit ?? 'unavailable')}. Supplemental after source: ${esc(feedback?.visualProvenance?.sourceCommit ?? 'unavailable')} (working changes and build hash are in the full report).</p><p>${pairs.length} paired matrix cells · ${failures.length} gate failures. Closed-state boxes stay within 1 px except the listed removed 12 px header row. Toast and Lab movement is reported. <a href="report.json">Full gate report</a> · <a href="feedback-verification.json">Focus, clearance, blur and fallback evidence</a>.</p><section><h2>Visual evidence gaps</h2><p>${gaps.length} of ${feedbackVisualPairs.length} required visual acceptance pairs remain incomplete. Zero gate failures does not close these visual requirements or imply user acceptance. The Archive and Settings rows use dark and light respectively where the plan leaves theme open.</p>${visualAudit}</section><section><h2>Twenty findings and their evidence</h2><p>These map each finding to evidence to inspect. Behaviour assertions remain in feedback.spec.ts; screenshots alone do not prove focus, timing or a write-free route.</p>${mapping}</section><section><h2>Matrix before / after</h2><div class="overview">${core.map(card).join('')}</div></section><section><h2>Feedback runtime gallery</h2>${gallery}</section><details><summary>All ${pairs.length} matrix pairs</summary>${[...core,...extras].map(card).join('')}</details><section><h2>Gate failures</h2><pre>${esc(JSON.stringify(failures,null,2))}</pre><details><summary>Intended geometry changes</summary><pre>${esc(JSON.stringify(geometryReport,null,2))}</pre></details></section><section><h2>Contrast</h2><p>Contrast is reported only. Feedback-specific muted ratios, solid fallback measurements, suppression and blur counts are in the runtime evidence.</p>${contrastTable}${compositeTable}${serious}</section>${verificationSection}</html>`);
}
if (profile === '75') {
  const copied = new Set();
  for (const pair of placementPairs) {
    for (const [phase, entry, dir] of [['after', pair.after, verificationDir], ['before', pair.before, pair.beforeDir]]) {
      if (!entry?.screenshot || !dir) continue;
      const name = `${phase}-${pair.beforeSource === 'pre-73 build' && phase === 'before' ? 'pre73-' : ''}${entry.screenshot}`;
      if (!copied.has(name)) { await copyFile(join(dir, entry.screenshot), join(output, name)); copied.add(name); }
      pair[`${phase}File`] = name;
    }
  }
  await writeFile(join(output, 'placement-verification.json'), JSON.stringify({ after: placement, before: baselinePlacement, pre73: pre73Placement }, null, 2));
  const gaps = placementPairs.filter(pair => pair.status !== 'paired');
  const facts = entry => entry ? esc(JSON.stringify(Object.fromEntries(Object.entries(entry).filter(([key]) => !['row', 'theme', 'width', 'screenshot'].includes(key))))) : 'no entry';
  const anchor = pair => `placement-${esc(pair.row)}-${pair.theme}-${pair.width}`;
  const gallery = placementPairs.map(pair => `<article id="${anchor(pair)}"><h3>${esc(pair.row)} · ${pair.theme} · ${pair.width}</h3><p>${esc(pair.findings)} · before from the ${esc(pair.beforeSource)} · ${esc(pair.status)}</p><div class="pair">${pair.beforeFile ? figure(pair.beforeFile, 'before') : '<p>No before capture.</p>'}${pair.afterFile ? figure(pair.afterFile, 'after') : '<p>No after capture.</p>'}</div><details><summary>Measurements</summary><p>Before: <code>${facts(pair.before)}</code></p><p>After: <code>${facts(pair.after)}</code></p></details></article>`).join('');
  const audit = `<table><thead><tr><th>Pair</th><th>Status</th></tr></thead><tbody>${placementPairs.map(pair => `<tr><th><a href="#${anchor(pair)}">${esc(`${pair.row} · ${pair.theme} · ${pair.width}`)}</a></th><td>${esc(pair.status)}</td></tr>`).join('')}</tbody></table>`;
  await writeFile(join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Slice 75 · Pending and placement · Gate 2</title><style>:root{color-scheme:dark}body{font:16px/1.5 system-ui;background:#11151f;color:#f2f4fa;margin:24px}a{color:#ffad7f}section{margin-block:28px}.overview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}figure{margin:0;min-width:0}img{width:100%;max-height:80vh;object-fit:contain;object-position:top}code,pre{white-space:pre-wrap;overflow-wrap:anywhere}th,td{text-align:left;padding:8px;border-bottom:1px solid #455}@media(max-width:700px){body{margin:12px}.overview,.pair{grid-template-columns:1fr}}</style><h1>Pending and placement / Slice 75</h1><p>Gate 2 · awaiting visual acceptance. Matrix: before ${esc(before.commit)} → after ${esc(after.commit)}. Placement runtime evidence: after ${esc(placement?.commit ?? 'unavailable')}, before ${esc(baselinePlacement?.commit ?? 'unavailable')}, pre-73 ${esc(pre73Placement?.commit ?? 'unavailable')}.</p><p>${pairs.length} paired matrix cells · ${failures.length} gate failures. Closed-state boxes stay within 1 px; the task drawer, the creation dialog and the Lab are reported. Gated runtime facts: pending row under 100 ms, drawer cue and row under 100 ms, reveal with heading focus, the long-list row and field in view, the list held within 1 px, failures on their objects, blank names refused on the field, and T03 at most 10 clicks and 38 keystrokes. Behaviour assertions also run in apps/e2e/placement.spec.ts. <a href="report.json">Full gate report</a> · <a href="placement-verification.json">Runtime measurements</a>.</p><section><h2>Visual evidence gaps</h2><p>${gaps.length} of ${placementPairs.length} visual acceptance pairs are incomplete. Zero gate failures does not mean user acceptance.</p>${audit}</section><section><h2>Visual acceptance</h2>${gallery}</section><section><h2>Matrix before / after</h2><div class="overview">${core.map(card).join('')}</div></section><details><summary>All ${pairs.length} matrix pairs</summary>${[...core, ...extras].map(card).join('')}</details><section><h2>Gate failures</h2><pre>${esc(JSON.stringify(failures, null, 2))}</pre><details><summary>Reported geometry movement</summary><pre>${esc(JSON.stringify(geometryReport, null, 2))}</pre></details></section><section><h2>Contrast</h2><p>Reported only.</p>${contrastTable}${compositeTable}${serious}</section>${verificationSection}</html>`);
}
if (!['73', '74', '75', '76'].includes(profile))
await writeFile(join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${profile === '72' ? 'Slice 72 · Primitives' : 'Slice 71 · Depth'} · Gate 2</title><style>:root{color-scheme:dark}
body{font:16px/1.5 system-ui;background:#11151f;color:#f2f4fa;margin:24px}h1{margin-bottom:0}h2{font-size:21px}h3{font-size:15px;overflow-wrap:anywhere}p{max-width:110ch}a{color:#ffad7f}section,details{margin-block:24px}.overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0;min-width:0}img{width:100%;max-height:75vh;object-fit:contain;object-position:top;background:#20253a}.overview img{height:190px}.verification{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.verification img{height:220px}figcaption{font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:8px 14px;border-bottom:1px solid #394156}summary{cursor:pointer}article{margin-bottom:24px}@media(max-width:900px){.overview,.verification{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){body{margin:12px}.overview,.verification,.pair{grid-template-columns:1fr}table{font-size:12px}th,td{padding:5px}}
</style><h1>${profile === '72' ? 'Primitives / Slice 72' : 'Depth / Slice 71'}</h1><p>Gate 2 · awaiting visual acceptance. Before ${esc(before.commit.slice(0,8))} → after ${esc(after.commit.slice(0,8))}. ${profile === '72' ? 'Shared control primitives adopted on every product surface.' : 'V2: blurred panes, translucent sheets without blur.'}</p><p>${pairs.length} paired cells · ${failures.length} ${profile === '72' ? 'gate failures (census, axe names, overflow) · ' + censusExceptions.length + ' listed census exceptions · ' + intendedChanges.length + ' cells with intended control renames · ' + geometryReport.length + ' cell families with reported geometry movement. Geometry is reported, not gated, in this slice.' : 'geometry failures · ' + exceptions.length + ' intentional Lab additions. All other recorded boxes must stay within 1px.'} Click any image for full resolution. <a href="report.json">Full geometry and axe report</a></p><section><h2>Visual acceptance</h2><div class="overview">${core.map(card).join('')}</div></section><details><summary>All ${pairs.length} before / after pairs</summary>${[...core,...extras].map(card).join('')}</details>${profile === '72' ? `<section><h2>Control census</h2><p>Gated: product-scope controls are at least 24 px with a pointer and 44 px tall on touch, buttons use at most two heights and fields one, no 375 cell scrolls sideways, and axe reports no select-name, aria-progressbar-name or button-name violation.</p><h3>Failures (${censusFailures.length})</h3><pre>${esc(JSON.stringify(censusFailures,null,2))}</pre><details><summary>Listed exceptions and their owners (${censusExceptions.length})</summary><pre>${esc(JSON.stringify(censusExceptions,null,2))}</pre></details><details><summary>Intended control renames and count changes (${intendedChanges.length} cells)</summary><pre>${esc(JSON.stringify(intendedChanges,null,2))}</pre></details><details><summary>Reported geometry movement (${geometryReport.length})</summary><pre>${esc(JSON.stringify(geometryReport,null,2))}</pre></details></section>` : ''}<section><h2>Contrast report</h2><p>Axe counts are affected-node assessments summed across captured cells in each theme. Incomplete translucent-background assessments are included; the same node may be assessed on several surfaces.</p>${contrastTable}<h3>Worst-case composite contrast</h3><p>Backings are what really sits behind each plane. Panes and sheets sit on the ground: its solid colour and each art glow at full strength. Lifts float over page content, so they are also measured over the solid sheet and text-coloured busy content. Values below use the after tokens.</p>${compositeTable}${serious}<details><summary>Per-cell before / after axe counts and all accepted exceptions</summary><pre>${esc(JSON.stringify(contrast,null,2))}</pre></details></section>${verificationSection}</html>`);
if (profile === '76') {
  const baselineChrome = chromeBefore;
  const gallery = [];
  for(const entry of chrome?.entries??[]) {
    const baseline=baselineChrome?.entries?.find(old=>old.project===entry.project && (old.layout??'flow')===(entry.layout??'flow') && old.theme===entry.theme && old.width===entry.width);
    for(const field of ['screenshot','restHitScreenshot','hitScreenshot','pendingScreenshot']) {
      if(!entry[field] && !baseline?.[field])continue;
      const pictures=[];
      for(const [phase,item,dir] of [['before',baseline,beforeDir],['after',entry,verificationDir]])if(item?.[field]) {
        const file=phase+'-'+item[field];await copyFile(join(dir,item[field]),join(output,file));pictures.push(figure(file,phase));
      }
      gallery.push('<article><h3>'+esc(entry.project+' '+(entry.layout??'flow')+' '+entry.theme+' '+entry.width+' '+({screenshot:'at rest',restHitScreenshot:'rest hit map',hitScreenshot:'active hit map',pendingScreenshot:'100ms after Collapse'})[field])+'</h3><div class="pair">'+pictures.join('')+'</div></article>');
    }
  }
  const measured='<table><tr><th>Context</th><th>Rest hits before → after</th><th>Move opacity</th><th>Title offset px</th><th>Worst collapse ms</th></tr>'+(chrome?.entries??[]).map(entry=>{
    const was=baselineChrome?.entries?.find(old=>old.project===entry.project && (old.layout??'flow')===(entry.layout??'flow') && old.theme===entry.theme && old.width===entry.width);
    const hits=e=>{const points=(e?.restHitMap??[]).flatMap(mark=>mark.points);return points.filter(point=>point.hit).length+'/'+points.length;};
    const move=e=>e?.rest?.frames?.[0]?.tools?.find(tool=>/^Move /.test(tool.name??''))?.opacity??'—';
    return '<tr><td>'+esc(entry.project+' '+(entry.layout??'flow')+' '+entry.theme+' '+entry.width)+'</td><td>'+hits(was)+' → '+hits(entry)+'</td><td>'+move(was)+' → '+move(entry)+'</td><td>'+esc(was?.rest?.frames?.[0]?.titleOffset??'—')+' → '+esc(entry.rest?.frames?.[0]?.titleOffset??'—')+'</td><td>'+esc(was?.collapse?.worstMs?.toFixed(1)??'—')+' → '+esc(entry.collapse?.worstMs?.toFixed(1)??'—')+'</td></tr>';
  }).join('')+'</table>';
  const findings='<table><tr><th>Finding</th><th>Evidence</th></tr>'+[
    ['W1-017, L3-001','Persistent Add and faint insertion marks: rest pairs'],['W1-018','Rest and active hit-map pairs and all nine probes per mark'],['L3-002','Quiet tools and end resize handle: rest pairs and resize measurement'],['W1-029, L1-006 (part)','Title icon aligns with content; project header edge deferred to slice7'],['L1-015','375 touch pairs: no rest line or danger ink'],['W3-011','Flow and grid Tab walks, gap stops separate'],['L6-009, W1-021, W2-006, L5-002, W4-025','ARIA names and browser heading assertions'],['L3-003','Visible Rename tool, prefilled selection and no-op saves in unit/browser checks'],['L3-018 (part)','Shortcut read-only cue and unlink mark; inert rows deferred to slice6'],['L3-016','100ms-after-click pair, five delayed PATCH timings, refusal and owed-read browser paths']
  ].map(([id,proof])=>'<tr><th>'+esc(id)+'</th><td>'+esc(proof)+'</td></tr>').join('')+'</table><p>L6-010 and W1-028 are handed to slice9 and are not claimed here.</p>';
  await writeFile(join(output, 'chrome-verification.json'), JSON.stringify(chrome, null, 2));
  await writeFile(join(output, 'index.html'), '<!doctype html><html><meta charset="utf-8"><title>Slice 76 · Section chrome · Gate 2</title><style>body{font:16px system-ui;margin:24px;background:#11151f;color:#f2f4fa}img{width:100%;max-height:650px;object-fit:contain}.pair{display:grid;grid-template-columns:1fr 1fr}pre{white-space:pre-wrap}a{color:#ffad7f}</style><h1>Section chrome / Slice 76</h1><p>Gate 2 · awaiting visual acceptance. '+pairs.length+' paired cells · '+failures.length+' gate failures.</p><nav><a href="#measurements">Measurements</a> · <a href="#runtime">Runtime pairs</a> · <a href="#checks">Checks</a> · <a href="report.json">Full gate report</a></nav><h2 id="measurements">Measured chrome</h2>'+measured+'<h2>Findings</h2>'+findings+'<h2 id="runtime">Runtime before / after</h2>'+gallery.join('')+'<details><summary>All '+pairs.length+' matrix before / after pairs</summary>'+pairs.map(card).join('')+'</details><details><summary>Full runtime observations</summary><pre>'+esc(JSON.stringify(chrome,null,2))+'</pre></details><h2 id="checks">Checks and gate failures</h2><p><a href="checks.md">Complete check list and every e2e journey</a></p><pre>'+esc(JSON.stringify(failures,null,2))+'</pre><h2>Contrast (reported only)</h2>'+contrastTable+'</html>');
}
console.log(JSON.stringify({ pairs: pairs.length, geometryFailures: failures.length, intentionalLabChanges: exceptions.length, composites, output }));
if (failures.length) process.exitCode = 1;
