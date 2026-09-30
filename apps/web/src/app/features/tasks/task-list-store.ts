import { Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import type { ProjectId, ProjectSection, SectionId, Task, TaskId, TaskPriority, TaskWriteResult, UpdateTaskInput } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { OPERATION_HISTORY_REPORTER, reportedWrite, type OperationWriteReport } from '../../core/history/operation-history-reporter';

type MutableTaskField = keyof Pick<
  Task,
  'title' | 'description' | 'status' | 'priority' | 'estimate' | 'projectId' | 'sectionId' | 'parentTaskId' | 'startAt' | 'dueAt' | 'completedAt' | 'updatedAt'
>;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * A task write's report names the **task's** project, from the response: a list inside a Home
 * shortcut writes a row its source sub-project owns, and the header decides ownership from the
 * receipt's history anyway (Slice 41).
 */
const taskReport = ({ task, operation }: TaskWriteResult): OperationWriteReport => ({ projectId: task.projectId, receipt: operation });

/**
 * §19's feature-scoped state for **one Task List section's** tasks. Components send intent
 * here; this is the only tasks feature class that knows a gateway exists.
 *
 * Scoped to a section, not to the page. It was page-scoped precisely so two Task List
 * sections could not drift — under
 * docs/decisions/2026-09-sections-own-their-data.md they *must* differ, because a
 * `task-list` owns its rows rather than querying the project's. `TaskListSection` provides
 * one instance each and syncs it against the page's data revision, the way
 * `ReflectionsSection` already did.
 */
@Injectable()
export class TaskListStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly reporter = inject(OPERATION_HISTORY_REPORTER);

  private readonly tasksState = signal<Task[]>([]);
  private readonly projectIdState = signal<ProjectId | null>(null);
  private readonly sectionIdState = signal<SectionId | null>(null);
  private readonly selectedTaskIdState = signal<TaskId | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly loadFailedState = signal(false);
  private readonly completingIdsState = signal<ReadonlySet<TaskId>>(new Set());
  private readonly archivingIdsState = signal<ReadonlySet<TaskId>>(new Set());

  private revision = 0;
  private loadGeneration = 0;
  /**
   * How many optimistic writes are in flight. §62's refresh waits behind them: a live frame
   * for this project arrives *before* the tab's own mutation response does (the host flushes
   * at commit), so a refresh that ran immediately would overwrite the preview a `complete`
   * or a title edit had already painted.
   *
   * `fieldRevisions` cannot answer this question — `claim` only ever adds to it, so "has a
   * revision" means "was edited at some point", and a guard built on it would leave every
   * field the user has ever touched permanently stale.
   */
  private pendingMutations = 0;
  private refreshQueued = false;
  private readonly fieldRevisions = new Map<TaskId, Map<MutableTaskField, number>>();
  private readonly fieldQueues = new Map<string, Promise<void>>();

  readonly tasks = this.tasksState.asReadonly();
  readonly projectId = this.projectIdState.asReadonly();
  readonly sectionId = this.sectionIdState.asReadonly();
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
  readonly archivingIds = this.archivingIdsState.asReadonly();
  readonly selectedTask = computed(() => {
    const id = this.selectedTaskIdState();
    return id === null ? null : (this.tasksState().find((task) => task.id === id) ?? null);
  });

  /**
   * Archived tasks stay out — they are also outside the project header's progress count.
   *
   * Keyed by the section, not the project: this list renders what its own container owns.
   * The project comes along because creating a task still names one.
   */
  load(section: ProjectSection): Promise<void> {
    // Switching projects faster than a round trip must not let the older answer land last.
    const generation = ++this.loadGeneration;
    // Counted alongside the writes: a live frame arriving mid-load must queue behind it, or
    // the two reads race and whichever lands last wins. `refresh` cannot simply claim a
    // newer `loadGeneration` instead — that number is how `load` recognises its own answer,
    // and bumping it here would make every load discard its own result.
    return this.track(() => this.mutating(async () => {
      this.projectIdState.set(section.projectId);
      this.sectionIdState.set(section.id);
      this.loadingState.set(true);
      this.errorState.set(null);
      this.loadFailedState.set(false);
      try {
        const tasks = await this.gateway.tasks.list({ sectionId: section.id, includeArchived: false });
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
    }));
  }

  /**
   * §62's quiet re-read: same request as `load`, none of its chrome.
   *
   * It never touches `loading`, `error` or `loadFailed`, because an agent's write must not
   * flicker a skeleton over a page the user is reading — nor, if the host blinks, replace it
   * with an error nobody caused. A failed refresh simply leaves the rendered list alone
   * until the next frame.
   */
  /**
   * What the section calls on every data revision: a full load the first time or when the
   * frame is pointed at a different section, and the quiet re-read otherwise.
   */
  sync(section: ProjectSection): Promise<void> {
    if (this.sectionIdState() !== section.id) return this.load(section);
    return this.refresh();
  }

  refresh(): Promise<void> {
    if (this.sectionIdState() === null) return Promise.resolve();
    if (this.pendingMutations > 0) {
      // Coalesced: a burst of frames costs one re-read, taken once the writes settle.
      this.refreshQueued = true;
      return Promise.resolve();
    }

    const generation = this.loadGeneration;
    const sectionId = this.sectionIdState();
    if (sectionId === null) return Promise.resolve();

    return this.track(async () => {
      try {
        const tasks = await this.gateway.tasks.list({ sectionId, includeArchived: false });
        // The same guard `load` uses: a refresh crossing a section switch must not drop
        // one list's tasks under another's frame.
        if (generation !== this.loadGeneration) return;
        // A write started *underneath* this read, so the answer in hand is already behind
        // the optimistic state. Re-queue rather than discard: dropping it silently loses the
        // agent's change until some unrelated frame happens along.
        if (this.pendingMutations > 0) {
          this.refreshQueued = true;
          return;
        }
        this.tasksState.set(tasks);
        // A quiet read must not erase a mutation error, but it can heal the stale load error
        // that said no list existed before the connection came back.
        if (this.loadFailedState()) {
          this.errorState.set(null);
          this.loadFailedState.set(false);
        }
      } catch {
        // Quiet, by design — see the doc comment.
      }
    });
  }

  selectTask(id: TaskId | null): void {
    this.selectedTaskIdState.set(id);
  }

  create(rawTitle: string): Promise<boolean> {
    return this.track(() => this.mutating(async () => {
      const title = rawTitle.trim();
      const projectId = this.projectIdState();
      const sectionId = this.sectionIdState();
      if (title === '') {
        this.errorState.set('A task title is required.');
        return false;
      }
      if (projectId === null || sectionId === null) {
        this.errorState.set('Tasks cannot be created before the section loads.');
        return false;
      }

      this.errorState.set(null);
      try {
        // Named, not resolved: this list owns the row, and the domain would otherwise send
        // it to the project's *first* task list, which may well be a different one.
        const { task } = await reportedWrite(this.reporter, () => this.gateway.tasks.create({ projectId, title, sectionId }), taskReport);
        this.tasksState.update((tasks) => [...tasks, task]);
        this.selectedTaskIdState.set(task.id);
        return true;
      } catch (error) {
        this.errorState.set(messageOf(error));
        return false;
      }
    }));
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

  updateEstimate(id: TaskId, estimate: number | null): Promise<boolean> {
    return this.updateFields(id, { estimate }, ['estimate', 'updatedAt']);
  }

  complete(id: TaskId): Promise<boolean> {
    return this.track(() => this.mutating(async () => {
      const previous = this.tasksState().find((task) => task.id === id);
      if (previous === undefined || previous.status === 'done') return false;

      this.errorState.set(null);
      const fields: MutableTaskField[] = ['status', 'completedAt', 'updatedAt'];
      const operationRevision = this.claim(id, fields);
      this.patch(id, { status: 'done' });
      this.completingIdsState.update((ids) => new Set([...ids, id]));

      try {
        const { task } = await reportedWrite(this.reporter, () => this.gateway.tasks.complete(id), taskReport);
        this.patchCurrent(id, task, fields, operationRevision);
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
    }));
  }

  /**
   * Takes a task from another container into this one — the operation two Task Lists exist
   * for, and the reason they may now hold different rows at all.
   *
   * The **receiving** list drives it, because it is the one that knows the destination and
   * the one that must show the row afterwards. The list it came from re-reads on the data
   * revision the drop publishes; nothing here reaches into another store.
   */
  receive(id: TaskId, sectionId: SectionId): Promise<boolean> {
    return this.track(() => this.mutating(async () => {
      if (this.sectionIdState() !== sectionId) return false;
      if (this.tasksState().some((task) => task.id === id)) return false;

      this.errorState.set(null);
      try {
        const { task } = await reportedWrite(this.reporter, () => this.gateway.tasks.update(id, { sectionId }), taskReport);
        this.tasksState.update((tasks) => [...tasks, task]);
        return true;
      } catch (error) {
        this.errorState.set(messageOf(error));
        return false;
      }
    }));
  }

  /**
   * §34's per-row archive, which the domain has had since the ownership phase and no UI
   * called. It takes the row's live subtasks with it, and the root Archive page is the undo.
   *
   * Not optimistic, unlike `complete`. Although `TaskGateway.archive` returns the archived
   * root row and operation receipt, the list re-reads to reconcile every affected descendant;
   * a failure leaves the row exactly where it was with the reason on `error`.
   */
  archive(id: TaskId): Promise<boolean> {
    return this.track(() => this.mutating(async () => {
      if (!this.tasksState().some((task) => task.id === id)) return false;

      this.errorState.set(null);
      this.archivingIdsState.update((ids) => new Set([...ids, id]));
      try {
        await reportedWrite(this.reporter, () => this.gateway.tasks.archive(id), taskReport);
        return true;
      } catch (error) {
        this.errorState.set(messageOf(error));
        return false;
      } finally {
        this.archivingIdsState.update((ids) => {
          const next = new Set(ids);
          next.delete(id);
          return next;
        });
      }
    })).then(async (archived) => {
      // Outside `mutating`, or the re-read would queue behind the write that just finished
      // and never run.
      if (archived) await this.refresh();
      return archived;
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
      this.enqueue(queueKey, () => this.mutating(async () => {
        this.errorState.set(null);
        const operationRevision = this.claim(id, fields);
        try {
          const { task } = await reportedWrite(this.reporter, () => this.gateway.tasks.update(id, input), taskReport);
          this.patchCurrent(id, task, fields, operationRevision);
          return true;
        } catch (error) {
          this.errorState.set(messageOf(error));
          return false;
        }
      })),
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

  /** Marks an optimistic write in flight, and runs any refresh that arrived while it was. */
  private mutating<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingMutations += 1;
    return operation().finally(() => {
      this.pendingMutations -= 1;
      if (this.pendingMutations === 0 && this.refreshQueued) {
        this.refreshQueued = false;
        void this.refresh();
      }
    });
  }
}
