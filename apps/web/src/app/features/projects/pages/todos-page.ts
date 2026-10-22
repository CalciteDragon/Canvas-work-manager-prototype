import { taskMeta } from '../../tasks/task-meta';
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
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectId, ProjectLayoutMode, ProjectPageId, ProjectTodoItem } from '@cwm/contracts';
import { Icon } from '../../../shared/components/icon/icon';
import { Toast } from '../../../shared/feedback/toast';
import { ReceiptToast } from '../../../core/history/receipt-toast';
import { taskArchivedFeedback, workstreamCompletedFeedback } from '../history/history-feedback';
import { TodosPageStore, isTodoFinished, todoIdOf, todoTitleOf } from './todos-page-store';

/** §33's and §26's statuses, in the words the page says them. */
const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
};

/**
 * §34's Todos page: **one root's whole tree, in due-date order**, with a link to the canvas that
 * owns each row, a control to finish it, and reversible Delete for tasks.
 *
 * A list, not a canvas. There is no Quick Add, no Edit Layout Mode, no drag ordering and no
 * filter — §34 is explicit that "the order is the chronology" — and every row is a projection of
 * something owned elsewhere. Completion and task Delete use the canonical operations for those
 * records; a unit of work has no Delete control.
 *
 * It is mounted through `NgComponentOutlet`, so it declares all seven of the shell's inputs even
 * though a chronology has no layout mode and takes no shortcut placements (§27).
 */
@Component({
  selector: 'app-todos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Toast],
  providers: [TodosPageStore],
  templateUrl: './todos-page.html',
  styleUrl: './todos-page.scss',
})
export class TodosPage {
  readonly taskMeta = taskMeta;
  readonly projectId = input.required<ProjectId>();
  /** The Todos page record. Nothing here reads it: the chronology is scoped by the root (§34). */
  readonly pageId = input.required<ProjectPageId>();
  /** §28's canvas modes do not apply to a list; declared because the shell binds every input. */
  readonly projectLayoutMode = input<ProjectLayoutMode>('flow');
  /** Shortcut placement belongs to canonical pages (§27), and Todos holds no sections at all. */
  readonly shortcutsAllowed = input<boolean>(false);
  /** Declared because the shell sets every renderer input; this page has no shortcuts to refresh. */
  readonly rootProjectId = input<ProjectId | null>(null);
  /** The shell's write freeze. */
  readonly restoreBlocked = input<boolean>(false);
  readonly onProjectDataChange = input<() => void>(() => {});
  readonly onProjectHierarchyChange = input<() => void>(() => {});
  readonly onOpenArchive = input<(returnTo: HTMLElement) => void>(() => {});

  readonly store = inject(TodosPageStore);
  readonly toast = new ReceiptToast();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private recoveryGeneration = 0;
  private recoverySnapshot: readonly ProjectTodoItem[] | null = null;

  /** A committed archive stays visible after its chronology row (even the last one) leaves. */
  readonly deleteRecovery = signal<{
    id: string;
    title: string;
    owner: ReturnType<TodosPage['historyOwner']>;
  } | null>(null);

  /** Task toggles remain focusable, but every write is refused while this is true. */
  readonly writesBlocked = computed(() =>
    this.restoreBlocked() || this.store.completing() !== null || this.store.deleting() !== null,
  );

  constructor() {
    // Re-reads when the shell routes to another root without re-creating this component.
    effect(() => {
      this.recoveryGeneration += 1;
      this.deleteRecovery.set(null);
      this.toast.close('navigation');
      void this.store.load(this.projectId());
    });
    effect(() => {
      const recovery = this.deleteRecovery();
      const items = this.store.items();
      if (recovery !== null && items !== this.recoverySnapshot &&
        items.some((item) => item.kind === 'task' && item.task.id === recovery.id)) {
        this.deleteRecovery.set(null);
        // Its own Undo can publish the returning row before the transition response arrives.
        if (this.toast.report() !== null && !this.toast.pendingUndo()) this.toast.close();
      }
    });
  }

  idOf(item: ProjectTodoItem): string {
    return todoIdOf(item);
  }

  titleOf(item: ProjectTodoItem): string {
    return todoTitleOf(item);
  }

  kindLabel(item: ProjectTodoItem): string {
    return item.kind === 'task' ? 'Task' : 'Workstream';
  }

  statusOf(item: ProjectTodoItem): string {
    return item.kind === 'task'
      ? TASK_STATUS_LABELS[item.task.status] ?? item.task.status
      : PROJECT_STATUS_LABELS[item.project.status] ?? item.project.status;
  }

  /**
   * The stored date, as stored. A task's due instant is UTC (§45) and its **calendar day** is the
   * first ten characters of it; a unit of work's due date is already a calendar day. Converting
   * either into the reader's timezone would move a deadline nobody moved.
   */
  dueOf(item: ProjectTodoItem): string | undefined {
    return item.kind === 'task' ? item.task.dueAt?.slice(0, 10) : item.project.targetDate;
  }

  finished(item: ProjectTodoItem): boolean {
    return isTodoFinished(item);
  }

  /** §27's ownership chain, root first — the same breadcrumb the shell's column shows. */
  breadcrumbOf(item: ProjectTodoItem): string[] {
    const names = item.origin.breadcrumb.map(({ name }) => name);
    return item.kind === 'task' ? [...names, item.origin.sectionName] : names;
  }

  /**
   * The canonical canvas the row lives on. A root's task is on a Home tab; a unit of work's task
   * is on its single canvas, which is not a tab and has no `/pages/` segment (§26, §68).
   */
  linkOf(item: ProjectTodoItem): unknown[] {
    if (item.kind === 'subproject') return ['/projects', item.project.id];
    return item.origin.pageKind === 'home'
      ? ['/projects', item.origin.projectId, 'pages', 'home']
      : ['/projects', item.origin.projectId];
  }

  /** History belongs to the row's owner, not to this root-wide projection. */
  historyOwner(item: ProjectTodoItem): { id: ProjectId; name: string; route: unknown[] } | null {
    const id = item.kind === 'task' ? item.origin.projectId : item.project.id;
    if (id === this.projectId()) return null;
    const name = item.kind === 'subproject'
      ? item.project.name
      : item.origin.breadcrumb.find((step) => step.projectId === id)?.name;
    if (name === undefined) return null;
    const route = item.kind === 'task' && item.origin.pageKind === 'home'
      ? ['/projects', id, 'pages', 'home']
      : ['/projects', id];
    return { id, name, route };
  }

  /** The container to arrive at. A unit of work is its own destination and needs none. */
  fragmentOf(item: ProjectTodoItem): string | undefined {
    return item.kind === 'task' ? `section-${item.origin.sectionId}` : undefined;
  }

  async complete(item: ProjectTodoItem): Promise<void> {
    if (this.writesBlocked()) return;
    this.deleteRecovery.set(null);
    this.toast.close('write');
    const projectId = this.projectId();
    const generation = this.recoveryGeneration;
    const oldIndex = this.store.items().findIndex(candidate => this.idOf(candidate) === this.idOf(item));
    const control = this.row(this.idOf(item))?.querySelector<HTMLElement>('[data-todo-complete]') ?? null;
    const applied = await this.store.complete(item);
    if (!applied || this.projectId() !== projectId || generation !== this.recoveryGeneration) return;
    // §39's progress may have moved, and a completed unit of work moves the work tree too.
    this.onProjectDataChange()();
    if (item.kind === 'subproject') {
      this.onProjectHierarchyChange()();
      this.toast.show({ ...workstreamCompletedFeedback(item.project.name), link: { projectId: item.project.id, label: `Open ${item.project.name}` } },
        this.store.lastFeedbackReport() ?? undefined, () => this.nextControl(oldIndex));
      this.focusToast(control, projectId, generation);
    }
  }

  /** Reset native checkbox state from the synchronous optimistic patch, before awaiting it. */
  async toggle(item: ProjectTodoItem, event: Event): Promise<void> {
    if (item.kind !== 'task') return;
    const id = item.task.id;
    const projectId = this.projectId();
    const generation = this.recoveryGeneration;
    const box = event.target as HTMLInputElement;
    const focused = document.activeElement === box;
    if (!this.writesBlocked()) {
      this.deleteRecovery.set(null);
      this.toast.close('write');
    }
    const write = this.writesBlocked()
      ? Promise.resolve(false)
      : item.task.status === 'done' ? this.store.reopen(item) : this.store.complete(item);
    const current = this.store.items().find((candidate) => candidate.kind === 'task' && candidate.task.id === id);
    box.checked = current?.kind === 'task' && current.task.status === 'done';
    const applied = await write;
    if (this.destroyRef.destroyed) return;
    if (this.projectId() !== projectId || this.recoveryGeneration !== generation) return;
    // A synchronous refusal can settle before Angular renders the optimistic value. Its
    // binding then sees the same prior value and skips the native box; use the current row,
    // never the captured item, so a newer toggle or live answer cannot be overwritten.
    const settled = this.store.items().find((candidate) => candidate.kind === 'task' && candidate.task.id === id);
    box.checked = settled?.kind === 'task' && settled.task.status === 'done';
    if (applied) this.onProjectDataChange()();
    if (!focused || document.activeElement !== document.body) return;
    afterNextRender(() => {
      if (this.projectId() !== projectId || this.recoveryGeneration !== generation || document.activeElement !== document.body) return;
      const row = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-todo-row]')]
        .find((candidate) => candidate.getAttribute('data-todo-id') === id);
      row?.querySelector<HTMLInputElement>('[data-todo-toggle]')?.focus();
    }, { injector: this.injector });
  }

  async delete(item: ProjectTodoItem): Promise<void> {
    if (this.writesBlocked() || item.kind !== 'task') return;
    this.deleteRecovery.set(null);
    this.toast.close('write');
    const projectId = this.projectId();
    const recoveryGeneration = this.recoveryGeneration;
    const title = item.task.title;
    const owner = this.historyOwner(item);
    const id = this.idOf(item);
    const oldIndex = this.store.items().findIndex((candidate) => this.idOf(candidate) === id);
    const focusedRow = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-todo-row]')]
      .find((row) => row.getAttribute('data-todo-id') === id);
    const focusedDelete = focusedRow?.querySelector<HTMLButtonElement>('[data-todo-delete]') ?? null;
    const focusStartedInDelete = focusedDelete !== null && document.activeElement === focusedDelete;
    const deletion = this.store.delete(item);
    const scheduleFocus = (restore: boolean): void => {
      if (!focusStartedInDelete) return;
      afterNextRender(() => {
        if (this.projectId() !== projectId) return;
        const active = document.activeElement;
        if (active !== document.body && active !== null && active !== focusedDelete) return;
        if (restore) {
          const restoredRow = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-todo-row]')]
            .find((row) => row.getAttribute('data-todo-id') === id);
          restoredRow?.querySelector<HTMLElement>('[data-todo-delete]')?.focus();
          return;
        }
        this.toast.focusFirst();
      }, { injector: this.injector });
    };
    const applied = await deletion;
    if (this.destroyRef.destroyed) return;
    if (applied && this.projectId() === projectId && this.recoveryGeneration === recoveryGeneration) {
      this.recoverySnapshot = this.store.items();
      this.deleteRecovery.set({ id, title, owner });
      this.onProjectDataChange()();
      const report = this.store.lastFeedbackReport();
      this.toast.show(taskArchivedFeedback(title), report === null ? undefined : { ...report, ...(owner ? { projectName: owner.name } : {}) }, () => this.nextControl(oldIndex));
      this.focusToast(focusedDelete, projectId, recoveryGeneration);
    }
    if (!applied) scheduleFocus(true);
  }

  private row(id: string): HTMLElement | null {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-todo-row]')]
      .find(candidate => candidate.getAttribute('data-todo-id') === id) ?? null;
  }

  private nextControl(index: number): HTMLElement | null {
    const rows = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-todo-row]')];
    const ordered = [...rows.slice(index), ...rows.slice(0, index).reverse()];
    return ordered.map(row => row.querySelector<HTMLElement>('[data-todo-toggle]:not([aria-disabled="true"]), [data-todo-complete]:not([disabled])')).find(control => control !== null)
      ?? this.host.nativeElement.querySelector<HTMLElement>('#todos-heading');
  }

  private focusToast(control: HTMLElement | null, projectId: ProjectId, generation: number): void {
    afterNextRender(() => {
      if (this.projectId() !== projectId || this.recoveryGeneration !== generation) return;
      const active = document.activeElement;
      if (active === document.body || active === null || active === control) this.toast.focusFirst();
    }, { injector: this.injector });
  }

  async undoFeedback(): Promise<void> {
    const report = this.toast.report();
    await this.toast.undo();
    if (this.toast.state()?.tone === 'status' && this.toast.report() === null) {
      this.onProjectDataChange()();
      if (report?.receipt?.operation === 'project.update') this.onProjectHierarchyChange()();
    }
  }
}
