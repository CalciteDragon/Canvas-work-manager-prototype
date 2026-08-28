import { TestBed } from '@angular/core/testing';
import { ProjectIdSchema, ProjectSchema, TaskSchema, type ProgressResult } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import { ProgressStore } from './progress-store';

const project = ProjectSchema.parse({ id: 'project-a', workspaceId: 'workspace-demo', name: 'Launch', status: 'active', projectLayoutMode: 'flow', createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z' });
const PROJECT_A = ProjectIdSchema.parse('project-a');
const PROJECT_B = ProjectIdSchema.parse('project-b');
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('ProgressStore', () => {
  it('persists a canonical project formula then reloads the derived answer', async () => {
    const gateway = new FakeWorkManagerGateway({
      projects: [project],
      tasks: [
        TaskSchema.parse({ id: 'task-done', projectId: project.id, title: 'Done', status: 'done', priority: 'medium', estimate: 3, completedAt: project.updatedAt, createdAt: project.createdAt, updatedAt: project.updatedAt }),
        TaskSchema.parse({ id: 'task-todo', projectId: project.id, title: 'Todo', status: 'todo', priority: 'medium', estimate: 1, createdAt: project.createdAt, updatedAt: project.updatedAt }),
      ],
      progress: { projectId: project.id, formula: 'count', percentage: 50, completed: 1, total: 2, explanation: '1 of 2 tasks complete' },
    });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(ProgressStore);
    await store.load(project.id);
    expect(await store.setFormula('weighted')).toBe(true);
    expect(gateway.argumentTo('projects.update')).toEqual({ id: project.id, input: { progressFormula: 'weighted' } });
    expect(store.result()?.percentage).toBe(75);
  });

  it('reports a successful write even when the immediate derived refresh fails', async () => {
    const options: ConstructorParameters<typeof FakeWorkManagerGateway>[0] = {
      projects: [project],
      progress: { projectId: project.id, formula: 'count', percentage: 0, completed: 0, total: 1, explanation: '0 of 1 tasks complete' },
    };
    const gateway = new FakeWorkManagerGateway(options);
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(ProgressStore);
    await store.load(project.id);
    options.failOn = { 'progress.get': new GatewayError('unreachable', 0, 'refresh failed') };

    expect(await store.setFormula('weighted')).toBe(true);
    expect(store.error()).toContain('refresh failed');
    expect(gateway.argumentTo('projects.update')).toEqual({ id: project.id, input: { progressFormula: 'weighted' } });
  });

  it('ignores an older project response that lands after navigation', async () => {
    const first = deferred<ProgressResult>();
    const second = deferred<ProgressResult>();
    const gateway = new FakeWorkManagerGateway({ projects: [project] });
    Object.assign(gateway.progress, { get: (id: string) => id === PROJECT_A ? first.promise : second.promise });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(ProgressStore);

    const loadingFirst = store.load(PROJECT_A);
    const loadingSecond = store.load(PROJECT_B);
    second.resolve({ projectId: PROJECT_B, formula: 'manual', percentage: 72, completed: 72, total: 100, explanation: '72% entered manually' });
    await loadingSecond;
    first.resolve({ projectId: PROJECT_A, formula: 'weighted', percentage: 20, completed: 2, total: 10, explanation: '2 of 10 estimate points complete' });
    await loadingFirst;

    expect(store.result()).toMatchObject({ projectId: 'project-b', percentage: 72 });
  });

  it('does not surface an old project write failure after navigation', async () => {
    const write = deferred<never>();
    const gateway = new FakeWorkManagerGateway({ projects: [project] });
    Object.assign(gateway.progress, { get: (id: typeof PROJECT_A) => Promise.resolve({ projectId: id, formula: 'count' as const, percentage: 0, completed: 0, total: 1, explanation: '0 of 1 tasks complete' }) });
    Object.assign(gateway.projects, { update: () => write.promise });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(ProgressStore);
    await store.load(PROJECT_A);

    const changing = store.setFormula('weighted');
    await store.load(PROJECT_B);
    write.reject(new GatewayError('unreachable', 0, 'old project failed'));

    expect(await changing).toBe(false);
    expect(store.error()).toBeNull();
    expect(store.result()).toMatchObject({ projectId: PROJECT_B });
  });
});
