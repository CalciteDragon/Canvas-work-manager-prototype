import { TestBed } from '@angular/core/testing';
import { ProjectStatusSchema, type Project, type ProjectQuery } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { GatewayError } from '../gateway/gateway-error';
import { FakeWorkManagerGateway } from '../gateway/testing/fake-gateway';
import { shellTestProviders } from '../gateway/testing/shell-test-providers';
import { WORK_MANAGER_GATEWAY } from '../gateway/work-manager-gateway';
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
  TestBed.configureTestingModule({ providers: [ShellStore, ...shellTestProviders(options)] });
  return {
    store: TestBed.inject(ShellStore),
    gateway: TestBed.inject(WORK_MANAGER_GATEWAY) as FakeWorkManagerGateway,
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

  it('asks for every project status except archived', async () => {
    const { store, gateway } = storeWith();

    await store.load();

    const query = gateway.argumentTo('projects.list') as ProjectQuery;
    expect(query.status).toEqual(ProjectStatusSchema.options.filter((status) => status !== 'archived'));
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
