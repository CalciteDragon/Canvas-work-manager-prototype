import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast, TOAST_DISMISS_MS } from './toast';

const nativeMethods = ['showPopover', 'hidePopover'] as const;
const nativeDescriptors = nativeMethods.map(name => Object.getOwnPropertyDescriptor(HTMLElement.prototype, name));

describe('Toast', () => {
  beforeEach(() => {
    nativeMethods.forEach(name => Object.defineProperty(HTMLElement.prototype, name, { configurable: true, writable: true, value: vi.fn() }));
  });
  afterEach(() => {
    vi.useRealTimers();
    nativeMethods.forEach((name, index) => {
      const descriptor = nativeDescriptors[index];
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    });
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

  it('renders a failure detail as a closed Details in the toast, never in its announcement', () => {
    const { fixture, element, popover } = setup();
    expect(popover.querySelector('details')).toBeNull();
    fixture.componentRef.setInput('tone', 'alert');
    fixture.componentRef.setInput('message', 'Couldn’t remove the section. Try again.');
    fixture.componentRef.setInput('detail', 'Section "section-notes" is locked.');
    fixture.detectChanges();
    const details = popover.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent?.trim()).toBe('Details');
    expect(details.textContent).toContain('Section "section-notes" is locked.');
    expect(element.querySelector('[role=alert]')!.textContent).not.toContain('locked');
    fixture.componentRef.setInput('tone', 'status');
    fixture.detectChanges();
    expect(element.querySelector('[role=status]')!.textContent).toContain('Couldn’t remove');
    expect(element.querySelector('[role=status]')!.textContent).not.toContain('locked');
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
