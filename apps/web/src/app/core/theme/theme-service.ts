import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { Theme } from '@cwm/contracts';

const STORAGE_KEY = 'cwm.theme';

/**
 * §22's browser theme. With no explicit choice it follows the device live. Explicit
 * choices persist in guarded localStorage; Match device removes the override. Persona
 * preferences do not seed appearance. The app initializer constructs this on every route.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly choice = signal<Theme | null>(this.readChoice());
  private readonly active = signal<Theme>('dark');
  readonly theme = this.active.asReadonly();
  /** True when device changes determine the theme, including after a reload. */
  readonly followsDevice = computed(() => this.choice() === null);

  constructor() {
    this.apply(this.choice() ?? this.deviceTheme());
    const changed = () => {
      if (this.followsDevice()) this.apply(this.deviceTheme());
    };
    this.media?.addEventListener('change', changed);
    inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', changed));
  }

  /** Persist an explicit light or dark choice shared by all appearance controls. */
  set(theme: Theme): void {
    this.choice.set(theme);
    try { this.document.defaultView?.localStorage.setItem(STORAGE_KEY, theme); } catch { /* Session choice still works. */ }
    this.apply(theme);
  }

  toggle(): void {
    this.set(this.active() === 'dark' ? 'light' : 'dark');
  }

  /** Clear the saved choice and resume live device matching. */
  matchDevice(): void {
    this.choice.set(null);
    try { this.document.defaultView?.localStorage.removeItem(STORAGE_KEY); } catch { /* Device matching still works this session. */ }
    this.apply(this.deviceTheme());
  }

  private readChoice(): Theme | null {
    try {
      const value = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  private deviceTheme(): Theme {
    return this.media === undefined || this.media.matches ? 'dark' : 'light';
  }

  private apply(theme: Theme): void {
    this.active.set(theme);
    this.document.documentElement.setAttribute('data-theme', theme);
  }
}
