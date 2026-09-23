import { TestBed } from '@angular/core/testing';
import {
  ProjectJournalResultSchema,
  type ProjectJournalResult,
  ProjectPageSchema,
  ProjectSchema,
  ProjectSectionSchema,
  ProjectCompletedWorkResultSchema,
  type Reflection,
  type ProjectId,
  type ProjectPageId,
  type OperationActionId,
  type OperationHistoryId,
  type OperationReceipt,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { OPERATION_HISTORY_REPORTER, type OperationWriteReport } from '../../../core/history/operation-history-reporter';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { ReflectionsPageStore } from './reflections-page-store';

const AT = '2026-09-05T10:00:00.000Z';
const PROJECT = 'project-journal' as ProjectId;
const PAGE = 'page-journal' as ProjectPageId;
const root = ProjectSchema.parse({
  id: PROJECT,
  workspaceId: 'workspace-demo',
  kind: 'root',
  name: 'Product launch',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});
const page = ProjectPageSchema.parse({ id: PAGE, projectId: PROJECT, kind: 'reflections', enabled: true, createdAt: AT, updatedAt: AT });
const container = ProjectSectionSchema.parse({
  id: 'section-journal',
  projectId: PROJECT,
  pageId: PAGE,
  type: 'reflections',
  title: 'Weekly notes',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  createdAt: AT,
  updatedAt: AT,
});
const journal = ProjectJournalResultSchema.parse({
  projectId: PROJECT,
  items: [
    {
      reflection: {
        id: 'reflection-journal',
        projectId: PROJECT,
        sectionId: container.id,
        subject: { kind: 'task', id: 'task-shipped' },
        title: 'Launch checkpoint',
        body: 'The first release is out.',
        createdAt: AT,
        updatedAt: AT,
      },
      origin: {
        projectId: PROJECT,
        pageId: PAGE,
        pageKind: 'reflections',
        breadcrumb: [{ projectId: PROJECT, name: root.name }],
        sectionId: container.id,
        sectionName: container.title ?? 'Reflections',
      },
      subject: {
        kind: 'task',
        id: 'task-shipped',
        name: 'Ship the first release',
        status: 'done',
        completedAt: AT,
        archived: false,
        hiddenByArchivedAncestor: false,
        breadcrumb: [{ projectId: PROJECT, name: root.name }],
      },
    },
  ],
});
const completedWork = ProjectCompletedWorkResultSchema.parse({
  projectId: PROJECT,
  candidates: [journal.items[0]!.subject!],
});
const addReceipt: OperationReceipt = {
  historyId: 'history-journal' as OperationHistoryId,
  actionId: 'operation-reflections-add' as OperationActionId,
  operation: 'section.add',
  revision: 1,
  label: 'Add reflections',
  createdAt: AT,
  expiresAt: '2026-09-06T10:00:00.000Z',
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

const setup = () => {
  const gateway = new FakeWorkManagerGateway({
    projects: [root],
    pages: [page],
    sections: [container],
    journal,
    completedWork,
  });
  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({
    providers: [
      ReflectionsPageStore,
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: LIVE_UPDATES, useValue: live },
    ],
  });
  return { store: TestBed.inject(ReflectionsPageStore), gateway, live };
};

describe('ReflectionsPageStore (§36, §62, §63)', () => {
  it('loads the journal, picker and page-owned container independently', async () => {
    const { store, gateway } = setup();

    await store.load(PROJECT, PAGE);

    expect(store.items().map(({ reflection }) => reflection.id)).toEqual(['reflection-journal']);
    expect(store.candidates().map(({ id }) => id)).toEqual(['task-shipped']);
    expect(store.container()?.id).toBe(container.id);
    expect(gateway.calls.map(({ method }) => method)).toEqual(
      expect.arrayContaining(['journal.get', 'journal.completedWork', 'sections.list']),
    );
  });

  it('keeps the picker usable when the journal read fails, and retries only that read', async () => {
    const { store, gateway } = setup();
    gateway.journal.get = async () => {
      throw new GatewayError('unreachable', 0, 'journal offline');
    };

    expect(await store.load(PROJECT, PAGE)).toBeUndefined();
    expect(store.journalError()).toContain('journal offline');
    expect(store.candidates()).toHaveLength(1);

    gateway.journal.get = async () => journal;
    expect(await store.retryJournal()).toBe(true);
    expect(store.journalError()).toBeNull();
  });

  it('keeps the journal usable when the picker read fails, and retries only the picker', async () => {
    const { store, gateway } = setup();
    gateway.journal.completedWork = async () => {
      throw new GatewayError('unreachable', 0, 'picker offline');
    };

    await store.load(PROJECT, PAGE);

    expect(store.pickerError()).toContain('picker offline');
    expect(store.items()).toHaveLength(1);
    const before = gateway.calls.filter(({ method }) => method === 'journal.get').length;
    gateway.journal.completedWork = async () => completedWork;
    expect(await store.retryCompletedWork()).toBe(true);
    expect(store.pickerError()).toBeNull();
    expect(gateway.calls.filter(({ method }) => method === 'journal.get').length).toBe(before);
  });

  it('writes the selected subject, refreshes the feed, and preserves the container boundary', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT, PAGE);

    expect(await store.create('  A note  ', '  Check-in  ', 'What changed?', store.candidates()[0])).toBe(true);
    expect(gateway.argumentTo('reflections.create')).toEqual({
      projectId: PROJECT,
      sectionId: container.id,
      title: 'Check-in',
      body: 'A note',
      prompt: 'What changed?',
      subject: { kind: 'task', id: 'task-shipped' },
    });
    expect(gateway.calls.filter(({ method }) => method === 'journal.get').length).toBe(2);
  });

  it('does not let a pre-write journal read repaint the feed after the write', async () => {
    const { store, gateway } = setup();
    const first = deferred<ProjectJournalResult>();
    const afterWrite: ProjectJournalResult = ProjectJournalResultSchema.parse({
      ...journal,
      items: [{ ...journal.items[0]!, reflection: { ...journal.items[0]!.reflection, id: 'reflection-after-write' } }],
    });
    gateway.journal.get = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(afterWrite);
    const loading = store.load(PROJECT, PAGE);
    for (let index = 0; index < 5; index += 1) await Promise.resolve();

    const creating = store.create('A new note');
    await Promise.resolve();
    expect(gateway.calls.filter(({ method }) => method === 'reflections.create')).toHaveLength(1);
    first.resolve(journal);

    expect(await creating).toBe(true);
    await loading;
    expect(store.items().map(({ reflection }) => reflection.id)).toEqual(['reflection-after-write']);
  });

  it('separates a committed write from a failed refresh and retries only the read', async () => {
    const { store, gateway } = setup();
    await store.load(PROJECT, PAGE);
    gateway.journal.get = vi.fn().mockRejectedValueOnce(new GatewayError('unreachable', 0, 'refresh offline')).mockResolvedValueOnce(journal);

    expect(await store.create('A saved note')).toBe(true);
    expect(store.refreshError()).toContain('journal could not refresh');
    expect(gateway.calls.filter(({ method }) => method === 'reflections.create')).toHaveLength(1);

    expect(await store.retryRefresh()).toBe(true);
    expect(store.refreshError()).toBeNull();
    expect(gateway.calls.filter(({ method }) => method === 'reflections.create')).toHaveLength(1);
  });

  it('creates the missing page container with pageId only', async () => {
    const { store, gateway } = setup();
    gateway.sections.list = async () => [];
    gateway.sections.create = vi.fn(async (_projectId, input) => ({
      section: { ...container, ...input, projectId: PROJECT, pageId: PAGE },
      operation: addReceipt,
    }));
    await store.load(PROJECT, PAGE);

    expect(await store.ensureContainer()).toBe(true);
    expect(gateway.sections.create).toHaveBeenCalledExactlyOnceWith(PROJECT, { type: 'reflections', pageId: PAGE });
    expect(store.container()?.id).toBe(container.id);
  });

  it('uses the first page container for writes while exposing additional containers to the page', async () => {
    const { store, gateway } = setup();
    const second = ProjectSectionSchema.parse({
      ...container,
      id: 'section-journal-second',
      title: 'Other notes',
      position: 1,
    });
    gateway.options.sections = [container, second];

    await store.load(PROJECT, PAGE);

    expect(store.container()?.id).toBe(container.id);
    expect(store.containerCount()).toBe(2);
  });

  it('keeps the page without a container and exposes a failed container create', async () => {
    const { store, gateway } = setup();
    gateway.sections.list = async () => [];
    gateway.sections.create = async () => {
      throw new GatewayError('conflict', 409, 'The page could not add a Reflections container.');
    };

    await store.load(PROJECT, PAGE);

    expect(await store.ensureContainer()).toBe(false);
    expect(store.container()).toBeNull();
    expect(store.containerError()).toContain('could not add');
  });

  it('refreshes all three projections after a matching live event', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const before = gateway.calls.length;

    live.emit({ type: 'reflection.added', entityType: 'reflection', entityId: 'reflection-new', projectId: PROJECT });
    for (let index = 0; index < 8; index += 1) await Promise.resolve();

    expect(gateway.calls.length).toBeGreaterThan(before);
  });

  // Slice 39: a completed sub-project moved to another root leaves this root's Completed Work, and
  // the one frame announcing it names only the root it moved to.
  it('refreshes on a project-record frame from another root, but not on another root’s content', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const settle = async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    };

    const before = gateway.calls.length;
    live.emit({ type: 'project.update_undone', entityType: 'project', entityId: 'project-moved', projectId: 'project-moved', rootProjectId: 'project-elsewhere' } as never);
    await settle();
    const afterRecord = gateway.calls.length;
    expect(afterRecord).toBeGreaterThan(before);

    live.emit({ type: 'reflection.added', entityType: 'reflection', entityId: 'reflection-far', projectId: 'project-elsewhere', rootProjectId: 'project-elsewhere' } as never);
    await settle();
    expect(gateway.calls.length).toBe(afterRecord);
  });

  it('discards a late journal answer after the page changes projects', async () => {
    const { store, gateway } = setup();
    const stale = deferred<ProjectJournalResult>();
    const nextProject = 'project-next' as ProjectId;
    const nextPage = 'page-next' as ProjectPageId;
    gateway.journal.get = vi.fn()
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValue({ projectId: nextProject, items: [] });

    const previousLoad = store.load(PROJECT, PAGE);
    await store.load(nextProject, nextPage);
    stale.resolve(journal);
    await previousLoad;

    expect(store.result()).toEqual({ projectId: nextProject, items: [] });
    expect(store.journalError()).toBeNull();
  });

  it('unsubscribes and suppresses an in-flight create after teardown', async () => {
    const { store, gateway, live } = setup();
    await store.load(PROJECT, PAGE);
    const write = deferred<Reflection>();
    gateway.reflections.create = async () => ({ reflection: await write.promise, operation: { ...addReceipt, operation: 'reflection.add' } });
    const creation = store.create('A note');

    TestBed.resetTestingModule();

    expect(live.listenerCount).toBe(0);
    write.resolve(journal.items[0]!.reflection);
    expect(await creation).toBe(false);
  });
});

describe('ReflectionsPageStore — writes report to the header’s history (Slice 41)', () => {
  const recording = () => {
    const events: Array<'begin' | 'end' | OperationWriteReport> = [];
    return {
      events,
      begin: () => {
        events.push('begin');
        return () => void events.push('end');
      },
      committed: (report: OperationWriteReport) => void events.push(report),
    };
  };
  const setupReported = () => {
    const reporter = recording();
    TestBed.configureTestingModule({ providers: [{ provide: OPERATION_HISTORY_REPORTER, useValue: reporter }] });
    return { ...setup(), reporter };
  };

  it('reports the explicit container add with the section’s project, and holds no receipt of its own', async () => {
    const { store, gateway, reporter } = setupReported();
    gateway.sections.list = async () => [];
    gateway.sections.create = vi.fn(async (_projectId, input) => ({
      section: { ...container, ...input, projectId: PROJECT, pageId: PAGE }, operation: addReceipt,
    }));
    await store.load(PROJECT, PAGE);

    expect(await store.ensureContainer()).toBe(true);

    expect(reporter.events).toEqual(['begin', { projectId: PROJECT, receipt: addReceipt }, 'end']);
    expect(Object.keys(store)).not.toContain('undoNoticeState');
  });

  it('returns to the empty-container prompt when a header Undo’s frame arrives', async () => {
    const { store, gateway, live } = setupReported();
    let listed = [container];
    gateway.sections.list = async () => [...listed];
    await store.load(PROJECT, PAGE);
    expect(store.container()?.id).toBe(container.id);

    listed = [];
    live.emit({ type: 'project.section_addition_undone', entityType: 'project', entityId: PROJECT, projectId: PROJECT });
    for (let index = 0; index < 8; index += 1) await Promise.resolve();

    expect(store.container()).toBeNull();
    expect(store.containerCount()).toBe(0);
  });

  it('reports a reflection write with the reflection’s own project', async () => {
    const { store, reporter } = setupReported();
    await store.load(PROJECT, PAGE);

    expect(await store.create('A note')).toBe(true);

    const report = reporter.events.find((event): event is OperationWriteReport => typeof event === 'object');
    expect(report).toMatchObject({ projectId: PROJECT, receipt: { operation: 'reflection.add' } });
    expect(reporter.events.at(-1)).toBe('end');
  });
});
