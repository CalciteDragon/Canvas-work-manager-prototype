import { ChangeDetectionStrategy, Component, PendingTasks, computed, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import type { Project, ProjectId, ProjectRestoreStatus } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { FailureMessage } from '../../shared/feedback/failure-message';
import { RestoreStatusChoice } from '../../shared/projects/restore-status-choice';
import type { OwnerRestoreFailure } from './project-workspace-store';

/**
 * The banner over every page of a read-only project (Slice 79, §26, §31, L4-007): the archived
 * variant of `.state-message`, saying which project makes the page read-only, with the shared
 * restore choice on that owner. The owner is `ProjectWorkspaceStore.archivedOwner()`, the
 * outermost archived project, since only its restore can succeed.
 *
 * It emits `restore` with the shown status and the shell calls `restoreOwner`. The choice starts on
 * Active again whenever the owner changes (archived twice: after the outer owner, the page's own). A
 * failure for this owner renders here, not in the header, and its Try again repeats the last pressed
 * status. The shell mounts it behind `@defer (when readOnly())` to keep it out of the initial bundle
 * (Open question 6 (a)).
 *
 * **It reads one thing itself** (Slice 80, R10): how many workstreams a restore of the page's own
 * project brings back, because the store does not hold archived descendants by design. The read is
 * keyed on the owner, so being archived twice reads again once the page's own project is the owner,
 * and an answer for a previous owner is dropped. No answer leaves the sentence without a count.
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

  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);
  /**
   * The owner, when it is the project on screen, the other sentences needing no count. Keyed on its
   * `updatedAt` too: restored and archived again elsewhere, it can be the same owner with another
   * group, and a refresh that sees only the end of that must not keep the old promise.
   */
  private readonly ownedKey = computed(() => {
    const owner = this.owner();
    return owner.id === this.project().id ? `${owner.updatedAt} ${owner.id}` : null;
  });
  private readonly groupSize = signal<number | undefined>(undefined);
  private countRead = 0;
  private countedId: ProjectId | null = null;

  constructor() {
    effect(() => {
      const owned = this.ownedKey() !== null;
      const id = untracked(() => this.owner().id);
      untracked(() => void this.readCount(owned ? id : null));
    });
  }

  private async readCount(id: ProjectId | null): Promise<void> {
    const read = ++this.countRead;
    // A fresh read of the same owner keeps what it said until the answer, so the sentence holds still.
    if (id !== this.countedId) this.groupSize.set(undefined);
    this.countedId = id;
    if (id === null) return;
    const settled = this.pendingTasks.add();
    try {
      const { items } = await this.gateway.projects.archived();
      if (read === this.countRead) this.groupSize.set(items.find(({ project }) => project.id === id)?.cascadeCount);
    } catch {
      // A failed read leaves the sentence without a count; the restore itself is unaffected.
    } finally {
      settled();
    }
  }

  protected readonly sentence = computed(() => {
    const project = this.project();
    const owner = this.owner();
    if (owner.id === project.id) {
      const size = this.groupSize();
      if (size === undefined) return `“${project.name}” is archived.`;
      return `“${project.name}” is archived. Restoring it brings back ${size === 1 ? '1 workstream as it was' : `${size} workstreams as they were`}.`;
    }
    if (project.archivedWithProject?.projectId === owner.id) {
      return `“${project.name}” was archived with “${owner.name}”. Restoring “${owner.name}” brings it back.`;
    }
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
