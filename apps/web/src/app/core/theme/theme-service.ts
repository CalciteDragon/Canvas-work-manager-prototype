import { Injectable, signal } from '@angular/core';
import type { Identity, Theme } from '@cwm/contracts';

/**
 * §22's two themes. The service owns one signal and one attribute — `data-theme` on the
 * root element — and nothing else: every colour in the app comes from the tokens that
 * attribute selects (§21), so switching themes touches no component.
 *
 * A toggle is session-only. §61 defines no route that writes `UserPreferences`, and
 * Slice 12 decided against inventing one: the development panel's Theme control drives
 * this same signal, and deliberately keeps the theme out of the `sessionStorage` it uses
 * for its other settings, so switching persona still repaints from the persona's own
 * preference. That demonstration is worth more than a persisted override.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly active = signal<Theme>('dark');
  readonly theme = this.active.asReadonly();

  seedFrom(identity: Identity): void {
    this.apply(identity.user.preferences.theme);
  }

  /**
   * §46's Theme control. The top-bar toggle stays — §22 asks the shell to have one — and
   * both drive this one signal, so two controls never mean two pieces of state.
   */
  set(theme: Theme): void {
    this.apply(theme);
  }

  toggle(): void {
    this.apply(this.active() === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: Theme): void {
    this.active.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
  }
}
