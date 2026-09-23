import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
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
import { nameOf } from '@cwm/contracts';
import { PrototypeSettings } from '../../core/config/prototype-settings';
import { ProjectPageStore, type ProjectCanvasPlacement } from './project-page-store';
import { SectionCreateDialog } from './section-create-dialog';
import { SectionRemovalDialog } from './section-removal-dialog';
import { SectionRecoveryNotice } from './section-recovery-notice';
import { CanvasIcon } from './canvas-chrome/canvas-icon';
import { gridInsertionGaps } from './canvas-chrome/grid-insertion-gaps';
import { InsertionPoint, type InsertionIntent } from './canvas-chrome/insertion-point';
import { moveDirectionFor } from './canvas-chrome/move-keys';
import { SectionResizeHandle, type ResizeMeasurement } from './canvas-chrome/section-resize-handle';
import { ProjectSectionFrame } from './sections/section-frame/project-section-frame';
import { SECTION_REGISTRY, definitionFor } from './sections/registry';
import { ShortcutFrame } from './shortcuts/shortcut-frame';
import { ShortcutStore } from './shortcuts/shortcut-store';

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
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    CanvasIcon,
    InsertionPoint,
    ProjectSectionFrame,
    SectionCreateDialog,
    SectionRemovalDialog,
    SectionRecoveryNotice,
    SectionResizeHandle,
    ShortcutFrame,
  ],
  providers: [ProjectPageStore, ShortcutStore],
  templateUrl: './project-canvas.html',
  styleUrl: './project-canvas.scss',
})
export class ProjectCanvas {
  readonly projectId = input.required<ProjectId>();
  readonly pageId = input.required<ProjectPageId>();
  readonly projectLayoutMode = input.required<ProjectLayoutMode>();
  readonly shortcutsAllowed = input.required<boolean>();
  readonly restoreBlocked = input<boolean>(false);
  readonly onProjectDataChange = input<() => void>(() => {});
  readonly onProjectHierarchyChange = input<() => void>(() => {});
  readonly onOpenArchive = input<() => void>(() => {});

  readonly store = inject(ProjectPageStore);
  readonly registry = SECTION_REGISTRY;
  readonly createDialogOpen = signal(false);
  readonly canvasMounted = signal(true);
  readonly resizePreview = signal<Record<string, SectionColumnSpan>>({});
  readonly keyboardMovePending = signal<ReadonlySet<string>>(new Set());
  readonly liveAnnouncement = signal('');
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly settings = inject(PrototypeSettings);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private pendingInsertion = signal<InsertionIntent | null>(null);
  private returnFocusTo: HTMLElement | null = null;
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
  readonly createSectionFromDialog = async (type: string, title: string | null): Promise<string | null> => {
    const intent = this.pendingInsertion();
    if (intent === null) return 'Choose an insertion point before creating a section.';
    const position = this.resolvePosition(intent);
    if (position === null) return 'That insertion point is no longer available. Close this dialog and choose another point.';
    const definition = definitionFor(type);
    if (definition === undefined) return 'This section type is not available.';
    const result = await this.store.addSection(definition, {
      position,
      columnSpan: intent.columnSpan,
      ...(title === null ? {} : { title }),
    });
    return result.ok ? null : result.message;
  };
  readonly createShortcutFromDialog = async (source: ShortcutSource): Promise<string | null> => {
    const intent = this.pendingInsertion();
    if (intent === null) return 'Choose an insertion point before creating a shortcut.';
    const position = this.resolvePosition(intent);
    if (position === null) return 'That insertion point is no longer available. Close this dialog and choose another point.';
    const result = await this.store.addShortcut({
      pageId: this.pageId(),
      sourceSectionId: source.sourceSectionId,
      position,
      columnSpan: intent.columnSpan,
    });
    return result.ok ? null : result.message;
  };

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      const pageId = this.pageId();
      const shortcutsAllowed = this.shortcutsAllowed();
      this.createDialogOpen.set(false);
      this.pendingInsertion.set(null);
      untracked(() => void this.store.load(projectId, pageId, shortcutsAllowed));
    });
    this.watchNavigationTarget();
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

  private revealTarget(sectionId: SectionId): void {
    const wrapper = [...this.host.nativeElement.querySelectorAll('[data-section-id]')].find(
      (element) => element.getAttribute('data-section-id') === sectionId,
    ) as HTMLElement | undefined;
    if (wrapper === undefined) return;
    wrapper.scrollIntoView?.({ block: 'start' });
    (wrapper.querySelector('[data-section-title]') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  definitionFor(type: string) {
    return definitionFor(type);
  }

  placementId(placement: ProjectCanvasPlacement): string {
    return placementId(placement);
  }

  placementName(placement: ProjectCanvasPlacement): string {
    return placement.kind === 'section' ? nameOf(placement.section) : nameOf(placement.shortcut.source);
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
    if (!this.store.orderComplete()) return;
    this.pendingInsertion.set(intent);
    this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    this.createDialogOpen.set(false);
    this.pendingInsertion.set(null);
    const focusTarget = this.returnFocusTo;
    this.returnFocusTo = null;
    afterNextRender(() => focusTarget?.isConnected && focusTarget.focus(), { injector: this.injector });
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

  cascadeAndRemove(id: SectionId): void {
    void this.removeSectionFromCanvas(id, { policy: 'cascade' });
  }

  reassignAndRemove(id: SectionId, reassignToSectionId: SectionId): void {
    void this.removeSectionFromCanvas(id, { policy: 'reassign', reassignToSectionId });
  }

  async removeSectionFromCanvas(id: SectionId, input: Parameters<ProjectPageStore['removeSection']>[1] = {}): Promise<boolean> {
    const projectId = this.projectId();
    const pageId = this.pageId();
    this.pendingRemovalFocus = null;
    const focusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusStartedInRemoval = this.focusIsInSectionOrDialog(id) || this.focusIsInRecoveryNotice();
    const removed = await this.store.removeSection(id, input);
    if (this.projectId() !== projectId || this.pageId() !== pageId) return removed;

    const prompt = this.store.removalPrompt();
    if (prompt?.sectionId === id && focusStartedInRemoval) {
      afterNextRender(() => {
        if (this.projectId() !== projectId || this.pageId() !== pageId || this.store.removalPrompt() !== prompt) return;
        this.host.nativeElement.querySelector<HTMLButtonElement>('[data-section-removal-cancel]')?.focus();
      }, { injector: this.injector });
      return removed;
    }

    if (!removed) return false;
    // The section that held focus is gone. Undo is in the header (Slice 41); here focus goes to the
    // recovery notice's Open Archive when one is offered, else to the canvas.
    const active = document.activeElement;
    const focusWasNotMovedElsewhere = active === document.body || active === null || active === focusedElement;
    if (focusStartedInRemoval && focusWasNotMovedElsewhere) {
      this.pendingRemovalFocus = { projectId, pageId, originalTarget: focusedElement };
      afterNextRender(() => this.focusAfterRemoval(), { injector: this.injector });
    }
    return true;
  }

  /** Called after render and by the deferred notice once it renders, so slow chunk loading cannot lose focus. */
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
    const target = this.host.nativeElement.querySelector<HTMLElement>('[data-open-archive]') ??
      this.host.nativeElement.querySelector<HTMLElement>('[data-recovery-notice]');
    // The notice is deferred; its `ready` calls back here once it has rendered.
    if (target === null && this.store.recoveryNotice() !== null) return;
    this.pendingRemovalFocus = null;
    (target ?? this.host.nativeElement.querySelector<HTMLElement>('[data-section-title]') ??
      this.host.nativeElement.querySelector<HTMLElement>('[data-section-canvas]'))?.focus();
  }

  dismissRecoveryNotice(): void {
    this.pendingRemovalFocus = null;
    const projectId = this.projectId();
    const pageId = this.pageId();
    this.store.dismissRecoveryNotice();
    afterNextRender(() => {
      if (this.projectId() !== projectId || this.pageId() !== pageId || this.store.recoveryNotice() !== null) return;
      const retry = this.store.failedRemoval() === null
        ? null
        : this.host.nativeElement.querySelector<HTMLElement>('[data-retry-remove]');
      const firstTitle = this.host.nativeElement.querySelector<HTMLElement>('[data-section-title]');
      (retry ?? firstTitle ?? this.host.nativeElement.querySelector<HTMLElement>('[data-section-canvas]'))?.focus();
    }, { injector: this.injector });
  }

  dismissFailedRemoval(): void {
    const projectId = this.projectId();
    const pageId = this.pageId();
    const failedSectionId = this.store.failedRemoval()?.sectionId;
    this.store.dismissFailedRemoval();
    afterNextRender(() => {
      if (this.projectId() !== projectId || this.pageId() !== pageId || this.store.failedRemoval() !== null) return;
      if (this.store.recoveryNotice() !== null) {
        const archiveAction = this.host.nativeElement.querySelector<HTMLElement>('[data-open-archive]');
        const notice = this.host.nativeElement.querySelector<HTMLElement>('[data-recovery-notice]');
        (archiveAction ?? notice)?.focus();
        return;
      }
      const dismissedSectionTitle = failedSectionId === undefined
        ? null
        : this.findSectionElement(failedSectionId)?.querySelector<HTMLElement>('[data-section-title]');
      const firstTitle = this.host.nativeElement.querySelector<HTMLElement>('[data-section-title]');
      (dismissedSectionTitle ?? firstTitle ?? this.host.nativeElement.querySelector<HTMLElement>('[data-section-canvas]'))?.focus();
    }, { injector: this.injector });
  }

  openArchiveFromNotice(): void {
    this.onOpenArchive()();
  }

  cancelRemovalPrompt(id: SectionId): void {
    const projectId = this.projectId();
    const pageId = this.pageId();
    this.store.dismissRemovalPrompt();
    afterNextRender(() => {
      if (this.projectId() !== projectId || this.pageId() !== pageId) return;
      const frame = this.findSectionElement(id);
      const removeButton = frame?.querySelector<HTMLElement>('[data-section-remove], [data-unknown-section-remove]');
      (removeButton ?? frame?.querySelector<HTMLElement>('[data-section-title]'))?.focus();
    }, { injector: this.injector });
  }

  retryFailedRemoval(): void {
    const failed = this.store.failedRemoval();
    if (failed !== null) void this.removeSectionFromCanvas(failed.sectionId, failed.input);
  }

  retryRefresh(): void {
    void this.store.retryRefresh();
  }

  private focusIsInSectionOrDialog(id: SectionId): boolean {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    if (this.findSectionElement(id)?.contains(active)) return true;
    return this.store.removalPrompt()?.sectionId === id && active.closest('[data-section-removal-dialog]') !== null;
  }

  private focusIsInRecoveryNotice(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLElement && active.closest('app-section-recovery-notice') !== null;
  }

  private findSectionElement(id: SectionId): HTMLElement | undefined {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-section-id]')]
      .find((element) => element.getAttribute('data-section-id') === id);
  }

  collapse(event: { id: SectionId; collapsed: boolean }): void {
    if (event.id === this.targetSectionId()) this.releasedTarget.set(event.id);
    void this.store.setCollapsed(event.id, event.collapsed);
  }

  saveConfig(event: { id: SectionId; config: SectionConfig }): void {
    void this.store.updateConfig(event.id, event.config);
  }

  projectDataChanged(): void {
    this.store.notifyProjectDataChanged();
    this.onProjectDataChange()();
  }

  projectHierarchyChanged(): void {
    this.store.notifyProjectHierarchyChanged();
    this.onProjectHierarchyChange()();
  }
}

const placementId = (placement: ProjectCanvasPlacement): string =>
  placement.kind === 'section' ? placement.section.id : placement.shortcut.id;


const placementSpan = (placement: ProjectCanvasPlacement): SectionColumnSpan =>
  placement.kind === 'section' ? placement.section.columnSpan : placement.shortcut.columnSpan;

const requestedSectionId = (fragment: string | null): SectionId | null => {
  if (fragment === null || !fragment.startsWith('section-')) return null;
  const id = fragment.slice('section-'.length);
  return id === '' ? null : (id as SectionId);
};
