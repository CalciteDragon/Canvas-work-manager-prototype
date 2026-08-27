import { Injectable, signal } from '@angular/core';
import type { Identity, Theme } from '@cwm/contracts';

/**
 * §22's two themes. The service owns one signal and one attribute — `data-theme` on the
 * root element — and nothing else: every colour in the app comes from the tokens that
 * attribute selects (§21), so switching themes touches no component.
 *
 * A toggle is session-only. §61 defines no route that writes `UserPreferences`, and
 * inventing one is Slice 12's business at the earliest.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly active = signal<Theme>('dark');
  readonly theme = this.active.asReadonly();

  seedFrom(identity: Identity): void {
    this.apply(identity.user.preferences.theme);
  }

  toggle(): void {
    this.apply(this.active() === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: Theme): void {
    this.active.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
  }
}
