import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgComponentOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { SECTION_FRAME_NAME } from '../sections/section-frame-name';
import {
  shortcutNameOf,
  type ProjectPageKind,
  type ResolvedSectionShortcut,
  type SectionConfig,
  type SectionShortcutId,
} from '@cwm/contracts';
import { READ_ONLY_CONFIG, type SectionContentInputs } from '../sections/section-contract';
import { definitionFor } from '../sections/registry';
import { Icon } from '../../../shared/components/icon/icon';
import { FailureMessage } from '../../../shared/feedback/failure-message';
import type { Failure } from '../../../shared/feedback/failure';
import { PinnedFailureDirective } from '../../../shared/feedback/pinned-failure.directive';
import { toolbarKeydown, toolbarFocusin } from '../canvas-chrome/toolbar-keys';
import { moveDirectionFor } from '../canvas-chrome/move-keys';

/** §27's read-only reference frame. It owns placement chrome and never the source's content. */
@Component({
  selector: 'app-shortcut-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDragHandle, NgComponentOutlet, RouterLink, Icon, FailureMessage, PinnedFailureDirective],
  templateUrl: './shortcut-frame.html',
  styleUrl: './shortcut-frame.scss',
  // Content names itself from what this frame displays (slice 72, L5-004).
  providers: [{ provide: SECTION_FRAME_NAME, useFactory: () => inject(ShortcutFrame).name }],
})
export class ShortcutFrame {
  readonly shortcut = input.required<ResolvedSectionShortcut>();
  readonly collapsePending = input(false);
  readonly collapseError = input<Failure | null>(null);
  readonly toolbarKeydown = toolbarKeydown;
  readonly toolbarFocusin = toolbarFocusin;
  readonly movePending = input(false);
  readonly moveAllowed = input(true);
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  /**
   * The page's project or an ancestor is archived (Slice 79): no drag or remove, and collapse
   * toggles a local view that is never saved (Open question 4 (a)).
   */
  readonly readOnly = input(false);

  readonly collapseToggled = output<{ id: SectionShortcutId; collapsed: boolean }>();
  readonly moveRequested = output<'previous' | 'next'>();
  readonly removeRequested = output<SectionShortcutId>();

  /**
   * The read-only toggle's view. Another shortcut, a changed stored state or `readOnly` changing
   * either way resets it to the stored state; a quiet re-read of the same state keeps it.
   */
  private readonly localCollapsed = linkedSignal<string, boolean | null>({
    // A computed, so an equal key stops here: `linkedSignal` reruns on any change to its source's reads.
    source: computed(() => `${this.shortcut().id}|${this.shortcut().collapsed}|${this.readOnly()}`),
    computation: () => null,
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly effectiveCollapsed = computed(
    () => {
      // Read even when live, so the key sees the live phase and a later read-only view starts fresh.
      const local = this.localCollapsed();
      return (this.readOnly() ? local : null) ?? this.shortcut().collapsed;
    },
  );
  readonly name = computed(() => shortcutNameOf(this.shortcut().source, this.shortcut().sourceProjectName));
  readonly sourceDefinition = computed(() => definitionFor(this.shortcut().source.type));
  readonly sourceRoute = computed(() => {
    const shortcut = this.shortcut();
    return shortcut.sourcePageKind === 'work'
      ? ['/projects', shortcut.sourceProjectId]
      : ['/projects', shortcut.sourceProjectId, 'pages', shortcut.sourcePageKind];
  });
  readonly pageLabel = computed(() => pageLabel(this.shortcut().sourcePageKind));
  readonly sourceLink = computed(() => ({ route: this.sourceRoute(), fragment: `section-${this.shortcut().source.id}` }));

  private readonly noopConfig = async (_config: SectionConfig): Promise<Failure | null> => READ_ONLY_CONFIG;
  private readonly noopProjectData = (): void => {};
  /** What a `summary: true` source type reported for the header, such as "12 tasks" (Slice 79). */
  readonly summary = signal<string | null>(null);
  private readonly reportSummary = (text: string | null): void => this.summary.set(text);
  /** Unmounted content (collapsed or unavailable) keeps no count current. */
  readonly shownSummary = computed(() =>
    this.effectiveCollapsed() || this.shortcut().availability !== 'available' ? null : this.summary(),
  );

  readonly contentInputs = computed<SectionContentInputs>(() => ({
    section: this.shortcut().source,
    onConfigChange: this.noopConfig,
    onProjectDataChange: this.noopProjectData,
    projectDataRevision: this.projectDataRevision(),
    projectHierarchyRevision: this.projectHierarchyRevision(),
    readOnly: true,
    sourceLink: this.sourceLink(),
    ...(this.sourceDefinition()?.summary ? { reportSummary: this.reportSummary } : {}),
  }));

  constructor() {
    // Roving focus may have left Collapse at -1 while Move or Remove held the stop; those go now.
    effect(() => {
      if (!this.readOnly()) return;
      this.host.nativeElement.querySelector<HTMLElement>('[data-shortcut-collapse]')?.setAttribute('tabindex', '0');
    });
  }

  toggleCollapsed(): void {
    if (this.readOnly()) {
      this.localCollapsed.set(!this.effectiveCollapsed());
      return;
    }
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
