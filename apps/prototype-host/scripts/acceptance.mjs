/**
 * Slice 5's acceptance check, run rather than reasoned about (§77).
 *
 * Creates a project, a task in it, completes the task, reads the resulting
 * ActivityEvents, then restarts the host and confirms the work survived — proving the
 * writes went through a unit of work to `.prototype/data.json` (§15).
 *
 * Runs against a temporary data file via CWM_DATA_FILE, never the developer's own
 * workspace: an acceptance check that mutates the file you were about to demo is worse
 * than no acceptance check. Plain Node, no TypeScript imports, so `node` can run it —
 * hence copying the committed seed rather than calling `writeSeedFile`.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
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
    env: { ...process.env, CWM_DATA_FILE: dataFile, PORT: String(PORT) },
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

  console.log('\nacceptance: all checks passed');
} catch (error) {
  console.error(`\nacceptance: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (host !== undefined) await stopHost(host);
  await rm(root, { recursive: true, force: true });
}
