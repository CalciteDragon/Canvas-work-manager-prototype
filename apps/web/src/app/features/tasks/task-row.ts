import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Task, TaskId } from '@cwm/contracts';

@Component({
  selector: 'app-task-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-row.html',
  styleUrl: './task-row.scss',
  host: { '[class]': '"task-row-host"' },
})
export class TaskRow {
  readonly task = input.required<Task>();
  readonly selected = input(false);
  readonly compact = input(false);
  readonly pending = input(false);
  /**
   * Separate from `pending`, which means "a completion is in flight". A row can be waiting
   * on an archive while nothing about its completion is happening, and the two disable
   * different controls.
   */
  readonly archiving = input(false);
  readonly now = input(Date.now());

  readonly completionRequested = output<TaskId>();
  readonly titleEdited = output<{ id: TaskId; title: string }>();
  readonly selectedRequested = output<TaskId>();
  /**
   * §34's per-row archive. A row affordance like complete, not layout chrome — so unlike
   * §31's remove control it is **not** behind Edit Layout Mode (§32).
   */
  readonly archiveRequested = output<TaskId>();

  readonly editing = signal(false);
  readonly draftTitle = signal('');
  readonly titleError = signal<string | null>(null);
  private readonly titleEditor = viewChild<ElementRef<HTMLInputElement>>('titleEditor');

  readonly completed = computed(() => this.task().status === 'done');
  readonly overdue = computed(() => {
    const value = this.task();
    return (
      value.dueAt !== undefined &&
      value.status !== 'done' &&
      value.status !== 'cancelled' &&
      Date.parse(value.dueAt) < this.now()
    );
  });
  readonly normal = computed(
    () =>
      !this.overdue() &&
      !this.completed() &&
      this.task().priority !== 'high' &&
      !this.selected() &&
      !this.compact(),
  );

  constructor() {
    // Editing swaps a button for an input. Moving focus with that swap makes the same
    // interaction work for keyboard and assistive-technology users, not only a mouse.
    effect(() => {
      if (this.editing()) this.titleEditor()?.nativeElement.focus();
    });
  }

  requestCompletion(): void {
    if (!this.completed() && !this.pending()) this.completionRequested.emit(this.task().id);
  }

  requestArchive(): void {
    if (!this.archiving()) this.archiveRequested.emit(this.task().id);
  }

  beginEditing(): void {
    this.draftTitle.set(this.task().title);
    this.titleError.set(null);
    this.editing.set(true);
  }

  updateDraft(value: string): void {
    this.draftTitle.set(value);
    this.titleError.set(null);
  }

  commitTitle(): void {
    const title = this.draftTitle().trim();
    if (title === '') {
      this.titleError.set('A task title is required.');
      return;
    }
    if (title !== this.task().title) this.titleEdited.emit({ id: this.task().id, title });
    this.editing.set(false);
  }

  cancelEditing(): void {
    this.titleError.set(null);
    this.editing.set(false);
  }
}
