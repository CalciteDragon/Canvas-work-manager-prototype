import { ProjectSectionSchema, TaskSchema } from '@cwm/contracts';
import { type ProjectId, type ProjectPageId, type SectionId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { ShortcutPicker } from './shortcut-picker';
import { ShortcutStore } from './shortcut-store';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TaskListSection } from '../sections/tasks/task-list-section';
import { GatewayError } from '../../../core/gateway/gateway-error';

const PROJECT = 'project-a' as ProjectId;
const PAGE = 'page-project-a' as ProjectPageId;
const sources = [
  {
    section: ProjectSectionSchema.parse({ id: 'section-source', projectId: PROJECT, pageId: 'page-work', type: 'task-list', position: 0, columnSpan: 12, collapsed: false, config: {}, createdAt: '2026-08-24T16:00:00.000Z', updatedAt: '2026-08-24T16:00:00.000Z' }),
    sourceSectionId: 'section-source' as SectionId,
    type: 'task-list',
    name: 'Kitchen tasks',
    projectId: PROJECT,
    projectName: 'Website launch',
    pageId: 'page-work' as ProjectPageId,
    pageKind: 'work' as const,
    breadcrumb: ['Website launch', 'Kitchen'],
    alreadyPlaced: false,
  },
];

describe('ShortcutPicker (§27)', () => {
  const renderPreview = async (gateway = new FakeWorkManagerGateway({ shortcutSources: sources })) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ShortcutStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
    const fixture = TestBed.createComponent(ShortcutPicker);
    const create = vi.fn(async () => null);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.componentRef.setInput('pageId', PAGE);
    fixture.componentRef.setInput('create', create);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, create, gateway };
  };

  const openPreview = async (fixture: Awaited<ReturnType<typeof renderPreview>>['fixture']) => {
    const disclosure = fixture.nativeElement.querySelector('[data-shortcut-preview]') as HTMLDetailsElement;
    expect(disclosure).not.toBeNull();
    disclosure.open = true;
    disclosure.dispatchEvent(new Event('toggle'));
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  };

  it('slice 77 groups source names beneath their owner path and page', async () => {
    const second = { ...sources[0]!, sourceSectionId: 'section-second' as SectionId, name: 'Second' };
    const third = { ...sources[0]!, projectId: 'other-project' as ProjectId, sourceSectionId: 'section-third' as SectionId, name: 'Third', breadcrumb: ['Other project'] };
    const { fixture } = await renderPreview(new FakeWorkManagerGateway({ shortcutSources: [sources[0]!, second, third] }));
    const groups = [...fixture.nativeElement.querySelectorAll('[data-shortcut-source-group]')] as HTMLElement[];
    expect(groups).toHaveLength(2);
    expect(groups[0]!.querySelectorAll('[data-shortcut-source-option]')).toHaveLength(2);
    expect(groups[0]!.querySelector('[data-shortcut-location]')?.textContent).toContain('Website launch / Kitchen · Work canvas');
  });

  it('slice 77 lazily previews the registered content read-only with no source link', async () => {
    const task = TaskSchema.parse({ id: 'task-preview', projectId: PROJECT, sectionId: sources[0]!.section.id, title: 'Preview task', status: 'todo', priority: 'medium', createdAt: '2026-08-24T16:00:00.000Z', updatedAt: '2026-08-24T16:00:00.000Z' });
    const { fixture, gateway } = await renderPreview(new FakeWorkManagerGateway({ shortcutSources: sources, tasks: [task] }));
    expect(fixture.debugElement.query(By.directive(TaskListSection))).toBeNull();
    await openPreview(fixture);
    const content = fixture.debugElement.query(By.directive(TaskListSection)).componentInstance as TaskListSection;
    expect(content.readOnly()).toBe(true);
    expect((content as unknown as { sourceLink: () => unknown }).sourceLink()).toBeNull();
    expect(await content.onConfigChange()({})).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-quick-create], a[data-task-title]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-task-title]')?.textContent).toBe('Preview task');
    expect(gateway.calls.some(({ method }) => method === 'tasks.list')).toBe(true);
  });

  for (const [status, reason] of [[403, 'Preview read refused'], [503, 'Preview host unavailable']] as const) {
    it(`slice 77 contains a ${status} preview failure and still allows Add`, async () => {
      const gateway = new FakeWorkManagerGateway({ shortcutSources: sources, failOn: { 'tasks.list': new GatewayError('unreachable', status, reason) } });
      const { fixture, create } = await renderPreview(gateway);
      await openPreview(fixture);
      expect(fixture.nativeElement.querySelector('[data-shortcut-preview] [data-tasks-error]')?.textContent).toContain(reason);
      (fixture.nativeElement.querySelector('[data-shortcut-add]') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(create).toHaveBeenCalledWith(sources[0]);
    });
  }

  it('slice 77 previews an unavailable source type with explanatory text', async () => {
    const unknown = { ...sources[0]!, type: 'unavailable-type', section: { ...sources[0]!.section, type: 'unavailable-type' } };
    const { fixture } = await renderPreview(new FakeWorkManagerGateway({ shortcutSources: [unknown] }));
    await openPreview(fixture);
    expect(fixture.nativeElement.querySelector('[data-shortcut-preview-unavailable]')?.textContent).toContain('not available in this build');
  });
  it('lists sources and creates through the positioned callback once', async () => {
    const create = vi.fn(async () => null);
    const gateway = new FakeWorkManagerGateway({ shortcutSources: sources });
    TestBed.configureTestingModule({
      providers: [
        ShortcutStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      ],
    });
    const fixture = TestBed.createComponent(ShortcutPicker);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.componentRef.setInput('pageId', PAGE);
    fixture.componentRef.setInput('create', create);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Website launch / Kitchen');
    (fixture.nativeElement.querySelector('[data-shortcut-add]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(create).toHaveBeenCalledWith(sources[0]);
    expect(gateway.argumentTo('shortcuts.sources')).toEqual({ projectId: PROJECT, pageId: PAGE });
  });

  it('does not allow an already placed source to be added twice', async () => {
    const gateway = new FakeWorkManagerGateway({ shortcutSources: [{ ...sources[0]!, alreadyPlaced: true }] });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ShortcutStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      ],
    });
    const fixture = TestBed.createComponent(ShortcutPicker);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.componentRef.setInput('pageId', PAGE);
    fixture.componentRef.setInput('create', vi.fn(async () => null));
    fixture.detectChanges();
    await fixture.whenStable();

    const add = fixture.nativeElement.querySelector('[data-shortcut-add]') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.textContent).toContain('Added');
    add.click();
  });

  it('shows the empty picker state when no source is available', async () => {
    const gateway = new FakeWorkManagerGateway({ shortcutSources: [] });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ShortcutStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      ],
    });
    const fixture = TestBed.createComponent(ShortcutPicker);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.componentRef.setInput('pageId', PAGE);
    fixture.componentRef.setInput('create', vi.fn(async () => null));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-shortcut-picker-empty]')).not.toBeNull();
  });

  it('disables every Add while pending and preserves the picker on failure', async () => {
    let finish!: (message: string | null) => void;
    const create = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
    const gateway = new FakeWorkManagerGateway({ shortcutSources: [sources[0]!, { ...sources[0]!, sourceSectionId: 'section-b' as SectionId }] });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ShortcutStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
    });
    const fixture = TestBed.createComponent(ShortcutPicker);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.componentRef.setInput('pageId', PAGE);
    fixture.componentRef.setInput('create', create);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const adds = fixture.nativeElement.querySelectorAll('[data-shortcut-add]') as NodeListOf<HTMLButtonElement>;
    adds[0]!.click();
    adds[1]!.click();
    fixture.detectChanges();
    expect([...adds].every((button) => button.disabled)).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    finish('Could not place shortcut');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-shortcut-picker-create-error]')?.textContent).toContain(
      'Could not place shortcut',
    );
    expect(fixture.nativeElement.querySelectorAll('[data-shortcut-add]')).toHaveLength(2);
  });

  // Slice 72 (W3-017): two sources of one type must not both be "Add" to a screen reader.
  it('names each Add by its source, so two sources of one type stay distinct', async () => {
    const twins = [
      { ...sources[0]!, sourceSectionId: 'section-kitchen' as SectionId, name: 'Progress', type: 'progress', breadcrumb: ['Home renovation', 'Kitchen'] },
      { ...sources[0]!, sourceSectionId: 'section-garden' as SectionId, name: 'Progress', type: 'progress', breadcrumb: ['Home renovation', 'Garden'] },
    ];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ShortcutStore, { provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway({ shortcutSources: twins }) }] });
    const fixture = TestBed.createComponent(ShortcutPicker);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.componentRef.setInput('pageId', PAGE);
    fixture.componentRef.setInput('create', vi.fn(async () => null));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const names = [...fixture.nativeElement.querySelectorAll('[data-shortcut-add]')].map((button) => (button as HTMLElement).getAttribute('aria-label'));
    expect(names).toEqual([
      'Add Progress, Home renovation / Kitchen · Work canvas',
      'Add Progress, Home renovation / Garden · Work canvas',
    ]);
  });
});
