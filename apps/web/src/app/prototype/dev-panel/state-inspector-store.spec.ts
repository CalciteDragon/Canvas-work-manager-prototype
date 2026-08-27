import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  type Project,
  type ProjectId,
  type ProjectLayoutMode,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import {
  WORK_MANAGER_GATEWAY,
  type WorkManagerGateway,
} from '../../core/gateway/work-manager-gateway';
import { StateInspectorStore } from './state-inspector-store';

const AT = '2026-08-27T16:00:00.000Z';

const project = (id: string, layout: ProjectLayoutMode = 'flow'): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    name: id === 'project-a' ? 'Website launch' : 'Office renovation',
    status: 'active',
    projectLayoutMode: layout,
    createdAt: AT,
    updatedAt: AT,
  });

const setup = (projects: WorkManagerGateway['projects']) => {
  const gateway = { projects } as WorkManagerGateway;
  TestBed.configureTestingModule({
    providers: [StateInspectorStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  return { store: TestBed.inject(StateInspectorStore), gateway };
};

describe('StateInspectorStore (§28)', () => {
  it('loads the visible non-archived projects for the layout experiment', async () => {
    const projects = {
      list: vi.fn(async () => [project('project-a'), project('project-b', 'grid')]),
      get: vi.fn(),
      update: vi.fn(),
    } as WorkManagerGateway['projects'];
    const { store } = setup(projects);

    await store.load();

    expect(projects.list).toHaveBeenCalledWith({
      status: ['planning', 'active', 'on_hold', 'completed'],
    });
    expect(store.projects().map(({ id }) => id)).toEqual(['project-a', 'project-b']);
    expect(store.error()).toBeNull();
  });

  it('persists one project layout and replaces it with the host answer', async () => {
    const projects = {
      list: vi.fn(async () => [project('project-a')]),
      get: vi.fn(),
      update: vi.fn(async (id: ProjectId, input: { projectLayoutMode?: ProjectLayoutMode }) =>
        project(id, input.projectLayoutMode),
      ),
    } as WorkManagerGateway['projects'];
    const { store } = setup(projects);
    await store.load();

    expect(await store.setLayout('project-a' as ProjectId, 'grid')).toBe(true);

    expect(projects.update).toHaveBeenCalledWith('project-a', { projectLayoutMode: 'grid' });
    expect(store.projects()[0]?.projectLayoutMode).toBe('grid');
    expect(store.error()).toBeNull();
  });

  it('reports a rejected update without fabricating a layout change', async () => {
    const projects = {
      list: vi.fn(async () => [project('project-a')]),
      get: vi.fn(),
      update: vi.fn(async () => {
        throw new GatewayError('unreachable', 0, 'could not reach the prototype host');
      }),
    } as WorkManagerGateway['projects'];
    const { store } = setup(projects);
    await store.load();

    expect(await store.setLayout('project-a' as ProjectId, 'grid')).toBe(false);

    expect(store.projects()[0]?.projectLayoutMode).toBe('flow');
    expect(store.error()).toContain('could not reach');
  });

  it('refuses a second change for one saving project while another project remains editable', async () => {
    const releases = new Map<string, () => void>();
    const projects = {
      list: vi.fn(async () => [project('project-a'), project('project-b')]),
      get: vi.fn(),
      update: vi.fn(async (id: ProjectId, input: { projectLayoutMode?: ProjectLayoutMode }) => {
        await new Promise<void>((resolve) => releases.set(id, resolve));
        return project(id, input.projectLayoutMode);
      }),
    } as WorkManagerGateway['projects'];
    const { store } = setup(projects);
    await store.load();

    const first = store.setLayout('project-a' as ProjectId, 'grid');
    expect(store.isSaving('project-a' as ProjectId)).toBe(true);
    expect(store.isSaving('project-b' as ProjectId)).toBe(false);
    expect(await store.setLayout('project-a' as ProjectId, 'flow')).toBe(false);

    const other = store.setLayout('project-b' as ProjectId, 'grid');
    expect(store.isSaving('project-b' as ProjectId)).toBe(true);
    expect(projects.update).toHaveBeenCalledTimes(2);

    releases.get('project-a')!();
    releases.get('project-b')!();
    await Promise.all([first, other]);

    expect(store.isSaving('project-a' as ProjectId)).toBe(false);
    expect(store.isSaving('project-b' as ProjectId)).toBe(false);
  });
});
