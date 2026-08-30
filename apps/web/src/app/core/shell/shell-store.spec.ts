import { TestBed } from '@angular/core/testing';
import { ProjectStatusSchema, type Project, type ProjectQuery } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { PrototypeSettings } from '../config/prototype-settings';
import { GatewayError } from '../gateway/gateway-error';
import { FakeWorkManagerGateway } from '../gateway/testing/fake-gateway';
import { shellTestProviders } from '../gateway/testing/shell-test-providers';
import { WORK_MANAGER_GATEWAY } from '../gateway/work-manager-gateway';
import { FakeLiveUpdates } from '../live/testing/fake-live-updates';
import { ShellStore } from './shell-store';

const AT = '2026-08-01T16:00:00.000Z';

const project = (id: string, name: string, parentProjectId?: string): Project =>
  ({
    id,
    workspaceId: 'workspace-demo',
    name,
    parentProjectId,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  }) as unknown as Project;

const storeWith = (options: Parameters<typeof shellTestProviders>[0] = {}) => {
  const live = options.live ?? new FakeLiveUpdates();
  TestBed.configureTestingModule({ providers: [ShellStore, ...shellTestProviders({ ...options, live })] });
  return {
    store: TestBed.inject(ShellStore),
    gateway: TestBed.inject(WORK_MANAGER_GATEWAY) as FakeWorkManagerGateway,
    live,
  };
};

describe('ShellStore', () => {
  it('loads the identity and the projects the sidebar renders', async () => {
    const { store } = storeWith({ projects: [project('project-1', 'Personal workspace')] });

    await store.load();

    expect(store.identity()?.user.name).toBe('Demo User');
    expect(store.projects()).toHaveLength(1);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  // The `nested-projects` seed is three deep. A one-level assertion would pass a builder
  // that silently flattens grandchildren.
  it('nests grandchildren, not just children (§23)', async () => {
    const { store } = storeWith({
      projects: [
        project('project-renovation', 'Home renovation'),
        project('project-kitchen', 'Kitchen', 'project-renovation'),
        project('project-cabinets', 'Cabinets', 'project-kitchen'),
        project('project-garden', 'Garden', 'project-renovation'),
      ],
    });

    await store.load();

    const [root] = store.projectTree();
    expect(root?.project.name).toBe('Home renovation');
    expect(root?.children.map((child) => child.project.name)).toEqual(['Kitchen', 'Garden']);
    expect(root?.children[0]?.children[0]?.project.name).toBe('Cabinets');
  });

  it('keeps a child whose parent the query filtered out', async () => {
    const { store } = storeWith({ projects: [project('project-kitchen', 'Kitchen', 'project-archived')] });

    await store.load();

    expect(store.projectTree().map((node) => node.project.name)).toEqual(['Kitchen']);
  });

  // The host cannot serve a cycle — the store rejects a cyclic document at load. A
  // production API carries no such invariant, and this walks a list it does not own.
  it('terminates on a parent cycle instead of rendering forever', async () => {
    const { store } = storeWith({
      projects: [project('project-a', 'A', 'project-b'), project('project-b', 'B', 'project-a')],
    });

    await store.load();

    expect(store.projectTree().map((node) => node.project.name).sort()).toEqual(['A', 'B']);
  });

  // The expected list is written out rather than recomputed from ProjectStatusSchema:
  // restating the expression under test would pass however that expression drifts.
  it('asks for every project status except archived', async () => {
    const { store, gateway } = storeWith();

    await store.load();

    const query = gateway.argumentTo('projects.list') as ProjectQuery;
    expect(query.status).toEqual(['planning', 'active', 'on_hold', 'completed']);
    expect(query.status).toHaveLength(ProjectStatusSchema.options.length - 1);
  });

  it('settles into an error state when the projects call fails', async () => {
    const { store } = storeWith({ failWith: new GatewayError('unreachable', 0, 'host is down') });

    await store.load();

    expect(store.error()).toContain('host is down');
    expect(store.projects()).toEqual([]);
    expect(store.loading()).toBe(false);
  });

  it('settles into an error state when the identity call fails', async () => {
    const { store } = storeWith({ identity: new GatewayError('unreachable', 0, 'host is down') });

    await store.load();

    expect(store.error()).not.toBeNull();
    expect(store.loading()).toBe(false);
  });
});

// Found in review: the first cycle guard dropped the edge for any node *downstream* of a
// cycle, not just the nodes in it — so `a → b`, where b self-parents, detached a valid,
// renderable edge and made `a` a sibling of its own parent.
describe('ShellStore — a corrupt parent chain', () => {
  it('keeps a valid edge into a self-parenting project', async () => {
    const { store } = storeWith({
      projects: [project('project-a', 'A', 'project-b'), project('project-b', 'B', 'project-b')],
    });

    await store.load();

    const [root] = store.projectTree();
    expect(root?.project.name).toBe('B');
    expect(root?.children.map((child) => child.project.name)).toEqual(['A']);
  });

  it('drops only the edges inside a two-node cycle, and keeps a child hanging off it', async () => {
    const { store } = storeWith({
      projects: [
        project('project-a', 'A', 'project-b'),
        project('project-b', 'B', 'project-a'),
        project('project-c', 'C', 'project-a'),
      ],
    });

    await store.load();

    const names = store.projectTree().map((node) => node.project.name).sort();
    expect(names).toEqual(['A', 'B']);
    const a = store.projectTree().find((node) => node.project.name === 'A');
    expect(a?.children.map((child) => child.project.name)).toEqual(['C']);
  });
});

/**
 * §47's `nestedProjects`, applied here rather than in `Sidebar` — the sidebar is
 * deliberately presentational and injects nothing, which is what keeps §19's
 * `Page → Store → Gateway` from becoming `Component → Gateway`.
 */
describe('ShellStore — the nestedProjects flag (§47)', () => {
  const threeDeep = [
    project('project-a', 'Home'),
    project('project-b', 'Kitchen', 'project-a'),
    project('project-c', 'Sink', 'project-b'),
  ];

  it('nests by default', async () => {
    const { store } = storeWith({ projects: threeDeep });
    await store.load();

    expect(store.projectTree()).toHaveLength(1);
    expect(store.projectTree()[0]?.children[0]?.children[0]?.project.name).toBe('Sink');
  });

  it('flattens every level when the flag is off, with no reload', async () => {
    const { store } = storeWith({ projects: threeDeep });
    await store.load();

    TestBed.inject(PrototypeSettings).setFlag('nestedProjects', false);

    // A computed over a signal: the tree re-derives without the store re-fetching.
    expect(store.projectTree().map((node) => node.project.name)).toEqual(['Home', 'Kitchen', 'Sink']);
    expect(store.projectTree().every((node) => node.children.length === 0)).toBe(true);
  });
});

describe('ShellStore and live updates (§62)', () => {
  const projectReads = (gateway: FakeWorkManagerGateway) =>
    gateway.calls.filter(({ method }) => method === 'projects.list').length;

  const settleLive = async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  };

  it('re-reads the tree when a project changes', async () => {
    const { store, gateway, live } = storeWith({ projects: [project('project-1', 'Personal workspace')] });
    await store.load();
    const before = projectReads(gateway);

    live.emit({ type: 'project.created', entityType: 'project', entityId: 'project-2' });
    await settleLive();

    expect(projectReads(gateway)).toBe(before + 1);
    // Navigation flickering because an agent renamed something is worse than a stale label.
    expect(store.loading()).toBe(false);
  });

  it('ignores a task event — the sidebar renders no tasks', async () => {
    const { store, gateway, live } = storeWith({ projects: [project('project-1', 'Personal workspace')] });
    await store.load();
    const before = projectReads(gateway);

    live.emit({ type: 'task.completed', entityType: 'task', entityId: 'task-1', projectId: 'project-1' as never });
    await settleLive();

    expect(projectReads(gateway)).toBe(before);
  });

  it('re-reads when the host state is replaced', async () => {
    const { store, gateway, live } = storeWith({ projects: [project('project-1', 'Personal workspace')] });
    await store.load();
    const before = projectReads(gateway);

    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    await settleLive();

    expect(projectReads(gateway)).toBe(before + 1);
  });
});

describe('ShellStore — recovering from a failed first load (§62)', () => {
  const settleLive = async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  };

  it('clears the error when a live re-read succeeds', async () => {
    // The routine `pnpm dev` race: the web app is up before the host is listening.
    // The gateway holds this object, so clearing `failWith` on it brings the host back.
    const options = {
      projects: [project('project-1', 'Personal workspace')],
      failWith: new GatewayError('unreachable', 0, 'host is still starting') as GatewayError | undefined,
    };
    const live = new FakeLiveUpdates();
    TestBed.configureTestingModule({
      providers: [
        ShellStore,
        ...shellTestProviders({ live }),
        { provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway(options) },
      ],
    });
    const store = TestBed.inject(ShellStore);

    await store.load();
    expect(store.error()).not.toBeNull();

    options.failWith = undefined;
    live.emit({ type: 'project.created', entityType: 'project', entityId: 'project-2' });
    await settleLive();

    // The sidebar renders the error branch *instead of* the tree, so a stale error after a
    // good read hides a perfectly usable sidebar until a reload.
    expect(store.error()).toBeNull();
    expect(store.projects()).toHaveLength(1);
  });
});
