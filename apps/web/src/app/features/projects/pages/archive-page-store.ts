import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import type {
  ProjectArchiveItem,
  ProjectArchiveResult,
  ProjectId,
  ProjectRestoreStatus,
} from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { OPERATION_HISTORY_REPORTER, reportedWrite, type OperationWriteReport } from '../../../core/history/operation-history-reporter';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { isProjectRecordEvent, nameOf, type LiveEvent } from '@cwm/contracts';
import { failureCode, readFailure, type Failure } from '../../../shared/feedback/failure';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Archive's four failure states (Slice 78), highest precedence first: a committed restore whose
 * refresh failed (Retry refresh), a refused restore, a failed read over a list on screen (stale,
 * polite), and a failed read with nothing on screen (load). Any of them pauses Restore until a
 * successful read (Slice 47).
 */
export type ArchiveErrorKind = 'committed-unrefreshed' | 'refused' | 'stale' | 'load';
export interface ArchiveError extends Failure {
  readonly kind: ArchiveErrorKind;
}

/** §31's root-wide Archive read and its canonical restore operations. */
@Injectable()
export class ArchivePageStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);
  /**
   * Every Restore reports to the header's history (Slice 41), naming the restored row's or
   * section's own project — often a descendant of the root this page shows — or the reactivated
   * project itself.
   */
  private readonly reporter = inject(OPERATION_HISTORY_REPORTER);

  private readonly resultState = signal<ProjectArchiveResult | null>(null);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<ArchiveError | null>(null);
  private readonly retryPendingState = signal(false);
  private readonly restoringState = signal<ReadonlySet<string>>(new Set());
  private readonly restoreReportState = signal<OperationWriteReport | null>(null);
  private projectIdState = signal<ProjectId | null>(null);
  private generation = 0;
  private destroyed = false;

  readonly result = this.resultState.asReadonly();
  readonly items = computed(() => this.resultState()?.items ?? []);
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** True while Try again or Retry refresh reads: its button is busy and keeps focus. */
  readonly retryPending = this.retryPendingState.asReadonly();
  readonly restoring = this.restoringState.asReadonly();
  /** The latest committed Restore's exact response receipt, for its own toast. */
  readonly restoreReport = this.restoreReportState.asReadonly();

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
   *
   * An error outlives the read that follows it (Slice 47). It is what blocks Restore after a
   * refused write or a failed post-write re-read, and a pending quiet frame or Retry is not yet
   * a current projection: only a successful read of the same root clears it.
   */
  load(projectId: ProjectId, options: { quiet?: boolean; handover?: boolean } = {}): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    const generation = ++this.generation;
    const previousProjectId = this.projectIdState();
    this.projectIdState.set(projectId);
    if (previousProjectId !== projectId) {
      this.restoreReportState.set(null);
      this.resultState.set(null);
      this.errorState.set(null);
      this.retryPendingState.set(false);
    }
    const quiet = options.quiet === true && this.resultState() !== null;
    return this.track(async () => {
      if (!quiet) this.loadingState.set(true);
      try {
        const result = await this.gateway.archive.get(projectId);
        if (!this.current(generation, projectId)) return false;
        this.resultState.set(result);
        this.errorState.set(null);
        return true;
      } catch (error) {
        // A committed write stays reported, and a held refusal outlives a live frame's failed
        // read; Try again hands a refusal over to its read, which turns stale when it fails.
        if (this.current(generation, projectId)) {
          this.errorState.update((held) =>
            held?.kind === 'committed-unrefreshed' || (held?.kind === 'refused' && options.handover !== true) ? held
            : this.resultState() !== null ? { kind: 'stale', ...readFailure(error, 'this archive'), sentence: 'This archive may be out of date.' }
            : { kind: 'load', ...readFailure(error, 'this archive') });
        }
        return false;
      } finally {
        if (this.current(generation, projectId)) this.loadingState.set(false);
      }
    });
  }

  async restore(item: ProjectArchiveItem, status: ProjectRestoreStatus = 'active'): Promise<boolean> {
    if (item.restoration.kind !== 'ready') return false;
    // After a refused write or failed re-read, the displayed item may already be stale. Retry
    // the projection before offering another write against it.
    if (this.destroyed || this.restoringState().size > 0 || this.errorState() !== null) return false;
    const projectId = this.projectIdState();
    if (projectId === null) return false;
    const generation = ++this.generation;
    const id = this.idOf(item);
    this.restoreReportState.set(null);
    this.restoringState.update((ids) => new Set([...ids, id]));
    let written = false;
    let report: OperationWriteReport | null = null;
    const retainedReport = (value: OperationWriteReport): OperationWriteReport => {
      report = { ...value, feedback: 'own' };
      return report;
    };
    try {
      switch (item.kind) {
        case 'subproject':
          await reportedWrite(this.reporter, () => this.gateway.projects.update(item.project.id, { status }),
            ({ project, operation }) => retainedReport({ projectId: project.id, projectName: project.name, receipt: operation }));
          break;
        case 'section':
          await reportedWrite(this.reporter, () => this.gateway.sections.restore(item.section.id),
            ({ section, operation }) => retainedReport({ projectId: section.projectId, receipt: operation }));
          break;
        case 'task':
          await reportedWrite(this.reporter, () => this.gateway.tasks.restore(item.task.id),
            ({ task, operation }) => retainedReport({ projectId: task.projectId, receipt: operation }));
          break;
        case 'reflection':
          await reportedWrite(this.reporter, () => this.gateway.reflections.restore(item.reflection.id),
            ({ reflection, operation }) => retainedReport({ projectId: reflection.projectId, receipt: operation }));
          break;
      }
      written = true;
      // The canonical write may land after the page has changed roots or been torn down. The
      // mutation succeeded, but this instance must not report it as current and make the shell
      // refresh the next root's progress or hierarchy.
      if (!this.current(generation, projectId)) return false;
      this.restoreReportState.set(report);
      const refreshPromise = this.load(projectId);
      const refreshGeneration = this.generation;
      const refreshed = await refreshPromise;
      if (!this.current(refreshGeneration, projectId)) return false;
      if (!refreshed) this.errorState.set(this.committedUnrefreshed(item, this.errorState()?.reason ?? null));
      return true;
    } catch (error) {
      if (!this.current(generation, projectId)) return false;
      this.errorState.set(written ? this.committedUnrefreshed(item, messageOf(error)) : this.refused(item, error));
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

  /**
   * Retry is read-only. It is quiet when a list is on screen, so the retained error and this
   * control stay put — and keep keyboard focus — until the replacement read answers.
   */
  async retry(): Promise<boolean> {
    const projectId = this.projectIdState();
    if (projectId === null) return false;
    this.retryPendingState.set(true);
    try {
      return await this.load(projectId, { quiet: true, handover: true });
    } finally {
      if (this.projectIdState() === projectId) this.retryPendingState.set(false);
    }
  }

  private committedUnrefreshed(item: ProjectArchiveItem, reason: string | null): ArchiveError {
    return { kind: 'committed-unrefreshed', sentence: `Restored “${this.titleOf(item)}”, but Archive couldn’t refresh.`, reason };
  }

  /** Not slice 75's "Try again" frame: the button re-reads, it does not restore. */
  private refused(item: ProjectArchiveItem, error: unknown): ArchiveError {
    const title = this.titleOf(item);
    const sentence = failureCode(error) === 'unreachable'
      ? `Couldn’t reach your workspace, so “${title}” may not have been restored.`
      : `Couldn’t restore “${title}”. The archive may have changed.`;
    return { kind: 'refused', sentence, reason: messageOf(error) };
  }

  private titleOf(item: ProjectArchiveItem): string {
    switch (item.kind) {
      case 'subproject':
        return item.project.name;
      case 'section':
        return nameOf(item.section);
      case 'task':
        return item.task.title;
      case 'reflection':
        return item.reflection.title?.trim() || 'Reflection';
    }
  }

  private onLiveEvent(event: LiveEvent): void {
    if (this.destroyed) return;
    const projectId = this.projectIdState();
    if (projectId === null) return;
    if (event.type === 'prototype.reloaded') {
      this.restoreReportState.set(null);
      // A reload replaces the document and perhaps the persona: nothing on screen still holds.
      // It runs even while a Restore is pending; its read supersedes that Restore's refresh.
      this.resultState.set(null);
      this.errorState.set(null);
      void this.load(projectId);
      return;
    }
    if (this.restoring().size > 0) return;
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
