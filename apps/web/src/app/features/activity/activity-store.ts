import { Injectable, inject, signal } from '@angular/core';
import type { ActivityFeedEntry, ProjectId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
/**
 * §57's feed for one project. Component-scoped, never root (§20) — two Recent Activity
 * sections on two project pages are two different questions.
 */
@Injectable()
export class ActivityStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY); private generation = 0;
  private readonly itemsState = signal<ActivityFeedEntry[]>([]); private readonly loadingState = signal(false); private readonly errorState = signal<string | null>(null);
  readonly entries = this.itemsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly();
  /** `limit` keeps a section from becoming the whole history of a busy project. */
  async load(projectId: ProjectId, limit = 20) { const generation = ++this.generation; this.loadingState.set(true); this.errorState.set(null); try { const entries = await this.gateway.activity.list({ projectId, limit }); if (generation === this.generation) this.itemsState.set(entries); } catch (e) { if (generation === this.generation) { this.itemsState.set([]); this.errorState.set(messageOf(e)); } } finally { if (generation === this.generation) this.loadingState.set(false); } }
}
