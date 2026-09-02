import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, ReflectionSchema, type ProjectSection, type Reflection } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import {
  WORK_MANAGER_GATEWAY,
  type WorkManagerGateway,
} from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { ReflectionsStore } from './reflections-store';

/** The container the list renders: a reflections section owns its rows. */
const section = (projectId = 'project-a'): ProjectSection =>
  ProjectSectionSchema.parse({
    id: `section-${projectId}-reflections`,
    projectId,
    type: 'reflections',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: '2026-08-26T16:00:00.000Z',
    updatedAt: '2026-08-26T16:00:00.000Z',
  });

const reflection = (overrides: Record<string, unknown> = {}): Reflection =>
  ReflectionSchema.parse({
    id: 'reflection-a',
    projectId: 'project-a',
    sectionId: 'section-project-a-reflections',
    body: 'The first note',
    createdAt: '2026-08-26T16:00:00.000Z',
    updatedAt: '2026-08-26T16:00:00.000Z',
    ...overrides,
  });

const setup = (gateway: WorkManagerGateway) => {
  TestBed.configureTestingModule({
    providers: [ReflectionsStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  return TestBed.inject(ReflectionsStore);
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('ReflectionsStore (§36)', () => {
  it('serializes revision refreshes and keeps reflections on a quiet failure', async () => {
    const loud = deferred<Reflection[]>(); const quiet = deferred<Reflection[]>(); const trailing = deferred<Reflection[]>();
    const list = vi.fn().mockImplementationOnce(() => loud.promise).mockImplementationOnce(() => quiet.promise).mockImplementationOnce(() => trailing.promise);
    const base = new FakeWorkManagerGateway();
    const store = setup({ ...base, reflections: { ...base.reflections, list } } as WorkManagerGateway);
    const loading = store.sync(section()); void store.sync(section());
    expect(list).toHaveBeenCalledTimes(1);
    loud.resolve([reflection({ id: 'reflection-loud' })]); await loading; await Promise.resolve();
    void store.sync(section()); expect(list).toHaveBeenCalledTimes(2);
    quiet.reject(new GatewayError('unreachable', 0, 'quiet failed')); await Promise.resolve(); await Promise.resolve();
    expect(store.reflections().map(({ id }) => id)).toEqual(['reflection-loud']); expect(store.error()).toBeNull(); expect(list).toHaveBeenCalledTimes(3);
    trailing.resolve([reflection({ id: 'reflection-trailing' })]); await Promise.resolve(); await Promise.resolve();
    expect(store.reflections().map(({ id }) => id)).toEqual(['reflection-trailing']);
  });

  it('loads its own container and sorts the response newest-first', async () => {
    const gateway = new FakeWorkManagerGateway({
      reflections: [
        reflection(),
        reflection({ id: 'reflection-new', createdAt: '2026-08-28T16:00:00.000Z' }),
      ],
    });
    const store = setup(gateway);

    await store.load(section());

    // Narrowed to the container: a reflections section renders what it owns.
    expect(gateway.argumentTo('reflections.list')).toEqual({
      projectId: 'project-a',
      sectionId: section().id,
    });
    expect(store.reflections().map(({ id }) => id)).toEqual(['reflection-new', 'reflection-a']);
  });

  it('creates trimmed body-only, titled, and prompted entries in the loaded project', async () => {
    const gateway = new FakeWorkManagerGateway({ reflections: [] });
    const store = setup(gateway);
    await store.load(section());

    expect(await store.create('  What moved forward  ', '  Weekly review  ', 'What changed?')).toBe(true);
    expect(gateway.argumentTo('reflections.create')).toEqual({
      projectId: 'project-a',
      sectionId: section().id,
      body: 'What moved forward',
      title: 'Weekly review',
      prompt: 'What changed?',
    });

    expect(await store.create('  A body-only note  ', '   ', '')).toBe(true);
    expect(gateway.calls.at(-1)?.argument).toEqual({
      projectId: 'project-a',
      sectionId: section().id,
      body: 'A body-only note',
    });
  });

  it('rejects a blank body and exposes gateway failures without losing loaded entries', async () => {
    const before = reflection();
    const gateway = new FakeWorkManagerGateway({
      reflections: [before],
      failOn: { 'reflections.create': new GatewayError('unreachable', 0, 'host unavailable') },
    });
    const store = setup(gateway);
    await store.load(section());

    expect(await store.create('   ')).toBe(false);
    expect(store.error()).toContain('body');
    expect(await store.create('Valid')).toBe(false);
    expect(store.error()).toContain('host unavailable');
    expect(store.reflections()).toEqual([before]);
  });

  it('starts, cancels, and saves a trimmed title/body edit', async () => {
    const before = reflection({ title: 'Before' });
    const gateway = new FakeWorkManagerGateway({ reflections: [before] });
    const store = setup(gateway);
    await store.load(section());

    store.beginEdit(before.id);
    expect(store.editingId()).toBe(before.id);
    store.cancelEdit();
    expect(store.editingId()).toBeNull();

    store.beginEdit(before.id);
    expect(await store.saveEdit('   ', '  Revised body  ')).toBe(true);
    expect(gateway.argumentTo('reflections.update')).toEqual({
      id: before.id,
      input: { title: null, body: 'Revised body' },
    });
    expect(store.reflections()[0]).toMatchObject({ body: 'Revised body', createdAt: before.createdAt });
    expect(store.editingId()).toBeNull();
  });

  it('keeps edit mode and shows a message when save fails', async () => {
    const before = reflection();
    const gateway = new FakeWorkManagerGateway({
      reflections: [before],
      failOn: { 'reflections.update': new GatewayError('unreachable', 0, 'save failed') },
    });
    const store = setup(gateway);
    await store.load(section());
    store.beginEdit(before.id);

    expect(await store.saveEdit('Title', 'Body')).toBe(false);
    expect(store.editingId()).toBe(before.id);
    expect(store.error()).toContain('save failed');
  });

  it('ignores an older load response after navigation', async () => {
    const older = deferred<Reflection[]>();
    const list = vi
      .fn<WorkManagerGateway['reflections']['list']>()
      .mockImplementationOnce(() => older.promise)
      .mockResolvedValueOnce([reflection({ id: 'reflection-b', projectId: 'project-b' })]);
    const base = new FakeWorkManagerGateway();
    const gateway = { ...base, reflections: { ...base.reflections, list } } as WorkManagerGateway;
    const store = setup(gateway);

    const first = store.load(section());
    await store.load(section('project-b'));
    older.resolve([reflection({ id: 'reflection-stale' })]);
    await first;

    expect(store.projectId()).toBe('project-b');
    expect(store.reflections().map(({ id }) => id)).toEqual(['reflection-b']);
  });
});
