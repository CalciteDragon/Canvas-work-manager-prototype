import { Injectable, signal } from '@angular/core';
import type { SectionId } from '@cwm/contracts';

/** Coordinates task selection across the shell's independently owned Task Lists. */
@Injectable()
export class TaskDrawerCoordinator {
  private readonly openState = signal(false);
  private current: { owner: SectionId; close: () => void } | null = null;
  readonly open = this.openState.asReadonly();

  /** Claim the drawer for one section and return a release for that claim. */
  select(owner: SectionId, close: () => void): () => void {
    const previous = this.current;
    const claim = { owner, close };
    this.current = claim;
    this.openState.set(true);
    if (previous?.owner !== owner) previous?.close();
    return () => {
      if (this.current !== claim) return;
      this.current = null;
      this.openState.set(false);
    };
  }
}
