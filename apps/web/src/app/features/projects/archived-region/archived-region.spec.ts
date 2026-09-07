import { TestBed } from '@angular/core/testing';
import {
  ProjectArchiveItemSchema,
  ProjectSectionSchema,
  ProjectSchema,
  ReflectionSchema,
  SubprojectSchema,
  TaskSchema,
  type ProjectArchiveItem,
} from '@cwm/contracts';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ArchivedRegion } from './archived-region';

const AT = '2026-09-02T06:13:32.422Z';
const ROOT_ID = 'project-a';
const origin = {
  projectId: ROOT_ID,
  pageId: 'page-project-a',
  pageKind: 'home' as const,
  pageEnabled: true,
  breadcrumb: [{ projectId: ROOT_ID, name: 'Website launch' }],
};
const root = ProjectSchema.parse({
  id: ROOT_ID,
  workspaceId: 'workspace-demo',
  kind: 'root',
  name: 'Website launch',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});
const section = ProjectSectionSchema.parse({
  id: 'section-archive',
  projectId: ROOT_ID,
  pageId: origin.pageId,
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
const task = TaskSchema.parse({
  id: 'task-archive',
  projectId: ROOT_ID,
  sectionId: section.id,
  title: 'Ship it',
  status: 'todo',
  priority: 'medium',
  archivedAt: AT,
  createdAt: AT,
  updatedAt: AT,
});
const reflection = ReflectionSchema.parse({
  id: 'reflection-archive',
  projectId: ROOT_ID,
  sectionId: section.id,
  title: 'A note',
  body: 'A week of it',
  archivedAt: AT,
  createdAt: AT,
  updatedAt: AT,
});
const subproject = SubprojectSchema.parse({
  id: 'project-subproject',
  workspaceId: 'workspace-demo',
  kind: 'subproject',
  parentProjectId: ROOT_ID,
  name: 'Kitchen',
  status: 'planning',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});

const items: ProjectArchiveItem[] = [
  ProjectArchiveItemSchema.parse({
    kind: 'section',
    section,
    origin,
    cause: { kind: 'own' },
    cascadeCount: 1,
    restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
  }),
  ProjectArchiveItemSchema.parse({
    kind: 'task',
    task,
    origin: { ...origin, sectionId: section.id, sectionName: 'Backlog' },
    cause: { kind: 'section-cascade', sectionId: section.id },
    restoration: { kind: 'blocked', blocker: { kind: 'section', sectionId: section.id, name: 'Backlog' } },
  }),
  ProjectArchiveItemSchema.parse({
    kind: 'reflection',
    reflection,
    origin: { ...origin, sectionId: section.id, sectionName: 'Backlog' },
    cause: { kind: 'hidden-by-project', projectId: ROOT_ID },
    restoration: { kind: 'not-archived', blocker: { kind: 'project', projectId: ROOT_ID, name: root.name } },
  }),
  ProjectArchiveItemSchema.parse({
    kind: 'subproject',
    project: subproject,
    origin: { ...origin, projectId: subproject.id, breadcrumb: [...origin.breadcrumb, { projectId: subproject.id, name: subproject.name }] },
    cause: { kind: 'own' },
    restoration: { kind: 'ready', operation: 'restore_project', permission: 'projects.write' },
  }),
];

const render = async (archiveItems = items, restoreBlocked = false) => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ArchivedRegion);
  fixture.componentRef.setInput('items', archiveItems);
  fixture.componentRef.setInput('restoreBlocked', restoreBlocked);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
};

const all = (fixture: Awaited<ReturnType<typeof render>>, selector: string): HTMLElement[] =>
  [...(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>)];

describe('ArchivedRegion', () => {
  it('renders nothing for an empty root-wide projection', async () => {
    const fixture = await render([]);
    expect(fixture.nativeElement.querySelector('[data-archived-region]')).toBeNull();
  });

  it('renders every archive kind, cause, and exact cascade count', async () => {
    const fixture = await render();
    expect(all(fixture, '[data-archived-item]')).toHaveLength(4);
    expect(all(fixture, '[data-archived-kind="section"] [data-archived-name]')[0]?.textContent).toContain('Backlog');
    expect(all(fixture, '[data-archived-origin]')[0]?.textContent).toContain('Website launch');
    expect(all(fixture, '[data-archived-origin-link]')[0]?.textContent).toContain('Home');
    expect(fixture.nativeElement.querySelector('[data-archived-cascade-count]')?.textContent).toContain('1 task');
    expect(all(fixture, '[data-archived-cause]')[1]?.textContent).toContain('with its section');
    expect(all(fixture, '[data-archived-blocker]')[0]?.textContent).toContain('Restore “Backlog” first');
  });

  it('emits only a ready canonical restore request', async () => {
    const fixture = await render();
    const restored = vi.fn<(request: { item: ProjectArchiveItem; status: 'active' | 'planning' | 'on_hold' | 'completed' }) => void>();
    fixture.componentInstance.restoreRequested.subscribe(restored);

    const buttons = all(fixture, '[data-archived-restore]') as HTMLButtonElement[];
    buttons[0]!.click();
    buttons[1]!.click();

    expect(restored).toHaveBeenCalledTimes(1);
    expect(restored).toHaveBeenCalledWith({ item: items[0], status: 'active' });
    expect(buttons[1]!.disabled).toBe(true);
  });

  it('lets a project restore choose an explicit non-archived status', async () => {
    const fixture = await render();
    const restored = vi.fn();
    fixture.componentInstance.restoreRequested.subscribe(restored);
    const select = all(fixture, '[data-archived-project-status]')[0] as HTMLSelectElement;
    select.value = 'on_hold';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (all(fixture, '[data-archived-kind="subproject"] [data-archived-restore]')[0] as HTMLButtonElement).click();

    expect(restored).toHaveBeenCalledWith({ item: items[3], status: 'on_hold' });
  });

  it('disables all restore controls when the root project is archived', async () => {
    const fixture = await render([items[0]!], true);
    expect(all(fixture, '[data-archived-blocked]')[0]?.textContent).toContain('Reactivate');
    expect((all(fixture, '[data-archived-restore]')[0] as HTMLButtonElement).disabled).toBe(true);
  });
});
