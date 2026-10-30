import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type {
  ProjectId,
  ProjectLayoutMode,
  ProjectPageId,
  SectionColumnSpan,
  SectionConfig,
  SectionId,
  SectionShortcutId,
  ShortcutSource,
} from '@cwm/contracts';
import { nameOf, shortcutNameOf } from '@cwm/contracts';
import { PrototypeSettings } from '../../core/config/prototype-settings';
import { ReceiptToast } from '../../core/history/receipt-toast';
import { ProjectPageStore, type ProjectCanvasPlacement } from './project-page-store';
import { SectionCreateDialog } from './section-create-dialog';
import { Toast } from '../../shared/feedback/toast';
import { Icon } from '../../shared/components/icon/icon';
import { LiftStack } from '../../shared/lifts/lift-stack';
import { attachScrollHold } from './canvas-chrome/scroll-hold';
import { gridInsertionGaps } from './canvas-chrome/grid-insertion-gaps';
import { InsertionPoint, type InsertionIntent } from './canvas-chrome/insertion-point';
import { moveDirectionFor } from './canvas-chrome/move-keys';
import { toolbarFocusin, toolbarKeydown } from './canvas-chrome/toolbar-keys';
import { SectionResizeHandle, type ResizeMeasurement } from './canvas-chrome/section-resize-handle';
import { ProjectSectionFrame } from './sections/section-frame/project-section-frame';
import { SECTION_REGISTRY, definitionFor } from './sections/registry';
import { ShortcutFrame } from './shortcuts/shortcut-frame';
import { ShortcutStore } from './shortcuts/shortcut-store';
import { canvasRefreshFailedFeedback, sectionRemoveFailedFeedback } from './history/history-feedback';
import { FailureMessage } from '../../shared/feedback/failure-message';
import type { Failure } from '../../shared/feedback/failure';

interface GridInsertionTarget {
  index: number;
  availableColumns: number;
  columnSpan: SectionColumnSpan;
  hostId: string;
  beforeId: string | null;
  hostSpan: SectionColumnSpan;
}

/** §27's single-page canvas: always-available drag, insertion, resize and removal chrome. */
@Component({
  selector: 'app-project-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FailureMessage,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    Icon,
    InsertionPoint,
    ProjectSectionFrame,
    SectionCreateDialog,
    Toast,
    SectionResizeHandle,
    ShortcutFrame,
  ],
  providers: [ProjectPageStore, ShortcutStore],
  templateUrl: './project-canvas.html',
  styleUrl: './project-canvas.scss',
})
export class ProjectCanvas {
  readonly toast = new ReceiptToast();
  readonly projectId = input.required<ProjectId>();
  readonly pageId = input.required<ProjectPageId>();
  readonly projectLayoutMode = input.required<ProjectLayoutMode>();
  readonly shortcutsAllowed = input.required<boolean>();
  /** The project tree's root, for the store's live filter (Slice 65). */
  readonly rootProjectId = input.required<ProjectId>();
  readonly restoreBlocked = input<boolean>(false);
  readonly onProjectDataChange = input<() => void>(() => {});
  /** Page contract input; the canvas no longer writes the work hierarchy (Slice 66). */
  readonly onProjectHierarchyChange = input<() => void>(() => {});
  readonly onOpenArchive = input<(returnTo: HTMLElement) => void>(() => {});
  private readonly lifts = inject(LiftStack);
  private releaseLift: (() => void) | null = null;

  readonly store = inject(ProjectPageStore);
  readonly registry = SECTION_REGISTRY;
  readonly createDialogOpen = signal(false);
  readonly canvasMounted = signal(true);
  /** Covers overlays and the sibling add control from CDK drag start until drag end. */
  readonly sorting = signal(false);
  readonly toolbarFocusin = toolbarFocusin;
  readonly toolbarKeydown = toolbarKeydown;
  readonly resizePreview = signal<Record<string, SectionColumnSpan>>({});
  readonly keyboardMovePending = signal<ReadonlySet<string>>(new Set());
  readonly liveAnnouncement = signal('');
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly settings = inject(PrototypeSettings);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private pendingInsertion = signal<InsertionIntent | null>(null);
  private returnFocusTo: HTMLElement | null = null;
  /** The placement a dialog create just made; closing the dialog reveals it instead of returning focus. */
  private createdPlacementId: string | null = null;
  private releaseScrollHold: () => void = () => undefined;
  private readonly fragment = toSignal(inject(ActivatedRoute).fragment, { initialValue: null });
  private readonly releasedTarget = signal<SectionId | null>(null);
  private lastTargetKey: string | null = null;
  /** Focus that started inside a removed section, waiting for the (deferred) recovery notice. */
  private pendingRemovalFocus: {
    projectId: ProjectId;
    pageId: ProjectPageId;
    originalTarget: HTMLElement | null;
  } | null = null;

  readonly targetSectionId = computed<SectionId | null>(() => {
    const requested = requestedSectionId(this.fragment());
    if (requested === null) return null;
    return this.store.sections().some(({ id }) => id === requested) ? requested : null;
  });
  readonly targetMissing = computed(
    () => requestedSectionId(this.fragment()) !== null && !this.store.loading() && this.targetSectionId() === null,
  );
  readonly transientTargetId = computed<SectionId | null>(() => {
    const target = this.targetSectionId();
    return target === null || target === this.releasedTarget() ? null : target;
  });
  readonly layoutMode = computed<ProjectLayoutMode>(() =>
    this.settings.flags().gridProjectLayout ? this.projectLayoutMode() : 'flow',
  );
  readonly insertionGaps = computed<GridInsertionTarget[]>(() => {
    if (!this.store.orderComplete() || this.layoutMode() !== 'grid') return [];
    const placements = this.store.placements();
    return gridInsertionGaps(placements.map((placement) => placementSpan(placement))).flatMap((gap) => {
      const hostPlacement = placements[gap.index - 1];
      if (hostPlacement === undefined) return [];
      return [{
        ...gap,
        hostId: placementId(hostPlacement),
        beforeId: placements[gap.index] === undefined ? null : placementId(placements[gap.index]!),
        hostSpan: placementSpan(hostPlacement),
      }];
    });
  });

  readonly renameSection = async (id: SectionId, title: string | null): Promise<boolean> =>
    this.store.renameSection(id, title);
  readonly createSectionFromDialog = async (type: string, title: string | null): Promise<Failure | null> => {
    const intent = this.pendingInsertion();
    if (intent === null) return refusal('Choose an insertion point before creating a section.');
    const position = this.resolvePosition(intent);
    if (position === null) return refusal(INSERTION_POINT_GONE);
    const definition = definitionFor(type);
    if (definition === undefined) return refusal('This section type is not available.');
    const result = await this.store.addSection(definition, {
      position,
      columnSpan: intent.columnSpan,
      ...(title === null ? {} : { title }),
    });
    if (result.ok) this.createdPlacementId = result.placementId ?? null;
    return result.ok ? null : result.failure;
  };
  readonly createShortcutFromDialog = async (source: ShortcutSource): Promise<Failure | null> => {
    const intent = this.pendingInsertion();
    if (intent === null) return refusal('Choose an insertion point before creating a shortcut.');
    const position = this.resolvePosition(intent);
    if (position === null) return refusal(INSERTION_POINT_GONE);
    const result = await this.store.addShortcut({
      pageId: this.pageId(),
      sourceSectionId: source.sourceSectionId,
      position,
      columnSpan: intent.columnSpan,
    }, source.name);
    if (result.ok) this.createdPlacementId = result.placementId ?? null;
    return result.ok ? null : result.failure;
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.releaseLift?.();
      this.releaseScrollHold();
    });
    // The working placement stays still while placements above it grow (Slice 75, W1-030).
    afterNextRender(() => {
      this.releaseScrollHold = attachScrollHold(this.host.nativeElement, '.section-canvas__item');
    });
    effect(() => {
      const projectId = this.projectId();
      const pageId = this.pageId();
      const shortcutsAllowed = this.shortcutsAllowed();
      // Tracked: a cross-root move changes a workstream's root, and its canvas reloads for it.
      const rootProjectId = this.rootProjectId();
      this.releaseLift?.();
      this.releaseLift = null;
      this.returnFocusTo = null;
      this.createDialogOpen.set(false);
      this.pendingInsertion.set(null);
      untracked(() => void this.store.load(projectId, pageId, shortcutsAllowed, rootProjectId));
    });
    this.watchNavigationTarget();
    effect(() => {
      const notice = this.store.recoveryNotice();
      const failed = this.store.failedRemoval();
      untracked(() => {
        if (failed !== null) this.toast.show(sectionRemoveFailedFeedback(failed.failure), undefined, this.canvasFallback);
        else if (notice !== null && !notice.undoing) this.toast.show({ tone: 'status',
          message: notice.refreshFailed ? canvasRefreshFailedFeedback().message : notice.message,
        }, notice.refreshFailed ? undefined : notice.report, this.canvasFallback);
        else if (notice === null) this.toast.close();
      });
    });
  }

  private watchNavigationTarget(): void {
    effect(() => {
      const pageId = this.pageId();
      const target = this.targetSectionId();
      const key = target === null ? null : `${pageId}:${target}`;
      if (key === this.lastTargetKey) return;
      this.lastTargetKey = key;
      this.releasedTarget.set(null);
      if (target !== null) afterNextRender(() => this.revealTarget(target), { injector: this.injector });
    });
  }

  /**
   * Scrolls a placement to its top and focuses its heading: an arrival target, or a section or
   * shortcut a dialog create just made (Slice 75). Returns false when nothing by that id is drawn.
   */
  private revealTarget(id: string): boolean {
    const wrapper = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-section-id], [data-shortcut-id]')].find(
      (element) => element.getAttribute('data-section-id') === id || element.getAttribute('data-shortcut-id') === id,
    );
    if (wrapper === undefined) return false;
    wrapper.scrollIntoView?.({ block: 'start' });
    wrapper.querySelector<HTMLElement>('[data-section-title], [data-shortcut-title]')?.focus({ preventScroll: true });
    return true;
  }

  definitionFor(type: string) {
    return definitionFor(type);
  }

  placementId(placement: ProjectCanvasPlacement): string {
    return placementId(placement);
  }

  placementName(placement: ProjectCanvasPlacement): string {
    return placement.kind === 'section'
      ? nameOf(placement.section)
      : shortcutNameOf(placement.shortcut.source, placement.shortcut.sourceProjectName);
  }

  displayedSpan(placement: ProjectCanvasPlacement): SectionColumnSpan {
    return this.resizePreview()[placementId(placement)] ?? placementSpan(placement);
  }

  /** Every handle measures the same track, so one stable function serves them all. */
  readonly measureCanvas = (): ResizeMeasurement => {
    const canvas = this.host.nativeElement.querySelector<HTMLElement>('[data-section-canvas]');
    const style = canvas === null ? null : getComputedStyle(canvas);
    return {
      trackWidth: canvas?.getBoundingClientRect().width ?? 0,
      columnGap: style === null ? 0 : Number.parseFloat(style.columnGap) || 0,
    };
  };

  setResizePreview(id: string, span: SectionColumnSpan): void {
    this.resizePreview.update((current) => ({ ...current, [id]: span }));
  }

  clearResizePreview(id: string): void {
    this.resizePreview.update((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  commitResize(placement: ProjectCanvasPlacement, span: SectionColumnSpan): void {
    const id = placementId(placement);
    this.clearResizePreview(id);
    if (span === placementSpan(placement)) return;
    if (placement.kind === 'section') void this.store.setColumnSpan(placement.section.id, span);
    else void this.store.setColumnSpanShortcut(placement.shortcut.id, span);
  }

  cancelResize(placement: ProjectCanvasPlacement): void {
    this.clearResizePreview(placementId(placement));
  }

  gapTargetsAfter(placement: ProjectCanvasPlacement): GridInsertionTarget[] {
    const id = placementId(placement);
    return this.insertionGaps().filter((target) => target.hostId === id);
  }

  gapWidth(target: GridInsertionTarget): string {
    return `calc((100% + var(--space-4)) / ${target.hostSpan} * ${target.availableColumns} - var(--space-4))`;
  }

  openCreate(intent: InsertionIntent): void {
    if (!this.store.orderComplete() || this.sorting()) return;
    this.releaseLift = this.lifts.open(() => this.closeCreate());
    this.pendingInsertion.set(intent);
    this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.createdPlacementId = null;
    this.createDialogOpen.set(true);
  }

  unknownMoveKeydown(event: KeyboardEvent, id: string): void {
    const direction = moveDirectionFor(event.key);
    if (direction === null) return;
    event.preventDefault();
    if (!this.store.orderComplete() || this.keyboardMovePending().has(id)) return;
    void this.moveWithKeyboard(id, direction);
  }

  closeCreate(): void {
    this.releaseLift?.(); this.releaseLift = null;
    this.createDialogOpen.set(false);
    this.pendingInsertion.set(null);
    const focusTarget = this.returnFocusTo;
    const created = this.createdPlacementId;
    this.returnFocusTo = null;
    this.createdPlacementId = null;
    afterNextRender(() => {
      if (created !== null && this.revealTarget(created)) return;
      if (focusTarget?.isConnected) focusTarget.focus();
    }, { injector: this.injector });
  }

  resolvePosition(intent: InsertionIntent): number | null {
    if (intent.beforeId === null) return this.store.placements().length;
    const index = this.store.placements().findIndex((placement) => placementId(placement) === intent.beforeId);
    return index < 0 ? null : index;
  }

  async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const droppedPageId = this.pageId();
    const data = event.item.data as { kind?: string; id?: string } | string;
    const isShortcut = typeof data !== 'string' && data.kind === 'shortcut';
    const id = (typeof data === 'string' ? data : data.id) as string;
    const persisted = isShortcut
      ? await this.store.moveShortcut(id as SectionShortcutId, event.currentIndex)
      : await this.store.moveSection(id as SectionId, event.currentIndex);
    if (!persisted && this.pageId() === droppedPageId) {
      this.canvasMounted.set(false);
      this.changeDetector.detectChanges();
      this.canvasMounted.set(true);
      this.changeDetector.detectChanges();
    }
  }

  async moveWithKeyboard(id: string, direction: 'previous' | 'next'): Promise<void> {
    if (!this.store.orderComplete()) return;
    const placements = this.store.placements();
    const from = placements.findIndex((placement) => placementId(placement) === id);
    if (from < 0) return;
    const position = from + (direction === 'previous' ? -1 : 1);
    if (position < 0 || position >= placements.length) return;
    const moved = placements[from]!;
    this.keyboardMovePending.update((current) => new Set(current).add(id));
    const ok = moved.kind === 'section'
      ? await this.store.moveSection(moved.section.id, position)
      : await this.store.moveShortcut(moved.shortcut.id, position);
    if (ok) {
      this.liveAnnouncement.set(`Moved ${this.placementName(moved)} to position ${position + 1} of ${placements.length}.`);
    }
    afterNextRender(() => {
      const handle = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-section-drag-handle], [data-shortcut-drag-handle]')]
        .find((element) => element.closest<HTMLElement>('[data-section-id], [data-shortcut-id]')?.dataset['sectionId'] === id
          || element.closest<HTMLElement>('[data-section-id], [data-shortcut-id]')?.dataset['shortcutId'] === id);
      handle?.focus();
      this.keyboardMovePending.update((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, { injector: this.injector });
  }

  collapseShortcut(event: { id: SectionShortcutId; collapsed: boolean }): void {
    void this.store.setCollapsedShortcut(event.id, event.collapsed);
  }

  removeShortcut(id: SectionShortcutId): void {
    void this.store.removeShortcut(id);
  }

  async removeSectionFromCanvas(id: SectionId): Promise<boolean> {
    const projectId = this.projectId();
    const pageId = this.pageId();
    this.pendingRemovalFocus = null;
    const focusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusStartedInRemoval = this.focusIsInSection(id) || this.focusIsInRecoveryNotice();
    const removed = await this.store.removeSection(id, { exempt: this.focusIsInRecoveryNotice() });
    if (this.projectId() !== projectId || this.pageId() !== pageId) return removed;

    if (!removed) return false;
    // A vanished control hands focus to this action's first toast control.
    const active = document.activeElement;
    const focusWasNotMovedElsewhere = active === document.body || active === null || active === focusedElement;
    if (focusStartedInRemoval && focusWasNotMovedElsewhere) {
      this.pendingRemovalFocus = { projectId, pageId, originalTarget: focusedElement };
      afterNextRender(() => this.focusAfterRemoval(), { injector: this.injector });
    }
    return true;
  }

  /** Focus only after the toast's actions render, preserving a move made during the request. */
  focusAfterRemoval(): void {
    const pending = this.pendingRemovalFocus;
    if (pending === null) return;
    if (this.projectId() !== pending.projectId || this.pageId() !== pending.pageId) {
      this.pendingRemovalFocus = null;
      return;
    }
    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== pending.originalTarget) {
      this.pendingRemovalFocus = null;
      return;
    }
    const target = this.host.nativeElement.querySelector<HTMLElement>(':scope > app-toast [data-toast] button, :scope > app-toast [data-toast] a[href]');
    if (target === null && this.store.recoveryNotice() !== null) return;
    this.pendingRemovalFocus = null;
    (target ?? this.host.nativeElement.querySelector<HTMLElement>('[data-section-title]') ??
      this.host.nativeElement.querySelector<HTMLElement>('[data-section-canvas]'))?.focus();
  }

  retryFailedRemoval(): void {
    const failed = this.store.failedRemoval();
    if (failed !== null) void this.removeSectionFromCanvas(failed.sectionId);
  }

  readonly canvasFallback = (): HTMLElement | null => this.host.nativeElement.querySelector<HTMLElement>('[data-section-title]') ?? this.host.nativeElement.querySelector<HTMLElement>('[data-section-canvas]');

  dismissToast(): void {
    this.pendingRemovalFocus = null;
    this.toast.close();
    this.store.dismissRecoveryNotice();
    this.store.dismissFailedRemoval();
  }

  async undoRemoval(): Promise<void> {
    const id = this.store.recoveryNotice()?.removal?.sectionId;
    this.store.retainRemovalNoticeForUndo();
    await this.toast.undo(() => {
      const deadline = Date.now() + 2000;
      const focusReturnedSection = (): void => {
        const popover = this.host.nativeElement.querySelector<HTMLElement>(':scope > app-toast [data-toast]');
        if (!popover?.contains(document.activeElement)) return;
        const heading = id === undefined ? null : this.findSectionElement(id)?.querySelector<HTMLElement>('[data-section-title]');
        if (heading) heading.focus();
        else if (Date.now() < deadline) setTimeout(focusReturnedSection, 50);
      };
      focusReturnedSection();
    });
  }

  async retryRefresh(): Promise<void> {
    const projectId = this.projectId();
    const pageId = this.pageId();
    const retry = this.host.nativeElement.querySelector<HTMLElement>('[data-retry-refresh]');
    const focusedRetry = document.activeElement === retry;
    const refreshed = await this.store.retryRefresh();
    if (!refreshed || !focusedRetry || this.projectId() !== projectId || this.pageId() !== pageId) return;
    afterNextRender(() => {
      if (this.projectId() !== projectId || this.pageId() !== pageId || this.store.recoveryNotice()?.refreshFailed) return;
      const active = document.activeElement;
      if (active !== null && active !== document.body && active !== retry) return;
      const target = this.host.nativeElement.querySelector<HTMLElement>(':scope > app-toast [data-toast] button, :scope > app-toast [data-toast] a[href]') ??
        this.host.nativeElement.querySelector<HTMLElement>('[data-section-title]') ??
        this.host.nativeElement.querySelector<HTMLElement>('[data-section-canvas]');
      target?.focus();
    }, { injector: this.injector });
  }

  private focusIsInSection(id: SectionId): boolean {
    const active = document.activeElement;
    return active instanceof HTMLElement && this.findSectionElement(id)?.contains(active) === true;
  }

  private focusIsInRecoveryNotice(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLElement && this.host.nativeElement.contains(active) && active.closest('[data-toast]') !== null;
  }

  private findSectionElement(id: SectionId): HTMLElement | undefined {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-section-id]')]
      .find((element) => element.getAttribute('data-section-id') === id);
  }

  collapse(event: { id: SectionId; collapsed: boolean }): void {
    if (event.id === this.targetSectionId()) this.releasedTarget.set(event.id);
    void this.store.setCollapsed(event.id, event.collapsed);
  }

  /** Stable, awaited callback shared by all content frames. */
  readonly saveSectionConfig = (id: SectionId, config: SectionConfig): Promise<Failure | null> =>
    this.store.updateConfig(id, config);

  projectDataChanged(): void {
    this.store.notifyProjectDataChanged();
    this.onProjectDataChange()();
  }

}

/** The canvas's own create refusals: product sentences with no host reason, so no Details (Slice 78). */
const refusal = (sentence: string): Failure => ({ sentence, reason: null });
const INSERTION_POINT_GONE = 'That insertion point is no longer available. Close this dialog and choose another point.';

const placementId = (placement: ProjectCanvasPlacement): string =>
  placement.kind === 'section' ? placement.section.id : placement.shortcut.id;


const placementSpan = (placement: ProjectCanvasPlacement): SectionColumnSpan =>
  placement.kind === 'section' ? placement.section.columnSpan : placement.shortcut.columnSpan;

const requestedSectionId = (fragment: string | null): SectionId | null => {
  if (fragment === null || !fragment.startsWith('section-')) return null;
  const id = fragment.slice('section-'.length);
  return id === '' ? null : (id as SectionId);
};
