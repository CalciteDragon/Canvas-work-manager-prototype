import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import type { ProjectId, ProjectPageId, SectionConfig, SectionId, ShortcutSource } from '@cwm/contracts';
import { ShortcutStore } from './shortcut-store';
import { definitionFor } from '../sections/registry';
import type { SectionContentInputs } from '../sections/section-contract';

/** §27's source picker: identity discovery, with read-only content loaded on Preview. */
@Component({
  selector: 'app-shortcut-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
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
  readonly preview = signal<SectionId | null>(null);
  readonly definitionFor = definitionFor;
  private readonly noopConfig = async (_config: SectionConfig): Promise<boolean> => false;
  private readonly noopProjectData = (): void => {};
  readonly previewInputs = computed(() => new Map(this.store.sources().map((source) => [source.sourceSectionId, {
    section: source.section,
    onConfigChange: this.noopConfig,
    onProjectDataChange: this.noopProjectData,
    projectDataRevision: 0,
    projectHierarchyRevision: 0,
    readOnly: true,
    sourceLink: null,
  } satisfies SectionContentInputs])));
  readonly groups = computed(() => {
    const groups = new Map<string, { location: string; sources: ShortcutSource[] }>();
    for (const source of this.store.sources()) {
      const key = `${source.projectId}/${source.pageId}`;
      let group = groups.get(key);
      if (group === undefined) {
        group = { location: `${this.breadcrumb(source)} · ${this.pageLabel(source)}`, sources: [] };
        groups.set(key, group);
      }
      group.sources.push(source);
    }
    return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
  });

  previewToggled(source: ShortcutSource, event: Event): void {
    if ((event.target as HTMLDetailsElement).open) this.preview.set(source.sourceSectionId);
    else if (this.preview() === source.sourceSectionId) this.preview.set(null);
  }

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

  /**
   * The Add button's accessible name (slice 72, W3-017): its visible verb, then the row's own
   * identity, so two sources of one type never share a name. The source carries no title, so the
   * row's displayed name, breadcrumb and page stand in for `shortcutNameOf`.
   */
  addLabel(source: ShortcutSource): string {
    const verb = source.alreadyPlaced ? 'Added' : this.pending() ? 'Adding' : 'Add';
    return `${verb} ${source.name}, ${this.breadcrumb(source)} · ${this.pageLabel(source)}`;
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
