/**
 * §22's Design Lab controls, including Depth's plane and motion controls, as data.
 *
 * **This file holds no design literals**, deliberately. A hard-coded `#ff9f6b` here would
 * be a design value outside the one file §21 permits — invisible to
 * `check-design-tokens.mjs`, which only inspects `styles`/`template` initialisers in `.ts`
 * — *and* wrong in the light theme. Controls that need a design starting position
 * (including accent, plane primitives and sidebar width) read it from the stylesheet at
 * runtime, and Reset **removes** the inline property rather than writing a default back,
 * letting the stylesheet win. That is theme-correct for free.
 *
 * The numeric knobs' defaults (`1`, `100%`) are structural constants of the knob layer
 * itself — "as the stylesheet wrote it" — not design values, so they stay here.
 */
export interface DesignLabToken {
  id: string;
  label: string;
  /** What the store writes on `documentElement`. */
  property: string;
  kind: 'range' | 'color';
  /**
   * Concatenated on write and split off on read. **The percent sign is part of the value**:
   * `--knob-surface-contrast: 100` (bare) makes the whole `color-mix()` invalid at
   * computed-value time and every surface in the application goes transparent at once.
   */
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  /** `null` means "read the stylesheet" — see the note above. */
  fallback: number | null;
  /** Shown under the control when its behaviour needs explaining rather than discovering. */
  note?: string;
}

const planeTokens = (plane: 'pane' | 'sheet' | 'lift'): DesignLabToken[] => {
  const label = `${plane[0].toUpperCase()}${plane.slice(1)}`;
  return [
    { id: `${plane}Tint`, label: `${label} tint`, property: `--plane-${plane}-tint`, kind: 'color', unit: '', fallback: null },
    { id: `${plane}Alpha`, label: `${label} alpha`, property: `--plane-${plane}-alpha`, kind: 'range', unit: '%', min: 0, max: 100, step: 1, fallback: null },
    { id: `${plane}Blur`, label: `${label} blur`, property: `--plane-${plane}-blur`, kind: 'range', unit: 'px', min: 0, max: 40, step: 1, fallback: null,
      ...(plane === 'sheet' ? { note: 'The shipped V2 sheets do not blur. Moving this knob experiments with sheet blur.' } : {}) },
  ];
};

export const DESIGN_LAB_TOKENS: readonly DesignLabToken[] = [
  { id: 'radius', label: 'Radius', property: '--knob-radius-scale', kind: 'range', unit: '', min: 0, max: 2.5, step: 0.05, fallback: 1 },
  { id: 'spacing', label: 'Spacing density', property: '--knob-space-scale', kind: 'range', unit: '', min: 0.5, max: 2, step: 0.05, fallback: 1 },
  {
    id: 'surfaceContrast',
    label: 'Surface contrast',
    property: '--knob-surface-contrast',
    kind: 'range',
    unit: '%',
    min: 0,
    max: 100,
    step: 1,
    fallback: 100,
    // Stated on the control, so a reviewer is not left wondering why dragging up does
    // nothing: `color-mix()` clamps to [0%, 100%] and the default sits at the top.
    note: 'Reduces only — the default sits at the top of the range.',
  },
  { id: 'accent', label: 'Accent', property: '--color-accent', kind: 'color', unit: '', fallback: null, note: 'Moves --color-accent alone; accent-tinted surfaces keep their own colours.' },
  { id: 'fontScale', label: 'Font scale', property: '--knob-font-scale', kind: 'range', unit: '', min: 0.75, max: 1.5, step: 0.05, fallback: 1 },
  { id: 'elevation', label: 'Elevation', property: '--knob-elevation', kind: 'range', unit: '', min: 0, max: 3, step: 0.1, fallback: 1 },
  { id: 'sidebarWidth', label: 'Sidebar width', property: '--layout-sidebar-width', kind: 'range', unit: 'rem', min: 10, max: 26, step: 0.5, fallback: null },
  { id: 'canvasChromeRestOpacity', label: 'Section tools at rest', property: '--canvas-chrome-rest-opacity', kind: 'range', unit: '', min: 0, max: 1, step: 0.05, fallback: null },
  ...planeTokens('pane'),
  ...planeTokens('sheet'),
  ...planeTokens('lift'),
  { id: 'groundArtStrength', label: 'Ground art strength', property: '--ground-art-strength', kind: 'range', unit: '%', min: 0, max: 100, step: 1, fallback: null },
  { id: 'motionScale', label: 'Motion scale', property: '--motion-scale', kind: 'range', unit: '', min: 0, max: 3, step: 0.1, fallback: null },
];
