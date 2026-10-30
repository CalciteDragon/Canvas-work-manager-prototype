import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Icon } from '../../shared/components/icon/icon';
import { TaskPrioritySchema, type Task, type TaskId, type TaskPriority } from '@cwm/contracts';
import { isOverdue } from './task-overdue';
import type { TaskDrawerField, TaskFieldSave, TaskFieldSaves } from './task-write-state';

const FIELD_NAMES: Record<TaskDrawerField, string> = { title: 'Title', priority: 'Priority', dueAt: 'Due date', estimate: 'Estimate' };

/** What a field's own write says beside its label (Slice 75). */
const statusText = (save: TaskFieldSave): string =>
  save.state === 'saving' ? 'Saving…' : save.state === 'saved' ? 'Saved' : save.failure.sentence;

@Component({
  imports: [Icon],
  selector: 'app-task-detail-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail-drawer.html',
  styleUrl: './task-detail-drawer.scss',
})
export class TaskDetailDrawer {
  readonly task = input.required<Task>();
  readonly modal = input(false);
  readonly contained = input(false);
  /** The selected task's fields with a write in flight, saved, or refused (Slice 75). */
  readonly saveStates = input<TaskFieldSaves>({});
  readonly now = input(Date.now());
  readonly titleChanged = output<{ id: TaskId; title: string }>();
  readonly priorityChanged = output<{ id: TaskId; priority: TaskPriority }>();
  readonly dueDateChanged = output<{ id: TaskId; dueDate: string }>();
  readonly estimateChanged = output<{ id: TaskId; estimate: number | null }>();
  readonly closed = output<void>();

  readonly priorities = TaskPrioritySchema.options;
  readonly dueDate = computed(() => this.task().dueAt?.slice(0, 10) ?? '');
  readonly overdue = computed(() => isOverdue(this.task(), this.now()));
  /**
   * The field status to show, if any. The drawer's own blank-title refusal outranks a title
   * save failure, so one field never carries two alerts. A failure's `reason` is for its Details
   * (Slice 78), never the status text.
   */
  readonly fieldStatus = computed(() => {
    const saves = this.saveStates();
    const blankTitle = this.titleError() !== null;
    return (field: TaskDrawerField): { text: string; state: TaskFieldSave['state']; id: string; reason: string | null } | null => {
      const save = saves[field];
      if (save === undefined || (field === 'title' && blankTitle)) return null;
      const reason = save.state === 'failed' ? save.failure.reason : null;
      return { text: statusText(save), state: save.state, id: `task-field-status-${this.task().id}-${field}`, reason };
    };
  });
  /** One polite sentence for the field that changed last; failures and saves alike. */
  readonly announcement = computed(() => {
    const saves = this.saveStates();
    // The store orders saves by recency. While the latest field is saving the region is empty, so
    // the same field saved twice is said twice.
    const field = (Object.keys(saves) as TaskDrawerField[]).at(-1);
    if (field === undefined || saves[field]!.state === 'saving') return '';
    const save = saves[field]!;
    return save.state === 'saved' ? `${FIELD_NAMES[field]} saved.` : `${FIELD_NAMES[field]}: ${statusText(save)}`;
  });
  readonly draft = signal('');
  readonly titleError = signal<string | null>(null);
  private baseTitle = '';
  private titleTaskId: TaskId | null = null;
  private lastEmitted: string | null = null;
  private readonly surface = viewChild.required<ElementRef<HTMLDialogElement>>('surface');
  private nativeOpen = false;

  /** The native lift, shared by desktop's manual popover and the phone's modal sheet. */
  get element(): HTMLDialogElement {
    return this.surface().nativeElement;
  }

  /** Open in the browser top layer; the Design Lab keeps its contained specimen in flow. */
  open(): void {
    if (this.contained() || this.nativeOpen) return;
    if (this.modal()) this.element.showModal();
    else this.element.showPopover();
    this.nativeOpen = true;
  }

  /** Close before clearing selection so native focus restoration precedes our shared rule. */
  hide(): void {
    if (!this.nativeOpen) return;
    this.nativeOpen = false;
    if (this.modal()) this.element.close();
    else if (this.element.isConnected) this.element.hidePopover();
  }

  escape(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }

  constructor() {
    effect(() => {
      const task = this.task();
      // A refused title write reverts the task (Slice 75); the draft it refused stays, dirty, for
      // an explicit retry rather than following the reverted value.
      const titleRefused = this.saveStates().title?.state === 'failed';
      untracked(() => {
        if (task.id !== this.titleTaskId) {
          this.titleTaskId = task.id;
          this.draft.set(task.title);
          this.baseTitle = task.title;
          this.titleError.set(null);
          this.lastEmitted = null;
        } else if (task.title === this.draft()) {
          this.baseTitle = task.title;
        } else if (titleRefused && this.draft() === this.lastEmitted) {
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
      this.titleError.set('Enter a task title.');
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
    event.preventDefault();
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
