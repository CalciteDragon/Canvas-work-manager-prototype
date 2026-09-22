import { TestBed } from '@angular/core/testing';
import {
  ProjectPageSchema,
  ProjectSchema,
  ProjectStatusSchema,
  type OperationActionId,
  type OperationHistoryId,
  type OperationKind,
  type Project,
  type ProjectWriteResult,
  type ProjectId,
  type ProjectPage,
  type ProjectPageWriteResult,
  type ProjectQuery,
} from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway, type FakeGatewayOptions } from '../../core/gateway/testing/fake-gateway';
import { LIVE_UPDATES } from '../../core/live/live-updates';
import { FakeLiveUpdates } from '../../core/live/testing/fake-live-updates';
import { ProjectWorkspaceStore } from './project-workspace-store';

const AT = '2026-08-27T16:00:00.000Z';

const root = (id: string, name: string, overrides: Record<string, unknown> = {}): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    kind: 'root',
    name,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const child = (
  id: string,
  name: string,
  parentProjectId: string,
  overrides: Record<string, unknown> = {},
): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    kind: 'subproject',
    name,
    parentProjectId,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const page = (id: string, projectId: string, kind: ProjectPage['kind'], enabled = true): ProjectPage =>
  ProjectPageSchema.parse({ id, projectId, kind, enabled, createdAt: AT, updatedAt: AT });

/** The `nested-projects` shape: renovation → kitchen → cabinets, plus a sibling garden. */
const renovation = () => [
  root('project-renovation', 'Home renovation'),
  child('project-kitchen', 'Kitchen', 'project-renovation'),
  child('project-cabinets', 'Cabinets', 'project-kitchen'),
  child('project-garden', 'Garden', 'project-renovation'),
];

const storeWith = (options: FakeGatewayOptions = {}, live = new FakeLiveUpdates()) => {
  TestBed.configureTestingModule({
    providers: [
      ProjectWorkspaceStore,
      { provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway(options) },
      { provide: LIVE_UPDATES, useValue: live },
    ],
  });
  return {
    store: TestBed.inject(ProjectWorkspaceStore),
    gateway: TestBed.inject(WORK_MANAGER_GATEWAY) as FakeWorkManagerGateway,
    live,
  };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};

describe('ProjectWorkspaceStore — the project context (§23, §26)', () => {
  it('loads a root, its pages and the work hierarchy beneath it', async () => {
    const { store } = storeWith({ projects: renovation() });

    await store.load('project-renovation' as ProjectId);

    expect(store.project()?.name).toBe('Home renovation');
    expect(store.root()?.id).toBe('project-renovation');
    expect(store.breadcrumbs()).toEqual([]);
    expect(store.pages().map((page) => page.kind)).toEqual(['home']);
    expect(store.subprojectTree().map((node) => node.project.name)).toEqual(['Kitchen', 'Garden']);
    expect(store.subprojectTree()[0]?.children.map((node) => node.project.name)).toEqual(['Cabinets']);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  // §23: "Opening a subproject keeps its root's column and adds breadcrumbs back through its
  // parents." Three levels counting the root is the deepest the seed goes.
  it('keeps a depth-three sub-project in its root context, with breadcrumbs through its parents', async () => {
    const { store } = storeWith({ projects: renovation() });

    await store.load('project-cabinets' as ProjectId);

    expect(store.project()?.name).toBe('Cabinets');
    expect(store.root()?.name).toBe('Home renovation');
    expect(store.breadcrumbs().map((project) => project.name)).toEqual(['Home renovation', 'Kitchen']);
    expect(store.subprojectTree().map((node) => node.project.name)).toEqual(['Kitchen', 'Garden']);
  });

  // The root's pages drive navigation; the sub-project's own `work` page is the canvas's
  // identity, and `pages.list(rootId)` never returns it.
  it('reads a sub-project’s own pages as well as its root’s', async () => {
    const { store, gateway } = storeWith({ projects: renovation() });

    await store.load('project-cabinets' as ProjectId);

    expect(store.pages().map((page) => page.kind)).toEqual(['home']);
    expect(store.ownPages().map((page) => page.kind)).toEqual(['work']);
    expect(gateway.calls.filter(({ method }) => method === 'pages.list')).toHaveLength(2);
  });

  it('asks for one page list only when the project is its own root', async () => {
    const { store, gateway } = storeWith({ projects: renovation() });

    await store.load('project-renovation' as ProjectId);

    expect(gateway.calls.filter(({ method }) => method === 'pages.list')).toHaveLength(1);
  });

  // §31: archived work does not appear in ordinary views, and the column is navigation.
  // Asserted on the argument because the fake answers `projects.list` regardless of query.
  it('asks for every project status except archived', async () => {
    const { store, gateway } = storeWith({ projects: renovation() });

    await store.load('project-renovation' as ProjectId);

    const query = gateway.argumentTo('projects.list') as ProjectQuery;
    expect(query.status).toEqual(['planning', 'active', 'on_hold', 'completed']);
    expect(query.status).toHaveLength(ProjectStatusSchema.options.length - 1);
  });

  // §31: "a read that names a project always answers, because an archived project's own page
  // keeps rendering." The filtered list cannot supply its ancestors, so the chain is walked.
  it('builds breadcrumbs for a project the navigation filter excludes', async () => {
    const projects = renovation();
    const { store } = storeWith({
      projects: [...projects, child('project-attic', 'Attic', 'project-kitchen', { status: 'archived' })],
    });

    await store.load('project-attic' as ProjectId);

    expect(store.breadcrumbs().map((project) => project.name)).toEqual(['Home renovation', 'Kitchen']);
    expect(store.project()?.name).toBe('Attic');
    expect(store.error()).toBeNull();
  });

  it('settles into one visible message when the project cannot be read', async () => {
    const { store } = storeWith({
      projects: renovation(),
      failOn: { 'projects.get': new GatewayError('not_found', 404, 'no such project "ghost"') },
    });

    await store.load('project-renovation' as ProjectId);

    expect(store.error()).toContain('no such project');
    expect(store.project()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('discards a late response from the project the user has already left', async () => {
    const projects = renovation();
    const slow = deferred<Project>();
    const gateway = new FakeWorkManagerGateway({ projects });
    const original = gateway.projects.get.bind(gateway.projects);
    gateway.projects.get = (id: ProjectId) =>
      id === 'project-kitchen' ? slow.promise : original(id);
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: LIVE_UPDATES, useValue: new FakeLiveUpdates() },
      ],
    });
    const store = TestBed.inject(ProjectWorkspaceStore);

    const first = store.load('project-kitchen' as ProjectId);
    await store.load('project-garden' as ProjectId);
    slow.resolve(projects[1]!);
    await first;

    expect(store.project()?.name).toBe('Garden');
  });
});

describe('ProjectWorkspaceStore and live updates (§62)', () => {
  it('refreshes header progress on a task event for this project', async () => {
    const live = new FakeLiveUpdates();
    const { store, gateway } = storeWith({ projects: renovation() }, live);
    await store.load('project-renovation' as ProjectId);
    const before = gateway.calls.filter(({ method }) => method === 'progress.get').length;

    live.emit({
      type: 'task.completed',
      entityType: 'task',
      entityId: 'task-1',
      projectId: 'project-renovation',
      rootProjectId: 'project-renovation',
      actor: { kind: 'agent', id: 'agent-1', name: 'Claude' },
      at: AT,
    } as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(gateway.calls.filter(({ method }) => method === 'progress.get').length).toBe(before + 1);
    expect(gateway.calls.filter(({ method }) => method === 'projects.get').length).toBe(1);
  });

  /**
   * A page Undo or Redo publishes a project-scoped frame (Slice 38), so the context — and with it
   * the page list the router resolves a tab against — is re-read without the store knowing
   * anything about the new verbs.
   */
  it('re-reads the page context when someone reverses a page toggle', async () => {
    const live = new FakeLiveUpdates();
    const { store, gateway } = storeWith(
      { projects: renovation(), pages: [page('page-project-renovation-home', 'project-renovation', 'home')] },
      live,
    );
    await store.load('project-renovation' as ProjectId);
    const reads = () => gateway.calls.filter(({ method }) => method === 'pages.list').length;

    for (const type of ['project.page_addition_undone', 'project.page_addition_redone', 'project.page_update_undone', 'project.page_update_redone']) {
      const before = reads();
      live.emit({
        type,
        entityType: 'project',
        entityId: 'project-renovation',
        projectId: 'project-renovation',
        rootProjectId: 'project-renovation',
        actor: { kind: 'user', id: 'user-1', name: 'Sam' },
        at: AT,
      } as never);
      await new Promise((resolve) => setTimeout(resolve, 0));
      // A macrotask, so this frame's whole context read finishes before the next frame arrives —
      // otherwise the refresh coalescing would fold them together. Each verb is then proved on
      // its own, so one refreshing frame cannot cover for another that does not.
      expect(reads(), type).toBeGreaterThan(before);
    }
  });

  // `rootProjectId` is right for the tree and wrong for the record: a sibling three levels
  // away must not put a `projects.get` behind every frame it produces.
  it('leaves this project’s record alone when a sibling sub-project is written', async () => {
    const live = new FakeLiveUpdates();
    const { store, gateway } = storeWith({ projects: renovation() }, live);
    await store.load('project-kitchen' as ProjectId);
    const before = gateway.calls.filter(({ method }) => method === 'projects.get').length;

    live.emit({
      type: 'task.created',
      entityType: 'task',
      entityId: 'task-2',
      projectId: 'project-garden',
      rootProjectId: 'project-renovation',
      actor: { kind: 'agent', id: 'agent-1', name: 'Claude' },
      at: AT,
    } as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(gateway.calls.filter(({ method }) => method === 'projects.get').length).toBe(before);
  });

  /**
   * Slice 39: a cross-root reparent — forward, Undo or Redo — publishes one frame naming the
   * sub-project's **current** root. The root it left still has to drop it from its tree, so the
   * work hierarchy re-reads on a project-record frame from anywhere in the workspace.
   */
  it('re-reads the work hierarchy when a sub-project moves to or from another root', async () => {
    const live = new FakeLiveUpdates();
    const { store, gateway } = storeWith({ projects: renovation() }, live);
    await store.load('project-renovation' as ProjectId);
    const lists = () => gateway.calls.filter(({ method }) => method === 'projects.list').length;

    for (const type of ['project.updated', 'project.update_undone', 'project.update_redone']) {
      const before = lists();
      live.emit({
        type,
        entityType: 'project',
        entityId: 'project-kitchen',
        projectId: 'project-kitchen',
        rootProjectId: 'project-elsewhere',
        actor: { kind: 'user', id: 'user-1', name: 'Sam' },
        at: AT,
      } as never);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(lists(), type).toBeGreaterThan(before);
    }

    const before = lists();
    live.emit({
      type: 'project.section_added',
      entityType: 'project',
      entityId: 'project-elsewhere',
      projectId: 'project-elsewhere',
      rootProjectId: 'project-elsewhere',
      actor: { kind: 'user', id: 'user-1', name: 'Sam' },
      at: AT,
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lists()).toBe(before);
  });

  it('re-reads the work hierarchy when a project is created anywhere in this root', async () => {
    const live = new FakeLiveUpdates();
    const { store, gateway } = storeWith({ projects: renovation() }, live);
    await store.load('project-renovation' as ProjectId);
    const before = gateway.calls.filter(({ method }) => method === 'projects.list').length;

    live.emit({
      type: 'project.created',
      entityType: 'project',
      entityId: 'project-new',
      projectId: 'project-new',
      rootProjectId: 'project-renovation',
      actor: { kind: 'agent', id: 'agent-1', name: 'Claude' },
      at: AT,
    } as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(gateway.calls.filter(({ method }) => method === 'projects.list').length).toBe(before + 1);
  });

  // A context read is four or five sequential round trips, so a burst of frames would otherwise
  // start overlapping reads whose guards are identical — and whichever finished last would win,
  // which is how a stale name gets painted over a fresh one.
  it('coalesces a burst of frames into one read and one trailing re-read', async () => {
    const live = new FakeLiveUpdates();
    const projects = renovation();
    const gate = deferred<Project>();
    const gateway = new FakeWorkManagerGateway({ projects });
    const original = gateway.projects.get.bind(gateway.projects);
    let firstRefresh = true;
    let loaded = false;
    gateway.projects.get = (id: ProjectId) => {
      if (loaded && firstRefresh && id === 'project-renovation') {
        firstRefresh = false;
        return gate.promise;
      }
      return original(id);
    };
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: LIVE_UPDATES, useValue: live },
      ],
    });
    const store = TestBed.inject(ProjectWorkspaceStore);
    await store.load('project-renovation' as ProjectId);
    loaded = true;
    const before = gateway.calls.filter(({ method }) => method === 'projects.list').length;

    const frame = {
      type: 'project.updated',
      entityType: 'project',
      entityId: 'project-renovation',
      projectId: 'project-renovation',
      rootProjectId: 'project-renovation',
      actor: { kind: 'agent', id: 'agent-1', name: 'Claude' },
      at: AT,
    };
    live.emit(frame as never);
    live.emit(frame as never);
    live.emit(frame as never);
    await Promise.resolve();
    // All three frames are behind one in-flight read, not three racing ones.
    expect(gateway.calls.filter(({ method }) => method === 'projects.list').length).toBe(before);

    gate.resolve(projects[0]!);
    for (let pass = 0; pass < 8; pass += 1) await Promise.resolve();

    // One trailing re-read for everything that arrived while the first was in flight.
    expect(gateway.calls.filter(({ method }) => method === 'projects.list').length).toBe(before + 2);
  });

  it('does not let a pre-toggle context read overwrite the reconciled Archive page', async () => {
    const live = new FakeLiveUpdates();
    const projects = renovation();
    const gateway = new FakeWorkManagerGateway({ projects });
    const originalGet = gateway.projects.get.bind(gateway.projects);
    const originalPagesList = gateway.pages.list.bind(gateway.pages);
    const stalePages = await originalPagesList('project-renovation' as ProjectId);
    const gate = deferred<Project>();
    let blockRefresh = false;
    let oldRefreshInFlight = false;
    let openingRead = false;

    gateway.projects.get = (id: ProjectId) => {
      if (blockRefresh && id === 'project-renovation') {
        blockRefresh = false;
        oldRefreshInFlight = true;
        return gate.promise;
      }
      return originalGet(id);
    };
    gateway.pages.list = (projectId: ProjectId) => {
      if (openingRead) {
        openingRead = false;
        return originalPagesList(projectId);
      }
      if (oldRefreshInFlight) {
        oldRefreshInFlight = false;
        return Promise.resolve(stalePages);
      }
      return originalPagesList(projectId);
    };
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: LIVE_UPDATES, useValue: live },
      ],
    });
    const store = TestBed.inject(ProjectWorkspaceStore);
    await store.load('project-renovation' as ProjectId);
    blockRefresh = true;

    live.emit({
      type: 'project.updated',
      entityType: 'project',
      entityId: 'project-renovation',
      projectId: 'project-renovation',
      rootProjectId: 'project-renovation',
      actor: { kind: 'agent', id: 'agent-1', name: 'Claude' },
      at: AT,
    } as never);
    await Promise.resolve();

    openingRead = true;
    expect(await store.openArchive()).toBe(true);
    expect(store.pages().find(({ kind }) => kind === 'archive')?.enabled).toBe(true);

    gate.resolve(projects[0]!);
    for (let pass = 0; pass < 8; pass += 1) await Promise.resolve();

    expect(store.pages().find(({ kind }) => kind === 'archive')?.enabled).toBe(true);
  });

  it('stops listening once the store is destroyed', async () => {
    const live = new FakeLiveUpdates();
    const { store } = storeWith({ projects: renovation() }, live);
    await store.load('project-renovation' as ProjectId);
    expect(live.listenerCount).toBe(1);

    TestBed.resetTestingModule();

    expect(live.listenerCount).toBe(0);
  });
});

/**
 * The write envelope §31 gives a committed toggle. The store deliberately ignores the receipt —
 * persistent Undo controls are a later phase — so these specs assert the page reconciliation and
 * carry the receipt only because parsing it is part of the contract.
 */
const pageWrite = (record: ProjectPage, operation: OperationKind | null = 'page.add'): ProjectPageWriteResult => ({
  page: record,
  operation: operation === null
    ? null
    : {
        historyId: 'history-1' as OperationHistoryId,
        actionId: 'operation-1' as OperationActionId,
        operation,
        revision: 1,
        label: `${record.enabled ? 'Enabled' : 'Disabled'} the ${record.kind} page`,
        createdAt: '2026-09-21T10:00:00.000Z',
        expiresAt: '2026-09-22T10:00:00.000Z',
      },
});

describe('ProjectWorkspaceStore — optional page management (§26, §31, §63)', () => {
  it('keeps the confirmed page state until the write and fresh context both finish', async () => {
    const pages = [page('page-project-renovation-home', 'project-renovation', 'home')];
    const gateway = new FakeWorkManagerGateway({ projects: renovation(), pages });
    const write = deferred<ProjectPageWriteResult>();
    const read = deferred<ProjectPage[]>();
    gateway.pages.setEnabled = () => write.promise;
    gateway.pages.list = () => read.promise;
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: LIVE_UPDATES, useValue: new FakeLiveUpdates() },
      ],
    });
    const store = TestBed.inject(ProjectWorkspaceStore);
    // The first load needs a completed page read; only later reads are held.
    gateway.pages.list = async () => pages;
    await store.load('project-renovation' as ProjectId);
    gateway.pages.list = () => read.promise;

    const toggling = store.setPageEnabled('todos', true);
    expect(store.pages().map(({ kind }) => kind)).toEqual(['home']);
    expect(store.pageWritePending()).toBe(true);

    write.resolve(pageWrite(page('page-project-renovation-todos', 'project-renovation', 'todos')));
    await Promise.resolve();
    expect(store.pages().map(({ kind }) => kind)).toEqual(['home']);

    read.resolve([
      pages[0]!,
      page('page-project-renovation-todos', 'project-renovation', 'todos'),
    ]);
    expect(await toggling).toBe(true);
    expect(store.pages().map(({ kind }) => kind)).toEqual(['home', 'todos']);
    expect(store.pageWritePending()).toBe(false);
  });

  it('keeps confirmed state and reports a failed page write', async () => {
    const { store } = storeWith({
      projects: renovation(),
      pages: [page('page-project-renovation-home', 'project-renovation', 'home')],
      failOn: { 'pages.setEnabled': new GatewayError('conflict', 409, 'page settings changed') },
    });
    await store.load('project-renovation' as ProjectId);

    expect(await store.setPageEnabled('todos', true)).toBe(false);
    expect(store.pages().map(({ kind }) => kind)).toEqual(['home']);
    expect(store.pageWriteError()).toContain('page settings changed');
    expect(store.pageWriteRetryKind()).toBeNull();
  });

  it('offers a read-only retry after a committed toggle cannot refresh context', async () => {
    const pages = [page('page-project-renovation-home', 'project-renovation', 'home')];
    const gateway = new FakeWorkManagerGateway({ projects: renovation(), pages });
    let pageReads = 0;
    const originalList = gateway.pages.list.bind(gateway.pages);
    gateway.pages.list = (projectId) => {
      pageReads += 1;
      if (pageReads === 2) return Promise.reject(new GatewayError('unreachable', 503, 'pages read failed'));
      return originalList(projectId);
    };
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: LIVE_UPDATES, useValue: new FakeLiveUpdates() },
      ],
    });
    const store = TestBed.inject(ProjectWorkspaceStore);
    await store.load('project-renovation' as ProjectId);

    expect(await store.setPageEnabled('todos', true)).toBe(false);
    expect(store.pages().map(({ kind }) => kind)).toEqual(['home']);
    expect(store.pageWriteError()).toContain('was enabled');
    expect(store.pageWriteRetryKind()).toBe('todos');

    expect(await store.retryPageContext()).toBe(true);
    expect(store.pages().map(({ kind }) => kind)).toEqual(['home', 'todos']);
    expect(store.pageWriteError()).toBeNull();
  });

  it('does not apply a late toggle after the route changes', async () => {
    const projects = renovation();
    const pages = [page('page-project-renovation-home', 'project-renovation', 'home')];
    const gateway = new FakeWorkManagerGateway({ projects, pages });
    const write = deferred<ProjectPageWriteResult>();
    gateway.pages.setEnabled = () => write.promise;
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: LIVE_UPDATES, useValue: new FakeLiveUpdates() },
      ],
    });
    const store = TestBed.inject(ProjectWorkspaceStore);
    await store.load('project-renovation' as ProjectId);

    const toggling = store.setPageEnabled('todos', true);
    await store.load('project-garden' as ProjectId);
    write.resolve(pageWrite(page('page-project-renovation-todos', 'project-renovation', 'todos')));

    expect(await toggling).toBe(false);
    expect(store.project()?.id).toBe('project-garden');
    expect(store.pages().map(({ kind }) => kind)).toEqual(['home']);
  });

  it('does not apply a late toggle after the store is destroyed', async () => {
    const pages = [page('page-project-renovation-home', 'project-renovation', 'home')];
    const gateway = new FakeWorkManagerGateway({ projects: renovation(), pages });
    const write = deferred<ProjectPageWriteResult>();
    gateway.pages.setEnabled = () => write.promise;
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: LIVE_UPDATES, useValue: new FakeLiveUpdates() },
      ],
    });
    const store = TestBed.inject(ProjectWorkspaceStore);
    await store.load('project-renovation' as ProjectId);
    const toggling = store.setPageEnabled('todos', true);

    TestBed.resetTestingModule();
    write.resolve(pageWrite(page('page-project-renovation-todos', 'project-renovation', 'todos')));

    await expect(toggling).resolves.toBe(false);
  });

  it('keeps Open archive reachable for an archived root', async () => {
    const archivedRoot = root('project-renovation', 'Home renovation', { status: 'archived' });
    const { store } = storeWith({
      projects: [archivedRoot],
      pages: [page('page-project-renovation-home', 'project-renovation', 'home')],
    });
    await store.load('project-renovation' as ProjectId);

    expect(await store.openArchive()).toBe(true);
    expect(store.pages().find(({ kind }) => kind === 'archive')?.enabled).toBe(true);
  });

  it('does not offer work or canonical-page toggles', async () => {
    const { store } = storeWith({ projects: renovation() });
    await store.load('project-renovation' as ProjectId);

    expect(await store.setPageEnabled('home', false)).toBe(false);
    expect(await store.setPageEnabled('work', true)).toBe(false);
    expect(store.pages().map(({ kind }) => kind)).toEqual(['home']);
  });
});

describe('ProjectWorkspaceStore — the project’s own writes (§26, §63, §81)', () => {
  it('renames optimistically and keeps the new name when the write lands', async () => {
    const { store } = storeWith({ projects: renovation() });
    await store.load('project-renovation' as ProjectId);

    const renamed = await store.rename('Renovation');

    expect(renamed).toBe(true);
    expect(store.project()?.name).toBe('Renovation');
    expect(store.writeError()).toBeNull();
  });

  it('rolls a failed rename back to the persisted name and says why', async () => {
    const { store } = storeWith({
      projects: renovation(),
      failOn: { 'projects.update': new GatewayError('conflict', 409, 'someone else renamed it') },
    });
    await store.load('project-renovation' as ProjectId);

    const renamed = await store.rename('Renovation');

    expect(renamed).toBe(false);
    expect(store.project()?.name).toBe('Home renovation');
    expect(store.writeError()).toContain('someone else renamed it');
  });

  it('stores a description on a work unit', async () => {
    const { store } = storeWith({ projects: renovation() });
    await store.load('project-kitchen' as ProjectId);

    await store.setDescription('Appliances first');

    expect(store.project()?.description).toBe('Appliances first');
  });

  it('stores a due date on a work unit, and clears it back to nothing', async () => {
    const { store } = storeWith({ projects: renovation() });
    await store.load('project-kitchen' as ProjectId);

    await store.setTargetDate('2026-10-15');
    expect(store.project()?.targetDate).toBe('2026-10-15');

    await store.setTargetDate(null);
    expect(store.project()?.targetDate).toBeUndefined();
  });

  // The Restore controls need the guard up *before* the optimistic paint, or there is a frame
  // in which the page says `active` while the domain would still refuse a restore.
  it('holds the write guard from before the optimistic paint until the response lands', async () => {
    const gateway = new FakeWorkManagerGateway({ projects: renovation() });
    const slow = deferred<ProjectWriteResult>();
    gateway.projects.update = () => slow.promise;
    TestBed.configureTestingModule({
      providers: [
        ProjectWorkspaceStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: LIVE_UPDATES, useValue: new FakeLiveUpdates() },
      ],
    });
    const store = TestBed.inject(ProjectWorkspaceStore);
    await store.load('project-renovation' as ProjectId);

    const writing = store.setStatus('active');
    expect(store.projectWritePending()).toBe(true);

    slow.resolve({ project: { ...renovation()[0]!, status: 'active' }, operation: null });
    await writing;

    expect(store.projectWritePending()).toBe(false);
  });

  it('archives through the same status write, and reports a refusal without leaving the page', async () => {
    const { store } = storeWith({
      projects: renovation(),
      failOn: {
        'projects.update': new GatewayError('conflict', 409, 'archive its live sub-projects first'),
      },
    });
    await store.load('project-renovation' as ProjectId);

    const archived = await store.archive();

    expect(archived).toBe(false);
    expect(store.project()?.status).toBe('active');
    expect(store.writeError()).toContain('archive its live sub-projects first');
  });
});
