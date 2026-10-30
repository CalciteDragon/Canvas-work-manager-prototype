import { Directive, ElementRef, Injector, afterNextRender, effect, inject, input, type EffectRef } from '@angular/core';
import type { Failure } from './failure';
import { PinnedFailures, scrollPortOf, type PinRegistration } from './pinned-failures';

/** Room left between a revealed sentence and the clear edge it was brought to. */
const REVEAL_GAP_PX = 8;

const usable = (control: HTMLElement): boolean =>
  control.isConnected && !control.matches(':disabled, [aria-disabled="true"]') && !control.closest('[inert]');

/**
 * Pins this reference's write failure to its scroll port's edge while the failure's sentence is
 * off screen (Slice 78, §24). Goes on the row or frame that owns the failure:
 *
 * ```html
 * <li [appPinnedFailure]="failure" [pinnedFailureSubject]="task.title" [pinnedFailureSentence]="errorId">
 * ```
 *
 * `appPinnedFailure` is the occurrence: a new object re-arms a dismissed pin, `null` unregisters.
 * `pinnedFailureSentence` is the id of the sentence element inside the reference (the
 * `FailureMessage`'s `sentenceId`), which is what is watched, so a tall visible frame cannot hide
 * an off-screen sentence. The control the failure describes is found by its `aria-describedby`
 * naming that id. Nothing scrolls unless the pinned copy is pressed.
 */
@Directive({ selector: '[appPinnedFailure]' })
export class PinnedFailureDirective {
  readonly appPinnedFailure = input<Failure | null>(null);
  readonly pinnedFailureSubject = input.required<string>();
  readonly pinnedFailureSentence = input.required<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly pins = inject(PinnedFailures);
  private readonly injector = inject(Injector);

  constructor() {
    effect((onCleanup) => {
      const failure = this.appPinnedFailure();
      if (!failure) return;
      const subject = this.pinnedFailureSubject();
      const sentenceId = this.pinnedFailureSentence();
      let registration: PinRegistration | null = null;
      let watching: EffectRef | null = null;
      // The sentence renders in the same pass as the failure: find it once it is in the DOM.
      const rendered = afterNextRender({
        read: () => {
          const port = scrollPortOf(this.host);
          if (!port) return;
          const placed = this.pins.register(port, {
            subject,
            sentence: failure.sentence,
            reveal: () => this.reveal(port, sentenceId, placed),
          });
          registration = placed;
          watching = this.observe(port, this.sentence(sentenceId) ?? this.host, placed);
        },
      }, { injector: this.injector });
      onCleanup(() => {
        rendered.destroy();
        watching?.destroy();
        registration?.unregister();
      });
    });
  }

  /** Watches `anchor` against the port shrunk by its measured clearance, re-observing as that changes. */
  private observe(port: HTMLElement, anchor: HTMLElement, registration: PinRegistration): EffectRef | null {
    if (typeof IntersectionObserver === 'undefined') return null;
    return effect((onCleanup) => {
      const { top, bottom } = this.pins.clearanceOf(port);
      const observer = new IntersectionObserver((entries) => {
        const entry = entries.at(-1);
        // A callback queued before disconnect still arrives: the registration ignores it once gone.
        if (!entry || !this.host.isConnected) return;
        const above = entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0);
        registration.place(entry.isIntersecting ? null : above ? 'top' : 'bottom');
      }, { root: port, rootMargin: `${-top}px 0px ${-bottom}px 0px`, threshold: 0 });
      observer.observe(anchor);
      onCleanup(() => observer.disconnect());
    }, { injector: this.injector });
  }

  private sentence(id: string): HTMLElement | null {
    return [...this.host.querySelectorAll<HTMLElement>('[id]')].find((element) => element.id === id) ?? null;
  }

  /** The pinned copy's press: destination first, then one scroll, then focus without a second one. */
  private reveal(port: HTMLElement, sentenceId: string, registration: PinRegistration | null): void {
    if (!this.host.isConnected) {
      registration?.unregister();
      return;
    }
    const anchor = this.sentence(sentenceId) ?? this.host;
    const control = [...this.host.querySelectorAll<HTMLElement>('[aria-describedby]')]
      .find((candidate) => candidate.getAttribute('aria-describedby')!.split(/\s+/).includes(sentenceId));
    let target = control && usable(control) ? control : anchor;
    if (target === anchor && !anchor.hasAttribute('tabindex')) anchor.setAttribute('tabindex', '-1');

    const { top: coveredTop, bottom: coveredBottom } = this.pins.clearanceOf(port);
    const portTop = port.getBoundingClientRect().top + port.clientTop;
    const clearTop = portTop + coveredTop + REVEAL_GAP_PX;
    const clearBottom = portTop + port.clientHeight - coveredBottom - REVEAL_GAP_PX;
    const box = anchor.getBoundingClientRect();
    // A sentence taller than the clear port is aligned to its top.
    const delta = box.top < clearTop ? box.top - clearTop : box.bottom > clearBottom ? Math.min(box.bottom - clearBottom, box.top - clearTop) : 0;
    if (delta !== 0) port.scrollTop += delta;
    target.focus({ preventScroll: true });
  }
}
