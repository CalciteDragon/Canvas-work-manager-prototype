import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const builder = join(dirname(fileURLToPath(import.meta.url)), 'build-sheet.mjs');

async function feedbackSheet(t, { changed = false, open = false, overflow = false, badGeometry = false, missingFocus = false } = {}) {
  const f = await fixture(t);
  f.cell.state = open ? 'remove-feedback' : 'populated';
  f.cell.viewport = { width: 375, height: 812 };
  for (const phase of [0, 1]) await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
  await f.json(1, 'layout.json', { ...f.layout, viewport: 375, document: overflow ? 400 : 375,
    planes: [{ ...f.layout.planes[0], y: changed ? 20 : 0 }] });
  await f.json(1, 'tasks/tasks.json', [{ id: 'T05', status: 'completed', clicks: 2, keystrokes: 0, deadEnds: 0 }, { id: 'T09', status: 'completed', clicks: 1, keystrokes: 0, deadEnds: 0 }]);
  await f.json(1, 'feedback-verification.json', { complete: true, entries: ['dark', 'light'].flatMap(theme => [1440, 375].map(width => ({ theme, width,
    inlineClearance: badGeometry ? -10 : 16, drawerIntersection: false, focusedIntersection: false, transient: 1,
    fallbacks: ['forced-colors', 'reduced-transparency'].map(mode => ({ mode, backdropFilter: 'none' })),
    suppression: width === 375 ? { hidden: true, returned: true } : null,
  }))), focus: missingFocus ? [] : ['remove-listed', 'remove-unlisted', 'task-delete', 'project-archive', 'header-transition', 'cross-owner', 'archive-restore', 'todos-complete'].map(row => ({ row, passed: true })) });
  const result = spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '74'], { encoding: 'utf8' });
  return { result, dirs: f.dirs, report: await readFile(join(f.dirs[2], 'report.json'), 'utf8').catch(() => result.stderr) };
}

test('profile 74 renders all twenty findings, copies feedback images and reports unpaired visual evidence', async t => {
  const f = await feedbackSheet(t);
  const verification = JSON.parse(await readFile(join(f.dirs[1], 'feedback-verification.json'), 'utf8'));
  verification.focus[0] = { ...verification.focus[0], theme: 'dark', width: 1440,
    screenshot: 'feedback-remove-listed-dark-1440.png', intersectsActedRegion: true };
  await writeFile(join(f.dirs[1], verification.focus[0].screenshot), 'feedback screenshot');
  await writeFile(join(f.dirs[1], 'feedback-verification.json'), JSON.stringify(verification));
  const result = spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '74'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const html = await readFile(join(f.dirs[2], 'index.html'), 'utf8');
  assert.match(html, /<title>Slice 74 · Feedback/);
  const report = JSON.parse(await readFile(join(f.dirs[2], 'report.json'), 'utf8'));
  const ids = ['W1-036', 'L4-026', 'L3-009', 'L6-016', 'L3-010', 'W1-037', 'W2-021', 'L1-023', 'L3-005', 'L6-015', 'W1-013', 'W4-007', 'L3-020', 'W1-047', 'W2-029', 'L3-021', 'W4-021', 'L4-010', 'W3-004', 'W4-020'];
  assert.deepEqual(report.feedbackFindings.map(row => row.id).sort(), ids.sort());
  for (const id of ids) assert.ok(html.includes(id), id);
  assert.match(html, /After only; baseline capture unavailable/);
  assert.match(html, /intersects acted region: true/);
  assert.equal(await readFile(join(f.dirs[2], verification.focus[0].screenshot), 'utf8'), 'feedback screenshot');
  assert.ok(report.feedbackVisualPairs.some(row => row.status === 'missing before and after'));
  assert.ok(report.feedbackVisualPairs.some(row => row.status === 'after only'));
  assert.match(html, /Visual evidence gaps/);
  await writeFile(join(f.dirs[0], 'feedback-verification.json'), JSON.stringify({ commit: 'before', focus: [verification.focus[0]] }));
  await writeFile(join(f.dirs[0], verification.focus[0].screenshot), 'genuine before feedback');
  const paired = spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '74'], { encoding: 'utf8' });
  assert.equal(paired.status, 0, paired.stderr);
  assert.equal(await readFile(join(f.dirs[2], 'before-' + verification.focus[0].screenshot), 'utf8'), 'genuine before feedback');
  const pairedReport = JSON.parse(await readFile(join(f.dirs[2], 'report.json'), 'utf8'));
  assert.equal(pairedReport.feedbackVisualPairs.find(row => row.row === 'remove-listed' && row.theme === 'dark' && row.width === 1440).status, 'paired');
  verification.visualFocus = [{ row: 'remove-listed', theme: 'dark', width: 1440, screenshot: 'visual.png', visualSupplement: true }];
  await writeFile(join(f.dirs[1], 'visual.png'), 'separate supplemental fixture');
  await writeFile(join(f.dirs[1], 'feedback-verification.json'), JSON.stringify(verification));
  const supplemented = spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '74'], { encoding: 'utf8' });
  assert.equal(supplemented.status, 0, supplemented.stderr);
  const supplementedReport = JSON.parse(await readFile(join(f.dirs[2], 'report.json'), 'utf8'));
  assert.equal(supplementedReport.feedbackVisualPairs.find(row => row.row === 'remove-listed' && row.theme === 'dark' && row.width === 1440).after, 'visual.png');
  assert.equal(supplementedReport.feedback.focus[0].screenshot, verification.focus[0].screenshot);
  assert.equal(supplementedReport.feedback.focus[0].intersectsActedRegion, true);
  const supplementedHtml = await readFile(join(f.dirs[2], 'index.html'), 'utf8');
  assert.match(supplementedHtml, /supplemental visual capture/);
  assert.match(supplementedHtml, /measured runtime capture/);
});

test('profile 74 reports intended feedback movement and gates closed-state geometry', async t => {
  const allowed = await feedbackSheet(t, { changed: true, open: true });
  assert.equal(allowed.result.status, 0, allowed.report);
  const closed = await feedbackSheet(t, { changed: true });
  assert.equal(closed.result.status, 1);
  assert.match(closed.report, /"field": "y"/);
});

/** A project header that loses `shrink` px, with a section and a control below it that move by `shift`. */
async function headerSheet(t, { shrink, shift = -shrink }) {
  const f = await fixture(t);
  f.cell.state = 'populated';
  f.cell.viewport = { width: 1440, height: 900 };
  for (const phase of [0, 1]) await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
  const layout = (shrinkBy, moveBy) => ({ ...f.layout,
    planes: [{ selector: 'app-top-bar', index: 0, x: 0, y: 0, width: 1440, height: 64 },
      { selector: 'app-project-header', index: 0, x: 300, y: 100, width: 900, height: 180 - shrinkBy },
      { selector: 'app-project-section-frame', index: 0, x: 300, y: 300 + moveBy, width: 900, height: 200 }],
    // Settings sits in the sidebar beside the header, so it must not move.
    controls: [{ tag: 'button', text: 'Undo', x: 1100, y: 120, width: 32, height: 32 }, { tag: 'button', text: 'Edit', x: 320, y: 340 + moveBy, width: 60, height: 32 },
      { tag: 'a', text: 'Settings', x: 12, y: 410, width: 200, height: 32 },
      // An open More item is anchored to its opener in the header, so it stays put too.
      { tag: 'button', role: 'menuitemradio', text: 'Planning', x: 900, y: 300, width: 300, height: 38 }],
    scrollRegions: [{ tag: 'MAIN', class: 'workspace', x: 300, y: 64, width: 900, height: 900 + moveBy, scrollWidth: 900, scrollHeight: 900 + moveBy }] });
  await f.json(0, 'layout.json', layout(0, 0));
  await f.json(1, 'layout.json', layout(shrink, shift));
  await f.json(1, 'tasks/tasks.json', [{ id: 'T05', status: 'completed', clicks: 2, keystrokes: 0, deadEnds: 0 }, { id: 'T09', status: 'completed', clicks: 1, keystrokes: 0, deadEnds: 0 }]);
  await f.json(1, 'feedback-verification.json', { complete: true, entries: ['dark', 'light'].flatMap(theme => [1440, 375].map(width => ({ theme, width,
    inlineClearance: 16, drawerIntersection: false, focusedIntersection: false, transient: 1,
    fallbacks: ['forced-colors', 'reduced-transparency'].map(mode => ({ mode, backdropFilter: 'none' })),
    suppression: width === 375 ? { hidden: true, returned: true } : null,
  }))), focus: ['remove-listed', 'remove-unlisted', 'task-delete', 'project-archive', 'header-transition', 'cross-owner', 'archive-restore', 'todos-complete'].map(row => ({ row, passed: true })) });
  const result = spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '74'], { encoding: 'utf8' });
  return { result, report: await readFile(join(f.dirs[2], 'report.json'), 'utf8').catch(() => result.stderr) };
}

test('profile 74 lists the removed 12 px header feedback row and still gates any other movement', async t => {
  const listed = await headerSheet(t, { shrink: 12 });
  assert.equal(listed.result.status, 0, listed.report);
  assert.match(listed.report, /empty header feedback row removed/);
  // A different shrink, content moving by another amount, or a section left behind all fail.
  for (const options of [{ shrink: 20 }, { shrink: 12, shift: -20 }, { shrink: 12, shift: 0 }]) {
    const { result, report } = await headerSheet(t, options);
    assert.equal(result.status, 1, report);
  }
});

test('profile 74 refuses phone overflow, bad toast clearance and missing focus evidence', async t => {
  for (const options of [{ overflow: true }, { badGeometry: true }, { missingFocus: true }]) {
    const { result, report } = await feedbackSheet(t, options);
    assert.equal(result.status, 1, report);
    assert.match(report, /scrolls sideways|toast clearance|feedback focus evidence/);
  }
});
async function liftSheet(t, { open = false, overflow = false, violation = false, missingFocus = false } = {}) {
  const fixtureData = await fixture(t);
  fixtureData.cell.state = open ? 'more' : 'populated';
  fixtureData.cell.id = open ? 'kitchen-more-dark-1440' : 'busy-week-project-dark-1440';
  fixtureData.cell.viewport = { width: overflow ? 375 : 1440, height: 900 };
  for (const phase of [0, 1]) await fixtureData.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [fixtureData.cell] });
  await fixtureData.json(1, 'layout.json', { ...fixtureData.layout, viewport: overflow ? 375 : 1440, document: overflow ? 400 : 1440, planes: [{ ...fixtureData.layout.planes[0], y: 20 }] });
  await fixtureData.json(1, 'lifts-verification.json', { complete: true, lifts: ['dark', 'light'].flatMap(theme => ['side', 'sheet', 'menu', 'popover', 'details', 'confirm'].map(kind => ({ kind, theme, persistent: 3, persistentBefore: 3, transient: 1, fallbacks: [{ mode: 'forced-colors', backdropFilter: 'none' }, { mode: 'reduced-transparency', backdropFilter: 'none' }] }))), focus: missingFocus ? [] : ['dark', 'light'].map(theme => ({ theme, findings: ['W3-003', 'W3-005', 'W3-006', 'L5-009', 'L5-010'], passed: true })) });
  if (violation) await fixtureData.json(1, 'axe.json', { violations: [{ id: 'aria-dialog-name', nodes: [{ target: ['dialog'] }] }], incomplete: [] });
  const result = spawnSync(process.execPath, [builder, ...fixtureData.dirs, '--profile', '73'], { encoding: 'utf8' });
  return { result, dirs: fixtureData.dirs, report: await readFile(join(fixtureData.dirs[2], 'report.json'), 'utf8').catch(() => result.stderr) };
}

test('profile 73 reports intended open-lift geometry', async t => {
  const { result, report } = await liftSheet(t, { open: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(report, /geometryReport/);
});

test('profile 73 gates closed-state geometry', async t => {
  const { result, report } = await liftSheet(t);
  assert.equal(result.status, 1);
  assert.match(report, /"field": "y"/);
});

test('profile 73 gates open-lift axe roles and phone overflow', async t => {
  for (const options of [{ open: true, violation: true }, { open: true, overflow: true }]) {
    const { result, report } = await liftSheet(t, options);
    assert.equal(result.status, 1);
    assert.match(report, /aria-dialog-name|scrolls sideways/);
  }
});

test('profile 73 refuses incomplete lift evidence', async t => {
  const fixtureData = await fixture(t);
  await fixtureData.json(1, 'lifts-verification.json', { complete: false, lifts: [], focus: [] });
  const result = spawnSync(process.execPath, [builder, ...fixtureData.dirs, '--profile', '73'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(await readFile(join(fixtureData.dirs[2], 'report.json'), 'utf8'), /incomplete lift evidence/);
});

test('profile 73 refuses missing focus paths', async t => {
  const { result, report } = await liftSheet(t, { open: true, missingFocus: true });
  assert.equal(result.status, 1);
  assert.match(report, /focus evidence missing/);
});

test('profile 73 rejects persistent blur already added to the after closed page', async t => {
  const data = await liftSheet(t, { open: true });
  const lifts = JSON.parse(await readFile(join(data.dirs[1], 'lifts-verification.json'), 'utf8'));
  lifts.lifts[0].persistentBefore = 4;
  lifts.lifts[0].persistent = 4;
  await writeFile(join(data.dirs[1], 'lifts-verification.json'), JSON.stringify(lifts));
  const result = spawnSync(process.execPath, [builder, ...data.dirs, '--profile', '73'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(await readFile(join(data.dirs[2], 'report.json'), 'utf8'), /persistent blur exceeds genuine before/);
});

test('profile 73 limits prototype phone overflow to the baseline Lab workspace, never wider', async t => {
  for (const [route, beforeWidth, afterWidth, accepted] of [
    ['/prototype/design', 625, 625, true],
    ['/prototype/design', 625, 613, true],
    ['/prototype/design', 625, 626, false],
    ['/prototype/state', 625, 625, false],
  ]) {
    const data = await liftSheet(t, { open: true });
    for (const [phase, scrollWidth] of [[0, beforeWidth], [1, afterWidth]]) {
      const index = JSON.parse(await readFile(join(data.dirs[phase], 'index.json'), 'utf8'));
      index.cells[0].route = route;
      index.cells[0].viewport.width = 375;
      await writeFile(join(data.dirs[phase], 'index.json'), JSON.stringify(index));
      const layout = JSON.parse(await readFile(join(data.dirs[phase], 'layout.json'), 'utf8'));
      layout.viewport = layout.document = 375;
      layout.scrollRegions = [{ tag: 'MAIN', class: 'workspace', width: 375, scrollWidth }];
      await writeFile(join(data.dirs[phase], 'layout.json'), JSON.stringify(layout));
    }
    const result = spawnSync(process.execPath, [builder, ...data.dirs, '--profile', '73'], { encoding: 'utf8' });
    assert.equal(result.status, accepted ? 0 : 1, route + ' ' + afterWidth);
    if (!accepted) assert.match(await readFile(join(data.dirs[2], 'report.json'), 'utf8'), /scroll region scrolls sideways/);
  }
});

test('profile 73 refuses a core task regression', async t => {
  const fixtureData = await fixture(t);
  await fixtureData.json(1, 'tasks/tasks.json', [{ id: 'T03', status: 'completed', clicks: 11, keystrokes: 38, deadEnds: 0 }]);
  const result = spawnSync(process.execPath, [builder, ...fixtureData.dirs, '--profile', '73'], { encoding: 'utf8' });
  assert.match(await readFile(join(fixtureData.dirs[2], 'report.json'), 'utf8'), /core task regression/);
  assert.equal(result.status, 1);
});
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'slice71-sheet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dirs = ['before', 'after', 'sheet'].map(name => join(root, name));
  await Promise.all(dirs.map(dir => mkdir(dir)));
  await mkdir(join(dirs[1], 'tasks'));
  await writeFile(join(dirs[1], 'tasks', 'tasks.json'), JSON.stringify([{ id: 'T03', status: 'completed', clicks: 10, keystrokes: 38, deadEnds: 0 }, { id: 'T04', status: 'completed', clicks: 1, keystrokes: 0, deadEnds: 0 }, { id: 'T08', status: 'completed', clicks: 3, keystrokes: 0, deadEnds: 0 }]));
  const json = (phase, file, value) => writeFile(join(dirs[phase], file), JSON.stringify(value));
  await json(0, 'lift-baseline.json', { commit: 'before', complete: true, layers: ['dark', 'light'].flatMap(theme => [375, 1440].map(width => ({ theme, width, persistent: 3 }))) });
  const cell = { id: 'busy-week-project-dark-1440', theme: 'dark', route: '/projects/project-launch', status: 'captured', artifacts: { layout: 'layout.json', axe: 'axe.json', screenshot: 'shot.png' } };
  const layout = { planes: [{ selector: 'app-top-bar', index: 0, x: 0, y: 0, width: 1440, height: 64 }], controls: [], scrollRegions: [] };
  for (const phase of [0, 1]) {
    await json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [cell] });
    await json(phase, 'layout.json', layout);
    await json(phase, 'axe.json', { violations: [{ id: 'color-contrast', impact: 'serious', nodes: [{ target: ['.muted'], failureSummary: 'Low contrast' }] }], incomplete: [{ id: 'color-contrast', nodes: [{ target: ['.glass'] }] }] });
    await writeFile(join(dirs[phase], 'shot.png'), 'copy-only image fixture');
  }
  const tokens = Object.fromEntries(['pane', 'sheet', 'lift'].flatMap(plane => [[`--plane-${plane}-tint`, '#101010'], [`--plane-${plane}-solid`, '#101010'], [`--plane-${plane}-alpha`, '50%']]));
  Object.assign(tokens, { '--plane-ground-solid': '#000000', '--color-text': '#ffffff', '--color-text-muted': '#aaaaaa', '--color-accent': '#ffaa88', '--color-accent-contrast': '#000000', '--focus-ring-color': '#ffaa88', '--art-warm': 'rgb(0 0 0 / 50%)', '--art-cool': 'rgb(16 16 16 / 50%)', '--art-teal': 'rgb(8 8 8 / 40%)', '--ground-art-strength': '100%' });
  await json(1, 'depth-verification.json', { tokens: { dark: tokens, light: tokens }, focus: [{ theme: 'dark', rings: [{ target: 'More', outline: '2px solid', screenshot: 'focus.png' }] }], fallbacks: [{ theme: 'dark', mode: 'forced-colors', screenshot: 'fallback.png' }], deviceTheme: { screenshot: 'device.png' }, lab: { screenshot: 'lab.png' } });
  for (const file of ['focus.png', 'fallback.png', 'device.png', 'lab.png']) await writeFile(join(dirs[1], file), 'copy-only verification image');
  return { cell, layout, json, dirs, run: () => spawnSync(process.execPath, [builder, ...dirs], { encoding: 'utf8' }) };
}

test('fails when an after capture cell disappears', async t => {
  const f = await fixture(t);
  await f.json(1, 'index.json', { commit: 'after', cells: [] });
  const result = f.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(await readFile(join(f.dirs[2], 'report.json'), 'utf8'), /missing after cell/);
});
test('fails on missing numeric geometry', async t => {
  const f = await fixture(t);
  delete f.layout.planes[0].x;
  await f.json(1, 'layout.json', f.layout);
  assert.equal(f.run().status, 1);
});
test('does not exempt Lab shell movement', async t => {
  const f = await fixture(t);
  f.cell.route = '/prototype/design';
  for (const phase of [0, 1]) await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
  f.layout.planes[0].x = 999;
  await f.json(1, 'layout.json', f.layout);
  assert.equal(f.run().status, 1);
});
test('compares existing Lab catalogue controls across the added knobs', async t => {
  const f = await fixture(t);
  f.cell.route = '/prototype/design';
  for (const phase of [0, 1]) await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
  const box = text => ({ text, x: 0, y: 0, width: 50, height: 20 });
  f.layout.controls = [box('Copy CSS'), box('Reset'), ...Array.from({ length: 7 }, () => box('')), box('Existing task')];
  await f.json(0, 'layout.json', f.layout);
  f.layout.controls = [...f.layout.controls.slice(0, 9), ...Array.from({ length: 13 }, () => box('')), { ...box('Existing task'), y: 999 }, box('Play motion')];
  await f.json(1, 'layout.json', f.layout);
  assert.equal(f.run().status, 1);
});
test('renders contrast and copies every verification image into the standalone sheet', async t => {
  const f = await fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const html = await readFile(join(f.dirs[2], 'index.html'), 'utf8');
  assert.match(html, /id="composite-contrast"/);
  assert.match(html, /Accent text on fill/);
  assert.match(html, /Before violations/);
  assert.match(html, /Remaining serious exceptions/);
  assert.match(html, /Low contrast/);
  for (const file of ['focus.png', 'fallback.png', 'device.png', 'lab.png']) {
    await access(join(f.dirs[2], file));
    assert.ok(html.includes(`src="${file}"`), file);
  }
});
test('pairs genuine before keyboard and fallback captures when supplied', async t => {
  const f = await fixture(t);
  await f.json(0, 'depth-verification.json', { baseline: true, focus: [{ theme: 'dark', rings: [{ target: 'More', outline: '1px auto', screenshot: 'focus.png' }] }], fallbacks: [{ theme: 'dark', mode: 'forced-colors', baselineSolidStyling: true, screenshot: 'fallback.png' }] });
  for (const file of ['focus.png', 'fallback.png']) await writeFile(join(f.dirs[0], file), 'genuine baseline fixture');
  assert.equal(f.run().status, 0);
  const html = await readFile(join(f.dirs[2], 'index.html'), 'utf8');
  for (const file of ['focus.png', 'fallback.png']) {
    assert.equal(await readFile(join(f.dirs[2], 'before-'+file), 'utf8'), 'genuine baseline fixture');
    assert.ok(html.includes(`src="before-${file}"`));
  }
  assert.match(html, /baseline solid styling/);
});
async function labKnobs(t, shifts) {
  const f = await fixture(t);
  f.cell.route = '/prototype/design';
  for (const phase of [0, 1]) await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
  const box = (text, y = 0) => ({ text, x: 0, y, width: 50, height: 20 });
  f.layout.controls = [box('Copy CSS'), box('Reset'), ...Array.from({ length: 7 }, (_, i) => box('', 100 + i * 80)), box('Existing task')];
  await f.json(0, 'layout.json', f.layout);
  f.layout.controls = [box('Copy CSS'), box('Reset'), ...Array.from({ length: 7 }, (_, i) => box('', 100 + i * 80 + shifts[i])), ...Array.from({ length: 13 }, () => box('')), box('Existing task'), box('Play motion')];
  await f.json(1, 'layout.json', f.layout);
  return f;
}
test('reports one uniform shift of the original Lab knobs as the shortened hint', async t => {
  const f = await labKnobs(t, Array(7).fill(-19.5));
  const result = f.run();
  assert.equal(result.status, 0, result.stdout);
  assert.match(await readFile(join(f.dirs[2], 'report.json'), 'utf8'), /hint shortened/);
});
test('fails when the original Lab knobs move unevenly', async t => {
  const f = await labKnobs(t, [-19.5, -19.5, -19.5, -40, -19.5, -19.5, -19.5]);
  assert.equal(f.run().status, 1);
});
const withoutArt = tokens => Object.fromEntries(Object.entries(tokens).filter(([key]) => !key.startsWith('--art-') && key !== '--ground-art-strength'));
async function composites(t, tokens) {
  const f = await fixture(t);
  const verification = JSON.parse(await readFile(join(f.dirs[1], 'depth-verification.json'), 'utf8'));
  verification.tokens = { dark: tokens(verification.tokens.dark), light: tokens(verification.tokens.light) };
  await f.json(1, 'depth-verification.json', verification);
  const result = f.run();
  return { result, report: JSON.parse(await readFile(join(f.dirs[2], 'report.json'), 'utf8')) };
}
test('measures panes and sheets over the ground and its art, and lifts over busy content too', async t => {
  const { result, report } = await composites(t, tokens => tokens);
  assert.equal(result.status, 0, result.stderr);
  const rows = Object.fromEntries(report.composites[0].rows.map(row => [row.plane, row]));
  assert.ok(rows.pane.muted > 4.5, `pane muted ${rows.pane.muted}`);
  assert.ok(rows.sheet.muted > 4.5, `sheet muted ${rows.sheet.muted}`);
  assert.ok(rows.lift.muted < 2, `lift keeps the text-coloured backing: ${rows.lift.muted}`);
});
test('fails rather than guessing when the ground-art tokens are missing', async t => {
  const { result, report } = await composites(t, withoutArt);
  assert.equal(result.status, 1);
  assert.match(JSON.stringify(report.geometryFailures), /ground-art tokens/);
});

// ── Profile 72: geometry is reported, the control census and the accessibility names gate. ──
const control = (overrides = {}) => ({ text: 'Save', tag: 'button', type: 'button', role: null, class: 'button', scope: 'product', x: 0, y: 0, width: 80, height: 40, ...overrides });
async function census(t, { width = 1440, before = [control()], after = [control()], document = width } = {}) {
  const f = await fixture(t);
  f.cell.id = `busy-week-project-dark-${width}`;
  f.cell.viewport = { width, height: 900 };
  for (const phase of [0, 1]) await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
  await f.json(0, 'layout.json', { ...f.layout, controls: before, viewport: width, document: width });
  await f.json(1, 'layout.json', { ...f.layout, controls: after, viewport: width, document });
  for (const phase of [0, 1]) {
    await f.json(phase, 'primitives-verification.json', { forcedColors: [{ surface: 'kitchen', theme: 'dark', screenshot: 'forced.png' }] });
    await writeFile(join(f.dirs[phase], 'forced.png'), `forced ${phase}`);
  }
  const result = spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '72'], { encoding: 'utf8' });
  return { result, report: JSON.parse(await readFile(join(f.dirs[2], 'report.json'), 'utf8')), html: await readFile(join(f.dirs[2], 'index.html'), 'utf8').catch(() => '') };
}
test('profile 72 flags a button under 24 px at 1440', async t => {
  const { result, report } = await census(t, { after: [control({ height: 23 })] });
  assert.equal(result.status, 1);
  assert.match(JSON.stringify(report.censusFailures), /target/);
});
test('profile 72 flags a 40 px button at 375 on touch', async t => {
  const { result, report } = await census(t, { width: 375, after: [control({ height: 40 })] });
  assert.equal(result.status, 1);
  assert.match(JSON.stringify(report.censusFailures), /touch/);
});
test('profile 72 flags a third button height', async t => {
  const { result, report } = await census(t, { after: [control({ height: 32 }), control({ height: 40 }), control({ height: 36 })] });
  assert.equal(result.status, 1);
  assert.match(JSON.stringify(report.censusFailures), /button heights/);
});
test('profile 72 flags an unlisted small control and reports a listed exception without failing', async t => {
  const unlisted = await census(t, { after: [control({ class: 'odd', height: 12 })] });
  assert.equal(unlisted.result.status, 1);
  const listed = await census(t, { after: [control({ class: 'insertion-point', text: 'Insert before Notes', height: 12 })] });
  assert.equal(listed.result.status, 0, listed.result.stdout);
  assert.match(JSON.stringify(listed.report.censusExceptions), /Insert before Notes/);
});
test('profile 72 reports intended renames and geometry movement without failing, and ignores prototype and prose scope', async t => {
  const { result, report, html } = await census(t, {
    before: [control({ text: 'Add', y: 0 }), control({ text: '+' })],
    after: [control({ text: 'Add Notes, Home · Work canvas', y: 30 }), control({ text: 'New project' }), control({ scope: 'prototype', height: 10 }), control({ tag: 'a', scope: 'prose', height: 10 })],
  });
  assert.equal(result.status, 0, result.stdout);
  assert.match(JSON.stringify(report.intendedChanges), /Add Notes/);
  assert.ok(report.geometryReport.length > 0);
  assert.match(html, /forced\.png/);
});
test('profile 72 fails a 375 cell that scrolls sideways', async t => {
  const { result, report } = await census(t, { width: 375, after: [control({ height: 44 })], document: 400 });
  assert.equal(result.status, 1);
  assert.match(JSON.stringify(report.censusFailures), /sideways/);
});
test('profile 72 still fails on corrupt geometry and changed plane identity', async t => {
  const broken = await (async () => {
    const g = await fixture(t);
    g.cell.viewport = { width: 1440, height: 900 };
    for (const phase of [0, 1]) await g.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [g.cell] });
    await g.json(1, 'layout.json', { ...g.layout, planes: [{ selector: 'app-sidebar', index: 0, y: 0, width: 1, height: 1 }], viewport: 1440, document: 1440 });
    for (const phase of [0, 1]) {
      await g.json(phase, 'primitives-verification.json', { forcedColors: [] });
    }
    const result = spawnSync(process.execPath, [builder, ...g.dirs, '--profile', '72'], { encoding: 'utf8' });
    return { result, report: JSON.parse(await readFile(join(g.dirs[2], 'report.json'), 'utf8')) };
  })();
  assert.equal(broken.result.status, 1);
  assert.match(JSON.stringify(broken.report.geometryFailures), /plane identity/);
  assert.match(JSON.stringify(broken.report.geometryFailures), /missing numeric geometry/);
});
test('profile 72 fails a 375 cell whose scroll region overflows sideways', async t => {
  const f = await fixture(t);
  f.cell.id = 'archive-light-375';
  f.cell.viewport = { width: 375, height: 812 };
  for (const phase of [0, 1]) await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
  const regions = scrollWidth => [{ tag: 'MAIN', class: 'workspace', width: 375, scrollWidth, height: 700, scrollHeight: 900 }];
  await f.json(0, 'layout.json', { ...f.layout, viewport: 375, document: 375, scrollRegions: regions(375) });
  await f.json(1, 'layout.json', { ...f.layout, viewport: 375, document: 375, scrollRegions: regions(401) });
  for (const phase of [0, 1]) await f.json(phase, 'primitives-verification.json', { forcedColors: [] });
  const result = spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '72'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(await readFile(join(f.dirs[2], 'report.json'), 'utf8'), /scroll region scrolls sideways/);
});

/** Complete passing Slice 75 placement evidence; `edit` changes one entry to prove a gate. */
const placementEntries = () => [
  ...['dark', 'light'].map((theme, i) => ({ row: 'section-create', theme, width: [1440, 375][i], focus: { heading: true, inView: true } })),
  { row: 'shortcut-create', theme: 'dark', width: 1440, focus: { heading: true, inView: true } },
  ...['dark', 'light'].map((theme, i) => ({ row: 'quick-add-pending', theme, width: [1440, 375][i], worstMs: 12 })),
  { row: 'long-list', theme: 'dark', width: 1440, rowInView: true, fieldInView: true, fieldFocused: true },
  { row: 'drawer-save', theme: 'dark', width: 1440, savingMs: 8, rowMs: 8 },
  { row: 'drawer-saved', theme: 'dark', width: 1440, statusAfter: 'Saved' },
  { row: 'phone-due-date', theme: 'light', width: 375, statusAfter: 'todo', fieldStatus: 'Saved' },
  { row: 'row-failures', theme: 'dark', width: 1440, rowErrors: 2, sectionBanner: 0 },
  { row: 'permission-failure', theme: 'dark', width: 1440, inCard: 1, pageAlert: 0 },
  ...['empty-project-name', 'empty-work-name'].map(row => ({ row, theme: 'dark', width: 1440, message: 'Enter a name.' })),
  ...['dark', 'light'].map((theme, i) => ({ row: 'hold-before', theme, width: [1440, 375][i], deltas: [0, 0.5], scrollTop: 400 })),
  ...['dark', 'light'].map((theme, i) => ({ row: 'three-quick-adds', theme, width: [1440, 375][i], drawerOpen: false, fieldFocused: true })),
];

async function placementSheet(t, { edit = entries => entries, tasks = { clicks: 10, keystrokes: 38 }, state = 'populated', changed = false, pre73 = false } = {}) {
  const f = await fixture(t);
  f.cell.state = state;
  for (const phase of [0, 1]) await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
  await f.json(1, 'layout.json', { ...f.layout, planes: [{ ...f.layout.planes[0], y: changed ? 20 : 0 }] });
  await f.json(1, 'tasks/tasks.json', [{ id: 'T03', status: 'completed', deadEnds: 0, ...tasks }]);
  const entries = edit(placementEntries());
  entries[0].screenshot = 'placement-section-create-dark-1440.png';
  await writeFile(join(f.dirs[1], entries[0].screenshot), 'after placement');
  await f.json(1, 'placement-verification.json', { commit: 'after', complete: true, entries });
  await f.json(0, 'placement-verification.json', { commit: 'before', complete: true, entries: [{ row: 'section-create', theme: 'dark', width: 1440, screenshot: 'placement-section-create-dark-1440.png', focus: { tag: 'BODY' } }] });
  await writeFile(join(f.dirs[0], 'placement-section-create-dark-1440.png'), 'before placement');
  const args = [builder, ...f.dirs, '--profile', '75'];
  if (pre73) {
    const dir = join(f.dirs[0], '..', 'pre73');
    await mkdir(dir);
    await writeFile(join(dir, 'placement-verification.json'), JSON.stringify({ commit: 'pre73', complete: true, entries: [{ row: 'three-quick-adds', theme: 'dark', width: 1440, screenshot: 'placement-three-quick-adds-dark-1440.png', drawerOpen: true }] }));
    await writeFile(join(dir, 'placement-three-quick-adds-dark-1440.png'), 'pre-73 drawer open');
    args.push('--pre73', dir);
  }
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { result, dirs: f.dirs, report: await readFile(join(f.dirs[2], 'report.json'), 'utf8').catch(() => result.stderr) };
}

test('profile 75 renders the placement pairs, copies their images and passes complete evidence', async t => {
  const f = await placementSheet(t, { pre73: true });
  assert.equal(f.result.status, 0, f.report);
  const html = await readFile(join(f.dirs[2], 'index.html'), 'utf8');
  assert.match(html, /<title>Slice 75 · Pending and placement/);
  for (const id of ['W1-024', 'W3-016', 'L3-007', 'L4-023', 'L3-008', 'W2-018', 'L4-005', 'L4-024', 'W1-030', 'W1-026']) assert.ok(html.includes(id), id);
  assert.equal(await readFile(join(f.dirs[2], 'before-placement-section-create-dark-1440.png'), 'utf8'), 'before placement');
  assert.equal(await readFile(join(f.dirs[2], 'after-placement-section-create-dark-1440.png'), 'utf8'), 'after placement');
  assert.equal(await readFile(join(f.dirs[2], 'before-pre73-placement-three-quick-adds-dark-1440.png'), 'utf8'), 'pre-73 drawer open');
  const report = JSON.parse(f.report);
  assert.equal(report.placementPairs.find(pair => pair.row === 'section-create' && pair.theme === 'dark').status, 'paired');
  assert.equal(report.placementPairs.find(pair => pair.row === 'three-quick-adds' && pair.theme === 'dark').status, 'before only');
  assert.match(html, /Visual evidence gaps/);
});

test('profile 75 gates the pending row, the hold, the reveal and T03', async t => {
  const cases = [
    [entries => entries.map(e => e.row === 'quick-add-pending' && e.width === 375 ? { ...e, worstMs: 140 } : e), /pending row later than 100 ms/],
    [entries => entries.map(e => e.row === 'hold-before' && e.width === 1440 ? { ...e, deltas: [0, 48.5] } : e), /working list moved more than 1 px/],
    [entries => entries.map(e => e.row === 'section-create' && e.width === 375 ? { ...e, focus: { tag: 'BODY', heading: false, inView: false } } : e), /created section not revealed/],
    [entries => entries.filter(e => e.row !== 'long-list'), /placement evidence missing/],
    [entries => entries.map(e => e.row === 'row-failures' ? { ...e, error: 'Timeout' } : e), /row failures not on their rows/],
  ];
  for (const [edit, reason] of cases) {
    const f = await placementSheet(t, { edit });
    assert.equal(f.result.status, 1, String(reason));
    assert.match(f.report, reason);
  }
  const slow = await placementSheet(t, { tasks: { clicks: 11, keystrokes: 38 } });
  assert.equal(slow.result.status, 1);
  assert.match(slow.report, /core task regression/);
});

test('profile 75 reports drawer and dialog movement and gates every other cell', async t => {
  const drawer = await placementSheet(t, { state: 'task-drawer', changed: true });
  assert.equal(drawer.result.status, 0, drawer.report);
  assert.match(drawer.report, /"geometryReport": \[\s*\{/);
  const rest = await placementSheet(t, { changed: true });
  assert.equal(rest.result.status, 1);
  assert.match(rest.report, /"field": "y"/);
});

test('profile 75 lists the canvas live region leaving the grid as an exact 24 px rise, and still gates other movement', async t => {
  const rise = async (shift) => {
    const f = await fixture(t);
    for (const phase of [0, 1]) await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
    const layout = (by) => ({ ...f.layout, planes: [f.layout.planes[0], { selector: 'app-project-section-frame', index: 0, x: 300, y: 400 + by, width: 900, height: 200 }],
      scrollRegions: [{ tag: 'MAIN', class: 'workspace', x: 300, y: 64, width: 900, height: 900, scrollWidth: 900, scrollHeight: 1500 + by }] });
    await f.json(0, 'layout.json', layout(0));
    await f.json(1, 'layout.json', layout(shift));
    await f.json(1, 'tasks/tasks.json', [{ id: 'T03', status: 'completed', clicks: 10, keystrokes: 38, deadEnds: 0 }]);
    await f.json(1, 'placement-verification.json', { complete: true, entries: placementEntries() });
    const result = spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '75'], { encoding: 'utf8' });
    return { result, report: await readFile(join(f.dirs[2], 'report.json'), 'utf8').catch(() => result.stderr) };
  };
  const listed = await rise(-24);
  assert.equal(listed.result.status, 0, listed.report);
  assert.match(listed.report, /canvas live region left the grid/);
  const other = await rise(-30);
  assert.equal(other.result.status, 1);
});

const chromeFlow=()=>['project-kitchen','project-client-migration','project-renovation/pages/home'].flatMap(project=>[['dark',1440],['light',1440],['light',375]].map(([theme,width])=>({project,theme,width,layout:'flow',aria:'- region Notes',screenshot:'shot.png',hitScreenshot:'shot.png',restHitScreenshot:'shot.png',pendingScreenshot:'shot.png',rest:{restToken:'.5',frames:[{heading:'Notes',headingButton:null,titleOffset:0,tools:[{opacity:.5}]}],marks:[{opacity:.5}],add:[{opacity:1}]},tabWalk:[{section:'a',kind:'before',content:false},{section:'a',kind:'toolbar',content:false},{section:'a',kind:'content',content:true},{section:'a',kind:'resize',content:false}],restHitMap:[{points:Array(9).fill({hit:true})}],activeHitMap:[{points:Array(9).fill({hit:true})}],collapse:{runs:[5,5,5,5,5],worstMs:5}})));
const chromeEntries=()=>{const flow=chromeFlow();return [...flow,...flow.filter(e=>e.project==='project-kitchen').map(e=>({...e,layout:'grid',resize:{width:24,inside:[true,true,true,true],gap:[true,true]}}))];};

async function chromeSheet(t, change = {}) {
  const f = await fixture(t);
  await f.json(1,'tasks/tasks.json',[{id:'T03',status:'completed',clicks:10,keystrokes:38,deadEnds:0},{id:'T05',status:'completed',clicks:2,keystrokes:0,deadEnds:0},{id:'T06',status:'completed',clicks:2,keystrokes:16,deadEnds:0}]);
  await f.json(1, 'chrome-verification.json', { complete: true, entries: chromeEntries() });
  await f.json(0, 'chrome-verification.json', { complete: true, entries: chromeEntries() });
  await f.json(1, 'layout.json', { ...f.layout, sectionContents: [{ id: 'a', x: 10, width: change.content ? 102 : 100 }], controls: change.controls ?? [] });
  await f.json(0, 'layout.json', { ...f.layout, sectionContents: [{ id: 'a', x: 10, width: 100 }] });
  if (change.axe) await f.json(1, 'axe.json', { violations: change.axe, incomplete: [] });
  if (change.missing) await rm(join(f.dirs[1], 'chrome-verification.json'));
  if (change.noDepth) await rm(join(f.dirs[1], 'depth-verification.json'));
  const result = spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '76'], { encoding: 'utf8' });
  return { result, dirs:f.dirs, report: await readFile(join(f.dirs[2], 'report.json'), 'utf8').catch(() => result.stderr) };
}
test('profile 76 accepts listed canvas changes and reports contrast', async t => {
  const { result, report } = await chromeSheet(t);
  assert.equal(result.status, 0, report);
});

test('profile 76 does not require the frozen depth verifier output', async t => {
  const { result, report } = await chromeSheet(t, { noDepth: true });
  assert.equal(result.status, 0, report);
});
test('profile 76 gates insertion targets, title controls, content widths, new axe nodes and missing evidence', async t => {
  for (const change of [
    { controls: [{ scope: 'product', text: 'Insert before Notes', class: 'insertion-point', width: 16, height: 16 }] },
    { controls: [{ scope: 'product', text: 'Rename Notes', class: 'section-frame__title-button', width: 16, height: 16 }] },
    { controls: [24,32,44].map(height => ({ scope: 'product', class: 'button', width: 80, height })) },
    { content: true }, { missing: true },
    { axe: [{ id: 'button-name', impact: 'serious', nodes: [{ target: ['.new'], failureSummary: 'missing name' }] }] },
  ]) { const { result, report } = await chromeSheet(t, change); assert.equal(result.status, 1, report); }
});

test('profile 76 gates touch insertion and a new node under an existing axe rule, retaining later-slice exceptions', async t => {
  const f = await fixture(t);
  f.cell.viewport = { width: 375, height: 812 };
  f.layout.sectionContents = []; await f.json(0,'layout.json',f.layout);
  for (const phase of [0,1]) await f.json(phase,'index.json',{commit:phase?'after':'before',cells:[f.cell]});
  const complete={complete:true,entries:chromeEntries()};
  await f.json(1,'chrome-verification.json',complete); await f.json(0,'chrome-verification.json',complete);
  await f.json(1,'tasks/tasks.json',[{id:'T03',status:'completed',clicks:10,keystrokes:38,deadEnds:0},{id:'T05',status:'completed',clicks:2,keystrokes:0,deadEnds:0},{id:'T06',status:'completed',clicks:2,keystrokes:16,deadEnds:0}]);
  const run=()=>spawnSync(process.execPath,[builder,...f.dirs,'--profile','76'],{encoding:'utf8'});
  await f.json(1,'layout.json',{...f.layout,controls:[{scope:'product',text:'Insert before Notes',width:44,height:40}],viewport:375,document:375});
  assert.equal(run().status,1);
  await f.json(1,'layout.json',{...f.layout,controls:[{scope:'product',class:'task-row__title',text:'A task',width:80,height:16}],viewport:375,document:375});
  assert.equal(run().status,0);
  const node={target:['.one'],stableAnchor:'data-section-id=first|Missing name',failureSummary:'Missing name'};
  await f.json(0,'axe.json',{violations:[{id:'button-name',nodes:[node]}],incomplete:[]});
  await f.json(1,'axe.json',{violations:[{id:'button-name',nodes:[node,{...node,target:['.two'],stableAnchor:'data-section-id=second|Missing name'}]}],incomplete:[]});
  assert.equal(run().status,1);
  await f.json(1,'axe.json',{violations:[{id:'color-contrast',impact:'serious',nodes:[{target:['.brand-new'],failureSummary:'Low contrast'}]}],incomplete:[]});
  assert.equal(run().status,0);
});

test('profile 76 rejects incomplete runtime contexts and each broken measurement',async t=>{
  for(const mutate of [
    entries=>entries.slice(0,1),
    entries=>{entries[0].rest.frames[0].tools[0].opacity=0;return entries;},
    entries=>{entries[0].restHitMap[0].points[0].hit=false;return entries;},
    entries=>{entries[0].tabWalk.push({section:'a',kind:'toolbar',content:false});return entries;},
    entries=>{entries[0].collapse.worstMs=101;return entries;},
    entries=>{entries[0].rest.frames[0].titleOffset=2;return entries;},
    entries=>entries.filter(e=>e.layout!=='grid'),
  ]){
    const f=await chromeSheet(t);const data={complete:true,entries:mutate(chromeEntries())};
    await writeFile(join(f.dirs[1],'chrome-verification.json'),JSON.stringify(data));
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','76'],{encoding:'utf8'});
    assert.equal(result.status,1);
  }
});

test('profile 76 keeps Lab Controls geometry and paint while allowing frame tools and the knob',async t=>{
  for(const change of ['none','geometry','paint','frame-flow','unexplained-y']) {
    const f=await chromeSheet(t);const index={commit:'fixture',cells:[{...JSON.parse(await readFile(join(f.dirs[0],'index.json'),'utf8')).cells[0],route:'/prototype/design'}]};
    for(const phase of [0,1])await writeFile(join(f.dirs[phase],'index.json'),JSON.stringify(index));
    const danger={text:'Danger icon button',class:'tool tool--danger',scope:'prototype',tag:'button',x:100,y:200,width:32,height:32,color:'rgb(255, 156, 156)',background:'transparent',border:'none'};
    const frame={...danger,text:'Move Notes',x:100,y:40};
    const base=JSON.parse(await readFile(join(f.dirs[0],'layout.json'),'utf8'));
    const specimen={selector:'app-project-section-frame',index:0,x:100,y:40,width:100,height:100};
    const shift=change==='frame-flow'||change==='unexplained-y'?-5:0;
    await writeFile(join(f.dirs[0],'layout.json'),JSON.stringify({...base,planes:[...base.planes,specimen],controls:[frame,danger,{...danger,text:'Primary · Rest'}]}));
    await writeFile(join(f.dirs[1],'layout.json'),JSON.stringify({...base,planes:[...base.planes,{...specimen,height:change==='frame-flow'?95:100}],controls:[{...frame,x:50,panel:'section-frame'}, {...danger,y:danger.y+shift,x:change==='geometry'?102:100,color:change==='paint'?'rgb(76, 84, 100)':danger.color}, {...danger,y:danger.y+shift,text:'Primary · Rest'}, {id:'design-lab-canvasChromeRestOpacity',x:10,y:20,width:20,height:32,tag:'input',scope:'prototype'}]}));
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','76'],{encoding:'utf8'});
    assert.equal(result.status,change==='none'||change==='frame-flow'?0:1,result.stderr);
  }
});

const objectTasks = () => [...Array.from({length:9},(_,i)=>'T'+String(i+1).padStart(2,'0')),'T11'].map(id=>({id,status:'completed',clicks:1,keystrokes:0,deadEnds:0}));
const objectVisualRows = ['timeline','timeline-busy','todos','task-list','shortcut','shortcut-empty','picker-preview','drag','archived-projects','archived-projects-root','progress','reflections','lab','dashboard-owner',...['overdue-chaos','busy-week','nested-projects','agent-heavy'].flatMap(seed=>['user-demo','user-alex','user-sam'].map(persona=>'dashboard-'+seed+'-'+persona))];
const objectEntries = () => objectVisualRows.flatMap(row=>['dark','light'].flatMap(theme=>(row.startsWith('dashboard-')&&row!=='dashboard-owner'?[1440,1024,375]:[1440,375]).map(width=>({row,theme,width,groups:[{id:'one',titles:[40,40]}],screenshot:'shot.png',screenshotTarget:{visible:true,selector:'[data-target]',box:{x:20,y:100,width:100,height:40}},aria:'- link Task',controls:[],axe:{violations:[],incomplete:[]},immutable:[{id:'shell',x:0,y:0,width:1440,height:64}],ownerAvailable:true,ownerFocused:true,dragging:true,hoverScreenshot:'shot.png',focusScreenshot:'shot.png'}))));
async function objectsSheet(t, change={}) {
  const f=await fixture(t);
  f.layout.immutable=[];
  if(change.route)f.cell.route=change.route;
  if(change.width)f.cell.viewport={width:change.width,height:812};
  for(const phase of [0,1]) {
    await mkdir(join(f.dirs[phase],'tasks'),{recursive:true});
    await f.json(phase,'index.json',{commit:phase?'after':'before',cells:[f.cell]});
    await f.json(phase,'layout.json',f.layout);
    await f.json(phase,'objects-verification.json',{complete:true,entries:objectEntries(),tasks:objectTasks().map(e=>phase===0 && e.id==='T11'?{...e,status:'blocked',deadEnds:1}:e)});
    await f.json(phase,'tasks/tasks.json',objectTasks());
  }
  if(change.entries)await f.json(1,'objects-verification.json',{complete:true,entries:change.entries(objectEntries()),tasks:change.tasks??objectTasks()});
  if(change.tasks)await f.json(1,'objects-verification.json',{complete:true,entries:objectEntries(),tasks:change.tasks});
  if(change.missing)await rm(join(f.dirs[1],'objects-verification.json'));
  await f.json(1,'layout.json',{...f.layout,planes:[{...f.layout.planes[0],selector:change.rowPlane?'app-dashboard-widget-frame':f.layout.planes[0].selector,y:change.move??0}],controls:change.controls??[],viewport:change.width??1440,document:change.width??1440});
  if(change.rowPlane)await f.json(0,'layout.json',{...f.layout,planes:[{...f.layout.planes[0],selector:'app-dashboard-widget-frame'}]});
  if(change.axe)await f.json(1,'axe.json',{violations:change.axe,incomplete:[]});
  const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
  return {result,dirs:f.dirs,report:await readFile(join(f.dirs[2],'report.json'),'utf8').catch(()=>result.stderr)};
}
test('profile 77 accepts complete object evidence and emits the Gate 2 sheet',async t=>{
  const f=await objectsSheet(t);assert.equal(f.result.status,0,f.report);
  const html=await readFile(join(f.dirs[2],'index.html'),'utf8');
  assert.match(html,/Slice 77 · Objects/);
  assert.match(html,/ARIA snapshots/);
  assert.match(html,/Core task costs/);
});
test('profile 77 removes task and widget census exceptions and keeps the breadcrumb exception',async t=>{
  for(const width of [1440,375])for(const cls of ['task-row__title','widget-row__title']) {
    const f=await objectsSheet(t,{width,controls:[{scope:'product',class:cls,text:'Task',width:80,height:width===375?40:20}]});
    assert.equal(f.result.status,1);assert.match(f.report,/target under/);
  }
  const f=await objectsSheet(t,{controls:[{scope:'product',class:'project-nav__breadcrumb',text:'Home',width:80,height:16}]});
  assert.equal(f.result.status,0,f.report);assert.match(f.report,/project navigation breadcrumbs/);
});
test('profile 77 gates new nested interactive nodes, missing runtime and title alignment',async t=>{
  for(const change of [
    {axe:[{id:'nested-interactive',nodes:[{target:['.new']}]}]},
    {missing:true},
    {entries:entries=>entries.map(e=>e.row==='dashboard-owner'?{...e,focusScreenshot:null}:e)},
    {entries:entries=>entries.slice(1)},
    {entries:entries=>entries.filter(e=>e.row!=='picker-preview')},
    {entries:entries=>entries.map((e,i)=>i?e:{...e,immutable:[{...e.immutable[0],height:66}]})},
    {entries:entries=>entries.map((e,i)=>i?e:{...e,groups:[{id:'one',titles:[40,42]}]})},
    {entries:entries=>entries.map((e,i)=>i?e:{...e,groups:[]})},
    {entries:entries=>entries.map(e=>e.row==='timeline-busy'?{...e,groups:[]}:e)},
    {tasks:objectTasks().map(e=>e.id==='T04'?{...e,clicks:2}:e)},
    {tasks:objectTasks().filter(e=>e.id!=='T11')},
  ]) { const f=await objectsSheet(t,change);assert.equal(f.result.status,1,f.report); }
});
test('profile 77 gates unchanged cells at 1px and reports changed row cells',async t=>{
  const stable=await objectsSheet(t,{route:'/settings/agents',move:1});assert.equal(stable.result.status,0,stable.report);
  const moved=await objectsSheet(t,{route:'/settings/agents',move:2});assert.equal(moved.result.status,1,moved.report);
  const dashboard=await objectsSheet(t,{route:'/app',move:20,rowPlane:true});assert.equal(dashboard.result.status,0,dashboard.report);
});

test('profile 77 keeps dashboard shell and nonchanging Lab controls fixed while row panels change',async t=>{
  const shell=await objectsSheet(t,{route:'/app',move:2});assert.equal(shell.result.status,1,shell.report);
  for(const [panel,expected] of [['task-row',0],['widget-frame',0],['activity',0],['cards',0],['controls',1]]) {
    const f=await objectsSheet(t,{route:'/prototype/design'});
    const base=JSON.parse(await readFile(join(f.dirs[0],'layout.json'),'utf8'));
    const control={tag:'button',text:'Primary · Rest',panel,scope:'prototype',class:'button',x:20,y:100,width:80,height:32};
    await writeFile(join(f.dirs[0],'layout.json'),JSON.stringify({...base,controls:[control]}));
    await writeFile(join(f.dirs[1],'layout.json'),JSON.stringify({...base,controls:[{...control,width:82}]}));
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
    assert.equal(result.status,expected,panel+' '+result.stderr);
  }
});

test('profile 77 translates unchanged Lab controls only by their measured panel movement',async t=>{
  for(const observed of [true,false]) {
    const f=await objectsSheet(t,{route:'/prototype/design'});
    const base=JSON.parse(await readFile(join(f.dirs[0],'layout.json'),'utf8'));
    const control={tag:'button',text:'Primary · Rest',panel:'controls',scope:'prototype',x:20,y:100,width:80,height:32};
    for(const phase of [0,1]) {
      await writeFile(join(f.dirs[phase],'layout.json'),JSON.stringify({...base,controls:[{...control,y:100+phase*40}]}));
      const evidence=JSON.parse(await readFile(join(f.dirs[phase],'objects-verification.json'),'utf8'));
      evidence.entries=evidence.entries.map(e=>e.row==='lab'?{...e,panels:[{id:'controls',x:20,y:observed?phase*40:0,width:100,height:200}]}:e);
      await writeFile(join(f.dirs[phase],'objects-verification.json'),JSON.stringify(evidence));
    }
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
    assert.equal(result.status,observed?0:1,result.stderr);
  }
});

test('profile 77 refuses a disappearing shell plane on a changed row surface',async t=>{
  const f=await objectsSheet(t,{route:'/app'});
  const layout=JSON.parse(await readFile(join(f.dirs[1],'layout.json'),'utf8'));layout.planes=[];
  await writeFile(join(f.dirs[1],'layout.json'),JSON.stringify(layout));
  const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);
});

test('profile 77 gates immutable drawer, dialog and tool boxes within changing project cells',async t=>{
  for(const region of ['drawer','dialog-header','insertion','toast-tool'])for(const change of ['move','missing','collector']) {
    const f=await objectsSheet(t,{route:'/projects/project-kitchen'});
    for(const phase of [0,1]) {
      const layout=JSON.parse(await readFile(join(f.dirs[phase],'layout.json'),'utf8'));
      layout.immutable=[{id:region,x:20,y:100,width:120,height:44}];
      if(phase===1) {
        if(change==='move')layout.immutable[0].y+=2;
        if(change==='missing')layout.immutable=[];
        if(change==='collector')delete layout.immutable;
      }
      await writeFile(join(f.dirs[phase],'layout.json'),JSON.stringify(layout));
    }
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
    assert.equal(result.status,1,region+' '+change+' '+result.stderr);
  }
});

test('profile 77 gates runtime-only controls and new axe nodes in each persona and Preview cell',async t=>{
  for(const row of ['dashboard-agent-heavy-user-sam','picker-preview','shortcut'])for(const change of ['small','axe','missing-controls','missing-axe']) {
    const f=await objectsSheet(t,{entries:entries=>entries.map(e=>{
      if(e.row!==row)return e;
      if(change==='small')return {...e,controls:[{scope:'product',class:'object-row__title',text:'Task',width:80,height:20}]};
      if(change==='axe')return {...e,axe:{violations:[{id:'nested-interactive',nodes:[{target:['.new']}]}],incomplete:[]}};
      if(change==='missing-controls')return {...e,controls:undefined};
      return {...e,axe:undefined};
    })});
    assert.equal(f.result.status,1,row+' '+change+' '+f.report);
  }
});

test('profile 77 requires the named immutable lift in each open-state cell',async t=>{
  const f=await objectsSheet(t,{route:'/projects/project-kitchen'});
  for(const phase of [0,1]) {
    const index=JSON.parse(await readFile(join(f.dirs[phase],'index.json'),'utf8'));
    index.cells[0].state='task-drawer';
    await writeFile(join(f.dirs[phase],'index.json'),JSON.stringify(index));
  }
  const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);
});

test('profile 77 requires root archive and empty shortcut visual pairs',async t=>{
  for(const row of ['archived-projects-root','shortcut-empty']) {
    const f=await objectsSheet(t,{entries:entries=>entries.filter(e=>e.row!==row)});
    assert.equal(f.result.status,1,row+' missing pair must fail');
  }
});

test('profile 77 measures contained Lab shell specimens relative to their observed panel',async t=>{
  for(const change of ['panel-flow','overflow-flow','panel-size','internal-move','internal-size','shell-move']) {
    const f=await objectsSheet(t);
    for(const phase of [0,1]) {
      const evidence=JSON.parse(await readFile(join(f.dirs[phase],'objects-verification.json'),'utf8'));
      evidence.entries=evidence.entries.map(e=>e.row==='lab'?{...e,
        panels:[{id:'navigation',x:600,y:100+phase*128,width:800+(phase && change==='panel-size'?2:0),height:500},{id:'drawer',x:600,y:700+phase*128,width:800,height:700}],
        immutable:[{id:'app-sidebar:0',x:0,y:48+(phase && change==='shell-move'?2:0),width:240,height:850},
          {id:'app-sidebar:1',x:620+(phase && change==='internal-move'?2:0),y:(change==='overflow-flow'?599:150)+phase*128,width:240+(phase && change==='internal-size'?2:0),height:350},
          {id:'[data-task-drawer]:0',x:620,y:750+phase*128,width:750,height:600}]}:e);
      await writeFile(join(f.dirs[phase],'objects-verification.json'),JSON.stringify(evidence));
    }
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
    assert.equal(result.status,['panel-flow','overflow-flow'].includes(change)?0:1,change+' '+result.stderr);
  }
});

test('profile 77 matrix keeps Lab specimen geometry local while the actual shell stays absolute',async t=>{
  for(const change of ['panel-flow','internal-move','internal-size','shell-move']) {
    const f=await objectsSheet(t,{route:'/prototype/design'});
    for(const phase of [0,1]) {
      const layout=JSON.parse(await readFile(join(f.dirs[phase],'layout.json'),'utf8'));
      layout.planes=[{selector:'app-sidebar',index:0,x:0,y:48+(phase && change==='shell-move'?2:0),width:240,height:850},
        {selector:'app-sidebar',index:1,x:620+(phase && change==='internal-move'?2:0),y:150+phase*128,width:240+(phase && change==='internal-size'?2:0),height:350}];
      layout.controls=[{scope:'prototype',panel:'controls',text:'Primary · Rest',x:20,y:100,width:80,height:32}];
      await writeFile(join(f.dirs[phase],'layout.json'),JSON.stringify(layout));
      const evidence=JSON.parse(await readFile(join(f.dirs[phase],'objects-verification.json'),'utf8'));
      evidence.entries=evidence.entries.map(e=>e.row==='lab'?{...e,panels:[{id:'navigation',x:600,y:100+phase*128,width:800,height:500}]}:e);
      await writeFile(join(f.dirs[phase],'objects-verification.json'),JSON.stringify(evidence));
    }
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
    assert.equal(result.status,change==='panel-flow'?0:1,change+' '+result.stderr);
  }
});

test('profile 77 axe comparison retains equal selectors when a legacy anchor contains changed text',async t=>{
  for(const newNode of [false,true]) {
    const f=await objectsSheet(t,{axe:[{id:'landmark-unique',nodes:[{target:[newNode?'.new-landmark':'.dashboard-main'],stableAnchor:'main|Changed child text'}]}]});
    await writeFile(join(f.dirs[0],'axe.json'),JSON.stringify({violations:[{id:'landmark-unique',nodes:[{target:['.dashboard-main'],stableAnchor:'main|Old child text'}]}],incomplete:[]}));
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
    assert.equal(result.status,newNode?1:0,result.stderr);
  }
});

test('profile 77 does not let a reused selector stand in for a different structural anchor',async t=>{
  for(const moved of [false,true]) {
    const anchor=moved?'|data-section-id=s|SECTION|DIV:2|BUTTON|BUTTON||':'|data-section-id=s|SECTION|DIV:1|BUTTON|BUTTON||';
    const f=await objectsSheet(t,{axe:[{id:'landmark-unique',nodes:[{target:['.tool'],stableAnchor:anchor}]}]});
    await writeFile(join(f.dirs[0],'axe.json'),JSON.stringify({violations:[{id:'landmark-unique',nodes:[{target:['.tool'],stableAnchor:'|data-section-id=s|SECTION|DIV:1|BUTTON|BUTTON||'}]}],incomplete:[]}));
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
    assert.equal(result.status,moved?1:0,result.stderr);
  }
});

test('profile 77 requires proof that each named screenshot target was visible',async t=>{
  for(const row of ['timeline','timeline-busy','task-list','shortcut','progress','reflections']) {
    const f=await objectsSheet(t,{entries:entries=>entries.map(e=>e.row===row?{...e,screenshotTarget:undefined}:e)});
    assert.equal(f.result.status,1,row+' must have visible-target evidence');
  }
});

test('profile 77 rejects a screenshot target box outside its viewport',async t=>{
  for(const box of [{x:20,y:1200,width:100,height:40},{x:-90,y:100,width:100,height:40}]) {
    const f=await objectsSheet(t,{entries:entries=>entries.map(e=>e.row==='shortcut'?{...e,screenshotTarget:{...e.screenshotTarget,box}}:e)});
    assert.equal(f.result.status,1,JSON.stringify(box)+' is not inside the viewport');
  }
});

test('profile 77 features the observed six-state Lab scrollshot as after-only evidence',async t=>{
  const f=await objectsSheet(t);
  const image='prototype-design-dark-1440.scroll-0-6.png';
  for(const phase of [0,1]) {
    const index=JSON.parse(await readFile(join(f.dirs[phase],'index.json'),'utf8'));
    index.cells[0].id='prototype-design-dark-1440';
    if(phase===1)index.cells[0].artifacts.scrolls=[image];
    await writeFile(join(f.dirs[phase],'index.json'),JSON.stringify(index));
  }
  await writeFile(join(f.dirs[1],image),'observed six-state image');
  const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const html=await readFile(join(f.dirs[2],'index.html'),'utf8');
  assert.match(html,/After only: six Object rows states/);
  assert.equal(await readFile(join(f.dirs[2],'after-'+image),'utf8'),'observed six-state image');
});

test('profile 77 measures the real inline New project form rather than requiring a nonexistent dialog',async t=>{
  for(const width of [1440,375])for(const change of ['none','missing','moved']) {
    const f=await objectsSheet(t,{route:'/app',width});
    for(const phase of [0,1]) {
      const index=JSON.parse(await readFile(join(f.dirs[phase],'index.json'),'utf8'));index.cells[0].state='new-project';
      await writeFile(join(f.dirs[phase],'index.json'),JSON.stringify(index));
      const layout=JSON.parse(await readFile(join(f.dirs[phase],'layout.json'),'utf8'));
      layout.immutable=[{id:'project-form:0',x:20,y:170,width:200,height:80},{id:'project-form:0:control:0',x:0,y:20,width:120,height:40}];
      if(phase===1 && change==='missing')layout.immutable=[];
      if(phase===1 && change==='moved')layout.immutable[1].x+=2;
      await writeFile(join(f.dirs[phase],'layout.json'),JSON.stringify(layout));
    }
    const result=spawnSync(process.execPath,[builder,...f.dirs,'--profile','77'],{encoding:'utf8'});
    assert.equal(result.status,change==='none'?0:1,width+' '+change+' '+result.stderr);
  }
});

// Profile 78: the states gate. A copy of `apps/e2e/ux/states-verification.ts`'s context table,
// with evidence that satisfies every rule; each test breaks one thing and expects the gate to fail.
const kitchenSection = id => `[data-section-id="section-project-kitchen-${id}"]`;
const [TASKS_R, REFL_R, TIME_R, PROG_R, ACT_R, BRIEF_R] = ['tasks', 'reflections', 'timeline', 'progress', 'recent-activity', 'brief'].map(kitchenSection);
const SHORTCUT_R = '[data-shortcut-id="shortcut-renovation-kitchen-tasks"]';
const stateRow = (context, region, kind, recovery, details, emptyHook = null, pinned = null, text = null) => ({ context, region, kind, recovery, details, emptyHook, pinned, text });
const stateRows = () => [
  stateRow('dashboard-me-failing', 'app-dashboard-page', 'read', 'try-again', true, 'data-dashboard-empty'),
  stateRow('dashboard-me-failing', 'app-sidebar', 'read', 'try-again', true, 'data-projects-empty'),
  stateRow('dashboard-real-ai', 'app-daily-digest-widget', 'read', 'try-again', false),
  stateRow('sidebar-loading', 'app-sidebar', 'loading', 'none', false, 'data-projects-empty'),
  stateRow('sidebar-failed', 'app-sidebar', 'read', 'try-again', true, 'data-projects-empty'),
  stateRow('project-read-failing', 'main', 'read', 'try-again', true),
  stateRow('project-unavailable-alex', 'main', 'read', 'go-home', false),
  stateRow('kitchen-sections-failing', 'app-project-canvas', 'read', 'try-again', true, 'data-empty-canvas'),
  stateRow('kitchen-shortcuts-failing', 'app-project-canvas', 'read', 'try-again', true),
  stateRow('kitchen-bodies-failing', TASKS_R, 'read', 'try-again', true, 'data-tasks-empty'),
  stateRow('kitchen-bodies-failing', REFL_R, 'read', 'try-again', true, 'data-reflections-empty'),
  stateRow('kitchen-bodies-failing', TIME_R, 'read', 'try-again', true, 'data-timeline-empty'),
  stateRow('kitchen-bodies-failing', PROG_R, 'read', 'try-again', true),
  stateRow('kitchen-bodies-failing', ACT_R, 'read', 'try-again', true, 'data-activity-empty'),
  stateRow('kitchen-reflection-create-failing', REFL_R, 'write', 'none', true),
  stateRow('kitchen-reflection-edit-failing', REFL_R, 'write', 'none', true),
  stateRow('kitchen-section-create-failing', 'app-section-create-dialog', 'write', 'none', true),
  stateRow('kitchen-tasks-lifted', TASKS_R, 'read', 'try-again', true, 'data-tasks-empty'),
  stateRow('todos-failing', 'app-todos-page', 'read', 'try-again', true, 'data-todos-empty'),
  stateRow('reflections-page-failing', 'app-reflections-page', 'read', 'try-again', true, 'data-reflections-empty'),
  stateRow('archive-failing', 'app-archive-page', 'read', 'try-again', true, 'data-archive-empty'),
  stateRow('archived-projects-failing', 'app-archived-projects-page', 'read', 'try-again', true, 'data-archived-empty'),
  stateRow('agents-failing', 'app-agent-connections-page', 'read', 'try-again', true, 'data-agents-empty'),
  stateRow('picker-discovery-failing', 'app-shortcut-picker', 'read', 'try-again', true, 'data-shortcut-picker-empty'),
  stateRow('todos-stale', 'app-todos-page', 'stale', 'try-again', true, 'data-todos-empty'),
  stateRow('archive-restore-failing', 'app-archive-page', 'write', 'try-again', true),
  stateRow('archive-restore-unrefreshed', 'app-archive-page', 'write', 'retry-refresh', true),
  stateRow('archive-stale', 'app-archive-page', 'stale', 'try-again', true, 'data-archive-empty'),
  stateRow('archived-projects-stale', 'app-archived-projects-page', 'stale', 'try-again', true, 'data-archived-empty'),
  stateRow('kitchen-progress-formula-failing', PROG_R, 'write', 'none', true),
  stateRow('write-task-complete', TASKS_R, 'write', 'none', true),
  stateRow('write-drawer-field', 'app-task-detail-drawer', 'write', 'none', true),
  stateRow('write-quick-add', TASKS_R, 'write', 'none', true),
  stateRow('write-section-removal-toast', '[data-toast]:popover-open', 'write', 'none', true),
  stateRow('markdown-save-failing', BRIEF_R, 'write', 'none', true),
  stateRow('pin-todos-below', 'app-todos-page', 'write', 'none', true, null, 'bottom'),
  stateRow('pin-tasklist-above', TASKS_R, 'write', 'none', true, null, 'top'),
  stateRow('pin-section-collapse', BRIEF_R, 'write', 'none', true, null, 'top'),
  stateRow('pin-shortcut-collapse', SHORTCUT_R, 'write', 'none', true, null, 'bottom'),
  stateRow('pin-tall-tasklist-banner', TASKS_R, 'write', 'none', true, null, 'top'),
  stateRow('header-progress-empty-project', 'app-project-header', 'read', 'none', false),
  stateRow('header-progress-failing', 'app-project-header', 'read', 'none', false),
  stateRow('header-progress-legacy', 'app-project-header', 'read', 'none', false),
  stateRow('not-found', 'main', 'read', 'go-home', false),
  stateRow('kitchen-loading', 'app-project-canvas', 'loading', 'none', false, 'data-empty-canvas'),
  stateRow('header-progress-pending', 'app-project-header', 'pending', 'none', false, null, null, 'Measuring…'),
];
const STATE_VIEWS = [['dark', 1440], ['dark', 375], ['light', 1440], ['light', 375]];
const RECOVERY_NAMES = { 'try-again': 'Try again', 'go-home': 'Go to Home', 'retry-refresh': 'Retry refresh', reload: 'Reload' };
/** The workspace's scroll port and the content track inside it, per width. */
const stateGeometry = width => width === 375
  ? { port: { x: 0, y: 56, width: 375, height: 756 }, track: { x: 0, y: 56, width: 375, height: 756 } }
  : { port: { x: 240, y: 48, width: 1200, height: 852 }, track: { x: 480, y: 48, width: 960, height: 852 } };
const stateLabPanels = () => ['controls', 'state-messages', 'states', 'task-row', 'navigation', 'section-states', 'buttons'].map((id, i) => ({ id, x: 20, y: 100 + i * 400, width: 600, height: 380 }));
function stateEntry(context, theme, width, rows) {
  const mine = rows.filter(r => r.context === context), g = stateGeometry(width);
  const reason = mine.some(r => r.details) ? `Audit: ${context} failed` : null;
  const pinned = mine.find(r => r.pinned)?.pinned ?? null;
  const sticky = context === 'pin-tasklist-above' ? [{ box: { x: g.track.x, y: g.port.y, width: g.track.width, height: 60 } }] : [];
  const toast = context === 'pin-todos-below' ? { x: g.track.x + 8, y: g.port.y + g.port.height - 80, width: g.track.width - 16, height: 64 } : null;
  const clearTop = g.port.y + (sticky.length ? 60 : 0), clearBottom = toast ? toast.y : g.port.y + g.port.height;
  const anchor = y => ({ id: 'sentence-1', text: 'Couldn’t save this.', box: { x: g.track.x + 20, y, width: 300, height: 20 } });
  const hidden = pinned === 'top' ? anchor(g.port.y - 120) : anchor(g.port.y + g.port.height + 120);
  const region = (r, open, anchors = r.pinned ? [hidden] : []) => ({
    region: r.region, present: true, box: { x: g.track.x, y: 200, width: g.track.width, height: 300 }, text: r.text ?? 'Couldn’t load this.',
    buttons: r.recovery === 'none' ? [] : [{ name: RECOVERY_NAMES[r.recovery], tag: r.recovery === 'go-home' ? 'a' : 'button', recovery: r.recovery, visible: true, disabled: false, box: { x: g.track.x + 10, y: 220, width: 96, height: width === 375 ? 44 : 32 } }],
    details: r.details ? [{ open, visible: true, summary: 'Details', text: `Details ${reason}` }] : [],
    visibleEmptyHooks: [], loading: r.kind === 'loading' ? [{ text: 'Loading…', visible: true, busy: true }] : [],
    failures: [{ box: { x: g.track.x + 10, y: 240, width: 200, height: 20 } }], anchors,
  });
  const pin = edge => {
    const x = g.track.x + 8, w = g.track.width - 16, h = 52, y = edge === 'top' ? clearTop + 8 : clearBottom - 8 - h;
    return { edge, indicator: edge === 'top' ? '↑' : '↓', sentence: 'Couldn’t save this.', box: { x, y, width: w, height: h }, show: { x: x + 4, y: y + 4, width: w - 56, height: 44 }, dismiss: { x: x + w - 48, y: y + 4, width: 44, height: 44 } };
  };
  const frame = { scrollPort: { ...g.port, client: { ...g.port } }, track: { ...g.track }, sticky, toast };
  return {
    context, theme, width, reason, screenshot: `states-${context}-${theme}-${width}.png`, aria: '- main', ...frame,
    regions: mine.map(r => region(r, false)), reasonVisible: reason ? false : null, rawReasonHits: [], pins: pinned ? [pin(pinned)] : [],
    detailsOpen: reason ? mine.map(r => region(r, true, r.pinned ? [anchor(g.port.y + 300)] : [])) : undefined,
    afterPinPress: pinned ? { ...frame, pins: [], regions: mine.map(r => region(r, false, [anchor(g.port.y + 300)])), focus: { inRegion: true, describes: true, isAnchor: false, tag: 'button' } } : undefined,
    controls: [], axe: { violations: [], incomplete: [] }, consoleErrors: [],
    ...(context === 'lab' ? { panels: stateLabPanels() } : {}),
  };
}
const stateTasks = phase => [...[...Array.from({ length: 9 }, (_, i) => 'T' + String(i + 1).padStart(2, '0')), 'T11'].map(id => ({ id, status: 'completed', clicks: 2, keystrokes: 1, deadEnds: 0 })),
  phase ? { id: 'T12', status: 'completed', clicks: 1, keystrokes: 0, deadEnds: 0 } : { id: 'T12', status: 'blocked', clicks: 0, keystrokes: 0, deadEnds: 1 }];
const stateEvidence = phase => {
  const rows = stateRows();
  const contexts = [...new Set(rows.map(r => r.context)), 'lab'];
  return { commit: phase ? 'after' : 'before', complete: true, rows, entries: contexts.flatMap(context => STATE_VIEWS.map(([theme, width]) => stateEntry(context, theme, width, rows))), tasks: stateTasks(phase) };
};
/** Applies `fn` to one context's entries: every view, or only `view` (`'dark|1440'`). */
const editState = (evidence, context, fn, view = null) => { for (const e of evidence.entries) if (e.context === context && (!view || view === `${e.theme}|${e.width}`)) fn(e); return evidence; };
async function statesSheet(t, change = {}) {
  const f = await fixture(t);
  f.layout.immutable = [];
  if (change.route) f.cell.route = change.route;
  if (change.cellId) f.cell.id = change.cellId;
  if (change.width) f.cell.viewport = { width: change.width, height: 812 };
  const evidence = [stateEvidence(0), stateEvidence(1)];
  for (const phase of [0, 1]) {
    await f.json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [f.cell] });
    await f.json(phase, 'layout.json', { ...f.layout, controls: change.controls ?? [] });
    change[phase ? 'evidence' : 'before']?.(evidence[phase]);
    await f.json(phase, 'states-verification.json', evidence[phase]);
    for (const entry of evidence[phase].entries) if (entry.screenshot) await writeFile(join(f.dirs[phase], entry.screenshot), 'state image');
  }
  if (change.missing !== undefined) await rm(join(f.dirs[change.missing], 'states-verification.json'));
  await f.json(1, 'layout.json', { ...f.layout, planes: [{ ...f.layout.planes[0], y: change.move ?? 0 }], controls: change.controls ?? [], viewport: change.width ?? 1440, document: change.width ?? 1440 });
  if (change.axe) await f.json(1, 'axe.json', { violations: change.axe, incomplete: [] });
  change.layouts?.(f);
  const run = () => spawnSync(process.execPath, [builder, ...f.dirs, '--profile', '78'], { encoding: 'utf8' });
  const result = change.layouts ? null : run();
  return { f, run, result, dirs: f.dirs, report: result ? await readFile(join(f.dirs[2], 'report.json'), 'utf8').catch(() => result.stderr) : null };
}
/** A refusal counts only when the gate ran to its report and listed a failure: a crash is not a refusal. */
const statesFails = async (t, change, label) => {
  const s = await statesSheet(t, change);
  assert.equal(s.result.status, 1, `${label} passed the gate`);
  const report = JSON.parse(await readFile(join(s.dirs[2], 'report.json'), 'utf8').catch(() => 'null'));
  assert.ok(report?.geometryFailures?.length, `${label}: the gate did not run to a report: ${s.result.stderr.slice(0, 400)}`);
  return s;
};

test('profile 78 accepts complete states evidence and emits the Gate 2 sheet', async t => {
  const s = await statesSheet(t);
  assert.equal(s.result.status, 0, s.report);
  const html = await readFile(join(s.dirs[2], 'index.html'), 'utf8');
  assert.match(html, /Slice 78 · States/);
  assert.match(html, /Core task costs/);
  assert.match(html, /T12/);
  const report = JSON.parse(s.report);
  assert.equal(report.statesVisualPairs.filter(p => p.status !== 'paired').length, 0);
  assert.equal(await readFile(join(s.dirs[2], 'after-states-pin-todos-below-dark-1440.png'), 'utf8'), 'state image');
});

test('profile 78 fails on a missing or incomplete states-verification.json', async t => {
  await statesFails(t, { missing: 1 }, 'missing after evidence');
  await statesFails(t, { missing: 0 }, 'missing before evidence');
  await statesFails(t, { evidence: e => { e.complete = false; } }, 'incomplete after evidence');
});

test('profile 78 fails on a Capture scope context with no table row or an uncaptured view', async t => {
  await statesFails(t, { evidence: e => { e.rows = e.rows.filter(r => r.context !== 'todos-stale'); } }, 'dropped row');
  await statesFails(t, { evidence: e => { e.rows = e.rows.filter(r => r.context !== 'pin-todos-below'); e.entries = e.entries.filter(x => x.context !== 'pin-todos-below'); } }, 'dropped row and context');
  await statesFails(t, { evidence: e => { e.entries = e.entries.filter(x => !(x.context === 'not-found' && x.width === 375 && x.theme === 'dark')); } }, 'missing view');
  await statesFails(t, { evidence: e => editState(e, 'kitchen-loading', x => { x.error = 'Timeout'; }, 'light|375') }, 'errored view');
  await statesFails(t, { evidence: e => { e.rows.find(r => r.context === 'todos-failing').kind = 'broken'; } }, 'invalid kind');
});

test('profile 78 fails when a row names an empty hook the web source no longer has', async t => {
  await statesFails(t, { evidence: e => { e.rows.find(r => r.context === 'todos-failing').emptyHook = 'data-todo-list-empty'; } }, 'renamed hook');
});

test('profile 78 fails on an empty hook shown inside a read row region, or a region that is not there', async t => {
  await statesFails(t, { evidence: e => editState(e, 'todos-failing', x => { x.regions[0].visibleEmptyHooks = ['data-todos-empty']; }, 'dark|1440') }, 'visible empty hook');
  await statesFails(t, { evidence: e => editState(e, 'kitchen-sections-failing', x => { x.regions[0].visibleEmptyHooks = ['data-empty-canvas']; }, 'light|375') }, 'visible empty canvas');
  await statesFails(t, { evidence: e => editState(e, 'agents-failing', x => { x.regions[0] = { region: x.regions[0].region, present: false }; }, 'dark|1440') }, 'absent region');
});

test('profile 78 gates the declared recovery control and its target size', async t => {
  await statesFails(t, { evidence: e => editState(e, 'archive-failing', x => { x.regions[0].buttons = []; }, 'dark|1440') }, 'missing Try again');
  await statesFails(t, { evidence: e => editState(e, 'archive-failing', x => { x.regions[0].buttons[0].visible = false; }, 'dark|1440') }, 'hidden Try again');
  await statesFails(t, { evidence: e => editState(e, 'archive-restore-unrefreshed', x => { x.regions[0].buttons[0].name = 'Try again'; x.regions[0].buttons[0].recovery = 'try-again'; }, 'dark|1440') }, 'wrong recovery');
  await statesFails(t, { evidence: e => editState(e, 'not-found', x => { x.regions[0].buttons = []; }, 'light|1440') }, 'missing Go to Home');
  await statesFails(t, { evidence: e => editState(e, 'write-task-complete', x => { x.regions[0].buttons = [{ name: 'Try again', tag: 'button', recovery: 'try-again', visible: true, box: { x: 0, y: 0, width: 96, height: 32 } }]; }, 'dark|1440') }, 'undeclared Try again');
  await statesFails(t, { evidence: e => editState(e, 'header-progress-failing', x => { x.regions[0].buttons = [{ name: 'Retry refresh', tag: 'button', recovery: null, visible: true, box: { x: 0, y: 0, width: 96, height: 32 } }]; }, 'dark|1440') }, 'undeclared Retry refresh');
  await statesFails(t, { evidence: e => editState(e, 'todos-failing', x => { x.regions[0].buttons[0].box.height = 20; }, 'dark|1440') }, 'small Try again');
  await statesFails(t, { evidence: e => editState(e, 'todos-failing', x => { x.regions[0].buttons[0].box.height = 40; }, 'light|375') }, 'small touch Try again');
  const pass = await statesSheet(t, { evidence: e => editState(e, 'header-progress-failing', x => { x.regions[0].buttons = [{ name: 'Retry', tag: 'button', recovery: null, visible: true, box: { x: 0, y: 0, width: 96, height: 32 } }]; }) });
  assert.equal(pass.result.status, 0, 'the header history Retry is not a recovery control: ' + pass.report);
});

test('profile 78 gates loading rows and pending rows', async t => {
  await statesFails(t, { evidence: e => editState(e, 'sidebar-loading', x => { x.regions[0].loading = []; }, 'dark|1440') }, 'no loading line');
  await statesFails(t, { evidence: e => editState(e, 'kitchen-loading', x => { x.regions[0].loading[0].busy = false; }, 'light|375') }, 'not busy');
  await statesFails(t, { evidence: e => editState(e, 'kitchen-loading', x => { x.regions[0].loading[0].visible = false; }, 'dark|375') }, 'hidden loading line');
  await statesFails(t, { evidence: e => { e.rows.find(r => r.kind === 'pending').text = null; } }, 'pending row without text');
  await statesFails(t, { evidence: e => editState(e, 'header-progress-pending', x => { x.regions[0].text = 'No tasks to measure'; }, 'dark|1440') }, 'pending text not shown');
});

test('profile 78 gates the injected reason, raw-reason patterns and Details', async t => {
  await statesFails(t, { evidence: e => editState(e, 'todos-failing', x => { x.reasonVisible = true; }, 'dark|1440') }, 'reason visible');
  await statesFails(t, { evidence: e => editState(e, 'todos-failing', x => { x.reasonVisible = null; }, 'dark|1440') }, 'reason unmeasured');
  await statesFails(t, { evidence: e => editState(e, 'dashboard-real-ai', x => { x.rawReasonHits = [{ pattern: '/answered \\d{3}/g', match: 'answered 500', text: 'The prototype host answered 500' }]; }, 'light|375') }, 'raw reason');
  await statesFails(t, { evidence: e => editState(e, 'write-quick-add', x => { x.detailsOpen = undefined; }, 'dark|1440') }, 'Details never opened');
  await statesFails(t, { evidence: e => editState(e, 'write-quick-add', x => { x.detailsOpen[0].details[0].text = 'Details'; }, 'dark|1440') }, 'Details without the reason');
  await statesFails(t, { evidence: e => editState(e, 'write-quick-add', x => { x.detailsOpen[0].details[0].open = false; }, 'dark|1440') }, 'Details did not open');
  await statesFails(t, { evidence: e => editState(e, 'not-found', x => { x.regions[0].details = [{ open: false, visible: true, summary: 'Details', text: 'Details' }]; }, 'dark|1440') }, 'Details on a details:false row');
  await statesFails(t, { evidence: e => { const r = e.rows.find(r => r.context === 'todos-failing'); r.details = false; } }, 'details:false row that shows Details');
});

test('profile 78 keeps failures inside their section frame', async t => {
  await statesFails(t, { evidence: e => editState(e, 'kitchen-bodies-failing', x => { x.regions[0].failures[0].box.y = 20; }, 'dark|1440') }, 'failure above the frame');
});

test('profile 78 gates must-not-change cells at 1 px and exempts only the four named matrix cells', async t => {
  assert.equal((await statesSheet(t, { move: 1 })).result.status, 0);
  await statesFails(t, { move: 2 }, 'populated project moved 2 px');
  await statesFails(t, { move: 2, cellId: 'kitchen-loading-dark-1440', route: '/projects/project-kitchen' }, 'kitchen-loading moved 2 px');
  for (const id of ['kitchen-error-dark-1440', 'kitchen-refused-light-375', 'kitchen-archived-dark-1440', 'not-a-route-light-1440']) {
    const s = await statesSheet(t, { move: 20, cellId: id, route: id.startsWith('not-a-route') ? '/not-a-route' : '/projects/project-kitchen' });
    assert.equal(s.result.status, 0, id + ' ' + s.report);
    assert.ok(JSON.parse(s.report).geometryReport.some(r => r.cell === id), id + ' movement is reported');
  }
});

test('profile 78 keeps only the breadcrumb census exception', async t => {
  await statesFails(t, { controls: [{ scope: 'product', class: 'task-row__title', text: 'Task', width: 80, height: 20 }] }, 'task row title exception');
  const s = await statesSheet(t, { controls: [{ scope: 'product', class: 'project-nav__breadcrumb', text: 'Home', width: 80, height: 16 }] });
  assert.equal(s.result.status, 0, s.report);
  await statesFails(t, { evidence: e => editState(e, 'todos-failing', x => { x.controls = [{ scope: 'product', class: 'button button--sm', text: 'Try again', width: 80, height: 20 }]; }, 'dark|1440') }, 'small runtime control');
  await statesFails(t, { axe: [{ id: 'nested-interactive', nodes: [{ target: ['.new'] }] }] }, 'new matrix axe node');
  await statesFails(t, { evidence: e => editState(e, 'todos-failing', x => { x.axe = { violations: [{ id: 'aria-allowed-role', nodes: [{ target: ['.pin'] }] }], incomplete: [] }; }, 'dark|1440') }, 'new runtime axe node');
});

test('profile 78 gates the Lab panel-relative, with only the named panels changing', async t => {
  for (const [panel, expected] of [['state-messages', 0], ['states', 0], ['task-row', 0], ['navigation', 0], ['section-states', 0], ['controls', 1], ['buttons', 1]]) {
    const s = await statesSheet(t, { route: '/prototype/design', cellId: 'prototype-design-dark-1440', layouts: f => {} });
    const base = JSON.parse(await readFile(join(s.dirs[0], 'layout.json'), 'utf8'));
    const control = { tag: 'button', text: 'Primary · Rest', panel, scope: 'prototype', class: 'button', x: 20, y: 100, width: 80, height: 32 };
    await writeFile(join(s.dirs[0], 'layout.json'), JSON.stringify({ ...base, controls: [control] }));
    await writeFile(join(s.dirs[1], 'layout.json'), JSON.stringify({ ...base, controls: [{ ...control, width: 82 }] }));
    assert.equal(s.run().status, expected, panel);
  }
  // An unchanged panel that moves with the panels above it is compared in its own frame.
  const moved = await statesSheet(t, { route: '/prototype/design', cellId: 'prototype-design-dark-1440', layouts: f => {}, evidence: e => editState(e, 'lab', x => { x.panels = x.panels.map(p => p.id === 'buttons' ? { ...p, y: p.y + 40 } : p); }) });
  const base = JSON.parse(await readFile(join(moved.dirs[0], 'layout.json'), 'utf8'));
  const control = { tag: 'button', text: 'Primary · Rest', panel: 'buttons', scope: 'prototype', class: 'button', x: 20, y: 2500, width: 80, height: 32 };
  await writeFile(join(moved.dirs[0], 'layout.json'), JSON.stringify({ ...base, controls: [control] }));
  await writeFile(join(moved.dirs[1], 'layout.json'), JSON.stringify({ ...base, controls: [{ ...control, y: 2540 }] }));
  const translated = moved.run();
  assert.equal(translated.status, 0, 'panel translation ' + await readFile(join(moved.dirs[2], 'report.json'), 'utf8').then(r => JSON.stringify(JSON.parse(r).geometryFailures)).catch(() => translated.stderr));
  await statesFails(t, { route: '/prototype/design', cellId: 'prototype-design-dark-1440', evidence: e => editState(e, 'lab', x => { delete x.panels; }, 'dark|1440') }, 'missing after Lab panels');
  await statesFails(t, { before: e => editState(e, 'lab', x => { x.panels = []; }, 'light|375') }, 'missing before Lab panels');
  await statesFails(t, { evidence: e => editState(e, 'lab', x => { x.panels = x.panels.map(p => p.id === 'controls' ? { ...p, height: p.height + 4 } : p); }, 'dark|1440') }, 'resized unchanged panel');
});

test('profile 78 gates core task costs and T12', async t => {
  await statesFails(t, { evidence: e => { e.tasks.find(x => x.id === 'T04').clicks = 3; } }, 'T04 regressed');
  await statesFails(t, { evidence: e => { e.tasks = e.tasks.filter(x => x.id !== 'T11'); } }, 'T11 missing');
  await statesFails(t, { evidence: e => { Object.assign(e.tasks.find(x => x.id === 'T12'), { status: 'blocked', deadEnds: 1 }); } }, 'T12 still a dead end');
  await statesFails(t, { evidence: e => { e.tasks.find(x => x.id === 'T12').clicks = 2; } }, 'T12 costs two clicks');
  await statesFails(t, { before: e => { Object.assign(e.tasks.find(x => x.id === 'T12'), { status: 'completed', deadEnds: 0, clicks: 1 }); } }, 'T12 before not a dead end');
  await statesFails(t, { evidence: e => { e.tasks = null; } }, 'no tasks');
});

test('profile 78 requires every visual acceptance pair', async t => {
  await statesFails(t, { before: e => editState(e, 'pin-todos-below', x => { delete x.screenshot; }, 'light|375') }, 'missing before pin pair');
  await statesFails(t, { evidence: e => editState(e, 'header-progress-legacy', x => { x.error = 'Timeout'; }, 'light|1440') }, 'errored after pair');
});

test('profile 78 pin gate accepts valid pins and rejects each way a pin can be wrong', async t => {
  const g = stateGeometry(1440), dark = 'dark|1440';
  const pinned = (context, fn, view = dark) => ({ evidence: e => editState(e, context, fn, view) });
  for (const [label, change] of [
    ['missing pin', pinned('pin-todos-below', x => { x.pins = []; })],
    ['two pins on the edge', pinned('pin-todos-below', x => { x.pins = [x.pins[0], { ...x.pins[0] }]; })],
    ['wrong edge', pinned('pin-todos-below', x => { x.pins[0].edge = 'top'; })],
    ['wrong indicator', pinned('pin-section-collapse', x => { x.pins[0].indicator = '↓'; })],
    ['pin for a visible sentence anchor', pinned('pin-shortcut-collapse', x => { x.regions[0].anchors[0].box.y = 400; })],
    ['one of two anchors visible', pinned('pin-shortcut-collapse', x => { x.regions[0].anchors.push({ ...x.regions[0].anchors[0], box: { ...x.regions[0].anchors[0].box, y: 400 } }); })],
    ['pin outside the scroll port', pinned('pin-section-collapse', x => { x.pins[0].box.y = g.port.y - 10; })],
    ['pin outside the content track', pinned('pin-section-collapse', x => { x.pins[0].box.x = g.track.x - 20; })],
    ['pin in the middle of the port', pinned('pin-section-collapse', x => { x.pins[0].box.y = 450; })],
    ['pin under the stuck quick-add', pinned('pin-tasklist-above', x => { x.pins[0].box.y = g.port.y + 20; })],
    ['pin under the open toast', pinned('pin-todos-below', x => { x.pins[0].box.y = x.toast.y - 20; })],
    ['toast not open', pinned('pin-todos-below', x => { x.toast = null; })],
    ['quick-add not stuck', pinned('pin-tasklist-above', x => { x.sticky[0].box.y = 300; })],
    ['missing anchor geometry', pinned('pin-tall-tasklist-banner', x => { x.regions[0].anchors = []; })],
    ['anchor without a box', pinned('pin-tall-tasklist-banner', x => { delete x.regions[0].anchors[0].box; })],
    ['missing sticky geometry', pinned('pin-section-collapse', x => { delete x.sticky; })],
    ['missing toast geometry', pinned('pin-section-collapse', x => { delete x.toast; })],
    ['missing scroll port', pinned('pin-section-collapse', x => { delete x.scrollPort.client; })],
    ['missing track', pinned('pin-section-collapse', x => { delete x.track; })],
    ['small pin on touch', pinned('pin-section-collapse', x => { x.pins[0].show.height = 40; }, 'light|375')],
    ['small close button', pinned('pin-section-collapse', x => { x.pins[0].dismiss.width = 20; })],
    ['press not recorded', pinned('pin-todos-below', x => { delete x.afterPinPress; })],
    ['pin left after the press', pinned('pin-todos-below', x => { x.afterPinPress.pins = [x.pins[0]]; })],
    ['sentence still hidden after the press', pinned('pin-todos-below', x => { x.afterPinPress.regions[0].anchors[0].box.y = 2000; })],
    ['focus outside the owner after the press', pinned('pin-todos-below', x => { x.afterPinPress.focus.inRegion = false; })],
    ['focus not on the described control after the press', pinned('pin-todos-below', x => { x.afterPinPress.focus = { inRegion: true, describes: false, isAnchor: false }; })],
    ['pin in a context with no pinned row', pinned('write-task-complete', x => { x.pins = [{ edge: 'top', indicator: '↑', box: { x: 600, y: 60, width: 400, height: 52 }, show: { x: 600, y: 60, width: 300, height: 44 }, dismiss: { x: 950, y: 60, width: 44, height: 44 } }]; })],
  ]) await statesFails(t, change, label);
  const focusSentence = await statesSheet(t, pinned('pin-tall-tasklist-banner', x => { x.afterPinPress.focus = { inRegion: true, describes: false, isAnchor: true }; }));
  assert.equal(focusSentence.result.status, 0, 'focusing the sentence when no control describes it: ' + focusSentence.report);
});
