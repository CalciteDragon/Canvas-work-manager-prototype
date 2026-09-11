import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hasWrittenOutcome, parseEntry, ROOT } from './roadmap.mjs';

const template = readFileSync(join(ROOT, 'docs/templates/implementation-plan.md'), 'utf8');

for (const [name, text] of [
  ['missing section', '# Plan\nDone.'],
  ['empty section', '## Outcome\n\n'],
  ['untouched template', template],
  ['comments and subheadings', '## Outcome\n<!-- hidden\nprose -->\n### Deliverables\n<write here>'],
  ['prose in next section', '## Outcome\n\n## Other\nDone.'],
]) {
  test(`rejects ${name}`, () => assert.equal(hasWrittenOutcome(text), false));
}

test('accepts written prose under a subsection', () => {
  assert.equal(hasWrittenOutcome('## Outcome\n### Deliverables\nImplemented the documentation checks.\n## Other\n'), true);
});

test('completed records require a written Outcome', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cwm-roadmap-test-'));
  const file = join(dir, 'completed.md');
  try {
    const body = template.replace(/^.*\n/, '<!-- completed-record id="99" closed="2026-09-10" summary="Smoke" -->\n');
    writeFileSync(file, body);
    assert.ok(parseEntry('completed', file).problems.some((p) => p.includes('Outcome')));
    writeFileSync(file, body + '\nImplemented and verified documentation tooling.\n');
    assert.deepEqual(parseEntry('completed', file).problems, []);
  } finally {
    unlinkSync(file);
    rmdirSync(dir);
  }
});
