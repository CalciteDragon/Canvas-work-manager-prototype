import { Injectable, PendingTasks, inject, signal } from '@angular/core';
import type { ProjectId, ProjectPageId, ShortcutSource } from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { readFailure, type Failure } from '../../../shared/feedback/failure';

/** The Add shortcut picker’s source read. Placement writes remain with ProjectPageStore. */
@Injectable()
export class ShortcutStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly sourcesState = signal<ShortcutSource[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<Failure | null>(null);
  private target: { projectId: ProjectId; pageId: ProjectPageId } | null = null;
  private generation = 0;

  readonly sources = this.sourcesState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  /**
   * The discovery read's failure (Slice 78). A re-read of the same page keeps it on screen, its
   * Try again busy on `loading()`, until the read answers; another page's read clears it at once.
   * The picker's create failure is its own.
   */
  readonly error = this.errorState.asReadonly();

  load(projectId: ProjectId, pageId: ProjectPageId): Promise<void> {
    const generation = ++this.generation;
    if (this.target?.projectId !== projectId || this.target.pageId !== pageId) this.errorState.set(null);
    this.target = { projectId, pageId };
    return this.track(async () => {
      this.loadingState.set(true);
      try {
        const sources = await this.gateway.shortcuts.sources(projectId, { pageId });
        if (generation !== this.generation) return;
        this.sourcesState.set(sources);
        this.errorState.set(null);
      } catch (error) {
        if (generation !== this.generation) return;
        this.sourcesState.set([]);
        this.errorState.set(readFailure(error, 'the list of sections'));
      } finally {
        if (generation === this.generation) this.loadingState.set(false);
      }
    });
  }

  refresh(projectId: ProjectId, pageId: ProjectPageId): Promise<void> {
    return this.load(projectId, pageId);
  }

  /** Try again: repeats only the last discovery read. */
  retry(): Promise<void> {
    return this.target === null ? Promise.resolve() : this.load(this.target.projectId, this.target.pageId);
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    return operation().finally(settled);
  }
}
