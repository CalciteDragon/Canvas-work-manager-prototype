import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
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
  imports: [ArchivedRegion],
  providers: [ArchivePageStore],
  templateUrl: './archive-page.html',
  styleUrl: './archive-page.scss',
})
export class ArchivePage implements ProjectPageRenderer {
  readonly projectId = input.required<ProjectId>();
  readonly pageId = input.required<ProjectPageId>();
  readonly projectLayoutMode = input.required<ProjectLayoutMode>();
  readonly restoreBlocked = input.required<boolean>();
  readonly shortcutsAllowed = input.required<boolean>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly onProjectHierarchyChange = input.required<() => void>();
  readonly onOpenArchive = input<() => void>(() => {});

  readonly store = inject(ArchivePageStore);

  readonly rootArchived = () => this.store.result()?.root.status === 'archived';

  constructor() {
    effect(() => {
      void this.store.load(this.projectId());
    });
  }

  async restore(request: ArchiveRestoreRequest): Promise<void> {
    if (await this.store.restore(request.item, request.status)) {
      this.onProjectDataChange()();
      if (request.item.kind === 'subproject') this.onProjectHierarchyChange()();
    }
  }
}
