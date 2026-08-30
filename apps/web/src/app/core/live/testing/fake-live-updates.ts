import type { LiveEvent } from '@cwm/contracts';
import type { LiveConnectionListener, LiveEventListener, LiveUpdates } from '../live-updates';

interface Subscription {
  connected?: LiveConnectionListener;
  listener: LiveEventListener;
}

/**
 * The live stream every store spec runs against. Its existence is what keeps §8's boundary
 * structural: no spec has a reason to reach for `PrototypeLiveUpdates`, so none of them do,
 * and `app.config.ts` stays the only file that provides the concrete adapter. (`app.spec.ts`
 * names it, deliberately, to assert exactly that.)
 */
export class FakeLiveUpdates implements LiveUpdates {
  private readonly subscriptions = new Set<Subscription>();

  /** How many listeners are attached — the teardown assertion a store spec needs. */
  get listenerCount(): number {
    return this.subscriptions.size;
  }

  subscribe(listener: LiveEventListener, connected?: LiveConnectionListener): () => void {
    const subscription: Subscription = { listener, connected };
    this.subscriptions.add(subscription);
    return () => void this.subscriptions.delete(subscription);
  }

  emit(event: LiveEvent): void {
    for (const { listener } of [...this.subscriptions]) listener(event);
  }

  emitConnected(): void {
    for (const { connected } of [...this.subscriptions]) connected?.();
  }
}
