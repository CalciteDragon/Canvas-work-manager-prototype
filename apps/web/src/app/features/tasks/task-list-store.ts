import { Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import type { ProjectId, ProjectSection, SectionId, Task, TaskId, TaskPriority, TaskWriteResult, UpdateTaskInput } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { OPERATION_HISTORY_REPORTER, reportedWrite, type OperationWriteReport } from '../../core/history/operation-history-reporter';
import { readFailure, type Failure } from '../../shared/feedback/failure';
import type { PendingTaskCreate, TaskCreateOutcome, TaskDrawerField, TaskFieldSave, TaskFieldSaves } from './task-write-state';

type MutableTaskField = keyof Pick<
  Task,
  'title' | 'description' | 'status' | 'priority' | 'estimate' | 'projectId' | 'sectionId' | 'parentTaskId' | 'startAt' | 'dueAt' | 'completedAt' | 'updatedAt'
>;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const readFailed = (error: unknown): Failure => readFailure(error, 'this task list');

/** Slice 75's failure copy: what did not happen, to which task, and what to do. */
const failedOn = (verb: string, title: string, error: unknown): string => `Couldn’t ${verb} “${title}”. Try again. ${messageOf(error)}`;

const fieldKey = (id: TaskId, field: TaskDrawerField): string => `${id}:${field}`;

/** The task as an update would leave it: `null` clears an optional field. */
const withInput = (task: Task, input: UpdateTaskInput): Task => {
  const next: Record<string, unknown> = { ...task };
  for (const [name, value] of Object.entries(input)) {
    if (value === null) delete next[name];
    else if (value !== undefined) next[name] = value;
  }
  return next as Task;
};

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
  /**
   * The committed Delete receipt for one archived task, retained for the owning section's
   * toast. Kept per task so replies arriving out of order cannot hand one row's toast
   * another row's Undo.
   */
  archiveReport(id: TaskId): OperationWriteReport | null { return this.archiveReports.get(id) ?? null; }
  private readonly archiveReports = new Map<TaskId, OperationWriteReport>();
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly reporter = inject(OPERATION_HISTORY_REPORTER);

  private readonly tasksState = signal<Task[]>([]);
  private readonly projectIdState = signal<ProjectId | null>(null);
  private readonly sectionIdState = signal<SectionId | null>(null);
  private readonly selectedTaskIdState = signal<TaskId | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<Failure | null>(null);
  private readonly receiveErrorState = signal<string | null>(null);
  /** What `load` was last asked for, so Try again can ask it again. */
  private requested: ProjectSection | null = null;
  private readonly completingIdsState = signal<ReadonlySet<TaskId>>(new Set());
  private readonly archivingIdsState = signal<ReadonlySet<TaskId>>(new Set());
  private readonly pendingCreateState = signal<PendingTaskCreate | null>(null);
  private readonly createErrorState = signal<string | null>(null);
  private readonly rowErrorsState = signal<ReadonlyMap<TaskId, string>>(new Map());
  private readonly fieldSavesState = signal<ReadonlyMap<string, { id: TaskId; field: TaskDrawerField; save: TaskFieldSave }>>(new Map());
  private createKey = 0;
  /**
   * The server's value for each field with an edit in flight, keyed `id:field`. A failed edit
   * reverts to this rather than to whatever the screen showed when it started, which may have
   * been an earlier edit that failed too.
   */
  private readonly confirmedFields = new Map<string, { task: Task; pending: number }>();

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
  /**
   * The *list* is missing: the read failed (Slice 78). Kept apart from every write failure, so a
   * write never replaces it and it never clears one. Row, field and quick-add failures have their
   * own signals (Slice 75).
   */
  readonly error = this.errorState.asReadonly();
  /** A task dragged in from another list did not move here; it shares the section banner (§34). */
  readonly receiveError = this.receiveErrorState.asReadonly();
  /** The rows with a completion toggle in flight. */
  readonly completingIds = this.completingIdsState.asReadonly();
  readonly archivingIds = this.archivingIdsState.asReadonly();
  /** The quick-add waiting on the server, rendered as a pending row (Slice 75). */
  readonly pendingCreate = this.pendingCreateState.asReadonly();
  /** Why the last quick-add did not happen, shown beside the add field. */
  readonly createError = this.createErrorState.asReadonly();
  /** A failed complete, reopen or Delete, kept on its own row until that row is tried again. */
  readonly rowErrors = this.rowErrorsState.asReadonly();
  /** The selected task's drawer fields that are saving, saved or failed. */
  readonly selectedFieldSaves = computed<TaskFieldSaves>(() => {
    const id = this.selectedTaskIdState();
    const saves: TaskFieldSaves = {};
    for (const entry of this.fieldSavesState().values()) if (entry.id === id) saves[entry.field] = entry.save;
    return saves;
  });

  /** Typing answers an empty-title refusal; a failed add keeps its message until the next add. */
  clearTitleRefusal(): void {
    if (this.createErrorState() === 'Enter a task title.') this.createErrorState.set(null);
  }

  fieldSave(id: TaskId, field: TaskDrawerField): TaskFieldSave | null {
    return this.fieldSavesState().get(fieldKey(id, field))?.save ?? null;
  }
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
      // A re-read of the same section keeps its failure on screen until it answers (Slice 78).
      if (this.sectionIdState() !== section.id) this.errorState.set(null);
      this.requested = section;
      this.projectIdState.set(section.projectId);
      this.sectionIdState.set(section.id);
      this.loadingState.set(true);
      this.receiveErrorState.set(null);
      // A new container starts with none of the old one's writes on screen.
      this.pendingCreateState.set(null);
      this.createErrorState.set(null);
      this.rowErrorsState.set(new Map());
      this.fieldSavesState.set(new Map());
      try {
        const tasks = await this.gateway.tasks.list({ sectionId: section.id, includeArchived: false });
        if (generation !== this.loadGeneration) return;
        this.tasksState.set(tasks);
        this.errorState.set(null);
        const selectedTask = this.selectedTaskIdState();
        if (selectedTask !== null && !tasks.some(({ id }) => id === selectedTask)) {
          this.selectedTaskIdState.set(null);
        }
      } catch (error) {
        if (generation !== this.loadGeneration) return;
        this.tasksState.set([]);
        this.errorState.set(readFailed(error));
      } finally {
        if (generation === this.loadGeneration) this.loadingState.set(false);
      }
    }));
  }

  /** The failed read's Try again: the same load, which keeps the failure until it answers. */
  retry(): Promise<void> {
    return this.requested === null ? Promise.resolve() : this.load(this.requested);
  }

  /** A successful write after a failed read starts a full read, which clears the failure (L4-027). */
  private rereadAfterWrite(): void {
    if (this.errorState() !== null) void this.retry();
  }

  /**
   * §62's quiet re-read: same request as `load`, none of its chrome.
   *
   * It never touches `loading`, and never sets `error`, because an agent's write must not
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
        // A row error for a task that has left the list has nothing left to describe.
        if ([...this.rowErrorsState().keys()].some((id) => !tasks.some((task) => task.id === id))) {
          this.rowErrorsState.update((errors) => new Map([...errors].filter(([id]) => tasks.some((task) => task.id === id))));
        }
        const selectedTask = this.selectedTaskIdState();
        if (selectedTask !== null && !tasks.some(({ id }) => id === selectedTask)) {
          this.selectedTaskIdState.set(null);
        }
        // A quiet read must not erase a mutation error, but it can heal the stale load error
        // that said no list existed before the connection came back.
        this.errorState.set(null);
      } catch {
        // Quiet, by design — see the doc comment.
      }
    });
  }

  selectTask(id: TaskId | null): void {
    // A settled Saved belongs to the moment it was said; reopening a drawer must not replay it.
    if (id !== this.selectedTaskIdState() && [...this.fieldSavesState().values()].some(({ save }) => save.state === 'saved')) {
      this.fieldSavesState.update((saves) => new Map([...saves].filter(([, { save }]) => save.state !== 'saved')));
    }
    this.selectedTaskIdState.set(id);
  }

  /**
   * Quick-add (§34, Slice 75). The pending row paints synchronously, a second submit is refused
   * while one is out, and a failure owes a read (§63): a write that failed in transit may still
   * have committed, and handing the title back without looking would let a retry duplicate it.
   * The read counts the add as committed only for a task with this title that was not in the
   * list at submit.
   */
  create(rawTitle: string): Promise<TaskCreateOutcome> {
    const title = rawTitle.trim();
    if (title === '') {
      this.createErrorState.set('Enter a task title.');
      return Promise.resolve('refused');
    }
    if (this.pendingCreateState() !== null) return Promise.resolve('refused');
    const projectId = this.projectIdState();
    const sectionId = this.sectionIdState();
    if (projectId === null || sectionId === null) {
      this.createErrorState.set('Tasks cannot be created before the section loads.');
      return Promise.resolve('refused');
    }

    const generation = this.loadGeneration;
    const pending: PendingTaskCreate = { key: ++this.createKey, title };
    const known = new Set(this.tasksState().map(({ id }) => id));
    this.createErrorState.set(null);
    this.pendingCreateState.set(pending);
    const ours = () => generation === this.loadGeneration && this.pendingCreateState() === pending;

    return this.track(() => this.mutating(async (): Promise<TaskCreateOutcome> => {
      try {
        // Named, not resolved: this list owns the row, and the domain would otherwise send
        // it to the project's *first* task list, which may well be a different one.
        const { task } = await reportedWrite(this.reporter, () => this.gateway.tasks.create({ projectId, title, sectionId }), taskReport);
        if (!ours()) return 'stale';
        this.tasksState.update((tasks) => (tasks.some(({ id }) => id === task.id) ? tasks : [...tasks, task]));
        this.pendingCreateState.set(null);
        this.rereadAfterWrite();
        return 'added';
      } catch (error) {
        if (!ours()) return 'stale';
        try {
          const tasks = await this.gateway.tasks.list({ sectionId, includeArchived: false });
          if (!ours()) return 'stale';
          this.pendingCreateState.set(null);
          const committed = tasks.find((task) => task.title === title && !known.has(task.id));
          if (this.pendingMutations > 1) {
            // Other writes are in flight, so their rows keep their optimistic paint: only a
            // committed row is merged, and the rest of the read waits for the queued refresh.
            this.refreshQueued = true;
            if (committed !== undefined) this.tasksState.update((current) => (current.some(({ id }) => id === committed.id) ? current : [...current, committed]));
          } else {
            this.tasksState.set(tasks);
            this.errorState.set(null);
          }
          if (committed !== undefined) return 'added';
          this.createErrorState.set(`Couldn’t add “${title}”. Try again. ${messageOf(error)}`);
          return 'failed';
        } catch {
          if (!ours()) return 'stale';
          this.pendingCreateState.set(null);
          this.createErrorState.set(`Couldn’t confirm “${title}” was added. Check the list before adding it again.`);
          return 'unconfirmed';
        }
      }
    }));
  }

  updateTitle(id: TaskId, rawTitle: string): Promise<boolean> {
    const title = rawTitle.trim();
    if (title === '') {
      this.setFieldSave(id, 'title', { state: 'failed', message: 'Enter a task title.' });
      return Promise.resolve(false);
    }
    return this.updateFields(id, 'title', { title }, ['title', 'updatedAt']);
  }

  updatePriority(id: TaskId, priority: TaskPriority): Promise<boolean> {
    return this.updateFields(id, 'priority', { priority }, ['priority', 'updatedAt']);
  }

  updateDueDate(id: TaskId, dueDate: string): Promise<boolean> {
    const dueAt = dueDate === '' ? null : `${dueDate}T23:59:59.999Z`;
    return this.updateFields(id, 'dueAt', { dueAt }, ['dueAt', 'updatedAt']);
  }

  updateEstimate(id: TaskId, estimate: number | null): Promise<boolean> {
    return this.updateFields(id, 'estimate', { estimate }, ['estimate', 'updatedAt']);
  }

  complete(id: TaskId): Promise<boolean> {
    return this.track(() => this.mutating(async () => {
      const previous = this.tasksState().find((task) => task.id === id);
      if (previous === undefined || previous.status === 'done' || this.completingIdsState().has(id)) return false;
      const generation = this.loadGeneration;

      this.setRowError(id, null);
      const fields: MutableTaskField[] = ['status', 'completedAt', 'updatedAt'];
      const operationRevision = this.claim(id, fields);
      this.patch(id, { status: 'done' });
      this.completingIdsState.update((ids) => new Set([...ids, id]));

      try {
        const { task } = await reportedWrite(this.reporter, () => this.gateway.tasks.complete(id), taskReport);
        if (generation !== this.loadGeneration) return false;
        this.patchCurrent(id, task, fields, operationRevision);
        return true;
      } catch (error) {
        if (generation !== this.loadGeneration) return false;
        this.patchCurrent(id, previous, fields, operationRevision);
        this.setRowError(id, failedOn('complete', previous.title, error));
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

  /** Optimistically reopens a done task; a failure restores its exact completion timestamp. */
  reopen(id: TaskId): Promise<boolean> {
    return this.track(() => this.mutating(async () => {
      const previous = this.tasksState().find((task) => task.id === id);
      if (previous === undefined || previous.status !== 'done' || this.completingIdsState().has(id)) return false;
      const generation = this.loadGeneration;

      this.setRowError(id, null);
      const fields: MutableTaskField[] = ['status', 'completedAt', 'updatedAt'];
      const operationRevision = this.claim(id, fields);
      const optimistic = { ...previous, status: 'todo' as const };
      delete optimistic.completedAt;
      this.patchCurrent(id, optimistic, fields, operationRevision);
      this.completingIdsState.update((ids) => new Set([...ids, id]));

      try {
        const { task } = await reportedWrite(this.reporter, () => this.gateway.tasks.update(id, { status: 'todo' }), taskReport);
        if (generation !== this.loadGeneration) return false;
        this.patchCurrent(id, task, fields, operationRevision);
        return true;
      } catch (error) {
        if (generation !== this.loadGeneration) return false;
        this.patchCurrent(id, previous, fields, operationRevision);
        this.setRowError(id, failedOn('reopen', previous.title, error));
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

      this.receiveErrorState.set(null);
      try {
        const { task } = await reportedWrite(this.reporter, () => this.gateway.tasks.update(id, { sectionId }), taskReport);
        this.tasksState.update((tasks) => [...tasks, task]);
        this.rereadAfterWrite();
        return true;
      } catch (error) {
        // Raw until Stage 4 gives the write failures their Details (Slice 78).
        this.receiveErrorState.set(messageOf(error));
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
      const archived = this.tasksState().find((task) => task.id === id);
      if (archived === undefined) return false;

      this.setRowError(id, null);
      this.archivingIdsState.update((ids) => new Set([...ids, id]));
      try {
        const result = await reportedWrite(this.reporter, () => this.gateway.tasks.archive(id),
          value => ({ ...taskReport(value), feedback: 'own' }));
        this.archiveReports.set(id, { ...taskReport(result), feedback: 'own' });
        return true;
      } catch (error) {
        this.setRowError(id, failedOn('delete', archived.title, error));
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

  /**
   * A drawer field edit (Slice 75, §63): claimed and painted at call time, so the row and the
   * drawer agree while it waits, and counted as in flight at call time too, so a live re-read
   * cannot repaint the old value behind it. Edits to one field are still sent in order: a newer
   * failed write must not let an older answer go unapplied. A failure reverts to the field's
   * last server-confirmed value, never to an earlier edit that failed as well.
   */
  private updateFields(
    id: TaskId,
    field: TaskDrawerField,
    input: UpdateTaskInput,
    fields: MutableTaskField[],
  ): Promise<boolean> {
    const current = this.tasksState().find((task) => task.id === id);
    if (current === undefined) return Promise.resolve(false);
    const key = fieldKey(id, field);
    const confirmed = this.confirmedFields.get(key) ?? { task: current, pending: 0 };
    confirmed.pending += 1;
    this.confirmedFields.set(key, confirmed);
    const operationRevision = this.claim(id, fields);
    this.patchCurrent(id, withInput(current, input), fields, operationRevision);
    this.setFieldSave(id, field, { state: 'saving' });
    const latest = () => this.fieldRevisions.get(id)?.get(fields[0]!) === operationRevision;

    return this.track(() => this.mutating(() => this.enqueue(key, async () => {
      try {
        const { task } = await reportedWrite(this.reporter, () => this.gateway.tasks.update(id, input), taskReport);
        confirmed.task = task;
        this.patchCurrent(id, task, fields, operationRevision);
        if (latest()) this.setFieldSave(id, field, { state: 'saved' });
        return true;
      } catch (error) {
        if (latest()) {
          this.patchCurrent(id, confirmed.task, fields, operationRevision);
          this.setFieldSave(id, field, { state: 'failed', message: `Not saved. Try again. ${messageOf(error)}` });
        }
        return false;
      } finally {
        confirmed.pending -= 1;
        if (confirmed.pending === 0 && this.confirmedFields.get(key) === confirmed) this.confirmedFields.delete(key);
      }
    })));
  }

  private setRowError(id: TaskId, message: string | null): void {
    this.rowErrorsState.update((errors) => {
      if (message === null && !errors.has(id)) return errors;
      const next = new Map(errors);
      if (message === null) next.delete(id);
      else next.set(id, message);
      return next;
    });
  }

  private setFieldSave(id: TaskId, field: TaskDrawerField, save: TaskFieldSave): void {
    // Re-inserted, not updated in place, so iteration order is recency and the drawer announces
    // the field that changed last.
    this.fieldSavesState.update((saves) => {
      const next = new Map(saves);
      next.delete(fieldKey(id, field));
      return next.set(fieldKey(id, field), { id, field, save });
    });
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
