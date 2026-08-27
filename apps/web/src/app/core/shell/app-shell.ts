import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '../theme/theme-service';
import { ShellStore } from './shell-store';
import { Sidebar } from './sidebar/sidebar';
import { TopBar } from './top-bar/top-bar';

/**
 * §23's desktop-first layout: top bar across, sidebar beside, routed workspace in the
 * middle.
 *
 * It owns `ShellStore` and hands the pieces down as inputs, so §19's
 * `Page → Store → Gateway` holds and the sidebar and top bar stay presentational.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, TopBar],
  providers: [ShellStore],
  styleUrl: './app-shell.scss',
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly store = inject(ShellStore);
  private readonly theme = inject(ThemeService);

  constructor() {
    // The one place the persona's theme preference reaches the DOM. An effect rather than
    // a call inside load(), so the store stays ignorant of anything to do with rendering.
    effect(() => {
      const identity = this.store.identity();
      if (identity !== null) this.theme.seedFrom(identity);
    });

    void this.store.load();
  }
}
