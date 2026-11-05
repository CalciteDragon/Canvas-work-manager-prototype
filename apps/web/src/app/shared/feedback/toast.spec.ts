import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast, TOAST_DISMISS_MS } from './toast';

const nativeMethods = ['showPopover', 'hidePopover'] as const;
const nativeDescriptors = nativeMethods.map(name => Object.getOwnPropertyDescriptor(HTMLElement.prototype, name));
const dialogMethods = ['showModal', 'close'] as const;
const dialogDescriptors = dialogMethods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));

describe('Toast', () => {
  beforeEach(() => {
    nativeMethods.forEach(name => Object.defineProperty(HTMLElement.prototype, name, { configurable: true, writable: true, value: vi.fn() }));
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, writable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
  });
  afterEach(() => {
    vi.useRealTimers();
    nativeMethods.forEach((name, index) => {
      const descriptor = nativeDescriptors[index];
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    });
    dialogMethods.forEach((name, index) => {
      const descriptor = dialogDescriptors[index];
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    });
    document.body.innerHTML = '';
  });

  function setup() {
    const fixture = TestBed.createComponent(Toast);
    fixture.componentRef.setInput('message', 'Removed the Notes section.');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const popover = element.querySelector<HTMLElement>('[popover]')!;
    const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);
    return { fixture, element, popover, dismissed };
  }

  it('generates no box of its own, so a closed toast never takes a grid or flex gap', () => {
    const { element } = setup();
    expect(getComputedStyle(element).display).toBe('contents');
  });

  it('shows and hides a manual popover and announces in persistent outside regions', () => {
    const { fixture, element, popover } = setup();
    expect(popover.showPopover).toHaveBeenCalledOnce();
    const status = element.querySelector('[role=status]')!;
    const alert = element.querySelector('[role=alert]')!;
    expect(popover.contains(status)).toBe(false);
    expect(status.textContent).toContain('Removed');
    fixture.componentRef.setInput('tone', 'alert');
    fixture.detectChanges();
    expect(status.textContent).toBe('');
    expect(alert.textContent).toContain('Removed');
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(popover.hidePopover).toHaveBeenCalled();
    expect(alert.textContent).toBe('');
    expect(status.isConnected).toBe(true);
  });

  // Slice 79 Q9 (user decision): a toast says one short message; the longer reason opens from View details.
  function withDetails(fixture: ReturnType<typeof setup>['fixture']) {
    fixture.componentRef.setInput('tone', 'alert');
    fixture.componentRef.setInput('message', 'Couldn’t undo.');
    fixture.componentRef.setInput('reason', '“Reactivated “Legacy attic”” can’t be undone: something it changed has changed since.');
    fixture.componentRef.setInput('lines', ['Legacy shelving [project-legacy-child]: Restore or move the new dependent, then try Undo again.']);
    fixture.componentRef.setInput('detail', 'Project "project-legacy-child" is active.');
    fixture.detectChanges();
  }
  const viewDetails = (popover: HTMLElement) => popover.querySelector<HTMLButtonElement>('[data-toast-details-open]');

  it('offers no View details for a short message alone', () => {
    const { popover } = setup();
    expect(viewDetails(popover)).toBeNull();
    expect(popover.querySelector('dialog, details')).toBeNull();
  });

  it('shows only the short message, its actions, View details and Dismiss; the announcement keeps the full text', () => {
    const { fixture, element, popover } = setup();
    withDetails(fixture);
    expect(popover.querySelector('.toast__message')?.textContent?.trim()).toBe('Couldn’t undo.');
    expect(popover.textContent).not.toContain('Legacy shelving');
    expect(popover.textContent).not.toContain('something it changed');
    expect(popover.querySelector('details, ul')).toBeNull();
    const buttons = [...popover.querySelectorAll('button')].map(button => button.textContent?.trim());
    expect(buttons).toEqual(['View details', 'Dismiss']);
    expect(viewDetails(popover)?.getAttribute('aria-haspopup')).toBe('dialog');
    const announced = element.querySelector('[role=alert]')!.textContent!;
    expect(announced).toContain('Couldn’t undo.');
    expect(announced).toContain('something it changed has changed since');
    expect(announced).toContain('Legacy shelving');
    // Slice 78: a raw reason is never announced.
    expect(announced).not.toContain('is active');
  });

  it('View details opens a modal view of the full reason with focus on Close, and Close returns focus', () => {
    const { fixture, element, popover, dismissed } = setup();
    document.body.append(element);
    withDetails(fixture);
    const open = viewDetails(popover)!;
    open.focus();
    open.click();
    fixture.detectChanges();
    const dialog = element.querySelector<HTMLDialogElement>('dialog[data-toast-details]')!;
    expect(popover.contains(dialog)).toBe(false);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.classList).toContain('lift--dialog');
    const heading = dialog.querySelector('h2')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(heading.textContent?.trim()).toBe('Couldn’t undo.');
    expect(dialog.textContent).toContain('something it changed has changed since');
    expect(dialog.querySelector('li')?.textContent).toContain('Legacy shelving [project-legacy-child]');
    expect(dialog.textContent).toContain('Project "project-legacy-child" is active.');
    const close = dialog.querySelector<HTMLButtonElement>('[data-toast-details-close]')!;
    expect(document.activeElement).toBe(close);
    close.click();
    fixture.detectChanges();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(open);
    expect(dismissed).not.toHaveBeenCalled();
  });

  it('Escape closes the view only: the toast stays and document handlers never see it', () => {
    const { fixture, element, popover, dismissed } = setup();
    document.body.append(element);
    withDetails(fixture);
    viewDetails(popover)!.click();
    fixture.detectChanges();
    const dialog = element.querySelector<HTMLDialogElement>('dialog[data-toast-details]')!;
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    dialog.querySelector('button')!.dispatchEvent(event);
    fixture.detectChanges();
    document.removeEventListener('keydown', outside);
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(outside).not.toHaveBeenCalled();
    expect(dismissed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(viewDetails(popover));
  });

  it('holds a status toast while its view is open, and closing the toast closes the view', () => {
    vi.useFakeTimers();
    const { fixture, element, popover, dismissed } = setup();
    withDetails(fixture);
    fixture.componentRef.setInput('tone', 'status');
    fixture.detectChanges();
    viewDetails(popover)!.click();
    fixture.detectChanges();
    vi.advanceTimersByTime(TOAST_DISMISS_MS * 2);
    expect(dismissed).not.toHaveBeenCalled();
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(element.querySelector('dialog[data-toast-details]')?.hasAttribute('open') ?? false).toBe(false);
  });

  it('dismisses Escape inside and stops it reaching document handlers', () => {
    const { popover, dismissed } = setup();
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    popover.dispatchEvent(event);
    expect(dismissed).toHaveBeenCalledOnce();
    expect(outside).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    document.removeEventListener('keydown', outside);
  });

  it('dismisses status after eight seconds and restarts after a message morph', () => {
    vi.useFakeTimers();
    const { fixture, dismissed } = setup();
    vi.advanceTimersByTime(TOAST_DISMISS_MS - 1);
    expect(dismissed).not.toHaveBeenCalled();
    fixture.componentRef.setInput('message', 'Undone: Removed the Notes section.');
    fixture.detectChanges();
    vi.advanceTimersByTime(TOAST_DISMISS_MS - 1);
    expect(dismissed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dismissed).toHaveBeenCalledOnce();
  });

  it.each(['hover', 'focus', 'suppression', 'pending Undo', 'alert'])('pauses for %s, restarting eight seconds when released', (pause) => {
    vi.useFakeTimers();
    const { fixture, popover, dismissed } = setup();
    const change = (paused: boolean) => {
      if (pause === 'hover') popover.dispatchEvent(new MouseEvent(paused ? 'mouseenter' : 'mouseleave'));
      if (pause === 'focus') popover.dispatchEvent(new FocusEvent(paused ? 'focusin' : 'focusout', { bubbles: true }));
      if (pause === 'suppression') fixture.componentRef.setInput('suppressed', paused);
      if (pause === 'pending Undo') fixture.componentRef.setInput('pendingUndo', paused);
      if (pause === 'alert') fixture.componentRef.setInput('tone', paused ? 'alert' : 'status');
      fixture.detectChanges();
    };
    vi.advanceTimersByTime(4000);
    change(true);
    vi.advanceTimersByTime(TOAST_DISMISS_MS * 2);
    expect(dismissed).not.toHaveBeenCalled();
    change(false);
    vi.advanceTimersByTime(TOAST_DISMISS_MS - 1);
    expect(dismissed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dismissed).toHaveBeenCalledOnce();
  });
});
