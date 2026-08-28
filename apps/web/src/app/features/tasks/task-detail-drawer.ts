import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TaskPrioritySchema, type Task, type TaskId, type TaskPriority } from '@cwm/contracts';

@Component({
  selector: 'app-task-detail-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail-drawer.html',
  styleUrl: './task-detail-drawer.scss',
})
export class TaskDetailDrawer {
  readonly task = input.required<Task>();
  readonly priorityChanged = output<{ id: TaskId; priority: TaskPriority }>();
  readonly dueDateChanged = output<{ id: TaskId; dueDate: string }>();
  readonly estimateChanged = output<{ id: TaskId; estimate: number | null }>();
  readonly closed = output<void>();

  readonly priorities = TaskPrioritySchema.options;
  readonly dueDate = computed(() => this.task().dueAt?.slice(0, 10) ?? '');

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
