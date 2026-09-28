import { TestBed } from '@angular/core/testing';
import {
  ProjectArchiveItemSchema,
  ProjectSectionSchema,
  SubprojectSchema,
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

  it('renders only ready owner entries and the exact cascade count', async () => {
    const fixture = await render();
    expect(all(fixture, '[data-archived-item]')).toHaveLength(2);
    expect(all(fixture, '[data-archived-kind="section"] [data-archived-name]')[0]?.textContent).toContain('Backlog');
    expect(all(fixture, '[data-archived-origin]')[0]?.textContent).toContain('Website launch');
    expect(all(fixture, '[data-archived-origin-link]')[0]?.textContent).toContain('Home');
    expect(fixture.nativeElement.querySelector('[data-archived-cascade-count]')?.textContent).toContain('1 task');
    expect(all(fixture, '[data-archived-cause]')[1]?.textContent).toContain('directly');
    expect(all(fixture, '[data-archived-blocker]')).toHaveLength(0);
  });

  it('emits a canonical restore request for a ready entry', async () => {
    const fixture = await render();
    const restored = vi.fn<(request: { item: ProjectArchiveItem; status: 'active' | 'planning' | 'on_hold' | 'completed' }) => void>();
    fixture.componentInstance.restoreRequested.subscribe(restored);

    const buttons = all(fixture, '[data-archived-restore]') as HTMLButtonElement[];
    buttons[0]!.click();
    expect(restored).toHaveBeenCalledTimes(1);
    expect(restored).toHaveBeenCalledWith({ item: items[0], status: 'active' });
  });

  it('labels archived sections as saved content and leaves other restore labels intact', async () => {
    const fixture = await render();
    const sectionRestore = fixture.nativeElement.querySelector('[data-archived-kind="section"] [data-archived-restore]') as HTMLButtonElement;
    const projectRestore = fixture.nativeElement.querySelector('[data-archived-kind="subproject"] [data-archived-restore]') as HTMLButtonElement;

    expect(sectionRestore.textContent?.trim()).toBe('Restore saved content');
    expect(sectionRestore.getAttribute('aria-label')).toBe('Restore saved content for Backlog');
    expect(projectRestore.textContent?.trim()).toBe('Restore');
    expect(projectRestore.getAttribute('aria-label')).toBe('Restore Kitchen');
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

    expect(restored).toHaveBeenCalledWith({ item: items[1], status: 'on_hold' });
  });

  // Slice 47 real use: the select showed "planning" while Restore would send `active`.
  it('shows the status a Restore will send before any choice is made', async () => {
    const fixture = await render();
    const restored = vi.fn();
    fixture.componentInstance.restoreRequested.subscribe(restored);

    expect((all(fixture, '[data-archived-project-status]')[0] as HTMLSelectElement).value).toBe('active');
    (all(fixture, '[data-archived-kind="subproject"] [data-archived-restore]')[0] as HTMLButtonElement).click();
    expect(restored).toHaveBeenCalledWith({ item: items[1], status: 'active' });
  });

  // Slice 47: a re-read replaces the projection with new objects for the same rows.
  it('keeps a chosen project status when the same row arrives in a refreshed projection', async () => {
    const fixture = await render();
    const restored = vi.fn();
    fixture.componentInstance.restoreRequested.subscribe(restored);
    const select = all(fixture, '[data-archived-project-status]')[0] as HTMLSelectElement;
    select.value = 'completed';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const refreshed = items.map((item) => structuredClone(item));
    fixture.componentRef.setInput('items', refreshed);
    fixture.detectChanges();

    expect((all(fixture, '[data-archived-project-status]')[0] as HTMLSelectElement).value).toBe('completed');
    (all(fixture, '[data-archived-kind="subproject"] [data-archived-restore]')[0] as HTMLButtonElement).click();
    expect(restored).toHaveBeenCalledWith({ item: refreshed[1], status: 'completed' });
  });

  it('disables a paused list without calling it an archived project', async () => {
    const fixture = await render();
    fixture.componentRef.setInput('restorePaused', true);
    fixture.detectChanges();

    expect((all(fixture, '[data-archived-restore]') as HTMLButtonElement[]).every(({ disabled }) => disabled)).toBe(true);
    expect((all(fixture, '[data-archived-project-status]')[0] as HTMLSelectElement).disabled).toBe(true);
    expect(all(fixture, '[data-archived-blocked]')).toHaveLength(0);
  });

  describe('recovery metadata from the domain (Slice 29)', () => {
    const sectionEntry = (overrides: Record<string, unknown>) =>
      ProjectArchiveItemSchema.parse({
        kind: 'section',
        section,
        origin,
        cause: { kind: 'own' },
        cascadeCount: 0,
        recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 3, separateRestoreCount: 3 },
        restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
        ...overrides,
      });
    const text = (fixture: Awaited<ReturnType<typeof render>>, selector: string) =>
      fixture.nativeElement.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

    it('shows total content apart from the exact cascade count', async () => {
      const fixture = await render([
        sectionEntry({ cascadeCount: 2, recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 3, separateRestoreCount: 1 } }),
      ]);

      expect(text(fixture, '[data-archived-content]')).toBe('3 tasks in this section');
      expect(text(fixture, '[data-archived-cascade-count]')).toBe('2 tasks restore with this section');
      expect(text(fixture, '[data-archived-recovery-guidance]')).toBe('1 other task stays archived; restore it separately afterwards.');
    });

    it('makes the two steps explicit for an archived zero-cascade container', async () => {
      const fixture = await render([
        sectionEntry({ recovery: { kind: 'owned-content', ownedData: 'reflections', contentCount: 1, separateRestoreCount: 1 } }),
      ]);

      expect(text(fixture, '[data-archived-content]')).toBe('1 reflection in this section');
      expect(text(fixture, '[data-archived-cascade-count]')).toBe('0 reflections restore with this section');
      expect(text(fixture, '[data-archived-recovery-guidance]')).toBe(
        'Restore this section first, then restore its archived reflection separately.',
      );
      expect((all(fixture, '[data-archived-restore]')[0] as HTMLButtonElement).disabled).toBe(false);
    });

    it('counts Restore calls, not rows, when subtasks return with their archived parent', async () => {
      // A parent archived with its two subtasks, then a second task archived on its own: four
      // rows, two Restores.
      const fixture = await render([
        sectionEntry({ recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 4, separateRestoreCount: 2 } }),
        sectionEntry({
          section: { ...section, id: 'section-partial' },
          cascadeCount: 1,
          recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 4, separateRestoreCount: 1 },
        }),
      ]);

      expect(all(fixture, '[data-archived-recovery-guidance]').map((element) => element.textContent?.trim())).toEqual([
        'Restore this section first, then restore its 2 archived tasks separately.',
        '1 other task stays archived; restore it separately afterwards.',
      ]);
    });

    it('warns that an archived section returns at the end of its page', async () => {
      // note-2026-09-15-007: Archive Restore appends; Undo is the operation that returns a
      // section between its old neighbours. The row says so before the click.
      const archived = await render([sectionEntry({})]);
      expect(text(archived, '[data-archived-placement]')).toBe('Returns at the end of its page, not its old position.');

    });

    it('offers no row guidance when every archived row returns with the section', async () => {
      const fixture = await render([
        sectionEntry({ cascadeCount: 2, recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 3, separateRestoreCount: 0 } }),
      ]);

      expect(fixture.nativeElement.querySelector('[data-archived-recovery-guidance]')).toBeNull();
    });

    it('labels rich-text and unknown content without counts', async () => {
      const fixture = await render([
        sectionEntry({ section: { ...section, id: 'section-notes', type: 'rich-text', title: undefined }, cascadeCount: undefined, recovery: { kind: 'config' } }),
        sectionEntry({ section: { ...section, id: 'section-calendar', type: 'calendar', title: undefined }, cascadeCount: undefined, recovery: { kind: 'unknown' } }),
      ]);

      const labels = all(fixture, '[data-archived-content]').map((element) => element.textContent?.trim());
      expect(labels).toEqual(['Keeps its text', 'Content this version cannot read — kept to be safe']);
      expect(all(fixture, '[data-archived-recovery-guidance]')).toHaveLength(0);
      expect(all(fixture, '[data-archived-cascade-count]')).toHaveLength(0);
    });

    it('dispatches nothing while another restore is pending', async () => {
      const fixture = await render([sectionEntry({})]);
      const restored = vi.fn();
      fixture.componentInstance.restoreRequested.subscribe(restored);
      fixture.componentRef.setInput('restoring', new Set(['task-other']));
      fixture.detectChanges();

      (all(fixture, '[data-archived-restore]')[0] as HTMLButtonElement).click();
      fixture.componentInstance.restore(fixture.componentInstance.items()[0]!);

      expect(restored).not.toHaveBeenCalled();
    });
  });

  it('disables all restore controls when the root project is archived', async () => {
    const fixture = await render([items[0]!], true);
    expect(all(fixture, '[data-archived-blocked]')[0]?.textContent).toContain('Reactivate');
    expect((all(fixture, '[data-archived-restore]')[0] as HTMLButtonElement).disabled).toBe(true);
  });
});
