import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { Task, TaskId } from '@cwm/contracts';
import { RouterLink } from '@angular/router';
import { taskMeta } from './task-meta';
import { Icon } from '../../shared/components/icon/icon';
import { isOverdue } from './task-overdue';

@Component({
  selector: 'app-task-row',
  imports: [Icon, RouterLink],
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
   * Separate from `pending`, which means "a completion toggle is in flight". A row can be waiting
   * on an archive while nothing about its completion is happening, and the two disable
   * different controls.
   */
  readonly archiving = input(false);
  /** A failed write on this row (Slice 75): shown under the title, named by the checkbox. */
  readonly error = input<string | null>(null);
  readonly now = input(Date.now());
  readonly readOnly = input(false);
  /** A projection opens its canonical section instead of selecting a local task (§34). */
  readonly link = input<{ route: string[]; fragment: string } | null>(null);

  readonly completionRequested = output<TaskId>();
  readonly reopenRequested = output<TaskId>();
  readonly selectedRequested = output<TaskId>();
  /** §34's reversible Delete, not layout chrome and not behind Edit Layout Mode (§32). */
  readonly deleteRequested = output<TaskId>();

  private readonly row = viewChild.required<ElementRef<HTMLElement>>('row');
  private gesture: {
    pointerType: string;
    x: number;
    y: number;
    anchor: Node | null;
    anchorOffset: number;
    focus: Node | null;
    focusOffset: number;
  } | null = null;

  readonly completed = computed(() => this.task().status === 'done');
  readonly errorId = computed(() => `task-error-${this.task().id}`);
  readonly shownError = computed(() => (this.readOnly() ? null : this.error()));
  readonly overdue = computed(() => isOverdue(this.task(), this.now()));
  readonly meta = computed(() => taskMeta(this.task(), { overdue: this.overdue(), completed: this.completed() }));
  readonly normal = computed(
    () =>
      !this.overdue() &&
      !this.completed() &&
      this.task().priority !== 'high' &&
      !this.selected() &&
      !this.compact(),
  );

  constructor() {
    // Capture before nested controls or a drag host consume the pointer gesture.
    effect((cleanup) => {
      const row = this.row().nativeElement;
      const record = (event: PointerEvent) => {
        const selection = row.ownerDocument.getSelection();
        this.gesture = {
          pointerType: event.pointerType,
          x: event.clientX,
          y: event.clientY,
          anchor: selection?.anchorNode ?? null,
          anchorOffset: selection?.anchorOffset ?? 0,
          focus: selection?.focusNode ?? null,
          focusOffset: selection?.focusOffset ?? 0,
        };
      };
      row.addEventListener('pointerdown', record, true);
      cleanup(() => row.removeEventListener('pointerdown', record, true));
    });
  }

  /** Emit a reversible completion intent, then restore the native checkbox to the model. */
  toggleCompletion(event: Event): void {
    if (!this.readOnly() && !this.pending()) {
      if (this.completed()) this.reopenRequested.emit(this.task().id);
      else this.completionRequested.emit(this.task().id);
    }
    (event.target as HTMLInputElement).checked = this.completed();
  }

  requestDelete(): void {
    if (this.readOnly()) return;
    if (!this.archiving()) this.deleteRequested.emit(this.task().id);
  }

  /** Native title-button activation is the keyboard path into this non-modal drawer. */
  selectTitle(event: MouseEvent): void {
    if (!this.readOnly() && !this.link() && !this.pointerMoved(event)) this.selectedRequested.emit(this.task().id);
  }

  /** A row background selects once, unless this pointer gesture dragged or selected text. */
  selectBackground(event: MouseEvent): void {
    if (this.readOnly() || this.link()) return;
    const row = this.row().nativeElement;
    if (event.target instanceof Element && event.target.closest('button, input, a, select, textarea, label')) {
      return;
    }
    if (this.pointerMoved(event)) return;
    const selection = row.ownerDocument.getSelection();
    const gesture = this.gesture;
    if (
      event.detail !== 0 && gesture && selection && !selection.isCollapsed &&
      (row.contains(selection.anchorNode) || row.contains(selection.focusNode)) &&
      (selection.anchorNode !== gesture.anchor || selection.anchorOffset !== gesture.anchorOffset ||
       selection.focusNode !== gesture.focus || selection.focusOffset !== gesture.focusOffset)
    ) return;
    this.selectedRequested.emit(this.task().id);
  }

  private pointerMoved(event: MouseEvent): boolean {
    const gesture = this.gesture;
    return event.detail !== 0 && gesture !== null &&
      (gesture.pointerType === 'mouse' || gesture.pointerType === 'pen') &&
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4;
  }
}
