import { DestroyRef, Injectable, PendingTasks, inject, signal } from '@angular/core';
import type { LiveEvent, ProjectId, ProjectTodoItem } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The id a row is addressed by, whichever kind it is. */
export const todoIdOf = (item: ProjectTodoItem): string =>
  item.kind === 'task' ? item.task.id : item.project.id;

/** §34's finished rows: still on the list, and with nothing left to complete. */
export const isTodoFinished = (item: ProjectTodoItem): boolean =>
  item.kind === 'task'
    ? item.task.status === 'done' || item.task.status === 'cancelled'
    : item.project.status === 'completed' || item.project.status === 'archived';

/**
 * §34's Todos page, as one store: **the chronology of one root, and the completion of a row in
 * it** (§20 — feature-scoped, provided by the page component alone).
 *
 * It owns no work. Every row is a canonical record the query returned, and completing one calls
 * the canonical operation for its kind — `tasks.complete` or `projects.update` — so archive
 * guards, activity attribution, completion timestamps and §39's progress all behave exactly as
 * they do on the canvas the row lives on.
 *
 * Its two hard parts are both timing. §62's frame is flushed at commit, so a tab's own write is
 * echoed back to it *before* its response lands: a re-read in that window would repaint the row
 * with its pre-write status. And a route change can leave a read or a write in flight for a root
 * this view is no longer showing. Both are answered the same way — a generation that every
 * continuation checks before it touches anything.
 */
@Injectable()
export class TodosPageStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);

  private readonly itemsState = signal<readonly ProjectTodoItem[]>([]);
  // Starts true for the reason `ProjectPageStore` states: before the first read resolves the
  // page matches none of the template's branches and paints blank.
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);
  private readonly refreshErrorState = signal<string | null>(null);
  private readonly writeErrorState = signal<string | null>(null);
  private readonly completingState = signal<string | null>(null);

  private generation = 0;
  private requestedProjectId: ProjectId | undefined;
  private activeRead: Promise<void> | null = null;
  private readQueued = false;
  private writing = false;
  /**
   * Bumped when a completion starts. A read that was **already running** at that moment answers
   * from before the write, so its epoch no longer matches and its result is discarded rather than
   * painted over the settled row — deferring only the reads that have not begun would leave that
   * one free to revert the row to its pre-write status.
   */
  private writeEpoch = 0;
  private destroyed = false;

  readonly items = this.itemsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  /** A first read that failed: the page has nothing to show and offers a retry. */
  readonly error = this.errorState.asReadonly();
  /** A **re-read** that failed: what is on screen is still the better answer than a blank page. */
  readonly refreshError = this.refreshErrorState.asReadonly();
  readonly writeError = this.writeErrorState.asReadonly();
  /** The row whose completion is in flight. Non-null freezes every row's control. */
  readonly completing = this.completingState.asReadonly();

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe(
      (event) => this.onLiveEvent(event),
      () => this.invalidate(),
    );
    inject(DestroyRef).onDestroy(() => {
      // Disposal is a staleness reason like any other: a read must not write to a view that is
      // gone, and a write must not report success to a component that can no longer act on it.
      this.destroyed = true;
      unsubscribe();
    });
  }

  /** The chronology of one root. Called again when the shell routes to another one. */
  load(projectId: ProjectId): Promise<void> {
    const generation = ++this.generation;
    this.requestedProjectId = projectId;
    // Cleared immediately: another root's chronology on screen under this root's heading would
    // be worse than an empty page for the length of a read.
    this.itemsState.set([]);
    this.errorState.set(null);
    this.refreshErrorState.set(null);
    this.writeErrorState.set(null);
    this.completingState.set(null);
    this.readQueued = false;
    this.writing = false;
    return this.read(generation, projectId, { quiet: false });
  }

  /** The retry the load-error state offers. */
  retry(): Promise<void> {
    const projectId = this.requestedProjectId;
    if (projectId === undefined) return Promise.resolve();
    return this.load(projectId);
  }

  /**
   * §34's inline completion, through the canonical operation for the row's kind.
   *
   * Answers whether **this view** applied the result: `false` for a refused click (a finished
   * row, or another write in flight), for a rejected write, and for a write whose answer came
   * back after the view moved on. The caller uses it to decide whether to tell the shell that
   * project data moved — a callback fired for a root nobody is looking at is a re-read of the
   * wrong thing.
   */
  async complete(item: ProjectTodoItem): Promise<boolean> {
    const projectId = this.requestedProjectId;
    if (projectId === undefined) return false;
    // Serialized, deliberately: a bounded first implementation (§71). A second click on the
    // same row, and a click on another row, are both refused while one write is in flight.
    if (this.completingState() !== null || isTodoFinished(item)) return false;

    const generation = this.generation;
    const id = todoIdOf(item);
    // The store's one staleness predicate — root, generation and disposal — rather than a second
    // copy of two thirds of it.
    const current = () => this.current(generation, projectId);

    this.writeErrorState.set(null);
    this.completingState.set(id);
    this.writing = true;
    this.writeEpoch += 1;

    try {
      if (item.kind === 'task') {
        // Optimistic **status only**. `completedAt` is the clock's (§45) and arrives with the
        // canonical record; inventing one here would print a time nothing recorded.
        this.replace(id, { ...item, task: { ...item.task, status: 'done' } });
        const record = await this.track(() => this.gateway.tasks.complete(item.task.id));
        if (!current()) return false;
        this.replace(id, { ...item, task: record.task });
      } else {
        this.replace(id, { ...item, project: { ...item.project, status: 'completed' } });
        // §26's completion of a unit of work is an ordinary status update, so it goes through
        // the same call the header uses — and it does **not** complete anything beneath it.
        const record = await this.track(() => this.gateway.projects.update(item.project.id, { status: 'completed' }));
        if (!current()) return false;
        // A root coming back here would mean the id named something else entirely; keep the
        // optimistic row rather than putting a shape this page cannot render into the list.
        if (record.kind !== 'subproject') return false;
        this.replace(id, { ...item, project: record });
      }
      return true;
    } catch (error) {
      if (!current()) return false;
      // The **exact** prior record, not a guessed `todo`: the row may have been in progress or
      // blocked, and the canvas it lives on still says so.
      this.replace(id, item);
      this.writeErrorState.set(messageOf(error));
      return false;
    } finally {
      this.writing = false;
      if (current()) {
        this.completingState.set(null);
        // Whatever arrived while the write was in flight — including the write's own §62 echo —
        // is read now, once, against the settled row.
        if (this.readQueued) {
          this.readQueued = false;
          void this.refresh();
        }
      }
    }
  }

  /**
   * §62's routing, for one root.
   *
   * A Todos page projects rows from anywhere beneath its root, so `rootProjectId` is the whole
   * question — a task written three units of work down changes this page while `projectId` names
   * a project it is not open on. `prototype.reloaded` is the loud exception: the document behind
   * every row may have been replaced, so the content goes immediately even though the root id
   * has not changed. (Choosing a persona reloads the browser through the prototype panel, so it
   * needs nothing here.)
   */
  private onLiveEvent(event: LiveEvent): void {
    const projectId = this.requestedProjectId;
    if (projectId === undefined) return;
    if (event.type === 'prototype.reloaded') {
      void this.load(projectId);
      return;
    }
    if (event.rootProjectId !== projectId && event.projectId !== projectId) return;
    this.invalidate();
  }

  private invalidate(): void {
    if (this.requestedProjectId === undefined) return;
    // Deferred, never dropped: applying a read mid-write would paint the pre-write row.
    if (this.writing || this.activeRead !== null) {
      this.readQueued = true;
      return;
    }
    void this.refresh();
  }

  /**
   * A re-read after someone else changed something. Quiet: an agent finishing a task must not
   * flash a skeleton, and a failure must not blank a page the reader is using — least of all
   * undo a completion this tab has just persisted.
   */
  private refresh(): Promise<void> {
    const projectId = this.requestedProjectId;
    if (projectId === undefined) return Promise.resolve();
    return this.read(this.generation, projectId, { quiet: true });
  }

  private read(generation: number, projectId: ProjectId, { quiet }: { quiet: boolean }): Promise<void> {
    // A **loud** read is a new root or an explicit retry, so it starts regardless: the read it
    // overtakes belongs to a page nobody is looking at any more, and its continuation exits on
    // the generation guard below. Only a quiet re-read waits its turn.
    if (quiet && this.activeRead !== null) {
      this.readQueued = true;
      return this.activeRead;
    }
    if (!quiet) this.loadingState.set(true);

    const epoch = this.writeEpoch;
    const operation = this.track(async () => {
      try {
        const result = await this.gateway.todos.get(projectId);
        if (!this.current(generation, projectId)) return;
        if (this.writing || this.writeEpoch !== epoch) {
          // Answered from before a write this view has since made. Queue a fresh read rather than
          // repainting the row the user just completed.
          this.readQueued = true;
          return;
        }
        this.itemsState.set(result.items);
        this.errorState.set(null);
        this.refreshErrorState.set(null);
      } catch (error) {
        if (!this.current(generation, projectId)) return;
        if (quiet) this.refreshErrorState.set(messageOf(error));
        else {
          this.itemsState.set([]);
          this.errorState.set(messageOf(error));
        }
      } finally {
        if (!quiet && this.current(generation, projectId)) this.loadingState.set(false);
      }
    }).finally(() => {
      if (this.activeRead !== operation) return;
      this.activeRead = null;
      if (!this.readQueued || this.writing || !this.current(generation, projectId)) return;
      this.readQueued = false;
      void this.refresh();
    });

    this.activeRead = operation;
    return operation;
  }

  private current(generation: number, projectId: ProjectId): boolean {
    return !this.destroyed && generation === this.generation && this.requestedProjectId === projectId;
  }

  private replace(id: string, next: ProjectTodoItem): void {
    this.itemsState.update((items) => items.map((item) => (todoIdOf(item) === id ? next : item)));
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    try {
      return operation().finally(settled);
    } catch (error) {
      // A synchronous throw would otherwise leave the token outstanding and `whenStable()` would
      // never settle again — a hang, rather than the error the caller is about to see.
      settled();
      throw error;
    }
  }
}
