import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const builder = join(dirname(fileURLToPath(import.meta.url)), 'build-sheet.mjs');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'slice71-sheet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dirs = ['before', 'after', 'sheet'].map(name => join(root, name));
  await Promise.all(dirs.map(dir => mkdir(dir)));
  const json = (phase, file, value) => writeFile(join(dirs[phase], file), JSON.stringify(value));
  const cell = { id: 'busy-week-project-dark-1440', theme: 'dark', route: '/projects/project-launch', status: 'captured', artifacts: { layout: 'layout.json', axe: 'axe.json', screenshot: 'shot.png' } };
  const layout = { planes: [{ selector: 'app-top-bar', index: 0, x: 0, y: 0, width: 1440, height: 64 }], controls: [], scrollRegions: [] };
  for (const phase of [0, 1]) {
    await json(phase, 'index.json', { commit: phase ? 'after' : 'before', cells: [cell] });
    await json(phase, 'layout.json', layout);
    await json(phase, 'axe.json', { violations: [{ id: 'color-contrast', impact: 'serious', nodes: [{ target: ['.muted'], failureSummary: 'Low contrast' }] }], incomplete: [{ id: 'color-contrast', nodes: [{ target: ['.glass'] }] }] });
    await writeFile(join(dirs[phase], 'shot.png'), 'copy-only image fixture');
  }
  const tokens = Object.fromEntries(['pane', 'sheet', 'lift'].flatMap(plane => [[`--plane-${plane}-tint`, '#101010'], [`--plane-${plane}-solid`, '#101010'], [`--plane-${plane}-alpha`, '50%']]));
  Object.assign(tokens, { '--plane-ground-solid': '#000000', '--color-text': '#ffffff', '--color-text-muted': '#aaaaaa', '--color-accent': '#ffaa88', '--color-accent-contrast': '#000000', '--focus-ring-color': '#ffaa88' });
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
