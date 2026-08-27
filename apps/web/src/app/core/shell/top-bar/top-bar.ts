import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Identity } from '@cwm/contracts';
import { ThemeService } from '../../theme/theme-service';

/**
 * §23's top bar. Presentational apart from the theme toggle, which is the one control §22
 * requires the shell to have — Slice 12's dev panel lists Theme among its controls, and
 * this is a candidate to be superseded rather than duplicated when that lands.
 */
@Component({
  selector: 'app-top-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './top-bar.scss',
  templateUrl: './top-bar.html',
})
export class TopBar {
  readonly identity = input.required<Identity | null>();

  private readonly themeService = inject(ThemeService);
  protected readonly theme = this.themeService.theme;

  /** `avatar` is an optional emoji glyph (§17's personas), not an image reference. */
  protected readonly avatar = computed(() => {
    const user = this.identity()?.user;
    return user?.avatar ?? user?.name.charAt(0).toUpperCase() ?? '';
  });

  protected toggleTheme(): void {
    this.themeService.toggle();
  }
}
