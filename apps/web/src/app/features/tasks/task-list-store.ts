import { Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import type { ProjectId, Task, TaskId, TaskPriority, UpdateTaskInput } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';

type MutableTaskField = keyof Pick<
  Task,
  'title' | 'description' | 'status' | 'priority' | 'projectId' | 'parentTaskId' | 'startAt' | 'dueAt' | 'completedAt' | 'updatedAt'
>;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * §19's feature-scoped state for one project's tasks. Components send intent here; this is
 * the only tasks feature class that knows a gateway exists.
 *
 * Scoped to a project since Slice 8: the workspace-wide list and its project chooser were
 * Slice 7's temporary `/tasks` page, and every real task list now belongs to a project's
 * canvas. `ProjectPage` provides the single instance, and `ProjectPageStore.load` is the
 * only caller of `load`.
 */
@Injectable()
export class TaskListStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);

  private readonly tasksState = signal<Task[]>([]);
  private readonly projectIdState = signal<ProjectId | null>(null);
  private readonly selectedTaskIdState = signal<TaskId | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly loadFailedState = signal(false);
  private readonly completingIdsState = signal<ReadonlySet<TaskId>>(new Set());

  private revision = 0;
  private loadGeneration = 0;
  private readonly fieldRevisions = new Map<TaskId, Map<MutableTaskField, number>>();
  private readonly fieldQueues = new Map<string, Promise<void>>();

  readonly tasks = this.tasksState.asReadonly();
  readonly projectId = this.projectIdState.asReadonly();
  readonly selectedTaskId = this.selectedTaskIdState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /**
   * Whether the *list* is missing, as opposed to a mutation having failed. `error` carries
   * both — a blank quick-create title sets it just as an unreachable host does — so a
   * reader that needs to know "are these tasks trustworthy" has to ask this instead.
   */
  readonly loadFailed = this.loadFailedState.asReadonly();
  readonly completingIds = this.completingIdsState.asReadonly();
  readonly selectedTask = computed(() => {
    const id = this.selectedTaskIdState();
    return id === null ? null : (this.tasksState().find((task) => task.id === id) ?? null);
  });

  /** Archived tasks stay out — they are also outside the project header's progress count. */
  load(projectId: ProjectId): Promise<void> {
    // Switching projects faster than a round trip must not let the older answer land last.
    const generation = ++this.loadGeneration;
    return this.track(async () => {
      this.projectIdState.set(projectId);
      this.loadingState.set(true);
      this.errorState.set(null);
      this.loadFailedState.set(false);
      try {
        const tasks = await this.gateway.tasks.list({ projectId, includeArchived: false });
        if (generation !== this.loadGeneration) return;
        this.tasksState.set(tasks);
        const selectedTask = this.selectedTaskIdState();
        if (selectedTask !== null && !tasks.some(({ id }) => id === selectedTask)) {
          this.selectedTaskIdState.set(null);
        }
      } catch (error) {
        if (generation !== this.loadGeneration) return;
        this.tasksState.set([]);
        this.errorState.set(messageOf(error));
        this.loadFailedState.set(true);
      } finally {
        if (generation === this.loadGeneration) this.loadingState.set(false);
      }
    });
  }

  selectTask(id: TaskId | null): void {
    this.selectedTaskIdState.set(id);
  }

  create(rawTitle: string): Promise<boolean> {
    return this.track(async () => {
      const title = rawTitle.trim();
      const projectId = this.projectIdState();
      if (title === '') {
        this.errorState.set('A task title is required.');
        return false;
      }
      if (projectId === null) {
        this.errorState.set('Tasks cannot be created before the project loads.');
        return false;
      }

      this.errorState.set(null);
      try {
        const created = await this.gateway.tasks.create({ projectId, title });
        this.tasksState.update((tasks) => [...tasks, created]);
        this.selectedTaskIdState.set(created.id);
        return true;
      } catch (error) {
        this.errorState.set(messageOf(error));
        return false;
      }
    });
  }

  updateTitle(id: TaskId, rawTitle: string): Promise<boolean> {
    const title = rawTitle.trim();
    if (title === '') {
      this.errorState.set('A task title is required.');
      return Promise.resolve(false);
    }
    return this.updateFields(id, { title }, ['title', 'updatedAt']);
  }

  updatePriority(id: TaskId, priority: TaskPriority): Promise<boolean> {
    return this.updateFields(id, { priority }, ['priority', 'updatedAt']);
  }

  updateDueDate(id: TaskId, dueDate: string): Promise<boolean> {
    const dueAt = dueDate === '' ? null : `${dueDate}T23:59:59.999Z`;
    return this.updateFields(id, { dueAt }, ['dueAt', 'updatedAt']);
  }

  complete(id: TaskId): Promise<boolean> {
    return this.track(async () => {
      const previous = this.tasksState().find((task) => task.id === id);
      if (previous === undefined || previous.status === 'done') return false;

      this.errorState.set(null);
      const fields: MutableTaskField[] = ['status', 'completedAt', 'updatedAt'];
      const operationRevision = this.claim(id, fields);
      this.patch(id, { status: 'done' });
      this.completingIdsState.update((ids) => new Set([...ids, id]));

      try {
        const completed = await this.gateway.tasks.complete(id);
        this.patchCurrent(id, completed, fields, operationRevision);
        return true;
      } catch (error) {
        this.patchCurrent(id, previous, fields, operationRevision);
        this.errorState.set(messageOf(error));
        return false;
      } finally {
        this.completingIdsState.update((ids) => {
          const next = new Set(ids);
          next.delete(id);
          return next;
        });
      }
    });
  }

  private updateFields(
    id: TaskId,
    input: UpdateTaskInput,
    fields: MutableTaskField[],
  ): Promise<boolean> {
    // Edits to one field are ordered. Otherwise a newer failed title write can retain
    // ownership forever and suppress an older successful response, leaving the UI stale
    // until reload. Different fields still run independently (for example, title editing
    // does not wait behind a slow optimistic completion).
    const queueKey = `${id}:${fields[0]}`;
    return this.track(() =>
      this.enqueue(queueKey, async () => {
        this.errorState.set(null);
        const operationRevision = this.claim(id, fields);
        try {
          const updated = await this.gateway.tasks.update(id, input);
          this.patchCurrent(id, updated, fields, operationRevision);
          return true;
        } catch (error) {
          this.errorState.set(messageOf(error));
          return false;
        }
      }),
    );
  }

  private enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.fieldQueues.get(key) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.fieldQueues.set(key, tail);
    return result.finally(() => {
      if (this.fieldQueues.get(key) === tail) this.fieldQueues.delete(key);
    });
  }

  private claim(id: TaskId, fields: MutableTaskField[]): number {
    const revision = ++this.revision;
    const revisions = this.fieldRevisions.get(id) ?? new Map<MutableTaskField, number>();
    for (const field of fields) revisions.set(field, revision);
    this.fieldRevisions.set(id, revisions);
    return revision;
  }

  private patchCurrent(id: TaskId, source: Task, fields: MutableTaskField[], revision: number): void {
    const currentFields = fields.filter((field) => this.fieldRevisions.get(id)?.get(field) === revision);
    this.tasksState.update((tasks) =>
      tasks.map((task) => {
        if (task.id !== id) return task;
        const next = { ...task };
        for (const field of currentFields) {
          const value = source[field];
          if (value === undefined) delete next[field];
          else Object.assign(next, { [field]: value });
        }
        return next;
      }),
    );
  }

  private patch(id: TaskId, patch: Partial<Task>): void {
    this.tasksState.update((tasks) => tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    return operation().finally(settled);
  }
}
