import { TestBed } from '@angular/core/testing';
import { ProjectSchema, ProjectSectionSchema } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { SubProjectsSection } from './sub-projects-section';

const root = ProjectSchema.parse({ id: 'project-a', workspaceId: 'workspace-demo', kind: 'root', name: 'Root', status: 'active', projectLayoutMode: 'flow', createdAt: '2026-08-30T07:00:00.000Z', updatedAt: '2026-08-30T07:00:00.000Z' });
const section = ProjectSectionSchema.parse({ id: 'section-subprojects', projectId: root.id, pageId: `page-${root.id}`, type: 'sub-projects', position: 0, columnSpan: 12, collapsed: false, config: {}, createdAt: root.createdAt, updatedAt: root.updatedAt });
const settle = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

describe('SubProjectsSection live invalidation', () => {
  it('observes hierarchy revision only and notifies hierarchy after a local create', async () => {
    const gateway = new FakeWorkManagerGateway({ projects: [root] });
    TestBed.configureTestingModule({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const dataChanged = vi.fn(); const hierarchyChanged = vi.fn();
    const fixture = TestBed.createComponent(SubProjectsSection);
    fixture.componentRef.setInput('section', section); fixture.componentRef.setInput('onConfigChange', vi.fn()); fixture.componentRef.setInput('onProjectDataChange', dataChanged); fixture.componentRef.setInput('onProjectHierarchyChange', hierarchyChanged); fixture.componentRef.setInput('projectDataRevision', 0); fixture.componentRef.setInput('projectHierarchyRevision', 0);
    fixture.detectChanges(); await fixture.whenStable(); await settle();
    const before = gateway.calls.filter(({ method }) => method === 'projects.list').length;
    fixture.componentRef.setInput('projectDataRevision', 1); fixture.detectChanges(); await fixture.whenStable(); await settle();
    expect(gateway.calls.filter(({ method }) => method === 'projects.list')).toHaveLength(before);
    fixture.componentRef.setInput('projectHierarchyRevision', 1); fixture.detectChanges(); await fixture.whenStable(); await settle();
    expect(gateway.calls.filter(({ method }) => method === 'projects.list')).toHaveLength(before + 1);

    const input = document.createElement('input'); input.value = 'New child';
    await fixture.componentInstance.create({ preventDefault: vi.fn() } as unknown as SubmitEvent, input);
    expect(hierarchyChanged).toHaveBeenCalledOnce(); expect(dataChanged).not.toHaveBeenCalled();
  });
});
