import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import type { ProjectId, ProjectPageId, ShortcutSource } from '@cwm/contracts';
import { ProjectPageStore } from '../project-page-store';
import { ShortcutStore } from './shortcut-store';

/** §27's source picker. It chooses an identity; it never loads source rows into the picker. */
@Component({
  selector: 'app-shortcut-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shortcut-picker.html',
  styleUrl: './shortcut-picker.scss',
})
export class ShortcutPicker {
  readonly projectId = input.required<ProjectId>();
  readonly pageId = input.required<ProjectPageId>();

  readonly closed = output<void>();
  readonly added = output<void>();

  readonly store = inject(ShortcutStore);
  private readonly page = inject(ProjectPageStore);

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      const pageId = this.pageId();
      void this.store.load(projectId, pageId);
    });
  }

  async add(source: ShortcutSource): Promise<void> {
    if (source.alreadyPlaced) return;
    if (await this.page.addShortcut({ pageId: this.pageId(), sourceSectionId: source.sourceSectionId })) {
      this.added.emit();
    }
  }

  breadcrumb(source: ShortcutSource): string {
    return source.breadcrumb.join(' / ');
  }

  pageLabel(source: ShortcutSource): string {
    return source.pageKind === 'work'
      ? 'Work canvas'
      : source.pageKind.charAt(0).toUpperCase() + source.pageKind.slice(1);
  }
}
