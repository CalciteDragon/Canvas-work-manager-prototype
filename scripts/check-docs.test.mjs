import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from './roadmap.mjs';

test('built Compodoc links reject missing fragments on an existing page', (t) => {
  // Only generated output can prove a rendered anchor; the source-only mode is
  // exercised by docs:check separately when docs/api/index.html is absent.
  const page = join(ROOT, 'docs/api/index.html');
  if (!existsSync(page)) return t.skip('Run pnpm docs:api to verify generated anchors');
  const fixture = join(ROOT, 'docs/guides/compodoc-fragment-regression.md');
  assert.equal(existsSync(fixture), false);
  const fragment = 'cwmDefinitelyMissingRegressionAnchor';
  assert.equal(readFileSync(page, 'utf8').includes(fragment), false);
  try {
    writeFileSync(fixture, `[Broken reference](../api/index.html#${fragment})\n`);
    assert.throws(() => execFileSync(process.execPath, ['scripts/check-docs.mjs'], {
      cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
    }), (error) => error.status === 1 && error.stderr.includes(fragment));
  } finally {
    unlinkSync(fixture);
  }
});
