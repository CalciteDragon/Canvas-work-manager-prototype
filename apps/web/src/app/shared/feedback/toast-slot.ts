import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

/** Reasons a toast owner can use to choose whether to restore lost focus. */
export type ToastCloseReason = 'replaced' | 'navigation' | 'write' | 'dismissed';

/** One feedback slot across independently rendered feature surfaces. */
@Injectable({ providedIn: 'root' })
export class ToastSlot {
  private current: ((reason: ToastCloseReason) => void) | null = null;
  private readonly reasons = new Set<object | string>();
  private readonly suppression = signal(false);
  readonly suppressed = this.suppression.asReadonly();

  constructor() {
    const subscription = inject(Router, { optional: true })?.events.subscribe((event) => {
      if (event instanceof NavigationStart) this.close('navigation');
    });
    inject(DestroyRef).onDestroy(() => { subscription?.unsubscribe(); this.current = null; });
  }

  claim(close: (reason: ToastCloseReason) => void): () => void {
    this.close('replaced');
    this.current = close;
    return () => { if (this.current === close) this.current = null; };
  }

  close(reason: ToastCloseReason = 'dismissed'): void {
    const close = this.current;
    this.current = null;
    close?.(reason);
  }

  suppress(reason: object | string): void {
    this.reasons.add(reason);
    this.suppression.set(true);
  }

  release(reason: object | string): void {
    this.reasons.delete(reason);
    this.suppression.set(this.reasons.size > 0);
  }
}
