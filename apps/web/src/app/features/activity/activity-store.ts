import { DestroyRef, Injectable, PendingTasks, inject, signal } from '@angular/core';
import type { ActivityFeedEntry, LiveEvent, ProjectId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../core/live/live-updates';
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
/**
 * §57's feed for one project. Component-scoped, never root (§20) — two Recent Activity
 * sections on two project pages are two different questions.
 */
@Injectable()
export class ActivityStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY); private readonly pendingTasks = inject(PendingTasks); private generation = 0;
  private readonly itemsState = signal<ActivityFeedEntry[]>([]); private readonly loadingState = signal(false); private readonly errorState = signal<string | null>(null);
  readonly entries = this.itemsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly();
  /** What `load` was last asked for, so §62's quiet refresh can ask the same question again. */
  private projectId: ProjectId | null = null; private limit = 20;

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe((event) => this.onLiveEvent(event));
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  /** `limit` keeps a section from becoming the whole history of a busy project. */
  async load(projectId: ProjectId, limit = 20) { this.projectId = projectId; this.limit = limit; const generation = ++this.generation; this.loadingState.set(true); this.errorState.set(null); const settled = this.pendingTasks.add(); try { const entries = await this.gateway.activity.list({ projectId, limit }); if (generation === this.generation) this.itemsState.set(entries); } catch (e) { if (generation === this.generation) { this.itemsState.set([]); this.errorState.set(messageOf(e)); } } finally { settled(); if (generation === this.generation) this.loadingState.set(false); } }

  /**
   * §62's re-read: the same query, with none of `load`'s chrome. It never sets `loading` and
   * never clears the rendered feed on failure — every agent write reaches this store, and a
   * skeleton or an error flashing on someone else's mutation is worse than a stale line.
   */
  private async refresh(): Promise<void> {
    const projectId = this.projectId;
    if (projectId === null) return;
    // Claims a generation rather than reading one. A refresh started *after* a load is the
    // fresher question, so it must win — sharing the load's generation would let the older
    // response land last and quietly drop the line the frame announced. Claiming it also
    // means this read owns the loading flag, which is why the `finally` clears it.
    const generation = ++this.generation;
    const settled = this.pendingTasks.add();
    try {
      const entries = await this.gateway.activity.list({ projectId, limit: this.limit });
      if (generation === this.generation) this.itemsState.set(entries);
    } catch {
      // Quiet — see above.
    } finally {
      settled();
      if (generation === this.generation) this.loadingState.set(false);
    }
  }

  /** Every mutation in this project produces a feed line, so every one of them is news. */
  private onLiveEvent(event: LiveEvent): void {
    if (event.type === 'prototype.reloaded' || event.projectId === this.projectId) void this.refresh();
  }
}
