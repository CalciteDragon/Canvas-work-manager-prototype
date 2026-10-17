import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATRIX, SEEDS, THEMES, VIEWPORTS } from './matrix';

test('selected matrix has unique evidence paths and all required axes', () => {
  assert.equal(new Set(MATRIX.map(c=>c.id)).size,MATRIX.length);
  assert.deepEqual(new Set(MATRIX.map(c=>c.seed)),new Set(SEEDS));
  assert.deepEqual(new Set(MATRIX.map(c=>c.theme)),new Set(THEMES));
  assert.deepEqual(new Set(MATRIX.map(c=>c.viewport.width)),new Set(VIEWPORTS.map(v=>v.width)));
});

test('slice 73 includes the paired details, confirmation and long-list drawer states', () => {
  for (const id of ['kitchen-project-details-dark-1440', 'kitchen-project-details-light-1440', 'kitchen-project-details-light-375', 'kitchen-archive-confirm-dark-1440', 'overdue-chaos-task-drawer-dark-1440', 'overdue-chaos-task-drawer-light-375']) {
    assert.ok(MATRIX.some(cell => cell.id === id), id);
  }
});
