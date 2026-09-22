import { TestBed } from '@angular/core/testing';
import {
  ProjectArchiveItemSchema,
  ProjectArchiveResultSchema,
  ProjectSchema,
  ProjectSectionSchema,
  TaskSchema,
  type ProjectArchiveResult,
  type ProjectId,
  type SectionWriteResult,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { ArchivePageStore } from './archive-page-store';

const PROJECT = 'project-a' as ProjectId;
const AT = '2026-09-02T06:13:32.422Z';
const root = ProjectSchema.parse({
  id: PROJECT,
  workspaceId: 'workspace-demo',
  kind: 'root',
  name: 'Website launch',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});
const section = ProjectSectionSchema.parse({
  id: 'section-archive',
  projectId: PROJECT,
  pageId: 'page-project-a',
  type: 'rich-text',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  archivedAt: AT,
  createdAt: AT,
  updatedAt: AT,
});
const archived: ProjectArchiveResult = ProjectArchiveResultSchema.parse({
  projectId: PROJECT,
  root,
  items: [
    ProjectArchiveItemSchema.parse({
      kind: 'section',
      section,
      origin: {
        projectId: PROJECT,
        pageId: section.pageId,
        pageKind: 'home',
        pageEnabled: true,
        breadcrumb: [{ projectId: PROJECT, name: root.name }],
      },
      cause: { kind: 'own' },
      restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
    }),
  ],
});

const setup = (options: ConstructorParameters<typeof FakeWorkManagerGateway>[0] = {}) => {
  const gateway = new FakeWorkManagerGateway({ projects: [root], sections: [section], archive: archived, ...options });
  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({
    providers: [
      ArchivePageStore,
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: LIVE_UPDATES, useValue: live },
    ],
  });
  return { store: TestBed.inject(ArchivePageStore), gateway, live };
};

describe('ArchivePageStore (§31, §62, §63)', () => {
  it('loads the root-wide projection and re-reads after a canonical restore', async () => {
    const { store, gateway } = setup();
    const liveResult = { ...archived, items: [] };
    gateway.archive.get = vi.fn()
      .mockResolvedValueOnce(archived)
      .mockResolvedValueOnce(liveResult);

    await store.load(PROJECT);
    expect(store.items()).toHaveLength(1);

    const restored = await store.restore(archived.items[0]!);

    expect(restored).toBe(true);
    expect(gateway.calls.filter(({ method }) => method === 'sections.restore')).toHaveLength(1);
    expect(store.items()).toEqual([]);
  });

  it('passes recovery metadata through unchanged and restores a container before its own archived row', async () => {
    const list = ProjectSectionSchema.parse({ ...section, id: 'section-old-list', type: 'task-list', config: {} });
    const task = TaskSchema.parse({
      id: 'task-filed',
      projectId: PROJECT,
      sectionId: list.id,
      title: 'Filed away',
      status: 'todo',
      priority: 'medium',
      archivedAt: AT,
      createdAt: AT,
      updatedAt: AT,
    });
    const origin = { ...archived.items[0]!.origin, sectionId: list.id, sectionName: 'Task List' };
    const sectionItem = ProjectArchiveItemSchema.parse({
      kind: 'section',
      section: list,
      origin,
      cause: { kind: 'own' },
      cascadeCount: 0,
      recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 1, separateRestoreCount: 1 },
      restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
    });
    const blockedTask = (restoration: unknown) =>
      ProjectArchiveItemSchema.parse({ kind: 'task', task, origin, cause: { kind: 'own' }, restoration });
    const first = ProjectArchiveResultSchema.parse({
      ...archived,
      items: [sectionItem, blockedTask({ kind: 'blocked', blocker: { kind: 'section', sectionId: list.id, name: 'Task List' } })],
    });
    const second = ProjectArchiveResultSchema.parse({
      ...archived,
      items: [blockedTask({ kind: 'ready', operation: 'restore_task', permission: 'tasks.write' })],
    });
    const { store, gateway } = setup({ sections: [list], tasks: [task] });
    gateway.archive.get = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce({ ...archived, items: [] });

    await store.load(PROJECT);
    expect(store.items()[0]).toEqual(sectionItem);
    // A blocked row is refused without a write; the UI never works around the domain's order.
    expect(await store.restore(store.items()[1]!)).toBe(false);

    expect(await store.restore(store.items()[0]!)).toBe(true);
    expect(await store.restore(store.items()[0]!)).toBe(true);

    expect(gateway.calls.map(({ method }) => method).filter((method) => method.endsWith('.restore'))).toEqual([
      'sections.restore',
      'tasks.restore',
    ]);
    expect(store.items()).toEqual([]);
  });

  it('keeps the item and reports a failed canonical write', async () => {
    const { store } = setup({ failOn: { 'sections.restore': new GatewayError('unreachable', 0, 'host offline') } });
    await store.load(PROJECT);

    expect(await store.restore(archived.items[0]!)).toBe(false);
    expect(store.items()).toHaveLength(1);
    expect(store.error()).toContain('host offline');
  });

  it('keeps the last projection when a successful restore cannot refresh it', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);
    gateway.archive.get = vi.fn(async () => {
      throw new GatewayError('unreachable', 0, 'archive read failed');
    });

    expect(await store.restore(archived.items[0]!)).toBe(true);
    expect(store.items()).toHaveLength(1);
    expect(store.error()).toContain('Restore succeeded, but Archive could not refresh');
  });

  it('serializes restore writes and disables the second stale request', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);
    let release!: (value: SectionWriteResult) => void;
    gateway.sections.restore = vi.fn(() => new Promise<SectionWriteResult>((resolve) => { release = resolve; }));

    const first = store.restore(archived.items[0]!);
    expect(await store.restore(archived.items[0]!)).toBe(false);
    expect(gateway.sections.restore).toHaveBeenCalledExactlyOnceWith(section.id);

    release({ section, operation: null });
    expect(await first).toBe(true);
  });

  it('offers a retry after the first archive read fails', async () => {
    const { store, gateway } = setup();
    gateway.archive.get = vi.fn()
      .mockRejectedValueOnce(new GatewayError('unreachable', 0, 'archive read failed'))
      .mockResolvedValueOnce(archived);

    expect(await store.load(PROJECT)).toBe(false);
    expect(store.items()).toEqual([]);
    expect(await store.retry()).toBe(true);
    expect(store.items()).toHaveLength(1);
  });

  it('does not let a late restore failure overwrite the next route’s error', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT);
    let rejectWrite!: (reason: unknown) => void;
    const write = new Promise<SectionWriteResult>((_resolve, reject) => { rejectWrite = reject; });
    gateway.sections.restore = vi.fn(() => write);
    const restoring = store.restore(archived.items[0]!);

    gateway.archive.get = vi.fn(async () => {
      throw new GatewayError('not_found', 404, 'next project is unavailable');
    });
    await store.load('project-next' as ProjectId);
    rejectWrite(new GatewayError('conflict', 409, 'old route write failed'));
    expect(await restoring).toBe(false);
    expect(store.error()).toContain('next project is unavailable');
  });

  it('refreshes when a root-tree live event arrives and stays quiet while restoring', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT);
    const reads = gateway.calls.filter(({ method }) => method === 'archive.get').length;

    live.emit({ type: 'project.updated', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    for (let index = 0; index < 8; index += 1) await Promise.resolve();

    expect(gateway.calls.filter(({ method }) => method === 'archive.get').length).toBe(reads + 1);
  });

  // Slice 39: a sub-project moved out of this root is announced under its new root only.
  it('re-reads on a project-record frame from another root but not on another root’s content', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT);
    const reads = () => gateway.calls.filter(({ method }) => method === 'archive.get').length;
    const settle = async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    };

    const before = reads();
    live.emit({ type: 'project.update_undone', entityType: 'project', entityId: 'project-moved', projectId: 'project-moved', rootProjectId: 'project-elsewhere' } as never);
    await settle();
    expect(reads()).toBe(before + 1);

    live.emit({ type: 'task.updated', entityType: 'task', entityId: 'task-9', projectId: 'project-elsewhere', rootProjectId: 'project-elsewhere' } as never);
    await settle();
    expect(reads()).toBe(before + 1);
  });
});
