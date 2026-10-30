import { Injectable, inject, signal } from '@angular/core';
import type { ProjectId, TimelineItem } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { readFailure, type Failure } from '../../../../shared/feedback/failure';
interface ActiveRead { generation: number; promise: Promise<void>; queued: boolean; }
@Injectable()
export class TimelineStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY); private generation = 0; private activeRead: ActiveRead | null = null;
  private readonly projectIdState = signal<ProjectId | null>(null); private readonly itemsState = signal<TimelineItem[]>([]); private readonly loadingState = signal(false); private readonly errorState = signal<Failure | null>(null);
  readonly projectId = this.projectIdState.asReadonly(); readonly items = this.itemsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly();
  /** A re-read of the same project keeps its failure on screen until it answers (Slice 78); another project's clears it. */
  load(projectId: ProjectId): Promise<void> { if (this.projectIdState() !== projectId) this.errorState.set(null); this.projectIdState.set(projectId); return this.startRead(projectId, ++this.generation, false); }
  /** The failed read's Try again: the same read, repeated. */
  retry(): Promise<void> { const projectId = this.projectIdState(); return projectId === null ? Promise.resolve() : this.load(projectId); }
  sync(projectId: ProjectId): Promise<void> { if (this.projectIdState() !== projectId || this.generation === 0) return this.load(projectId); if (this.activeRead?.generation === this.generation) { this.activeRead.queued = true; return this.activeRead.promise; } return this.startRead(projectId, this.generation, true); }
  private startRead(projectId: ProjectId, generation: number, quiet: boolean): Promise<void> { const state = { generation, queued: false, promise: Promise.resolve() } as ActiveRead; if (!quiet) this.loadingState.set(true); state.promise = (async () => { try { const result = await this.gateway.timeline.get(projectId); if (generation === this.generation && this.projectIdState() === projectId) { this.itemsState.set([...result.items].sort((a,b) => a.startDate.localeCompare(b.startDate))); this.errorState.set(null); } } catch (e) { if (!quiet && generation === this.generation && this.projectIdState() === projectId) { this.itemsState.set([]); this.errorState.set(readFailure(e, 'this timeline')); } } finally { if (!quiet && generation === this.generation) this.loadingState.set(false); } })().finally(() => { if (this.activeRead !== state) return; this.activeRead = null; if (state.queued && generation === this.generation) void this.startRead(projectId, generation, true); }); this.activeRead = state; return state.promise; }
}
