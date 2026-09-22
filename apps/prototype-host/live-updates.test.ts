import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskWriteResultSchema, type LiveEvent, type TaskId } from '@cwm/contracts';
import type { ActorContext } from '@cwm/domain';
import { createToolRegistry } from '@cwm/mcp-tools';
import { buildSeed } from '@cwm/prototype-data';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from './api/services.ts';
import { createApiRoutes } from './api/routes.ts';
import { LiveEventHub } from './events/hub.ts';
import { loadPersistence } from './persistence/store.ts';
import { resolveRoute, type RouteTable } from './router.ts';

/**
 * §62 through the real host graph, with no socket (§60).
 *
 * The assertion that matters is not "a frame arrived" but **when**: the whole reason the hub
 * defers to the commit is that a browser refetching before the write lands would read the
 * old value and, having already refreshed, never ask again. So every case here reads the
 * task back at the instant the frame is delivered.
 */

/** The `agent-heavy` seed's open task and the connection that may write to it (§16, §52). */
const OPEN_TASK = 'task-agent-schema' as TaskId;
const AGENT: ActorContext = {
  actor: 'agent',
  workspaceId: 'workspace-demo' as never,
  userId: 'user-demo' as never,
  agentConnectionId: 'agent-claude' as never,
  permissions: ['tasks.read', 'tasks.write', 'workspace.read'],
};

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const harness = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cwm-live-'));
  directories.push(directory);
  const path = join(directory, 'data.json');
  await writeFile(path, `${JSON.stringify(buildSeed('agent-heavy'), null, 2)}\n`, 'utf8');

  const persistence = await loadPersistence(path);
  const events = new LiveEventHub();
  const api = createApi(persistence, { events });
  const routes: RouteTable = createApiRoutes(api);

  // What the task looked like each time a frame was delivered — the ordering evidence.
  const frames: Array<{ event: LiveEvent; statusAtDelivery: string | undefined }> = [];
  events.subscribe((event) =>
    frames.push({ event, statusAtDelivery: persistence.store.snapshot().tasks.find(({ id }) => id === OPEN_TASK)?.status }),
  );

  return { api, routes, persistence, events, frames };
};

const persona = (routes: RouteTable, method: string, path: string, body?: unknown) =>
  resolveRoute(routes, method, path, {
    query: new URLSearchParams(),
    headers: { 'x-prototype-user': 'user-demo' },
    body,
  });

describe('live updates through the host (§62)', () => {
  it('broadcasts one already-committed frame for a completion over the API', async () => {
    const { routes, frames } = await harness();

    const result = await persona(routes, 'POST', `/api/tasks/${OPEN_TASK}/complete`);

    expect(result.status).toBe(200);
    expect(TaskWriteResultSchema.parse(result.body).task.status).toBe('done');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.event).toEqual({
      type: 'task.completed',
      entityType: 'task',
      entityId: OPEN_TASK,
      projectId: 'project-work-manager',
      // The root of the tree the change sits in — here the project itself, since it is one.
      rootProjectId: 'project-work-manager',
    });
    // The point of the whole deferral: a listener that refetches on this frame reads `done`.
    expect(frames[0]?.statusAtDelivery).toBe('done');
  });

  /**
   * §31 and §34's aggregate pages — Archive and Todos — project rows from anywhere beneath a
   * root, so a write three levels down changes what they render while `projectId` names a
   * project those pages are not open on. `rootProjectId` is what lets a client answer "does
   * this concern the root I am showing?" without refetching on every frame.
   */
  it('names the root on a change two levels down', async () => {
    const { api, routes, frames } = await harness();
    const actor = { actor: 'user' as const, workspaceId: 'workspace-demo' as never, userId: 'user-demo' as never };

    const middle = await api.projects.create(actor, {
      kind: 'subproject',
      parentProjectId: 'project-work-manager' as never,
      workspaceId: 'workspace-demo' as never,
      name: 'Middle',
    });
    const leaf = await api.projects.create(actor, {
      kind: 'subproject',
      parentProjectId: middle.id,
      workspaceId: 'workspace-demo' as never,
      name: 'Leaf',
    });
    frames.length = 0;

    const created = await persona(routes, 'POST', '/api/tasks', { projectId: leaf.id, title: 'Deep work' });

    expect(created.status).toBe(201);
    const written = frames.map(({ event }) => event).filter(({ type }) => type === 'task.created');
    expect(written).toHaveLength(1);
    // The immediate owner is still named — a client on the leaf's own canvas needs it — and
    // the root beside it, which is the only thing that can invalidate an aggregate page.
    expect(written[0]).toMatchObject({ projectId: leaf.id, rootProjectId: 'project-work-manager' });
  });

  it('says nothing when the mutation fails', async () => {
    const { routes, frames } = await harness();

    const result = await persona(routes, 'POST', '/api/tasks/task-nope/complete');

    expect(result.status).toBe(404);
    expect(frames).toEqual([]);
  });

  it('says nothing when a completion changes nothing', async () => {
    const { routes, frames } = await harness();
    await persona(routes, 'POST', `/api/tasks/${OPEN_TASK}/complete`);
    frames.length = 0;

    // §34's completion is idempotent, and an unchanged task is not news.
    await persona(routes, 'POST', `/api/tasks/${OPEN_TASK}/complete`);

    expect(frames).toEqual([]);
  });

  it('broadcasts the same frame when an agent completes the task through the MCP registry', async () => {
    const { api, frames } = await harness();
    const registry = createToolRegistry({
      projects: api.projects,
      pages: api.pages,
      todos: api.todos,
      archive: api.archive,
      journal: api.journal,
      tasks: api.tasks,
      reflections: api.reflections,
      sections: api.sections,
      shortcuts: api.shortcuts,
      dashboard: api.dashboard,
      workspace: api.workspace,
      history: api.history,
    });

    await registry.call('complete_task', { taskId: OPEN_TASK }, AGENT);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.event.type).toBe('task.completed');
    expect(frames[0]?.event.entityId).toBe(OPEN_TASK);
    expect(frames[0]?.statusAtDelivery).toBe('done');
  });

  /** The receipt a section write answered with, and the transition route that steps it. */
  const receiptOf = (body: unknown) => (body as { operation: { historyId: string; actionId: string; revision: number; operation: string } | null }).operation;
  const step = (routes: RouteTable, receipt: { historyId: string; actionId: string }, direction: 'undo' | 'redo', expectedRevision: number) =>
    persona(routes, 'POST', `/api/history/${receipt.historyId}/transition`, { actionId: receipt.actionId, direction, expectedRevision });

  /** Slices 30 and 35: removal, its Undo and its Redo each publish only their one activity frame, after commit. */
  describe('section removal, Undo and Redo', () => {
    const SECTION = 'section-project-work-manager-activity';

    const watchSection = (persistence: Awaited<ReturnType<typeof harness>>['persistence'], events: LiveEventHub) => {
      const delivered: Array<{ event: LiveEvent; archivedAtDelivery: string | undefined; actions: number }> = [];
      events.subscribe((event) => {
        const document = persistence.store.snapshot();
        delivered.push({
          event,
          archivedAtDelivery: document.sections.find(({ id }) => id === SECTION)?.archivedAt,
          actions: document.operationActions.length,
        });
      });
      return delivered;
    };

    it('delivers one committed frame per transition, per direction, with no inverse data', async () => {
      const { routes, persistence, events } = await harness();
      const delivered = watchSection(persistence, events);

      const removed = await persona(routes, 'DELETE', `/api/sections/${SECTION}`);
      expect(removed.status).toBe(200);
      expect(delivered).toHaveLength(1);
      expect(delivered[0]).toMatchObject({ event: { type: 'project.section_removed' }, actions: 1 });
      expect(delivered[0]?.archivedAtDelivery).toBeUndefined();

      const receipt = receiptOf(removed.body)!;
      const undone = await step(routes, receipt, 'undo', receipt.revision);
      expect(undone.status).toBe(200);
      expect(delivered).toHaveLength(2);
      expect(delivered[1]?.event.type).toBe('project.section_removal_undone');

      const redone = await step(routes, receipt, 'redo', receipt.revision + 1);
      expect(redone.status).toBe(200);
      expect(delivered).toHaveLength(3);
      expect(delivered[2]).toMatchObject({ event: { type: 'project.section_removal_redone' }, actions: 1 });
      expect(JSON.stringify(delivered.map(({ event }) => event))).not.toMatch(/history-|operation-|placement|rows/);
    });

    it('delivers nothing and keeps no action when persisting the removal fails', async () => {
      const { routes, persistence, events } = await harness();
      const delivered = watchSection(persistence, events);
      persistence.store.persist = async () => {
        throw new Error('disk full');
      };

      const removed = await persona(routes, 'DELETE', `/api/sections/${SECTION}`);

      expect(removed.status).toBe(500);
      expect(delivered).toEqual([]);
      expect(persistence.store.snapshot().operationActions).toEqual([]);
      expect(persistence.store.snapshot().operationHistories).toEqual([]);
      expect(persistence.store.snapshot().sections.find(({ id }) => id === SECTION)?.archivedAt).toBeUndefined();
    });
  });

  /**
   * Slice 39: an existing project's write, its Undo and its Redo each publish one project-targeted
   * frame, after commit. A cross-root reparent still publishes exactly one — naming the root the
   * subject is under **now** — which is why browser root aggregates re-read on any project-targeted
   * `project.*` frame in the workspace rather than only on their own root's.
   */
  describe('existing-project writes: forward, Undo and Redo', () => {
    const actor = { actor: 'user' as const, workspaceId: 'workspace-demo' as never, userId: 'user-demo' as never };

    const tree = async (api: Awaited<ReturnType<typeof harness>>['api']) => {
      const other = await api.projects.create(actor, { kind: 'root', workspaceId: 'workspace-demo' as never, name: 'Other root' });
      const child = await api.projects.create(actor, {
        kind: 'subproject', parentProjectId: 'project-work-manager' as never, workspaceId: 'workspace-demo' as never, name: 'Mover',
      });
      return { other, child };
    };

    it('delivers one committed frame per direction for a cross-root reparent, naming the current root', async () => {
      const { api, routes, persistence, events } = await harness();
      const { other, child } = await tree(api);
      const delivered: Array<{ event: LiveEvent; parentAtDelivery: string | undefined }> = [];
      events.subscribe((event) =>
        delivered.push({ event, parentAtDelivery: persistence.store.snapshot().projects.find(({ id }) => id === child.id)?.parentProjectId }),
      );

      const moved = await persona(routes, 'PATCH', `/api/projects/${child.id}`, { parentProjectId: other.id });
      expect(moved.status).toBe(200);
      const receipt = receiptOf(moved.body)!;
      expect(receipt.operation).toBe('project.update');
      expect(delivered).toHaveLength(1);
      expect(delivered[0]).toMatchObject({
        event: { type: 'project.updated', entityType: 'project', entityId: child.id, projectId: child.id, rootProjectId: other.id },
        parentAtDelivery: other.id,
      });

      expect((await step(routes, receipt, 'undo', receipt.revision)).status).toBe(200);
      expect(delivered).toHaveLength(2);
      expect(delivered[1]).toMatchObject({
        event: { type: 'project.update_undone', entityId: child.id, rootProjectId: 'project-work-manager' },
        parentAtDelivery: 'project-work-manager',
      });

      expect((await step(routes, receipt, 'redo', receipt.revision + 1)).status).toBe(200);
      expect(delivered).toHaveLength(3);
      expect(delivered[2]).toMatchObject({ event: { type: 'project.update_redone', rootProjectId: other.id }, parentAtDelivery: other.id });
      expect(JSON.stringify(delivered.map(({ event }) => event))).not.toMatch(/history-|operation-|changes|before/);
    });

    it('delivers nothing, writes nothing to disk and keeps no action when persisting fails', async () => {
      const { api, routes, persistence, frames } = await harness();
      const { other, child } = await tree(api);
      frames.length = 0;
      const disk = readFileSync(persistence.path, 'utf8');
      persistence.store.persist = async () => {
        throw new Error('disk full');
      };

      const moved = await persona(routes, 'PATCH', `/api/projects/${child.id}`, { parentProjectId: other.id });

      expect(moved.status).toBe(500);
      expect(frames).toEqual([]);
      expect(readFileSync(persistence.path, 'utf8')).toBe(disk);
      expect(persistence.store.snapshot().operationActions).toEqual([]);
      expect(persistence.store.snapshot().projects.find(({ id }) => id === child.id)?.parentProjectId).toBe('project-work-manager');
    });
  });

  /**
   * Slices 33 and 35 (Refactor §26.7–8): for every history family, the mutation, its history action
   * and the frame move together, in both directions. "Committed" is checked against the bytes on
   * disk at delivery, not only the in-memory snapshot.
   */
  describe('section edit families: forward, Undo and Redo commit before publication', () => {
    const SECTION = 'section-project-work-manager-activity';
    const PROJECT = 'project-work-manager';
    type Harness = Awaited<ReturnType<typeof harness>>;

    const families = {
      add: (routes: RouteTable) => persona(routes, 'POST', `/api/projects/${PROJECT}/sections`, { type: 'progress', title: 'Acceptance' }),
      update: (routes: RouteTable) => persona(routes, 'PATCH', `/api/sections/${SECTION}`, { title: 'Renamed activity', columnSpan: 6 }),
      move: (routes: RouteTable) => persona(routes, 'POST', `/api/sections/${SECTION}/move`, { position: 0 }),
      remove: (routes: RouteTable) => persona(routes, 'DELETE', `/api/sections/${SECTION}`),
    } as const;
    const familyNames = Object.keys(families) as Array<keyof typeof families>;

    /** Everything a section write or a transition may change, in memory and on disk. */
    const canonical = (document: ReturnType<Harness['persistence']['store']['snapshot']>) => ({
      sections: document.sections,
      sectionShortcuts: document.sectionShortcuts,
      tasks: document.tasks,
      reflections: document.reflections,
      activityEvents: document.activityEvents,
      operationHistories: document.operationHistories,
      operationActions: document.operationActions,
    });
    const onDisk = (path: string) => canonical(JSON.parse(readFileSync(path, 'utf8')) as never);

    const watchCommits = ({ persistence, events }: Harness) => {
      const delivered: Array<{ type: string; durableMatchesMemory: boolean; actions: number; stateOnDisk: string | undefined; events: number }> = [];
      events.subscribe((event) => {
        const memory = canonical(persistence.store.snapshot());
        delivered.push({
          type: event.type,
          durableMatchesMemory: JSON.stringify(onDisk(persistence.path)) === JSON.stringify(memory),
          actions: memory.operationActions.length,
          // A transition adds no action, so only the state on disk tells a pre-commit frame from a post-commit one.
          stateOnDisk: onDisk(persistence.path).operationActions[0]?.state,
          events: memory.activityEvents.length,
        });
      });
      return delivered;
    };

    it.each(familyNames)('%s publishes only after the forward write, its Undo and its Redo each commit', async (family) => {
      const host = await harness();
      const delivered = watchCommits(host);
      const eventsBefore = host.persistence.store.snapshot().activityEvents.length;

      const forward = await families[family](host.routes);
      expect([200, 201]).toContain(forward.status);
      const receipt = receiptOf(forward.body)!;
      expect(receipt.operation).toBe(`section.${family}`);
      expect(delivered).toEqual([expect.objectContaining({ durableMatchesMemory: true, actions: 1, stateOnDisk: 'applied', events: eventsBefore + 1 })]);

      const undone = await step(host.routes, receipt, 'undo', receipt.revision);
      expect(undone.status).toBe(200);
      expect(delivered).toHaveLength(2);
      expect(delivered[1]).toMatchObject({ type: expect.stringMatching(/_undone$/), durableMatchesMemory: true, actions: 1, stateOnDisk: 'undone', events: eventsBefore + 2 });

      const redone = await step(host.routes, receipt, 'redo', receipt.revision + 1);
      expect(redone.status).toBe(200);
      expect(delivered).toHaveLength(3);
      expect(delivered[2]).toMatchObject({ type: expect.stringMatching(/_redone$/), durableMatchesMemory: true, actions: 1, stateOnDisk: 'applied', events: eventsBefore + 3 });
    });

    it.each(familyNames)('%s: failed transition persistence preserves canonical state and history, and publishes nothing', async (family) => {
      const host = await harness();
      const forward = await families[family](host.routes);
      const receipt = receiptOf(forward.body)!;
      const delivered = watchCommits(host);
      const before = canonical(host.persistence.store.snapshot());
      const bytes = readFileSync(host.persistence.path, 'utf8');
      const persist = host.persistence.store.persist;
      host.persistence.store.persist = async () => {
        throw new Error('disk full');
      };

      const failed = await step(host.routes, receipt, 'undo', receipt.revision);

      expect(failed.status).toBe(500);
      expect(delivered).toEqual([]);
      expect(canonical(host.persistence.store.snapshot())).toEqual(before);
      expect(readFileSync(host.persistence.path, 'utf8')).toBe(bytes);

      host.persistence.store.persist = persist;
      const retried = await step(host.routes, receipt, 'undo', receipt.revision);
      expect(retried.status).toBe(200);
      expect(delivered).toEqual([expect.objectContaining({ type: expect.stringMatching(/_undone$/), durableMatchesMemory: true, actions: 1, stateOnDisk: 'undone' })]);
    });

    it.each(familyNames.flatMap((family) => [[family, 'action insert'], [family, 'persistence']] as const))(
      '%s: a failed %s commits neither the mutation nor its action, and publishes no frame',
      async (family, fault) => {
        const host = await harness();
        const delivered = watchCommits(host);
        const before = canonical(host.persistence.store.snapshot());
        const bytes = readFileSync(host.persistence.path, 'utf8');
        const { store, operationActions } = host.persistence;
        const persist = store.persist;
        const insert = operationActions.insert;
        if (fault === 'action insert') {
          operationActions.insert = async () => {
            throw new Error('recorder unavailable');
          };
        } else {
          store.persist = async () => {
            throw new Error('disk full');
          };
        }

        const failed = await families[family](host.routes);

        expect(failed.status).toBe(500);
        expect(delivered).toEqual([]);
        expect(canonical(store.snapshot())).toEqual(before);
        expect(readFileSync(host.persistence.path, 'utf8')).toBe(bytes);

        store.persist = persist;
        operationActions.insert = insert;
        const retried = await families[family](host.routes);
        expect([200, 201]).toContain(retried.status);
        expect(delivered).toEqual([expect.objectContaining({ durableMatchesMemory: true, actions: 1 })]);
      },
    );
  });

  /** Slice 36: compound row writes have the same unit-of-work and post-commit frame guarantees. */
  describe('compound row Add: forward, Undo and Redo are atomic', () => {
    type RowFamily = 'task' | 'reflection';
    type Harness = Awaited<ReturnType<typeof harness>>;
    const rowFamilies: readonly RowFamily[] = ['task', 'reflection'];
    const canonical = (document: ReturnType<Harness['persistence']['store']['snapshot']>) => ({
      sections: document.sections,
      tasks: document.tasks,
      reflections: document.reflections,
      activityEvents: document.activityEvents,
      operationHistories: document.operationHistories,
      operationActions: document.operationActions,
    });
    const prepare = async (family: RowFamily) => {
      const host = await harness();
      const projectResponse = await persona(host.routes, 'POST', '/api/projects', {
        workspaceId: 'workspace-demo', kind: 'root', name: `Atomic ${family}`,
      });
      expect(projectResponse.status).toBe(201);
      const projectId = (projectResponse.body as { id: string }).id;
      const delivered: string[] = [];
      host.events.subscribe((event) => delivered.push(event.type));
      const forward = () => family === 'task'
        ? persona(host.routes, 'POST', '/api/tasks', { projectId, title: 'Atomic task' })
        : persona(host.routes, 'POST', '/api/reflections', { projectId, body: 'Atomic reflection' });
      return { host, delivered, forward };
    };

    it.each(rowFamilies)('%s Add publishes only after forward, Undo and Redo commit', async (family) => {
      const { host, delivered, forward } = await prepare(family);
      const result = await forward();
      expect(result.status).toBe(201);
      const receipt = receiptOf(result.body)!;
      expect(delivered).toHaveLength(1);
      expect(readFileSync(host.persistence.path, 'utf8')).toContain(receipt.actionId);

      expect((await step(host.routes, receipt, 'undo', receipt.revision)).status).toBe(200);
      expect(delivered).toHaveLength(2);
      expect(host.persistence.store.snapshot().operationActions.at(-1)?.state).toBe('undone');

      expect((await step(host.routes, receipt, 'redo', receipt.revision + 1)).status).toBe(200);
      expect(delivered).toHaveLength(3);
      expect(host.persistence.store.snapshot().operationActions.at(-1)?.state).toBe('applied');
    });

    it.each(rowFamilies.flatMap((family) => [
      [family, 'action insert'], [family, 'activity insert'], [family, 'persistence'],
    ] as const))('%s Add rolls back a failed %s with no frame', async (family, fault) => {
      const { host, delivered, forward } = await prepare(family);
      const before = canonical(host.persistence.store.snapshot());
      const bytes = readFileSync(host.persistence.path, 'utf8');
      const insertAction = host.persistence.operationActions.insert;
      const insertActivity = host.persistence.activities.insert;
      const persist = host.persistence.store.persist;
      if (fault === 'action insert') host.persistence.operationActions.insert = async () => { throw new Error('action insert failed'); };
      if (fault === 'activity insert') host.persistence.activities.insert = async () => { throw new Error('activity insert failed'); };
      if (fault === 'persistence') host.persistence.store.persist = async () => { throw new Error('disk full'); };

      expect((await forward()).status).toBe(500);
      expect(delivered).toEqual([]);
      expect(canonical(host.persistence.store.snapshot())).toEqual(before);
      expect(readFileSync(host.persistence.path, 'utf8')).toBe(bytes);

      host.persistence.operationActions.insert = insertAction;
      host.persistence.activities.insert = insertActivity;
      host.persistence.store.persist = persist;
    });

    it.each(rowFamilies.flatMap((family) => [
      [family, 'undo', 'activity insert'], [family, 'undo', 'action update'], [family, 'undo', 'persistence'],
      [family, 'redo', 'activity insert'], [family, 'redo', 'action update'], [family, 'redo', 'persistence'],
    ] as const))('%s %s rolls back a failed %s with no frame', async (family, direction, fault) => {
      const { host, delivered, forward } = await prepare(family);
      const result = await forward();
      const receipt = receiptOf(result.body)!;
      let revision = receipt.revision;
      if (direction === 'redo') {
        expect((await step(host.routes, receipt, 'undo', revision)).status).toBe(200);
        revision += 1;
      }
      delivered.length = 0;
      const before = canonical(host.persistence.store.snapshot());
      const bytes = readFileSync(host.persistence.path, 'utf8');
      const insertActivity = host.persistence.activities.insert;
      const updateAction = host.persistence.operationActions.update;
      const persist = host.persistence.store.persist;
      if (fault === 'activity insert') host.persistence.activities.insert = async () => { throw new Error('activity insert failed'); };
      else if (fault === 'action update') host.persistence.operationActions.update = async () => { throw new Error('action update failed'); };
      else host.persistence.store.persist = async () => { throw new Error('disk full'); };

      expect((await step(host.routes, receipt, direction, revision)).status).toBe(500);
      expect(delivered).toEqual([]);
      expect(canonical(host.persistence.store.snapshot())).toEqual(before);
      expect(readFileSync(host.persistence.path, 'utf8')).toBe(bytes);

      host.persistence.activities.insert = insertActivity;
      host.persistence.operationActions.update = updateAction;
      host.persistence.store.persist = persist;
    });
  });
});
