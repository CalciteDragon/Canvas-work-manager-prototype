import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import type { ProjectSection, SectionConfig, SectionId, TaskId, TaskPriority } from '@cwm/contracts';
import { TaskDetailDrawer } from '../../../tasks/task-detail-drawer';
import { TaskListStore } from '../../../tasks/task-list-store';
import { TaskRow } from '../../../tasks/task-row';
import { ProjectPageStore } from '../../project-page-store';

/** A CDK drop-list id per section, so two lists on one canvas can be connected by name. */
export const taskListDropId = (id: SectionId): string => `task-list-${id}`;

/**
 * §30's Task List section. It owns no task logic: `TaskListStore`, `TaskRow` and
 * `TaskDetailDrawer` are Slice 7's, reused as they are (§66 — a section should be removable
 * without destabilising unrelated code, which is only true if it adds nothing of its own).
 *
 * The store is **provided here, one per section**. It used to be provided by `ProjectPage`
 * so that two Task Lists could not drift; under
 * docs/decisions/2026-09-sections-own-their-data.md a `task-list` owns its rows, so two of
 * them *must* differ, and sharing one store would render the same list twice. Header
 * progress is unaffected — it reads §39's canonical project-wide answer, not this store.
 */
@Component({
  selector: 'app-task-list-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDrag, CdkDropList, TaskRow, TaskDetailDrawer],
  providers: [TaskListStore],
  templateUrl: './task-list-section.html',
  styleUrl: './task-list-section.scss',
})
export class TaskListSection {
  readonly section = input.required<ProjectSection>();
  /** Part of the shared content contract; this section keeps no configuration of its own. */
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly onProjectHierarchyChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();

  readonly store = inject(TaskListStore);
  /**
   * Optional on purpose. The section needs the *canvas* to know which other lists exist,
   * but §66 asks that a section stay removable and renderable on its own — a hard
   * dependency would make it un-mountable outside a project page. Without a page, the list
   * simply connects to nothing and drag-between-lists is unavailable.
   */
  private readonly page = inject(ProjectPageStore, { optional: true });

  readonly dropId = computed(() => taskListDropId(this.section().id));

  /**
   * The other task lists on this canvas, named explicitly rather than through
   * `cdkDropListGroup`: a group would also connect the canvas's own section-reorder list,
   * and dropping a task onto the canvas is not an operation.
   */
  readonly connectedDropIds = computed(() =>
    (this.page?.sections() ?? [])
      .filter((section) => section.type === 'task-list' && section.id !== this.section().id)
      .map(({ id }) => taskListDropId(id)),
  );

  constructor() {
    // The same rule `ReflectionsSection` follows: load on mount, quietly re-read whenever
    // the page says the project's data moved underneath it.
    effect(() => {
      this.projectDataRevision();
      void this.store.sync(this.section());
    });
  }

  /**
   * A task dropped from another list. The receiving store drives the write; the source list
   * re-reads on the revision this publishes, so neither store touches the other.
   */
  async dropTask(event: CdkDragDrop<SectionId>): Promise<void> {
    if (event.previousContainer === event.container) return;
    if (await this.store.receive(event.item.data as TaskId, this.section().id)) {
      this.onProjectDataChange()();
    }
  }

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
