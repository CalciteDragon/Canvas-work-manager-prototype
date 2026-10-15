import { afterEach, describe, expect, it } from 'vitest';
import { buildDesignLabExport } from './design-lab-export';

const values: Readonly<Record<string, string>> = {
  '--plane-pane-tint': '#102030', '--plane-pane-alpha': '60%', '--plane-pane-blur': '16px', '--plane-pane-solid': '#203040',
  '--plane-sheet-tint': '#304050', '--plane-sheet-alpha': '70%', '--plane-sheet-blur': '0px', '--plane-sheet-solid': '#405060',
  '--plane-lift-tint': '#506070', '--plane-lift-alpha': '80%', '--plane-lift-blur': '20px', '--plane-lift-solid': '#607080',
  '--plane-ground-solid': '#010203', '--art-warm': 'rgb(255 140 90 / 55%)',
  '--art-cool': 'rgb(120 90 255 / 50%)', '--art-teal': 'rgb(40 200 180 / 45%)', '--ground-art-strength': '75%',
  '--motion-scale': '1.5', '--duration-fast-base': '120ms', '--duration-base-base': '180ms', '--duration-slow-base': '240ms',
  '--ease-out': 'ease-out', '--ease-in': 'ease-in', '--lift-shadow': 'none',
  '--lab-sheet-filter': 'blur(12px) saturate(140%)',
};

afterEach(() => {
  for (const property of Object.keys(values)) document.documentElement.style.removeProperty(property);
  document.documentElement.style.removeProperty('--plane-ground-art');
});

describe('Design Lab Depth export (§22, §67)', () => {
  it('includes every plane primitive, ground and motion family from the active stylesheet', () => {
    for (const [property, value] of Object.entries(values)) document.documentElement.style.setProperty(property, value);
    // A browser resolves the custom property's var() references before export reads it.
    document.documentElement.style.setProperty('--plane-ground-art', 'radial-gradient(red, transparent)');
    const { css } = buildDesignLabExport('light');
    for (const [property, value] of Object.entries(values)) expect(css).toContain(`${property}: ${value};`);
    expect(css).toContain(":root[data-theme='light']");
    expect(css).not.toContain('--motion-duration-cap:');
    // Derived ground art must stay in the shared token block. Emitting its computed
    // value into the more specific light block would freeze the strength knob.
    expect(css).not.toContain('--plane-ground-art:');
  });
});
