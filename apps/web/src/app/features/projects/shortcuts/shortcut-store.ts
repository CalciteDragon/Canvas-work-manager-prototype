import { Injectable, PendingTasks, inject, signal } from '@angular/core';
import type { ProjectId, ProjectPageId, ShortcutSource } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The Add shortcut picker’s source read. Placement writes remain with ProjectPageStore. */
@Injectable()
export class ShortcutStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly sourcesState = signal<ShortcutSource[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private generation = 0;

  readonly sources = this.sourcesState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  load(projectId: ProjectId, pageId: ProjectPageId): Promise<void> {
    const generation = ++this.generation;
    return this.track(async () => {
      this.loadingState.set(true);
      this.errorState.set(null);
      try {
        const sources = await this.gateway.shortcuts.sources(projectId, { pageId });
        if (generation !== this.generation) return;
        this.sourcesState.set(sources);
      } catch (error) {
        if (generation !== this.generation) return;
        this.sourcesState.set([]);
        this.errorState.set(messageOf(error));
      } finally {
        if (generation === this.generation) this.loadingState.set(false);
      }
    });
  }

  refresh(projectId: ProjectId, pageId: ProjectPageId): Promise<void> {
    return this.load(projectId, pageId);
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    return operation().finally(settled);
  }
}
