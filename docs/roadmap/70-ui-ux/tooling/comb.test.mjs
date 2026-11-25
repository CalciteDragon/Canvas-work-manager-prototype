// Schema and consistency tests for the Slice 82 comb files (docs/roadmap/70-ui-ux/comb-82/).
// Run by hand at each comb step and in the Acceptance check, not in `pnpm test` (plan Q7 (a)):
//   node --test docs/roadmap/70-ui-ux/tooling/comb.test.mjs
// Two parts: every check accepts the fixture good set and rejects its own bad file; then every
// check runs over the real comb-82 folder, skipped while that check's inputs do not exist yet.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { CHECKS, computeTally, loadComb, runChecks } from './build-comb.mjs';
import { badFiles, goodFiles } from './comb-fixtures.mjs';

const REPO = resolve(import.meta.dirname, '..', '..', '..', '..');
const COMB = resolve(import.meta.dirname, '..', 'comb-82');
const GATE1 = resolve(import.meta.dirname, '..', 'reproduction.json');

function writeComb(files) {
  const dir = mkdtempSync(join(tmpdir(), 'comb82-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  }
  return dir;
}

/** The good set with its tally generated, so the tally check has something consistent to compare. */
function good() {
  const files = goodFiles();
  const dir = writeComb(files);
  try { files['tally.json'] = computeTally(loadComb(dir, { gate1: join(dir, 'gate1/reproduction.json'), repo: REPO })); }
  finally { rmSync(dir, { recursive: true, force: true }); }
  return files;
}

function check(files, name) {
  const dir = writeComb(files);
  try { return runChecks(loadComb(dir, { gate1: join(dir, 'gate1/reproduction.json'), repo: REPO }), [name])[name]; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test('every test-plan check is implemented and has a bad fixture', () => {
  assert.deepEqual(Object.keys(badFiles).sort(), Object.keys(CHECKS).sort());
});

for (const [name, variants] of Object.entries(badFiles)) {
  test(`fixture: ${name} accepts the good set`, () => assert.deepEqual(check(good(), name), []));
  for (const [i, { break: breakFile, expect }] of variants.entries()) {
    test(`fixture: ${name} rejects bad file ${i + 1} (${expect.source})`, () => {
      const files = good();
      breakFile(files);
      const errors = check(files, name) ?? [];
      assert.ok(errors.some(e => expect.test(e)), `want an error matching ${expect}; got ${JSON.stringify(errors)}`);
    });
  }
}

// The real comb folder. A check reports null (skipped) while its inputs are absent.
const real = existsSync(COMB) ? loadComb(COMB, { gate1: GATE1, repo: REPO }) : null;
for (const name of Object.keys(CHECKS)) {
  test(`comb-82: ${name}`, t => {
    if (!real) return t.skip('comb-82/ does not exist yet');
    const errors = runChecks(real, [name])[name];
    if (errors === null) return t.skip('inputs not written yet');
    assert.deepEqual(errors, []);
  });
}
