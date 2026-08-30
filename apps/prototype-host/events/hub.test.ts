import { InMemoryDataStore, JsonTaskRepository, unitOfWorkFor, type UnitOfWork } from '@cwm/repositories';
import { buildSeed } from '@cwm/prototype-data';
import { TaskSchema, type LiveEvent, type WorkspaceId } from '@cwm/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiveEventHub } from './hub.ts';

const WORKSPACE_A = 'workspace-demo' as WorkspaceId;
const WORKSPACE_B = 'workspace-alex' as WorkspaceId;

const event = (entityId: string): LiveEvent => ({ type: 'task.updated', entityType: 'task', entityId });

describe('LiveEventHub', () => {
  let store: InMemoryDataStore;
  let unitOfWork: UnitOfWork;
  let hub: LiveEventHub;
  let wrapped: UnitOfWork;
  let received: LiveEvent[];

  beforeEach(() => {
    store = new InMemoryDataStore(buildSeed('personal-workspace'));
    unitOfWork = unitOfWorkFor(store);
    hub = new LiveEventHub();
    wrapped = hub.wrapUnitOfWork(unitOfWork);
    received = [];
  });

  it('holds events until the unit of work commits', async () => {
    hub.subscribe((live) => void received.push(live));

    await wrapped.run(() => {
      hub.publish({ workspaceId: WORKSPACE_A, event: event('task-1') });
      // The write is not visible to another reader yet, so neither may the frame be.
      expect(received).toEqual([]);
    });

    expect(received).toEqual([event('task-1')]);
  });

  it('discards events when the callback throws', async () => {
    hub.subscribe((live) => void received.push(live));

    await expect(
      wrapped.run(() => {
        hub.publish({ workspaceId: WORKSPACE_A, event: event('task-1') });
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');

    expect(received).toEqual([]);
  });

  it('discards events when the commit itself rejects', async () => {
    hub.subscribe((live) => void received.push(live));

    // The callback succeeds and `validateDocumentIntegrity` fails at close — the realistic
    // rollback, and the one that happens *after* the publish is already buffered.
    await expect(
      wrapped.run(async () => {
        hub.publish({ workspaceId: WORKSPACE_A, event: event('task-1') });
        // A task pointing at a project that does not exist: the repositories accept the
        // write and `validateDocumentIntegrity` rejects it at the close of the unit.
        await new JsonTaskRepository(store).insert(
          TaskSchema.parse({
            id: 'task-dangling',
            projectId: 'project-nope',
            title: 'Dangling',
            status: 'todo',
            priority: 'medium',
            createdAt: '2026-08-01T16:00:00.000Z',
            updatedAt: '2026-08-01T16:00:00.000Z',
          }),
        );
      }),
    ).rejects.toThrow();

    expect(received).toEqual([]);
  });

  it('flushes a nested unit with its outer one', async () => {
    hub.subscribe((live) => void received.push(live));

    await wrapped.run(async () => {
      hub.publish({ workspaceId: WORKSPACE_A, event: event('outer') });
      // `unitOfWorkFor` joins this call rather than queueing it; the buffer must join too.
      await wrapped.run(() => {
        hub.publish({ workspaceId: WORKSPACE_A, event: event('inner') });
      });
      expect(received).toEqual([]);
    });

    expect(received).toEqual([event('outer'), event('inner')]);
  });

  it('keeps two queued units’ events apart', async () => {
    hub.subscribe((live) => void received.push(live));
    const afterEach: LiveEvent[][] = [];

    // `unitOfWorkFor` serializes these two on a promise chain rather than nesting them, so
    // each must carry its own buffer: a shared one would let the first flush emit both.
    const run = (id: string) =>
      wrapped
        .run(async () => {
          hub.publish({ workspaceId: WORKSPACE_A, event: event(id) });
          await Promise.resolve();
        })
        .then(() => void afterEach.push([...received]));

    await Promise.all([run('first'), run('second')]);

    expect(afterEach[0]).toEqual([event('first')]);
    expect(received).toEqual([event('first'), event('second')]);
  });

  it('broadcasts immediately outside a unit of work', () => {
    hub.subscribe((live) => void received.push(live));

    hub.publish({ workspaceId: WORKSPACE_A, event: event('task-1') });

    expect(received).toEqual([event('task-1')]);
  });

  it('delivers only the subscriber’s workspace', async () => {
    const mine: LiveEvent[] = [];
    const everything: LiveEvent[] = [];
    hub.subscribe((live) => void mine.push(live), WORKSPACE_A);
    hub.subscribe((live) => void everything.push(live));

    await wrapped.run(() => {
      hub.publish({ workspaceId: WORKSPACE_A, event: event('mine') });
      hub.publish({ workspaceId: WORKSPACE_B, event: event('theirs') });
    });

    expect(mine).toEqual([event('mine')]);
    expect(everything).toEqual([event('mine'), event('theirs')]);
  });

  it('reaches a workspace-filtered subscriber with broadcastToAll', () => {
    hub.subscribe((live) => void received.push(live), WORKSPACE_A);

    // A browser is always filtered, and `prototype.reloaded` belongs to no workspace.
    hub.broadcastToAll({ type: 'prototype.reloaded', entityId: 'seed' });

    expect(received).toEqual([{ type: 'prototype.reloaded', entityId: 'seed' }]);
  });

  it('flushes a unit that recorded nothing without complaint', async () => {
    hub.subscribe((live) => void received.push(live));

    // `AgentConnectionService.touch` is this shape, and runs on every authenticated call.
    await expect(wrapped.run(() => 'no activity recorded')).resolves.toBe('no activity recorded');
    expect(received).toEqual([]);
  });

  it('stops delivering after unsubscribe', async () => {
    const unsubscribe = hub.subscribe((live) => void received.push(live));
    unsubscribe();

    await wrapped.run(() => hub.publish({ workspaceId: WORKSPACE_A, event: event('task-1') }));

    expect(received).toEqual([]);
  });
});
