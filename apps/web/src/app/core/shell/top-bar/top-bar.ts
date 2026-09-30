import { ChangeDetectionStrategy, Component, computed, inject, input, output, viewChild, type ElementRef } from '@angular/core';
import type { Identity } from '@cwm/contracts';
import { ThemeService } from '../../theme/theme-service';

/**
 * §23's top bar. Presentational apart from the theme toggle, which is the one control §22
 * requires the shell to have.
 *
 * §46's development panel also has a Theme control, and both drive the same `ThemeService`
 * signal. That is two controls over one piece of state, not two pieces of state — the
 * toggle was deliberately *not* superseded
 * (docs/decisions/2026-08-theme-selection-is-session-only.md).
 */
@Component({
  selector: 'app-top-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './top-bar.scss',
  templateUrl: './top-bar.html',
})
export class TopBar {
  readonly identity = input.required<Identity | null>();
  /** Slice 58: `AppShell` offers the Menu only below its phone breakpoint. */
  readonly menuAvailable = input(false);
  /** Whether the drawer the Menu controls is open, for `aria-expanded`. */
  readonly menuOpen = input(false);
  readonly menuRequested = output<void>();

  private readonly menu = viewChild<ElementRef<HTMLButtonElement>>('menu');

  private readonly themeService = inject(ThemeService);
  protected readonly theme = this.themeService.theme;

  /** `avatar` is an optional emoji glyph (§17's personas), not an image reference. */
  protected readonly avatar = computed(() => {
    const user = this.identity()?.user;
    return user?.avatar ?? user?.name.charAt(0).toUpperCase() ?? '';
  });

  /**
   * Where a dismissed drawer hands focus back. A no-op while the Menu is not rendered, so the
   * shell calls it after the render that creates the button — never synchronously.
   */
  focusMenu(): void {
    this.menu()?.nativeElement.focus();
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }
}
