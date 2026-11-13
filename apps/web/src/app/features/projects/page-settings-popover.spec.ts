import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ProjectPageSchema, type ProjectPage, type ProjectPageKind } from '@cwm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectPlaceRequest } from '../../core/shell/navigation-context';
import { LiftStack } from '../../shared/lifts/lift-stack';
import { PageSettingsPopover } from './page-settings-popover';

const AT = '2026-08-27T16:00:00.000Z';
const ROOT_ID = 'project-renovation';

const pageOf = (kind: ProjectPageKind, enabled = true): ProjectPage =>
  ProjectPageSchema.parse({ id: `page-renovation-${kind}`, projectId: ROOT_ID, kind, enabled, createdAt: AT, updatedAt: AT });

const ALL = [pageOf('home'), pageOf('todos'), pageOf('archive'), pageOf('reflections')];

/**
 * jsdom has no popover API. `showPopover` and `hidePopover` are stubbed on the prototype so the
 * component's calls, and the `toggle` events a browser sends, can be observed.
 */
const stubPopover = () => {
  const show = vi.fn(function (this: HTMLElement) {
    this.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open', oldState: 'closed' }));
  });
  const hide = vi.fn(function (this: HTMLElement) {
    this.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed', oldState: 'open' }));
  });
  Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: show });
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: hide });
  return { show, hide };
};

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
  Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
  document.body.replaceChildren();
});

const render = async (options: { pages?: ProjectPage[]; source?: 'opener' | null } = {}) => {
  const popover = stubPopover();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const opener = document.body.appendChild(document.createElement('button'));
  opener.textContent = 'Edit project';
  const request: ProjectPlaceRequest = { source: options.source === null ? null : opener, returnFocus: opener };
  const fixture = TestBed.createComponent(PageSettingsPopover);
  document.body.appendChild(fixture.nativeElement);
  fixture.componentRef.setInput('request', request);
  fixture.componentRef.setInput('pages', options.pages ?? ALL);
  const closed = vi.fn();
  fixture.componentInstance.closed.subscribe(closed);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => fixture.nativeElement.querySelector(selector) as T | null;
  const queryAll = (selector: string) => [...fixture.nativeElement.querySelectorAll(selector)] as HTMLElement[];
  return { fixture, opener, popover, closed, query, queryAll, panel: query('[data-project-page-manager]')! };
};

describe('PageSettingsPopover (Slice 81, R2: the column gear’s popover, opened by a handler)', () => {
  it('opens itself under the menu’s button: showPopover with that source, position-anchor auto, focus on the first optional page', async () => {
    const { panel, popover, opener, query } = await render();

    expect(panel.getAttribute('popover')).toBe('auto');
    expect(panel.getAttribute('aria-labelledby')).toBe(query('h2')!.id);
    expect(popover.show).toHaveBeenCalledTimes(1);
    expect(popover.show.mock.calls[0]).toEqual([{ source: opener }]);
    expect(panel.style.getPropertyValue('position-anchor')).toBe('auto');
    expect(panel.classList.contains('page-settings--sheet')).toBe(false);
    expect(document.activeElement).toBe(query('[data-page-toggle-kind="todos"] input'));
  });

  it('opens from the phone drawer with no source, as a sheet placed by its own styles', async () => {
    const { panel, popover } = await render({ source: null });

    expect(popover.show).toHaveBeenCalledTimes(1);
    expect(popover.show.mock.calls[0]).toEqual([]);
    expect(panel.classList.contains('page-settings--sheet')).toBe(true);
  });

  it('closes on Escape, returns focus to the request’s returnFocus and reports closed once', async () => {
    const { panel, opener, closed, popover } = await render();

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(popover.hide).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('reports a light dismiss as closed without moving focus', async () => {
    const { panel, closed } = await render();
    const elsewhere = document.body.appendChild(document.createElement('button'));
    elsewhere.focus();

    panel.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed', oldState: 'open' }));

    expect(closed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('closes when another lift opens, and when a navigation starts (with focus back on the opener)', async () => {
    const first = await render();
    TestBed.inject(LiftStack).open(() => {});
    expect(first.closed).toHaveBeenCalledTimes(1);

    const second = await render();
    // The empty test router refuses the URL, but only after `NavigationStart`.
    await TestBed.inject(Router).navigateByUrl('/elsewhere').catch(() => false);
    expect(second.closed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(second.opener);
  });

  it.each(['missing', 'disabled'])('lists Archive’s control by its label when its record is %s', async (state) => {
    const pages = [pageOf('home'), ...(state === 'missing' ? [] : [pageOf('archive', false)])];
    const { query } = await render({ pages });
    expect(query('[data-page-toggle-kind="archive"] span')?.textContent?.trim()).toBe('Archive');
    expect(query('[data-page-toggle-kind="archive"] input')?.getAttribute('aria-label')).toBe('Show Archive page');
  });

  it('shows Home as fixed and every optional page with its confirmed state', async () => {
    const { query, queryAll } = await render({ pages: [pageOf('home'), pageOf('todos', false), pageOf('archive'), pageOf('reflections', false)] });

    const home = query<HTMLInputElement>('[data-page-toggle-kind="home"] input')!;
    expect(home.checked).toBe(true);
    expect(home.disabled).toBe(true);
    expect(queryAll('[data-page-toggle-kind]')).toHaveLength(4);
    expect(query('[data-page-toggle-kind="work"]')).toBeNull();
    expect(query<HTMLInputElement>('[data-page-toggle-kind="todos"] input')!.checked).toBe(false);
    expect(query<HTMLInputElement>('[data-page-toggle-kind="archive"] input')!.checked).toBe(true);
  });

  it('emits an optional page change without changing the checked state itself', async () => {
    const { fixture, query } = await render({ pages: [pageOf('home')] });
    const emitted: unknown[] = [];
    fixture.componentInstance.pageToggleRequested.subscribe((value) => emitted.push(value));

    const todos = query<HTMLInputElement>('[data-page-toggle-kind="todos"] input')!;
    todos.click();

    expect(emitted).toEqual([{ kind: 'todos', enabled: true }]);
    expect(todos.checked).toBe(false);
  });

  it('keeps pending toggles focusable and refuses repeated writes', async () => {
    const { fixture, query } = await render();
    const emitted = vi.fn();
    fixture.componentInstance.pageToggleRequested.subscribe(emitted);
    fixture.componentRef.setInput('pageWritePending', true);
    fixture.detectChanges();
    const control = query<HTMLInputElement>('[data-page-toggle-kind="todos"] input')!;
    expect(control.disabled).toBe(false);
    expect(control.getAttribute('aria-disabled')).toBe('true');
    control.click();
    expect(emitted).not.toHaveBeenCalled();
    expect(control.checked).toBe(true);
  });

  it('reapplies the confirmed checked state after a failed native toggle', async () => {
    const { fixture, query } = await render({ pages: [pageOf('home'), pageOf('todos')] });
    const todos = query<HTMLInputElement>('[data-page-toggle-kind="todos"] input')!;
    todos.click();
    expect(todos.checked).toBe(true);
    fixture.componentRef.setInput('pageWriteError', { sentence: 'Couldn’t turn on the Todos page. Try again.', reason: 'Could not save page' });
    fixture.detectChanges();
    expect(todos.checked).toBe(true);
  });

  it('reports a pending or failed write, and offers Retry refresh when the write landed', async () => {
    const { fixture, query, queryAll } = await render();
    fixture.componentRef.setInput('pageWritePending', true);
    fixture.detectChanges();
    expect(queryAll('[data-page-toggle-kind]:not([data-page-toggle-kind="home"]) input').every((input) => input.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(query('[data-page-toggle-pending]')?.textContent).toContain('Saving');

    fixture.componentRef.setInput('pageWritePending', false);
    fixture.componentRef.setInput('pageWriteError', { sentence: 'Couldn’t turn on the Todos page. Try again.', reason: 'Could not save page' });
    fixture.detectChanges();
    const sentence = query('[data-page-toggle-error] [data-failure-sentence]')!;
    expect(sentence.getAttribute('role')).toBe('alert');
    expect(sentence.textContent?.trim()).toBe('Couldn’t turn on the Todos page. Try again.');
    expect(query('[data-page-toggle-error] details')?.textContent).toContain('Could not save page');
    expect(query('[data-page-toggle-error] [data-recovery]')).toBeNull();

    const retried = vi.fn();
    fixture.componentInstance.retryPageRequested.subscribe(retried);
    fixture.componentRef.setInput('pageWriteError', { sentence: 'Turned on the Todos page, but navigation couldn’t refresh.', reason: 'pages read failed' });
    fixture.componentRef.setInput('pageWriteRetryKind', 'todos');
    fixture.detectChanges();
    const retry = query('[data-page-toggle-error] [data-recovery="retry-refresh"]')!;
    expect(retry.textContent?.trim()).toBe('Retry refresh');
    retry.click();
    expect(retried).toHaveBeenCalledTimes(1);
  });
});
