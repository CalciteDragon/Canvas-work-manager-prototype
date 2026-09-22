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
// subject-linked journal write, Slice 31 with disposable removal, receipt recovery and
// persisted Undo, Slice 35 with Redo, the history summary and the sequential chain through
// both transports, and Slice 38 with the optional-page toggle: a first enable undone to an
// absent record, redone under the same id, and the boolean reversed both ways.
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
  const task = result.structuredContent.task;
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
    reflection.structuredContent?.reflection?.subject?.id === 'task-agent-deployment' &&
      reflection.structuredContent?.reflection?.subject?.name === undefined,
    `${title} returns the stored subject as ids only`,
  );
  const journal = await client.callTool({
    name: 'get_project_journal',
    arguments: { projectId: PROJECT },
  });
  check(
    journal.isError !== true &&
      journal.structuredContent?.items?.some(({ reflection: item }) => item.id === reflection.structuredContent?.reflection?.id),
    `${title} reads the linked reflection from the journal`,
  );
  const undo = await assertUndo(client, title, dataFile);
  await assertRestoreAndShortcuts(client, title);
  const foreignPageReceipt = await assertPageHistory(client, foreign, title, dataFile, access);
  await assertRecoveryAndGrants(client, foreign, title, dataFile, access);
  // After the block above revoked the second connection, which is what makes this a revocation.
  await assertRevokedPageReceipt(foreign, foreignPageReceipt, title, dataFile);
  return { task, reflectionId: reflection.structuredContent?.reflection?.id, ...undo };
};

/** The operation receipt a section tool answered with. */
const receiptOf = (result) => result.structuredContent?.operation;

/** This connection's own history summary for the project. */
const historyOf = async (client) => {
  const read = await client.callTool({ name: 'get_operation_history', arguments: { projectId: PROJECT } });
  check(read.isError !== true, 'get_operation_history answers');
  return read.structuredContent;
};

/** Undo or Redo exactly `receipt`'s action at the history's current revision, the way an agent that re-reads would. */
const stepReceipt = async (client, receipt, direction = 'undo') => {
  const summary = await historyOf(client);
  return client.callTool({
    name: `${direction}_operation`,
    arguments: { historyId: receipt.historyId, actionId: receipt.actionId, expectedRevision: summary.revision },
  });
};

/**
 * Slices 32 and 35: section writes return operation receipts; undo_operation restores an add, a
 * move, an update or a removal between the same neighbours with its cascaded tasks live again, and
 * redo_operation reapplies — the A → B → Undo → Undo → Redo → Redo chain included.
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
  check(added.isError !== true && receiptOf(added)?.operation === 'section.add', `${title} create_section returns an add receipt`);
  const addedId = added.structuredContent.section.id;
  const undoneAdd = await stepReceipt(client, receiptOf(added));
  check(undoneAdd.isError !== true && undoneAdd.structuredContent?.result?.operation === 'section.add', `${title} Undo removes an added section`);
  check(!(await canvas()).includes(addedId), `${title} the added section is gone after Undo`);
  const redoneAdd = await stepReceipt(client, receiptOf(added), 'redo');
  check(redoneAdd.isError !== true && (await canvas()).includes(addedId), `${title} Redo brings the added section back under the same id`);

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
  check(changed.isError !== true && receiptOf(changed)?.operation === 'section.update', `${title} update_section returns one update receipt`);
  const noOp = await client.callTool({ name: 'update_section', arguments: { sectionId: editableId, title: `Changed ${title}` } });
  check(noOp.isError !== true && noOp.structuredContent?.operation === null, `${title} an unchanged update returns operation: null`);
  const undoneUpdate = await stepReceipt(client, receiptOf(changed));
  check(
    undoneUpdate.isError !== true &&
      undoneUpdate.structuredContent?.result?.operation === 'section.update' &&
      undoneUpdate.structuredContent?.result?.section?.title === `Original ${title}`,
    `${title} Undo restores only the edited fields`,
  );

  // Slice 35's gate over this transport: two writes to the same field, then both undone and redone in order.
  const titleOf = async () => {
    const listed = await client.callTool({ name: 'list_sections', arguments: { projectId: PROJECT } });
    return JSON.parse(listed.content[0].text).find(({ id }) => id === editableId)?.title;
  };
  const a = receiptOf(await client.callTool({ name: 'update_section', arguments: { sectionId: editableId, title: `A ${title}` } }));
  const b = receiptOf(await client.callTool({ name: 'update_section', arguments: { sectionId: editableId, title: `B ${title}` } }));
  const older = await client.callTool({ name: 'undo_operation', arguments: { historyId: a.historyId, actionId: a.actionId, expectedRevision: b.revision } });
  check(older.isError === true && textOf(older).startsWith('history_not_next:'), `${title} undoing A before B is refused with history_not_next:`);
  for (const [receipt, direction, expected] of [[b, 'undo', `A ${title}`], [a, 'undo', `Original ${title}`], [a, 'redo', `A ${title}`], [b, 'redo', `B ${title}`]]) {
    const summary = await historyOf(client);
    check(summary[direction]?.actionId === receipt.actionId, `${title} get_operation_history names the expected next ${direction}`);
    const stepped = await client.callTool({
      name: `${direction}_operation`,
      arguments: { historyId: summary.historyId, actionId: summary[direction].actionId, expectedRevision: summary.revision },
    });
    check(stepped.isError !== true && stepped.structuredContent?.summary?.revision === summary.revision + 1, `${title} ${direction}_operation advances the revision`);
    check((await titleOf()) === expected, `${title} the title is "${expected}" after ${direction}`);
  }
  check((await historyOf(client)).redo === null, `${title} nothing is left to redo at the top of the stack`);

  const moved = await client.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type: 'timeline', title: `Moved ${title}` } });
  check(moved.isError !== true && typeof moved.structuredContent?.section?.id === 'string', `${title} creates a move target`);
  const movedId = moved.structuredContent.section.id;
  const beforeMove = await canvas();
  const move = await client.callTool({ name: 'move_section', arguments: { sectionId: movedId, position: 0 } });
  check(move.isError !== true && receiptOf(move)?.operation === 'section.move', `${title} move_section returns a move receipt`);
  const undoneMove = await stepReceipt(client, receiptOf(move));
  check(undoneMove.isError !== true && JSON.stringify(await canvas()) === JSON.stringify(beforeMove), `${title} Undo restores combined section order`);

  // The edit journeys above leave sections behind, so compare removal against this order.
  const beforeRemoval = await canvas();
  const removed = await client.callTool({ name: 'remove_section', arguments: { sectionId: UNDO_SECTION, policy: 'cascade' } });
  const removal = receiptOf(removed);
  check(removed.isError !== true && typeof removal?.actionId === 'string', `${title} remove_section returns a receipt`);
  check((await liveTasks()).length === 0, `${title} cascade archived the tasks`);

  const removalArgs = { historyId: removal.historyId, actionId: removal.actionId, expectedRevision: removal.revision };
  const undone = await client.callTool({ name: 'undo_operation', arguments: removalArgs });
  check(undone.isError !== true && undone.structuredContent?.result?.outcome === 'restored', `${title} undo_operation restores`);
  check(JSON.stringify(await canvas()) === JSON.stringify(beforeRemoval), `${title} the list is back between the same neighbours`);
  check(JSON.stringify(await liveTasks()) === JSON.stringify(tasksBefore), `${title} its tasks are live again`);

  const afterUndo = await readFile(dataFile, 'utf8');
  const repeated = await client.callTool({ name: 'undo_operation', arguments: removalArgs });
  check(repeated.isError === true && textOf(repeated).startsWith('history_revision_stale:'), `${title} a replayed Undo is refused with history_revision_stale:`);
  check(
    JSON.stringify(JSON.parse(await readFile(dataFile, 'utf8')).activityEvents) === JSON.stringify(JSON.parse(afterUndo).activityEvents),
    `${title} the replay executed nothing a second time`,
  );

  const created = await client.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type: 'progress' } });
  check(created.isError !== true && typeof created.structuredContent?.section?.id === 'string', `${title} creates a disposable view`);
  const disposableSectionId = created.structuredContent.section.id;
  const hardRemoved = await client.callTool({ name: 'remove_section', arguments: { sectionId: disposableSectionId } });
  check(hardRemoved.isError !== true, `${title} hard-removes the disposable view`);
  const recoveredReceipt = receiptOf(hardRemoved);
  check(typeof recoveredReceipt?.actionId === 'string', `${title} removal returns an operation receipt`);
  check(!(await canvas()).includes(disposableSectionId), `${title} the deleted view leaves list_sections`);
  const afterDelete = await readFile(dataFile, 'utf8');
  check(!JSON.parse(afterDelete).sections.some(({ id }) => id === disposableSectionId), `${title} hard deletion is persisted`);

  const lostReceipt = await client.callTool({ name: 'remove_section', arguments: { sectionId: disposableSectionId } });
  const lostReceiptText = textOf(lostReceipt);
  check(lostReceipt.isError === true && lostReceiptText.startsWith('section_already_removed:'), `${title} repeat removal stays a refusal`);
  check(
    lostReceiptText.includes(recoveredReceipt.historyId) && lostReceiptText.includes(recoveredReceipt.actionId) && lostReceiptText.includes(recoveredReceipt.expiresAt),
    `${title} refusal recovers historyId, actionId and expiresAt`,
  );
  check((await readFile(dataFile, 'utf8')) === afterDelete, `${title} receipt recovery writes no second activity or action`);

  const restoredDeleted = await stepReceipt(client, recoveredReceipt);
  check(restoredDeleted.isError !== true && restoredDeleted.structuredContent?.result?.section?.id === disposableSectionId, `${title} recovered receipt recreates the deleted view`);
  check((await canvas()).includes(disposableSectionId), `${title} the recreated view is listed again`);
  return { actionId: removal.actionId, disposableSectionId, recoveredActionId: recoveredReceipt.actionId, historyId: removal.historyId };
};

/**
 * Slice 33 (Refactor §26.3–4, §26.6, §26.9): exact ids through reassign and cascade, the Archive
 * projection, and refusals for a foreign actor, a removed grant and a revoked connection.
 * `access` changes grants the way that transport's file is really changed: REST for the running
 * HTTP host, a direct edit between completed calls for stdio (which reloads on every call).
 */
const textOf = (result) => result.content?.find(({ type }) => type === 'text')?.text ?? '';

/** Every collection a refused transition must leave alone; agent connections carry `lastUsedAt` and are excluded. */
const businessState = async (dataFile) => {
  const { sections, sectionShortcuts, tasks, reflections, activityEvents, operationHistories, operationActions } = JSON.parse(await readFile(dataFile, 'utf8'));
  return JSON.stringify({ sections, sectionShortcuts, tasks, reflections, activityEvents, operationHistories, operationActions });
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

/**
 * Slice 37 over the real transports: `restore_section` now answers a receipt of its own, and the
 * two shortcut tools answer envelopes rather than a bare placement and `undefined`. Both families
 * step through `undo_operation` and `redo_operation` with only `projects.write` behind them.
 */
const assertRestoreAndShortcuts = async (client, title) => {
  const sectionIds = async () => {
    const listed = await client.callTool({ name: 'list_sections', arguments: { projectId: PROJECT } });
    return JSON.parse(listed.content[0].text).map(({ id }) => id);
  };

  // Prose with content is retained by removal, so there is a tombstone to restore.
  const prose = await client.callTool({
    name: 'create_section',
    arguments: { projectId: PROJECT, type: 'rich-text', title: `Restorable ${title}`, config: { text: 'Worth keeping' } },
  });
  const proseId = prose.structuredContent.section.id;
  const removedProse = await client.callTool({ name: 'remove_section', arguments: { sectionId: proseId } });
  check(removedProse.isError !== true && removedProse.structuredContent.archiveListed === true, `${title} the prose section is removed into Archive`);

  const restored = await client.callTool({ name: 'restore_section', arguments: { sectionId: proseId } });
  check(
    restored.isError !== true && receiptOf(restored)?.operation === 'section.restore' && restored.structuredContent.section.id === proseId,
    `${title} restore_section answers the section and a receipt of its own`,
  );
  const retried = await client.callTool({ name: 'restore_section', arguments: { sectionId: proseId } });
  check(retried.isError !== true && receiptOf(retried) === null, `${title} a repeat on a live section records nothing`);
  const undoneRestore = await stepReceipt(client, receiptOf(restored));
  check(undoneRestore.isError !== true && !(await sectionIds()).includes(proseId), `${title} Undo Restore returns it to Archive`);
  const redoneRestore = await stepReceipt(client, receiptOf(restored), 'redo');
  check(redoneRestore.isError !== true && (await sectionIds()).includes(proseId), `${title} Redo Restore brings it back`);

  // A placement needs a source elsewhere in the same root tree, so the chain makes one.
  const child = await client.callTool({
    name: 'create_project',
    arguments: { kind: 'subproject', parentProjectId: PROJECT, name: `Kitchen ${title}` },
  });
  check(child.isError !== true, `${title} creates a sub-project to reference`);
  const childId = child.structuredContent.id ?? JSON.parse(child.content[0].text).id;
  const source = await client.callTool({ name: 'create_section', arguments: { projectId: childId, type: 'task-list', title: 'Prep' } });
  const sourceId = source.structuredContent.section.id;

  const placements = async () => {
    const listed = await client.callTool({ name: 'list_section_shortcuts', arguments: { projectId: PROJECT } });
    return JSON.parse(listed.content[0].text);
  };
  const placed = await client.callTool({
    name: 'add_section_shortcut',
    arguments: { projectId: PROJECT, pageId: `page-${PROJECT}`, sourceSectionId: sourceId },
  });
  if (placed.isError === true) throw new Error(`add_section_shortcut failed: ${JSON.stringify(placed.content)}`);
  check(
    receiptOf(placed)?.operation === 'shortcut.add' && placed.structuredContent.shortcut.sourceSectionId === sourceId,
    `${title} add_section_shortcut answers the resolved placement and its receipt`,
  );
  const shortcutId = placed.structuredContent.shortcut.id;
  check((await placements()).some(({ id }) => id === shortcutId), `${title} the placement is on Home`);

  const removedShortcut = await client.callTool({ name: 'remove_section_shortcut', arguments: { shortcutId } });
  check(
    removedShortcut.isError !== true && removedShortcut.structuredContent.shortcutId === shortcutId &&
      receiptOf(removedShortcut)?.operation === 'shortcut.remove',
    `${title} remove_section_shortcut names what it deleted and the receipt that restores it`,
  );
  check((await placements()).length === 0, `${title} the placement is gone`);

  const undoneRemoval = await stepReceipt(client, receiptOf(removedShortcut));
  const back = await placements();
  check(
    undoneRemoval.isError !== true && back.length === 1 && back[0].id === shortcutId && back[0].sourceSectionId === sourceId,
    `${title} Undo restores the same placement id pointing at the same source`,
  );
  const sourceSections = JSON.parse(
    (await client.callTool({ name: 'list_sections', arguments: { projectId: childId } })).content[0].text,
  );
  check(
    sourceSections.some(({ id, archivedAt }) => id === sourceId && archivedAt === undefined),
    `${title} and the source section was never written`,
  );
  const redoneRemoval = await stepReceipt(client, receiptOf(removedShortcut), 'redo');
  check(redoneRemoval.isError !== true && (await placements()).length === 0, `${title} Redo removes it again`);

  // The cursor allows one order and only one: the removal first, then the add underneath it.
  const outOfOrder = await client.callTool({
    name: 'undo_operation',
    arguments: {
      historyId: receiptOf(placed).historyId,
      actionId: receiptOf(placed).actionId,
      expectedRevision: (await historyOf(client)).revision,
    },
  });
  check(
    outOfOrder.isError === true && textOf(outOfOrder).startsWith('history_not_next:'),
    `${title} the add cannot be undone while the removal sits above it`,
  );
  await stepReceipt(client, receiptOf(removedShortcut));
  const undoneAdd = await stepReceipt(client, receiptOf(placed));
  check(
    undoneAdd.isError !== true && (await placements()).length === 0,
    `${title} Undo steps back through the removal and then the add`,
  );
};

/**
 * Slice 38: the optional-page toggle through a real transport. A root created here is Home-only,
 * so its next enable is genuinely a **first** enable — the one write whose inverse deletes a
 * record. Undo takes the page away entirely, Redo brings the same id back, and the boolean steps
 * above it reverse without touching anything on the page.
 *
 * Returns the foreign connection's own page receipt, so the revocation block below can prove a
 * revoked connection cannot use it either.
 */
const assertPageHistory = async (client, foreign, title, dataFile, access) => {
  const created = await client.callTool({ name: 'create_project', arguments: { kind: 'root', name: `Page history ${title}` } });
  const rootId = created.structuredContent.id ?? JSON.parse(created.content[0].text).id;
  const pagesOf = async (as = client) => {
    const listed = await as.callTool({ name: 'list_project_pages', arguments: { projectId: rootId } });
    return JSON.parse(listed.content[0].text);
  };
  check((await pagesOf()).map(({ kind }) => kind).join(',') === 'home', `${title} a new root is Home-only`);

  // `stepReceipt` reads the seed project's history; these actions belong to the root made here.
  const step = async (receipt, direction = 'undo') => {
    const read = await client.callTool({ name: 'get_operation_history', arguments: { projectId: rootId } });
    check(read.isError !== true, `${title} get_operation_history answers for the new root`);
    return client.callTool({
      name: `${direction}_operation`,
      arguments: { historyId: receipt.historyId, actionId: receipt.actionId, expectedRevision: read.structuredContent.revision },
    });
  };

  const enabled = await client.callTool({
    name: 'set_project_page_enabled',
    arguments: { projectId: rootId, kind: 'reflections', enabled: true },
  });
  const page = enabled.structuredContent.page;
  const addReceipt = receiptOf(enabled);
  check(
    enabled.isError !== true && page.kind === 'reflections' && page.enabled === true && addReceipt.operation === 'page.add',
    `${title} the first enable answers the created page and a page.add receipt`,
  );
  check(
    JSON.stringify(Object.keys(addReceipt).sort()) ===
      JSON.stringify(['actionId', 'createdAt', 'expiresAt', 'historyId', 'label', 'operation', 'revision']),
    `${title} the page receipt carries no payload`,
  );
  const repeated = await client.callTool({
    name: 'set_project_page_enabled',
    arguments: { projectId: rootId, kind: 'reflections', enabled: true },
  });
  check(repeated.isError !== true && receiptOf(repeated) === null, `${title} a toggle already where it was asked answers a null receipt`);

  // Another connection cannot reach this history at all: a foreign id and an absent one are one answer.
  const beforeForeign = await businessState(dataFile);
  const foreignText = await refusedText(() => foreign.callTool({
    name: 'undo_operation',
    arguments: { historyId: addReceipt.historyId, actionId: addReceipt.actionId, expectedRevision: addReceipt.revision },
  }));
  check(foreignText !== null && foreignText.includes('was not found'), `${title} another connection gets not-found for the page history`);
  check((await businessState(dataFile)) === beforeForeign, `${title} the foreign page refusal changes nothing on disk`);

  const undoneAdd = await step(addReceipt);
  check(
    undoneAdd.isError !== true && undoneAdd.structuredContent.result.outcome === 'removed' &&
      !(await pagesOf()).some(({ id }) => id === page.id),
    `${title} Undo of the first enable leaves no page record`,
  );
  const redoneAdd = await step(addReceipt, 'redo');
  check(
    redoneAdd.isError !== true && redoneAdd.structuredContent.result.page.id === page.id &&
      redoneAdd.structuredContent.result.page.createdAt === page.createdAt,
    `${title} Redo recreates the page under the same id and createdAt`,
  );

  const off = await client.callTool({
    name: 'set_project_page_enabled',
    arguments: { projectId: rootId, kind: 'reflections', enabled: false },
  });
  const toggleReceipt = receiptOf(off);
  check(toggleReceipt.operation === 'page.update', `${title} a later toggle records page.update`);
  const enabledOf = async () => (await pagesOf()).find(({ id }) => id === page.id)?.enabled;
  check((await enabledOf()) === false, `${title} the page is disabled, and still stored`);
  check((await step(toggleReceipt)).isError !== true && (await enabledOf()) === true, `${title} Undo restores the boolean`);
  check((await step(toggleReceipt, 'redo')).isError !== true && (await enabledOf()) === false, `${title} Redo reapplies it`);

  // **The minimal grant.** projects.write alone runs a page transition from its receipt; each
  // unrelated grant alone is refused, and projects.read alone reads the summary and nothing more.
  const toggleArgs = { historyId: toggleReceipt.historyId, actionId: toggleReceipt.actionId };
  const revisionOf = async () => JSON.parse(await readFile(dataFile, 'utf8'))
    .operationHistories.find(({ id }) => id === toggleReceipt.historyId).revision;
  for (const grant of ['tasks.write', 'reflections.write', 'projects.read']) {
    await access.setPermissions('agent-claude', [grant]);
    const beforeGrant = await businessState(dataFile);
    const text = await refusedText(() => client.callTool({
      name: 'undo_operation',
      arguments: { ...toggleArgs, expectedRevision: 99 },
    }));
    check(text !== null && text.includes('projects.write'), `${title} a page transition under ${grant} alone names the missing projects.write`);
    check((await businessState(dataFile)) === beforeGrant, `${title} the ${grant} refusal changes nothing, and discloses no revision`);
    if (grant === 'projects.read') {
      const readOnly = await client.callTool({ name: 'get_operation_history', arguments: { projectId: rootId } });
      check(readOnly.isError !== true && readOnly.structuredContent.undo?.operation === 'page.update', `${title} projects.read alone reads the page history summary`);
    }
  }
  await access.setPermissions('agent-claude', ['projects.write']);
  const minimal = await client.callTool({ name: 'undo_operation', arguments: { ...toggleArgs, expectedRevision: await revisionOf() } });
  check(minimal.isError !== true, `${title} projects.write alone runs the page transition from its receipt`);
  const summaryDenied = await refusedText(() => client.callTool({ name: 'get_operation_history', arguments: { projectId: rootId } }));
  check(summaryDenied !== null && summaryDenied.includes('projects.read'), `${title} the summary still needs projects.read`);
  await access.setPermissions('agent-claude', ['projects.read', 'projects.write', 'tasks.read', 'tasks.write', 'reflections.read', 'reflections.write', 'workspace.read']);

  // The foreign connection's own page receipt, for the revocation check after the grants block.
  const foreignEnabled = await foreign.callTool({
    name: 'set_project_page_enabled',
    arguments: { projectId: rootId, kind: 'todos', enabled: true },
  });
  check(receiptOf(foreignEnabled)?.operation === 'page.add', `${title} the second connection holds its own page receipt`);
  return receiptOf(foreignEnabled);
};

/** A revoked connection cannot run a page transition either, and its page stays put. */
const assertRevokedPageReceipt = async (foreign, receipt, title, dataFile) => {
  const before = await businessState(dataFile);
  const text = await refusedText(() => foreign.callTool({
    name: 'undo_operation',
    arguments: { historyId: receipt.historyId, actionId: receipt.actionId, expectedRevision: receipt.revision },
  }));
  check(
    text !== null && /unauthori[sz]ed|401|not a usable agent connection/i.test(text),
    `${title} a revoked connection cannot use its page receipt (${text?.slice(0, 60)})`,
  );
  check((await businessState(dataFile)) === before, `${title} the revoked page refusal changes nothing on disk`);
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
  const actionOf = async (actionId) => JSON.parse(await readFile(dataFile, 'utf8')).operationActions.find(({ id }) => id === actionId);

  // Refactor §26.1–2: each disposable view is deleted, never projected, and one Undo brings back the same id.
  for (const type of ['progress', 'timeline', 'recent-activity']) {
    const view = await client.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type, title: `Disposable ${type} ${title}` } });
    const viewId = view.structuredContent.section.id;
    const removedView = await client.callTool({ name: 'remove_section', arguments: { sectionId: viewId } });
    check(removedView.isError !== true, `${title} removes a ${type} view`);
    check(
      !(await archivedSectionIds()).includes(viewId) && !JSON.parse(await readFile(dataFile, 'utf8')).sections.some(({ id }) => id === viewId),
      `${title} the removed ${type} view is deleted and absent from get_project_archive`,
    );
    const viewReceipt = receiptOf(removedView);
    const viewArgs = { historyId: viewReceipt.historyId, actionId: viewReceipt.actionId, expectedRevision: viewReceipt.revision };
    const restoredView = await client.callTool({ name: 'undo_operation', arguments: viewArgs });
    check(restoredView.isError !== true && restoredView.structuredContent.result.section.id === viewId, `${title} Undo recreates the ${type} view under its id`);
    const afterUndo = await businessState(dataFile);
    const repeat = await client.callTool({ name: 'undo_operation', arguments: viewArgs });
    check(repeat.isError === true && textOf(repeat).startsWith('history_revision_stale:'), `${title} a replayed ${type} Undo is history_revision_stale`);
    check((await businessState(dataFile)) === afterUndo, `${title} the replayed ${type} Undo adds no event or action`);
  }

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
  const undoneReassign = await stepReceipt(client, receiptOf(reassigned));
  check(undoneReassign.isError !== true, `${title} reassign Undo succeeds`);
  check(
    JSON.stringify(await tasksIn(UNDO_SECTION)) === JSON.stringify(original) && (await tasksIn(targetId)).length === 0,
    `HTTP/stdio recovery preserves exact row and source IDs (${title}, reassign)`,
  );

  // Cascade: retained under its own id and projected by Archive while removed.
  const cascade = await client.callTool({ name: 'remove_section', arguments: { sectionId: UNDO_SECTION, policy: 'cascade' } });
  check(cascade.isError !== true && cascade.structuredContent.section.id === UNDO_SECTION, `${title} cascade removal keeps the section id`);
  check((await archivedSectionIds()).includes(UNDO_SECTION), `${title} get_project_archive projects the cascaded list`);
  const receipt = receiptOf(cascade);
  const receiptArgs = { historyId: receipt.historyId, actionId: receipt.actionId, expectedRevision: receipt.revision };

  const beforeForeign = await businessState(dataFile);
  const foreignText = await refusedText(() => foreign.callTool({ name: 'undo_operation', arguments: receiptArgs }));
  check(foreignText !== null && foreignText.includes('was not found'), `${title} another connection gets not-found for the history`);
  check((await businessState(dataFile)) === beforeForeign, `${title} the foreign refusal leaves the file's business collections unchanged`);
  check((await actionOf(receipt.actionId))?.state === 'applied', `${title} the foreign attempt leaves the action applied`);
  const foreignSummary = await foreign.callTool({ name: 'get_operation_history', arguments: { projectId: PROJECT } });
  check(foreignSummary.isError !== true && foreignSummary.structuredContent.historyId !== receipt.historyId, `${title} a second connection sees its own history only`);

  await access.setPermissions('agent-claude', ['projects.read', 'tasks.read', 'tasks.write', 'reflections.read', 'reflections.write', 'workspace.read']);
  const withoutGrant = await businessState(dataFile);
  const readOnlySummary = await client.callTool({ name: 'get_operation_history', arguments: { projectId: PROJECT } });
  check(readOnlySummary.isError !== true && readOnlySummary.structuredContent.undo?.actionId === receipt.actionId, `${title} projects.read alone still reads the history`);
  const grantText = await refusedText(() => client.callTool({ name: 'undo_operation', arguments: receiptArgs }));
  check(grantText !== null && grantText.includes('projects.write'), `${title} Undo names the missing projects.write grant`);
  check((await businessState(dataFile)) === withoutGrant, `HTTP/stdio current grant removal refuses issued receipt (${title})`);
  await access.setPermissions('agent-claude', ['projects.read', 'projects.write', 'tasks.read', 'tasks.write', 'reflections.read', 'reflections.write', 'workspace.read']);
  const regranted = await client.callTool({ name: 'undo_operation', arguments: receiptArgs });
  check(
    regranted.isError !== true && JSON.stringify(await tasksIn(UNDO_SECTION)) === JSON.stringify(original),
    `${title} the same receipt works once the grant is back, with every row id live`,
  );

  // Revocation, on the second connection so the primary token still serves the restart checks.
  const foreignReceipt = await foreign.callTool({ name: 'create_section', arguments: { projectId: PROJECT, type: 'progress', title: `Revoked ${title}` } });
  const foreignAdd = receiptOf(foreignReceipt);
  check(foreignReceipt.isError !== true && foreignAdd.operation === 'section.add', `${title} the second connection holds its own add receipt`);
  await access.revoke('agent-cursor');
  const revokedState = await businessState(dataFile);
  const revokedText = await refusedText(() => foreign.callTool({
    name: 'undo_operation',
    arguments: { historyId: foreignAdd.historyId, actionId: foreignAdd.actionId, expectedRevision: foreignAdd.revision },
  }));
  // HTTP answers the revoked bearer token with 401 (the SDK's UnauthorizedError); stdio re-authenticates
  // on every call and refuses with AgentAuthenticationError's message. Any other failure is not revocation.
  check(
    revokedText !== null && /unauthori[sz]ed|401|not a usable agent connection/i.test(revokedText),
    `${title} a revoked connection cannot use its receipt (${revokedText?.slice(0, 60)})`,
  );
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
    document.operationHistories.some(({ id, actorAgentConnectionId }) => id === result.historyId && actorAgentConnectionId === 'agent-claude'),
    `${title} the connection's operation history is persisted in data.json`,
  );
  check(
    document.sections.some(({ id, archivedAt }) => id === result.disposableSectionId && archivedAt === undefined),
    `${title} hard-deleted section is recreated in data.json`,
  );
  // Both removals were undone and later writes followed, so each was discarded with its redo branch.
  check(
    !document.operationActions.some(({ id }) => id === result.actionId || id === result.recoveredActionId),
    `${title} later writes discarded the undone removals from data.json`,
  );
};

const assertJournalAfterRestart = async (client, result, title) => {
  const journal = await client.callTool({ name: 'get_project_journal', arguments: { projectId: PROJECT } });
  check(
    journal.isError !== true &&
      journal.structuredContent?.items?.some(({ reflection }) => reflection.id === result.reflectionId),
    `${title} re-reads the linked reflection after restart`,
  );
  // A fresh connection for the same token is the same agent connection, so its history survived the restart.
  const summary = await historyOf(client);
  check(summary.historyId === result.historyId && summary.revision > 0, `${title} a fresh connection sees its own persisted history after restart`);
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
