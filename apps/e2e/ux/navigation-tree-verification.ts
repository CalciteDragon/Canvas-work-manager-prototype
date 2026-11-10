import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCoreTasks } from './tasks';

/**
 * Slice 81's navigation tree evidence. Step 0 holds only the core-task test: under `UX_OBJECTS=1`
 * `capture.ts` skips its legacy task baseline, so the counts come from here (Capture scope). Step 13
 * adds the runtime contexts to this file. Label: `UX_BEFORE`, or HEAD.
 */
const commit = process.env['UX_BEFORE'] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve('ux-output', commit);

test('navigation tree core tasks', async ({ browser }) => {
  await runCoreTasks(browser, resolve(out, 'tasks'));
  const tasks: { id: string; status: string; clicks: number; deadEnds: number }[] = JSON.parse(await readFile(resolve(out, 'tasks/tasks.json'), 'utf8'));
  await writeFile(resolve(out, 'navigation-tree-verification.json'), JSON.stringify({ commit, before: Boolean(process.env['UX_BEFORE']), tasks }, null, 2));
  // T10 records its known dead end (no Connect agent control); every other task completes.
  expect(tasks.filter(t => t.id !== 'T10' && t.status !== 'completed').map(t => t.id), 'core tasks complete').toEqual([]);
});
