import { Injectable, inject, signal } from '@angular/core';
import type { Project, ProjectId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
interface ActiveRead { generation: number; promise: Promise<void>; queued: boolean; }
@Injectable()
export class SubProjectsStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private root: Project | null = null;
  private rootId: ProjectId | null = null;
  private generation = 0;
  private activeRead: ActiveRead | null = null;
  private depths = new Map<ProjectId, number>();
  private readonly projectsState = signal<Project[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  readonly projects = this.projectsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly();
  load(id: ProjectId): Promise<void> {
    this.rootId = id; this.root = null;
    return this.startRead(id, ++this.generation, false);
  }
  sync(id: ProjectId): Promise<void> {
    if (this.rootId !== id || this.generation === 0) return this.load(id);
    if (this.activeRead?.generation === this.generation) { this.activeRead.queued = true; return this.activeRead.promise; }
    return this.startRead(id, this.generation, true);
  }
  private startRead(id: ProjectId, generation: number, quiet: boolean): Promise<void> {
    const state = { generation, queued: false, promise: Promise.resolve() } as ActiveRead;
    if (!quiet) { this.loadingState.set(true); this.errorState.set(null); }
    state.promise = (async () => { try {
      const root = await this.gateway.projects.get(id);
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
      const depths = new Map<ProjectId, number>();
      const visit = (parentId: ProjectId, depth: number) => {
        for (const child of childrenByParent.get(parentId) ?? []) {
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          depths.set(child.id, depth);
          descendants.push(child);
          visit(child.id, depth + 1);
        }
      };
      visit(id, 0);
      if (generation === this.generation && this.rootId === id) { this.root = root; this.depths = depths; this.projectsState.set(descendants); this.errorState.set(null); }
    } catch (error) {
      if (!quiet && generation === this.generation && this.rootId === id) { this.projectsState.set([]); this.depths = new Map(); this.errorState.set(messageOf(error)); }
    } finally {
      if (!quiet && generation === this.generation) this.loadingState.set(false);
    } })().finally(() => { if (this.activeRead !== state) return; this.activeRead = null; if (state.queued && generation === this.generation) void this.startRead(id, generation, true); });
    this.activeRead = state;
    return state.promise;
  }
  depthOf(project: Project): number { return this.depths.get(project.id) ?? 0; }
  branchMarker(project: Project): string { return '↳ '.repeat(this.depthOf(project)); }
  async create(rawName: string): Promise<boolean> {
    const name = rawName.trim(); if (name === '' || this.root === null) { this.errorState.set('A sub-project name is required.'); return false; }
    try { const created = await this.gateway.projects.create({ workspaceId: this.root.workspaceId, parentProjectId: this.root.id, name }); this.depths.set(created.id, 0); this.projectsState.update((items) => [...items, created]); return true; }
    catch (error) { this.errorState.set(messageOf(error)); return false; }
  }
}
