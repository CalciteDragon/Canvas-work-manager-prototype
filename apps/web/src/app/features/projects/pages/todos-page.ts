import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectId, ProjectLayoutMode, ProjectPageId, ProjectTodoItem } from '@cwm/contracts';
import { TodosPageStore, isTodoFinished, todoIdOf } from './todos-page-store';

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
 * owns each row and one control to finish it.
 *
 * A list, not a canvas. There is no Quick Add, no Edit Layout Mode, no drag ordering and no
 * filter — §34 is explicit that "the order is the chronology" — and every row is a projection of
 * something owned elsewhere, so the only write on this page is the canonical completion.
 *
 * It is mounted through `NgComponentOutlet`, so it declares all seven of the shell's inputs even
 * though a chronology has no layout mode and takes no shortcut placements (§27).
 */
@Component({
  selector: 'app-todos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  providers: [TodosPageStore],
  templateUrl: './todos-page.html',
  styleUrl: './todos-page.scss',
})
export class TodosPage {
  readonly projectId = input.required<ProjectId>();
  /** The Todos page record. Nothing here reads it: the chronology is scoped by the root (§34). */
  readonly pageId = input.required<ProjectPageId>();
  /** §28's canvas modes do not apply to a list; declared because the shell binds all seven. */
  readonly projectLayoutMode = input<ProjectLayoutMode>('flow');
  /** Shortcut placement is a Home-only capability (§27), and Todos holds no sections at all. */
  readonly shortcutsAllowed = input<boolean>(false);
  /** The shell's write freeze. Todos writes exactly one thing, and this is what stops it. */
  readonly restoreBlocked = input<boolean>(false);
  readonly onProjectDataChange = input<() => void>(() => {});
  readonly onProjectHierarchyChange = input<() => void>(() => {});

  readonly store = inject(TodosPageStore);

  /** No control at all is offered while the shell is blocking writes, so nothing lies. */
  readonly writesBlocked = computed(() => this.restoreBlocked() || this.store.completing() !== null);

  constructor() {
    // Re-reads when the shell routes to another root without re-creating this component.
    effect(() => void this.store.load(this.projectId()));
  }

  idOf(item: ProjectTodoItem): string {
    return todoIdOf(item);
  }

  titleOf(item: ProjectTodoItem): string {
    return item.kind === 'task' ? item.task.title : item.project.name;
  }

  kindLabel(item: ProjectTodoItem): string {
    return item.kind === 'task' ? 'Task' : 'Unit of work';
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

  /** The container to arrive at. A unit of work is its own destination and needs none. */
  fragmentOf(item: ProjectTodoItem): string | undefined {
    return item.kind === 'task' ? `section-${item.origin.sectionId}` : undefined;
  }

  async complete(item: ProjectTodoItem): Promise<void> {
    if (this.restoreBlocked()) return;
    const applied = await this.store.complete(item);
    if (!applied) return;
    // §39's progress may have moved, and a completed unit of work moves the work tree too.
    this.onProjectDataChange()();
    if (item.kind === 'subproject') this.onProjectHierarchyChange()();
  }
}
