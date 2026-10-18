import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectSection, SectionConfig, SectionId, Task, TaskId, TaskPriority } from '@cwm/contracts';
import { TaskDetailDrawer } from '../../../tasks/task-detail-drawer';
import { TaskDrawerCoordinator } from '../../../tasks/task-drawer-coordinator';
import { TaskListStore } from '../../../tasks/task-list-store';
import { TaskRow } from '../../../tasks/task-row';
import { ProjectPageStore } from '../../project-page-store';
import { SHELL_NARROW_QUERY } from '../../../../core/shell/app-shell';
import { LiftFocus } from '../../../../shared/lifts/lift-focus';
import { LiftStack } from '../../../../shared/lifts/lift-stack';
import { Toast } from '../../../../shared/feedback/toast';
import { ReceiptToast } from '../../../../core/history/receipt-toast';
import { taskArchivedFeedback } from '../../history/history-feedback';

/** A CDK drop-list id per section, so two lists on one canvas can be connected by name. */
export const taskListDropId = (id: SectionId): string => `task-list-${id}`;

/**
 * §30's Task List section. It owns no task logic: `TaskListStore`, `TaskRow` and
 * `TaskDetailDrawer` are Slice 7's, reused as they are (§66 — a section should be removable
 * without destabilising unrelated code, which is only true if it adds nothing of its own).
 *
 * The store is **provided here, one per section**. It used to be provided by the project page
 * so that two Task Lists could not drift; under
 * docs/decisions/2026-09-sections-own-their-data.md a `task-list` owns its rows, so two of
 * them *must* differ, and sharing one store would render the same list twice. Header
 * progress is unaffected — it reads §39's canonical project-wide answer, not this store.
 */
@Component({
  selector: 'app-task-list-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDrag, CdkDropList, TaskRow, TaskDetailDrawer, Toast, RouterLink],
  providers: [TaskListStore],
  templateUrl: './task-list-section.html',
  styleUrl: './task-list-section.scss',
})
export class TaskListSection {
  readonly section = input.required<ProjectSection>();
  /** Part of the shared content contract; this section keeps no configuration of its own. */
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);
  readonly onOpenArchive = input<(returnTo: HTMLElement) => void>(() => {});

  readonly store = inject(TaskListStore);
  readonly toast = new ReceiptToast();
  readonly deleteRecovery = signal<{ id: TaskId; title: string } | null>(null);
  private recoverySnapshot: readonly Task[] | null = null;
  private deleteGeneration = 0;
  /** Row Deletes awaiting their reply; while any is, lost focus belongs to its toast, not the drawer. */
  private deletesInFlight = 0;
  private currentSectionId: SectionId | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly stack = inject(LiftStack);
  private readonly coordinator = inject(TaskDrawerCoordinator, { optional: true });
  private readonly drawer = viewChild(TaskDetailDrawer);
  readonly narrow = signal(false);
  private openedTaskId: TaskId | null = null;
  private openedDrawer: TaskDetailDrawer | null = null;
  private drawerFocus: LiftFocus | null = null;
  private releaseStack: (() => void) | null = null;
  private releaseCoordinator: (() => void) | null = null;
  private destroyed = false;
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
    !this.readOnly()
      ? (this.page?.sections() ?? [])
      .filter((section) => section.type === 'task-list' && section.id !== this.section().id)
      .map(({ id }) => taskListDropId(id))
      : [],
  );

  constructor() {
    const destroy = inject(DestroyRef);
    const media = globalThis.matchMedia?.(SHELL_NARROW_QUERY);
    if (media) {
      this.narrow.set(media.matches);
      const change = (event: { matches: boolean }): void => {
        if (event.matches === this.narrow()) return;
        this.closeDrawer();
        this.narrow.set(event.matches);
      };
      media.addEventListener('change', change);
      destroy.onDestroy(() => media.removeEventListener('change', change));
    }
    destroy.onDestroy(() => {
      this.destroyed = true;
      this.openedDrawer?.hide();
      this.releaseStack?.();
      this.releaseCoordinator?.();
    });
    effect(() => {
      const task = this.store.selectedTask();
      const drawer = this.drawer();
      untracked(() => {
        if (task === null) {
          if (this.openedTaskId !== null) this.closeDrawer();
          return;
        }
        if (!drawer || task.id === this.openedTaskId) return;
        this.openedTaskId = task.id;
        this.openedDrawer = drawer;
        this.drawerFocus = new LiftFocus(this.taskTitle(task.id), () => this.quickTitle());
        this.releaseStack?.();
        this.releaseStack = this.stack.open(() => this.closeDrawer());
        this.releaseCoordinator?.();
        this.releaseCoordinator = this.coordinator?.select(this.section().id, () => this.closeDrawer()) ?? null;
        this.focusDrawer(task.id, drawer);
      });
    });
    effect(() => {
      const sectionId = this.section().id;
      if (this.currentSectionId !== sectionId) {
        this.currentSectionId = sectionId;
        this.deleteGeneration += 1;
        this.deleteRecovery.set(null);
        this.toast.close('navigation');
      }
    });
    effect(() => {
      const recovery = this.deleteRecovery();
      const tasks = this.store.tasks();
      if (recovery !== null && tasks !== this.recoverySnapshot && tasks.some(({ id }) => id === recovery.id)) {
        this.deleteRecovery.set(null);
        if (this.toast.report() !== null) this.toast.close();
      }
    });
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
    if (this.readOnly()) return;
    if (event.previousContainer === event.container) return;
    if (await this.store.receive(event.item.data as TaskId, this.section().id)) {
      this.onProjectDataChange()();
    }
  }

  async quickCreate(event: SubmitEvent, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    if (this.readOnly()) return;
    if (await this.store.create(input.value)) {
      input.value = '';
      this.onProjectDataChange()();
    }
  }

  editTitle(event: { id: TaskId; title: string }): void {
    if (this.readOnly()) return;
    void this.store.updateTitle(event.id, event.title);
  }

  changePriority(event: { id: TaskId; priority: TaskPriority }): void {
    if (this.readOnly()) return;
    void this.store.updatePriority(event.id, event.priority);
  }

  changeDueDate(event: { id: TaskId; dueDate: string }): void {
    if (this.readOnly()) return;
    void this.store.updateDueDate(event.id, event.dueDate);
  }

  async complete(id: TaskId): Promise<void> {
    if (this.readOnly()) return;
    const sectionId = this.section().id;
    if (await this.store.complete(id) && this.section().id === sectionId) this.onProjectDataChange()();
  }

  /** Reverse completion through the same container-bound store and refresh progress. */
  async reopen(id: TaskId): Promise<void> {
    if (this.readOnly()) return;
    const sectionId = this.section().id;
    if (await this.store.reopen(id) && this.section().id === sectionId) this.onProjectDataChange()();
  }

  /** Every explicit row selection lands on the drawer heading, including a repeated selection. */
  selectTask(id: TaskId): void {
    if (this.readOnly()) return;
    this.store.selectTask(id);
    if (this.openedTaskId === id && this.openedDrawer) this.focusDrawer(id, this.openedDrawer);
  }

  private focusDrawer(id: TaskId, drawer: TaskDetailDrawer): void {
    afterNextRender(() => {
      if (this.destroyed || this.store.selectedTaskId() !== id || this.openedDrawer !== drawer) return;
      drawer.open();
      this.drawerFocus?.enter(drawer.element.querySelector('h2'));
    }, { injector: this.injector });
  }

  private taskTitle(id: TaskId): HTMLElement | null {
    const row = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-task-row]')]
      .find((candidate) => candidate.getAttribute('data-task-id') === id);
    return row?.querySelector<HTMLElement>('[data-task-title]') ?? null;
  }

  private quickTitle(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector<HTMLInputElement>('[data-quick-task-title]');
  }

  /** Close either native mode, clearing selection and restoring only focus the drawer owned. */
  closeDrawer(): void {
    const sectionId = this.section().id;
    const drawer = this.openedDrawer;
    const focus = this.drawerFocus;
    const element = drawer?.element;
    const active = document.activeElement;
    const lost = (active === null || active === document.body) && this.deletesInFlight === 0;
    const returnFocus = lost || (element?.contains(active) ?? false);
    this.openedTaskId = null;
    this.openedDrawer = null;
    this.drawerFocus = null;
    this.releaseStack?.();
    this.releaseStack = null;
    this.releaseCoordinator?.();
    this.releaseCoordinator = null;
    drawer?.hide();
    this.store.selectTask(null);
    if (!focus || !returnFocus) return;
    afterNextRender(() => {
      if (this.destroyed || this.section().id !== sectionId || this.store.selectedTaskId() !== null) return;
      focus.restore(element);
    }, { injector: this.injector });
  }

  /**
   * The row leaves this list and the shell needs to hear about it, so the root Archive page and
   * progress projection can refresh through the existing page callback.
   */
  async archive(id: TaskId): Promise<void> {
    if (this.readOnly()) return;
    const sectionId = this.section().id;
    const title = this.store.tasks().find((task) => task.id === id)?.title;
    const generation = ++this.deleteGeneration;
    this.deleteRecovery.set(null);
    this.toast.close('write');
    const row = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-task-row]')]
      .find(candidate => candidate.getAttribute('data-task-id') === id);
    const focusedDelete = row?.querySelector<HTMLButtonElement>('[data-task-delete]') ?? null;
    this.deletesInFlight += 1;
    let archived: boolean;
    try { archived = await this.store.archive(id); } finally { this.deletesInFlight -= 1; }
    if (!archived) return;
    if (this.destroyed) return;
    this.onProjectDataChange()();
    if (this.section().id !== sectionId || generation !== this.deleteGeneration) return;
    if (title !== undefined) {
      this.recoverySnapshot = this.store.tasks();
      this.deleteRecovery.set({ id, title });
      this.toast.show(taskArchivedFeedback(title), this.store.archiveReport(id) ?? undefined, () => this.quickTitle());
    }

    const active = document.activeElement;
    if (active !== document.body && active !== null && active !== focusedDelete) return;
    afterNextRender(() => {
      if (this.section().id !== sectionId) return;
      const activeAfterRender = document.activeElement;
      if (activeAfterRender !== document.body && activeAfterRender !== null && activeAfterRender !== focusedDelete) return;
      this.toast.focusFirst();
    }, { injector: this.injector });
  }

  async undoDelete(): Promise<void> {
    await this.toast.undo();
    if (this.toast.state()?.tone === 'status' && this.toast.report() === null) {
      this.onProjectDataChange()();
      void this.store.refresh();
    }
  }

  async changeEstimate(event: { id: TaskId; estimate: number | null }): Promise<void> {
    if (this.readOnly()) return;
    if (await this.store.updateEstimate(event.id, event.estimate)) this.onProjectDataChange()();
  }
}
