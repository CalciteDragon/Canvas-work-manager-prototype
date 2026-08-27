import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { App } from './app';
import { shellTestProviders } from './core/gateway/testing/shell-test-providers';

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
