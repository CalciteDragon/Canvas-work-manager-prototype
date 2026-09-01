import type { Theme } from '@cwm/contracts';

/**
 * Turns the knobs currently on `documentElement` into a paste-ready block for
 * `styles/_tokens.scss`.
 *
 * **It exports folded base literals, not the knob values.** Pasting
 * `--knob-radius-scale: 1.4` into `:root` would work, but it would cost the invariant the
 * whole knob layer rests on — `1` means "as the stylesheet wrote it" — and leave the lab's
 * Reset returning to a scaled state. So each derived family is *measured* at its current
 * size and re-emitted with its `calc(… * var(--knob-…))` wrapper intact, and every knob
 * stays at its default.
 *
 * **This file holds no design literals**, for the same reason as `design-lab-tokens.ts`:
 * every value in the output is read out of the live document.
 *
 * Most of the knobs cannot be measured through their own custom property. An unregistered
 * custom property returns its *declared text* — `--space-4` reads back as
 * `calc(1rem * var(--knob-space-scale))`, not `16px` — so the lengths, the shadows and the
 * mixed surfaces are read off a hidden probe element that has actually resolved them. The
 * two that are plain literals (`--color-accent`, `--layout-sidebar-width`) are read from
 * the root, where declared text is exactly what we want to paste back.
 *
 * **The per-theme half is only true for the theme on screen.** `--surface-*-base` and
 * `--color-accent` are declared per theme; one export captures one of them, which the
 * header says rather than leaving a reviewer to find out by pasting.
 */
export interface DesignLabExport {
  /** Paste-ready SCSS. */
  css: string;
  /** False when something did not resolve — under jsdom no stylesheet is loaded at all. */
  measured: boolean;
}

/**
 * Families the knobs scale. Every member is emitted, never one of each — the same rule
 * `_tokens.scss` is built on, and for the same reason: a half-converted family drifts.
 */
const SCALED_FAMILIES = [
  {
    knob: '--knob-space-scale',
    properties: ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6'],
  },
  { knob: '--knob-radius-scale', properties: ['--radius-sm', '--radius-md', '--radius-lg'] },
  {
    knob: '--knob-font-scale',
    properties: ['--font-size-sm', '--font-size-md', '--font-size-lg', '--font-size-xl'],
  },
] as const;

/** The shadows carry `--knob-elevation` on each length, because a shorthand cannot be scaled from outside. */
const SHADOWS = [
  { property: '--shadow-sm', color: '--shadow-color-sm' },
  { property: '--shadow-md', color: '--shadow-color-md' },
] as const;

/** The mixed surfaces, paired with the base literal each is derived from. */
const SURFACES = [
  { derived: '--color-surface', base: '--surface-base' },
  { derived: '--color-surface-raised', base: '--surface-raised-base' },
  { derived: '--color-surface-sunken', base: '--surface-sunken-base' },
] as const;

/** Where the per-theme literals live. Dark is the default, so it has no block of its own. */
const THEME_BLOCK: Record<Theme, { selector: string; note: string }> = {
  dark: { selector: ':root', note: 'Dark theme base literals — the same :root block as above.' },
  light: { selector: ":root[data-theme='light']", note: 'Light theme base literals.' },
};

/** Enough digits to hold a 0.05 step through a scale exactly, few enough not to emit float noise. */
const trimNumber = (value: number): string => String(Number(value.toFixed(5)));

/**
 * A colour as a hex triplet, to match how `_tokens.scss` writes its surfaces.
 *
 * **The conversion is the browser's, not ours.** A computed `background-color` keeps the
 * colour space it was written in, so the three surfaces come back as
 * `oklab(0.227594 -0.00114521 -0.0115902)` — valid CSS, but not something anyone wants
 * pasted into a file of hex triplets. Painting one pixel and reading it back is the only
 * conversion that is guaranteed to agree with what the screen is showing, and it costs no
 * colour maths of our own. Anything the canvas cannot render, and any colour carrying
 * alpha, is emitted verbatim rather than converted wrongly.
 */
const toHex = (color: string): string => {
  const channels = paint(color) ?? parseRgb(color);
  if (channels === null) return color;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const parseRgb = (color: string): number[] | null => {
  const parsed = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (parsed === null) return null;
  const parts = parsed[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const [red, green, blue, alpha] = parts;
  if (parts.length < 3 || ![red, green, blue].every(Number.isFinite)) return null;
  if (alpha !== undefined && alpha !== 1) return null;
  return [red, green, blue].map((channel) => Math.round(channel));
};

/** One opaque pixel of `color`, read back as sRGB — or `null` where there is no canvas (jsdom). */
const paint = (color: string): number[] | null => {
  // Checked before painting, not after: assigning an unparseable colour to `fillStyle` is
  // silently ignored, leaving the default black, which would export as a real value.
  if (typeof CSS === 'undefined' || !CSS.supports('color', color)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) return null;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return alpha === 255 ? [red, green, blue] : null;
};

export function buildDesignLabExport(theme: Theme): DesignLabExport {
  const root = getComputedStyle(document.documentElement);
  const rootFontSize = Number.parseFloat(root.fontSize);
  const declared = (property: string) => root.getPropertyValue(property).trim();

  const rootLines: string[] = [];
  const themeLines: string[] = [];
  let unresolved = 0;
  const push = (target: string[], property: string, value: string | null) => {
    if (value === null || value === '') unresolved += 1;
    else target.push(`  ${property}: ${value};`);
  };

  // Every measurement happens while the probe is still in the document: `getComputedStyle`
  // on a detached element resolves nothing, so a closure escaping this block would silently
  // measure an empty string for all seventeen values.
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.append(probe);
  try {
    const probeStyle = getComputedStyle(probe);

    /** A length in rem, so the export reads like the stylesheet it is pasted into. */
    const lengthInRem = (property: string): string | null => {
      if (!Number.isFinite(rootFontSize) || rootFontSize === 0) return null;
      probe.style.setProperty('padding-top', `var(${property})`);
      const pixels = Number.parseFloat(probeStyle.paddingTop);
      probe.style.removeProperty('padding-top');
      return Number.isFinite(pixels) ? `${trimNumber(pixels / rootFontSize)}rem` : null;
    };

    const colorOf = (property: string): string | null => {
      probe.style.setProperty('background-color', `var(${property})`);
      const value = probeStyle.backgroundColor.trim();
      probe.style.removeProperty('background-color');
      // An unresolvable `var()` leaves the property at its initial transparent value, which
      // is not a surface anybody wants pasted into the tokens file.
      if (value === '' || /^(?:transparent|rgba\(0, 0, 0, 0\))$/i.test(value)) return null;
      return toHex(value);
    };

    /**
     * The computed shorthand, reduced to its lengths. A zero stays bare — that is how
     * `_tokens.scss` writes the offset — and a spread is emitted only when it is not zero,
     * because nothing in the knob layer introduces one.
     */
    const shadowLengths = (property: string): string[] | null => {
      probe.style.setProperty('box-shadow', `var(${property})`);
      const value = probeStyle.boxShadow.trim();
      probe.style.removeProperty('box-shadow');
      if (value === '' || value === 'none') return null;
      const lengths = [...value.matchAll(/(-?\d*\.?\d+)px/g)].map((match) => Number(match[1]));
      if (lengths.length < 3) return null;
      const used = lengths.length > 3 && lengths[3] === 0 ? lengths.slice(0, 3) : lengths;
      return used.map((length) =>
        length === 0 ? '0' : `calc(${trimNumber(length)}px * var(--knob-elevation))`,
      );
    };

    for (const family of SCALED_FAMILIES) {
      for (const property of family.properties) {
        const measured = lengthInRem(property);
        push(rootLines, property, measured === null ? null : `calc(${measured} * var(${family.knob}))`);
      }
      rootLines.push('');
    }

    for (const shadow of SHADOWS) {
      const lengths = shadowLengths(shadow.property);
      push(rootLines, shadow.property, lengths === null ? null : `${lengths.join(' ')} var(${shadow.color})`);
    }
    rootLines.push('');
    push(rootLines, '--layout-sidebar-width', declared('--layout-sidebar-width'));

    for (const surface of SURFACES) push(themeLines, surface.base, colorOf(surface.derived));
  } finally {
    probe.remove();
  }

  push(themeLines, '--color-accent', declared('--color-accent'));

  const css = [
    `// Design Lab export — captured in the ${theme} theme.`,
    '//',
    '// Paste over the matching lines in apps/web/src/styles/_tokens.scss and leave every',
    '// --knob-* at its default: the knob values are folded into the base literals below, so',
    '// 1 keeps meaning "as the stylesheet wrote it" and Reset keeps returning here.',
    '//',
    '// The second block is per-theme and is only true for the theme that was on screen.',
    '// Switch theme in the rail, set the accent again, and export a second time for the',
    '// other half. --color-accent-contrast and --color-accent-surface do not track the',
    '// accent knob and are deliberately not exported.',
    '',
    ':root {',
    ...rootLines,
    '}',
    '',
    `// ${THEME_BLOCK[theme].note}`,
    `${THEME_BLOCK[theme].selector} {`,
    ...themeLines,
    '}',
    '',
  ].join('\n');

  return { css, measured: unresolved === 0 };
}
