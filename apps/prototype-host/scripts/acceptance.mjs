/**
 * Slice 5's acceptance check, run rather than reasoned about (§77).
 *
 * Creates a project, a task in it, completes the task, reads the resulting
 * ActivityEvents, then restarts the host and confirms the work survived — proving the
 * writes went through a unit of work to `.prototype/data.json` (§15). Slices 30–31 add
 * receipt-based section Undo, safe disposable deletion, and exact-actor recovery after a
 * repeated removal of an already deleted section.
 *
 * Runs against a temporary data file via CWM_DATA_FILE, never the developer's own
 * workspace: an acceptance check that mutates the file you were about to demo is worse
 * than no acceptance check. Plain Node, no TypeScript imports, so `node` can run it —
 * hence copying the committed seed rather than calling `writeSeedFile`.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hostRoot = join(here, '..');
const seedPath = join(hostRoot, '..', '..', 'prototype', 'seeds', 'personal-workspace.json');
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;

const check = (condition, description) => {
  if (!condition) throw new Error(`FAILED: ${description}`);
  console.log(`  ok  ${description}`);
};

const request = async (method, path, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const startHost = async (dataFile) => {
  // Through tsx, not node's type stripping: the domain services use TypeScript
  // parameter properties, which strip-types refuses as non-erasable syntax.
  const child = spawn(process.execPath, ['--import', 'tsx', join(hostRoot, 'main.ts')], {
    cwd: hostRoot,
    env: { ...process.env, CWM_DATA_FILE: dataFile, CWM_HOST_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const deadline = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`host exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${BASE}/prototype/health`);
      if (response.ok) return child;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error('host did not start within 20s');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
};

const stopHost = (child) =>
  new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
  });

const root = await mkdtemp(join(tmpdir(), 'cwm-acceptance-'));
const dataFile = join(root, 'data.json');
let host;

try {
  await copyFile(seedPath, dataFile);
  host = await startHost(dataFile);
  console.log(`prototype-host up on ${BASE} against ${dataFile}\n`);

  const project = await request('POST', '/api/projects', {
    workspaceId: 'workspace-demo',
    // Required since projects split into roots and sub-projects (schema version 3).
    kind: 'root',
    name: 'Acceptance project',
  });
  check(project.status === 201, 'POST /api/projects answers 201');
  check(typeof project.body.id === 'string', 'the new project has an id');
  check(project.body.workspaceId === 'workspace-demo', 'the project lands in the actor workspace');

  const task = await request('POST', '/api/tasks', {
    projectId: project.body.id,
    title: 'Configure deployment',
  });
  check(task.status === 201, 'POST /api/tasks answers 201');
  check(task.body.status === 'todo', 'a new task starts as todo');

  const completed = await request('POST', `/api/tasks/${task.body.id}/complete`);
  check(completed.status === 200, 'POST /api/tasks/:id/complete answers 200');
  check(completed.body.status === 'done', 'the completed task is done');
  check(typeof completed.body.completedAt === 'string', 'the completed task has a completedAt');

  const activity = await request('GET', '/api/activity');
  const actions = activity.body.map((event) => event.action);
  for (const action of ['project.created', 'task.created', 'task.completed']) {
    check(actions.includes(action), `the activity feed contains ${action}`);
  }
  check(
    activity.body.every((event) => event.actor === 'user' && typeof event.actorUserId === 'string'),
    'every event names the user who caused it',
  );
  check(actions[0] === 'task.completed', 'the feed is newest-first');

  console.log('\nrestarting the host...\n');
  await stopHost(host);
  host = await startHost(dataFile);

  const afterRestart = await request('GET', `/api/tasks?projectId=${project.body.id}`);
  check(afterRestart.status === 200, 'GET /api/tasks answers after a restart');
  check(afterRestart.body.length === 1, 'the task survived the restart');
  check(afterRestart.body[0].status === 'done', 'so did its completion');

  // Slice 30: a removal answers with a receipt, and Undo puts the section back where it was —
  // at the page's *first* placement, which Archive Restore's append would not reproduce.
  console.log('\nsection removal Undo...\n');
  const HOME = 'section-project-personal-brief';
  const canvas = async () =>
    (await request('GET', '/api/projects/project-personal/sections')).body.map((section) => section.id);
  const before = await canvas();
  check(before[0] === HOME && before.length > 1, 'the brief is the first of several placements on Home');

  const removed = await request('DELETE', `/api/sections/${HOME}`);
  check(removed.status === 200, 'DELETE /api/sections/:id answers 200');
  check(removed.body.section.archivedAt !== undefined, 'the removed section is archived');
  check(typeof removed.body.undo.undoId === 'string', 'the removal carries an Undo receipt');
  check(
    JSON.stringify(Object.keys(removed.body.undo).sort()) === JSON.stringify(['createdAt', 'expiresAt', 'label', 'operation', 'undoId']),
    'the receipt carries no inverse data',
  );
  check(!(await canvas()).includes(HOME), 'the section has left the canvas');

  const undone = await request('POST', `/api/undo/${removed.body.undo.undoId}`);
  check(undone.status === 200, 'POST /api/undo/:id answers 200');
  check(undone.body.outcome === 'restored' && undone.body.placement.index === 0, 'Undo reports the original index');
  check(JSON.stringify(await canvas()) === JSON.stringify(before), 'the section is back first, with its neighbours in order');

  const repeated = await request('POST', `/api/undo/${removed.body.undo.undoId}`);
  check(repeated.status === 409 && repeated.body.details?.reason === 'undo_consumed', 'a repeat Undo is refused as undo_consumed');

  const disposableResponse = await request('POST', '/api/projects/project-personal/sections', { type: 'progress' });
  const disposable = disposableResponse.body;
  check(disposableResponse.status === 201, 'a disposable view can be created for recovery acceptance');
  const hardRemoved = await request('DELETE', `/api/sections/${disposable.id}`);
  check(hardRemoved.status === 200 && hardRemoved.body.section.archivedAt !== undefined, 'removal returns the final section and receipt');
  const afterHardDelete = await readFile(dataFile, 'utf8');
  check(!JSON.parse(afterHardDelete).sections.some(({ id }) => id === disposable.id), 'the disposable view is absent from persisted sections');
  const recovered = await request('DELETE', `/api/sections/${disposable.id}`);
  check(
    recovered.status === 409 &&
      recovered.body.details?.reason === 'section_already_removed' &&
      recovered.body.details?.sectionId === disposable.id &&
      recovered.body.details?.undo?.undoId === hardRemoved.body.undo.undoId &&
      recovered.body.details?.undo?.expiresAt === hardRemoved.body.undo.expiresAt,
    'the same actor recovers the receipt after hard deletion',
  );
  check((await readFile(dataFile, 'utf8')) === afterHardDelete, 'receipt recovery writes no second event or record');
  const restoredDisposable = await request('POST', `/api/undo/${hardRemoved.body.undo.undoId}`);
  check(restoredDisposable.status === 200 && restoredDisposable.body.section.id === disposable.id, 'the recovered receipt recreates the original section');
  const persistedUndo = JSON.parse(await readFile(dataFile, 'utf8')).undoRecords.find(({ id }) => id === hardRemoved.body.undo.undoId);
  check(typeof persistedUndo?.consumedAt === 'string', 'the hard-deletion inverse persisted and was consumed after Undo');

  console.log('\nacceptance: all checks passed');
} catch (error) {
  console.error(`\nacceptance: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (host !== undefined) await stopHost(host);
  await rm(root, { recursive: true, force: true });
}
