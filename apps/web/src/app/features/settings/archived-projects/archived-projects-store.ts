import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import type { ArchivedProjectsResult, ProjectId, ProjectRestoreStatus } from '@cwm/contracts';
import { isProjectRecordEvent } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { OPERATION_HISTORY_REPORTER, reportedWrite, type OperationWriteReport } from '../../../core/history/operation-history-reporter';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { readFailure } from '../../../shared/feedback/failure';
import type { ArchiveError } from '../../projects/pages/archive-page-store';

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);
const codeOf = (error: unknown): unknown => (typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined);

/** Workspace-scoped recovery state. The host decides which projects are currently restorable. */
@Injectable()
export class ArchivedProjectsStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly reporter = inject(OPERATION_HISTORY_REPORTER);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly resultState = signal<ArchivedProjectsResult | null>(null);
  private readonly loadingState = signal(true);
  /** Archive's four states in Archive's precedence (Slice 78), said of "this list". */
  private readonly errorState = signal<ArchiveError | null>(null);
  private readonly retryPendingState = signal(false);
  private readonly statusState = signal<ReadonlyMap<ProjectId, ProjectRestoreStatus>>(new Map());
  private readonly busyState = signal<ProjectId | null>(null);
  private readonly restoreReportState = signal<OperationWriteReport | null>(null);
  private generation = 0;
  private destroyed = false;

  readonly items = computed(() => this.resultState()?.items ?? []);
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** True while Try again or Retry refresh reads: its button is busy and keeps focus. */
  readonly retryPending = this.retryPendingState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  /** Latest Restore response, retained independently of the list it removes. */
  readonly restoreReport = this.restoreReportState.asReadonly();

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe((event) => {
      if (event.type === 'prototype.reloaded') {
        this.restoreReportState.set(null);
        this.resultState.set(null);
        this.errorState.set(null);
        this.statusState.set(new Map());
        void this.load();
      } else if (isProjectRecordEvent(event) && this.busyState() === null) {
        void this.load({ quiet: true });
      }
    }, () => { if (this.busyState() === null) void this.load({ quiet: true }); });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation += 1;
      unsubscribe();
    });
  }

  statusFor(id: ProjectId): ProjectRestoreStatus | '' { return this.statusState().get(id) ?? ''; }

  chooseStatus(id: ProjectId, status: ProjectRestoreStatus | ''): void {
    this.statusState.update((previous) => {
      const next = new Map(previous);
      if (status === '') next.delete(id);
      else next.set(id, status);
      return next;
    });
  }

  /**
   * Quiet frame reads keep the current list on screen; generation drops superseded answers.
   * `handover` is Try again's: it hands a held refusal over to this read, which turns stale when
   * it fails.
   */
  load(options: { quiet?: boolean; handover?: boolean } = {}): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    const generation = ++this.generation;
    if (!options.quiet || this.resultState() === null) this.loadingState.set(true);
    // An error stays until a read succeeds: over a retained list, a pending quiet frame must not
    // re-enable Restore on a stale row; with nothing on screen, Try again stays busy in its place.
    const settled = this.pendingTasks.add();
    return this.gateway.projects.archived().then((result) => {
      if (!this.current(generation)) return false;
      this.resultState.set(result);
      this.errorState.set(null);
      this.statusState.update((previous) => new Map([...previous].filter(([id]) => result.items.some(({ project }) => project.id === id))));
      return true;
    }).catch((error: unknown) => {
      // A committed write stays reported, and a held refusal outlives a live frame's failed read.
      if (this.current(generation)) {
        this.errorState.update((held) =>
          held?.kind === 'committed-unrefreshed' || (held?.kind === 'refused' && options.handover !== true) ? held
          : this.resultState() !== null ? { kind: 'stale', ...readFailure(error, 'this list'), sentence: 'This list may be out of date.' }
          : { kind: 'load', ...readFailure(error, 'this list') });
      }
      return false;
    }).finally(() => {
      settled();
      if (this.current(generation)) this.loadingState.set(false);
    });
  }

  /** Read-only, and quiet over a list on screen, so the failure and its button stay put until it answers. */
  async retry(): Promise<boolean> {
    this.retryPendingState.set(true);
    try {
      return await this.load({ quiet: true, handover: true });
    } finally {
      if (!this.destroyed) this.retryPendingState.set(false);
    }
  }

  async restore(id: ProjectId): Promise<boolean> {
    const status = this.statusFor(id);
    const name = this.items().find(({ project }) => project.id === id)?.project.name ?? '';
    if (status === '' || this.errorState() !== null || this.loadingState() || this.busyState() !== null || !this.items().some(({ project }) => project.id === id) || this.destroyed) return false;
    this.busyState.set(id);
    this.restoreReportState.set(null);
    this.errorState.set(null);
    // Invalidate a read that began before this write. Its answer must not repaint a stale
    // workspace list while Restore is pending.
    const writeGeneration = ++this.generation;
    const settled = this.pendingTasks.add();
    try {
      const written = await reportedWrite(this.reporter, () => this.gateway.projects.update(id, { status }),
        ({ project, operation }) => ({ projectId: project.id, projectName: project.name, receipt: operation, feedback: 'own' }));
      if (this.destroyed || this.generation !== writeGeneration) return false;
      this.restoreReportState.set({ projectId: written.project.id, projectName: written.project.name, receipt: written.operation, feedback: 'own' });
      const refresh = this.load({ quiet: true });
      const refreshGeneration = this.generation;
      const refreshed = await refresh;
      if (!this.current(refreshGeneration)) return false;
      if (!refreshed) {
        this.errorState.set({ kind: 'committed-unrefreshed', sentence: `Restored “${name}”, but this list couldn’t refresh.`,
          reason: this.errorState()?.reason ?? null });
      }
      return true;
    } catch (error) {
      if (this.destroyed || this.generation !== writeGeneration) return false;
      // A listed child may have acquired an archived ancestor. The canonical write refuses
      // it; a fresh read removes the now-blocked row without a speculative local mutation.
      const refresh = this.load({ quiet: true });
      const refreshGeneration = this.generation;
      await refresh;
      if (this.current(refreshGeneration)) this.errorState.set(this.refused(name, error));
      return false;
    } finally {
      settled();
      if (!this.destroyed) this.busyState.set(null);
    }
  }

  /** Not slice 75's "Try again" frame: the button re-reads, it does not restore. */
  private refused(name: string, error: unknown): ArchiveError {
    const sentence = codeOf(error) === 'unreachable'
      ? `Couldn’t reach your workspace, so “${name}” may not have been restored.`
      : `Couldn’t restore “${name}”. The list may have changed.`;
    return { kind: 'refused', sentence, reason: messageOf(error) };
  }

  private current(generation: number): boolean { return !this.destroyed && generation === this.generation; }
}
