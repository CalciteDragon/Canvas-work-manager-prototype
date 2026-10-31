// Opt-in evidence report. Run with before/after capture directories and an output directory.
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
// An optional fourth directory supplies the runtime verification run when it was re-run at a
// later commit than the after matrix; its own commit is shown on the sheet.
// `--profile 71` (the default) gates Depth's paint-only change on geometry; `--profile 72` lets
// geometry move, reports it, and gates on slice 72's control census and accessibility names.
const args = process.argv.slice(2);
const flag = name => { const at = args.indexOf(name); return at === -1 ? null : args[at + 1]; };
const profile = flag('--profile') ?? '71';
if (!['71', '72', '73', '74', '75', '76', '77', '78'].includes(profile)) throw new Error(`Unknown profile ${profile}`);
// Profile 75's slice-73 pair has its own "before": the pre-73 build's placement run.
const pre73Dir = flag('--pre73') === null ? null : resolve(flag('--pre73'));
const positional = args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
const [beforeDir, afterDir, output, verificationDir = afterDir] = positional.map(p => resolve(p));
if (!output) throw new Error('Usage: node build-sheet.mjs <before> <after> <output> [verification] [--profile 71|72|73|74|75|76|77|78] [--pre73 <dir>]');
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
const activeExceptions = ['77', '78'].includes(profile) ? CENSUS_EXCEPTIONS.filter(e => e.classes.includes('project-nav__breadcrumb')) : profile === '76' ? CENSUS_EXCEPTIONS.slice(2) : CENSUS_EXCEPTIONS;
const exceptionFor = c => activeExceptions.find(e => e.test(c));
const objectCell = cell => cell.route === '/app' || cell.route?.startsWith('/projects/') || cell.route === '/settings/archived-projects';
// A selector may stand in for an axe node only when its baseline predates the structural identity (`axeNodeIdentity`).
const structuralAnchor = node => /^(drag-preview|dragging)?\|/.test(node.stableAnchor ?? '');
/**
 * Profile 78 only: Slice 78 wrapped the sidebar's projects list in `div[data-projects-region]`, so
 * the list's pre-existing axe nodes gained a new structural anchor. Both forms name one identity;
 * every other anchor is compared as recorded.
 */
const anchorOf = node => profile === '78' && (/\|APP-SIDEBAR:\d+\|NAV:0\|DIV:1\|UL:\d+\|UL\|\|$/.test(node.stableAnchor ?? '') || /^\|data-projects-region=\|DIV\|UL:\d+\|UL\|\|$/.test(node.stableAnchor ?? '')) ? 'sidebar projects list' : node.stableAnchor;
const objectPanels = new Set(['cards', 'object-rows', 'primitives', 'task-row', 'widget-frame', 'activity']);
const chromeCell = cell => cell.route?.startsWith('/projects/') && !/\/(todos|archive|reflections)(?:$|\?)/.test(cell.route);
const censusFailures = [], censusExceptions = [], intendedChanges = [], geometryReport = [];
const read = async p => JSON.parse(await readFile(p, 'utf8'));
const before = await read(join(beforeDir, 'index.json'));
const after = await read(join(afterDir, 'index.json'));
const objectEvidence=profile==='77'?await read(join(verificationDir,'objects-verification.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}):null;
const objectBaseline=profile==='77'?await read(join(beforeDir,'objects-verification.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}):null;
/**
 * Slice 78's states gate. `states-verification.json`'s context table is its only source of
 * exemptions; the Capture scope list, the four changing matrix cells and the changing Lab panels
 * below are the plan's, so a row or context dropped from the evidence fails instead of passing.
 */
const stateEvidence=profile==='78'?await read(join(verificationDir,'states-verification.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}):null;
const stateBaseline=profile==='78'?await read(join(beforeDir,'states-verification.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}):null;
const STATE_EXEMPT_CELLS = ['kitchen-error', 'kitchen-refused', 'kitchen-archived', 'not-a-route'];
const stateExempt = cell => STATE_EXEMPT_CELLS.some(id => cell.id.startsWith(id + '-'));
/** The new state specimens panel (which replaces `states`) and the three panels whose specimens change. */
const STATE_LAB_PANELS = new Set(['state-messages', 'states', 'task-row', 'navigation', 'section-states']);
const labPanels = profile === '78' ? STATE_LAB_PANELS : objectPanels;
const [labAfter, labBefore] = profile === '78' ? [stateEvidence, stateBaseline] : [objectEvidence, objectBaseline];
const labEntry = (evidence, theme, width) => evidence?.entries?.find(e => (e.row === 'lab' || e.context === 'lab') && e.theme === theme && e.width === width);
/**
 * Profile 78, Open question 9 (user decision, 2026-10-30): Q7 gave the reflection composer's body
 * a visible "Reflection" label. Its height is measured, not declared: the growth of the gap between
 * the prompt and the body, which must now equal the gap the "Prompt" label already holds above the
 * prompt. Returns `null` unless a cell has exactly that one change.
 */
const reflectionLabel = (bl, al) => {
  const i = al.controls?.findIndex(c => c.tag === 'textarea' && /^reflection-composer-.+-body$/.test(c.id ?? ''));
  if (!(i >= 2) || al.controls.filter(c => /^reflection-composer-.+-body$/.test(c.id ?? '')).length !== 1) return null;
  const was = bl.controls?.[i], prompt = al.controls[i - 1];
  if (was?.tag !== 'textarea' || bl.controls[i - 1]?.tag !== 'select' || prompt.tag !== 'select' || !/^reflection-composer-.+-prompt$/.test(prompt.id ?? '')) return null;
  const gap = (controls, from, to) => controls[to].y - (controls[from].y + controls[from].height);
  const [promptBefore, bodyBefore, promptAfter, bodyAfter] = [gap(bl.controls, i - 2, i - 1), gap(bl.controls, i - 1, i), gap(al.controls, i - 2, i - 1), gap(al.controls, i - 1, i)];
  const height = bodyAfter - bodyBefore;
  if (height <= 1 || Math.abs(promptAfter - promptBefore) > 0.5 || Math.abs(bodyAfter - promptAfter) > 0.5) return null;
  return { height, top: was.y };
};
/** Q5 raised `--toast-max-block-size` on touch from 12rem to 16rem; the shell's toast clearance follows it. */
const TOUCH_TOAST_CLEARANCE_RISE = 64;
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
  if((profile==='77' && objectCell(a)) || (profile==='78' && objectCell(a) && !stateExempt(a))) {
    for(const box of bl.planes??[])if(['app-top-bar','app-sidebar','app-project-page-navigation','app-project-header'].includes(box.selector)) {
      const now=al.planes?.find(e=>e.selector===box.selector && e.index===box.index);
      if(!now || ['x','y','width','height'].some(field=>!Number.isFinite(box[field]) || !Number.isFinite(now[field]) || Math.abs(box[field]-now[field])>1))failures.push({cell:a.id,reason:'objects fixed shell plane missing or moved more than 1 px',before:box,after:now});
    }
    if(!Array.isArray(bl.immutable) || !Array.isArray(al.immutable))failures.push({cell:a.id,reason:'objects matrix unchanged-region collector missing'});
    const required=a.state?.startsWith('task-drawer')?'drawer:':a.state==='new-project'?'project-form:':['work-create','section-create','shortcut-picker','page-settings','project-details','archive-confirm','refused'].includes(a.state)?'dialog:':a.state==='remove-feedback'?'toast:':null;
    for(const [phase,layout] of [['before',bl],['after',al]])if(required && !layout.immutable?.some(box=>box.id.startsWith(required)))failures.push({cell:a.id,phase,reason:'objects matrix expected unchanged region missing: '+required});
    for(const box of bl.immutable??[]) {
      const now=al.immutable?.find(e=>e.id===box.id);
      if(!now || ['x','y','width','height'].some(field=>!Number.isFinite(box[field]) || !Number.isFinite(now[field]) || Math.abs(box[field]-now[field])>1))failures.push({cell:a.id,reason:'objects matrix unchanged region moved more than 1 px',before:box,after:now});
    }
  }
  const removedRow = profile === '74' ? removedFeedbackRow(bl, al) : null;
  const label = profile === '78' && objectCell(a) && !stateExempt(a) ? reflectionLabel(bl, al) : null;
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
    if (['77','78'].includes(profile) && a.route==='/prototype/design' && family==='controls') {
      old=old.filter(c=>!labPanels.has(c.panel));next=next.filter(c=>!labPanels.has(c.panel));
      const width=a.viewport?.width??Number(a.id.split('-').at(-1));
      const was=labEntry(labBefore,a.theme,width),now=labEntry(labAfter,a.theme,width);
      next=next.map(c=>{
        const b=was?.panels?.find(p=>p.id===c.panel),n=now?.panels?.find(p=>p.id===c.panel);
        return b&&n?{...c,y:c.y-(n.y-b.y)}:c;
      });
    }
    if(['77','78'].includes(profile) && a.route==='/prototype/design' && family==='planes') {
      const width=a.viewport?.width??Number(a.id.split('-').at(-1));
      const was=labEntry(labBefore,a.theme,width),now=labEntry(labAfter,a.theme,width);
      // A plane that names its panel belongs to it; older evidence is placed by where it starts.
      const containing=(box,panels)=>box.panel?panels?.find(p=>p.id===box.panel):panels?.find(p=>['x','y','width','height'].every(field=>Number.isFinite(p[field])) && box.x>=p.x-1 && box.y>=p.y-1 && box.x<p.x+p.width && box.y<p.y+p.height);
      const local=(boxes,evidence)=>boxes.flatMap(box=>{
        const panel=containing(box,evidence?.panels);
        if(!panel)return [box];
        if(labPanels.has(panel.id))return [];
        return [{...box,x:box.x-panel.x,y:box.y-panel.y}];
      });
      for(const box of old) {
        const panel=containing(box,was?.panels);if(!panel || labPanels.has(panel.id))continue;
        const current=now?.panels?.find(p=>p.id===panel.id);
        if(!current || ['x','y','width','height'].some(field=>!Number.isFinite(current[field])) || ['width','height'].some(field=>Math.abs(current[field]-panel[field])>1))failures.push({cell:a.id,reason:'Lab unchanged specimen panel missing or resized',panel:panel.id});
      }
      old=local(old,was);next=local(next,now);
    }
    if (profile==='76' && a.route==='/prototype/design' && family==='controls') {
      const isFrame=c=>/^(Move |Collapse |Expand |Rename |Remove section )/.test(c.text??'') || c.panel==='section-frame';
      const knob=next.find(c=>c.id==='design-lab-canvasChromeRestOpacity');
      old=old.filter(c=>!isFrame(c));next=next.filter(c=>!isFrame(c) && c!==knob);
      // Frame headers are intentionally shorter. Only their measured total height change
      // may translate the catalogue below them; control size, x and paint still gate.
      const frames=bl.planes.filter(p=>p.selector==='app-project-section-frame');
      const afterFrames=al.planes.filter(p=>p.selector==='app-project-section-frame');
      if(frames.length && frames.length===afterFrames.length) {
        const delta=afterFrames.reduce((sum,p)=>sum+p.height,0)-frames.reduce((sum,p)=>sum+p.height,0);
        const beforeEnd=Math.max(...frames.map(p=>p.y+p.height));
        const afterEnd=Math.max(...afterFrames.map(p=>p.y+p.height));
        next=next.map((c,i)=>old[i]?.y>=beforeEnd && c.y>=afterEnd ? {...c,y:c.y-delta}:c);
        if(delta)exceptions.push({cell:a.id,family,reason:'catalogue translates by measured section-frame height change',shift:delta});
      }
      // Only the rail rows below the inserted knob shift; catalogue controls retain their boxes.
      if(knob)next=next.map((c,i)=>c.x<knob.x+knob.width && c.y>knob.y && old[i]?.tag===c.tag && old[i]?.text===c.text ? {...c,y:old[i].y}:c);
    }
    if (label) {
      // Content at or below the body moves by exactly the label; a box holding the body grows by it,
      // and a control centred in that box moves by half. The 375 toast-open screen's workspace also
      // keeps Q5's added clearance. Anything else is compared unchanged.
      const by = (was, now, field, shift) => typeof was?.[field] === 'number' && typeof now?.[field] === 'number' && Math.abs(now[field] - was[field] - shift) <= 1;
      const holds = box => box.y < label.top - 1 && box.y + box.height > label.top + 1;
      const grown = (bl.planes ?? []).filter((box, i) => holds(box) && by(box, al.planes?.[i], 'height', label.height));
      const toast = a.state === 'remove-feedback' && (a.viewport?.width ?? Number(a.id.split('-').at(-1))) === 375;
      let moved = 0;
      next = next.map((box, i) => {
        const was = old[i], copy = { ...box };
        if (!was) return box;
        if (family === 'scrollRegions') {
          for (const field of ['height', 'scrollHeight']) {
            const rise = label.height + (toast && field === 'scrollHeight' && was.class === 'workspace' && !by(was, box, field, label.height) ? TOUCH_TOAST_CLEARANCE_RISE : 0);
            if (was.scrollHeight > label.top && by(was, box, field, rise)) { copy[field] -= rise; moved++; }
          }
          return copy;
        }
        const centred = family === 'controls' && grown.some(p => Math.abs(was.y + was.height / 2 - (p.y + p.height / 2)) <= 1);
        if (centred) { if (by(was, box, 'y', label.height / 2)) { copy.y -= label.height / 2; moved++; } }
        else if (was.y >= label.top - 1 && by(was, box, 'y', label.height)) { copy.y -= label.height; moved++; }
        else if (family === 'planes' && holds(was) && by(was, box, 'height', label.height)) { copy.height -= label.height; moved++; }
        return copy;
      });
      if (moved) exceptions.push({ cell: a.id, family, reason: 'Reflection label reflow (Open question 9)', shift: label.height, boxes: moved, ...(toast && family === 'scrollRegions' ? { toastClearance: TOUCH_TOAST_CLEARANCE_RISE } : {}) });
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
    } else if (profile === '77' && objectCell(a)) {
      const fixedPlanes=new Set(['app-top-bar','app-sidebar','app-project-page-navigation','app-project-header']);
      const fixed=family==='planes' ? changes.filter(change=>fixedPlanes.has(old[change.index]?.selector) || change.reason==='missing numeric geometry') : [];
      if(fixed.length)failures.push({cell:a.id,family,changes:fixed});
      if(changes.length>fixed.length)geometryReport.push({cell:a.id,family,changes:changes.filter(c=>!fixed.includes(c))});
    } else if (profile === '78' && stateExempt(a)) {
      // The four matrix cells this slice changes on purpose: movement is reported; corrupt evidence still fails.
      const corrupt = changes.filter(change => change.reason === 'missing numeric geometry');
      if (corrupt.length) failures.push({ cell: a.id, family, changes: corrupt });
      if (changes.length) geometryReport.push({ cell: a.id, family, changes });
    } else if ( (profile === '76' && (chromeCell(a) || (a.route === '/prototype/design' && family !== 'controls'))) || (profile === '73' && liftCell(a)) || (profile === '74' && feedbackCell(a)) || (profile === '75' && placementCell(a))) {
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
  if (['72', '76', '77', '78'].includes(profile)) {
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
  }
  if ((profile === '76' && chromeCell(a)) || ['77', '78'].includes(profile)) {
    const [was, now] = await Promise.all([read(join(beforeDir, b.artifacts.axe)), read(join(afterDir, a.artifacts.axe))]);
    const key = (v, n) => v.id + ':' + (anchorOf(n) ?? n.target?.join(' '));
    const known = new Set((was.violations ?? []).flatMap(v => v.nodes.flatMap(n => [key(v,n), ...(!['77', '78'].includes(profile) || !structuralAnchor(n) ? [v.id + ':' + n.target?.join(' ')] : [])])));
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
// Section chrome owns its runtime evidence; the frozen Depth journey uses retired labels.
const verification = ['76', '77', '78'].includes(profile) ? { tokens: {} } : await read(join(verificationDir, 'depth-verification.json'));
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

// Slice 77 measures each list independently; missing groups are missing evidence, not zero spread.
const objects = objectEvidence;
const objectsBefore = objectBaseline;
const objectVisualRows=['timeline','timeline-busy','todos','task-list','shortcut','shortcut-empty','picker-preview','drag','archived-projects','archived-projects-root','progress','reflections','lab','dashboard-owner',...['overdue-chaos','busy-week','nested-projects','agent-heavy'].flatMap(seed=>['user-demo','user-alex','user-sam'].map(persona=>'dashboard-'+seed+'-'+persona))];
const objectVisualPairs=profile==='77'?objectVisualRows.flatMap(row=>['dark','light'].flatMap(theme=>(row.startsWith('dashboard-')&&row!=='dashboard-owner'?[1440,1024,375]:[1440,375]).map(width=>{
  const before=objectsBefore?.entries?.find(e=>e.row===row&&e.theme===theme&&e.width===width), after=objects?.entries?.find(e=>e.row===row&&e.theme===theme&&e.width===width);
  const present=e=>e && !e.error && e.screenshot && e.aria;
  return {row,theme,width,status:present(before)&&present(after)?'paired':present(before)?'before only':present(after)?'after only':'missing before and after'};
}))):[];
if (profile === '77') {
  for(const pair of objectVisualPairs)if(pair.status!=='paired')failures.push({reason:'objects visual evidence missing',...pair});
  for(const entry of objects?.entries??[]) {
    const was=objectsBefore?.entries?.find(e=>e.row===entry.row && e.theme===entry.theme && e.width===entry.width);
    const fail=reason=>failures.push({reason,row:entry.row,theme:entry.theme,width:entry.width});
    if(!Array.isArray(was?.controls) || !Array.isArray(entry.controls))fail('objects runtime control collector missing');
    if(!Array.isArray(was?.axe?.violations) || !Array.isArray(entry.axe?.violations))fail('objects runtime axe collector missing');
    const touch=entry.width===375,product=(entry.controls??[]).filter(c=>c.scope==='product');
    for(const c of product) {
      const box=c.target??c;
      if(!(touch ? box.height<44 || box.width<24 : box.height<24 || box.width<24))continue;
      const detail={cell:'objects:'+entry.row,theme:entry.theme,width:entry.width,reason:touch?'touch target under 44 px':'target under 24 px',text:c.text,class:c.class,targetWidth:box.width,targetHeight:box.height};
      const exception=exceptionFor(c);
      if(exception)censusExceptions.push({...detail,owner:exception.owner});else censusFailures.push(detail);
    }
    if(!touch) {
      const distinct=heights=>heights.sort((a,b)=>a-b).filter((h,i,all)=>i===0 || h-all[i-1]>0.5);
      const buttons=distinct(product.filter(c=>/(^|\s)button(\s|$)/.test(c.class??'') && !/\bbutton--row\b/.test(c.class??'')).map(c=>c.height));
      if(buttons.length>2)fail('objects runtime more than two button heights');
      const fields=distinct(product.filter(c=>(c.tag==='select' || (c.tag==='input' && !['checkbox','radio','hidden','range','color','file'].includes(c.type))) && /\b(field|select)\b/.test(c.class??'')).map(c=>c.height));
      if(fields.length>1)fail('objects runtime more than one field height');
    }
    const nodeKey=(v,n)=>v.id+':'+(n.stableAnchor??n.target?.join(' '));
    const known=new Set((was?.axe?.violations??[]).flatMap(v=>v.nodes.flatMap(n=>[nodeKey(v,n),...(structuralAnchor(n)?[]:[v.id+':'+n.target?.join(' ')])])));
    for(const violation of entry.axe?.violations??[]) {
      if(['select-name','aria-progressbar-name','button-name'].includes(violation.id))fail('objects runtime axe '+violation.id);
      if(violation.id==='target-size' && violation.nodes.some(n=>!activeExceptions.some(e=>e.classes.some(name=>n.target.join(' ').includes(name)))))fail('objects runtime axe target-size');
      if(violation.id!=='color-contrast')for(const node of violation.nodes)if(!known.has(nodeKey(violation,node)) && !known.has(violation.id+':'+node.target?.join(' ')))fail('objects runtime new axe node '+violation.id);
    }
    if(!was?.immutable?.length || !entry.immutable?.length)fail('objects unchanged-region evidence missing');
    // Dashboard-owner deliberately navigates to another route only after implementation.
    if(entry.row!=='dashboard-owner')for(const box of was?.immutable??[]) {
      let previous=box,now=entry.immutable?.find(n=>n.id===box.id);
      // The Lab embeds live sidebars and a contained drawer below changing row panels.
      // Their observed containing panel may translate; their local geometry still gates.
      if(entry.row==='lab' && (/^app-sidebar:[1-9]\d*$/.test(box.id) || box.id.startsWith('[data-task-drawer]:'))) {
        const panel=was.panels?.find(p=>['x','y','width','height'].every(field=>Number.isFinite(p[field])) && box.x>=p.x-1 && box.y>=p.y-1 && box.x<p.x+p.width && box.y<p.y+p.height);
        if(panel) {
          const current=entry.panels?.find(p=>p.id===panel.id);
          if(!current || ['x','y','width','height'].some(field=>!Number.isFinite(current[field])) || ['width','height'].some(field=>Math.abs(current[field]-panel[field])>1))fail('objects Lab specimen panel missing or resized: '+panel.id);
          else {
            previous={...box,x:box.x-panel.x,y:box.y-panel.y};
            if(now)now={...now,x:now.x-current.x,y:now.y-current.y};
          }
        }
      }
      if(!now || ['x','y','width','height'].some(field=>!Number.isFinite(previous[field]) || !Number.isFinite(now[field]) || Math.abs(previous[field]-now[field])>1))fail('objects unchanged region moved more than 1 px: '+box.id);
    }
    if(entry.row==='dashboard-owner' && (entry.ownerAvailable!==true || entry.ownerFocused!==true))fail('objects dashboard owner target missing');
    if(entry.row==='drag' && entry.width===1440 && entry.dragging!==true)fail('objects drag visual is not mid-drag');
  }
  for (const [phase, evidence] of [['before', objectsBefore], ['after', objects]]) {
    if (!evidence?.complete || !evidence.entries?.length) failures.push({reason:'objects-verification.json missing or incomplete',phase});
    for(const entry of evidence?.entries??[])if(['timeline','timeline-busy','task-list','shortcut','progress','reflections'].includes(entry.row)) {
      const target=entry.screenshotTarget;
      if(target?.visible!==true || !target.selector || !target.box || ['x','y','width','height'].some(field=>!Number.isFinite(target.box[field])) || target.box.width<=0 || target.box.height<=0)failures.push({reason:'objects screenshot target visibility evidence missing',phase,row:entry.row,theme:entry.theme,width:entry.width});
      else {
        // The collector asserts 95% in view; the gate rechecks the recorded box against the capture viewport.
        const {x,y,width,height}=target.box, viewportHeight=entry.width===375?812:900;
        const inside=Math.max(0,Math.min(x+width,entry.width)-Math.max(x,0))*Math.max(0,Math.min(y+height,viewportHeight)-Math.max(y,0));
        if(inside<width*height*0.95)failures.push({reason:'objects screenshot target outside the viewport',phase,row:entry.row,theme:entry.theme,width:entry.width,box:target.box});
      }
    }
    for(const entry of evidence?.entries??[])if(entry.row==='dashboard-owner' && (!entry.hoverScreenshot || !entry.focusScreenshot))failures.push({reason:'objects dashboard hover/focus visual missing',phase,theme:entry.theme,width:entry.width});
    for (const row of ['timeline','timeline-busy','todos']) for (const theme of ['dark','light']) for (const width of [1440,375]) {
      const entry=evidence?.entries?.find(e=>e.row===row && e.theme===theme && e.width===width);
      if (!entry || entry.error || !entry.groups?.length || !entry.screenshot || !entry.aria) { failures.push({reason:'objects title evidence missing',phase,row,theme,width});continue; }
      for (const group of entry.groups) {
        if (!group.titles?.length || group.titles.some(x=>!Number.isFinite(x))) failures.push({reason:'objects title measurement missing',phase,row,theme,width});
        else if (phase==='after' && Math.max(...group.titles)-Math.min(...group.titles)>1) failures.push({reason:'objects title alignment exceeds 1 px',row,theme,width,group});
      }
    }
  }
  for (const id of [...Array.from({length:9},(_,i)=>'T'+String(i+1).padStart(2,'0')),'T11']) {
    const was=objectsBefore?.tasks?.find(t=>t.id===id), now=objects?.tasks?.find(t=>t.id===id);
    const complete=t=>t && t.status==='completed' && t.deadEnds===0 && Number.isFinite(t.clicks) && Number.isFinite(t.keystrokes);
    const deadBefore=was?.status==='blocked' && Number.isFinite(was.deadEnds) && was.deadEnds>0 && Number.isFinite(was.clicks) && Number.isFinite(was.keystrokes);
    if (!was || !complete(now) || (id==='T11' && !complete(was) && !deadBefore) || (id!=='T11' && !complete(was)) || (complete(was) && (now.clicks>was.clicks || now.keystrokes>was.keystrokes)) || (id==='T11' && complete(was) && now.clicks>=was.clicks)) failures.push({reason:'objects core task regression or missing evidence',id,before:was,after:now});
  }
}

// Slice 78: every Done when rule against every row of the context table, in every captured view.
const STATE_CAPTURE_SCOPE = ['dashboard-me-failing', 'dashboard-real-ai', 'sidebar-loading', 'sidebar-failed', 'project-read-failing', 'project-unavailable-alex',
  'kitchen-sections-failing', 'kitchen-shortcuts-failing', 'kitchen-bodies-failing', 'kitchen-reflection-create-failing', 'kitchen-reflection-edit-failing',
  'kitchen-section-create-failing', 'kitchen-tasks-lifted', 'todos-failing', 'reflections-page-failing', 'archive-failing', 'archived-projects-failing',
  'agents-failing', 'picker-discovery-failing', 'todos-stale', 'archive-restore-failing', 'archive-restore-unrefreshed', 'archive-stale',
  'archived-projects-stale', 'kitchen-progress-formula-failing', 'write-task-complete', 'write-drawer-field', 'write-quick-add',
  'write-section-removal-toast', 'markdown-save-failing', 'pin-todos-below', 'pin-tasklist-above', 'pin-section-collapse', 'pin-shortcut-collapse',
  'pin-tall-tasklist-banner', 'header-progress-empty-project', 'header-progress-failing', 'header-progress-legacy', 'not-found', 'kitchen-loading',
  'header-progress-pending'];
const STATE_VIEWS = [['dark', 1440], ['dark', 375], ['light', 1440], ['light', 375]];
const RECOVERY_NAMES = { 'try-again': 'Try again', 'go-home': 'Go to Home', 'retry-refresh': 'Retry refresh', reload: 'Reload' };
/** What each pinned context must have on screen for its pin to prove clearance (Capture scope). */
const PIN_CLEARANCE = { 'pin-todos-below': 'toast', 'pin-tasklist-above': 'sticky' };
/** The plan's Visual acceptance table, one pair per row and view. */
const STATE_VISUAL_PAIRS = [
  ['sidebar-loading', 'dark', 1440, 'L4-001'], ['sidebar-loading', 'light', 375, 'L4-001'], ['dashboard-me-failing', 'dark', 1440, 'L4-002'],
  ['kitchen-bodies-failing', 'dark', 1440, 'L4-002, L4-003'], ['kitchen-bodies-failing', 'light', 375, 'L4-002, L4-003'], ['kitchen-shortcuts-failing', 'light', 1440, 'L4-002'],
  ['kitchen-tasks-lifted', 'light', 1440, 'L4-027'], ['dashboard-real-ai', 'dark', 1440, 'L4-022'], ['dashboard-real-ai', 'light', 375, 'L4-022'],
  ['project-unavailable-alex', 'light', 1440, 'W4-024, L4-014'], ['not-found', 'light', 1440, 'L4-014'], ['not-found', 'dark', 375, 'L4-014'],
  ['lab', 'dark', 1440, 'L4-018, L6-003'], ['markdown-save-failing', 'dark', 1440, 'L4-018'], ['write-task-complete', 'light', 1440, 'L6-003'],
  ['write-section-removal-toast', 'light', 1440, 'L6-003'], ['pin-todos-below', 'dark', 1440, "slice 75's open question"], ['pin-todos-below', 'light', 375, "slice 75's open question"],
  ['header-progress-empty-project', 'dark', 1440, 'L4-017'], ['header-progress-failing', 'dark', 1440, 'L4-017'], ['header-progress-legacy', 'light', 1440, 'L4-017'],
  ['archive-failing', 'light', 1440, 'L4-002'], ['archived-projects-failing', 'light', 1440, 'L4-002'], ['agents-failing', 'light', 1440, 'L4-002'],
];
const isBox = b => !!b && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(b[k]));
const within = (b, o, tol = 1) => b.x >= o.x - tol && b.y >= o.y - tol && b.x + b.width <= o.x + o.width + tol && b.y + b.height <= o.y + o.height + tol;
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const targetOk = (b, touch) => isBox(b) && b.width >= 24 && b.height >= (touch ? 44 : 24);
/**
 * The clear port, recomputed from raw geometry rather than trusted from the app: the scroll port's
 * client box, below any stuck `[data-pin-clearance]` control and above an open toast. Null when
 * any of that geometry is missing, which fails rather than passes.
 */
function clearPort(frame) {
  const port = frame?.scrollPort?.client;
  if (!isBox(port) || !isBox(frame.track) || !Array.isArray(frame.sticky) || frame.sticky.some(s => !isBox(s?.box)) || !('toast' in frame) || (frame.toast !== null && !isBox(frame.toast))) return null;
  const stuck = frame.sticky.map(s => s.box).filter(b => b.height > 0 && b.y <= port.y + 1 && b.y + b.height > port.y);
  const top = Math.max(port.y, ...stuck.map(b => b.y + b.height));
  const toast = frame.toast && frame.toast.height > 0 && frame.toast.y < port.y + port.height && frame.toast.y + frame.toast.height > port.y ? frame.toast : null;
  return { port, track: frame.track, top, bottom: toast ? Math.min(port.y + port.height, toast.y) : port.y + port.height, stuck, toast };
}
const stateChecks = [];
let stateHooks = null;
async function webHook(hook) {
  if (!stateHooks) {
    const root = new URL('../../../../apps/web/src/', import.meta.url);
    const files = (await readdir(root, { recursive: true })).filter(f => /\.(html|ts)$/.test(f) && !/\.(spec|stories)\.ts$/.test(f));
    stateHooks = (await Promise.all(files.map(f => readFile(new URL(f, root), 'utf8')))).join('\n');
  }
  return new RegExp(`(?<![\\w-])${hook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(stateHooks);
}
const stateVisualPairs = profile === '78' ? STATE_VISUAL_PAIRS.map(([context, theme, width, findings]) => {
  const find = evidence => evidence?.entries?.find(e => e.context === context && e.theme === theme && e.width === width);
  const present = e => e && !e.error && e.screenshot;
  const [was, now] = [find(stateBaseline), find(stateEvidence)];
  return { context, theme, width, findings, before: was?.screenshot ?? null, after: now?.screenshot ?? null, status: present(was) && present(now) ? 'paired' : present(was) ? 'before only' : present(now) ? 'after only' : 'missing before and after' };
}) : [];
if (profile === '78') {
  const fail = (reason, detail = {}) => failures.push({ reason: 'states: ' + reason, ...detail });
  for (const [phase, evidence] of [['before', stateBaseline], ['after', stateEvidence]]) if (!evidence?.complete || !evidence.entries?.length) fail('states-verification.json missing or incomplete', { phase });
  for (const pair of stateVisualPairs) if (pair.status !== 'paired') fail('visual acceptance pair missing', pair);
  const rows = Array.isArray(stateEvidence?.rows) ? stateEvidence.rows : [];
  for (const context of STATE_CAPTURE_SCOPE) if (!rows.some(r => r.context === context)) fail('Capture scope context has no table row', { context });
  for (const r of rows) {
    if (!['read', 'write', 'stale', 'loading', 'pending', 'settled'].includes(r.kind) || !Object.keys(RECOVERY_NAMES).concat('none').includes(r.recovery) || typeof r.details !== 'boolean' || ![null, 'top', 'bottom'].includes(r.pinned ?? null) || typeof r.region !== 'string')
      fail('invalid context table row', { row: r });
    if (r.emptyHook != null && (!/^data-[\w-]+-empty$|^data-empty-canvas$/.test(r.emptyHook) || !await webHook(r.emptyHook))) fail('row empty hook not found in the web source', { context: r.context, emptyHook: r.emptyHook });
    if (r.kind === 'pending' && !r.text) fail('pending row without its declared text', { context: r.context });
    // A settled row is a correct non-failure answer ("No tasks to measure"): no recovery, no Details.
    if (r.kind === 'settled' && (r.recovery !== 'none' || r.details)) fail('settled row declaring a recovery or Details', { row: r });
  }
  // Section and shortcut frames with rows of their own: their empty hooks are theirs to judge.
  const ownedFrames = new Set(rows.map(r => r.region).filter(region => /^\[data-(section|shortcut)-id=/.test(region)));
  for (const context of [...STATE_CAPTURE_SCOPE, 'lab']) for (const [theme, width] of STATE_VIEWS) {
    const e = stateEvidence?.entries?.find(x => x.context === context && x.theme === theme && x.width === width);
    const at = { context, theme, width }, touch = width === 375;
    if (!e || e.error) { fail('context not captured', { ...at, error: e?.error ?? null }); continue; }
    const was = stateBaseline?.entries?.find(x => x.context === context && x.theme === theme && x.width === width);
    // A state's before often rendered the same route another way (a whole-page loading line, a false
    // empty), so a node is new only when no before state on this route, theme and width had it.
    // The state's own before is always known. When the rig created the project it shows, the two
    // routes differ only by that generated id, which the after's node keys are read back through.
    const view = (stateBaseline?.entries ?? []).filter(x => x.theme === theme && x.width === width && (x.route === e.route || x === was));
    const [nowId, wasId] = [e.route, was?.route].map(route => typeof route === 'string' ? route.split('/').at(-1) : null);
    const regenerated = was && nowId && wasId && nowId !== wasId && /^project-[0-9a-f]{8}$/.test(nowId) && /^project-[0-9a-f]{8}$/.test(wasId);
    const asBefore = key => regenerated ? key.replaceAll(nowId, wasId) : key;
    // The full census and the new-axe-node rule, as profile 77 runs them on its runtime entries.
    if (!Array.isArray(e.controls) || !Array.isArray(e.axe?.violations) || !Array.isArray(was?.axe?.violations)) fail('runtime control or axe collector missing', at);
    for (const c of (e.controls ?? []).filter(c => c.scope === 'product')) {
      const box = c.target ?? c;
      if (!(touch ? box.height < 44 || box.width < 24 : box.height < 24 || box.width < 24)) continue;
      const detail = { cell: 'states:' + context, theme, width, reason: touch ? 'touch target under 44 px' : 'target under 24 px', text: c.text, class: c.class, targetWidth: box.width, targetHeight: box.height };
      const exception = exceptionFor(c);
      if (exception) censusExceptions.push({ ...detail, owner: exception.owner }); else censusFailures.push(detail);
    }
    const nodeKey = (v, n) => v.id + ':' + (anchorOf(n) ?? n.target?.join(' '));
    const known = new Set(view.flatMap(x => x.axe?.violations ?? []).flatMap(v => v.nodes.flatMap(n => [nodeKey(v, n), ...(structuralAnchor(n) ? [] : [v.id + ':' + n.target?.join(' ')])])));
    for (const violation of e.axe?.violations ?? []) {
      if (['select-name', 'aria-progressbar-name', 'button-name'].includes(violation.id)) fail('runtime axe ' + violation.id, at);
      if (violation.id !== 'color-contrast') for (const node of violation.nodes) if (!known.has(asBefore(nodeKey(violation, node))) && !known.has(asBefore(violation.id + ':' + node.target?.join(' ')))) fail('runtime new axe node ' + violation.id, { ...at, target: node.target });
    }
    if (context === 'lab') {
      // The panel-relative Lab gate reads these boxes; an unchanged panel may move, never resize.
      const valid = panels => Array.isArray(panels) && panels.length > 0 && panels.every(p => p.id && isBox(p));
      if (!valid(e.panels) || !valid(was?.panels)) { fail('Lab panel evidence missing', at); continue; }
      for (const panel of was.panels) if (!labPanels.has(panel.id)) {
        const now = e.panels.find(p => p.id === panel.id);
        if (!now || ['width', 'height'].some(k => Math.abs(now[k] - panel[k]) > 1)) fail('Lab unchanged specimen panel missing or resized', { ...at, panel: panel.id });
      }
      continue;
    }
    const mine = rows.filter(r => r.context === context);
    const checked = [];
    const check = (r, reason, detail = {}) => { checked.push(reason); fail(reason, { ...at, region: r?.region ?? null, ...detail }); };
    if (e.reason && e.reasonVisible !== false) check(null, 'injected reason visible outside a closed Details', { reasonVisible: e.reasonVisible ?? null });
    if (!Array.isArray(e.rawReasonHits) || e.rawReasonHits.length) check(null, 'raw reason text visible', { hits: e.rawReasonHits ?? null });
    if (!mine.some(r => r.pinned) && (!Array.isArray(e.pins) || e.pins.length)) check(null, 'pinned copy shown while no row is pinned', { pins: e.pins ?? null });
    // A section's failure belongs in its frame: beside a section row, nothing fails at canvas level
    // outside every frame (the canvas rows own their own canvas-level failure).
    if (mine.some(r => /^\[data-(section|shortcut)-id=/.test(r.region)) && !mine.some(r => r.region === 'app-project-canvas') && (!Array.isArray(e.canvasFailures) || e.canvasFailures.length))
      check(null, 'failure outside every section frame on the canvas', { canvasFailures: e.canvasFailures ?? null });
    for (const r of mine) {
      const reg = e.regions?.find(x => x.region === r.region);
      if (!reg?.present) { check(r, 'row region missing'); continue; }
      if (r.kind === 'settled' && e.reason) check(r, 'settled row in a context with an injected failure');
      if (r.kind === 'read') {
        // A canvas row ignores a truly empty section that its own row owns (Open question 8); every
        // visible hook must be placed, and a hook outside every owned frame still fails.
        const hooks = reg.visibleEmptyHooks, frames = reg.emptyHookFrames;
        const placed = Array.isArray(hooks) && Array.isArray(frames) && hooks.every(h => frames.some(f => f.hook === h));
        const unowned = r.region === 'app-project-canvas' && placed ? [...new Set(frames.filter(f => !ownedFrames.has(f.frame)).map(f => f.hook))] : hooks;
        if (!Array.isArray(unowned) || unowned.length) check(r, 'empty hook visible in a failed read', { hooks: hooks ?? null, frames: frames ?? null });
      }
      if (!Array.isArray(reg.buttons)) check(r, 'region control evidence missing');
      const recoveries = (reg.buttons ?? []).filter(b => b.visible === true && (Object.values(RECOVERY_NAMES).includes(b.name?.trim()) || Object.hasOwn(RECOVERY_NAMES, b.recovery ?? '')));
      if (r.recovery === 'none') { if (recoveries.length) check(r, 'undeclared recovery control', { controls: recoveries.map(b => b.name) }); }
      else {
        const own = recoveries.filter(b => b.name?.trim() === RECOVERY_NAMES[r.recovery] || b.recovery === r.recovery);
        if (!own.length) check(r, 'declared recovery control missing', { recovery: r.recovery, controls: recoveries.map(b => b.name) });
        for (const b of own) if (!targetOk(b.box, touch)) check(r, 'recovery control under target size', { box: b.box ?? null });
      }
      for (const b of (reg.buttons ?? []).filter(b => b.tag === 'summary' && b.visible === true)) if (!targetOk(b.box, touch)) check(r, 'Details summary under target size', { box: b.box ?? null });
      const opened = e.detailsOpen?.find(x => x.region === r.region);
      if (r.details) {
        if (!e.reason) check(r, 'details row with no injected reason');
        else if (!opened?.details?.some(d => d.open === true && d.visible !== false && d.text?.includes(e.reason))) check(r, 'Details does not reveal the injected reason');
      } else if (!Array.isArray(reg.details) || [...reg.details, ...(opened?.details ?? [])].some(d => d.visible !== false)) check(r, 'Details shown on a details:false row');
      if (r.kind === 'loading' && !(reg.loading ?? []).some(l => l.visible === true && l.busy === true)) check(r, 'loading row without a busy loading line');
      if (r.kind === 'pending' && (!r.text || !reg.text?.includes(r.text))) check(r, 'pending row without its declared text', { text: r.text ?? null });
      if (/^\[data-(section|shortcut)-id=/.test(r.region)) for (const f of reg.failures ?? []) if (isBox(f.box) && (!isBox(reg.box) || !within(f.box, reg.box))) check(r, 'failure outside its section frame', { box: f.box });
      if (!r.pinned) continue;
      // The pin gate: every input is raw geometry, and any missing input fails.
      const clear = clearPort(e), anchors = reg.anchors, top = r.pinned === 'top';
      if (!clear) { check(r, 'pin clearance geometry missing'); continue; }
      if (!Array.isArray(anchors) || !anchors.length || anchors.some(x => !isBox(x.box))) { check(r, 'pin sentence anchor geometry missing'); continue; }
      if (!Array.isArray(e.pins)) { check(r, 'pin evidence missing'); continue; }
      if (!anchors.every(x => top ? x.box.y + x.box.height <= clear.top + 0.5 : x.box.y >= clear.bottom - 0.5)) check(r, 'pinned while its sentence anchor is in view');
      if (PIN_CLEARANCE[context] === 'toast' && !clear.toast) check(r, 'the toast is not open over the bottom edge');
      if (PIN_CLEARANCE[context] === 'sticky' && !clear.stuck.length) check(r, 'the quick-add is not stuck at the top edge');
      const onEdge = e.pins.filter(p => p.edge === r.pinned);
      if (onEdge.length !== 1 || e.pins.length !== 1) check(r, `${onEdge.length} pinned copies at the ${r.pinned} edge, ${e.pins.length} in all`, { pins: e.pins });
      for (const p of onEdge) {
        if (p.indicator !== (top ? '↑' : '↓')) check(r, 'pin indicator does not point to its reference', { indicator: p.indicator ?? null });
        if (![p.box, p.show, p.dismiss].every(isBox)) { check(r, 'pin geometry missing'); continue; }
        if (!within(p.box, { x: clear.port.x, y: clear.top, width: clear.port.width, height: clear.bottom - clear.top }, 0.5)) check(r, 'pin outside the clear scroll port', { box: p.box, clear: { top: clear.top, bottom: clear.bottom } });
        if (p.box.x < clear.track.x - 0.5 || p.box.x + p.box.width > clear.track.x + clear.track.width + 0.5) check(r, 'pin outside the content track', { box: p.box, track: clear.track });
        if ([...clear.stuck, ...(clear.toast ? [clear.toast] : [])].some(b => overlaps(p.box, b))) check(r, 'pin overlaps the stuck quick-add or the open toast', { box: p.box });
        const centre = p.box.y + p.box.height / 2, middle = (clear.top + clear.bottom) / 2;
        if (top ? centre > middle : centre < middle) check(r, 'pin not at its edge', { box: p.box });
        if (!targetOk(p.show, touch)) check(r, 'pin under target size', { box: p.show });
        if (!targetOk(p.dismiss, touch)) check(r, 'pin close button under target size', { box: p.dismiss });
      }
      const pressed = e.afterPinPress;
      if (!pressed) { check(r, 'pin press not recorded'); continue; }
      const after = clearPort(pressed), revealed = pressed.regions?.find(x => x.region === r.region)?.anchors;
      if (!after || !Array.isArray(pressed.pins) || !Array.isArray(revealed) || !revealed.length || revealed.some(x => !isBox(x.box))) check(r, 'pin press geometry missing');
      else {
        if (pressed.pins.length) check(r, 'a pin is still shown after the press', { pins: pressed.pins });
        if (!revealed.some(x => x.box.y >= after.top - 0.5 && x.box.y + x.box.height <= after.bottom + 0.5)) check(r, 'pin press did not reveal its sentence anchor');
      }
      if (!(pressed.focus?.inRegion === true && (pressed.focus.describes === true || pressed.focus.isAnchor === true))) check(r, 'pin press did not focus the control its sentence describes', { focus: pressed.focus ?? null });
    }
    stateChecks.push({ context, theme, width, failures: checked.length, checks: checked });
  }
  const ids = [...Array.from({ length: 9 }, (_, i) => 'T' + String(i + 1).padStart(2, '0')), 'T11'];
  const complete = t => t && t.status === 'completed' && t.deadEnds === 0 && Number.isFinite(t.clicks) && Number.isFinite(t.keystrokes);
  const task = (evidence, id) => Array.isArray(evidence?.tasks) ? evidence.tasks.find(t => t.id === id) : undefined;
  for (const id of ids) {
    const was = task(stateBaseline, id), now = task(stateEvidence, id);
    if (!complete(was) || !complete(now) || now.clicks > was.clicks || now.keystrokes > was.keystrokes) fail('core task regression or missing evidence', { id, before: was ?? null, after: now ?? null });
  }
  const was12 = task(stateBaseline, 'T12'), now12 = task(stateEvidence, 'T12');
  // Before is a dead end; after costs one click.
  if (!was12 || was12.status === 'completed' || !(was12.deadEnds > 0) || !complete(now12) || now12.clicks !== 1 || now12.keystrokes > 0) fail('T12 is not a dead end before and one click after', { before: was12 ?? null, after: now12 ?? null });
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
const report = { objects, objectsBefore, objectVisualPairs, chrome, chromeBefore, placement, baselinePlacement, pre73Placement, placementPairs: placementPairs.map(({ before, after, beforeDir: _dir, ...pair }) => ({ ...pair, before: before?.screenshot ?? null, after: after?.screenshot ?? null })), profile, before: before.commit, after: after.commit, recaptures: after.recaptures ?? [], pairs: pairs.length, geometryFailures: failures, censusFailures, censusExceptions, intendedChanges, geometryReport, intentionalLabChanges: exceptions, contrast, composites, verification, baselineVerification, primitives, baselinePrimitives, lifts, liftBaseline, tasks, captureProvenance, finalBuild, feedback, feedbackFindings, feedbackVisualPairs, statesVisualPairs: stateVisualPairs, stateChecks, statesTasks: profile === '78' ? { before: stateBaseline?.tasks ?? null, after: stateEvidence?.tasks ?? null } : null };
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
if (profile === '77') {
  const gallery=[],featured=[];
  const specimenShot=after.cells.find(cell=>cell.id==='prototype-design-dark-1440')?.artifacts?.scrolls?.find(file=>file.endsWith('.scroll-0-6.png'));
  if(specimenShot) {
    const file='after-'+specimenShot;await copyFile(join(afterDir,specimenShot),join(output,file));
    featured.push('<article><h3>After only: six Object rows states</h3><p>The new primitive specimens appear together in this existing Lab scroll capture. The baseline has no corresponding six-state panel.</p>'+figure(file,'After · link, static, high priority, overdue, finished and read-only')+'</article>');
  }
  const selected=new Set(['timeline-busy|dark|1440','task-list|light|1440','task-list|dark|375','todos|light|1440','todos|dark|375','dashboard-overdue-chaos-user-demo|dark|1440','dashboard-overdue-chaos-user-demo|light|375','dashboard-owner|dark|1440','dashboard-nested-projects-user-demo|light|1440','dashboard-agent-heavy-user-demo|dark|1440','timeline|dark|1440','timeline|light|375','shortcut|dark|1440','shortcut|light|375','shortcut-empty|dark|1440','shortcut-empty|light|375','picker-preview|dark|1440','picker-preview|light|375','drag|dark|1440','archived-projects|light|1440','archived-projects-root|light|1440','progress|dark|1440','progress|light|1440','reflections|dark|1440','lab|dark|1440']);
  for (const entry of objects?.entries??[]) {
    const was=objectsBefore?.entries?.find(e=>e.row===entry.row && e.theme===entry.theme && e.width===entry.width);
    const pictures=[];
    for(const [phase,item,dir] of [['before',was,beforeDir],['after',entry,verificationDir]]) if(item?.screenshot) {
      const file=phase+'-'+item.screenshot;await copyFile(join(dir,item.screenshot),join(output,file));pictures.push(figure(file,phase));
    }
    const visual='<article><h3>'+esc(entry.row+' '+entry.theme+' '+entry.width)+'</h3><div class="pair">'+pictures.join('')+'</div></article>';
    gallery.push(visual);if(selected.has([entry.row,entry.theme,entry.width].join('|')))featured.push(visual);
    if(entry.row==='dashboard-owner')for(const field of ['hoverScreenshot','focusScreenshot']) {
      const pictures=[];
      for(const [phase,item,dir] of [['before',was,beforeDir],['after',entry,verificationDir]])if(item?.[field]) {
        const file=phase+'-'+item[field];await copyFile(join(dir,item[field]),join(output,file));pictures.push(figure(file,phase+(phase==='before'&&field==='focusScreenshot'?' · inert title cannot receive focus':'')));
      }
      const visual='<article><h3>'+esc(field==='hoverScreenshot'?'Overdue dashboard title · hover':'Overdue dashboard title · keyboard focus')+' '+esc(entry.theme+' '+entry.width)+'</h3><div class="pair">'+pictures.join('')+'</div></article>';
      gallery.push(visual);if((entry.theme==='dark'&&entry.width===1440)||(entry.theme==='light'&&entry.width===375))featured.push(visual);
    }
  }
  const costs='<table><tr><th>Task</th><th>Before clicks / keys</th><th>After clicks / keys</th><th>Before → after</th></tr>'+(objects?.tasks??[]).map(task=>{
    const was=objectsBefore?.tasks?.find(t=>t.id===task.id);
    return '<tr><th>'+esc(task.id)+'</th><td>'+esc(was?.clicks)+' / '+esc(was?.keystrokes)+'</td><td>'+esc(task.clicks)+' / '+esc(task.keystrokes)+'</td><td>'+esc(was?.status)+' → '+esc(task.status)+'</td></tr>';
  }).join('')+'</table>';
  const aria=(objects?.entries??[]).filter(e=>e.row==='dashboard-agent-heavy-user-demo'&&e.width===1440).map(entry=>{
    const was=objectsBefore?.entries?.find(e=>e.row===entry.row&&e.theme===entry.theme&&e.width===entry.width);
    return '<details><summary>ARIA snapshots: agent-heavy '+esc(entry.theme)+' 1440 (L5-023)</summary><div class="pair"><pre>'+esc(was?.aria??'Missing before')+'</pre><pre>'+esc(entry.aria??'Missing after')+'</pre></div></details>';
  }).join('');
  await writeFile(join(output,'objects-verification.json'),JSON.stringify(objects,null,2));
  await writeFile(join(output,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Slice 77 · Objects · Gate 2</title><style>body{font:16px system-ui;margin:24px;background:#11151f;color:#f2f4fa}img{width:100%;max-height:650px;object-fit:contain}.pair{display:grid;grid-template-columns:1fr 1fr}pre{white-space:pre-wrap}a{color:#ffad7f}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Objects / Slice 77</h1><p>Gate 2 · awaiting visual acceptance. '+pairs.length+' paired matrix cells · '+failures.length+' gate failures.</p><p><a href="report.json">Full gate report</a> · <a href="objects-verification.json">Title alignment and core tasks</a></p><h2>Core task costs</h2>'+costs+aria+'<h2>Visual acceptance before / after</h2>'+featured.join('')+'<details><summary>All runtime pairs</summary>'+gallery.join('')+'</details>'+'<h2>Visual acceptance inventory</h2><pre>'+esc(JSON.stringify(objectVisualPairs,null,2))+'</pre><h2>Findings</h2><p>L2-014: shared row treatments and Reflections accent. L2-015, L1-016, L3-019, W2-023: Task List and Todos anatomy and wrapping. W1-031, W2-014, W3-013, W4-012, L3-024: overdue dashboard owner. L5-023: agent-heavy ARIA snapshot. L7-017: Active Projects ancestor path. L1-010, L3-015, note-002: Timeline columns. L3-018, L4-016, W1-042, W2-025: shortcut source rows. W1-040, W2-024: grouped picker Preview. L3-017: mid-drag cue. W4-035: Archived projects ancestors. note-003: active Progress formula.</p><h2>Matrix before / after</h2>'+pairs.map(card).join('')+'<h2>Checks and gate failures</h2><pre>'+esc(JSON.stringify(failures,null,2))+'</pre><h2>Contrast (reported only)</h2>'+contrastTable+'</html>');
}
if (profile === '78') {
  const copied = new Set();
  const copy = async (phase, dir, file) => {
    if (!file) return null;
    const name = phase + '-' + file;
    if (!copied.has(name)) { await copyFile(join(dir, file), join(output, name)); copied.add(name); }
    return name;
  };
  const find = (evidence, context, theme, width) => evidence?.entries?.find(e => e.context === context && e.theme === theme && e.width === width);
  const extras = [['detailsOpenScreenshot', 'Details open'], ['afterPinPressScreenshot', 'after pressing the pin'], ['afterRetryScreenshot', 'after Try again'], ['afterCancelScreenshot', 'after Cancel']];
  const featured = [];
  for (const pair of stateVisualPairs) {
    const was = find(stateBaseline, pair.context, pair.theme, pair.width), now = find(stateEvidence, pair.context, pair.theme, pair.width);
    const pictures = [];
    for (const [phase, item, dir] of [['before', was, beforeDir], ['after', now, verificationDir]]) if (item?.screenshot && !item.error) pictures.push(figure(await copy(phase, dir, item.screenshot), phase));
    const more = [];
    for (const [field, caption] of extras) if (now?.[field]) more.push(figure(await copy('after', verificationDir, now[field]), 'after · ' + caption));
    featured.push(`<article id="pair-${esc(pair.context)}-${pair.theme}-${pair.width}"><h3>${esc(`${pair.context} · ${pair.theme} · ${pair.width}`)}</h3><p>${esc(pair.findings)} · ${esc(pair.status)}</p><div class="pair">${pictures.join('')}</div>${more.length ? `<div class="pair">${more.join('')}</div>` : ''}</article>`);
  }
  const costs = '<table><tr><th>Task</th><th>Before clicks / keys</th><th>After clicks / keys</th><th>Before → after</th></tr>' + [...Array.from({ length: 9 }, (_, i) => 'T' + String(i + 1).padStart(2, '0')), 'T11', 'T12'].map(id => {
    const was = stateBaseline?.tasks?.find?.(t => t.id === id), now = stateEvidence?.tasks?.find?.(t => t.id === id);
    return `<tr><th>${esc(id)}</th><td>${esc(was?.clicks ?? '—')} / ${esc(was?.keystrokes ?? '—')}</td><td>${esc(now?.clicks ?? '—')} / ${esc(now?.keystrokes ?? '—')}</td><td>${esc(was?.status ?? 'missing')} → ${esc(now?.status ?? 'missing')}</td></tr>`;
  }).join('') + '</table>';
  const table = '<table><tr><th>Context</th><th>Region</th><th>Kind</th><th>Recovery</th><th>Details</th><th>Empty hook</th><th>Pinned</th><th>Failed checks (all views)</th></tr>' + (stateEvidence?.rows ?? []).map(r => {
    const failed = stateChecks.filter(c => c.context === r.context).reduce((n, c) => n + c.failures, 0);
    return `<tr><td>${esc(r.context)}</td><td><code>${esc(r.region)}</code></td><td>${esc(r.kind)}</td><td>${esc(r.recovery)}</td><td>${r.details ? 'yes' : 'no'}</td><td>${esc(r.emptyHook ?? '—')}</td><td>${esc(r.pinned ?? '—')}</td><td>${failed}</td></tr>`;
  }).join('') + '</table>';
  const gaps = stateVisualPairs.filter(pair => pair.status !== 'paired');
  await writeFile(join(output, 'states-verification.json'), JSON.stringify({ after: stateEvidence, before: stateBaseline }, null, 2));
  await writeFile(join(output, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Slice 78 · States · Gate 2</title><style>body{font:16px/1.5 system-ui;margin:24px;background:#11151f;color:#f2f4fa}img{width:100%;max-height:650px;object-fit:contain;object-position:top}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0;min-width:0}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#ffad7f}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #394156}@media(max-width:700px){body{margin:12px}.pair{grid-template-columns:1fr}}</style><h1>States: failures and loading / Slice 78</h1><p>Gate 2 · awaiting visual acceptance. Matrix: before ' + esc(before.commit) + ' → after ' + esc(after.commit) + '. States evidence: before ' + esc(stateBaseline?.commit ?? 'unavailable') + ' → after ' + esc(stateEvidence?.commit ?? 'unavailable') + '.</p><p>' + pairs.length + ' paired matrix cells · ' + failures.length + ' gate failures · ' + gaps.length + ' of ' + stateVisualPairs.length + ' visual acceptance pairs incomplete. Zero gate failures does not mean user acceptance.</p><p><a href="report.json">Full gate report</a> · <a href="states-verification.json">States evidence, before and after</a></p><h2>Core task costs</h2>' + costs + '<h2>Visual acceptance before / after</h2>' + featured.join('') + '<h2>Context table</h2><p>Every exemption comes from this table. Each row is checked in both themes at 1440 and 375.</p>' + table + '<h2>Matrix before / after</h2><details><summary>All ' + pairs.length + ' matrix pairs</summary>' + pairs.map(card).join('') + '</details><h2>Checks and gate failures</h2><pre>' + esc(JSON.stringify(failures, null, 2)) + '</pre><details><summary>Reported movement in the four changing cells</summary><pre>' + esc(JSON.stringify(geometryReport, null, 2)) + '</pre></details><h2>Contrast (reported only)</h2>' + contrastTable + '</html>');
}
console.log(JSON.stringify({ pairs: pairs.length, geometryFailures: failures.length, intentionalLabChanges: exceptions.length, composites, output }));
if (failures.length) process.exitCode = 1;
