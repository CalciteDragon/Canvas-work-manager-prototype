import { TestBed } from '@angular/core/testing';
import {
  ProjectSectionSchema,
  ReflectionSchema,
  TaskSchema,
  type ProjectId,
  type ProjectPageId,
  type ProjectSection,
  type Reflection,
  type SectionId,
  type Task,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { ArchivedRegion } from './archived-region';

const PROJECT = 'project-a' as ProjectId;
/** §27: the region is a canvas's undo, and a canvas is a page. */
const PAGE = `page-${PROJECT}` as ProjectPageId;
const AT = '2026-09-02T06:13:32.422Z';
const EARLIER = '2026-09-01T06:13:32.422Z';

const section = (id: string, overrides: Record<string, unknown> = {}): ProjectSection =>
  ProjectSectionSchema.parse({
    id,
    projectId: PROJECT,
    pageId: PAGE,
    type: 'task-list',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: EARLIER,
    updatedAt: AT,
    ...overrides,
  });

const task = (id: string, overrides: Record<string, unknown> = {}): Task =>
  TaskSchema.parse({
    id,
    projectId: PROJECT,
    sectionId: 'section-live',
    title: 'Ship it',
    status: 'todo',
    priority: 'medium',
    createdAt: EARLIER,
    updatedAt: AT,
    ...overrides,
  });

const reflection = (id: string, overrides: Record<string, unknown> = {}): Reflection =>
  ReflectionSchema.parse({
    id,
    projectId: PROJECT,
    sectionId: 'section-notes',
    body: 'A week of it',
    createdAt: EARLIER,
    updatedAt: AT,
    ...overrides,
  });

const render = async (gateway: FakeWorkManagerGateway, restoreBlocked = false) => {
  TestBed.configureTestingModule({
    providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
  });
  const fixture = TestBed.createComponent(ArchivedRegion);
  fixture.componentRef.setInput('projectId', PROJECT);
  fixture.componentRef.setInput('pageId', PAGE);
  fixture.componentRef.setInput('projectDataRevision', 0);
  fixture.componentRef.setInput('restoreBlocked', restoreBlocked);
  const sectionRestored = vi.fn<(id: SectionId) => void>();
  const rowRestored = vi.fn<() => void>();
  fixture.componentInstance.sectionRestored.subscribe(sectionRestored);
  fixture.componentInstance.rowRestored.subscribe(rowRestored);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, gateway, sectionRestored, rowRestored };
};

const html = (fixture: { nativeElement: HTMLElement }): HTMLElement => fixture.nativeElement;
const all = (fixture: { nativeElement: HTMLElement }, selector: string): HTMLElement[] =>
  [...fixture.nativeElement.querySelectorAll<HTMLElement>(selector)];
const text = (fixture: { nativeElement: HTMLElement }): string => fixture.nativeElement.textContent ?? '';

describe('ArchivedRegion', () => {
  it('renders nothing at all when there is nothing to undo', async () => {
    // An empty Archived heading below every canvas would be permanent furniture claiming
    // something happened. The region appears when a removal gives it something to say.
    const { fixture } = await render(
      new FakeWorkManagerGateway({ sections: [section('section-live')], tasks: [], reflections: [] }),
    );

    expect(html(fixture).querySelector('[data-archived-region]')).toBeNull();
  });

  it('names sections through nameOf, including padded and blank legacy titles', async () => {
    // `ProjectSection.title` is a plain optional string, so a document written before the
    // names phase can hold whitespace. The region must say what the canvas would have said —
    // never a raw type, never an id.
    const { fixture } = await render(
      new FakeWorkManagerGateway({
        sections: [
          section('section-a', { title: 'Backlog', archivedAt: AT }),
          section('section-b', { title: '  Shipped  ', archivedAt: EARLIER }),
          section('section-c', { title: '   ', archivedAt: '2026-08-30T06:13:32.422Z' }),
        ],
      }),
    );

    expect(all(fixture, '[data-archived-section] .archived-region__name').map((node) => node.textContent?.trim())).toEqual([
      'Backlog',
      'Shipped',
      'Task List',
    ]);
    expect(text(fixture)).not.toContain('section-a');
  });

  it('suffixes only the names that actually collide, in the order shown', async () => {
    // Sections keep no uniqueness rule — two may share a name deliberately — and every
    // untitled Task List resolves to `Task List`, so without this the region offers three
    // identical Restore buttons.
    const { fixture } = await render(
      new FakeWorkManagerGateway({
        sections: [
          section('section-a', { archivedAt: AT }),
          section('section-b', { archivedAt: EARLIER }),
          section('section-c', { title: 'Backlog', archivedAt: EARLIER }),
        ],
      }),
    );

    expect(all(fixture, '[data-archived-section] .archived-region__name').map((node) => node.textContent?.trim())).toEqual([
      'Task List (archive 1)',
      'Task List (archive 2)',
      'Backlog',
    ]);
  });

  it('counts only the rows that came down with each section, and shows none for a view', async () => {
    const { fixture } = await render(
      new FakeWorkManagerGateway({
        sections: [
          section('section-a', { title: 'Backlog', archivedAt: AT }),
          section('section-notes', { type: 'rich-text', title: 'Notes', archivedAt: EARLIER }),
        ],
        tasks: [
          task('task-1', { sectionId: 'section-a', archivedAt: AT, archivedWithSectionId: 'section-a' }),
          task('task-2', { sectionId: 'section-a', archivedAt: AT, archivedWithSectionId: 'section-a' }),
        ],
      }),
    );

    const counts = all(fixture, '[data-archived-section]').map(
      (node) => node.querySelector('[data-archived-section-count]')?.textContent?.trim() ?? null,
    );
    // A `rich-text` section owns nothing, so `0 tasks` would be a lie rather than a count.
    expect(counts).toEqual(['2 tasks', null]);
  });

  it('shows an emptied container as owning zero rather than pretending it owns none', async () => {
    // A reassign moves the rows out and archives the emptied section. It is still a
    // container, so it says `0 tasks` — which is what the person will get back.
    const { fixture } = await render(
      new FakeWorkManagerGateway({ sections: [section('section-a', { title: 'Backlog', archivedAt: AT })] }),
    );

    expect(html(fixture).querySelector('[data-archived-section-count]')?.textContent?.trim()).toBe('0 tasks');
  });

  it('offers only rows that can actually be restored, newest first', async () => {
    // A row inside an archived section, one that came down with a section or an ancestor,
    // and one whose parent is archived are all refused by the domain until something else
    // returns first — so none of them is offered here.
    const { fixture } = await render(
      new FakeWorkManagerGateway({
        sections: [section('section-live'), section('section-gone', { archivedAt: AT })],
        tasks: [
          task('task-standalone', { title: 'On its own', archivedAt: AT }),
          task('task-older', { title: 'Filed earlier', archivedAt: EARLIER }),
          task('task-with-section', { sectionId: 'section-gone', archivedAt: AT, archivedWithSectionId: 'section-gone' }),
          task('task-in-archived-section', { sectionId: 'section-gone', archivedAt: AT }),
          task('task-parent', { title: 'Parent', archivedAt: AT }),
          task('task-child', { title: 'Child', archivedAt: EARLIER, parentTaskId: 'task-parent' }),
        ],
        reflections: [
          reflection('reflection-standalone', { sectionId: 'section-live', title: 'Week 34', archivedAt: EARLIER }),
        ],
      }),
    );

    // Newest first, with the id as the tie-break — deterministic rather than incidental,
    // because the three collections arrive from three separate reads.
    expect(all(fixture, '[data-archived-row] .archived-region__name').map((node) => node.textContent?.trim())).toEqual([
      'Parent',
      'On its own',
      'Week 34',
      'Filed earlier',
    ]);
  });

  it('falls back to Reflection for a row with no usable title', async () => {
    const { fixture } = await render(
      new FakeWorkManagerGateway({
        sections: [section('section-live', { type: 'reflections' })],
        reflections: [reflection('reflection-a', { sectionId: 'section-live', title: '   ', archivedAt: AT })],
      }),
    );

    expect(html(fixture).querySelector('[data-archived-row] .archived-region__name')?.textContent?.trim()).toBe(
      'Reflection',
    );
  });

  it('restores a section and tells the page, which is what repaints the canvas', async () => {
    // The revision alone would only make existing containers re-read. A restored section is
    // a *new* frame, so the page has to reconcile — hence a separate output.
    const gateway = new FakeWorkManagerGateway({
      sections: [section('section-a', { title: 'Backlog', archivedAt: AT })],
    });
    const { fixture, sectionRestored } = await render(gateway);

    html(fixture).querySelector<HTMLButtonElement>('[data-archived-section-restore]')!.click();
    await fixture.whenStable();

    expect(gateway.calls.filter(({ method }) => method === 'sections.restore')).toEqual([
      { method: 'sections.restore', argument: 'section-a' },
    ]);
    expect(sectionRestored).toHaveBeenCalledWith('section-a');
  });

  it('restores a standalone row and notifies the page, so its container re-reads', async () => {
    const gateway = new FakeWorkManagerGateway({
      sections: [section('section-live')],
      tasks: [task('task-standalone', { archivedAt: AT })],
    });
    const { fixture, rowRestored } = await render(gateway);

    html(fixture).querySelector<HTMLButtonElement>('[data-archived-row-restore]')!.click();
    await fixture.whenStable();

    expect(gateway.calls.some(({ method }) => method === 'tasks.restore')).toBe(true);
    expect(rowRestored).toHaveBeenCalled();
  });

  it('keeps the entry and shows the reason when a restore fails', async () => {
    const gateway = new FakeWorkManagerGateway({
      sections: [section('section-a', { title: 'Backlog', archivedAt: AT })],
      failOn: { 'sections.restore': new GatewayError('rule_violation', 409, 'project "project-a" is archived') },
    });
    const { fixture, sectionRestored } = await render(gateway);

    html(fixture).querySelector<HTMLButtonElement>('[data-archived-section-restore]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(html(fixture).querySelector('[data-archived-error]')?.textContent).toContain('is archived');
    // Nothing came back, so the entry stays and the page is not told to repaint.
    expect(all(fixture, '[data-archived-section]')).toHaveLength(1);
    expect(sectionRestored).not.toHaveBeenCalled();
  });

  it('disables every Restore and explains why while the project is archived', async () => {
    // The page is reachable by direct URL for an archived project. The work stays visible —
    // erasing it would be worse — but the domain would refuse the restore, so the control
    // says what to do instead rather than failing on click.
    const gateway = new FakeWorkManagerGateway({
      sections: [section('section-a', { title: 'Backlog', archivedAt: AT })],
      tasks: [task('task-standalone', { archivedAt: AT })],
    });
    const { fixture, sectionRestored } = await render(gateway, true);

    expect(text(fixture)).toContain('Reactivate this project to restore archived work.');
    for (const button of all(fixture, 'button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }

    html(fixture).querySelector<HTMLButtonElement>('[data-archived-section-restore]')!.click();
    await fixture.whenStable();
    // No speculative request: the refusal is enforced by HTTP and MCP, and predicted here.
    expect(gateway.calls.some(({ method }) => method === 'sections.restore')).toBe(false);
    expect(sectionRestored).not.toHaveBeenCalled();
  });

  it('re-reads when the page’s data revision moves', async () => {
    // A task archived from its row emits `task.archived`, which the page turns into a
    // revision bump rather than a canvas reconcile — this is how the region hears about it.
    const gateway = new FakeWorkManagerGateway({ sections: [section('section-live')], tasks: [] });
    const { fixture } = await render(gateway);
    expect(html(fixture).querySelector('[data-archived-region]')).toBeNull();

    gateway.options.tasks = [task('task-standalone', { title: 'Just archived', archivedAt: AT })];
    fixture.componentRef.setInput('projectDataRevision', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Just archived');
  });
});
