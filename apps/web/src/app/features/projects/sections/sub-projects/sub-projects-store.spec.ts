import { TestBed } from '@angular/core/testing';
import { ProjectSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { SubProjectsStore } from './sub-projects-store';

const root = ProjectSchema.parse({ id: 'project-a', workspaceId: 'workspace-demo', name: 'Root', status: 'active', projectLayoutMode: 'flow', createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z' });
const child = ProjectSchema.parse({ ...root, id: 'project-b', parentProjectId: root.id, name: 'Child' });

describe('SubProjectsStore', () => {
  it('loads hierarchy and creates a trimmed direct child', async () => {
    const gateway = new FakeWorkManagerGateway({ projects: [root, child] });
    TestBed.configureTestingModule({ providers: [SubProjectsStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(SubProjectsStore);
    await store.load(root.id);
    expect(store.projects().map(({ id }) => id)).toEqual([child.id]);
    expect(await store.create('  New child  ')).toBe(true);
    expect(gateway.argumentTo('projects.create')).toMatchObject({ parentProjectId: root.id, name: 'New child' });
  });
});
