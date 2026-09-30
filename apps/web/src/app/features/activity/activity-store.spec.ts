import { TestBed } from '@angular/core/testing';
import { ActivityFeedEntrySchema, type ActivityFeedEntry, type ProjectId } from '@cwm/contracts';
import { expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../core/gateway/work-manager-gateway';
import { ActivityStore } from './activity-store';

const PROJECT = 'project-a' as ProjectId;
const entry = (id: string): ActivityFeedEntry => ActivityFeedEntrySchema.parse({
  id,
  workspaceId: 'workspace-demo',
  actor: 'user',
  actorUserId: 'user-demo',
  actorName: 'Demo User',
  action: 'task.updated',
  entityType: 'task',
  entityId: 'task-a',
  projectId: PROJECT,
  context: {
    targetKind: 'task',
    targetId: 'task-a',
    targetLabel: 'Task A',
    projectId: PROJECT,
    rootProjectId: PROJECT,
  },
  entityName: 'Task A',
  summary: 'Updated Task A',
  createdAt: '2026-08-30T07:00:00.000Z',
});
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

it('serializes and coalesces loud and quiet activity reads', async () => {
  const loud = deferred<ActivityFeedEntry[]>();
  const quiet = deferred<ActivityFeedEntry[]>();
  const trailing = deferred<ActivityFeedEntry[]>();
  const list = vi.fn()
    .mockImplementationOnce(() => loud.promise)
    .mockImplementationOnce(() => quiet.promise)
    .mockImplementationOnce(() => trailing.promise);
  const gateway = { activity: { list } } as unknown as WorkManagerGateway;
  TestBed.configureTestingModule({ providers: [ActivityStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
  const store = TestBed.inject(ActivityStore);

  const loading = store.sync(PROJECT);
  void store.sync(PROJECT);
  expect(list).toHaveBeenCalledTimes(1);
  loud.resolve([entry('activity-loud')]);
  await loading;
  await Promise.resolve();
  expect(list).toHaveBeenCalledTimes(2);

  void store.sync(PROJECT);
  expect(list).toHaveBeenCalledTimes(2);
  quiet.reject(new GatewayError('unreachable', 0, 'quiet failed'));
  await Promise.resolve();
  await Promise.resolve();
  expect(store.entries().map(({ id }) => id)).toEqual(['activity-loud']);
  expect(store.error()).toBeNull();
  expect(list).toHaveBeenCalledTimes(3);

  trailing.resolve([entry('activity-trailing')]);
  await Promise.resolve();
  await Promise.resolve();
  expect(store.entries().map(({ id }) => id)).toEqual(['activity-trailing']);
});
