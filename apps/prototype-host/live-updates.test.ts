import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskSchema, type LiveEvent, type TaskId } from '@cwm/contracts';
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
    expect(TaskSchema.parse(result.body).status).toBe('done');
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
      undo: api.undo,
    });

    await registry.call('complete_task', { taskId: OPEN_TASK }, AGENT);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.event.type).toBe('task.completed');
    expect(frames[0]?.event.entityId).toBe(OPEN_TASK);
    expect(frames[0]?.statusAtDelivery).toBe('done');
  });

  /** Slice 30: removal and its Undo each publish only their one activity frame, after commit. */
  describe('section removal and Undo', () => {
    const SECTION = 'section-project-work-manager-activity';

    const watchSection = (persistence: Awaited<ReturnType<typeof harness>>['persistence'], events: LiveEventHub) => {
      const delivered: Array<{ event: LiveEvent; archivedAtDelivery: string | undefined; records: number }> = [];
      events.subscribe((event) => {
        const document = persistence.store.snapshot();
        delivered.push({
          event,
          archivedAtDelivery: document.sections.find(({ id }) => id === SECTION)?.archivedAt,
          records: document.undoRecords.length,
        });
      });
      return delivered;
    };

    it('delivers one committed frame for the removal and one for its Undo, with no inverse data', async () => {
      const { routes, persistence, events } = await harness();
      const delivered = watchSection(persistence, events);

      const removed = await persona(routes, 'DELETE', `/api/sections/${SECTION}`);
      expect(removed.status).toBe(200);
      expect(delivered).toHaveLength(1);
      expect(delivered[0]).toMatchObject({ event: { type: 'project.section_removed' }, records: 1 });
      expect(delivered[0]?.archivedAtDelivery).toBeUndefined();

      const { undo } = removed.body as { undo: { undoId: string } };
      const undone = await persona(routes, 'POST', `/api/undo/${undo.undoId}`);
      expect(undone.status).toBe(200);
      expect(delivered).toHaveLength(2);
      expect(delivered[1]?.event.type).toBe('project.section_removal_undone');
      expect(delivered[1]?.archivedAtDelivery).toBeUndefined();
      expect(JSON.stringify(delivered.map(({ event }) => event))).not.toMatch(/undo-|placement|rows/);
    });

    it('delivers nothing and keeps no record when persisting the removal fails', async () => {
      const { routes, persistence, events } = await harness();
      const delivered = watchSection(persistence, events);
      persistence.store.persist = async () => {
        throw new Error('disk full');
      };

      const removed = await persona(routes, 'DELETE', `/api/sections/${SECTION}`);

      expect(removed.status).toBe(500);
      expect(delivered).toEqual([]);
      expect(persistence.store.snapshot().undoRecords).toEqual([]);
      expect(persistence.store.snapshot().sections.find(({ id }) => id === SECTION)?.archivedAt).toBeUndefined();
    });
  });
});
