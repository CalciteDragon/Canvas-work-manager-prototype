import { DestroyRef, Injectable, afterEveryRender, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

/** After user navigation, recover lost focus without overriding a connected control's hand-off. */
@Injectable({ providedIn: 'root' })
export class RouteFocus {
  private seenNavigation = false;
  private hadInput = false;
  private waiting = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const router = inject(Router);
    const destroy = inject(DestroyRef);
    const onInput = (event: Event) => this.noteInput(event);
    document.addEventListener('pointerdown', onInput, true);
    document.addEventListener('keydown', onInput, true);
    destroy.onDestroy(() => {
      clearTimeout(this.timer);
      document.removeEventListener('pointerdown', onInput, true);
      document.removeEventListener('keydown', onInput, true);
    });
    router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (!(event instanceof NavigationEnd)) return;
      clearTimeout(this.timer);
      this.waiting = this.seenNavigation && this.hadInput && this.focusLost();
      this.seenNavigation = true;
      this.hadInput = false;
      if (this.waiting) this.timer = setTimeout(() => this.land(true), 2000);
    });
    afterEveryRender(() => this.land(false));
  }

  /** Only trusted browser input makes a later navigation eligible. */
  noteInput(event: Pick<Event, 'isTrusted'>): void { if (event.isTrusted) this.hadInput = true; }

  private focusLost(): boolean { return document.activeElement === null || document.activeElement === document.body; }

  private land(expired: boolean): void {
    if (!this.waiting) return;
    if (!this.focusLost()) { this.waiting = false; clearTimeout(this.timer); return; }
    const main = document.querySelector<HTMLElement>('main');
    const heading = main?.querySelector<HTMLElement>('[data-route-page-focus]') ?? main?.querySelector<HTMLElement>('[data-route-focus]');
    const target = heading ?? (expired ? main : null);
    if (target) { this.waiting = false; clearTimeout(this.timer); target.focus(); }
  }
}
