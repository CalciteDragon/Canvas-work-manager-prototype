import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { isSubproject, type Project, type ProjectStatus } from '@cwm/contracts';

/** The four §26 statuses a menu may offer — see `archiveRequested` for the fifth. */
export type SettableProjectStatus = Exclude<ProjectStatus, 'archived'>;

/**
 * §26's **More**, as its own component. **Presentational**: it takes the project and emits
 * what the user asked for; `ProjectHeader` passes the intents on and `ProjectWorkspaceShell`
 * owns the store and the navigation (§19).
 *
 * Its own component rather than more markup in `project-header.html` because `angular.json`
 * budgets a component stylesheet at 5 kB — the header's was already close, and a menu's
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
  /** §26's description, on both kinds. `null` clears it. */
  readonly descriptionRequested = output<string | null>();
  readonly statusRequested = output<SettableProjectStatus>();
  /** `null` clears it, which is what puts the header's "No target date" branch in reach. */
  readonly targetDateRequested = output<string | null>();
  readonly archiveRequested = output<void>();
  readonly openArchiveRequested = output<void>();
  /** "I am done here" with nothing to write — see `submitRename`. */
  readonly dismissed = output<void>();

  /**
   * `archived` is deliberately absent. `ProjectService.update` runs the whole archive path
   * on any transition into it, so a status list built from the enum would archive a project
   * with no confirmation and leave the user on a page that had just left the sidebar.
   */
  protected readonly statuses: SettableProjectStatus[] = ['planning', 'active', 'on_hold', 'completed'];
  protected readonly confirming = signal(false);

  /** §26 calls the same stored date a **due date** on a unit of work. One field, two labels. */
  protected readonly isWorkUnit = computed(() => isSubproject(this.project()));

  /**
   * A blank name leaves the form alone — there is nothing to submit and nothing to say. An
   * *unchanged* name is different: the user pressed Rename and meant something by it, so the
   * menu closes rather than sitting there looking broken. It emits nothing, because a write
   * that changes nothing is a request the host should never see.
   */
  protected submitRename(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const name = input.value.trim();
    if (name === '') return;
    if (name === this.project().name) {
      this.dismissed.emit();
      return;
    }
    this.renameRequested.emit(name);
  }

  /**
   * A description is optional and clearable, so an emptied field is a real intent rather
   * than nothing to submit — unlike the name, which has no meaningful empty value.
   */
  protected submitDescription(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const description = input.value.trim();
    if (description === (this.project().description ?? '')) {
      this.dismissed.emit();
      return;
    }
    this.descriptionRequested.emit(description === '' ? null : description);
  }

  protected submitTargetDate(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const value = input.value.trim();
    if (value === '') return;
    this.targetDateRequested.emit(value);
  }
}
