/** Slice 15's two-transport acceptance check (§49, §50, §59). */
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { SPEC_TOOL_NAMES } from '@cwm/mcp-tools';

const here = dirname(fileURLToPath(import.meta.url));
const hostRoot = join(here, '..');
const workspaceRoot = join(hostRoot, '..', '..');
const seedPath = join(hostRoot, '..', '..', 'prototype', 'seeds', 'agent-heavy.json');
const TOKEN = 'prototype-user-a-readwrite';
/** A second connection of the same persona: the foreign actor, and the one Slice 33 revokes. */
const FOREIGN_TOKEN = 'prototype-user-a-readonly';
const PROJECT = 'project-work-manager';
/** The middle of the seed's three Home placements: a task list with live tasks (Slice 30). */
const UNDO_SECTION = 'section-project-work-manager-tasks';

const check = (condition, description) => {
  if (!condition) throw new Error(`FAILED: ${description}`);
  console.log(`  ok  ${description}`);
};

const modernClient = (name) =>
  new Client(
    { name, version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );

// Slice 15's two-transport acceptance check, extended by Slice 25.7 (§36) with a
// subject-linked journal write and Slice 31 with disposable removal, receipt recovery
// and persisted Undo through both transports.
const assertClient = async (client, title, dataFile, foreign, access) => {
  check(client.getProtocolEra() === 'modern', `${title} negotiated 2026-07-28`);
  const listed = await client.listTools();
  check(
    JSON.stringify(listed.tools.map(({ name }) => name)) === JSON.stringify(SPEC_TOOL_NAMES),
    `${title} lists the exact registry`,
  );
  const result = await client.callTool({
    name: 'create_task',
    arguments: { projectId: PROJECT, title: `Created over ${title}` },
  });
  check(result.isError !== true, `${title} creates a task`);
  const task = result.structuredContent;
  const archive = await client.callTool({
    name: 'get_project_archive',
    arguments: { projectId: PROJECT },
  });
  check(archive.isError !== true && Array.isArray(archive.structuredContent?.items), `${title} reads the Archive projection`);
  const archived = await client.callTool({ name: 'archive_task', arguments: { taskId: task.id } });
  check(archived.isError !== true, `${title} archives a task through the canonical tool`);
  const restored = await client.callTool({ name: 'restore_task', arguments: { taskId: task.id } });
  check(restored.isError !== true, `${title} restores a task through the canonical tool`);
  const reflection = await client.callTool({
    name: 'add_reflection',
    arguments: {
      projectId: PROJECT,
      body: `What changed over ${title}`,
      subject: { kind: 'task', id: 'task-agent-deployment' },
    },
  });
  check(reflection.isError !== true, `${title} adds a subject-linked reflection`);
  check(
    reflection.structuredContent?.subject?.id === 'task-agent-deployment' &&
      reflection.structuredContent?.subject?.name === undefined,
    `${title} returns the stored subject as ids only`,
  );
  const journal = await client.callTool({
    name: 'get_project_journal',
    arguments: { projectId: PROJECT },
  });
  check(
    journal.isError !== true &&
      journal.structuredContent?.items?.some(({ reflection: item }) => item.id === reflection.structuredContent?.id),
    `${title} reads the linked reflection from the journal`,
  );
  const undo = await assertUndo(client, title, dataFile);
  await assertRecoveryAndGrants(client, foreign, title, dataFile, access);
  return { task, reflectionId: reflection.structuredContent?.id, ...undo };
};

/**
 * Slice 32: section writes return typed receipts; undo_operation restores a move/update or
 * reverses a removal between the same neighbours with its cascaded tasks live again.
 */
const assertUndo = async (client, title, dataFile) => {
  const canvas = async () => {
    const listed = await client.callTool({ name: 'list_sections', arguments: { projectId: PROJECT } });
    return JSON.parse(listed.content[0].text).map(({ id }) => id);
  };
  const liveTasks = async () => {
    const listed = await client.callTool({ name: 'list_tasks', arguments: { projectId: PROJECT } });
    return JSON.parse(listed.content[0].text).filter(({ sectionId }) => sectionId === UNDO_SECTION).map(({ id }) => id).sort();
  };
  const before = await canvas();
  const tasksBefore = await liveTasks();
  const index = before.indexOf(UNDO_SECTION);
  // The seed places it second of three; add_reflection above may have appended a container since.
  check(index > 0 && index < before.length - 1, `${title} sees the task list between two neighbours`);
  check(tasksBefore.length > 0, `${title} sees live tasks in it`);

  const added = await client.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type: 'progress', title: `Added over ${title}` } });
  check(added.isError !== true && added.structuredContent?.undo?.operation === 'section.add', `${title} create_section returns an add receipt`);
  const addedId = added.structuredContent.section.id;
  const undoneAdd = await client.callTool({ name: 'undo_operation', arguments: { undoId: added.structuredContent.undo.undoId } });
  check(undoneAdd.isError !== true && undoneAdd.structuredContent?.operation === 'section.add', `${title} Undo removes an added section`);
  check(!(await canvas()).includes(addedId), `${title} the added section is gone after Undo`);

  const editable = await client.callTool({
    name: 'create_section',
    arguments: { projectId: PROJECT, type: 'rich-text', title: `Original ${title}`, config: { text: 'Before' } },
  });
  check(editable.isError !== true && typeof editable.structuredContent?.section?.id === 'string', `${title} creates an editable section`);
  const editableId = editable.structuredContent.section.id;
  const changed = await client.callTool({
    name: 'update_section',
    arguments: { sectionId: editableId, title: `Changed ${title}`, config: { text: 'After' }, collapsed: true },
  });
  check(changed.isError !== true && changed.structuredContent?.undo?.operation === 'section.update', `${title} update_section returns one update receipt`);
  const noOp = await client.callTool({ name: 'update_section', arguments: { sectionId: editableId, title: `Changed ${title}` } });
  check(noOp.isError !== true && noOp.structuredContent?.undo === null, `${title} an unchanged update returns undo: null`);
  const undoneUpdate = await client.callTool({ name: 'undo_operation', arguments: { undoId: changed.structuredContent.undo.undoId } });
  check(
    undoneUpdate.isError !== true &&
      undoneUpdate.structuredContent?.operation === 'section.update' &&
      undoneUpdate.structuredContent?.section?.title === `Original ${title}`,
    `${title} Undo restores only the edited fields`,
  );

  const moved = await client.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type: 'timeline', title: `Moved ${title}` } });
  check(moved.isError !== true && typeof moved.structuredContent?.section?.id === 'string', `${title} creates a move target`);
  const movedId = moved.structuredContent.section.id;
  const beforeMove = await canvas();
  const move = await client.callTool({ name: 'move_section', arguments: { sectionId: movedId, position: 0 } });
  check(move.isError !== true && move.structuredContent?.undo?.operation === 'section.move', `${title} move_section returns a move receipt`);
  const undoneMove = await client.callTool({ name: 'undo_operation', arguments: { undoId: move.structuredContent.undo.undoId } });
  check(undoneMove.isError !== true && JSON.stringify(await canvas()) === JSON.stringify(beforeMove), `${title} Undo restores combined section order`);

  // The edit journeys above leave two sections behind, so compare removal against this order.
  const beforeRemoval = await canvas();
  const removed = await client.callTool({ name: 'remove_section', arguments: { sectionId: UNDO_SECTION, policy: 'cascade' } });
  check(removed.isError !== true && typeof removed.structuredContent?.undo?.undoId === 'string', `${title} remove_section returns a receipt`);
  check((await liveTasks()).length === 0, `${title} cascade archived the tasks`);
  const { undoId } = removed.structuredContent.undo;

  const undone = await client.callTool({ name: 'undo_operation', arguments: { undoId } });
  check(undone.isError !== true && undone.structuredContent?.outcome === 'restored', `${title} undo_operation restores`);
  check(JSON.stringify(await canvas()) === JSON.stringify(beforeRemoval), `${title} the list is back between the same neighbours`);
  check(JSON.stringify(await liveTasks()) === JSON.stringify(tasksBefore), `${title} its tasks are live again`);

  const repeated = await client.callTool({ name: 'undo_operation', arguments: { undoId } });
  check(
    repeated.isError === true && repeated.content?.some(({ text }) => typeof text === 'string' && text.startsWith('undo_consumed:')),
    `${title} a repeat is refused with undo_consumed:`,
  );

  const created = await client.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type: 'progress' } });
  check(created.isError !== true && typeof created.structuredContent?.section?.id === 'string', `${title} creates a disposable view`);
  const disposableSectionId = created.structuredContent.section.id;
  const hardRemoved = await client.callTool({ name: 'remove_section', arguments: { sectionId: disposableSectionId } });
  check(hardRemoved.isError !== true, `${title} hard-removes the disposable view`);
  const recoveredReceipt = hardRemoved.structuredContent.undo;
  check(typeof recoveredReceipt?.undoId === 'string', `${title} removal returns an Undo receipt`);
  check(!(await canvas()).includes(disposableSectionId), `${title} the deleted view leaves list_sections`);
  const afterDelete = await readFile(dataFile, 'utf8');
  check(!JSON.parse(afterDelete).sections.some(({ id }) => id === disposableSectionId), `${title} hard deletion is persisted`);

  const lostReceipt = await client.callTool({ name: 'remove_section', arguments: { sectionId: disposableSectionId } });
  const lostReceiptText = lostReceipt.content?.find(({ type }) => type === 'text')?.text ?? '';
  check(lostReceipt.isError === true && lostReceiptText.startsWith('section_already_removed:'), `${title} repeat removal stays a refusal`);
  check(lostReceiptText.includes(recoveredReceipt.undoId) && lostReceiptText.includes(recoveredReceipt.expiresAt), `${title} refusal recovers undoId and expiresAt`);
  check((await readFile(dataFile, 'utf8')) === afterDelete, `${title} receipt recovery writes no second activity or inverse`);

  const restoredDeleted = await client.callTool({ name: 'undo_operation', arguments: { undoId: recoveredReceipt.undoId } });
  check(restoredDeleted.isError !== true && restoredDeleted.structuredContent?.section?.id === disposableSectionId, `${title} recovered receipt recreates the deleted view`);
  check((await canvas()).includes(disposableSectionId), `${title} the recreated view is listed again`);
  return { undoId, disposableSectionId, recoveredUndoId: recoveredReceipt.undoId };
};

/**
 * Slice 33 (Refactor §26.3–4, §26.6, §26.9): exact ids through reassign and cascade, the Archive
 * projection, and refusals for a foreign actor, a removed grant and a revoked connection.
 * `access` changes grants the way that transport's file is really changed: REST for the running
 * HTTP host, a direct edit between completed calls for stdio (which reloads on every call).
 */
const textOf = (result) => result.content?.find(({ type }) => type === 'text')?.text ?? '';

/** Every collection a refused Undo must leave alone; agent connections carry `lastUsedAt` and are excluded. */
const businessState = async (dataFile) => {
  const { sections, sectionShortcuts, tasks, reflections, activityEvents, undoRecords } = JSON.parse(await readFile(dataFile, 'utf8'));
  return JSON.stringify({ sections, sectionShortcuts, tasks, reflections, activityEvents, undoRecords });
};

/** A refusal may arrive as an error result or, for a rejected credential, as a thrown transport error. */
const refusedText = async (call) => {
  try {
    const result = await call();
    return result.isError === true ? textOf(result) : null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const assertRecoveryAndGrants = async (client, foreign, title, dataFile, access) => {
  const tasksIn = async (sectionId) => {
    const listed = await client.callTool({ name: 'list_tasks', arguments: { projectId: PROJECT } });
    return JSON.parse(listed.content[0].text).filter((task) => task.sectionId === sectionId).map(({ id }) => id).sort();
  };
  const archivedSectionIds = async () => {
    const archive = await client.callTool({ name: 'get_project_archive', arguments: { projectId: PROJECT } });
    return archive.structuredContent.items.filter(({ kind }) => kind === 'section').map(({ section }) => section.id);
  };
  const recordOf = async (undoId) => JSON.parse(await readFile(dataFile, 'utf8')).undoRecords.find(({ id }) => id === undoId);

  // Reassign: every row id moves to the target and back; the emptied source never reaches Archive.
  const original = await tasksIn(UNDO_SECTION);
  check(original.length > 0, `${title} recovery starts from live rows in ${UNDO_SECTION}`);
  const target = await client.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type: 'task-list', title: `Reassign target ${title}` } });
  const targetId = target.structuredContent.section.id;
  const reassigned = await client.callTool({
    name: 'remove_section',
    arguments: { sectionId: UNDO_SECTION, policy: 'reassign', reassignToSectionId: targetId },
  });
  check(reassigned.isError !== true, `${title} reassign removal succeeds`);
  check(JSON.stringify(await tasksIn(targetId)) === JSON.stringify(original), `${title} reassign moves exactly the original row ids`);
  check(!(await archivedSectionIds()).includes(UNDO_SECTION), `${title} the emptied reassign source stays out of Archive`);
  const undoneReassign = await client.callTool({ name: 'undo_operation', arguments: { undoId: reassigned.structuredContent.undo.undoId } });
  check(undoneReassign.isError !== true, `${title} reassign Undo succeeds`);
  check(
    JSON.stringify(await tasksIn(UNDO_SECTION)) === JSON.stringify(original) && (await tasksIn(targetId)).length === 0,
    `HTTP/stdio recovery preserves exact row and source IDs (${title}, reassign)`,
  );

  // Cascade: retained under its own id and projected by Archive while removed.
  const cascade = await client.callTool({ name: 'remove_section', arguments: { sectionId: UNDO_SECTION, policy: 'cascade' } });
  check(cascade.isError !== true && cascade.structuredContent.section.id === UNDO_SECTION, `${title} cascade removal keeps the section id`);
  check((await archivedSectionIds()).includes(UNDO_SECTION), `${title} get_project_archive projects the cascaded list`);
  const receipt = cascade.structuredContent.undo;

  const foreignText = await refusedText(() => foreign.callTool({ name: 'undo_operation', arguments: { undoId: receipt.undoId } }));
  check(foreignText !== null && foreignText.includes('was not found'), `${title} another connection gets not-found for the receipt`);
  check((await recordOf(receipt.undoId))?.consumedAt === undefined, `${title} the foreign attempt leaves the receipt unconsumed`);

  await access.setPermissions('agent-claude', ['projects.read', 'tasks.read', 'tasks.write', 'reflections.read', 'reflections.write', 'workspace.read']);
  const withoutGrant = await businessState(dataFile);
  const grantText = await refusedText(() => client.callTool({ name: 'undo_operation', arguments: { undoId: receipt.undoId } }));
  check(grantText !== null && grantText.includes('projects.write'), `${title} Undo names the missing projects.write grant`);
  check((await businessState(dataFile)) === withoutGrant, `HTTP/stdio current grant removal refuses issued receipt (${title})`);
  await access.setPermissions('agent-claude', ['projects.read', 'projects.write', 'tasks.read', 'tasks.write', 'reflections.read', 'reflections.write', 'workspace.read']);
  const regranted = await client.callTool({ name: 'undo_operation', arguments: { undoId: receipt.undoId } });
  check(
    regranted.isError !== true && JSON.stringify(await tasksIn(UNDO_SECTION)) === JSON.stringify(original),
    `${title} the same receipt works once the grant is back, with every row id live`,
  );

  // Revocation, on the second connection so the primary token still serves the restart checks.
  const foreignReceipt = await foreign.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type: 'progress', title: `Revoked ${title}` } });
  check(foreignReceipt.isError !== true && foreignReceipt.structuredContent.undo.operation === 'section.add', `${title} the second connection holds its own add receipt`);
  await access.revoke('agent-cursor');
  const revokedState = await businessState(dataFile);
  const revokedText = await refusedText(() => foreign.callTool({ name: 'undo_operation', arguments: { undoId: foreignReceipt.structuredContent.undo.undoId } }));
  check(revokedText !== null, `${title} a revoked connection cannot use its receipt`);
  check((await businessState(dataFile)) === revokedState, `HTTP/stdio revoked connection refuses issued receipt (${title})`);
  check(
    JSON.parse(await readFile(dataFile, 'utf8')).sections.some(({ id }) => id === foreignReceipt.structuredContent.section.id),
    `${title} the revoked connection's section is still there — nothing was lost`,
  );
};

const httpAccess = (baseUrl) => {
  const call = async (method, path, body) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-prototype-user': 'user-demo' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}`);
  };
  return {
    setPermissions: (id, permissions) => call('PATCH', `/api/agent-connections/${id}`, { permissions }),
    revoke: (id) => call('POST', `/api/agent-connections/${id}/revoke`),
  };
};

const fileAccess = (dataFile) => {
  const edit = async (id, change) => {
    const document = JSON.parse(await readFile(dataFile, 'utf8'));
    change(document.agentConnections.find((connection) => connection.id === id));
    await writeFile(dataFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  };
  return {
    setPermissions: (id, permissions) => edit(id, (connection) => { connection.permissions = permissions; }),
    revoke: (id) => edit(id, (connection) => { connection.revoked = true; }),
  };
};

const assertPersisted = async (path, result, title) => {
  const document = JSON.parse(await readFile(path, 'utf8'));
  check(
    document.tasks.some(({ id, title: taskTitle }) => id === result.task.id && taskTitle === result.task.title),
    `${title} task is present in data.json`,
  );
  check(
    document.reflections.some(({ id, subject }) => id === result.reflectionId && subject?.id === 'task-agent-deployment'),
    `${title} subject-linked reflection is present in data.json`,
  );
  check(
    document.sections.some(({ id, archivedAt }) => id === UNDO_SECTION && archivedAt === undefined),
    `${title} undone section is live in data.json`,
  );
  check(
    document.undoRecords.some(({ id, consumedAt }) => id === result.undoId && typeof consumedAt === 'string'),
    `${title} Undo record is consumed in data.json`,
  );
  check(
    document.sections.some(({ id, archivedAt }) => id === result.disposableSectionId && archivedAt === undefined),
    `${title} hard-deleted section is recreated in data.json`,
  );
  check(
    document.undoRecords.some(({ id, consumedAt }) => id === result.recoveredUndoId && typeof consumedAt === 'string'),
    `${title} recovered hard-deletion receipt is consumed in data.json`,
  );
};

const assertJournalAfterRestart = async (client, result, title) => {
  const journal = await client.callTool({ name: 'get_project_journal', arguments: { projectId: PROJECT } });
  check(
    journal.isError !== true &&
      journal.structuredContent?.items?.some(({ reflection }) => reflection.id === result.reflectionId),
    `${title} re-reads the linked reflection after restart`,
  );
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
      void stopHost(child).then(
        () => reject(new Error('host did not start within 20s')),
        reject,
      );
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
      resolve({ child, url: `http://127.0.0.1:${matched[1]}/mcp` });
    };
    child.stdout.on('data', onData);
  });
};

const root = await mkdtemp(join(tmpdir(), 'cwm-mcp-acceptance-'));
const httpFile = join(root, 'http.json');
const stdioFile = join(root, 'stdio.json');
let host;
let httpClient;
let stdioClient;
let foreignClient;

try {
  await Promise.all([copyFile(seedPath, httpFile), copyFile(seedPath, stdioFile)]);
  // The token's connection lacks projects.write in the seed, and section removal needs it. Granted
  // in the copied temp files only; the committed seed is unchanged.
  for (const file of [httpFile, stdioFile]) {
    const document = JSON.parse(await readFile(file, 'utf8'));
    for (const id of ['agent-claude', 'agent-cursor']) {
      const connection = document.agentConnections.find((candidate) => candidate.id === id);
      connection.permissions = [...new Set([...connection.permissions, 'projects.write'])];
    }
    await writeFile(file, `${JSON.stringify(document, null, 2)}
`, 'utf8');
  }

  console.log('1. Streamable HTTP');
  const started = await startHost(httpFile);
  host = started.child;
  httpClient = modernClient('slice-15-http-acceptance');
  await httpClient.connect(
    new StreamableHTTPClientTransport(new globalThis.URL(started.url), {
      authProvider: { token: async () => TOKEN },
    }),
  );
  foreignClient = modernClient('slice-33-http-foreign');
  await foreignClient.connect(
    new StreamableHTTPClientTransport(new globalThis.URL(started.url), {
      authProvider: { token: async () => FOREIGN_TOKEN },
    }),
  );
  const httpResult = await assertClient(httpClient, 'HTTP', httpFile, foreignClient, httpAccess(started.url.replace(/\/mcp$/, '')));
  await httpClient.close();
  httpClient = undefined;
  // Its token was revoked above; closing may still need the session it opened.
  await foreignClient.close().catch(() => undefined);
  foreignClient = undefined;
  await stopHost(host);
  host = undefined;
  await assertPersisted(httpFile, httpResult, 'HTTP');

  const restarted = await startHost(httpFile);
  host = restarted.child;
  httpClient = modernClient('slice-15-http-acceptance-restart');
  await httpClient.connect(
    new StreamableHTTPClientTransport(new globalThis.URL(restarted.url), {
      authProvider: { token: async () => TOKEN },
    }),
  );
  await assertJournalAfterRestart(httpClient, httpResult, 'HTTP');
  await httpClient.close();
  httpClient = undefined;
  await stopHost(host);
  host = undefined;

  console.log('\n2. stdio');
  stdioClient = modernClient('slice-15-stdio-acceptance');
  await stdioClient.connect(
    new StdioClientTransport({
      command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      args: ['--silent', '--dir', workspaceRoot, 'mcp:stdio'],
      cwd: workspaceRoot,
      env: { ...getDefaultEnvironment(), CWM_DATA_FILE: stdioFile, CWM_MCP_TOKEN: TOKEN },
      stderr: 'inherit',
    }),
  );
  foreignClient = modernClient('slice-33-stdio-foreign');
  await foreignClient.connect(
    new StdioClientTransport({
      command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      args: ['--silent', '--dir', workspaceRoot, 'mcp:stdio'],
      cwd: workspaceRoot,
      env: { ...getDefaultEnvironment(), CWM_DATA_FILE: stdioFile, CWM_MCP_TOKEN: FOREIGN_TOKEN },
      stderr: 'inherit',
    }),
  );
  // Two stdio children share one file, but every call below is awaited before the next begins.
  const stdioResult = await assertClient(stdioClient, 'stdio', stdioFile, foreignClient, fileAccess(stdioFile));
  await stdioClient.close();
  stdioClient = undefined;
  await foreignClient.close();
  foreignClient = undefined;
  await assertPersisted(stdioFile, stdioResult, 'stdio');

  stdioClient = modernClient('slice-15-stdio-acceptance-restart');
  await stdioClient.connect(
    new StdioClientTransport({
      command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      args: ['--silent', '--dir', workspaceRoot, 'mcp:stdio'],
      cwd: workspaceRoot,
      env: { ...getDefaultEnvironment(), CWM_DATA_FILE: stdioFile, CWM_MCP_TOKEN: TOKEN },
      stderr: 'inherit',
    }),
  );
  await assertJournalAfterRestart(stdioClient, stdioResult, 'stdio');
  await stdioClient.close();
  stdioClient = undefined;

  console.log('\nMCP acceptance: both transports passed');
} catch (error) {
  console.error(`\nMCP acceptance: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (httpClient !== undefined) await httpClient.close();
  if (stdioClient !== undefined) await stdioClient.close();
  if (foreignClient !== undefined) await foreignClient.close().catch(() => undefined);
  if (host !== undefined) await stopHost(host);
  await rm(root, { recursive: true, force: true });
}
