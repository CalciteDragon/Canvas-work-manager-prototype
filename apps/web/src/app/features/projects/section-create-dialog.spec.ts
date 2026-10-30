import { ProjectSectionSchema } from '@cwm/contracts';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastSlot } from '../../shared/feedback/toast-slot';
import { type ProjectId, type ProjectPageId, type SectionId, type ShortcutSource } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { SECTION_REGISTRY } from './sections/registry';
import { SectionCreateDialog } from './section-create-dialog';
import type { Failure } from '../../shared/feedback/failure';
import { ShortcutStore } from './shortcuts/shortcut-store';

const PROJECT = 'project-a' as ProjectId;
const PAGE = 'page-project-a' as ProjectPageId;

const render = (options: {
  shortcutsAllowed?: boolean;
  create?: (type: string, title: string | null) => Promise<Failure | null>;
  createShortcut?: (source: ShortcutSource) => Promise<Failure | null>;
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
  fixture.componentRef.setInput('types', SECTION_REGISTRY);
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
  it('suppresses the toast until the custom modal is destroyed', () => {
    const fixture = render();
    const slot = TestBed.inject(ToastSlot);
    expect(slot.suppressed()).toBe(true);
    expect(query(fixture, '[data-modal-lift]')).not.toBeNull();
    fixture.destroy();
    expect(slot.suppressed()).toBe(false);
  });
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

    expect([...type.options].map((option) => option.value)).toEqual(['markdown', 'task-list', 'progress', 'reflections', 'timeline', 'recent-activity']);
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
    let finish!: (failure: Failure | null) => void;
    const create = vi.fn(() => new Promise<Failure | null>((resolve) => (finish = resolve)));
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
    finish({ sentence: 'Couldn’t add “Kitchen”. Try again.', reason: 'Unable to create section' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((query(fixture, '[data-create-section-type]') as HTMLSelectElement).value).toBe('task-list');
    expect((query(fixture, '[data-create-section-name]') as HTMLInputElement).value).toBe('Kitchen');
    // Slice 78: the product sentence is the alert and the name's description; the reason is
    // only under a closed Details.
    const error = query(fixture, '[data-create-section-error]')!;
    const sentence = error.querySelector<HTMLElement>('[data-failure-sentence]')!;
    expect(sentence.textContent?.trim()).toBe('Couldn’t add “Kitchen”. Try again.');
    expect(sentence.getAttribute('role')).toBe('alert');
    expect(error.querySelector('details')?.open).toBe(false);
    expect(error.querySelector('details')?.textContent).toContain('Unable to create section');
    const described = document.getElementById(name.getAttribute('aria-describedby')!);
    expect(described).toBe(sentence);
    expect(described?.textContent?.trim()).toBe('Couldn’t add “Kitchen”. Try again.');
  });

  it('shows the canvas’s own refusal as a sentence with no Details', async () => {
    const fixture = render({ create: async () => ({ sentence: 'The page is still loading. Try again in a moment.', reason: null }) });
    (query(fixture, '[data-create-section-submit]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const error = query(fixture, '[data-create-section-error]')!;
    expect(error.textContent?.trim()).toBe('The page is still loading. Try again in a moment.');
    expect(error.querySelector('details')).toBeNull();
  });

  it('turns a thrown create into a product sentence with the reason under Details', async () => {
    const fixture = render({ create: async () => { throw new Error('host stopped'); } });
    (query(fixture, '[data-create-section-submit]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const error = query(fixture, '[data-create-section-error]')!;
    expect(error.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t add the section. Try again.');
    expect(error.querySelector('details')?.textContent).toContain('host stopped');
  });

  it('offers shortcut mode only when enabled and hosts its source picker', async () => {
    const root = render({ shortcutsAllowed: true });
    query(root, '[data-create-shortcut-mode]')!.click();
    root.detectChanges();
    expect(query(root, '[data-shortcut-picker]')).not.toBeNull();
    expect(query(root, '[data-create-section-type]')).toBeNull();
    await root.whenStable();

    TestBed.resetTestingModule();
    const optional = render({ shortcutsAllowed: false });
    expect(query(optional, '[data-create-shortcut-mode]')).toBeNull();
  });

  it('keeps shortcut mode open and blocks back, cancel and Escape while a create is pending', async () => {
    let finish!: (failure: Failure | null) => void;
    const source: ShortcutSource = {
      section: ProjectSectionSchema.parse({ id: 'section-source', projectId: PROJECT, pageId: 'page-work', type: 'markdown', position: 0, columnSpan: 12, collapsed: false, config: {}, createdAt: '2026-08-24T16:00:00.000Z', updatedAt: '2026-08-24T16:00:00.000Z' }),
      sourceSectionId: 'section-source' as SectionId,
      type: 'markdown',
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

    finish({ sentence: 'Couldn’t add a shortcut to “Source notes”. Try again.', reason: 'Unable to place shortcut' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.mode()).toBe('shortcut');
    const error = query(fixture, '[data-shortcut-picker-create-error]')!;
    expect(error.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t add a shortcut to “Source notes”. Try again.');
    expect(error.querySelector('details')?.textContent).toContain('Unable to place shortcut');
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
