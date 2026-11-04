import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SHELL_COMMANDS } from '../../core/shell/shell-commands';

/**
 * Home's first run (Slice 79, W1-001, W4-001, L4-020): what the product is for, and New project,
 * which asks the shell to open its one creation form, the sidebar's. `DashboardPage` mounts it
 * behind `@defer` (Q6 (a)); it hides itself once the workspace is no longer empty, since a
 * `when` trigger loads once and never unloads.
 */
@Component({
  selector: 'app-first-run-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (commands.workspaceEmpty()) {
      <section class="state-message state-message--empty" data-first-run aria-label="Get started">
        <p class="state-message__sentence" data-first-run-sentence>
          Projects hold your tasks, notes and reflections, for you and the agents you connect. Start with your first.
        </p>
        <button type="button" class="button button--primary" data-first-run-create (click)="commands.requestCreate()">
          New project
        </button>
      </section>
    }
  `,
})
export class FirstRunBlock {
  protected readonly commands = inject(SHELL_COMMANDS);
}
