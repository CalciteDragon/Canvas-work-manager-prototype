import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import type { Project, ProjectRestoreStatus } from '@cwm/contracts';
import { FailureMessage } from '../../shared/feedback/failure-message';
import { RestoreStatusChoice } from '../../shared/projects/restore-status-choice';
import type { OwnerRestoreFailure } from './project-workspace-store';

/**
 * The banner over every page of a read-only project (Slice 79, §26, §31, L4-007): the archived
 * variant of `.state-message`, saying which project makes the page read-only, with the shared
 * restore choice on that owner. The owner is `ProjectWorkspaceStore.archivedOwner()`, the
 * outermost archived project, since only its restore can succeed.
 *
 * Presentational: it emits `restore` with the shown status and the shell calls `restoreOwner`.
 * The choice starts on Active again whenever the owner changes (archived twice: after the outer
 * owner, the page's own). A failure for this owner renders here, not in the header, and its Try
 * again repeats the last pressed status. The shell mounts it behind `@defer (when readOnly())`
 * to keep it out of the initial bundle (Open question 6 (a)).
 */
@Component({
  selector: 'app-archived-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RestoreStatusChoice, FailureMessage],
  templateUrl: './archived-banner.html',
  styleUrl: './archived-banner.scss',
  host: {
    class: 'state-message state-message--archived',
    '[attr.aria-busy]': "pending() ? 'true' : null",
  },
})
export class ArchivedBanner {
  /** The page's project. */
  readonly project = input.required<Project>();
  /** The archived project whose restore the banner offers: the page's own or an ancestor. */
  readonly owner = input.required<Project>();
  /** The owner's restore is running. */
  readonly pending = input(false);
  /** Another project write runs, so the restore cannot start. */
  readonly disabled = input(false);
  readonly failure = input<OwnerRestoreFailure | null>(null);
  readonly restore = output<ProjectRestoreStatus>();

  /** Bound to the choice; back to Active for each new owner, kept through a refreshed record of the same one. */
  protected readonly status = linkedSignal<string, ProjectRestoreStatus>({ source: computed(() => this.owner().id), computation: () => 'active' });
  private lastStatus: ProjectRestoreStatus | null = null;

  protected readonly sentence = computed(() => {
    const project = this.project();
    const owner = this.owner();
    if (owner.id === project.id) return `“${project.name}” is archived.`;
    return project.status === 'archived'
      ? `“${project.name}” is archived, and so is “${owner.name}”, which holds it.`
      : `“${project.name}” is inside “${owner.name}”, which is archived.`;
  });

  protected readonly ownerFailure = computed(() => {
    const failure = this.failure();
    return failure !== null && failure.ownerId === this.owner().id ? failure : null;
  });

  protected press(status: ProjectRestoreStatus): void {
    this.lastStatus = status;
    this.restore.emit(status);
  }

  protected retry(): void {
    if (this.pending()) return;
    this.press(this.lastStatus ?? this.status());
  }
}
