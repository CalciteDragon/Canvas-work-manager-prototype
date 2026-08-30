import { TestBed } from '@angular/core/testing';
import type { LiveEvent } from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOTYPE_API_BASE_URL } from '../config/prototype-config';
import { fakeIdentityProvider } from '../gateway/testing/fake-gateway';
import { testIdentity } from '../gateway/testing/shell-test-providers';
import { GatewayError } from '../gateway/gateway-error';
import { IDENTITY_PROVIDER, type IdentityProvider } from '../identity/identity-provider';
import { PrototypeLiveUpdates, RECONNECT_CEILING_MS } from './prototype-live-updates';

/** Just enough of the browser's `EventSource` to drive every branch the adapter has. */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static opened: FakeEventSource[] = [];

  readyState = FakeEventSource.CONNECTING;
  closed = false;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  /** The server answered and the stream is live. */
  open(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.(new Event('open'));
  }

  send(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>);
  }

  /** A transient drop: the browser retries on its own and stays CONNECTING. */
  drop(): void {
    this.readyState = FakeEventSource.CONNECTING;
    this.onerror?.(new Event('error'));
  }

  /** A refused connection — a non-200 such as the host's unknown-persona 404. */
  refuse(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.(new Event('error'));
  }
}

const setup = (provider: IdentityProvider = fakeIdentityProvider(testIdentity())) => {
  TestBed.configureTestingModule({
    providers: [
      PrototypeLiveUpdates,
      { provide: PROTOTYPE_API_BASE_URL, useValue: 'http://localhost:4310' },
      { provide: IDENTITY_PROVIDER, useValue: provider },
    ],
  });
  return TestBed.inject(PrototypeLiveUpdates);
};

/** Rejects once, the way the host does while it is still binding its port, then answers. */
const identityThatFailsOnce = (): IdentityProvider => {
  let calls = 0;
  return {
    getCurrentIdentity: () =>
      ++calls === 1
        ? Promise.reject(new GatewayError('unreachable', 0, 'host is still starting'))
        : Promise.resolve(testIdentity()),
  };
};

/** Lets the persona promise settle without advancing the fake clock. */
const settle = () => Promise.resolve().then(() => undefined);

describe('PrototypeLiveUpdates (§62, §10)', () => {
  beforeEach(() => {
    FakeEventSource.opened = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens the stream for the resolved persona, on the first subscriber', async () => {
    const live = setup();
    expect(FakeEventSource.opened).toHaveLength(0);

    live.subscribe(() => undefined);
    await settle();

    expect(FakeEventSource.opened).toHaveLength(1);
    // The persona comes from the identity provider, never from storage — the same rule the
    // gateway follows, so a stale key cannot make the two disagree.
    expect(FakeEventSource.opened[0]?.url).toBe('http://localhost:4310/prototype/events?user=user-demo');
  });

  it('delivers a parsed event to every subscriber', async () => {
    const live = setup();
    const first: LiveEvent[] = [];
    const second: LiveEvent[] = [];
    live.subscribe((event) => void first.push(event));
    live.subscribe((event) => void second.push(event));
    await settle();

    FakeEventSource.opened[0]!.send('{"type":"task.completed","entityType":"task","entityId":"task-1"}');

    const expected = { type: 'task.completed', entityType: 'task', entityId: 'task-1' };
    expect(first).toEqual([expected]);
    expect(second).toEqual([expected]);
  });

  it('drops a frame that is not a LiveEvent rather than throwing at the subscriber', async () => {
    const live = setup();
    const received: LiveEvent[] = [];
    live.subscribe((event) => void received.push(event));
    await settle();
    const source = FakeEventSource.opened[0]!;

    expect(() => source.send('not json at all')).not.toThrow();
    expect(() => source.send('{"type":"nope","entityId":"x"}')).not.toThrow();
    expect(() => source.send('{"entityId":"x"}')).not.toThrow();

    expect(received).toEqual([]);
  });

  it('leaves a transient drop to the browser’s own retry', async () => {
    const live = setup();
    live.subscribe(() => undefined);
    await settle();

    FakeEventSource.opened[0]!.drop();
    await vi.advanceTimersByTimeAsync(RECONNECT_CEILING_MS);

    // Reopening here would race the browser and leave two live connections.
    expect(FakeEventSource.opened).toHaveLength(1);
  });

  it('reopens on a backoff when the connection is refused, rather than looping', async () => {
    const live = setup();
    live.subscribe(() => undefined);
    await settle();

    FakeEventSource.opened[0]!.refuse();
    // A refused connection closes the source with no browser retry, so an immediate reopen
    // would be an unbounded request loop against the host — which is what a mistyped
    // persona's 404 looks like from here.
    expect(FakeEventSource.opened).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(FakeEventSource.opened).toHaveLength(2);

    FakeEventSource.opened[1]!.refuse();
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(FakeEventSource.opened).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(FakeEventSource.opened).toHaveLength(3);
  });

  it('resets the backoff once the stream opens again', async () => {
    const live = setup();
    live.subscribe(() => undefined);
    await settle();

    FakeEventSource.opened[0]!.refuse();
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    FakeEventSource.opened[1]!.open();
    FakeEventSource.opened[1]!.refuse();
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();

    expect(FakeEventSource.opened).toHaveLength(3);
  });

  it('closes the source when the last subscriber leaves', async () => {
    const live = setup();
    const first = live.subscribe(() => undefined);
    const second = live.subscribe(() => undefined);
    await settle();

    first();
    expect(FakeEventSource.opened[0]?.closed).toBe(false);
    second();
    expect(FakeEventSource.opened[0]?.closed).toBe(true);
  });

  it('opens nothing when the last subscriber leaves before the persona resolves', async () => {
    const live = setup();

    live.subscribe(() => undefined)();
    await settle();

    expect(FakeEventSource.opened).toHaveLength(0);
  });

  it('backs off instead of dying when the persona lookup fails', async () => {
    // `pnpm dev` starts the web app and the host together, so the very first identity call
    // routinely loses the race. A stream that gave up here would be dead for the page's life.
    const live = setup(identityThatFailsOnce());
    live.subscribe(() => undefined);
    await settle();
    expect(FakeEventSource.opened).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);
    await settle();

    expect(FakeEventSource.opened).toHaveLength(1);
  });
});
