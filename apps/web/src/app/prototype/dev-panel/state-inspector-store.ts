import { Injectable, inject, signal } from '@angular/core';
import type { Project, ProjectId, ProjectLayoutMode, ProjectStatus } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';

const VISIBLE_STATUSES: ProjectStatus[] = ['planning', 'active', 'on_hold', 'completed'];
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The deliberately narrow §28 portion of the development panel. */
@Injectable()
export class StateInspectorStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);

  private readonly projectsState = signal<Project[]>([]);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);
  private readonly savingState = signal<ReadonlySet<ProjectId>>(new Set());

  readonly projects = this.projectsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  isSaving(id: ProjectId): boolean {
    return this.savingState().has(id);
  }

  async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      this.projectsState.set(await this.gateway.projects.list({ status: VISIBLE_STATUSES }));
    } catch (error) {
      this.projectsState.set([]);
      this.errorState.set(messageOf(error));
    } finally {
      this.loadingState.set(false);
    }
  }

  async setLayout(id: ProjectId, projectLayoutMode: ProjectLayoutMode): Promise<boolean> {
    if (this.isSaving(id)) return false;
    const current = this.projectsState().find((project) => project.id === id);
    if (current === undefined || current.projectLayoutMode === projectLayoutMode) return false;

    this.errorState.set(null);
    this.savingState.update((saving) => new Set(saving).add(id));
    try {
      const { project: updated } = await this.gateway.projects.update(id, { projectLayoutMode });
      this.projectsState.update((projects) =>
        projects.map((project) => (project.id === id ? updated : project)),
      );
      return true;
    } catch (error) {
      this.errorState.set(messageOf(error));
      return false;
    } finally {
      this.savingState.update((saving) => {
        const next = new Set(saving);
        next.delete(id);
        return next;
      });
    }
  }
}
