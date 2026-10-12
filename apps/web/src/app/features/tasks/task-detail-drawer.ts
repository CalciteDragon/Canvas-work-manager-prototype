import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TaskPrioritySchema, type Task, type TaskId, type TaskPriority } from '@cwm/contracts';

@Component({
  selector: 'app-task-detail-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail-drawer.html',
  styleUrl: './task-detail-drawer.scss',
})
export class TaskDetailDrawer {
  readonly task = input.required<Task>();
  readonly titleChanged = output<{ id: TaskId; title: string }>();
  readonly priorityChanged = output<{ id: TaskId; priority: TaskPriority }>();
  readonly dueDateChanged = output<{ id: TaskId; dueDate: string }>();
  readonly estimateChanged = output<{ id: TaskId; estimate: number | null }>();
  readonly closed = output<void>();

  readonly priorities = TaskPrioritySchema.options;
  readonly dueDate = computed(() => this.task().dueAt?.slice(0, 10) ?? '');
  readonly draft = signal('');
  readonly titleError = signal<string | null>(null);
  private baseTitle = '';
  private titleTaskId: TaskId | null = null;
  private lastEmitted: string | null = null;

  constructor() {
    effect(() => {
      const task = this.task();
      untracked(() => {
        if (task.id !== this.titleTaskId) {
          this.titleTaskId = task.id;
          this.draft.set(task.title);
          this.baseTitle = task.title;
          this.titleError.set(null);
          this.lastEmitted = null;
        } else if (task.title === this.draft()) {
          this.baseTitle = task.title;
        } else if (this.draft() === this.baseTitle) {
          this.draft.set(task.title);
          this.baseTitle = task.title;
        }
      });
    });
  }

  updateDraft(title: string): void {
    this.draft.set(title);
    this.titleError.set(null);
  }

  /** Blur suppresses a duplicate commit; explicit Enter remains the retry after a refusal. */
  commitTitle(fromBlur = false): void {
    const title = this.draft().trim();
    if (title === '') {
      this.titleError.set('A task title is required.');
      return;
    }
    this.titleError.set(null);
    this.draft.set(title);
    if (title === this.task().title) {
      this.baseTitle = title;
      return;
    }
    if (fromBlur && title === this.lastEmitted) return;
    this.lastEmitted = title;
    this.titleChanged.emit({ id: this.task().id, title });
  }

  /** Discard a local dirty draft before allowing Escape to close the drawer. */
  escapeTitle(event: Event): void {
    if (this.draft() === this.baseTitle) return;
    this.draft.set(this.task().title);
    this.baseTitle = this.task().title;
    this.titleError.set(null);
    event.stopPropagation();
  }

  changePriority(priority: TaskPriority): void {
    this.priorityChanged.emit({ id: this.task().id, priority });
  }

  changeDueDate(dueDate: string): void {
    this.dueDateChanged.emit({ id: this.task().id, dueDate });
  }

  changeEstimate(value: string): void {
    this.estimateChanged.emit({ id: this.task().id, estimate: value === '' ? null : Number(value) });
  }
}
