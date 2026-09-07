import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgComponentOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  SectionColumnSpanSchema,
  nameOf,
  type ProjectPageKind,
  type ResolvedSectionShortcut,
  type SectionColumnSpan,
  type SectionConfig,
  type SectionShortcutId,
} from '@cwm/contracts';
import type { SectionContentInputs } from '../sections/section-contract';
import { definitionFor } from '../sections/registry';

/**
 * §27's read-only reference frame. It owns the placement's chrome and layout only; the
 * canonical source section is mounted through the same registry component with `readOnly` set
 * so a shortcut cannot accidentally grow a second task/reflection/config owner.
 */
@Component({
  selector: 'app-shortcut-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDragHandle, NgComponentOutlet, RouterLink],
  templateUrl: './shortcut-frame.html',
  styleUrl: './shortcut-frame.scss',
})
export class ShortcutFrame {
  readonly shortcut = input.required<ResolvedSectionShortcut>();
  readonly editMode = input.required<boolean>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();

  readonly collapseToggled = output<{ id: SectionShortcutId; collapsed: boolean }>();
  readonly resized = output<{ id: SectionShortcutId; columnSpan: SectionColumnSpan }>();
  readonly removeRequested = output<SectionShortcutId>();

  readonly columnSpans = [...SectionColumnSpanSchema.values];
  readonly sourceName = computed(() => nameOf(this.shortcut().source));
  readonly sourceDefinition = computed(() => definitionFor(this.shortcut().source.type));
  readonly sourceRoute = computed(() => {
    const shortcut = this.shortcut();
    return shortcut.sourcePageKind === 'work'
      ? ['/projects', shortcut.sourceProjectId]
      : ['/projects', shortcut.sourceProjectId, 'pages', shortcut.sourcePageKind];
  });
  readonly pageLabel = computed(() => pageLabel(this.shortcut().sourcePageKind));

  // Stable no-op callbacks are intentional: the source component receives the same contract as
  // a normal section, but a shortcut never lets content writes escape its read-only boundary.
  private readonly noopConfig = (_config: SectionConfig): void => {};
  private readonly noopProjectData = (): void => {};
  private readonly noopProjectHierarchy = (): void => {};

  readonly contentInputs = computed<SectionContentInputs>(() => ({
    section: this.shortcut().source,
    onConfigChange: this.noopConfig,
    onProjectDataChange: this.noopProjectData,
    onProjectHierarchyChange: this.noopProjectHierarchy,
    projectDataRevision: this.projectDataRevision(),
    projectHierarchyRevision: this.projectHierarchyRevision(),
    readOnly: true,
  }));

  toggleCollapsed(): void {
    const shortcut = this.shortcut();
    this.collapseToggled.emit({ id: shortcut.id, collapsed: !shortcut.collapsed });
  }

  resize(value: string): void {
    const columnSpan = SectionColumnSpanSchema.safeParse(Number(value));
    if (columnSpan.success) this.resized.emit({ id: this.shortcut().id, columnSpan: columnSpan.data });
  }
}

const pageLabel = (kind: ProjectPageKind): string =>
  kind === 'home'
    ? 'Home'
    : kind === 'work'
      ? 'Work canvas'
      : kind.charAt(0).toUpperCase() + kind.slice(1);
