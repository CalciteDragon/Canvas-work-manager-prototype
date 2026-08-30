import type { LiveEvent } from '@cwm/contracts';
import type { LiveEventListener, LiveUpdates } from '../live-updates';

/**
 * The live stream every store spec runs against. Its existence is what keeps §8's boundary
 * structural: no spec has a reason to reach for `PrototypeLiveUpdates`, so none of them do,
 * and nothing outside `app.config.ts` names the concrete adapter.
 */
export class FakeLiveUpdates implements LiveUpdates {
  private readonly listeners = new Set<LiveEventListener>();

  /** How many listeners are attached — the teardown assertion a store spec needs. */
  get listenerCount(): number {
    return this.listeners.size;
  }

  subscribe(listener: LiveEventListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  emit(event: LiveEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
