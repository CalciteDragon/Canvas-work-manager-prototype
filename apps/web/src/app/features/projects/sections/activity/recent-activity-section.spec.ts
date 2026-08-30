import { TestBed } from '@angular/core/testing';
import {
  ActivityFeedEntrySchema,
  ProjectSectionSchema,
  type ActivityFeedEntry,
  type ProjectSection,
  type SectionConfig,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway, type FakeGatewayOptions } from '../../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../../core/live/testing/fake-live-updates';
import { RecentActivitySection } from './recent-activity-section';

const section = (): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-activity',
    projectId: 'project-a',
    type: 'recent-activity',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: '2026-08-20T16:00:00.000Z',
    updatedAt: '2026-08-20T16:00:00.000Z',
  });

const entry = (overrides: Record<string, unknown> = {}): ActivityFeedEntry =>
  ActivityFeedEntrySchema.parse({
    id: 'activity-1',
    workspaceId: 'workspace-demo',
    actor: 'agent',
    actorAgentConnectionId: 'agent-claude',
    action: 'task.completed',
    entityType: 'task',
    entityId: 'task-1',
    projectId: 'project-a',
    summary: 'Completed "Configure deployment"',
    createdAt: '2026-08-24T15:32:00.000Z',
    actorName: 'Claude',
    entityTitle: 'Configure deployment',
    projectName: 'Project A',
    ...overrides,
  });

const render = async (gateway = new FakeWorkManagerGateway({ activity: [entry()] })) => {
  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({
    providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }, { provide: LIVE_UPDATES, useValue: live }],
  });
  const fixture = TestBed.createComponent(RecentActivitySection);
  fixture.componentRef.setInput('section', section());
  fixture.componentRef.setInput('onConfigChange', vi.fn<(config: SectionConfig) => void>());
  fixture.componentRef.setInput('onProjectDataChange', vi.fn<() => void>());
  fixture.componentRef.setInput('projectDataRevision', 0);
  fixture.componentRef.setInput('projectHierarchyRevision', 0);
  fixture.componentRef.setInput('onProjectHierarchyChange', vi.fn());
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, gateway, live };
};

const text = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string): string =>
  (fixture.nativeElement.querySelector(selector) as HTMLElement | null)?.textContent?.trim() ?? '';

describe('RecentActivitySection (§30, §57)', () => {
  it('asks only for its own project’s activity, and renders it through the shared feed', async () => {
    const { fixture, gateway } = await render();

    expect(gateway.calls).toContainEqual({
      method: 'activity.list',
      argument: { projectId: 'project-a', limit: 20 },
    });
    expect(text(fixture, '[data-activity-line]')).toBe('Completed “Configure deployment”');
    expect(fixture.nativeElement.querySelector('[data-activity-entry]')?.getAttribute('data-actor')).toBe('agent');
  });

  /**
   * A feed of "what just happened" that ignored the revision would go stale the moment
   * someone completed a task in the Task List section beside it — the most visible
   * staleness the canvas could have.
   */
  it('reloads when the project’s data changes elsewhere on the canvas', async () => {
    const { fixture, gateway } = await render();
    const before = gateway.calls.filter(({ method }) => method === 'activity.list').length;

    fixture.componentRef.setInput('projectDataRevision', 1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(gateway.calls.filter(({ method }) => method === 'activity.list')).toHaveLength(before + 1);
  });

  it('says so when the project has no history yet', async () => {
    const { fixture } = await render(new FakeWorkManagerGateway({ activity: [] }));

    expect(text(fixture, '[data-activity-empty]')).toBe('Nothing has happened in this project yet.');
  });

  it('reports a failure rather than showing an empty feed that is not empty', async () => {
    const { fixture } = await render(
      new FakeWorkManagerGateway({ failWith: new GatewayError('unreachable', 0, 'could not reach the prototype host') }),
    );

    expect(text(fixture, '[data-activity-error]')).toBe('could not reach the prototype host');
  });
});

describe('RecentActivitySection project-data invalidation (§62)', () => {
  it('reloads when the page store invalidates current-project data', async () => {
    const { fixture, gateway } = await render();
    const before = gateway.calls.filter(({ method }) => method === 'activity.list').length;

    fixture.componentRef.setInput('projectDataRevision', 1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(gateway.calls.filter(({ method }) => method === 'activity.list')).toHaveLength(before + 1);
  });

  it('ignores hierarchy-only invalidation', async () => {
    const { fixture, gateway } = await render();
    const before = gateway.calls.filter(({ method }) => method === 'activity.list').length;

    fixture.componentRef.setInput('projectHierarchyRevision', 1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(gateway.calls.filter(({ method }) => method === 'activity.list')).toHaveLength(before);
  });

  it('keeps the rendered feed when a revision re-read fails', async () => {
    // The options object is the fake's own state, so a spec can break the host mid-test.
    const options: FakeGatewayOptions = { activity: [entry()] };
    const { fixture } = await render(new FakeWorkManagerGateway(options));
    options.failWith = new GatewayError('unreachable', 0, 'host is down');

    fixture.componentRef.setInput('projectDataRevision', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // An error banner for a write the user did not make is worse than a stale line.
    expect(text(fixture, '[data-activity-line]')).toBe('Completed “Configure deployment”');
  });
});
