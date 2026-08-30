import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { App } from './app';
import { appConfig } from './app.config';
import { shellTestProviders } from './core/gateway/testing/shell-test-providers';
import { LIVE_UPDATES } from './core/live/live-updates';
import { PrototypeLiveUpdates } from './core/live/prototype-live-updates';

describe('App', () => {
  it('renders the application shell', async () => {
    // The fakes are not optional: rendering App instantiates the whole shell subtree,
    // which injects the gateway, the identity provider and the router.
    TestBed.configureTestingModule({ imports: [App], providers: shellTestProviders() });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-shell')).not.toBeNull();
  });
});

describe('appConfig', () => {
  /**
   * `LIVE_UPDATES` has an inert default so that a store built without a stream still
   * constructs — which means forgetting to provide the real adapter would ship an app whose
   * live updates silently never arrive, with every test still green. This is the assertion
   * that catches it.
   *
   * It injects rather than renders on purpose: `PrototypeLiveUpdates` opens its `EventSource`
   * on the first subscriber, so constructing it here opens no socket. That laziness is what
   * makes this test possible.
   */
  it('provides the real live-update adapter, not the inert default', () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });

    expect(TestBed.inject(LIVE_UPDATES)).toBeInstanceOf(PrototypeLiveUpdates);
  });
});
