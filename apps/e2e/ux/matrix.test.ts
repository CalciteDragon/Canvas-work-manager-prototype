import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATRIX, SEEDS, THEMES, VIEWPORTS } from './matrix';

test('selected matrix has unique evidence paths and all required axes', () => {
  assert.equal(new Set(MATRIX.map(c=>c.id)).size,MATRIX.length);
  assert.deepEqual(new Set(MATRIX.map(c=>c.seed)),new Set(SEEDS));
  assert.deepEqual(new Set(MATRIX.map(c=>c.theme)),new Set(THEMES));
  assert.deepEqual(new Set(MATRIX.map(c=>c.viewport.width)),new Set(VIEWPORTS.map(v=>v.width)));
});
