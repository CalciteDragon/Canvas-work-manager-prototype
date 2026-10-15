import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectEvidence } from './evidence.mjs';
import { JSDOM } from 'jsdom';
import { collectPlaneBoxes } from './layout.mjs';

test('layout evidence records plane containers keyed by selector and index', () => {
  const { document } = new JSDOM('<app-top-bar></app-top-bar><app-project-section-frame></app-project-section-frame><app-project-section-frame></app-project-section-frame>').window;
  for (const element of document.querySelectorAll('*')) element.getBoundingClientRect = () => ({ x: 12, y: 24, width: 320, height: 80 });
  assert.deepEqual(collectPlaneBoxes(document), [
    { selector: 'app-top-bar', index: 0, x: 12, y: 24, width: 320, height: 80 },
    { selector: 'app-project-section-frame', index: 0, x: 12, y: 24, width: 320, height: 80 },
    { selector: 'app-project-section-frame', index: 1, x: 12, y: 24, width: 320, height: 80 },
  ]);
});

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
