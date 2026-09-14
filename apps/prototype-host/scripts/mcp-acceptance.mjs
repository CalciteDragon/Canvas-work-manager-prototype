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
const assertClient = async (client, title, dataFile) => {
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
  return { task, reflectionId: reflection.structuredContent?.id, ...undo };
};

/**
 * Slice 30: remove_section returns a receipt; undo_operation restores the section between the
 * same neighbours with its cascaded tasks live again; a repeat is refused with its reason token.
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

  const removed = await client.callTool({ name: 'remove_section', arguments: { sectionId: UNDO_SECTION, policy: 'cascade' } });
  check(removed.isError !== true && typeof removed.structuredContent?.undo?.undoId === 'string', `${title} remove_section returns a receipt`);
  check((await liveTasks()).length === 0, `${title} cascade archived the tasks`);
  const { undoId } = removed.structuredContent.undo;

  const undone = await client.callTool({ name: 'undo_operation', arguments: { undoId } });
  check(undone.isError !== true && undone.structuredContent?.outcome === 'restored', `${title} undo_operation restores`);
  check(JSON.stringify(await canvas()) === JSON.stringify(before), `${title} the list is back between the same neighbours`);
  check(JSON.stringify(await liveTasks()) === JSON.stringify(tasksBefore), `${title} its tasks are live again`);

  const repeated = await client.callTool({ name: 'undo_operation', arguments: { undoId } });
  check(
    repeated.isError === true && repeated.content?.some(({ text }) => typeof text === 'string' && text.startsWith('undo_consumed:')),
    `${title} a repeat is refused with undo_consumed:`,
  );

  const created = await client.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type: 'progress' } });
  check(created.isError !== true && typeof created.structuredContent?.id === 'string', `${title} creates a disposable view`);
  const disposableSectionId = created.structuredContent.id;
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

try {
  await Promise.all([copyFile(seedPath, httpFile), copyFile(seedPath, stdioFile)]);
  // The token's connection lacks projects.write in the seed, and section removal needs it. Granted
  // in the copied temp files only; the committed seed is unchanged.
  for (const file of [httpFile, stdioFile]) {
    const document = JSON.parse(await readFile(file, 'utf8'));
    const connection = document.agentConnections.find(({ id }) => id === 'agent-claude');
    connection.permissions = [...new Set([...connection.permissions, 'projects.write'])];
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
  const httpResult = await assertClient(httpClient, 'HTTP', httpFile);
  await httpClient.close();
  httpClient = undefined;
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
  const stdioResult = await assertClient(stdioClient, 'stdio', stdioFile);
  await stdioClient.close();
  stdioClient = undefined;
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
  if (host !== undefined) await stopHost(host);
  await rm(root, { recursive: true, force: true });
}
