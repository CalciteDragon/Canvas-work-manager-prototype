import { Injectable, inject } from '@angular/core';
import { LiveEventSchema } from '@cwm/contracts';
import { PROTOTYPE_API_BASE_URL } from '../config/prototype-config';
import { IDENTITY_PROVIDER } from '../identity/identity-provider';
import type { LiveConnectionListener, LiveEventListener, LiveUpdates } from './live-updates';

interface Subscription {
  connected?: LiveConnectionListener;
  listener: LiveEventListener;
}

/** The first reconnect wait, doubling from here. */
export const RECONNECT_BASE_MS = 1_000;
/** The longest this will ever wait between attempts. */
export const RECONNECT_CEILING_MS = 30_000;

const parseFrame = (data: string): ReturnType<typeof LiveEventSchema.safeParse> => {
  try {
    return LiveEventSchema.safeParse(JSON.parse(data));
  } catch {
    return LiveEventSchema.safeParse(undefined);
  }
};

/**
 * The §10 adapter for §62: `EventSource` against the prototype host's `/prototype/events`.
 *
 * **The only file in `apps/web` that names `EventSource`.** Everything above it sees the
 * `LiveUpdates` interface, so replacing this with a WebSocket — or with nothing — changes
 * this file and `app.config.ts`, and no store.
 *
 * *Lazy on purpose.* The stream opens on the first subscriber and closes after the last one
 * leaves, which is what lets `app.spec.ts` assert that `appConfig` provides this adapter
 * without a test ever opening a socket.
 *
 * *The persona comes from `IdentityProvider`*, never from storage — the rule the gateway
 * already follows, so a stale key cannot make the header and the stream disagree.
 *
 * **Two retry mechanisms, kept apart.** A transient drop leaves the source `CONNECTING` and
 * the browser reconnects on the cadence the host's `retry:` field sets; this class does
 * nothing there, because reopening would leave two live connections. A *refused* connection
 * — any non-200, which is what a mistyped persona's 404 looks like from here — closes the
 * source with no browser retry at all, and an immediate reopen would be an unbounded request
 * loop. That is the only case this class reconnects, and it does so on a capped backoff. A
 * failed persona lookup takes the same path: `pnpm dev` starts the web app and the host
 * together, so the first identity call routinely loses the race, and a stream that gave up
 * there would be dead for the life of the page.
 */
@Injectable()
export class PrototypeLiveUpdates implements LiveUpdates {
  private readonly baseUrl = inject(PROTOTYPE_API_BASE_URL);
  private readonly identity = inject(IDENTITY_PROVIDER);

  private readonly subscriptions = new Set<Subscription>();
  private source: EventSource | null = null;
  private connecting = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RECONNECT_BASE_MS;

  subscribe(listener: LiveEventListener, connected?: LiveConnectionListener): () => void {
    const subscription: Subscription = { listener, connected };
    this.subscriptions.add(subscription);
    if (this.subscriptions.size === 1) this.open();

    return () => {
      this.subscriptions.delete(subscription);
      if (this.subscriptions.size === 0) this.close();
    };
  }

  private open(): void {
    if (this.source !== null || this.connecting) return;
    this.connecting = true;

    void this.identity.getCurrentIdentity().then(
      ({ user }) => {
        this.connecting = false;
        // The subscriber may have gone while the identity was in flight; opening now would
        // leave a socket nobody is listening to and nobody will close.
        if (this.subscriptions.size === 0) return;
        this.connect(user.id);
      },
      () => {
        this.connecting = false;
        this.scheduleReconnect();
      },
    );
  }

  private connect(userId: string): void {
    const source = new EventSource(`${this.baseUrl}/prototype/events?user=${encodeURIComponent(userId)}`);
    this.source = source;

    source.onopen = () => {
      this.retryDelay = RECONNECT_BASE_MS;
      for (const { connected } of [...this.subscriptions]) {
        if (connected !== undefined) this.notify(connected);
      }
    };

    source.onmessage = ({ data }: MessageEvent<string>) => {
      // A frame the contract does not recognise is dropped rather than thrown at a
      // subscriber: this is a notification channel, and a bad frame must not take out the
      // page that was listening for the good ones.
      const parsed = parseFrame(data);
      if (!parsed.success) return;
      for (const { listener } of [...this.subscriptions]) this.notify(() => listener(parsed.data));
    };

    source.onerror = () => {
      // Anything but CLOSED means the browser is retrying on its own. Leave it alone.
      if (source.readyState !== EventSource.CLOSED) return;
      source.close();
      if (this.source === source) this.source = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.retryTimer !== null || this.subscriptions.size === 0) return;

    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, RECONNECT_CEILING_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private close(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.source?.close();
    this.source = null;
    this.retryDelay = RECONNECT_BASE_MS;
  }

  /** One feature's callback cannot stop recovery or delivery for the features behind it. */
  private notify(listener: () => void): void {
    try {
      listener();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`live update listener failed — ${reason}`);
    }
  }
}
