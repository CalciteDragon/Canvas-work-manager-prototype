import { type ProjectId, type ProjectPageId, type SectionId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { ShortcutPicker } from './shortcut-picker';
import { ShortcutStore } from './shortcut-store';
import { TestBed } from '@angular/core/testing';

const PROJECT = 'project-a' as ProjectId;
const PAGE = 'page-project-a' as ProjectPageId;
const sources = [
  {
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
