import { InjectionToken } from '@angular/core';
import type { LiveEvent } from '@cwm/contracts';

export type LiveEventListener = (event: LiveEvent) => void;
export type LiveConnectionListener = () => void;

/**
 * §62 as the application sees it: a stream of "something changed, go and look".
 *
 * The boundary of §8 applies here exactly as it does to the gateway — a store subscribes to
 * this interface and never learns that `EventSource`, HTTP or a prototype host exist.
 * `PrototypeLiveUpdates` is the §10 adapter, and `app.config.ts` is the only file that
 * *provides* it — `app.spec.ts` names it too, but only to assert that this token is not left
 * on the inert default below.
 *
 * A listener receives an *event*, not a state delta. It answers by re-reading through the
 * gateway; nothing here ever carries an entity.
 */
export interface LiveUpdates {
  /**
   * Returns the unsubscribe. `connected` runs after every successful source open, including
   * browser-managed reconnects, so stores can recover state that changed while disconnected
   * without pretending a transport lifecycle is a §57 activity event.
   */
  subscribe(listener: LiveEventListener, connected?: LiveConnectionListener): () => void;
}

/**
 * An inert stream: it accepts listeners and never calls them.
 *
 * This is the token's default so that a store constructed without a live source behaves
 * exactly as it does while the stream is down — a state every subscriber must handle anyway
 * — rather than failing to construct. The risk it carries is shipping a dead stream by
 * forgetting to override it, which `app.spec.ts` asserts against.
 */
export const inertLiveUpdates = (): LiveUpdates => ({ subscribe: () => () => undefined });

export const LIVE_UPDATES = new InjectionToken<LiveUpdates>('LIVE_UPDATES', {
  providedIn: 'root',
  factory: inertLiveUpdates,
});
