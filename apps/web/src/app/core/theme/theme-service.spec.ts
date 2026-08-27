import { TestBed } from '@angular/core/testing';
import type { Identity } from '@cwm/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeService } from './theme-service';

const identityPreferring = (theme: 'dark' | 'light') =>
  ({ user: { preferences: { theme } } }) as unknown as Identity;

const service = () => TestBed.configureTestingModule({}).inject(ThemeService);

// One `document` is shared across every test in the file, so a leaked attribute would let
// a later test pass without proving anything.
afterEach(() => document.documentElement.removeAttribute('data-theme'));

describe('ThemeService', () => {
  it('seeds the theme from the persona’s preference (§22)', () => {
    service().seedFrom(identityPreferring('light'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggles between §22’s two themes and nothing else', () => {
    const theme = service();
    theme.seedFrom(identityPreferring('dark'));

    theme.toggle();
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    theme.toggle();
    expect(theme.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
