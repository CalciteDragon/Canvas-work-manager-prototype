import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { ProgressSection } from './progress-section';
import { ProgressStore } from './progress-store';

const section = ProjectSectionSchema.parse({ id: 'section-progress', projectId: 'project-a', type: 'progress', position: 0, columnSpan: 12, collapsed: false, config: {}, createdAt: '2026-08-30T07:00:00.000Z', updatedAt: '2026-08-30T07:00:00.000Z' });
const settle = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; };

describe('ProgressSection live invalidation', () => {
  it('observes project-data revision only', async () => {
    const gateway = new FakeWorkManagerGateway({ progress: { projectId: section.projectId, formula: 'count', percentage: 50, completed: 1, total: 2, explanation: 'half' } });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const fixture = TestBed.createComponent(ProgressSection);
    fixture.componentRef.setInput('section', section); fixture.componentRef.setInput('onConfigChange', vi.fn()); fixture.componentRef.setInput('onProjectDataChange', vi.fn()); fixture.componentRef.setInput('onProjectHierarchyChange', vi.fn()); fixture.componentRef.setInput('projectDataRevision', 0); fixture.componentRef.setInput('projectHierarchyRevision', 0);
    fixture.detectChanges(); await fixture.whenStable(); await settle();
    const before = gateway.calls.filter(({ method }) => method === 'progress.get').length;
    fixture.componentRef.setInput('projectHierarchyRevision', 1); fixture.detectChanges(); await fixture.whenStable(); await settle();
    expect(gateway.calls.filter(({ method }) => method === 'progress.get')).toHaveLength(before);
    fixture.componentRef.setInput('projectDataRevision', 1); fixture.detectChanges(); await fixture.whenStable(); await settle();
    expect(gateway.calls.filter(({ method }) => method === 'progress.get')).toHaveLength(before + 1);
  });

  it('deduplicates one revision across duplicate sections sharing the page store', async () => {
    const first = deferred<{ projectId: typeof section.projectId; formula: 'count'; percentage: number; completed: number; total: number; explanation: string }>();
    const second = deferred<{ projectId: typeof section.projectId; formula: 'count'; percentage: number; completed: number; total: number; explanation: string }>();
    const get = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const gateway = new FakeWorkManagerGateway();
    Object.assign(gateway.progress, { get });
    TestBed.configureTestingModule({ providers: [ProgressStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });

    const create = () => {
      const fixture = TestBed.createComponent(ProgressSection);
      fixture.componentRef.setInput('section', section); fixture.componentRef.setInput('onConfigChange', vi.fn()); fixture.componentRef.setInput('onProjectDataChange', vi.fn()); fixture.componentRef.setInput('onProjectHierarchyChange', vi.fn()); fixture.componentRef.setInput('projectDataRevision', 0); fixture.componentRef.setInput('projectHierarchyRevision', 0);
      fixture.detectChanges();
      return fixture;
    };
    const firstSection = create();
    const duplicateSection = create();
    expect(get).toHaveBeenCalledTimes(1);

    first.resolve({ projectId: section.projectId, formula: 'count', percentage: 25, completed: 1, total: 4, explanation: 'initial' });
    await settle();
    expect(get).toHaveBeenCalledTimes(1);

    firstSection.componentRef.setInput('projectDataRevision', 1); firstSection.detectChanges();
    duplicateSection.componentRef.setInput('projectDataRevision', 1); duplicateSection.detectChanges();
    expect(get).toHaveBeenCalledTimes(2);
    second.resolve({ projectId: section.projectId, formula: 'count', percentage: 50, completed: 2, total: 4, explanation: 'updated' });
    await settle();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
