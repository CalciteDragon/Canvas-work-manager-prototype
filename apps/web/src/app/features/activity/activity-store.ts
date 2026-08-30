import { Injectable, PendingTasks, inject, signal } from '@angular/core';
import type { ActivityFeedEntry, ProjectId } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
interface ActiveRead { generation: number; promise: Promise<void>; queued: boolean; }
/**
 * §57's feed for one project. Component-scoped, never root (§20) — two Recent Activity
 * sections on two project pages are two different questions.
 */
@Injectable()
export class ActivityStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY); private readonly pendingTasks = inject(PendingTasks); private generation = 0; private activeRead: ActiveRead | null = null;
  private readonly itemsState = signal<ActivityFeedEntry[]>([]); private readonly loadingState = signal(false); private readonly errorState = signal<string | null>(null);
  readonly entries = this.itemsState.asReadonly(); readonly loading = this.loadingState.asReadonly(); readonly error = this.errorState.asReadonly();
  /** What `load` was last asked for, so §62's quiet refresh can ask the same question again. */
  private projectId: ProjectId | null = null; private limit = 20;

  /** `limit` keeps a section from becoming the whole history of a busy project. */
  load(projectId: ProjectId, limit = 20): Promise<void> { this.projectId = projectId; this.limit = limit; return this.startRead(++this.generation, false); }

  /** First call is loud; later revision calls for the same project are quiet and coalesced. */
  sync(projectId: ProjectId, limit = 20): Promise<void> {
    if (this.projectId !== projectId || this.generation === 0) return this.load(projectId, limit);
    this.limit = limit;
    if (this.activeRead?.generation === this.generation) { this.activeRead.queued = true; return this.activeRead.promise; }
    return this.startRead(this.generation, true);
  }

  /**
   * §62's re-read: the same query, with none of `load`'s chrome. It never sets `loading` and
   * never clears the rendered feed on failure — every agent write reaches this store, and a
   * skeleton or an error flashing on someone else's mutation is worse than a stale line.
   */
  private startRead(generation: number, quiet: boolean): Promise<void> {
    const projectId = this.projectId;
    if (projectId === null) return Promise.resolve();
    const state = { generation, queued: false, promise: Promise.resolve() } as ActiveRead;
    const settled = this.pendingTasks.add();
    if (!quiet) { this.loadingState.set(true); this.errorState.set(null); }
    state.promise = (async () => { try {
      const entries = await this.gateway.activity.list({ projectId, limit: this.limit });
      if (generation === this.generation && this.projectId === projectId) { this.itemsState.set(entries); this.errorState.set(null); }
    } catch (error) {
      if (!quiet && generation === this.generation && this.projectId === projectId) { this.itemsState.set([]); this.errorState.set(messageOf(error)); }
    } finally {
      settled();
      if (!quiet && generation === this.generation) this.loadingState.set(false);
    } })().finally(() => {
      if (this.activeRead !== state) return;
      this.activeRead = null;
      if (state.queued && generation === this.generation) void this.startRead(generation, true);
    });
    this.activeRead = state;
    return state.promise;
  }
}
