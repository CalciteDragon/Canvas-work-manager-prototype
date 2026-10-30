import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, effect, inject, signal, untracked,
} from '@angular/core';
import { Icon } from '../components/icon/icon';
import { PinnedFailures, scrollPortOf, type PinEdge, type ShownPin } from './pinned-failures';

/** The marker a control carries to be measured as covering its scroll port's top edge while stuck there. */
export const PIN_CLEARANCE_ATTRIBUTE = 'data-pin-clearance';

const NOTHING_PINNED = { top: null, bottom: null } as const;

/**
 * Draws the pinned copies of off-screen write failures at its scroll port's edges (Slice 78,
 * §24). Rendered once inside the port (the shell's `.workspace`), it shows what `PinnedFailures`
 * holds for that port: one copy per edge, the most recent, with "and N more". It measures what
 * covers each edge — a stuck `[data-pin-clearance]` control at the top, an open toast at the
 * bottom — so the copies sit clear of both and the directives watch the clear port. Pressing a
 * copy is the only thing that scrolls; closing one never does, and a focused copy that goes hands
 * focus to the other copy or to the port, without scrolling.
 */
@Component({
  selector: 'app-pinned-failure-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './pinned-failure-slot.html',
  styleUrl: './pinned-failure-slot.scss',
})
export class PinnedFailureSlot {
  private readonly pins = inject(PinnedFailures);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly port = signal<HTMLElement | null>(null);
  protected readonly edges: readonly PinEdge[] = ['top', 'bottom'];
  protected readonly shown = computed(() => {
    const port = this.port();
    return port ? this.pins.pinsFor(port) : NOTHING_PINNED;
  });
  /** Where the clear port is, in viewport pixels, as custom properties the stylesheet places by. */
  protected readonly frame = signal<Record<string, string>>({});
  private focusedEdge: PinEdge | null = null;
  private frameRequest = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const port = scrollPortOf(this.host);
      if (!port) return;
      this.port.set(port);
      const remeasure = (): void => {
        cancelAnimationFrame(this.frameRequest);
        this.frameRequest = requestAnimationFrame(() => this.measure(port));
      };
      port.addEventListener('scroll', remeasure, { passive: true });
      window.addEventListener('resize', remeasure);
      const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
      resized?.observe(port);
      // The toast opens and closes by this attribute; its geometry is the bottom edge's clearance.
      const toast = new MutationObserver(remeasure);
      toast.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-toast-open'] });
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(this.frameRequest);
        port.removeEventListener('scroll', remeasure);
        window.removeEventListener('resize', remeasure);
        resized?.disconnect();
        toast.disconnect();
      });
    });

    // A pin appearing or going is a geometry change of its own.
    effect(() => {
      const port = this.port();
      this.shown();
      if (port) untracked(() => this.measure(port));
    });

    afterRenderEffect(() => {
      const shown = this.shown();
      const edge = this.focusedEdge;
      if (edge === null || shown[edge]) return;
      this.focusedEdge = null;
      const active = document.activeElement;
      // Focus already moved elsewhere (a reveal, the user) is left where it is.
      if (active && active !== document.body && active.isConnected) return;
      const other = this.host.querySelector<HTMLElement>('[data-failure-pin]');
      (other ?? this.port())?.focus({ preventScroll: true });
    });
  }

  protected label(pin: ShownPin): string {
    return `Show “${pin.subject}”: ${pin.sentence}${pin.more ? ` And ${pin.more} more.` : ''}`;
  }

  protected reveal(pin: ShownPin): void {
    this.pins.reveal(pin.id);
  }

  protected dismiss(pin: ShownPin): void {
    this.pins.dismiss(pin.id);
  }

  protected focusIn(edge: PinEdge): void {
    this.focusedEdge = edge;
  }

  /** Focus leaving for a known target lets go; focus lost to nothing (a removal) is recovered after render. */
  protected focusOut(event: FocusEvent, region: HTMLElement): void {
    if (event.relatedTarget instanceof Node && !region.contains(event.relatedTarget)) this.focusedEdge = null;
  }

  private measure(port: HTMLElement): void {
    const box = port.getBoundingClientRect();
    const portTop = box.top + port.clientTop;
    const portBottom = portTop + port.clientHeight;
    let top = 0;
    for (const control of port.querySelectorAll(`[${PIN_CLEARANCE_ATTRIBUTE}]`)) {
      const covered = control.getBoundingClientRect();
      // Stuck: its top is at the edge. At rest it sits lower, inside its list, and covers nothing.
      if (covered.height > 0 && covered.top <= portTop + 1 && covered.bottom > portTop) top = Math.max(top, covered.bottom - portTop);
    }
    let bottom = 0;
    for (const toast of document.querySelectorAll('[data-toast-open]')) {
      const covered = toast.getBoundingClientRect();
      if (covered.height > 0 && covered.top < portBottom && covered.bottom > portTop) bottom = Math.max(bottom, portBottom - covered.top);
    }
    this.pins.setClearance(port, { top, bottom });
    this.frame.set({
      '--pin-block-start': `${portTop + top}px`,
      '--pin-block-end': `${window.innerHeight - (portBottom - bottom)}px`,
      '--pin-inline-start': `${box.left + port.clientLeft}px`,
      '--pin-inline-size': `${port.clientWidth}px`,
    });
  }
}
