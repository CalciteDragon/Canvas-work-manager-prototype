import { Injectable, inject, signal } from '@angular/core';
import type { Project, ProjectId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
@Injectable()
export class SubProjectsStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private root: Project | null = null;
  private readonly projectsState = signal<Project[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  readonly projects = this.projectsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly();
  async load(id: ProjectId): Promise<void> {
    this.loadingState.set(true); this.errorState.set(null);
    try { this.root = await this.gateway.projects.get(id); const all = await this.gateway.projects.list({}); this.projectsState.set(all.filter((p) => p.parentProjectId === id)); }
    catch (error) { this.projectsState.set([]); this.errorState.set(messageOf(error)); }
    finally { this.loadingState.set(false); }
  }
  async create(rawName: string): Promise<boolean> {
    const name = rawName.trim(); if (name === '' || this.root === null) { this.errorState.set('A sub-project name is required.'); return false; }
    try { const created = await this.gateway.projects.create({ workspaceId: this.root.workspaceId, parentProjectId: this.root.id, name }); this.projectsState.update((items) => [...items, created]); return true; }
    catch (error) { this.errorState.set(messageOf(error)); return false; }
  }
}
