import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ProjectId, type ProjectPageId, type SectionId, type ShortcutSource } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { SECTION_REGISTRY } from './sections/registry';
import { SectionCreateDialog } from './section-create-dialog';
import { ShortcutStore } from './shortcuts/shortcut-store';

const PROJECT = 'project-a' as ProjectId;
const PAGE = 'page-project-a' as ProjectPageId;

const render = (options: {
  shortcutsAllowed?: boolean;
  create?: (type: string, title: string | null) => Promise<string | null>;
  createShortcut?: (source: ShortcutSource) => Promise<string | null>;
  shortcutSources?: ShortcutSource[];
  sourcesLoading?: boolean;
} = {}) => {
  const shortcutStoreProvider = options.sourcesLoading
    ? {
        provide: ShortcutStore,
        useValue: {
          loading: signal(true),
          error: signal(null),
          sources: signal<ShortcutSource[]>([]),
          load: vi.fn(async () => {}),
        },
      }
    : ShortcutStore;
  TestBed.configureTestingModule({
    providers: [
      shortcutStoreProvider,
      { provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway({ shortcutSources: options.shortcutSources ?? [] }) },
    ],
  });
  const fixture = TestBed.createComponent(SectionCreateDialog);
  fixture.componentRef.setInput('types', SECTION_REGISTRY.slice(0, 2));
  fixture.componentRef.setInput('projectId', PROJECT);
  fixture.componentRef.setInput('pageId', PAGE);
  fixture.componentRef.setInput('shortcutsAllowed', options.shortcutsAllowed ?? false);
  fixture.componentRef.setInput('create', options.create ?? (async () => null));
  fixture.componentRef.setInput('createShortcut', options.createShortcut ?? (async () => null));
  fixture.detectChanges();
  return fixture;
};

const query = (fixture: ReturnType<typeof render>, selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('SectionCreateDialog (§27)', () => {
  it('lists registered types and sends null when the name is blank', async () => {
    const create = vi.fn(async () => null);
    const fixture = render({ create });
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const type = query(fixture, '[data-create-section-type]') as HTMLSelectElement;
    type.value = 'task-list';
    type.dispatchEvent(new Event('change'));
    (query(fixture, '[data-create-section-name]') as HTMLInputElement).value = '   ';
    query(fixture, '[data-create-section-submit]')!.click();
    await fixture.whenStable();

    expect([...type.options].map((option) => option.value)).toEqual(['rich-text', 'task-list']);
    expect(create).toHaveBeenCalledWith('task-list', null);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('Cancel and Escape close without calling create', () => {
    const create = vi.fn(async () => null);
    const fixture = render({ create });
    query(fixture, '[data-create-section-cancel]')!.click();
    expect(create).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const second = render({ create });
    second.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(create).not.toHaveBeenCalled();
  });

  it('blocks repeated submit while pending and retains form values on failure', async () => {
    let finish!: (message: string | null) => void;
    const create = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
    const fixture = render({ create });
    const type = query(fixture, '[data-create-section-type]') as HTMLSelectElement;
    const name = query(fixture, '[data-create-section-name]') as HTMLInputElement;
    type.value = 'task-list';
    type.dispatchEvent(new Event('change'));
    name.value = 'Kitchen';
    name.dispatchEvent(new Event('input'));
    const submit = query(fixture, '[data-create-section-submit]') as HTMLButtonElement;
    submit.click();
    submit.click();
    fixture.detectChanges();
    expect(create).toHaveBeenCalledTimes(1);
    expect(submit.disabled).toBe(true);
    finish('Unable to create section');
    await fixture.whenStable();
    fixture.detectChanges();
    expect((query(fixture, '[data-create-section-type]') as HTMLSelectElement).value).toBe('task-list');
    expect((query(fixture, '[data-create-section-name]') as HTMLInputElement).value).toBe('Kitchen');
    expect(query(fixture, '[data-create-section-error]')?.textContent).toContain('Unable to create section');
  });

  it('offers shortcut mode only when enabled and hosts its source picker', async () => {
    const root = render({ shortcutsAllowed: true });
    query(root, '[data-create-shortcut-mode]')!.click();
    root.detectChanges();
    expect(query(root, '[data-shortcut-picker]')).not.toBeNull();
    expect(query(root, '[data-create-section-type]')).toBeNull();
    await root.whenStable();

    TestBed.resetTestingModule();
    const work = render({ shortcutsAllowed: false });
    expect(query(work, '[data-create-shortcut-mode]')).toBeNull();
  });

  it('keeps shortcut mode open and blocks back, cancel and Escape while a create is pending', async () => {
    let finish!: (message: string | null) => void;
    const source: ShortcutSource = {
      sourceSectionId: 'section-source' as SectionId,
      type: 'rich-text',
      name: 'Source notes',
      projectId: PROJECT,
      projectName: 'Website launch',
      pageId: 'page-source' as ProjectPageId,
      pageKind: 'work',
      breadcrumb: ['Website launch', 'API'],
      alreadyPlaced: false,
    };
    const fixture = render({
      shortcutsAllowed: true,
      createShortcut: () => new Promise((resolve) => (finish = resolve)),
      shortcutSources: [source],
    });
    query(fixture, '[data-create-shortcut-mode]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    const add = query(fixture, '[data-shortcut-add]') as HTMLButtonElement;
    add.focus();
    expect(document.activeElement).toBe(add);
    add.click();
    fixture.detectChanges();
    const dialog = query(fixture, '[data-section-create-dialog]')!;
    expect(document.activeElement).toBe(dialog);
    for (const shiftKey of [false, true]) {
      const tab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      dialog.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(dialog);
    }
    const back = query(fixture, '[data-create-section-mode]') as HTMLButtonElement;
    const cancel = query(fixture, '[data-create-dialog-close]') as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    query(fixture, '[data-section-create-dialog]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    back.click();
    cancel.click();
    expect(fixture.componentInstance.mode()).toBe('shortcut');
    expect(closed).not.toHaveBeenCalled();

    finish('Unable to place shortcut');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.mode()).toBe('shortcut');
    expect(query(fixture, '[data-shortcut-picker-create-error]')?.textContent).toContain('Unable to place shortcut');
    expect(back.disabled).toBe(false);
    expect(cancel.disabled).toBe(false);
  });

  it('keeps keyboard focus inside the dialog while shortcut sources are loading', async () => {
    const fixture = render({ shortcutsAllowed: true, sourcesLoading: true });
    query(fixture, '[data-create-shortcut-mode]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = query(fixture, '[data-section-create-dialog]')!;
    const modeButton = query(fixture, '[data-create-section-mode]') as HTMLButtonElement;
    expect(document.activeElement).toBe(modeButton);
    expect(dialog.contains(document.activeElement)).toBe(true);

    dialog.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(modeButton);
  });
});
