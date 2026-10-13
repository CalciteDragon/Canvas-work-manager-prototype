import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectEvidence } from './evidence.mjs';

test('partial evidence failures stay incomplete with artifact-specific reasons', async () => {
  const result = await collectEvidence({
    screenshot: async () => 'image.png',
    axe: async () => { throw new Error('scan interrupted'); },
    tree: async () => 'tree.yml',
  });
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.artifacts, { screenshot: 'image.png', tree: 'tree.yml' });
  assert.deepEqual(result.errors, { axe: 'scan interrupted' });
});

test('only complete successful evidence is marked captured', async () => {
  const result = await collectEvidence({ screenshot: async () => 'a', axe: async () => 'b', tree: async () => 'c' });
  assert.equal(result.status, 'captured');
  assert.deepEqual(result.errors, {});
});
