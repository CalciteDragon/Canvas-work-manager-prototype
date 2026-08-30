import { TestBed } from '@angular/core/testing';
import { ProjectSchema } from '@cwm/contracts';
import type { Project } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import type { WorkManagerGateway } from '../../../../core/gateway/work-manager-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { SubProjectsStore } from './sub-projects-store';

const root = ProjectSchema.parse({ id: 'project-a', workspaceId: 'workspace-demo', name: 'Root', status: 'active', projectLayoutMode: 'flow', createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z' });
const child = ProjectSchema.parse({ ...root, id: 'project-b', parentProjectId: root.id, name: 'Child' });
const grandchild = ProjectSchema.parse({ ...root, id: 'project-c', parentProjectId: child.id, name: 'Grandchild' });
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('SubProjectsStore', () => {
  it('serializes hierarchy refreshes and protects navigation from an older answer', async () => {
    const loudRoot = deferred<Project>(); const quietRoot = deferred<Project>(); const trailingRoot = deferred<Project>();
    const get = vi.fn().mockImplementationOnce(() => loudRoot.promise).mockImplementationOnce(() => quietRoot.promise).mockImplementationOnce(() => trailingRoot.promise);
    const list = vi.fn(async () => [root, child]);
    const gateway = { projects: { get, list, create: vi.fn() } } as unknown as WorkManagerGateway;
    TestBed.configureTestingModule({ providers: [SubProjectsStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(SubProjectsStore);
    const loading = store.sync(root.id); void store.sync(root.id); expect(get).toHaveBeenCalledTimes(1);
    loudRoot.resolve(root); await loading; await Promise.resolve(); expect(get).toHaveBeenCalledTimes(2);
    void store.sync(root.id); expect(get).toHaveBeenCalledTimes(2);
    quietRoot.reject(new GatewayError('unreachable', 0, 'quiet failed')); await Promise.resolve(); await Promise.resolve();
    expect(store.projects().map(({ id }) => id)).toEqual([child.id]); expect(store.error()).toBeNull(); expect(get).toHaveBeenCalledTimes(3);
    trailingRoot.resolve(root); await Promise.resolve(); await Promise.resolve(); expect(store.projects().map(({ id }) => id)).toEqual([child.id]);
  });

  it('loads hierarchy and creates a trimmed direct child', async () => {
    const gateway = new FakeWorkManagerGateway({ projects: [root, child, grandchild] });
    TestBed.configureTestingModule({ providers: [SubProjectsStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(SubProjectsStore);
    await store.load(root.id);
    expect(store.projects().map(({ id }) => id)).toEqual([child.id, grandchild.id]);
    expect(store.depthOf(child)).toBe(0);
    expect(store.depthOf(grandchild)).toBe(1);
    expect(await store.create('  New child  ')).toBe(true);
    expect(gateway.argumentTo('projects.create')).toMatchObject({ parentProjectId: root.id, name: 'New child' });
  });
});
