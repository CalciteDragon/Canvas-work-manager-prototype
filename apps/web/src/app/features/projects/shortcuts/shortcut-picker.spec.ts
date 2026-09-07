import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type ProjectId, type ProjectPageId, type SectionId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { ProjectPageStore } from '../project-page-store';
import { ShortcutPicker } from './shortcut-picker';
import { ShortcutStore } from './shortcut-store';

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
  it('lists source identity and adds through the page store', async () => {
    const addShortcut = vi.fn(async () => true);
    const gateway = new FakeWorkManagerGateway({ shortcutSources: sources });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ShortcutStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: ProjectPageStore, useValue: { addShortcut } },
      ],
    });
    const fixture = TestBed.createComponent(ShortcutPicker);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.componentRef.setInput('pageId', PAGE);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Website launch / Kitchen');
    (fixture.nativeElement.querySelector('[data-shortcut-add]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(addShortcut).toHaveBeenCalledWith({ pageId: PAGE, sourceSectionId: sources[0]!.sourceSectionId });
    expect(gateway.argumentTo('shortcuts.sources')).toEqual({ projectId: PROJECT, pageId: PAGE });
  });

  it('does not allow an already placed source to be added twice', async () => {
    const addShortcut = vi.fn(async () => true);
    const gateway = new FakeWorkManagerGateway({ shortcutSources: [{ ...sources[0]!, alreadyPlaced: true }] });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ShortcutStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: ProjectPageStore, useValue: { addShortcut } },
      ],
    });
    const fixture = TestBed.createComponent(ShortcutPicker);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.componentRef.setInput('pageId', PAGE);
    fixture.detectChanges();
    await fixture.whenStable();

    const add = fixture.nativeElement.querySelector('[data-shortcut-add]') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.textContent).toContain('Added');
    add.click();
    expect(addShortcut).not.toHaveBeenCalled();
  });

  it('shows the empty picker state when no source is available', async () => {
    const gateway = new FakeWorkManagerGateway({ shortcutSources: [] });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ShortcutStore,
        { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
        { provide: ProjectPageStore, useValue: { addShortcut: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ShortcutPicker);
    fixture.componentRef.setInput('projectId', PROJECT);
    fixture.componentRef.setInput('pageId', PAGE);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-shortcut-picker-empty]')).not.toBeNull();
  });
});
