import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { nameOf, type ProjectArchiveItem } from '@cwm/contracts';
import { Toast } from '../../../shared/feedback/toast';
import { FailureMessage } from '../../../shared/feedback/failure-message';
import { ReceiptToast } from '../../../core/history/receipt-toast';
import { restoredItemFeedback, restoredProjectFeedback } from '../history/history-feedback';
import type {
  ProjectId,
  ProjectLayoutMode,
  ProjectPageId,
} from '@cwm/contracts';
import { ArchivedRegion } from '../archived-region/archived-region';
import type { ArchiveRestoreRequest } from '../archived-region/archived-region';
import { ArchivePageStore } from './archive-page-store';
import type { ProjectPageRenderer } from '../project-page-contract';

/** §31's root-wide Archive page. It is a projection, not a page-owned canvas. */
@Component({
  selector: 'app-archive-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArchivedRegion, RouterLink, Toast, FailureMessage],
  providers: [ArchivePageStore],
  templateUrl: './archive-page.html',
  styleUrl: './archive-page.scss',
})
export class ArchivePage implements ProjectPageRenderer {
  readonly projectId = input.required<ProjectId>();
  readonly pageId = input.required<ProjectPageId | null>();
  readonly projectLayoutMode = input.required<ProjectLayoutMode>();
  readonly restoreBlocked = input.required<boolean>();
  readonly shortcutsAllowed = input.required<boolean>();
  /** Declared because the shell sets every renderer input; this page has no shortcuts to refresh. */
  readonly rootProjectId = input<ProjectId | null>(null);
  readonly onProjectDataChange = input.required<() => void>();
  readonly onProjectHierarchyChange = input.required<() => void>();
  readonly onOpenArchive = input<(returnTo: HTMLElement) => void>(() => {});

  readonly store = inject(ArchivePageStore);
  readonly toast = new ReceiptToast();
  readonly restoredRoute = signal<readonly unknown[] | null>(null);
  readonly restoredFragment = signal<string | undefined>(undefined);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly rootArchived = () => this.store.result()?.root.status === 'archived';

  constructor() {
    effect(() => {
      void this.store.load(this.projectId());
    });
    effect(() => {
      if (this.store.restoreReport() === null) untracked(() => this.toast.close('write'));
    });
  }

  async restore(request: ArchiveRestoreRequest): Promise<void> {
    const owner = document.activeElement;
    const owned = owner === document.body || owner instanceof HTMLElement && this.host.nativeElement.contains(owner) && owner.hasAttribute('data-archived-restore');
    const index = this.store.items().indexOf(request.item);
    const item = request.item;
    if (await this.store.restore(request.item, request.status)) {
      this.onProjectDataChange()();
      if (request.item.kind === 'subproject') this.onProjectHierarchyChange()();
      const route = item.kind === 'subproject' ? ['/projects', item.project.id]
        : !item.origin.pageEnabled ? null
          : item.origin.pageKind === 'work' ? ['/projects', item.origin.projectId]
            : ['/projects', item.origin.projectId, 'pages', item.origin.pageKind];
      this.restoredRoute.set(route);
      this.restoredFragment.set(item.kind === 'subproject' ? undefined : `section-${item.kind === 'section' ? item.section.id : item.kind === 'task' ? item.task.sectionId : item.reflection.sectionId}`);
      const feedback = item.kind === 'subproject' ? restoredProjectFeedback(item.project.name, request.status)
        : restoredItemFeedback(this.titleOf(item), item.origin.breadcrumb.map(step => step.name).join(' › '),
          ({ home: 'Home', work: 'Work', todos: 'Todos', archive: 'Archive', reflections: 'Reflections' })[item.origin.pageKind], item.origin.pageEnabled);
      this.toast.show(feedback, this.store.restoreReport() ?? undefined, () => {
        const controls = this.host.nativeElement.querySelectorAll<HTMLElement>('[data-archived-restore]:not(:disabled)');
        return controls[index] ?? this.host.nativeElement.querySelector('#archive-page-title');
      });
      this.changeDetector.detectChanges();
      if (owned && (document.activeElement === document.body || document.activeElement === owner)) this.toast.focusFirst();
    }
  }

  private titleOf(item: Exclude<ProjectArchiveItem, { kind: 'subproject' }>): string {
    return item.kind === 'section' ? nameOf(item.section) : item.kind === 'task' ? item.task.title : item.reflection.title?.trim() || 'Reflection';
  }
}
