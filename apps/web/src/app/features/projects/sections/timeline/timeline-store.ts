import { Injectable, computed, inject, signal } from '@angular/core';
import type { ProjectId, TimelineItem } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
interface ActiveRead { generation: number; promise: Promise<void>; queued: boolean; }
@Injectable()
export class TimelineStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY); private generation = 0; private activeRead: ActiveRead | null = null;
  private readonly projectIdState = signal<ProjectId | null>(null); private readonly itemsState = signal<TimelineItem[]>([]); private readonly loadingState = signal(false); private readonly errorState = signal<string | null>(null); private readonly selectedState = signal<string | null>(null);
  readonly projectId = this.projectIdState.asReadonly(); readonly items = this.itemsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly(); readonly selectedId = this.selectedState.asReadonly(); readonly selectedItem = computed(() => this.itemsState().find(({id}) => id === this.selectedState()) ?? null);
  load(projectId: ProjectId): Promise<void> { this.projectIdState.set(projectId); this.selectedState.set(null); return this.startRead(projectId, ++this.generation, false); }
  sync(projectId: ProjectId): Promise<void> { if (this.projectIdState() !== projectId || this.generation === 0) return this.load(projectId); if (this.activeRead?.generation === this.generation) { this.activeRead.queued = true; return this.activeRead.promise; } return this.startRead(projectId, this.generation, true); }
  private startRead(projectId: ProjectId, generation: number, quiet: boolean): Promise<void> { const state = { generation, queued: false, promise: Promise.resolve() } as ActiveRead; if (!quiet) { this.loadingState.set(true); this.errorState.set(null); } state.promise = (async () => { try { const result = await this.gateway.timeline.get(projectId); if (generation === this.generation && this.projectIdState() === projectId) { this.itemsState.set([...result.items].sort((a,b) => a.startDate.localeCompare(b.startDate))); this.errorState.set(null); if (this.selectedState() !== null && !result.items.some(({ id }) => id === this.selectedState())) this.selectedState.set(null); } } catch (e) { if (!quiet && generation === this.generation && this.projectIdState() === projectId) { this.itemsState.set([]); this.errorState.set(messageOf(e)); } } finally { if (!quiet && generation === this.generation) this.loadingState.set(false); } })().finally(() => { if (this.activeRead !== state) return; this.activeRead = null; if (state.queued && generation === this.generation) void this.startRead(projectId, generation, true); }); this.activeRead = state; return state.promise; }
  toggleDetails(id: string) { this.selectedState.update((current) => current === id ? null : id); }
  select(id: string) { this.toggleDetails(id); }
}
