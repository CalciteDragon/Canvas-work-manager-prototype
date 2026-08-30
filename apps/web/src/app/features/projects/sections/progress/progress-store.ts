import { Injectable, inject, signal } from '@angular/core';
import type { ProgressFormula, ProgressResult, ProjectId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
interface ActiveRead { generation: number; promise: Promise<void>; queued: boolean; }

@Injectable()
export class ProgressStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly projectIdState = signal<ProjectId | null>(null);
  private readonly resultState = signal<ProgressResult | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private loadGeneration = 0;
  private activeRead: ActiveRead | null = null;
  private requestedRevision: number | null = null;
  readonly result = this.resultState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  load(projectId: ProjectId): Promise<void> {
    this.projectIdState.set(projectId);
    return this.startRead(projectId, ++this.loadGeneration, false);
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
    if (!quiet) { this.loadingState.set(true); this.errorState.set(null); }
    state.promise = (async () => { try {
      const result = await this.gateway.progress.get(projectId);
      if (generation === this.loadGeneration && this.projectIdState() === projectId) { this.resultState.set(result); this.errorState.set(null); }
    } catch (error) {
      if (!quiet && generation === this.loadGeneration && this.projectIdState() === projectId) { this.resultState.set(null); this.errorState.set(messageOf(error)); }
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
    this.errorState.set(null);
    try { await this.gateway.projects.update(id, { progressFormula, ...(manualProgress === undefined ? {} : { manualProgress }) }); }
    catch (error) {
      if (id === this.projectIdState() && generation === this.loadGeneration) this.errorState.set(messageOf(error));
      return false;
    }
    if (id !== this.projectIdState() || generation !== this.loadGeneration) return true;
    try { const result = await this.gateway.progress.get(id); if (id === this.projectIdState() && generation === this.loadGeneration) this.resultState.set(result); }
    catch (error) { if (id === this.projectIdState() && generation === this.loadGeneration) this.errorState.set(messageOf(error)); }
    return true;
  }
}
