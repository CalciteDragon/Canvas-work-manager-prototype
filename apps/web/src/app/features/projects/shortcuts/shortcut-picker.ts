import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ProjectId, ProjectPageId, ShortcutSource } from '@cwm/contracts';
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
  readonly create = input.required<(source: ShortcutSource) => Promise<string | null>>();

  readonly added = output<void>();
  /** Lets the enclosing create dialog keep its focus boundary while a placement is pending. */
  readonly pendingChanged = output<boolean>();
  readonly pending = signal(false);
  readonly createError = signal<string | null>(null);

  readonly store = inject(ShortcutStore);

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      const pageId = this.pageId();
      void this.store.load(projectId, pageId);
    });
  }

  async add(source: ShortcutSource): Promise<void> {
    if (source.alreadyPlaced || this.pending()) return;
    this.pending.set(true);
    this.pendingChanged.emit(true);
    this.createError.set(null);
    let created = false;
    try {
      const error = await this.create()(source);
      if (error === null) created = true;
      else this.createError.set(error);
    } catch (error) {
      this.createError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.pending.set(false);
      this.pendingChanged.emit(false);
    }
    if (created) this.added.emit();
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
