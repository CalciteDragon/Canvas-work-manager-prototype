import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Failure } from './failure';
import { PinnedFailureDirective } from './pinned-failure.directive';
import { PinnedFailures } from './pinned-failures';

/** A hand-driven IntersectionObserver: jsdom has none, and these tests choose every crossing. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) {
    FakeObserver.instances.push(this);
  }
  observe(target: Element): void { this.observed.push(target); }
  unobserve(): void { /* unused */ }
  disconnect(): void { this.disconnected = true; }
  takeRecords(): IntersectionObserverEntry[] { return []; }
  /** Reports the target wholly above (`top`), wholly below (`bottom`) or partly inside (`in`) a 0–400 port. */
  report(where: 'top' | 'bottom' | 'in'): void {
    const rect = where === 'top' ? { top: -60, bottom: -40 } : where === 'bottom' ? { top: 440, bottom: 460 } : { top: 390, bottom: 410 };
    this.callback([{ isIntersecting: where === 'in', boundingClientRect: rect, rootBounds: { top: 0, bottom: 400 } } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
const latest = (): FakeObserver => FakeObserver.instances.at(-1)!;

const rect = (top: number, height: number): DOMRect => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) });

@Component({
  imports: [PinnedFailureDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div data-port style="overflow: auto">
      @if (shown()) {
        <div data-row [appPinnedFailure]="failure()" [pinnedFailureSubject]="subject()" pinnedFailureSentence="row-error">
          <button type="button" data-control [disabled]="disabled()" [attr.aria-describedby]="failure() ? 'row-error' : null">Complete</button>
          @if (failure(); as failure) { <p id="row-error" role="alert">{{ failure.sentence }}</p> }
        </div>
      }
    </div>`,
})
class Host {
  readonly failure = signal<Failure | null>(null);
  readonly shown = signal(true);
  readonly disabled = signal(false);
  readonly subject = signal('Order tiles');
}

const FAILED: Failure = { sentence: 'Couldn’t complete “Order tiles”. Try again.', reason: 'Audit' };

describe('PinnedFailureDirective', () => {
  const original = globalThis.IntersectionObserver;
  beforeEach(() => {
    FakeObserver.instances = [];
    globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
  });
  afterEach(() => { globalThis.IntersectionObserver = original; });

  async function setup() {
    const fixture = TestBed.createComponent(Host);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const port = element.querySelector<HTMLElement>('[data-port]')!;
    const pins = TestBed.inject(PinnedFailures);
    const fail = async (failure: Failure | null = FAILED) => { fixture.componentInstance.failure.set(failure); await fixture.whenStable(); };
    return { fixture, element, port, pins, fail, shown: () => pins.pinsFor(port) };
  }

  it('registers nothing and observes nothing without a failure', async () => {
    const { shown } = await setup();
    expect(FakeObserver.instances).toHaveLength(0);
    expect(shown()).toEqual({ top: null, bottom: null });
  });

  it('observes the sentence anchor in its nearest scrolling ancestor, not the whole reference', async () => {
    const { element, port, fail } = await setup();
    await fail();
    expect(latest().observed).toEqual([element.querySelector('#row-error')]);
    expect(latest().options.root).toBe(port);
    expect(latest().options.threshold).toBe(0);
  });

  it('pins below (above) while the sentence is wholly below (above), and unpins once any part enters', async () => {
    const { fail, shown } = await setup();
    await fail();
    latest().report('bottom');
    expect(shown().bottom).toMatchObject({ subject: 'Order tiles', sentence: 'Couldn’t complete “Order tiles”.' });
    latest().report('in');
    expect(shown().bottom).toBeNull();
    latest().report('top');
    expect(shown().top).toMatchObject({ subject: 'Order tiles' });
  });

  it('shrinks the observed port by the measured clearance, re-observing when it changes', async () => {
    const { port, pins, fail } = await setup();
    await fail();
    const first = latest();
    expect(first.options.rootMargin).toBe('0px 0px 0px 0px');
    pins.setClearance(port, { top: 48, bottom: 120 });
    TestBed.tick();
    expect(first.disconnected).toBe(true);
    expect(latest().options.rootMargin).toBe('-48px 0px -120px 0px');
  });

  it('moves to the other edge when a scroll jumps the sentence past the port without crossing it', async () => {
    const { element, port, fail, shown } = await setup();
    await fail();
    const sentence = element.querySelector<HTMLElement>('#row-error')!;
    vi.spyOn(port, 'getBoundingClientRect').mockReturnValue(rect(0, 400));
    Object.defineProperty(port, 'clientHeight', { configurable: true, value: 400 });
    const at = vi.spyOn(sentence, 'getBoundingClientRect').mockReturnValue(rect(-60, 20));
    latest().report('top');
    at.mockReturnValue(rect(900, 20));
    port.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(shown().top).toBeNull();
    expect(shown().bottom).toMatchObject({ subject: 'Order tiles' });
  });

  it('keeps a dismissal and its place when only the subject changes', async () => {
    const { fixture, pins, fail, shown } = await setup();
    await fail();
    latest().report('bottom');
    pins.dismiss(shown().bottom!.id);
    const observers = FakeObserver.instances.length;
    fixture.componentInstance.subject.set('Order floor tiles');
    await fixture.whenStable();
    expect(FakeObserver.instances).toHaveLength(observers);
    latest().report('in');
    latest().report('bottom');
    expect(shown().bottom).toBeNull();
  });

  it('goes when the failure clears, and a late callback cannot re-pin it', async () => {
    const { fail, shown } = await setup();
    await fail();
    const observer = latest();
    observer.report('bottom');
    await fail(null);
    expect(observer.disconnected).toBe(true);
    expect(shown().bottom).toBeNull();
    observer.report('bottom');
    expect(shown().bottom).toBeNull();
  });

  it('a replacement failure re-arms a dismissed occurrence', async () => {
    const { pins, fail, shown } = await setup();
    await fail();
    latest().report('bottom');
    pins.dismiss(shown().bottom!.id);
    latest().report('in');
    latest().report('bottom');
    expect(shown().bottom).toBeNull();
    await fail({ ...FAILED });
    latest().report('bottom');
    expect(shown().bottom).not.toBeNull();
  });

  it('unregisters and disconnects when its reference is destroyed', async () => {
    const { fixture, fail, shown } = await setup();
    await fail();
    const observer = latest();
    observer.report('top');
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();
    expect(observer.disconnected).toBe(true);
    expect(shown().top).toBeNull();
    observer.report('top');
    expect(shown().top).toBeNull();
  });

  describe('reveal', () => {
    function geometry(port: HTMLElement, sentence: HTMLElement, sentenceTop: number) {
      vi.spyOn(port, 'getBoundingClientRect').mockReturnValue(rect(0, 400));
      Object.defineProperty(port, 'clientHeight', { configurable: true, value: 400 });
      vi.spyOn(sentence, 'getBoundingClientRect').mockImplementation(() => rect(sentenceTop - port.scrollTop, 20));
    }

    it('scrolls the sentence into the unobscured port and focuses the control it describes, without a second scroll', async () => {
      const { element, port, pins, fail, shown } = await setup();
      await fail();
      const sentence = element.querySelector<HTMLElement>('#row-error')!;
      const control = element.querySelector<HTMLElement>('[data-control]')!;
      geometry(port, sentence, 900);
      pins.setClearance(port, { top: 0, bottom: 120 });
      TestBed.tick();
      latest().report('bottom');
      const focus = vi.spyOn(control, 'focus');
      // The scroll unpins synchronously: the destination was captured before it.
      let scrolled = 0;
      Object.defineProperty(port, 'scrollTop', { configurable: true, get: () => scrolled, set: (value: number) => { scrolled = value; latest().report('in'); } });
      pins.reveal(shown().bottom!.id);
      const top = sentence.getBoundingClientRect().top;
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top + 20).toBeLessThanOrEqual(400 - 120);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(document.activeElement).toBe(control);
    });

    it('scrolls a sentence above the port down below the stuck control', async () => {
      const { element, port, pins, fail, shown } = await setup();
      await fail();
      const sentence = element.querySelector<HTMLElement>('#row-error')!;
      port.scrollTop = 500;
      geometry(port, sentence, 100);
      pins.setClearance(port, { top: 60, bottom: 0 });
      TestBed.tick();
      latest().report('top');
      pins.reveal(shown().top!.id);
      expect(sentence.getBoundingClientRect().top).toBeGreaterThanOrEqual(60);
    });

    it('brings the focused control clear of the stuck control too, when it sits above the sentence and both fit', async () => {
      const { element, port, pins, fail, shown } = await setup();
      await fail();
      const sentence = element.querySelector<HTMLElement>('#row-error')!;
      const control = element.querySelector<HTMLElement>('[data-control]')!;
      port.scrollTop = 500;
      geometry(port, sentence, 140);
      // The checkbox heads the row, 60 px above its sentence.
      vi.spyOn(control, 'getBoundingClientRect').mockImplementation(() => rect(80 - port.scrollTop, 20));
      pins.setClearance(port, { top: 60, bottom: 0 });
      TestBed.tick();
      latest().report('top');
      pins.reveal(shown().top!.id);
      expect(control.getBoundingClientRect().top).toBeGreaterThanOrEqual(60);
      expect(sentence.getBoundingClientRect().bottom).toBeLessThanOrEqual(400);
      expect(document.activeElement).toBe(control);
    });

    it('keeps the sentence in view when the control and sentence together are taller than the clear port', async () => {
      const { element, port, pins, fail, shown } = await setup();
      await fail();
      const sentence = element.querySelector<HTMLElement>('#row-error')!;
      const control = element.querySelector<HTMLElement>('[data-control]')!;
      port.scrollTop = 1000;
      geometry(port, sentence, 700);
      vi.spyOn(control, 'getBoundingClientRect').mockImplementation(() => rect(100 - port.scrollTop, 20));
      pins.setClearance(port, { top: 60, bottom: 0 });
      TestBed.tick();
      latest().report('top');
      pins.reveal(shown().top!.id);
      const top = sentence.getBoundingClientRect().top;
      expect(top).toBeGreaterThanOrEqual(60);
      expect(top + 20).toBeLessThanOrEqual(400);
    });

    it('focuses the sentence when the control is disabled', async () => {
      const { fixture, element, port, pins, fail, shown } = await setup();
      await fail();
      fixture.componentInstance.disabled.set(true);
      await fixture.whenStable();
      const sentence = element.querySelector<HTMLElement>('#row-error')!;
      geometry(port, sentence, 900);
      latest().report('bottom');
      pins.reveal(shown().bottom!.id);
      expect(document.activeElement).toBe(sentence);
      expect(sentence.getAttribute('tabindex')).toBe('-1');
    });

    it('focuses the sentence when no control describes itself by it', async () => {
      const { element, port, pins, fail, shown } = await setup();
      await fail();
      element.querySelector('[data-control]')!.removeAttribute('aria-describedby');
      const sentence = element.querySelector<HTMLElement>('#row-error')!;
      geometry(port, sentence, 900);
      latest().report('bottom');
      pins.reveal(shown().bottom!.id);
      expect(document.activeElement).toBe(sentence);
    });

    it('focuses the reference when its sentence has gone', async () => {
      const { element, port, pins, fail, shown } = await setup();
      await fail();
      const row = element.querySelector<HTMLElement>('[data-row]')!;
      element.querySelector('[data-control]')!.removeAttribute('aria-describedby');
      vi.spyOn(port, 'getBoundingClientRect').mockReturnValue(rect(0, 400));
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(900, 40));
      latest().report('bottom');
      element.querySelector('#row-error')!.remove();
      pins.reveal(shown().bottom!.id);
      expect(document.activeElement).toBe(row);
      expect(row.getAttribute('tabindex')).toBe('-1');
    });

    it('unregisters a reference that has left the document instead of scrolling', async () => {
      const { element, port, pins, fail, shown } = await setup();
      await fail();
      latest().report('bottom');
      const id = shown().bottom!.id;
      const row = element.querySelector<HTMLElement>('[data-row]')!;
      const parent = row.parentElement!;
      row.remove();
      port.scrollTop = 0;
      pins.reveal(id);
      expect(port.scrollTop).toBe(0);
      expect(shown().bottom).toBeNull();
      parent.append(row);
    });
  });
});
