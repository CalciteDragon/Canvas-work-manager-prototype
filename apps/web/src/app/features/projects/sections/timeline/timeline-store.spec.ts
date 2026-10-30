import { TestBed } from '@angular/core/testing';
import type { ProjectId, TimelineResult } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../../../core/gateway/work-manager-gateway';
import { TimelineStore } from './timeline-store';

const result = (projectId = 'project-a'): TimelineResult => ({
  projectId: projectId as ProjectId,
  items: [
    {
      id: 'task-later',
      kind: 'task',
      title: 'Later task',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      status: 'doing',
    },
    {
      id: 'milestone-first',
      kind: 'milestone',
      title: 'First milestone',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    },
  ],
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const setup = (get: WorkManagerGateway['timeline']['get'] = vi.fn(async (id) => result(id))) => {
  const gateway = { timeline: { get } } as WorkManagerGateway;
  TestBed.configureTestingModule({
    providers: [TimelineStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  return TestBed.inject(TimelineStore);
};

describe('TimelineStore (§38)', () => {
  it('serializes both revision channels and preserves timeline rows on quiet failure', async () => {
    const loud = deferred<TimelineResult>(); const quiet = deferred<TimelineResult>(); const trailing = deferred<TimelineResult>();
    const get = vi.fn().mockImplementationOnce(() => loud.promise).mockImplementationOnce(() => quiet.promise).mockImplementationOnce(() => trailing.promise);
    const store = setup(get);
    const loading = store.sync('project-a' as ProjectId); void store.sync('project-a' as ProjectId);
    expect(get).toHaveBeenCalledTimes(1);
    loud.resolve(result()); await loading; await Promise.resolve();
    void store.sync('project-a' as ProjectId); expect(get).toHaveBeenCalledTimes(2);
    quiet.reject(new GatewayError('unreachable', 0, 'quiet failed')); await Promise.resolve(); await Promise.resolve();
    expect(store.items()).toHaveLength(2); expect(store.error()).toBeNull(); expect(get).toHaveBeenCalledTimes(3);
    trailing.resolve({ ...result(), items: [result().items[0]!] }); await Promise.resolve(); await Promise.resolve();
    expect(store.items()).toHaveLength(1);
  });

  it('loads the derived timeline for one project and exposes it chronologically', async () => {
    const get = vi.fn(async (id: ProjectId) => result(id));
    const store = setup(get);

    await store.load('project-a' as ProjectId);

    expect(get).toHaveBeenCalledWith('project-a');
    expect(store.items().map(({ id }) => id)).toEqual(['milestone-first', 'task-later']);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('does not let an older project answer replace a newer one', async () => {
    const older = deferred<TimelineResult>();
    const newer = deferred<TimelineResult>();
    const get = vi
      .fn<WorkManagerGateway['timeline']['get']>()
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const store = setup(get);

    const firstLoad = store.load('project-a' as ProjectId);
    const secondLoad = store.load('project-b' as ProjectId);
    newer.resolve(result('project-b'));
    await secondLoad;
    older.resolve(result('project-a'));
    await firstLoad;

    expect(store.projectId()).toBe('project-b');
    expect(store.items()[0]?.id).toBe('milestone-first');
  });

  it('surfaces a failed load without retaining stale rows', async () => {
    const get = vi
      .fn<WorkManagerGateway['timeline']['get']>()
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'timeline is offline'));
    const store = setup(get);
    await store.load('project-a' as ProjectId);

    await store.load('project-b' as ProjectId);

    expect(store.items()).toEqual([]);
    expect(store.error()).toEqual({ sentence: 'Couldn’t reach your workspace, so this timeline didn’t load.', reason: 'timeline is offline' });
    expect(store.loading()).toBe(false);
  });

  it('keeps the failure on screen through Try again until the read answers, then clears it (Slice 78)', async () => {
    const again = deferred<TimelineResult>();
    const get = vi.fn<WorkManagerGateway['timeline']['get']>()
      .mockRejectedValueOnce(new GatewayError('not_found', 404, 'Project project-a was not found'))
      .mockImplementationOnce(() => again.promise);
    const store = setup(get);
    await store.load('project-a' as ProjectId);
    expect(store.error()?.sentence).toBe('This timeline isn’t available.');

    const retrying = store.retry();
    expect(store.loading()).toBe(true);
    expect(store.error()?.sentence).toBe('This timeline isn’t available.');
    again.resolve(result()); await retrying;

    expect(store.error()).toBeNull();
    expect(store.items()).toHaveLength(2);
  });

  it('clears a read failure on the next successful quiet read', async () => {
    const get = vi.fn<WorkManagerGateway['timeline']['get']>()
      .mockRejectedValueOnce(new GatewayError('internal_error', 500, 'boom'))
      .mockResolvedValueOnce(result());
    const store = setup(get);
    await store.load('project-a' as ProjectId);
    expect(store.error()?.sentence).toBe('Couldn’t load this timeline.');
    await store.sync('project-a' as ProjectId);
    expect(store.error()).toBeNull();
  });
});
