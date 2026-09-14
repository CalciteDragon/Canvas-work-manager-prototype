import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ProjectArchiveItemSchema,
  ProjectArchiveResultSchema,
  ProjectSchema,
  ProjectSectionSchema,
  type ProjectArchiveResult,
  type ProjectId,
  type ProjectPageId,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { ArchivePage } from './archive-page';

const AT = '2026-09-02T06:13:32.422Z';
const PROJECT = 'project-archive-page' as ProjectId;
const root = ProjectSchema.parse({
  id: PROJECT,
  workspaceId: 'workspace-demo',
  kind: 'root',
  name: 'Website launch',
  status: 'archived',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});
const section = ProjectSectionSchema.parse({
  id: 'section-archive-page',
  projectId: PROJECT,
  pageId: 'page-archive-page',
  type: 'task-list',
  title: 'Backlog',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  archivedAt: AT,
  createdAt: AT,
  updatedAt: AT,
});
const archive: ProjectArchiveResult = ProjectArchiveResultSchema.parse({
  projectId: PROJECT,
  root,
  items: [
    ProjectArchiveItemSchema.parse({
      kind: 'section',
      section,
      origin: {
        projectId: PROJECT,
        pageId: section.pageId,
        sectionId: section.id,
        sectionName: 'Backlog',
        pageKind: 'home',
        pageEnabled: true,
        breadcrumb: [{ projectId: PROJECT, name: root.name }],
      },
      cause: { kind: 'own' },
      cascadeCount: 0,
      recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 2, separateRestoreCount: 2 },
      restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
    }),
  ],
});

const render = async (answer: ProjectArchiveResult = archive) => {
  const gateway = new FakeWorkManagerGateway({ projects: [root], sections: [section], archive: answer });
  const live = new FakeLiveUpdates();
  const dataChanged = vi.fn();
  const hierarchyChanged = vi.fn();

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: LIVE_UPDATES, useValue: live },
    ],
  });
  const fixture = TestBed.createComponent(ArchivePage);
  fixture.componentRef.setInput('projectId', PROJECT);
  fixture.componentRef.setInput('pageId', 'page-archive' as ProjectPageId);
  fixture.componentRef.setInput('projectLayoutMode', 'flow');
  fixture.componentRef.setInput('restoreBlocked', false);
  fixture.componentRef.setInput('shortcutsAllowed', false);
  fixture.componentRef.setInput('onProjectDataChange', dataChanged);
  fixture.componentRef.setInput('onProjectHierarchyChange', hierarchyChanged);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { fixture, gateway, dataChanged, hierarchyChanged };
};

describe('ArchivePage (§31)', () => {
  it('renders root guidance, archive rows, and their owning-page origin', async () => {
    const { fixture } = await render();

    expect(fixture.nativeElement.querySelector('[data-archive-root-guidance]')?.textContent).toContain(
      'Use More project actions above to choose a non-archived status',
    );
    expect(fixture.nativeElement.querySelectorAll('[data-archived-item]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('[data-archived-origin-link]')?.textContent).toContain('Home');
    expect(fixture.nativeElement.querySelector('[data-archived-origin-link]')?.getAttribute('href')).toBe(
      '/projects/project-archive-page/pages/home#section-section-archive-page',
    );
  });

  it('renders the domain projection’s content and two-step guidance as supplied', async () => {
    const { fixture } = await render();

    expect(fixture.nativeElement.querySelector('[data-archived-content]')?.textContent).toContain('2 tasks in this section');
    expect(fixture.nativeElement.querySelector('[data-archived-recovery-guidance]')?.textContent).toContain(
      'Restore this section first, then restore its 2 archived tasks separately.',
    );
  });

  it('says nothing is archived for an empty projection', async () => {
    const { fixture } = await render({ ...archive, items: [] });

    expect(fixture.nativeElement.querySelector('[data-archive-empty]')?.textContent).toContain('Nothing is archived');
    expect(fixture.nativeElement.querySelector('[data-archived-item]')).toBeNull();
  });

  it('awaits a canonical restore and tells the shell what changed', async () => {
    const { fixture, gateway, dataChanged, hierarchyChanged } = await render();
    gateway.archive.get = vi.fn().mockResolvedValue({ ...archive, items: [] });

    (fixture.nativeElement.querySelector('[data-archived-restore]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls.filter(({ method }) => method === 'sections.restore')).toHaveLength(1);
    expect(dataChanged).toHaveBeenCalledTimes(1);
    expect(hierarchyChanged).not.toHaveBeenCalled();
  });
});
