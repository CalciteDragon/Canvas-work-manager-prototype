import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TaskCounter } from './tasks';

test('successful actions accumulate explicit counts and distinct surfaces', async () => {
  const counter = new TaskCounter();
  await counter.step('Open', 'Home', { clicks: 1 }, async () => {});
  await counter.step('Type name', 'Dialog', { keystrokes: 5 }, async () => {});
  await counter.step('Save', 'Dialog', { clicks: 1 }, async () => {});
  assert.deepEqual(counter.summary(), { clicks: 2, keystrokes: 5, surfaces: ['Home', 'Dialog'], deadEnds: 0 });
  assert.equal(counter.steps.length, 3);
  assert.equal(counter.steps[2]?.status, 'passed');
});

test('failed action records attempted cost, preserves completed counts and rethrows', async () => {
  const counter = new TaskCounter();
  await counter.step('Open', 'Home', { clicks: 1 }, async () => {});
  await assert.rejects(counter.step('Missing', 'Dialog', { clicks: 1 }, async () => { throw new Error('Absent'); }), /Absent/);
  assert.deepEqual(counter.summary(), { clicks: 1, keystrokes: 0, surfaces: ['Home'], deadEnds: 1 });
  assert.deepEqual(counter.steps[1], { action: 'Missing', surface: 'Dialog', clicks: 1, keystrokes: 0, status: 'blocked', error: 'Absent' });
});
