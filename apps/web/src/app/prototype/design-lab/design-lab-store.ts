import { Injectable, signal } from '@angular/core';
import { DESIGN_LAB_TOKENS, type DesignLabToken } from './design-lab-tokens';

/**
 * §22's live tokens, written as inline custom properties on `documentElement` so they reach
 * the whole shell and not only the lab — seeing the accent change on the dashboard is the
 * entire experiment.
 *
 * **`providedIn: 'root'`, and it does not hydrate.** A page-provided store would be
 * destroyed on navigation, so the control rail would come back showing defaults while the
 * shell still rendered the old knobs. As a root singleton it is the only writer and is never
 * destroyed, so it always holds its own values and a hydration path would have no caller.
 * §20 objects to one global store owning the application's data; this owns seven numbers,
 * is development-only, and follows `DevPanelStore` in the same folder.
 *
 * **Session-only**, matching `docs/decisions/2026-08-theme-selection-is-session-only.md`:
 * values survive navigation and are lost on reload. `ThemeService` is not touched — it owns
 * `data-theme`, this owns inline custom properties, and they compose without either knowing
 * about the other.
 */
@Injectable({ providedIn: 'root' })
export class DesignLabStore {
  /** What this store has written, by token id, including its unit. */
  private readonly overrideState = signal<Readonly<Record<string, string>>>({});
  /** Bumped on reset and on a theme change, so the rail re-reads the stylesheet. */
  private readonly revisionState = signal(0);

  readonly overrides = this.overrideState.asReadonly();
  readonly revision = this.revisionState.asReadonly();

  write(token: DesignLabToken, value: string | number): void {
    const written = `${value}${token.unit}`;
    document.documentElement.style.setProperty(token.property, written);
    this.overrideState.update((current) => ({ ...current, [token.id]: written }));
  }

  /**
   * **Removes** each property rather than writing a default back, so the stylesheet wins —
   * reset in dark, switch to light, and the light accent appears.
   */
  reset(): void {
    for (const token of DESIGN_LAB_TOKENS) {
      document.documentElement.style.removeProperty(token.property);
    }
    this.overrideState.set({});
    this.rereadStylesheet();
  }

  /** Called when the theme changes: the two themes declare different accents. */
  rereadStylesheet(): void {
    this.revisionState.update((revision) => revision + 1);
  }

  /**
   * What a control should display: this store's own write, or the stylesheet's value.
   *
   * An unregistered custom property returns its **declared text**, so `--color-accent`
   * comes back `#6ea8fe` and `--layout-sidebar-width` comes back `15rem`, **not** pixels.
   * The `.trim()` is not cosmetic: a preserved leading space silently resets an
   * `<input type="color">` to black. Under jsdom no stylesheet is loaded and the read
   * returns `''`, so a control falls back to rendering as untouched.
   */
  currentValue(token: DesignLabToken): string {
    const override = this.overrideState()[token.id];
    if (override !== undefined) return override;
    // Read through the revision signal so a reset or a theme change re-runs this.
    this.revisionState();
    return getComputedStyle(document.documentElement).getPropertyValue(token.property).trim();
  }

  /** The same value as a number, for a slider. */
  currentNumber(token: DesignLabToken): number {
    const parsed = Number.parseFloat(this.currentValue(token));
    if (Number.isFinite(parsed)) return parsed;
    return token.fallback ?? token.min ?? 0;
  }
}
