import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgComponentOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  nameOf,
  type ProjectPageKind,
  type ResolvedSectionShortcut,
  type SectionConfig,
  type SectionShortcutId,
} from '@cwm/contracts';
import type { SectionContentInputs } from '../sections/section-contract';
import { definitionFor } from '../sections/registry';
import { CanvasIcon } from '../canvas-chrome/canvas-icon';
import { moveDirectionFor } from '../canvas-chrome/move-keys';

/** §27's read-only reference frame. It owns placement chrome and never the source's content. */
@Component({
  selector: 'app-shortcut-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDragHandle, NgComponentOutlet, RouterLink, CanvasIcon],
  templateUrl: './shortcut-frame.html',
  styleUrl: './shortcut-frame.scss',
})
export class ShortcutFrame {
  readonly shortcut = input.required<ResolvedSectionShortcut>();
  readonly movePending = input(false);
  readonly moveAllowed = input(true);
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();

  readonly collapseToggled = output<{ id: SectionShortcutId; collapsed: boolean }>();
  readonly moveRequested = output<'previous' | 'next'>();
  readonly removeRequested = output<SectionShortcutId>();

  readonly sourceName = computed(() => nameOf(this.shortcut().source));
  readonly sourceDefinition = computed(() => definitionFor(this.shortcut().source.type));
  readonly sourceRoute = computed(() => {
    const shortcut = this.shortcut();
    return shortcut.sourcePageKind === 'work'
      ? ['/projects', shortcut.sourceProjectId]
      : ['/projects', shortcut.sourceProjectId, 'pages', shortcut.sourcePageKind];
  });
  readonly pageLabel = computed(() => pageLabel(this.shortcut().sourcePageKind));

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

  moveKeydown(event: KeyboardEvent): void {
    const direction = moveDirectionFor(event.key);
    if (direction === null) return;
    // Only move keys are swallowed while a move is unavailable; Tab must still leave the grip.
    event.preventDefault();
    if (this.movePending() || !this.moveAllowed()) return;
    this.moveRequested.emit(direction);
  }
}

const pageLabel = (kind: ProjectPageKind): string =>
  kind === 'home'
    ? 'Home'
    : kind === 'work'
      ? 'Work canvas'
      : kind.charAt(0).toUpperCase() + kind.slice(1);
