import { Injectable, computed, inject, signal } from '@angular/core';
import type { ProjectId, TimelineItem } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
@Injectable()
export class TimelineStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY); private generation = 0;
  private readonly projectIdState = signal<ProjectId | null>(null); private readonly itemsState = signal<TimelineItem[]>([]); private readonly loadingState = signal(false); private readonly errorState = signal<string | null>(null); private readonly selectedState = signal<string | null>(null);
  readonly projectId = this.projectIdState.asReadonly(); readonly items = this.itemsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly(); readonly selectedId = this.selectedState.asReadonly(); readonly selectedItem = computed(() => this.itemsState().find(({id}) => id === this.selectedState()) ?? null);
  async load(projectId: ProjectId) { const generation = ++this.generation; this.projectIdState.set(projectId); this.loadingState.set(true); this.errorState.set(null); this.selectedState.set(null); try { const result = await this.gateway.timeline.get(projectId); if (generation === this.generation) this.itemsState.set([...result.items].sort((a,b) => a.startDate.localeCompare(b.startDate))); } catch (e) { if (generation === this.generation) { this.itemsState.set([]); this.errorState.set(messageOf(e)); } } finally { if (generation === this.generation) this.loadingState.set(false); } }
  toggleDetails(id: string) { this.selectedState.update((current) => current === id ? null : id); }
  select(id: string) { this.toggleDetails(id); }
}
