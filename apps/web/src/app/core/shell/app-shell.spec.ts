import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { shellTestProviders, testIdentity } from '../gateway/testing/shell-test-providers';
import { AppShell } from './app-shell';

const render = async (options: Parameters<typeof shellTestProviders>[0] = {}) => {
  TestBed.configureTestingModule({ imports: [AppShell], providers: shellTestProviders(options) });
  const fixture: ComponentFixture<AppShell> = TestBed.createComponent(AppShell);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

afterEach(() => document.documentElement.removeAttribute('data-theme'));

describe('AppShell', () => {
  it('lays out §23’s three regions', async () => {
    const element = await render();

    expect(element.querySelector('app-top-bar')).not.toBeNull();
    expect(element.querySelector('app-sidebar')).not.toBeNull();
    expect(element.querySelector('router-outlet')).not.toBeNull();
  });

  // Asserted as a transition, not an end state: a `data-theme` left behind by another test
  // would let an end-state assertion pass without the wiring existing at all.
  it('seeds the theme from the loaded identity (§22)', async () => {
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();

    await render({ identity: testIdentity('light') });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
