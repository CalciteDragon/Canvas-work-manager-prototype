import { TestBed } from '@angular/core/testing';
import { ProjectSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { ProgressStore } from './progress-store';

const project = ProjectSchema.parse({ id: 'project-a', workspaceId: 'workspace-demo', name: 'Launch', status: 'active', projectLayoutMode: 'flow', createdAt: '2026-08-01T16:00:00.000Z', updatedAt: '2026-08-01T16:00:00.000Z' });

describe('ProgressStore', () => {
  it('persists a canonical project formula then reloads the derived answer', async () => {
    const gateway = new FakeWorkManagerGateway({ projects: [project], progress: { projectId: project.id, formula: 'weighted', percentage: 75, completed: 3, total: 4, explanation: '3 of 4 estimate points complete' } });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const store = TestBed.inject(ProgressStore);
    await store.load(project.id);
    expect(await store.setFormula('weighted')).toBe(true);
    expect(gateway.argumentTo('projects.update')).toEqual({ id: project.id, input: { progressFormula: 'weighted' } });
    expect(store.result()?.percentage).toBe(75);
  });
});
