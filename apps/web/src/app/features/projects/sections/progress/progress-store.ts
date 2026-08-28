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
  private loadGeneration = 0;
  readonly result = this.resultState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  async load(projectId: ProjectId): Promise<void> {
    const generation = ++this.loadGeneration;
    this.projectIdState.set(projectId);
    this.loadingState.set(true);
    this.errorState.set(null);
    try { const result = await this.gateway.progress.get(projectId); if (generation === this.loadGeneration) this.resultState.set(result); }
    catch (error) { if (generation === this.loadGeneration) { this.resultState.set(null); this.errorState.set(messageOf(error)); } }
    finally { if (generation === this.loadGeneration) this.loadingState.set(false); }
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
