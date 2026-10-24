import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, PendingTasks, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectId, ProjectRestoreStatus } from '@cwm/contracts';
import { ArchivedProjectsStore } from './archived-projects-store';
import { Toast } from '../../../shared/feedback/toast';
import { ReceiptToast } from '../../../core/history/receipt-toast';
import { restoredProjectFeedback } from '../../projects/history/history-feedback';

/** Settings recovery works independently of a project route or enabled Archive page. */
@Component({
  selector: 'app-archived-projects-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Toast],
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
  readonly toast = new ReceiptToast();
  readonly restoredProjectId = signal<ProjectId | null>(null);
  private cancelFocusHandoff: (() => void) | null = null;

  constructor() {
    void this.store.load();
    // Settings has no project-scoped history provider to advance the toast's generation.
    effect(() => {
      if (this.store.restoreReport() === null) untracked(() => this.toast.close('write'));
      if (this.toast.state() === null) untracked(() => this.cancelFocusHandoff?.());
    });
    inject(DestroyRef).onDestroy(() => this.cancelFocusHandoff?.());
  }

  protected choose(id: ProjectId, event: Event): void {
    this.store.chooseStatus(id, (event.target as HTMLSelectElement).value as ProjectRestoreStatus | '');
  }

  /** Stability waits for the focus move too, not only for the store's write and re-read. */
  protected restore(id: ProjectId): Promise<void> {
    this.cancelFocusHandoff?.();
    const index = this.store.items().findIndex(({ project }) => project.id === id);
    const project = this.store.items()[index]?.project;
    const status = this.store.statusFor(id);
    const owner = document.activeElement;
    const owned = owner === document.body || owner instanceof HTMLElement && this.host.nativeElement.contains(owner) && owner.hasAttribute('data-archived-restore');
    return (async () => {
      const restored = await this.store.restore(id);
      if (restored && project && status !== '') {
        this.restoredProjectId.set(this.store.restoreReport()?.projectId ?? id);
        this.toast.show(restoredProjectFeedback(project.name, status), undefined, () => {
          const rows = this.host.nativeElement.querySelectorAll<HTMLElement>('[data-archived-project]');
          return rows[index]?.querySelector<HTMLElement>('[data-archived-restore]:not(:disabled)') ?? this.heading()?.nativeElement ?? null;
        });
        this.changeDetector.detectChanges();
        if (owned) await this.focusRenderedToast(owner);
      } else if (owned) {
        this.changeDetector.detectChanges();
        if (document.activeElement === document.body || document.activeElement === owner) this.focusNext(index);
      }
    })().finally(this.pendingTasks.add());
  }

  /** Native popovers can be open while their actions still have no layout boxes on reopening. */
  private focusRenderedToast(owner: Element | null): Promise<void> {
    const action = this.host.nativeElement.querySelector<HTMLElement>('[data-restore-open]');
    if (action === null) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const finish = (): void => {
        observer.disconnect();
        if (this.cancelFocusHandoff === finish) this.cancelFocusHandoff = null;
        resolve();
      };
      const observer = new ResizeObserver((entries) => {
        if (this.cancelFocusHandoff !== finish || !entries.some(({ target, contentRect }) =>
          target === action && contentRect.width > 0 && contentRect.height > 0)) return;
        finish();
        if (this.toast.state() !== null && (document.activeElement === document.body || document.activeElement === owner)) this.toast.focusFirst();
      });
      this.cancelFocusHandoff = finish;
      observer.observe(action);
    });
  }

  /** A successful Retry removes itself with the error, so it hands focus on the same way. */
  protected retry(): Promise<void> {
    return this.keepFocus('data-archived-retry', () => this.store.retry(), 0);
  }

  /**
   * Runs a Retry and, if its control owned focus and focus is lost when the error disappears,
   * moves focus on. A person who moved focus elsewhere during the request keeps it there.
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
