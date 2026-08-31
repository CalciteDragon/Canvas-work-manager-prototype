import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { Project, ProjectStatus } from '@cwm/contracts';

/** The four §26 statuses a menu may offer — see `archiveRequested` for the fifth. */
export type SettableProjectStatus = Exclude<ProjectStatus, 'archived'>;

/**
 * §26's **More**, as its own component. **Presentational**: it takes the project and emits
 * what the user asked for; `ProjectPage` owns the store and the navigation (§19).
 *
 * Its own component rather than more markup in `project-page.html` because `angular.json`
 * budgets a component stylesheet at 5 kB — the page's was already close, and a menu's
 * chrome is exactly the kind of thing that should carry its own.
 */
@Component({
  selector: 'app-project-more-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './project-more-menu.scss',
  templateUrl: './project-more-menu.html',
})
export class ProjectMoreMenu {
  readonly project = input.required<Project>();

  readonly renameRequested = output<string>();
  readonly statusRequested = output<SettableProjectStatus>();
  /** `null` clears it, which is what puts the header's "No target date" branch in reach. */
  readonly targetDateRequested = output<string | null>();
  readonly archiveRequested = output<void>();

  /**
   * `archived` is deliberately absent. `ProjectService.update` runs the whole archive path
   * on any transition into it, so a status list built from the enum would archive a project
   * with no confirmation and leave the user on a page that had just left the sidebar.
   */
  protected readonly statuses: SettableProjectStatus[] = ['planning', 'active', 'on_hold', 'completed'];
  protected readonly confirming = signal(false);

  protected submitRename(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const name = input.value.trim();
    if (name === '' || name === this.project().name) return;
    this.renameRequested.emit(name);
  }

  protected submitTargetDate(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const value = input.value.trim();
    if (value === '') return;
    this.targetDateRequested.emit(value);
  }
}
