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
  for (const plane of ['ground', 'pane', 'sheet', 'lift']) {
    document.documentElement.style.removeProperty(`--plane-${plane}-background`);
    document.documentElement.style.removeProperty(`--plane-${plane}-filter`);
  }
  document.documentElement.style.removeProperty('--motion-duration-cap');
  document.documentElement.style.removeProperty('--lab-sheet-filter');
  document.documentElement.removeAttribute('data-theme');
});

describe('DesignLabStore (§22)', () => {
  it('offers stylesheet-backed plane and motion knobs with their units', () => {
    const expected = [
      ['paneTint', '--plane-pane-tint', ''], ['paneAlpha', '--plane-pane-alpha', '%'], ['paneBlur', '--plane-pane-blur', 'px'],
      ['sheetTint', '--plane-sheet-tint', ''], ['sheetAlpha', '--plane-sheet-alpha', '%'], ['sheetBlur', '--plane-sheet-blur', 'px'],
      ['liftTint', '--plane-lift-tint', ''], ['liftAlpha', '--plane-lift-alpha', '%'], ['liftBlur', '--plane-lift-blur', 'px'],
      ['canvasChromeRestOpacity', '--canvas-chrome-rest-opacity', ''],
      ['groundArtStrength', '--ground-art-strength', '%'], ['motionScale', '--motion-scale', ''],
    ];
    for (const [id, property, unit] of expected) {
      expect(tokenFor(id)).toMatchObject({ property, unit, fallback: null });
    }
  });

  it('toggles solid planes and reduced motion with inline properties, then removes them on reset', () => {
    const store = TestBed.inject(DesignLabStore);
    store.setSolidPlanes(true);
    store.setReducedMotion(true);
    for (const plane of ['pane', 'sheet', 'lift']) {
      expect(inline(`--plane-${plane}-background`)).toBe(`var(--plane-${plane}-solid)`);
      expect(inline(`--plane-${plane}-filter`)).toBe('none');
    }
    expect(inline('--motion-duration-cap')).toBe('80ms');
    expect(store.solidPlanes()).toBe(true);
    expect(store.reducedMotion()).toBe(true);
    store.reset();
    for (const plane of ['pane', 'sheet', 'lift']) {
      expect(inline(`--plane-${plane}-background`)).toBe('');
      expect(inline(`--plane-${plane}-filter`)).toBe('');
    }
    expect(inline('--motion-duration-cap')).toBe('');
    expect(inline('--plane-ground-background')).toBe('');
    expect(store.solidPlanes()).toBe(false);
    expect(store.reducedMotion()).toBe(false);
  });

  it('keeps an experimental sheet blur behind the stylesheet fallback and removes it on reset', () => {
    const store = TestBed.inject(DesignLabStore);
    store.write(tokenFor('sheetBlur'), 12);
    expect(inline('--lab-sheet-filter')).toBe('blur(var(--plane-sheet-blur)) saturate(var(--glass-saturation))');
    expect(inline('--plane-sheet-filter')).toBe('');
    store.setSolidPlanes(true);
    store.write(tokenFor('sheetBlur'), 20);
    expect(inline('--plane-sheet-filter')).toBe('none');
    store.setSolidPlanes(false);
    expect(inline('--plane-sheet-filter')).toBe('');
    store.reset();
    expect(inline('--lab-sheet-filter')).toBe('');
  });

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

  // The `ThemeService` boundary: it owns `data-theme`, this owns inline custom properties.
  // Asserted as the **whole attribute set**, not as `data-theme` alone: a store that wrote
  // any attribute at all — a class, a `data-design-lab`, a second theme hook — would be
  // reaching across the same line, and an assertion naming one attribute would miss it.
  it('touches no attribute but style', () => {
    const store = TestBed.inject(DesignLabStore);
    document.documentElement.setAttribute('data-theme', 'light');
    const before = [...document.documentElement.attributes].map(({ name, value }) =>
      name === 'style' ? 'style' : `${name}=${value}`,
    );

    for (const token of DESIGN_LAB_TOKENS) store.write(token, token.kind === 'color' ? '#ff00aa' : 2);
    store.reset();

    expect(
      [...document.documentElement.attributes].map(({ name, value }) =>
        name === 'style' ? 'style' : `${name}=${value}`,
      ),
    ).toEqual(before);
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
