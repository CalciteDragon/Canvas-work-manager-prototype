import { Injectable, inject, signal } from '@angular/core';
import type { ProgressFormula, ProgressResult, ProjectId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

@Injectable()
export class ProgressStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly projectIdState = signal<ProjectId | null>(null);
  private readonly resultState = signal<ProgressResult | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  readonly result = this.resultState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  async load(projectId: ProjectId): Promise<void> {
    this.projectIdState.set(projectId);
    this.loadingState.set(true);
    this.errorState.set(null);
    try { this.resultState.set(await this.gateway.progress.get(projectId)); }
    catch (error) { this.resultState.set(null); this.errorState.set(messageOf(error)); }
    finally { this.loadingState.set(false); }
  }

  async setFormula(progressFormula: ProgressFormula, manualProgress?: number): Promise<boolean> {
    const id = this.projectIdState();
    if (id === null) return false;
    this.errorState.set(null);
    try {
      await this.gateway.projects.update(id, { progressFormula, ...(manualProgress === undefined ? {} : { manualProgress }) });
      this.resultState.set(await this.gateway.progress.get(id));
      return true;
    } catch (error) { this.errorState.set(messageOf(error)); return false; }
  }
}
