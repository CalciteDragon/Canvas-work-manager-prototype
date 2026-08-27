import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ProjectIdSchema, type TaskId, type TaskPriority } from '@cwm/contracts';
import { TaskDetailDrawer } from './task-detail-drawer';
import { TaskListStore } from './task-list-store';
import { TaskRow } from './task-row';

@Component({
  selector: 'app-tasks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TaskRow, TaskDetailDrawer],
  providers: [TaskListStore],
  templateUrl: './tasks-page.html',
  styleUrl: './tasks-page.scss',
})
export class TasksPage implements OnInit {
  readonly store = inject(TaskListStore);

  ngOnInit(): void {
    void this.store.load();
  }

  async quickCreate(event: SubmitEvent, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    if (await this.store.create(input.value)) input.value = '';
  }

  chooseProject(value: string): void {
    const id = ProjectIdSchema.safeParse(value);
    if (id.success) this.store.chooseProject(id.data);
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
}
