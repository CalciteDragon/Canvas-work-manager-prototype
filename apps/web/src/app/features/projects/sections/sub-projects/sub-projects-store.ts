import { Injectable, inject, signal } from '@angular/core';
import type { Project, ProjectId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
@Injectable()
export class SubProjectsStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private root: Project | null = null;
  private depths = new Map<ProjectId, number>();
  private readonly projectsState = signal<Project[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  readonly projects = this.projectsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly();
  async load(id: ProjectId): Promise<void> {
    this.loadingState.set(true); this.errorState.set(null);
    try {
      this.root = await this.gateway.projects.get(id);
      const all = await this.gateway.projects.list({});
      const childrenByParent = new Map<ProjectId, Project[]>();
      for (const project of all) {
        if (project.parentProjectId === undefined) continue;
        const siblings = childrenByParent.get(project.parentProjectId) ?? [];
        siblings.push(project);
        childrenByParent.set(project.parentProjectId, siblings);
      }
      const descendants: Project[] = [];
      const visited = new Set<ProjectId>([id]);
      this.depths = new Map();
      const visit = (parentId: ProjectId, depth: number) => {
        for (const child of childrenByParent.get(parentId) ?? []) {
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          this.depths.set(child.id, depth);
          descendants.push(child);
          visit(child.id, depth + 1);
        }
      };
      visit(id, 0);
      this.projectsState.set(descendants);
    }
    catch (error) { this.projectsState.set([]); this.depths = new Map(); this.errorState.set(messageOf(error)); }
    finally { this.loadingState.set(false); }
  }
  depthOf(project: Project): number { return this.depths.get(project.id) ?? 0; }
  branchMarker(project: Project): string { return '↳ '.repeat(this.depthOf(project)); }
  async create(rawName: string): Promise<boolean> {
    const name = rawName.trim(); if (name === '' || this.root === null) { this.errorState.set('A sub-project name is required.'); return false; }
    try { const created = await this.gateway.projects.create({ workspaceId: this.root.workspaceId, parentProjectId: this.root.id, name }); this.depths.set(created.id, 0); this.projectsState.update((items) => [...items, created]); return true; }
    catch (error) { this.errorState.set(messageOf(error)); return false; }
  }
}
