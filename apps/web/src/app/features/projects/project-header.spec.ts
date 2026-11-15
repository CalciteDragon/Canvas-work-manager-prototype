import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { ProjectSchema, type Project } from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { NavigationContext } from '../../core/shell/navigation-context';
import type { BreadcrumbItem } from '../../shared/components/breadcrumb/breadcrumb';
import { ProjectHeader } from './project-header';

const root = (overrides: Record<string, unknown> = {}): Project => ProjectSchema.parse({
  id: 'project-a', workspaceId: 'workspace-demo', kind: 'root', name: 'Website launch', icon: '🚀',
  status: 'on_hold', targetDate: '2026-09-30', projectLayoutMode: 'flow',
  createdAt: '2026-08-27T16:00:00.000Z', updatedAt: '2026-08-27T16:00:00.000Z', ...overrides,
});

const originals = [
  { target: HTMLElement.prototype, key: 'hidePopover', descriptor: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover') },
  ...['showModal', 'close'].map((key) => ({ target: HTMLDialogElement.prototype, key, descriptor: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key) })),
];
afterEach(() => {
  TestBed.resetTestingModule();
  for (const { target, key, descriptor } of originals) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value() {
    this.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed', oldState: 'open' }));
  } });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});

const render = async (project = root(), breadcrumb: readonly BreadcrumbItem[] = []) => {
  TestBed.configureTestingModule({ deferBlockBehavior: DeferBlockBehavior.Playthrough, providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ProjectHeader);
  fixture.componentRef.setInput('project', project);
  fixture.componentRef.setInput('breadcrumb', breadcrumb);
  fixture.componentRef.setInput('progress', 50);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
};
type HeaderFixture = Awaited<ReturnType<typeof render>>;
const query = (fixture: HeaderFixture, selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
const settle = async (fixture: HeaderFixture) => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
const openMore = async (fixture: HeaderFixture) => {
  query(fixture, '[data-project-more]').focus();
  query(fixture, '[data-project-more-menu]').dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open', oldState: 'closed' }));
  await settle(fixture);
};
const edit = async (fixture: HeaderFixture) => {
  await openMore(fixture);
  query(fixture, '[data-project-edit-details]').click();
  await settle(fixture);
};
const change = (fixture: HeaderFixture, selector: string, value: string) => {
  const field = query(fixture, selector) as HTMLInputElement;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('ProjectHeader lifts (§26)', () => {
  it('renders project identity and a route landing', async () => {
    const fixture = await render();
    expect(query(fixture, '[data-project-name]').textContent).toContain('Website launch');
    expect(query(fixture, '[data-project-name]').hasAttribute('data-route-focus')).toBe(true);
    expect(query(fixture, '[data-project-progress]').textContent).toContain('50%');
    fixture.componentRef.setInput('progress', 0);
    await settle(fixture);
    expect(query(fixture, '[data-project-progress]').textContent).toContain('0%');
  });

  // Slice 81, Q6 (i): the h1 names the current page; on a root's other pages that is the page, and the
  // project's name is the path's first step (L7-018).
  it('names a root’s other page in its h1, the page’s one heading and route landing', async () => {
    const fixture = await render(root(), [{ label: 'Website launch', link: ['/projects', 'project-1'] }, { label: 'Todos', link: null }]);
    fixture.componentRef.setInput('heading', 'Todos');
    await settle(fixture);
    const heading = query(fixture, 'h1');

    expect(heading.textContent?.trim()).toBe('Todos');
    expect(heading.hasAttribute('data-page-heading')).toBe(true);
    expect(heading.hasAttribute('data-route-page-focus')).toBe(true);
    expect(query(fixture, '[data-project-name]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('h1')).toHaveLength(1);
  });

  it('names the project in its h1 when the page is the project’s own', async () => {
    const fixture = await render();
    const heading = query(fixture, 'h1');

    expect(heading.textContent?.trim()).toBe('Website launch');
    expect(heading.hasAttribute('data-project-name')).toBe(true);
    expect(heading.hasAttribute('data-page-heading')).toBe(true);
  });

  it('names the progress fact’s state, never "Not available" (§39, L4-017)', async () => {
    const fixture = await render();
    const fact = () => query(fixture, '[data-project-progress]');
    fixture.componentRef.setInput('progress', 'pending');
    await settle(fixture);
    expect(fact().textContent?.trim()).toBe('Measuring…');
    expect(query(fixture, '[data-project-progress-pending]')).toBeTruthy();
    expect(fact().querySelector('[role="status"], [role="alert"], [aria-busy]')).toBeNull();
    fixture.componentRef.setInput('progress', 'empty');
    await settle(fixture);
    expect(fact().textContent?.trim()).toBe('No tasks to measure');
    fixture.componentRef.setInput('progress', 'failed');
    await settle(fixture);
    expect(fact().textContent?.trim()).toBe('Couldn’t load');
    expect(query(fixture, '[data-project-progress-failed]')).toBeTruthy();
    for (const value of ['pending', 'empty', 'failed', 0] as const) {
      fixture.componentRef.setInput('progress', value);
      await settle(fixture);
      expect(fact().textContent).not.toContain('Not available');
    }
  });

  it('uses a native menu invoker, focuses the first item, and navigates menu keys', async () => {
    const fixture = await render();
    expect(query(fixture, '[data-project-more]').getAttribute('aria-haspopup')).toBe('menu');
    expect(query(fixture, '[data-project-more-menu]').getAttribute('popover')).toBe('auto');
    await openMore(fixture);
    const first = query(fixture, '[data-project-edit-details]');
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(query(fixture, '[data-project-archive]'));
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);
    expect(query(fixture, '[data-project-more]').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(query(fixture, '[data-project-more]'));
  });

  it('emits only a changed status and restores the opener', async () => {
    const fixture = await render();
    const requested = vi.fn();
    fixture.componentInstance.statusRequested.subscribe(requested);
    await openMore(fixture);
    query(fixture, '[data-status="on_hold"]').click();
    expect(requested).not.toHaveBeenCalled();
    await openMore(fixture);
    query(fixture, '[data-status="active"]').click();
    expect(requested).toHaveBeenCalledExactlyOnceWith('active');
    expect(document.activeElement).toBe(query(fixture, '[data-project-more]'));
  });

  for (const status of ['active', 'archived'] as const) {
    it(`separates Open archive from the status group (${status})`, async () => {
      const fixture = await render(root({ status }));
      const openArchive = query(fixture, '[data-project-open-archive]');
      expect(openArchive.previousElementSibling?.getAttribute('role')).toBe('separator');
      expect(openArchive.previousElementSibling?.previousElementSibling?.getAttribute('aria-label')).toBe('Status');
    });
  }

  it('passes the opener to Open archive and omits Archive on archived projects', async () => {
    const fixture = await render(root({ status: 'archived' }));
    const requested = vi.fn();
    fixture.componentInstance.openArchiveRequested.subscribe(requested);
    await openMore(fixture);
    expect(query(fixture, '[data-project-archive]')).toBeNull();
    query(fixture, '[data-project-open-archive]').click();
    expect(requested).toHaveBeenCalledExactlyOnceWith(query(fixture, '[data-project-more]'));
    expect(document.activeElement).not.toBe(query(fixture, '[data-project-more]'));
  });

  // Slice 81, decision 3: page settings and Add workstream are also in More, named by the root.
  // More reads the root and calls the shell's handlers through `NavigationContext` itself.
  const treeActions = (addBlockedReason: string | null = null) => {
    const navigation = TestBed.inject(NavigationContext);
    const rootPlace = { id: 'project-renovation' as Project['id'], name: 'Home renovation', status: 'active' as const };
    navigation.publish({ projectId: rootPlace.id, status: 'ready', root: rootPlace, ancestors: [], current: rootPlace, pages: [], currentKind: 'home', addBlockedReason });
    const handlers = { openPageSettings: vi.fn(), openAddWorkstream: vi.fn() };
    navigation.register(handlers);
    return handlers;
  };

  it('offers the root’s page settings and Add workstream, each calling its handler with the More button after the menu closes', async () => {
    const fixture = await render(root({ name: 'Kitchen' }));
    const handlers = treeActions();
    await settle(fixture);
    const more = query(fixture, '[data-project-more]');

    await openMore(fixture);
    const pagesItem = query(fixture, '[data-project-pages]');
    expect(pagesItem.getAttribute('role')).toBe('menuitem');
    expect(pagesItem.textContent?.trim()).toBe('Pages of Home renovation…');
    pagesItem.click();
    await settle(fixture);
    expect(handlers.openPageSettings).toHaveBeenCalledExactlyOnceWith({ source: more, returnFocus: more });
    expect(more.getAttribute('aria-expanded')).toBe('false');

    await openMore(fixture);
    const addItem = query(fixture, '[data-project-add-workstream]');
    expect(addItem.textContent?.trim()).toBe('Add workstream');
    expect(query(fixture, '#' + addItem.getAttribute('aria-describedby')).textContent?.trim()).toBe('in Home renovation');
    addItem.click();
    await settle(fixture);
    expect(handlers.openAddWorkstream).toHaveBeenCalledExactlyOnceWith({ source: more, returnFocus: more });
  });

  it('keeps an archived root’s Add workstream focusable with its reason, and it does nothing', async () => {
    const fixture = await render(root({ name: 'Home renovation', status: 'archived' }));
    const handlers = treeActions('unavailable while Home renovation is archived');
    await settle(fixture);
    await openMore(fixture);
    const addItem = query(fixture, '[data-project-add-workstream]');
    expect(addItem.getAttribute('aria-disabled')).toBe('true');
    expect(query(fixture, '#' + addItem.getAttribute('aria-describedby')).textContent?.trim()).toBe('unavailable while Home renovation is archived');
    addItem.click();
    await settle(fixture);
    expect(handlers.openAddWorkstream).not.toHaveBeenCalled();
    expect(query(fixture, '[data-project-more]').getAttribute('aria-expanded')).toBe('true');
  });

  it('saves changed details once and closes unchanged details without writing', async () => {
    const fixture = await render();
    const save = vi.fn().mockResolvedValue(true);
    fixture.componentRef.setInput('saveDetails', save);
    await edit(fixture);
    query(fixture, '[data-project-details-save]').click();
    await settle(fixture);
    expect(save).not.toHaveBeenCalled();
    await edit(fixture);
    change(fixture, '[data-project-rename-input]', 'Refit');
    change(fixture, '[data-project-description-input]', 'Rooms');
    query(fixture, '[data-project-target-date-clear]').click();
    query(fixture, '[data-project-details-save]').click();
    await settle(fixture);
    expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Refit', description: 'Rooms', targetDate: null });
    expect(query(fixture, '[data-project-details-dialog]')).toBeNull();
    expect(document.activeElement).toBe(query(fixture, '[data-project-more]'));
  });

  it('refuses blank names and asks to discard on repeated Escape and Cancel', async () => {
    const fixture = await render();
    await edit(fixture);
    change(fixture, '[data-project-rename-input]', ' ');
    query(fixture, '[data-project-details-save]').click();
    await settle(fixture);
    expect(query(fixture, '[role="alert"]').textContent).toContain('name');
    const dialog = query(fixture, '[data-project-details-dialog]');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle(fixture);
    expect(query(fixture, '[data-project-discard-confirm]')).toBeTruthy();
    query(fixture, '[data-project-keep-editing]').click();
    query(fixture, '[data-project-details-cancel]').click();
    await settle(fixture);
    expect(query(fixture, '[data-project-discard-confirm]')).toBeTruthy();
    query(fixture, '[data-project-discard]').click();
    await settle(fixture);
    expect(query(fixture, '[data-project-details-dialog]')).toBeNull();
  });

  it('preserves dirty fields on refresh while clean fields follow it', async () => {
    const fixture = await render(root({ description: 'Old' }));
    await edit(fixture);
    change(fixture, '[data-project-rename-input]', 'My draft');
    fixture.componentRef.setInput('project', root({ name: 'Remote', description: 'New', targetDate: '2026-10-20' }));
    await settle(fixture);
    expect((query(fixture, '[data-project-rename-input]') as HTMLInputElement).value).toBe('My draft');
    expect((query(fixture, '[data-project-description-input]') as HTMLInputElement).value).toBe('New');
    expect((query(fixture, '[data-project-target-date-input]') as HTMLInputElement).value).toBe('2026-10-20');
  });

  it('asks to discard on a backdrop click and blocks dismissal while saving', async () => {
    const fixture = await render();
    let finish!: (value: boolean) => void;
    fixture.componentRef.setInput('saveDetails', () => new Promise<boolean>((resolve) => { finish = resolve; }));
    await edit(fixture);
    change(fixture, '[data-project-rename-input]', 'Refit');
    const dialog = query(fixture, '[data-project-details-dialog]');
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: -1, clientY: -1 }));
    await settle(fixture);
    expect(query(fixture, '[data-project-discard-confirm]')).toBeTruthy();
    query(fixture, '[data-project-keep-editing]').click();
    query(fixture, '[data-project-details-save]').click();
    fixture.detectChanges();
    query(fixture, '[data-project-details-cancel]').click();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(query(fixture, '[data-project-details-dialog]')).toBeTruthy();
    expect(query(fixture, '[data-project-discard-confirm]')).toBeNull();
    finish(true);
    await settle(fixture);
    expect(query(fixture, '[data-project-details-dialog]')).toBeNull();
  });

  it('owns failed-save errors and clears the dismissed dialog error', async () => {
    const fixture = await render();
    const clear = vi.fn();
    fixture.componentRef.setInput('clearWriteError', clear);
    fixture.componentRef.setInput('saveDetails', async () => false);
    await edit(fixture);
    change(fixture, '[data-project-rename-input]', 'Refit');
    fixture.componentRef.setInput('writeError', { sentence: 'Couldn’t save the details of “Home renovation”. Try again.', reason: 'Refused' });
    query(fixture, '[data-project-details-save]').click();
    await settle(fixture);
    expect(query(fixture, '[data-project-write-error]')).toBeNull();
    expect(query(fixture, '[data-project-details-dialog] [role="alert"]').textContent?.trim()).toBe('Couldn’t save the details of “Home renovation”. Try again.');
    expect(query(fixture, '[data-project-details-dialog] details').textContent).toContain('Refused');
    query(fixture, '[data-project-details-cancel]').click();
    await settle(fixture);
    query(fixture, '[data-project-discard]').click();
    expect(clear).toHaveBeenCalled();
  });

  it('confirms archive in a modal, closes on refusal, and restores focus', async () => {
    const fixture = await render();
    const archive = vi.fn().mockResolvedValue(false);
    fixture.componentRef.setInput('confirmArchive', archive);
    await openMore(fixture);
    query(fixture, '[data-project-archive]').click();
    await settle(fixture);
    expect(query(fixture, '[data-project-archive-confirm]').tagName).toBe('DIALOG');
    query(fixture, '[data-project-archive-cancel]').click();
    await settle(fixture);
    expect(archive).not.toHaveBeenCalled();
    await openMore(fixture);
    query(fixture, '[data-project-archive]').click();
    await settle(fixture);
    query(fixture, '[data-project-archive-confirm-yes]').click();
    await settle(fixture);
    expect(archive).toHaveBeenCalledOnce();
    expect(query(fixture, '[data-project-archive-confirm]')).toBeNull();
    expect(document.activeElement).toBe(query(fixture, '[data-project-more]'));
  });
});

describe('ProjectHeader path and phone fold (Slice 81, L7-004, Q10 (a))', () => {
  const cabinets = root({ id: 'project-cabinets', kind: 'subproject', parentProjectId: 'project-kitchen', name: 'Cabinets', description: 'Doors and hinges' });
  const path: BreadcrumbItem[] = [
    { label: 'Home renovation', link: ['/projects', 'project-renovation'] },
    { label: 'Kitchen', link: ['/projects', 'project-kitchen'] },
    { label: 'Cabinets', link: null },
  ];

  it('draws the breadcrumb above the name, and none for an empty path', async () => {
    const fixture = await render(cabinets, path);
    const nav = query(fixture, 'nav[aria-label="Breadcrumb"]');
    expect([...nav.querySelectorAll('a')].map((link) => link.textContent?.trim())).toEqual(['Home renovation', 'Kitchen']);
    expect(nav.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Cabinets');
    expect(nav.compareDocumentPosition(query(fixture, '[data-project-name]')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fixture.componentRef.setInput('breadcrumb', []);
    await settle(fixture);
    expect(query(fixture, 'nav[aria-label="Breadcrumb"]')).toBeNull();
  });

  it('folds the description and the facts behind a Details disclosure, after the name row’s history and More', async () => {
    const fixture = await render(cabinets, path);
    const toggle = query(fixture, '[data-project-details-toggle]') as HTMLButtonElement;
    const region = query(fixture, '[data-project-details]');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.textContent?.trim()).toBe('Details');
    expect(toggle.getAttribute('aria-controls')).toBe(region.id);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(region.querySelector('[data-project-description]')).not.toBeNull();
    expect(region.querySelector('[data-project-status]')).not.toBeNull();
    expect(region.querySelector('[data-project-target-date]')).not.toBeNull();
    // The name row holds the history controls and More; Details comes after them.
    expect(query(fixture, '.project-header__actions').compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.hasAttribute('data-open')).toBe(false);

    toggle.click();
    await settle(fixture);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(region.hasAttribute('data-open')).toBe(true);

    toggle.click();
    await settle(fixture);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(region.hasAttribute('data-open')).toBe(false);
  });
});
