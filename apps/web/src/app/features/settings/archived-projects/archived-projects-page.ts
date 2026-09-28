import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, PendingTasks, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectId, ProjectRestoreStatus } from '@cwm/contracts';
import { ArchivedProjectsStore } from './archived-projects-store';

/** Settings recovery works independently of a project route or enabled Archive page. */
@Component({
  selector: 'app-archived-projects-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  providers: [ArchivedProjectsStore],
  templateUrl: './archived-projects-page.html',
  styleUrl: './archived-projects-page.scss',
})
export class ArchivedProjectsPage {
  protected readonly store = inject(ArchivedProjectsStore);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly pendingTasks = inject(PendingTasks);

  constructor() { void this.store.load(); }

  protected choose(id: ProjectId, event: Event): void {
    this.store.chooseStatus(id, (event.target as HTMLSelectElement).value as ProjectRestoreStatus | '');
  }

  /** Stability waits for the focus move too, not only for the store's write and re-read. */
  protected restore(id: ProjectId): Promise<void> {
    const index = this.store.items().findIndex(({ project }) => project.id === id);
    return this.keepFocus('data-archived-restore', () => this.store.restore(id), index);
  }

  /** A successful Retry removes itself with the error, so it hands focus on the same way. */
  protected retry(): Promise<void> {
    return this.keepFocus('data-archived-retry', () => this.store.retry(), 0);
  }

  /**
   * Runs a request started from `control` and, if that control owned focus and focus has been
   * lost by the time it settles, moves focus on. Restore disables its own button while pending
   * and a successful refresh removes its row, so focus is usually lost by then. A person who
   * moved focus elsewhere during the request keeps it there (Slice 47).
   */
  private keepFocus(control: string, request: () => Promise<boolean>, index: number): Promise<void> {
    const owner = document.activeElement;
    const owned = owner instanceof HTMLElement && this.host.nativeElement.contains(owner) && owner.hasAttribute(control);
    return (async () => {
      await request();
      if (!owned) return;
      this.changeDetector.detectChanges();
      const active = document.activeElement;
      if (active !== null && active !== document.body && active !== owner && active.isConnected) return;
      this.focusNext(index);
    })().finally(this.pendingTasks.add());
  }

  /**
   * The next usable control: Retry while the retained list is blocked by an error; otherwise the
   * enabled status selector now at `index` — the row that took a restored row's place, a child it
   * revealed, or the previous row when it was last; otherwise the heading. A later row's Restore
   * is disabled until a status is chosen, so it is never the target.
   */
  private focusNext(index: number): void {
    const host = this.host.nativeElement;
    const retry = host.querySelector<HTMLElement>('[data-archived-retry]:not(:disabled)');
    if (this.store.error() !== null && retry !== null) {
      retry.focus();
      return;
    }
    const statuses = [...host.querySelectorAll<HTMLElement>('[data-archived-status]:not(:disabled)')];
    (statuses[Math.min(Math.max(index, 0), statuses.length - 1)] ?? this.heading()?.nativeElement)?.focus();
  }
}
