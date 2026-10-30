import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PinnedFailureSlot } from './pinned-failure-slot';
import { PinnedFailures } from './pinned-failures';

const rect = (top: number, height: number): DOMRect => ({ top, bottom: top + height, height, left: 200, right: 1000, width: 800, x: 200, y: top, toJSON: () => ({}) });

@Component({
  imports: [PinnedFailureSlot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" data-elsewhere>Elsewhere</button>
    <main data-port tabindex="-1" style="overflow: auto">
      <div data-pin-clearance data-sticky>Add a task</div>
      <app-pinned-failure-slot />
    </main>`,
})
class Host {}

describe('PinnedFailureSlot', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const port = element.querySelector<HTMLElement>('[data-port]')!;
    const pins = TestBed.inject(PinnedFailures);
    const add = (subject: string, edge: 'top' | 'bottom', reveal = vi.fn()) => {
      const registration = pins.register(port, { subject, sentence: `Couldn’t complete “${subject}”. Try again.`, reveal });
      registration.place(edge);
      return registration;
    };
    const settle = () => fixture.whenStable();
    const pin = (edge: 'top' | 'bottom') => element.querySelector<HTMLButtonElement>(`[data-failure-pin="${edge}"]`);
    return { fixture, element, port, pins, add, settle, pin };
  }

  it('draws nothing while nothing is pinned', async () => {
    const { element } = await setup();
    expect(element.querySelector('[data-failure-pin]')).toBeNull();
    expect(element.querySelector('app-pinned-failure-slot')!.children).toHaveLength(0);
  });

  it('draws a bottom copy with ↓ as a button named "Show “X”:" and the sentence, not an alert and without Details', async () => {
    const { element, add, settle, pin } = await setup();
    add('Order tiles', 'bottom');
    await settle();
    const button = pin('bottom')!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent!.replace(/\s+/g, ' ').trim()).toBe('↓ Couldn’t complete “Order tiles”.');
    expect(button.getAttribute('aria-label')).toBe('Show “Order tiles”: Couldn’t complete “Order tiles”.');
    expect(element.querySelector('app-pinned-failure-slot [role=alert], app-pinned-failure-slot [role=status], app-pinned-failure-slot details')).toBeNull();
    expect(pin('top')).toBeNull();
  });

  it('draws a top copy with ↑, and "and 1 more" for two off one edge', async () => {
    const { add, settle, pin } = await setup();
    add('First', 'top');
    add('Second', 'top');
    await settle();
    const text = pin('top')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(text).toBe('↑ Couldn’t complete “Second”. and 1 more');
    expect(pin('top')!.getAttribute('aria-label')).toBe('Show “Second”: Couldn’t complete “Second”. And 1 more.');
  });

  it('pressing reveals the most recent failure', async () => {
    const { add, settle, pin } = await setup();
    const first = vi.fn(), second = vi.fn();
    add('First', 'bottom', first);
    add('Second', 'bottom', second);
    await settle();
    pin('bottom')!.click();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('close dismisses that occurrence without scrolling, and focus goes to the other pin', async () => {
    const { element, port, add, settle, pin } = await setup();
    const reveal = vi.fn();
    add('Above', 'top');
    add('Below', 'bottom', reveal);
    await settle();
    port.scrollTop = 120;
    const close = element.querySelector<HTMLButtonElement>('[data-failure-pin-dismiss="bottom"]')!;
    expect(close.getAttribute('aria-label')).toBe('Dismiss “Below”');
    close.focus();
    close.click();
    await settle();
    expect(pin('bottom')).toBeNull();
    expect(reveal).not.toHaveBeenCalled();
    expect(port.scrollTop).toBe(120);
    expect(document.activeElement).toBe(pin('top'));
  });

  it('a focused pin that goes quietly hands focus to the scroll port without scrolling it', async () => {
    const { port, add, settle, pin } = await setup();
    const registration = add('Below', 'bottom');
    await settle();
    pin('bottom')!.focus();
    const focus = vi.spyOn(port, 'focus');
    registration.place(null);
    await settle();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(port);
  });

  it('leaves focus that already moved elsewhere', async () => {
    const { element, add, settle, pin } = await setup();
    const registration = add('Below', 'bottom');
    await settle();
    pin('bottom')!.focus();
    const elsewhere = element.querySelector<HTMLElement>('[data-elsewhere]')!;
    elsewhere.focus();
    registration.unregister();
    await settle();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('ignores failures pinned in another scroll port', async () => {
    const { pins, settle, pin } = await setup();
    pins.register(document.createElement('div'), { subject: 'Elsewhere', sentence: 'Couldn’t.', reveal: vi.fn() }).place('top');
    await settle();
    expect(pin('top')).toBeNull();
  });

  it('measures a stuck control and an open toast as the edges’ clearance, again on scroll', async () => {
    const { element, port, pins, add, settle, pin } = await setup();
    const sticky = element.querySelector<HTMLElement>('[data-sticky]')!;
    const toast = document.createElement('section');
    toast.setAttribute('data-toast-open', '');
    document.body.append(toast);
    vi.spyOn(port, 'getBoundingClientRect').mockReturnValue(rect(56, 600));
    Object.defineProperty(port, 'clientHeight', { configurable: true, value: 600 });
    vi.spyOn(toast, 'getBoundingClientRect').mockReturnValue(rect(500, 140));
    const stickyAt = vi.spyOn(sticky, 'getBoundingClientRect').mockReturnValue(rect(300, 48));
    add('Below', 'bottom');
    await settle();
    // At rest the quick-add sits inside the list, below the edge: it covers nothing.
    expect(pins.clearanceOf(port)).toEqual({ top: 0, bottom: 156 });
    stickyAt.mockReturnValue(rect(56, 48));
    port.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await settle();
    expect(pins.clearanceOf(port)).toEqual({ top: 48, bottom: 156 });
    const region = pin('bottom')!.closest<HTMLElement>('[data-failure-pin-region]')!;
    expect(region.style.getPropertyValue('--pin-block-end')).toBe(`${window.innerHeight - (656 - 156)}px`);
    toast.remove();
  });
});
