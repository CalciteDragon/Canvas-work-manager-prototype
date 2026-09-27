import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import type { ArchivedProjectsResult, ProjectId, ProjectRestoreStatus } from '@cwm/contracts';
import { isProjectRecordEvent } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { OPERATION_HISTORY_REPORTER, reportedWrite } from '../../../core/history/operation-history-reporter';
import { LIVE_UPDATES } from '../../../core/live/live-updates';

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Workspace-scoped recovery state. The host decides which projects are currently restorable. */
@Injectable()
export class ArchivedProjectsStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly reporter = inject(OPERATION_HISTORY_REPORTER);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly resultState = signal<ArchivedProjectsResult | null>(null);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);
  private readonly statusState = signal<ReadonlyMap<ProjectId, ProjectRestoreStatus>>(new Map());
  private readonly busyState = signal<ProjectId | null>(null);
  private generation = 0;
  private destroyed = false;

  readonly items = computed(() => this.resultState()?.items ?? []);
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly busy = this.busyState.asReadonly();

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe((event) => {
      if (event.type === 'prototype.reloaded') {
        this.resultState.set(null);
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

  /** Quiet frame reads keep the current list on screen; generation drops superseded answers. */
  load(options: { quiet?: boolean } = {}): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    const generation = ++this.generation;
    if (!options.quiet || this.resultState() === null) this.loadingState.set(true);
    // Keep an error on a retained list until a new read succeeds. Otherwise a quiet
    // project frame can re-enable Restore on a stale row while its read is still pending.
    if (this.resultState() === null) this.errorState.set(null);
    const settled = this.pendingTasks.add();
    return this.gateway.projects.archived().then((result) => {
      if (!this.current(generation)) return false;
      this.resultState.set(result);
      this.errorState.set(null);
      this.statusState.update((previous) => new Map([...previous].filter(([id]) => result.items.some(({ project }) => project.id === id))));
      return true;
    }).catch((error: unknown) => {
      if (this.current(generation)) this.errorState.set(messageOf(error));
      return false;
    }).finally(() => {
      settled();
      if (this.current(generation)) this.loadingState.set(false);
    });
  }

  retry(): Promise<boolean> { return this.load(); }

  async restore(id: ProjectId): Promise<boolean> {
    const status = this.statusFor(id);
    if (status === '' || this.errorState() !== null || this.loadingState() || this.busyState() !== null || !this.items().some(({ project }) => project.id === id) || this.destroyed) return false;
    this.busyState.set(id);
    this.errorState.set(null);
    // Invalidate a read that began before this write. Its answer must not repaint a stale
    // workspace list while Restore is pending.
    const writeGeneration = ++this.generation;
    const settled = this.pendingTasks.add();
    try {
      await reportedWrite(this.reporter, () => this.gateway.projects.update(id, { status }),
        ({ project, operation }) => ({ projectId: project.id, projectName: project.name, receipt: operation }));
      if (this.destroyed || this.generation !== writeGeneration) return true;
      const refresh = this.load({ quiet: true });
      const refreshGeneration = this.generation;
      const refreshed = await refresh;
      if (!refreshed && this.current(refreshGeneration)) this.errorState.set('Restore succeeded, but archived projects could not refresh. Retry the list.');
      return true;
    } catch (error) {
      if (this.destroyed || this.generation !== writeGeneration) return false;
      // A listed child may have acquired an archived ancestor. The canonical write refuses
      // it; a fresh read removes the now-blocked row without a speculative local mutation.
      const refresh = this.load({ quiet: true });
      const refreshGeneration = this.generation;
      await refresh;
      if (this.current(refreshGeneration)) this.errorState.set(messageOf(error));
      return false;
    } finally {
      settled();
      if (!this.destroyed) this.busyState.set(null);
    }
  }

  private current(generation: number): boolean { return !this.destroyed && generation === this.generation; }
}
