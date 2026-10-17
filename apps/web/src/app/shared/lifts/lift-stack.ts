import { Injectable } from '@angular/core';

/** Coordinates transient lifts, including custom creation dialogs, without retaining stale owners. */
@Injectable({ providedIn: 'root' })
export class LiftStack {
  private current: (() => void) | null = null;

  open(close: () => void): () => void {
    const previous = this.current;
    this.current = close;
    previous?.();
    return () => { if (this.current === close) this.current = null; };
  }
}
