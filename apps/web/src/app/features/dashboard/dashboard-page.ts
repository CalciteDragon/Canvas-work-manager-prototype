import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SHELL_COMMANDS } from '../../core/shell/shell-commands';
import { FailureMessage } from '../../shared/feedback/failure-message';
import { FirstRunBlock } from './first-run-block';
import { DashboardStore } from './dashboard-store';
import { DashboardWidgetFrame } from './widgets/widget-frame/dashboard-widget-frame';

/**
 * §24's home dashboard: a widget surface built from the persona's §25 widget list.
 *
 * Configuration is data, not interaction — position, size and hidden come from the persona
 * and nothing here writes them. Dragging widgets around is Slice 23, and the prototype is
 * supposed to find out whether it is worth building before it is built (§25).
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DashboardStore],
  imports: [DashboardWidgetFrame, FailureMessage, FirstRunBlock],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  readonly store = inject(DashboardStore);
  /** The shell's, for first run (Slice 79); absent outside `AppShell`, as in stories. */
  protected readonly shell = inject(SHELL_COMMANDS, { optional: true });

  constructor() {
    void this.store.load();
  }
}
