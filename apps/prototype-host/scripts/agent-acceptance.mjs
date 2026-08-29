/**
 * Slice 13's acceptance check, run rather than reasoned about (§77).
 *
 * The slice's *Done when* is: **revoking `tasks.write` causes the next write attempt to
 * fail with a clear permission error**. This walks that path against a real host with
 * nothing restarted between steps, because "changes take effect on the next call" (§53) is
 * the claim, and a check that restarted the host would prove nothing about it.
 *
 * The browser half — unchecking the box in Settings → AI & Agents rather than sending a
 * PATCH — is watched by hand and recorded in `.prototype/notes.json`; the component spec
 * pins that the page sends exactly this permission set.
 *
 * Runs against a temporary data file via CWM_DATA_FILE, never the developer's own
 * workspace. Plain Node, no TypeScript imports, hence copying the committed seed.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hostRoot = join(here, '..');
const seedPath = join(hostRoot, '..', '..', 'prototype', 'seeds', 'agent-heavy.json');
const PORT = 4398;
const BASE = `http://127.0.0.1:${PORT}`;

const TOKEN = 'prototype-user-a-readwrite';
const OWNER = 'user-demo';
const PROJECT = 'project-work-manager';
const CONNECTION = 'agent-claude';

const check = (condition, description) => {
  if (!condition) throw new Error(`FAILED: ${description}`);
  console.log(`  ok  ${description}`);
};

/** `as` is either `{ token }` (an agent call) or `{ user }` (a persona call). */
const request = async (method, path, { body, token, user } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(user === undefined ? {} : { 'x-prototype-user': user }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const startHost = async (dataFile) => {
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

const taskCount = async () => {
  const tasks = await request('GET', `/api/tasks?projectId=${PROJECT}`, { user: OWNER });
  check(tasks.status === 200, 'GET /api/tasks answers for the owner');
  return tasks.body.length;
};

const root = await mkdtemp(join(tmpdir(), 'cwm-agent-acceptance-'));
const dataFile = join(root, 'data.json');
let host;

try {
  await copyFile(seedPath, dataFile);
  host = await startHost(dataFile);
  console.log(`prototype-host up on ${BASE} against ${dataFile}\n`);

  console.log('1. the agent can write, because the connection was granted tasks.write');
  const created = await request('POST', '/api/tasks', {
    token: TOKEN,
    body: { projectId: PROJECT, title: 'Configure deployment' },
  });
  check(created.status === 201, 'POST /api/tasks with a bearer token answers 201');
  const baseline = await taskCount();

  console.log('\n2. the owner takes tasks.write away');
  const patched = await request('PATCH', `/api/agent-connections/${CONNECTION}`, {
    user: OWNER,
    body: { permissions: ['projects.read', 'tasks.read', 'workspace.read'] },
  });
  check(patched.status === 200, 'PATCH /api/agent-connections/:id answers 200');
  check(!patched.body.permissions.includes('tasks.write'), 'the grant no longer contains tasks.write');

  console.log('\n3. the next write fails — no restart, and the error names the permission');
  const denied = await request('POST', '/api/tasks', {
    token: TOKEN,
    body: { projectId: PROJECT, title: 'Should never exist' },
  });
  check(denied.status === 403, 'the next POST /api/tasks answers 403');
  check(denied.body.error === 'permission_denied', 'the envelope says permission_denied');
  check(
    denied.body.message === `connection "${CONNECTION}" is missing permission "tasks.write"`,
    'the message names the connection and the permission it is missing',
  );
  // A count, not a file comparison: `lastUsedAt` is a deliberate write, so the data file
  // legitimately differs after a denied call.
  check((await taskCount()) === baseline, 'the denied write created nothing');

  console.log('\n4. reads still work — the denial was the permission, not the token');
  check((await request('GET', '/api/tasks', { token: TOKEN })).status === 200, 'the agent can still read tasks');

  console.log('\n5. revoking the connection stops it entirely');
  const revoked = await request('POST', `/api/agent-connections/${CONNECTION}/revoke`, { user: OWNER });
  check(revoked.status === 200 && revoked.body.revoked === true, 'POST .../revoke answers 200 and revokes');
  const afterRevoke = await request('GET', '/api/tasks', { token: TOKEN });
  check(afterRevoke.status === 401, 'the same token now answers 401');
  check(afterRevoke.body.error === 'unauthorized', 'the envelope says unauthorized');

  console.log('\n6. §57 attributes all of it');
  const activity = await request('GET', '/api/activity', { user: OWNER });
  const actions = activity.body.map((entry) => entry.action);
  check(actions.includes('agent_connection.updated'), 'the feed records the permission change');
  check(actions.includes('agent_connection.revoked'), 'the feed records the revocation');
  const agentWrite = activity.body.find((entry) => entry.action === 'task.created' && entry.actor === 'agent');
  check(agentWrite !== undefined, 'the agent’s own write is in the feed');
  check(agentWrite.actorName === 'Claude', 'and it is attributed to the connection by name, not by id');

  console.log('\nagent acceptance: all checks passed');
} catch (error) {
  console.error(`\nagent acceptance: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (host !== undefined) await stopHost(host);
  await rm(root, { recursive: true, force: true });
}
