import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { DesignLabStore } from './design-lab-store';
import { DESIGN_LAB_TOKENS } from './design-lab-tokens';

/**
 * **What these specs deliberately do not claim.** jsdom resolves neither `color-mix()` nor
 * `var()` references, so no unit test here can prove the knob layer produces a different
 * rendered colour — a spec reading `getComputedStyle` would pass while `--color-surface`
 * was invalid and every surface was transparent in a real browser. What jsdom *does* do is
 * store and return custom properties set on an element's own inline style, which is exactly
 * what these assertions need. The knob layer's end-to-end proof is the acceptance pass, in
 * a browser, in both themes.
 */
const inline = (property: string) => document.documentElement.style.getPropertyValue(property);
const tokenFor = (id: string) => DESIGN_LAB_TOKENS.find((token) => token.id === id)!;

afterEach(() => {
  for (const token of DESIGN_LAB_TOKENS) document.documentElement.style.removeProperty(token.property);
  document.documentElement.removeAttribute('data-theme');
});

describe('DesignLabStore (§22)', () => {
  it('writes only the knob properties it owns, with their units', () => {
    const store = TestBed.inject(DesignLabStore);

    store.write(tokenFor('radius'), 1.5);
    store.write(tokenFor('surfaceContrast'), 60);
    store.write(tokenFor('sidebarWidth'), 18);
    store.write(tokenFor('accent'), '#ff00aa');

    // The **values**, not merely the property names: a bare `60` here makes the whole
    // `color-mix()` invalid at computed-value time and every surface in the application
    // goes transparent at once.
    expect(inline('--knob-radius-scale')).toBe('1.5');
    expect(inline('--knob-surface-contrast')).toBe('60%');
    expect(inline('--layout-sidebar-width')).toBe('18rem');
    expect(inline('--color-accent')).toBe('#ff00aa');
  });

  it('reset removes every property in the token table', () => {
    const store = TestBed.inject(DesignLabStore);
    for (const token of DESIGN_LAB_TOKENS) store.write(token, token.kind === 'color' ? '#ff00aa' : 2);
    expect(DESIGN_LAB_TOKENS.every((token) => inline(token.property) !== '')).toBe(true);

    store.reset();

    // Removal, not a default written back: the stylesheet has to win, so switching theme
    // after a reset shows the theme's own accent rather than the other theme's.
    for (const token of DESIGN_LAB_TOKENS) expect(inline(token.property)).toBe('');
    expect(store.overrides()).toEqual({});
  });

  it('leaves data-theme alone', () => {
    const store = TestBed.inject(DesignLabStore);
    document.documentElement.setAttribute('data-theme', 'light');

    store.write(tokenFor('accent'), '#ff00aa');
    store.reset();

    // The `ThemeService` boundary: it owns the attribute, this owns inline properties.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('falls back to the structural default when no stylesheet answers', () => {
    const store = TestBed.inject(DesignLabStore);

    // Under jsdom the computed read returns '' — a control must still render as untouched
    // rather than as NaN.
    expect(store.currentNumber(tokenFor('radius'))).toBe(1);
    expect(store.currentNumber(tokenFor('surfaceContrast'))).toBe(100);

    store.write(tokenFor('radius'), 1.4);
    expect(store.currentNumber(tokenFor('radius'))).toBe(1.4);
  });
});
