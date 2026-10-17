import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const builder = join(dirname(fileURLToPath(import.meta.url)), 'build-sheet.mjs');
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
