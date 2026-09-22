import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import type {
  ProjectArchiveItem,
  ProjectArchiveResult,
  ProjectId,
  ProjectRestoreStatus,
} from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { isProjectRecordEvent, type LiveEvent } from '@cwm/contracts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** §31's root-wide Archive read and its canonical restore operations. */
@Injectable()
export class ArchivePageStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);

  private readonly resultState = signal<ProjectArchiveResult | null>(null);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);
  private readonly restoringState = signal<ReadonlySet<string>>(new Set());
  private projectIdState = signal<ProjectId | null>(null);
  private generation = 0;
  private destroyed = false;

  readonly result = this.resultState.asReadonly();
  readonly items = computed(() => this.resultState()?.items ?? []);
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly restoring = this.restoringState.asReadonly();

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe(
      (event) => this.onLiveEvent(event),
      () => this.onLiveConnected(),
    );
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation += 1;
      this.projectIdState.set(null);
      unsubscribe();
    });
  }

  /**
   * Reads the root's projection. `quiet` is the live path: when this root's list is already on
   * screen it stays there during the re-read instead of flashing "Loading archive…", which matters
   * since Slice 39 widened the frames that re-read it to project records from any root.
   */
  load(projectId: ProjectId, options: { quiet?: boolean } = {}): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    const generation = ++this.generation;
    const previousProjectId = this.projectIdState();
    this.projectIdState.set(projectId);
    if (previousProjectId !== projectId) this.resultState.set(null);
    const quiet = options.quiet === true && this.resultState() !== null;
    return this.track(async () => {
      if (!quiet) this.loadingState.set(true);
      this.errorState.set(null);
      try {
        const result = await this.gateway.archive.get(projectId);
        if (!this.current(generation, projectId)) return false;
        this.resultState.set(result);
        return true;
      } catch (error) {
        if (this.current(generation, projectId)) {
          this.errorState.set(messageOf(error));
        }
        return false;
      } finally {
        if (this.current(generation, projectId)) this.loadingState.set(false);
      }
    });
  }

  async restore(item: ProjectArchiveItem, status: ProjectRestoreStatus = 'active'): Promise<boolean> {
    if (item.restoration.kind !== 'ready') return false;
    if (this.destroyed || this.restoringState().size > 0) return false;
    const projectId = this.projectIdState();
    if (projectId === null) return false;
    const generation = ++this.generation;
    const id = this.idOf(item);
    this.restoringState.update((ids) => new Set([...ids, id]));
    this.errorState.set(null);
    let written = false;
    try {
      switch (item.kind) {
        case 'subproject':
          await this.gateway.projects.update(item.project.id, { status });
          break;
        case 'section':
          await this.gateway.sections.restore(item.section.id);
          break;
        case 'task':
          await this.gateway.tasks.restore(item.task.id);
          break;
        case 'reflection':
          await this.gateway.reflections.restore(item.reflection.id);
          break;
      }
      written = true;
      // The canonical write may land after the page has changed roots or been torn down. The
      // mutation succeeded, but this instance must not report it as current and make the shell
      // refresh the next root's progress or hierarchy.
      if (!this.current(generation, projectId)) return false;
      const refreshPromise = this.load(projectId);
      const refreshGeneration = this.generation;
      const refreshed = await refreshPromise;
      if (!this.current(refreshGeneration, projectId)) return false;
      if (!refreshed) this.errorState.set('Restore succeeded, but Archive could not refresh. Try again.');
      return true;
    } catch (error) {
      if (!this.current(generation, projectId)) return false;
      this.errorState.set(written ? 'Restore succeeded, but Archive could not refresh. Try again.' : messageOf(error));
      return written;
    } finally {
      if (!this.destroyed) {
        this.restoringState.update((ids) => {
          const next = new Set(ids);
          next.delete(id);
          return next;
        });
      }
    }
  }

  retry(): Promise<boolean> {
    const projectId = this.projectIdState();
    return projectId === null ? Promise.resolve(false) : this.load(projectId);
  }

  private onLiveEvent(event: LiveEvent): void {
    if (this.destroyed) return;
    const projectId = this.projectIdState();
    if (projectId === null) return;
    if (this.restoring().size > 0) return;
    if (event.type === 'prototype.reloaded') {
      void this.load(projectId);
      return;
    }
    // A project-record frame from another root still re-reads: a cross-root move names only the
    // sub-project's new root (Slice 39).
    if (event.rootProjectId !== projectId && event.projectId !== projectId && !isProjectRecordEvent(event)) return;
    void this.load(projectId, { quiet: true });
  }

  private onLiveConnected(): void {
    if (this.destroyed) return;
    const projectId = this.projectIdState();
    if (projectId !== null && this.restoring().size === 0) void this.load(projectId);
  }

  private idOf(item: ProjectArchiveItem): string {
    switch (item.kind) {
      case 'subproject':
        return item.project.id;
      case 'section':
        return item.section.id;
      case 'task':
        return item.task.id;
      case 'reflection':
        return item.reflection.id;
    }
  }

  private current(generation: number, projectId: ProjectId): boolean {
    return !this.destroyed && generation === this.generation && this.projectIdState() === projectId;
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    return operation().finally(settled);
  }
}
