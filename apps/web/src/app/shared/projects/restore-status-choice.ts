import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { ProjectRestoreStatusSchema, type ProjectRestoreStatus } from '@cwm/contracts';

/** The restore statuses' one casing, held once here (Slice 79, L4-012). */
const RESTORE_STATUS_LABELS: Record<ProjectRestoreStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
};

/**
 * The one way an archived project is restored (Slice 79, §23, §31, L4-012): a **Restore as**
 * select over the restore statuses, then **Restore**: one option list, one casing and one label,
 * for every place that restores a project: Archive's workstream rows, Settings › Archived projects
 * and the Design Lab's archived specimen.
 *
 * Presentational: it takes inputs and emits `restore` with the shown status; the caller writes.
 * The options are `ProjectRestoreStatusSchema`'s, in its order. `status` starts on **Active**,
 * preselected and visible before the press, so the person reads "Restore as Active" and nothing
 * is guessed silently (Open question 2, user decision 2026-11-04, (a)).
 *
 * `subjectLabel` names Restore for a screen reader, `Restore <label>`, as the Archive row always
 * has. While `pending` (the caller's restore runs) both controls are `aria-disabled` and keep
 * focus, Restore reads "Restoring…" under the same name, and neither a press nor a change takes effect; `disabled` is for a caller that cannot
 * restore at all (blocked or paused).
 */
@Component({
  selector: 'app-restore-status-choice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restore-status-choice.html',
  styleUrl: './restore-status-choice.scss',
})
export class RestoreStatusChoice {
  /** The project being restored, as Restore's accessible name gives it: `Restore <label>`. */
  readonly subjectLabel = input.required<string>();
  /** The status Restore will use; Active until the person picks another. */
  readonly status = model<ProjectRestoreStatus>('active');
  /** The caller's restore is running: both controls are `aria-disabled`, keep focus and take no press or change. */
  readonly pending = input(false);
  /** The caller cannot restore at all: both controls are natively disabled. */
  readonly disabled = input(false);
  readonly restore = output<ProjectRestoreStatus>();

  protected readonly statuses = ProjectRestoreStatusSchema.options;
  protected readonly labels = RESTORE_STATUS_LABELS;

  protected choose(select: HTMLSelectElement): void {
    const parsed = ProjectRestoreStatusSchema.safeParse(select.value);
    if (this.pending() || !parsed.success) {
      select.value = this.status();
      return;
    }
    this.status.set(parsed.data);
  }

  protected press(): void {
    if (this.pending() || this.disabled()) return;
    this.restore.emit(this.status());
  }
}
