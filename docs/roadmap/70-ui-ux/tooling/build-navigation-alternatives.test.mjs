// Slice 81 R1 (disposable, deleted at step 3): the alternatives comparison sheet.
// Run: node --test docs/roadmap/70-ui-ux/tooling/build-navigation-alternatives.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const builder = join(dirname(fileURLToPath(import.meta.url)), 'build-navigation-alternatives.mjs');
const run = dir => spawnSync(process.execPath, [builder, dir], { encoding: 'utf8' });

const measures = { clicks: { garden: 1, todos: 1, launch: 1 }, keys: { garden: 3, todos: 5, launch: 9 }, taps: { garden: 2, todos: 2, launch: 2 },
  tabsToContent: { withoutSkip: 12, withSkip: 3 }, header375: { height: 180, bottom: 240, share: 0.3 }, deepestPath: { wide: '3/3', drawer: '3/3' },
  smallTargets: { count: 0, names: [] }, axe: { serious: 0, critical: 0, rules: [] }, forcedColours: { distinct: true, differs: ['border-left'] } };

async function fixture(t, { dropOption, dropView, dropMeasure } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'nav-alt-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const contexts = [{ id: 'cabinets', seed: 'nested-projects', at: '/projects/project-cabinets', shows: 'Depth 2' }];
  const views = ['light', 'dark'].flatMap(theme => [[1440, 'closed'], [375, 'closed'], [375, 'open']].map(([width, state]) => ({ theme, width, state })))
    .filter(v => `${v.theme} ${v.width} ${v.state}` !== dropView);
  const shots = contexts.flatMap(c => views.flatMap(v => ['a', 'b', 'c'].filter(o => !(o === dropOption && v.width === 375))
    .map(option => ({ context: c.id, option, ...v, file: `shots/${c.id}--${option}--${v.theme}-${v.width}-${v.state}.png` }))));
  const measurements = Object.fromEntries(['a', 'b', 'c'].map(o => [o, { links: measures, tree: { ...measures, keys: { garden: 2, todos: 4, launch: 6 } } }]));
  if (dropMeasure) delete measurements[dropMeasure].tree;
  await writeFile(join(dir, 'index.json'), JSON.stringify({ commit: 'abc1234', chromium: '151', contexts, shots, measurements, extras: [] }));
  return dir;
}

test('writes one row per context and view, one column per option, and the measurements', async t => {
  const dir = await fixture(t);
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  const html = await readFile(join(dir, 'index.html'), 'utf8');
  assert.match(html, /<tr data-row="cabinets light 1440 closed">/);
  assert.match(html, /<tr data-row="cabinets dark 375 open">/);
  const row = html.split('<tr data-row="cabinets dark 375 open">')[1].split('</tr>')[0];
  assert.equal((row.match(/<img /g) ?? []).length, 3);
  for (const option of ['a', 'b', 'c']) assert.match(row, new RegExp(`--${option}--dark-375-open\\.png`));
  // The measurements table carries both keyboard models.
  assert.match(html, /<table class="measures">/);
  assert.match(html, /Treeview/);
  assert.match(result.stdout, /6 rows × 3 options/);
});

test('fails, naming the gap, when an option has no capture for a row', async t => {
  const dir = await fixture(t, { dropOption: 'c' });
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cabinets dark 375 open: no capture for option c/);
});

test('fails without the capture index', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'nav-alt-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /index\.json/);
});

test('fails when a context lacks a whole view, in every option', async t => {
  const dir = await fixture(t, { dropView: 'dark 375 open' });
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cabinets: no dark 375 open view/);
});

test('fails when an option and keyboard model has no measurements', async t => {
  const dir = await fixture(t, { dropMeasure: 'b' });
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /measurements missing for option b, tree/);
});
