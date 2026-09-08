/**
 * Slice 16's acceptance check (§62).
 *
 * "An agent completing a task via MCP visibly checks it off in an open project page within
 * a second, and the activity feed shows the agent as actor."
 *
 * A script cannot watch a checkbox, so it stands where the browser stands: an open
 * `GET /prototype/events` stream. What it insists on is the two things the browser needs and
 * a unit test cannot prove — that the frame arrives quickly, and that the write it announces
 * is already readable when it does. A hub that broadcast from inside the unit of work would
 * pass the first and fail the second, and the failure would look, in a browser, exactly like
 * "live updates do not work".
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { tokenFor } from '@cwm/prototype-data';

const here = dirname(fileURLToPath(import.meta.url));
const hostRoot = join(here, '..');
const seedPath = join(hostRoot, '..', '..', 'prototype', 'seeds', 'agent-heavy.json');

/** The `agent-heavy` fixture: a read-write connection, its owner, and an open task. */
const CONNECTION = 'agent-claude';
// Read from the fixture table rather than written out here: a second copy of a credential is
// a 401 waiting for someone to renumber the tokens.
const TOKEN = tokenFor(CONNECTION);
const PERSONA = 'user-demo';
const CONNECTION_NAME = 'Claude';
const TASK = 'task-agent-schema';
const PROJECT = 'project-work-manager';

const BUDGET_MS = 1_000;
/** How long to wait for a frame before calling the whole claim false. */
const FRAME_TIMEOUT_MS = 10_000;

const check = (condition, description) => {
  if (!condition) throw new Error(`FAILED: ${description}`);
  console.log(`  ok  ${description}`);
};

const waitForExit = (child, timeoutMs) => {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.off('exit', finish);
      resolve(false);
    }, timeoutMs);
    child.once('exit', finish);
  });
};

const stopHost = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!child.kill()) return;
  if (await waitForExit(child, 2_000)) return;
  child.kill('SIGKILL');
  if (!(await waitForExit(child, 2_000))) throw new Error('host did not exit after SIGKILL');
};

const startHost = async (dataFile) => {
  const child = spawn(process.execPath, ['--import', 'tsx', join(hostRoot, 'main.ts')], {
    cwd: hostRoot,
    env: { ...process.env, CWM_DATA_FILE: dataFile, CWM_HOST_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  return await new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      child.off('exit', onEarlyExit);
      child.stdout.off('data', onData);
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      void stopHost(child).then(() => reject(new Error('host did not start within 20s')), reject);
    }, 20_000);
    const onEarlyExit = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`host exited early with code ${code}`));
    };
    child.once('exit', onEarlyExit);
    const onData = (chunk) => {
      output += chunk.toString();
      const matched = /prototype-host listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (matched === null) return;
      settled = true;
      cleanup();
      resolve({ child, origin: `http://127.0.0.1:${matched[1]}` });
    };
    child.stdout.on('data', onData);
  });
};

/**
 * Reads `data:` frames off the stream and reports, for each, how long after `since` it
 * arrived and what the host said the task's status was at that instant.
 */
const readFrames = async (origin, response, since, onFrame) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    let index = buffer.indexOf('\n\n');
    while (index >= 0) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const line = block.split('\n').find((candidate) => candidate.startsWith('data: '));
      if (line !== undefined) {
        const elapsed = Date.now() - since();
        // Read *now*, on receipt, and not a tick later: this is the whole ordering claim.
        const task = await fetch(`${origin}/api/tasks/${TASK}`, {
          headers: { 'x-prototype-user': PERSONA },
        }).then((answer) => answer.json());
        if (await onFrame(JSON.parse(line.slice(6)), elapsed, task, reader)) return;
      }
      index = buffer.indexOf('\n\n');
    }
  }
};

const root = await mkdtemp(join(tmpdir(), 'cwm-live-acceptance-'));
const dataFile = join(root, 'data.json');
let host;
let client;

try {
  await copyFile(seedPath, dataFile);

  console.log('1. Host and open stream');
  const started = await startHost(dataFile);
  host = started.child;
  const { origin } = started;

  const stream = await fetch(`${origin}/prototype/events?user=${PERSONA}`, {
    headers: { accept: 'text/event-stream', origin: 'http://localhost:4200' },
  });
  check(stream.status === 200, 'the stream answers 200');
  check(stream.headers.get('content-type') === 'text/event-stream', 'it is an event stream');
  check(
    stream.headers.get('access-control-allow-origin') === 'http://localhost:4200',
    'a browser at :4200 is allowed to open it',
  );

  console.log('2. An agent completes a task over MCP');
  // Measured from *issue*, not from the resolved call: the frame is flushed at commit,
  // which is before the tool's own HTTP response is written.
  // Not `Infinity`: a frame arriving *before* the call was issued would then measure as
  // -Infinity and satisfy the budget silently. A negative elapsed is a failure, not a pass.
  let issuedAt = 0;
  const seen = [];
  let stopReading = () => undefined;
  const watching = readFrames(origin, stream, () => issuedAt, async (event, elapsed, task, reader) => {
    seen.push({ event, elapsed, task });
    await reader.cancel();
    return true;
  });

  client = new Client({ name: 'slice-16-live-acceptance', version: '0.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(
    new StreamableHTTPClientTransport(new globalThis.URL(`${origin}/mcp`), {
      authProvider: { token: async () => TOKEN },
    }),
  );

  issuedAt = Date.now();
  const called = await client.callTool({ name: 'complete_task', arguments: { taskId: TASK } });
  check(called.isError !== true, 'the agent completed the task');

  // Without this the central claim fails as a hang rather than as a red exit, and CI would
  // report a timeout instead of "no frame arrived".
  await Promise.race([
    watching,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`FAILED: no frame within ${FRAME_TIMEOUT_MS} ms`)), FRAME_TIMEOUT_MS);
      stopReading = () => clearTimeout(timer);
      void watching.then(stopReading, stopReading);
    }),
  ]);

  console.log('3. The frame');
  const [frame] = seen;
  check(frame !== undefined, 'a frame arrived');
  check(
      JSON.stringify(frame.event) ===
      JSON.stringify({
        type: 'task.completed',
        entityType: 'task',
        entityId: TASK,
        projectId: PROJECT,
        rootProjectId: PROJECT,
      }),
    `it is §62's event for the completed task: ${JSON.stringify(frame.event)}`,
  );
  check(
    frame.elapsed >= 0 && frame.elapsed <= BUDGET_MS,
    `it arrived ${frame.elapsed} ms after the call was issued, inside the ${BUDGET_MS} ms budget`,
  );
  check(frame.task.status === 'done', 'the write was already committed when the frame arrived');

  console.log('4. The activity feed names the agent');
  const feed = await fetch(`${origin}/api/activity?projectId=${PROJECT}&limit=1`, {
    headers: { 'x-prototype-user': PERSONA },
  }).then((answer) => answer.json());
  check(feed[0]?.actor === 'agent', 'the newest entry is an agent action');
  check(feed[0]?.actorName === CONNECTION_NAME, `it names the connection: ${feed[0]?.actorName}`);
  check(feed[0]?.action === 'task.completed', 'and it is the completion the frame announced');

  console.log('\nlive-acceptance: §62 satisfied over Streamable HTTP.');
} finally {
  if (client !== undefined) await client.close().catch(() => undefined);
  if (host !== undefined) await stopHost(host);
  await rm(root, { recursive: true, force: true });
}
