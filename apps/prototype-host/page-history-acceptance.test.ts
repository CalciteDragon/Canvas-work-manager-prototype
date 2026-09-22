import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PrototypeDocumentSchema,
  type LiveEvent,
  type OperationReceipt,
  type ProjectId,
  type ProjectPageId,
  type PrototypeDocument,
} from '@cwm/contracts';
import { SimulatedClock, type ActorContext } from '@cwm/domain';
import { buildSeed, SEED_NOW } from '@cwm/prototype-data';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from './api/services.ts';
import { LiveEventHub } from './events/hub.ts';
import { loadPersistence } from './persistence/store.ts';

/**
 * Slice 38 (§§14, 26, 31, 62): the optional-page toggle and its inverses over a real file on disk.
 *
 * The host is the one package allowed to compose the JSON store, the domain services and the live
 * hub, so this is where the **commit boundary** is proved: one unit of work, so a fault anywhere
 * inside it leaves the file, the history and the event feed exactly as they were and announces
 * nothing. Every "reopen" builds a fresh store from the bytes on disk; nothing carries over in
 * memory.
 *
 * Faults are injected at the seams the write actually uses — the recorder's action insert, the
 * transition's action and cursor updates, and the final persist — rather than through a mock
 * service, because what is being tested is that those writes share one unit with the page write.
 */

/** The `agent-heavy` seed's persona, and the connection beside it that may also write (§§16, 52). */
const DEMO: ActorContext = { actor: 'user', workspaceId: 'workspace-demo' as never, userId: 'user-demo' as never };

/** Somebody else with write access in the same workspace: their writes never enter DEMO's history. */
const SOMEONE_ELSE: ActorContext = {
  actor: 'agent',
  workspaceId: 'workspace-demo' as never,
  userId: 'user-demo' as never,
  agentConnectionId: 'agent-claude' as never,
  permissions: ['projects.read', 'projects.write'],
};

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A fresh seeded file, and the id of the Home-only root every case below toggles pages on. */
const tempSeed = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cwm-page-history-'));
  directories.push(directory);
  const path = join(directory, 'data.json');
  await writeFile(path, `${JSON.stringify(buildSeed('agent-heavy'), null, 2)}\n`, 'utf8');
  return path;
};

/** A fresh store, service graph and live hub over whatever is on disk now. */
const reopen = async (path: string) => {
  const clock = new SimulatedClock();
  clock.setNow(new Date(SEED_NOW));
  const persistence = await loadPersistence(path);
  const events = new LiveEventHub();
  const frames: LiveEvent[] = [];
  events.subscribe((event) => void frames.push(event));
  const api = createApi(persistence, { clock, events });
  return { persistence, api, clock, events, frames, document: () => persistence.store.snapshot() };
};

type Host = Awaited<ReturnType<typeof reopen>>;

const onDisk = async (path: string): Promise<PrototypeDocument> =>
  PrototypeDocumentSchema.parse(JSON.parse(await readFile(path, 'utf8')));

/** A root with Home and nothing else, which is §26's stored state for a new root. */
const homeOnlyRoot = async (host: Host, name = 'Renovation') => {
  const project = await host.api.projects.create(DEMO, { workspaceId: DEMO.workspaceId, kind: 'root', name });
  expect((await host.api.pages.list(DEMO, project.id)).map(({ kind }) => kind)).toEqual(['home']);
  return project.id;
};

/** Everything a toggle or a transition could write, for "nothing changed" assertions. */
const businessState = (host: Host) => {
  const { projectPages, sections, sectionShortcuts, activityEvents, operationHistories, operationActions } = host.document();
  return { projectPages, sections, sectionShortcuts, activityEvents, operationHistories, operationActions };
};

const step = async (
  host: Host,
  receipt: OperationReceipt,
  direction: 'undo' | 'redo',
  projectId: ProjectId,
) => {
  const summary = await host.api.history.summary(DEMO, projectId);
  return host.api.history.transition(DEMO, receipt.historyId, {
    actionId: receipt.actionId,
    direction,
    expectedRevision: summary.revision,
  });
};

/**
 * Runs `attempt` with one seam broken, and proves the fault left nothing behind: no business
 * state, no history, no activity row, no live frame, and the same bytes on disk.
 */
const expectFaultChangesNothing = async (
  path: string,
  host: Host,
  breakSeam: (host: Host) => void,
  attempt: (host: Host) => Promise<unknown>,
) => {
  const before = structuredClone(businessState(host));
  const bytes = await readFile(path, 'utf8');
  host.frames.length = 0;
  breakSeam(host);

  await expect(attempt(host)).rejects.toThrow();

  expect(businessState(host)).toEqual(before);
  expect(await readFile(path, 'utf8')).toBe(bytes);
  expect(host.frames).toEqual([]);
};

/** The recorder's own write: failing it is a recorder failure at the seam the write uses. */
const breakRecorder = (host: Host) => {
  host.persistence.operationActions.insert = () => Promise.reject(new Error('the recorder gave up'));
};
const breakPersist = (host: Host) => {
  host.persistence.store.persist = () => Promise.reject(new Error('the disk gave up'));
};
const breakActionUpdate = (host: Host) => {
  host.persistence.operationActions.update = () => Promise.reject(new Error('the action update gave up'));
};
const breakCursorUpdate = (host: Host) => {
  host.persistence.operationHistories.update = () => Promise.reject(new Error('the cursor update gave up'));
};

describe('optional-page history over a persisted file (Slice 38)', () => {
  it('records a first enable and a toggle, and reopens with both actions on disk', async () => {
    const path = await tempSeed();
    const host = await reopen(path);
    const root = await homeOnlyRoot(host);

    const created = await host.api.pages.setEnabled(DEMO, root, { kind: 'reflections', enabled: true });
    const disabled = await host.api.pages.setEnabled(DEMO, root, { kind: 'reflections', enabled: false });

    expect(created.operation).toMatchObject({ operation: 'page.add', label: 'Enabled the reflections page' });
    expect(disabled.operation).toMatchObject({ operation: 'page.update', label: 'Disabled the reflections page' });

    // Undo the toggle, leaving one applied action and one undone one — the mixed state §31's
    // cursor produces, and the state a reopen has to read back unchanged.
    await step(host, disabled.operation!, 'undo', root);

    const stored = await onDisk(path);
    expect(stored.schemaVersion).toBe(5);
    expect(stored.operationActions.map(({ operation, state }) => [operation.type, state])).toEqual([
      ['page.add', 'applied'],
      ['page.update', 'undone'],
    ]);

    const reopened = await reopen(path);
    expect((await reopened.api.pages.list(DEMO, root)).map(({ kind, enabled }) => [kind, enabled])).toEqual([
      ['home', true],
      ['reflections', true],
    ]);
    const summary = await reopened.api.history.summary(DEMO, root);
    expect(summary.undo?.operation).toBe('page.add');
    expect(summary.redo?.operation).toBe('page.update');
  });

  it('removes the created record on Undo and brings the same id back on Redo, across reopens', async () => {
    const path = await tempSeed();
    const host = await reopen(path);
    const root = await homeOnlyRoot(host);
    const created = await host.api.pages.setEnabled(DEMO, root, { kind: 'todos', enabled: true });
    const pageId = created.page.id as ProjectPageId;

    host.frames.length = 0;
    const undone = await step(host, created.operation!, 'undo', root);
    expect(undone.result).toMatchObject({ operation: 'page.add', outcome: 'removed', pageId });
    // One event and one frame, both naming the owning project rather than the page.
    expect(host.frames.map(({ type, entityType, entityId }) => [type, entityType, entityId])).toEqual([
      ['project.page_addition_undone', 'project', root],
    ]);

    const afterUndo = await onDisk(path);
    expect(afterUndo.projectPages.some(({ id }) => id === pageId)).toBe(false);
    // The page is gone and its project-targeted audit history is not.
    expect(afterUndo.activityEvents.filter((event) => event.action.startsWith('project.page_')).length).toBeGreaterThan(0);

    const replayed = await reopen(path);
    replayed.frames.length = 0;
    const redone = await step(replayed, created.operation!, 'redo', root);
    expect(redone.result).toMatchObject({ operation: 'page.add', outcome: 'reapplied', page: { id: pageId } });
    expect(replayed.frames.map(({ type }) => type)).toEqual(['project.page_addition_redone']);

    const afterRedo = await onDisk(path);
    const back = afterRedo.projectPages.find(({ id }) => id === pageId)!;
    expect([back.id, back.kind, back.enabled]).toEqual([pageId, 'todos', true]);
    expect(back.createdAt).toBe(created.page.createdAt);
  });

  it.each([
    ['a recorder failure', breakRecorder],
    ['a persist failure', breakPersist],
  ])('rolls a first enable back entirely on %s', async (_name, breakSeam) => {
    const path = await tempSeed();
    const host = await reopen(path);
    const root = await homeOnlyRoot(host);

    await expectFaultChangesNothing(path, host, breakSeam, (current) =>
      current.api.pages.setEnabled(DEMO, root, { kind: 'reflections', enabled: true }),
    );
    // No half-created page: the record and the action are one unit.
    expect((await host.api.pages.list(DEMO, root)).map(({ kind }) => kind)).toEqual(['home']);
  });

  it.each([
    ['a recorder failure', breakRecorder],
    ['a persist failure', breakPersist],
  ])('rolls an existing-page toggle back entirely on %s', async (_name, breakSeam) => {
    const path = await tempSeed();
    const host = await reopen(path);
    const root = await homeOnlyRoot(host);
    await host.api.pages.setEnabled(DEMO, root, { kind: 'archive', enabled: true });

    await expectFaultChangesNothing(path, host, breakSeam, (current) =>
      current.api.pages.setEnabled(DEMO, root, { kind: 'archive', enabled: false }),
    );
    expect((await host.api.pages.list(DEMO, root)).find(({ kind }) => kind === 'archive')?.enabled).toBe(true);
  });

  /**
   * The three writes a transition makes after the page mutation — the action's state, the
   * history's cursor and the final persist — each roll the page mutation back with them.
   */
  it.each([
    ['an action update failure', breakActionUpdate],
    ['a cursor update failure', breakCursorUpdate],
    ['a persist failure', breakPersist],
  ])('rolls Undo of a first enable back entirely on %s', async (_name, breakSeam) => {
    const path = await tempSeed();
    const host = await reopen(path);
    const root = await homeOnlyRoot(host);
    const created = await host.api.pages.setEnabled(DEMO, root, { kind: 'reflections', enabled: true });

    await expectFaultChangesNothing(path, host, breakSeam, (current) =>
      step(current, created.operation!, 'undo', root),
    );
    expect(await host.persistence.pages.find(created.page.id)).not.toBeNull();
  });

  it.each([
    ['an action update failure', breakActionUpdate],
    ['a cursor update failure', breakCursorUpdate],
    ['a persist failure', breakPersist],
  ])('rolls Redo of a first enable back entirely on %s', async (_name, breakSeam) => {
    const path = await tempSeed();
    const host = await reopen(path);
    const root = await homeOnlyRoot(host);
    const created = await host.api.pages.setEnabled(DEMO, root, { kind: 'reflections', enabled: true });
    await step(host, created.operation!, 'undo', root);

    await expectFaultChangesNothing(path, host, breakSeam, (current) =>
      step(current, created.operation!, 'redo', root),
    );
    expect(await host.persistence.pages.find(created.page.id)).toBeNull();
  });

  it.each([
    ['an action update failure', breakActionUpdate],
    ['a cursor update failure', breakCursorUpdate],
    ['a persist failure', breakPersist],
  ])('rolls either direction of a toggle back entirely on %s', async (_name, breakSeam) => {
    for (const direction of ['undo', 'redo'] as const) {
      const path = await tempSeed();
      const host = await reopen(path);
      const root = await homeOnlyRoot(host);
      await host.api.pages.setEnabled(DEMO, root, { kind: 'todos', enabled: true });
      const disabled = await host.api.pages.setEnabled(DEMO, root, { kind: 'todos', enabled: false });
      if (direction === 'redo') await step(host, disabled.operation!, 'undo', root);
      const expected = direction === 'undo' ? false : true;

      await expectFaultChangesNothing(path, host, breakSeam, (current) =>
        step(current, disabled.operation!, direction, root),
      );
      expect((await host.api.pages.list(DEMO, root)).find(({ kind }) => kind === 'todos')?.enabled).toBe(expected);
    }
  });

  /**
   * A transition is the inverse of a write, not a write of its own: it moves the cursor rather
   * than recording a new action, so a broken recorder cannot stop one.
   */
  it('never calls the recorder from a transition', async () => {
    const path = await tempSeed();
    const host = await reopen(path);
    const root = await homeOnlyRoot(host);
    const created = await host.api.pages.setEnabled(DEMO, root, { kind: 'reflections', enabled: true });
    const disabled = await host.api.pages.setEnabled(DEMO, root, { kind: 'reflections', enabled: false });
    const actionsBefore = host.document().operationActions.length;
    breakRecorder(host);

    await expect(step(host, disabled.operation!, 'undo', root)).resolves.toMatchObject({
      result: { operation: 'page.update', outcome: 'restored' },
    });
    await expect(step(host, created.operation!, 'undo', root)).resolves.toMatchObject({
      result: { operation: 'page.add', outcome: 'removed' },
    });

    expect(host.document().operationActions).toHaveLength(actionsBefore);
    expect(await host.persistence.pages.find(created.page.id)).toBeNull();
  });

  /** A refused transition is a read of the world that changed its mind, and writes nothing. */
  it('writes nothing when a dependent blocks the creation inverse', async () => {
    const path = await tempSeed();
    const host = await reopen(path);
    const root = await homeOnlyRoot(host);
    const created = await host.api.pages.setEnabled(DEMO, root, { kind: 'reflections', enabled: true });
    // Somebody else's section, so DEMO's next Undo is still the page add rather than that write.
    await host.api.sections.add(SOMEONE_ELSE, root, { type: 'reflections', pageId: created.page.id });

    const before = structuredClone(businessState(host));
    const bytes = await readFile(path, 'utf8');
    host.frames.length = 0;

    await expect(step(host, created.operation!, 'undo', root)).rejects.toThrow(/refused/);

    expect(businessState(host)).toEqual(before);
    expect(await readFile(path, 'utf8')).toBe(bytes);
    expect(host.frames).toEqual([]);
  });

  /** A no-op is not a write: no receipt, no event, no frame and no new bytes. */
  it('changes nothing for a toggle already where it was asked to go', async () => {
    const path = await tempSeed();
    const host = await reopen(path);
    const root = await homeOnlyRoot(host);
    await host.api.pages.setEnabled(DEMO, root, { kind: 'todos', enabled: true });
    const before = structuredClone(businessState(host));
    const bytes = await readFile(path, 'utf8');
    host.frames.length = 0;

    const repeated = await host.api.pages.setEnabled(DEMO, root, { kind: 'todos', enabled: true });

    expect(repeated.operation).toBeNull();
    expect(businessState(host)).toEqual(before);
    expect(await readFile(path, 'utf8')).toBe(bytes);
    expect(host.frames).toEqual([]);
  });
});
