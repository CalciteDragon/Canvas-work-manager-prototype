import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { ProjectSection, SectionConfig, TaskId, TaskPriority } from '@cwm/contracts';
import { TaskDetailDrawer } from '../../../tasks/task-detail-drawer';
import { TaskListStore } from '../../../tasks/task-list-store';
import { TaskRow } from '../../../tasks/task-row';

/**
 * §30's Task List section. It owns no task logic: `TaskListStore`, `TaskRow` and
 * `TaskDetailDrawer` are Slice 7's, reused as they are (§66 — a section should be removable
 * without destabilising unrelated code, which is only true if it adds nothing of its own).
 *
 * The store is **injected, never provided here**. `ProjectPage` provides the one instance,
 * so the header's progress and this list read the same tasks; a second instance would give
 * them two different truths, and two projects' worth of HTTP.
 */
@Component({
  selector: 'app-task-list-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TaskRow, TaskDetailDrawer],
  templateUrl: './task-list-section.html',
  styleUrl: './task-list-section.scss',
})
export class TaskListSection {
  readonly section = input.required<ProjectSection>();
  /** Part of the shared content contract; this section keeps no configuration of its own. */
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();

  readonly store = inject(TaskListStore);

  async quickCreate(event: SubmitEvent, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    if (await this.store.create(input.value)) {
      input.value = '';
      this.onProjectDataChange()();
    }
  }

  editTitle(event: { id: TaskId; title: string }): void {
    void this.store.updateTitle(event.id, event.title);
  }

  changePriority(event: { id: TaskId; priority: TaskPriority }): void {
    void this.store.updatePriority(event.id, event.priority);
  }

  changeDueDate(event: { id: TaskId; dueDate: string }): void {
    void this.store.updateDueDate(event.id, event.dueDate);
  }

  async complete(id: TaskId): Promise<void> {
    if (await this.store.complete(id)) this.onProjectDataChange()();
  }

  async changeEstimate(event: { id: TaskId; estimate: number | null }): Promise<void> {
    if (await this.store.updateEstimate(event.id, event.estimate)) this.onProjectDataChange()();
  }
}
