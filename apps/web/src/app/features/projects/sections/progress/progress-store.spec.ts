import { TestBed } from '@angular/core/testing';
import { ProjectIdSchema, ProjectSchema, TaskSchema, type ProgressResult } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import { ProgressStore } from './progress-store';
import { provideRecordingReporter } from '../../../../core/history/testing/recording-reporter';

const project = ProjectSchema.parse({ id: 'project-a', workspaceId: 'workspace-demo', kind: 'root', name: 'Launch', status: 'active', projectLayoutMode: 'flow', createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z' });
const PROJECT_A = ProjectIdSchema.parse('project-a');
const PROJECT_B = ProjectIdSchema.parse('project-b');
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('ProgressStore', () => {
  it('serializes revision refreshes and preserves the loud result when a quiet read fails', async () => {
    const loud = deferred<ProgressResult>();
    const quiet = deferred<ProgressResult>();
    const trailing = deferred<ProgressResult>();
    const get = vi.fn().mockImplementationOnce(() => loud.promise).mockImplementationOnce(() => quiet.promise).mockImplementationOnce(() => trailing.promise);
    const gateway = new FakeWorkManagerGateway({ projects: [project] });
    Object.assign(gateway.progress, { get });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(ProgressStore);

    const loading = store.sync(PROJECT_A, 0);
    void store.sync(PROJECT_A, 1);
    expect(get).toHaveBeenCalledTimes(1);
    loud.resolve({ projectId: PROJECT_A, formula: 'count', percentage: 25, completed: 1, total: 4, explanation: 'loud' });
    await loading; await Promise.resolve();
    expect(get).toHaveBeenCalledTimes(2);
    void store.sync(PROJECT_A, 2);
    expect(get).toHaveBeenCalledTimes(2);
    quiet.reject(new GatewayError('unreachable', 0, 'quiet failed'));
    await Promise.resolve(); await Promise.resolve();
    expect(store.result()?.percentage).toBe(25);
    expect(store.error()).toBeNull();
    expect(get).toHaveBeenCalledTimes(3);
    trailing.resolve({ projectId: PROJECT_A, formula: 'count', percentage: 75, completed: 3, total: 4, explanation: 'trailing' });
    await Promise.resolve(); await Promise.resolve();
    expect(store.result()?.percentage).toBe(75);
  });

  it('persists a canonical project formula then reloads the derived answer', async () => {
    const gateway = new FakeWorkManagerGateway({
      projects: [project],
      tasks: [
        TaskSchema.parse({ id: 'task-done', projectId: project.id, sectionId: 'section-tasks', title: 'Done', status: 'done', priority: 'medium', estimate: 3, completedAt: project.updatedAt, createdAt: project.createdAt, updatedAt: project.updatedAt }),
        TaskSchema.parse({ id: 'task-todo', projectId: project.id, sectionId: 'section-tasks', title: 'Todo', status: 'todo', priority: 'medium', estimate: 1, createdAt: project.createdAt, updatedAt: project.updatedAt }),
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
    // Slice 78: a failed re-read after the write is the polite stale form, the result kept.
    expect(store.error()).toBeNull();
    expect(store.writeError()).toBeNull();
    expect(store.stale()).toEqual({ sentence: 'This progress may be out of date.', reason: 'refresh failed' });
    expect(store.result()?.percentage).toBe(0);
    expect(gateway.argumentTo('projects.update')).toEqual({ id: project.id, input: { progressFormula: 'weighted' } });

    // A stale Try again is quiet: failing again it stays stale and keeps the result.
    await store.retryStale();
    expect(store.stale()?.sentence).toBe('This progress may be out of date.');
    expect(store.loading()).toBe(false);
    expect(store.result()?.percentage).toBe(0);

    options.failOn = {};
    const retrying = store.retryStale();
    expect(store.stalePending()).toBe(true);
    await retrying;
    expect(store.stalePending()).toBe(false);
    expect(store.stale()).toBeNull();
  });

  it('keeps a formula write failure apart from the read: the result stays, with the sentence and its reason (Slice 78)', async () => {
    const options: ConstructorParameters<typeof FakeWorkManagerGateway>[0] = {
      projects: [project],
      progress: { projectId: project.id, formula: 'count', percentage: 40, completed: 2, total: 5, explanation: '2 of 5 tasks complete' },
    };
    const gateway = new FakeWorkManagerGateway(options);
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(ProgressStore);
    await store.load(project.id);
    options.failOn = { 'projects.update': new GatewayError('internal_error', 500, 'update refused') };

    expect(await store.setFormula('weighted')).toBe(false);

    expect(store.writeError()).toEqual({ sentence: 'Couldn’t change how progress is measured. Try again.', reason: 'update refused' });
    expect(store.error()).toBeNull();
    expect(store.result()?.percentage).toBe(40);
  });

  it('keeps a failed read on screen through Try again until it answers, then clears it (Slice 78)', async () => {
    const again = deferred<ProgressResult>();
    const get = vi.fn()
      .mockRejectedValueOnce(new GatewayError('not_found', 404, 'Project project-a was not found'))
      .mockImplementationOnce(() => again.promise);
    const gateway = new FakeWorkManagerGateway({ projects: [project] });
    Object.assign(gateway.progress, { get });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(ProgressStore);
    await store.load(PROJECT_A);
    expect(store.error()?.sentence).toBe('Progress isn’t available.');

    const retrying = store.retry();
    expect(store.loading()).toBe(true);
    expect(store.error()?.sentence).toBe('Progress isn’t available.');
    again.resolve({ projectId: PROJECT_A, formula: 'count', percentage: 10, completed: 1, total: 10, explanation: 'back' });
    await retrying;

    expect(store.error()).toBeNull();
    expect(store.result()?.percentage).toBe(10);
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
    expect(store.writeError()).toBeNull();
    expect(store.result()).toMatchObject({ projectId: PROJECT_B });
  });
});

describe('ProgressStore reports the progress setting to the header’s history (Slice 41)', () => {
  it('commits the updated project’s id, name and receipt', async () => {
    const reporter = provideRecordingReporter();
    const gateway = new FakeWorkManagerGateway({ projects: [project] });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(ProgressStore);
    await store.load(project.id);

    expect(await store.setFormula('manual', 40)).toBe(true);

    expect(reporter.events).toEqual([
      'begin',
      { projectId: project.id, projectName: 'Launch', receipt: expect.objectContaining({ operation: 'project.update' }) },
      'end',
    ]);
  });
});
