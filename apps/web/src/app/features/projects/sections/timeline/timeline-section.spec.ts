import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, type ProjectSection, type TimelineResult } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { TimelineSection } from './timeline-section';
import { TimelineStore } from './timeline-store';

const AT = '2026-08-27T16:00:00.000Z';

const section = (): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-timeline',
    projectId: 'project-a',
    type: 'timeline',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: AT,
    updatedAt: AT,
  });

const timeline: TimelineResult = {
  projectId: section().projectId,
  items: [
    { id: 'project-a', kind: 'project', title: 'Launch', startDate: '2026-09-01', endDate: '2026-09-30', status: 'active' },
    { id: 'sub-a', kind: 'sub-project', title: 'Research', startDate: '2026-09-08', endDate: '2026-09-08', status: 'active' },
    { id: 'task-a', kind: 'task', title: 'Prototype', startDate: '2026-09-10', endDate: '2026-09-14', status: 'doing', invalidRange: true },
    { id: 'milestone-a', kind: 'milestone', title: 'Review', startDate: '2026-09-20', endDate: '2026-09-20' },
  ],
};
const settle = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };

const render = async (options: ConstructorParameters<typeof FakeWorkManagerGateway>[0] = { timeline }) => {
  const gateway = new FakeWorkManagerGateway(options);
  TestBed.configureTestingModule({
    providers: [TimelineStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  const fixture = TestBed.createComponent(TimelineSection);
  const onConfigChange = vi.fn();
  const onProjectDataChange = vi.fn();
  const onProjectHierarchyChange = vi.fn();
  fixture.componentRef.setInput('section', section());
  fixture.componentRef.setInput('onConfigChange', onConfigChange);
  fixture.componentRef.setInput('onProjectDataChange', onProjectDataChange);
  fixture.componentRef.setInput('onProjectHierarchyChange', onProjectHierarchyChange);
  fixture.componentRef.setInput('projectDataRevision', 0);
  fixture.componentRef.setInput('projectHierarchyRevision', 0);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, gateway, onConfigChange, onProjectDataChange, onProjectHierarchyChange };
};

const query = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('TimelineSection (§38)', () => {
  it('loads its project and renders every derived kind with dense marker/range and status labels', async () => {
    const { fixture, gateway, onConfigChange, onProjectDataChange } = await render();

    expect(gateway.argumentTo('timeline.get')).toBe('project-a');
    expect(fixture.nativeElement.querySelectorAll('[data-timeline-row]')).toHaveLength(4);
    expect(fixture.nativeElement.textContent).toContain('Project');
    expect(fixture.nativeElement.textContent).toContain('Sub-project');
    expect(fixture.nativeElement.textContent).toContain('Task');
    expect(fixture.nativeElement.textContent).toContain('Milestone');
    expect(fixture.nativeElement.querySelectorAll('[data-timeline-range]')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('[data-timeline-marker]')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('doing');
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(onProjectDataChange).not.toHaveBeenCalled();
  });

  it('toggles readable details and visibly warns about an invalid source range', async () => {
    const { fixture } = await render();
    const taskRow = query(fixture, '[data-timeline-id="task-a"]')!;

    taskRow.click();
    fixture.detectChanges();

    expect(query(fixture, '[data-timeline-details="task-a"]')).not.toBeNull();
    expect(query(fixture, '[data-timeline-invalid-range]')?.textContent).toContain('dates were reversed');
    expect(taskRow.getAttribute('aria-expanded')).toBe('true');

    taskRow.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-timeline-details="task-a"]')).toBeNull();
  });

  it('re-reads for both project-data and hierarchy revisions', async () => {
    const { fixture, gateway } = await render();
    const before = gateway.calls.filter(({ method }) => method === 'timeline.get').length;
    fixture.componentRef.setInput('projectDataRevision', 1); fixture.detectChanges(); await fixture.whenStable(); await settle();
    fixture.componentRef.setInput('projectHierarchyRevision', 1); fixture.detectChanges(); await fixture.whenStable(); await settle();
    expect(gateway.calls.filter(({ method }) => method === 'timeline.get')).toHaveLength(before + 2);
  });

  it('renders empty, loading, and error states without scheduling controls', async () => {
    const empty = await render({ timeline: { projectId: section().projectId, items: [] } });
    expect(query(empty.fixture, '[data-timeline-empty]')).not.toBeNull();
    expect(query(empty.fixture, '[data-scheduling-control]')).toBeNull();

    TestBed.resetTestingModule();
    const failed = await render({
      failWith: new GatewayError('unreachable', 0, 'timeline could not load'),
    });
    expect(query(failed.fixture, '[data-timeline-error]')?.textContent).toContain('timeline could not load');
  });
});
