import { Injectable, inject, signal } from '@angular/core';
import type { ProgressFormula, ProgressResult, ProjectId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { OPERATION_HISTORY_REPORTER, reportedWrite } from '../../../../core/history/operation-history-reporter';
import { readFailure, writeFailure, type Failure } from '../../../../shared/feedback/failure';

const FORMULA_FAILED = 'Couldn’t change how progress is measured. Try again.';
/** A failed re-read over a result still on screen: polite, never "Couldn’t load" (Slice 78). */
const staleFailure = (error: unknown): Failure => ({ ...readFailure(error, 'progress'), sentence: 'This progress may be out of date.' });
interface ActiveRead { generation: number; promise: Promise<void>; queued: boolean; }

@Injectable()
export class ProgressStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  /** The progress setting is a project write; the header's history hears about it (Slice 41). */
  private readonly reporter = inject(OPERATION_HISTORY_REPORTER);
  private readonly projectIdState = signal<ProjectId | null>(null);
  private readonly resultState = signal<ProgressResult | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<Failure | null>(null);
  private readonly writeErrorState = signal<Failure | null>(null);
  private readonly staleState = signal<Failure | null>(null);
  private readonly stalePendingState = signal(false);
  private loadGeneration = 0;
  private activeRead: ActiveRead | null = null;
  private requestedRevision: number | null = null;
  readonly result = this.resultState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  /** The read failed and there is no result: the failure replaces it (Slice 78). */
  readonly error = this.errorState.asReadonly();
  /** The formula write failed; the result and controls stay. Kept apart from the read (§19). */
  readonly writeError = this.writeErrorState.asReadonly();
  /** The re-read after a successful write failed; the result on screen may be old. */
  readonly stale = this.staleState.asReadonly();
  /** True while `retryStale` runs: the stale notice's Try again is busy. */
  readonly stalePending = this.stalePendingState.asReadonly();

  load(projectId: ProjectId): Promise<void> {
    // A re-read of the same project keeps its failures until it answers (Slice 78); another project's clears them.
    if (this.projectIdState() !== projectId) {
      this.errorState.set(null); this.writeErrorState.set(null); this.staleState.set(null); this.stalePendingState.set(false);
    }
    this.projectIdState.set(projectId);
    return this.startRead(projectId, ++this.loadGeneration, false);
  }

  /** The failed read's Try again: the same read, repeated. */
  retry(): Promise<void> {
    const projectId = this.projectIdState();
    return projectId === null ? Promise.resolve() : this.load(projectId);
  }

  /** The stale notice's Try again: a quiet read, so the result stays and a failure leaves it stale. */
  async retryStale(): Promise<void> {
    const projectId = this.projectIdState();
    if (projectId === null || this.stalePendingState()) return;
    const generation = this.loadGeneration;
    const current = () => generation === this.loadGeneration && this.projectIdState() === projectId;
    this.stalePendingState.set(true);
    try {
      const result = await this.gateway.progress.get(projectId);
      if (current()) { this.resultState.set(result); this.staleState.set(null); }
    } catch (error) {
      if (current()) this.staleState.set(staleFailure(error));
    } finally {
      if (current()) this.stalePendingState.set(false);
    }
  }

  sync(projectId: ProjectId, revision: number): Promise<void> {
    if (this.projectIdState() !== projectId || this.loadGeneration === 0) {
      this.requestedRevision = revision;
      return this.load(projectId);
    }
    if (this.requestedRevision === revision) return this.activeRead?.promise ?? Promise.resolve();
    this.requestedRevision = revision;
    if (this.activeRead?.generation === this.loadGeneration) { this.activeRead.queued = true; return this.activeRead.promise; }
    return this.startRead(projectId, this.loadGeneration, true);
  }

  private startRead(projectId: ProjectId, generation: number, quiet: boolean): Promise<void> {
    const state = { generation, queued: false, promise: Promise.resolve() } as ActiveRead;
    if (!quiet) this.loadingState.set(true);
    state.promise = (async () => { try {
      const result = await this.gateway.progress.get(projectId);
      if (generation === this.loadGeneration && this.projectIdState() === projectId) { this.resultState.set(result); this.errorState.set(null); this.staleState.set(null); }
    } catch (error) {
      if (!quiet && generation === this.loadGeneration && this.projectIdState() === projectId) { this.resultState.set(null); this.staleState.set(null); this.errorState.set(readFailure(error, 'progress')); }
    } finally {
      if (!quiet && generation === this.loadGeneration) this.loadingState.set(false);
    } })().finally(() => {
      if (this.activeRead !== state) return;
      this.activeRead = null;
      if (state.queued && generation === this.loadGeneration) void this.startRead(projectId, generation, true);
    });
    this.activeRead = state;
    return state.promise;
  }

  async setFormula(progressFormula: ProgressFormula, manualProgress?: number): Promise<boolean> {
    const id = this.projectIdState();
    if (id === null) return false;
    const generation = this.loadGeneration;
    this.writeErrorState.set(null);
    try {
      await reportedWrite(
        this.reporter,
        () => this.gateway.projects.update(id, { progressFormula, ...(manualProgress === undefined ? {} : { manualProgress }) }),
        ({ project, operation }) => ({ projectId: project.id, projectName: project.name, receipt: operation }),
      );
    }
    catch (error) {
      if (id === this.projectIdState() && generation === this.loadGeneration) this.writeErrorState.set(writeFailure(error, FORMULA_FAILED));
      return false;
    }
    if (id !== this.projectIdState() || generation !== this.loadGeneration) return true;
    try { const result = await this.gateway.progress.get(id); if (id === this.projectIdState() && generation === this.loadGeneration) { this.resultState.set(result); this.staleState.set(null); } }
    catch (error) { if (id === this.projectIdState() && generation === this.loadGeneration) this.staleState.set(staleFailure(error)); }
    return true;
  }
}
