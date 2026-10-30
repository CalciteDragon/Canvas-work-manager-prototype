import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import {
  SectionConfigSchema,
  SectionAlreadyRemovedDetailsSchema,
  nameOf,
  shortcutNameOf,
  type CreateSectionInput,
  type ProjectId,
  type ProjectPageId,
  type ProjectSection,
  type ResolvedSectionShortcut,
  type CreateSectionShortcutInput,
  type UpdateSectionShortcutInput,
  type SectionColumnSpan,
  type SectionConfig,
  type SectionId,
  type SectionShortcutId,
} from '@cwm/contracts';
import { GatewayError } from '../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { OPERATION_HISTORY_REPORTER, reportedWrite, type OperationWriteReport } from '../../core/history/operation-history-reporter';
import { LIVE_UPDATES } from '../../core/live/live-updates';
import type { LiveEvent } from '@cwm/contracts';
import { canvasRefreshFailedFeedback, sectionRemovedFeedback } from './history/history-feedback';
import { readFailure, writeFailure, type Failure } from '../../shared/feedback/failure';
import type { SectionDefinition } from './sections/registry';

/** Said before any write, so it has no reason for Details (Slice 78). */
const FAILED_REMOVAL_GUARD: Failure = {
  sentence: 'Retry or dismiss the unresolved removal above before removing another section.',
  reason: null,
};

/** A canvas write's sentence, in slice 75's frame: "Couldn’t <verb> “X”. Try again." */
const placementWrite = (verb: string, placement: string): string => `Couldn’t ${verb} ${placement}. Try again.`;

/** The shortcuts read's failure (Slice 78): the canonical sections are on screen, so it names what is paused. */
const shortcutsReadFailure = (error: unknown): Failure => ({
  ...readFailure(error, 'this page’s shortcuts'),
  sentence: 'Couldn’t load all of this page’s sections, so adding and moving are paused.',
});

const byPosition = (a: ProjectSection, b: ProjectSection): number => a.position - b.position;

/** A section write's report names the section's own project, from the response (Slice 41). */
const sectionReport = ({ section, operation }: { section: ProjectSection; operation: OperationWriteReport['receipt'] }): OperationWriteReport =>
  ({ projectId: section.projectId, receipt: operation });

/** The notice sentence after a committed write whose follow-up read failed. */
const SAVED_REFRESH_FAILED = canvasRefreshFailedFeedback().message;

export type ProjectCanvasPlacement =
  | { kind: 'section'; section: ProjectSection }
  | { kind: 'shortcut'; shortcut: ResolvedSectionShortcut };

const placementId = (placement: ProjectCanvasPlacement): string =>
  placement.kind === 'section' ? placement.section.id : placement.shortcut.id;

const placementPosition = (placement: ProjectCanvasPlacement): number =>
  placement.kind === 'section' ? placement.section.position : placement.shortcut.position;

const byPlacementPosition = (a: ProjectCanvasPlacement, b: ProjectCanvasPlacement): number => {
  const position = placementPosition(a) - placementPosition(b);
  return position === 0 ? placementId(a).localeCompare(placementId(b)) : position;
};

/**
 * What the canvas-local recovery notice offers (Slice 41). **Undo is not here**: the project
 * header's Undo/Redo controls are the one action surface for history, so the notice keeps only what
 * the header cannot do — Open Archive after a removal Archive will list, and a read-only Retry
 * refresh after a committed write whose follow-up read failed. Retry remove is `FailedSectionRemoval`.
 */
export interface SectionRecoveryNoticeState {
  message: string;
  report?: OperationWriteReport;
  /** A toast Undo owns its confirmation while the returning section is rendered. */
  undoing?: boolean;
  /**
   * Set for a removal this canvas made or recovered; Archive is offered unless `archiveListed` is
   * `false`. The notice withdraws itself once `sectionId` is back on the canvas — a header Undo.
   */
  removal?: { sectionId?: SectionId; archiveListed?: boolean };
  refreshFailed?: boolean;
}

/** An explicit Retry remove repeats the exact canvas action after an uncertain failure. */
export interface FailedSectionRemoval {
  sectionId: SectionId;
  /** The sentence for the toast and the reason for its Details (Slice 78). */
  failure: Failure;
}

/**
 * A canvas creation result belongs to its popup, so failures are returned instead of stored. A
 * success names the created placement so the canvas can reveal and focus it (Slice 75); a write
 * that landed after its page changed has nothing on this canvas to name.
 */
export type CanvasWriteResult = { ok: true; placementId?: string } | { ok: false; failure: Failure };

/** `mutateWithResult`'s refusal before anything is sent: the first read has not answered. */
const CANVAS_STILL_LOADING: Failure = { sentence: 'The page is still loading. Try again in a moment.', reason: null };

type PlacementFieldValue = boolean | SectionColumnSpan;

interface PlacementFieldWriteState {
  nextSequence: number;
  confirmedSequence: number;
  confirmedValue: PlacementFieldValue;
  pending: Map<number, PlacementFieldValue>;
}

/**
 * §19's canvas store: **the sections and shortcut placements of one page**, feature-scoped and provided by
 * `ProjectCanvas` alone (§20).
 *
 * It owns a canvas, not a project. §27's chain is `project → page → section → row`, and a root
 * has several pages, so "the project's sections" stopped being an answer — every read and
 * write here names a `pageId`. The project record, its progress and §26's writes to it belong
 * to `ProjectWorkspaceStore`, which the shell provides once per project; the two halves talk
 * through callback inputs rather than through a shared store.
 *
 * It does not compose `TaskListStore`: a Task List section owns its rows and provides its own
 * store, and re-reads on `projectDataRevision` like every other container. This store bumps
 * that revision.
 *
 * Canvas writes stay here behind the gateway interface. Positioned creates paint the returned
 * placement immediately, while direct width changes keep a field-only optimistic preview.
 */
@Injectable()
export class ProjectPageStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);
  /**
   * The header's history hears about every canvas write (Slice 41). Shortcut writes record in the
   * destination project — this canvas's project, the root on Home and the workstream on Work — so
   * their reports name it.
   */
  private readonly reporter = inject(OPERATION_HISTORY_REPORTER);

  private readonly sectionsState = signal<ProjectSection[]>([]);
  private readonly shortcutsState = signal<ResolvedSectionShortcut[]>([]);
  private readonly placementsState = signal<ProjectCanvasPlacement[]>([]);
  private readonly orderCompleteState = signal(false);
  // Starts true: before the first load resolves the page has no project, no error and no
  // loading flag, which matches none of the template's branches and paints blank.
  private readonly loadingState = signal(true);
  private loadGeneration = 0;
  /** Set before the first gateway await, so a startup frame can still be routed. */
  private requestedProjectId: ProjectId | undefined;
  private requestedPageId: ProjectPageId | undefined;
  private requestedShortcutsAllowed = true;
  /**
   * The root of the canvas's project tree, which live frames name as `rootProjectId`. A root's
   * Home is its own root; a workstream's Work canvas is not (Slice 65), so the shortcut half of
   * the live filter compares against this rather than the canvas's project.
   */
  private requestedRootProjectId: ProjectId | undefined;
  /**
   * Whether a load has completed. The staleness guards used to ask `projectState() !== null`,
   * which answered "is anything loaded" as a side effect; with the record gone, `sections()`
   * cannot take that job — an empty canvas is a legitimate state, not an unloaded one.
   */
  private loaded = false;
  private activeLoad: Promise<void> | null = null;
  private destroyed = false;
  private fullRecoveryQueued = false;
  /**
   * The sections read's failure (Slice 78). Kept until a read of the same page answers, so Try
   * again stays on screen, busy, while it re-reads.
   */
  private readonly errorState = signal<Failure | null>(null);
  /** Write failures. Never the shortcuts read's: an unrelated write must not clear that. */
  private readonly sectionErrorState = signal<Failure | null>(null);
  /** The shortcuts read's failure, apart from writes (§19). Writes and drag stay gated by `orderComplete`. */
  private readonly shortcutsErrorState = signal<Failure | null>(null);
  private readonly shortcutsRetryPendingState = signal(false);
  private readonly recoveryNoticeState = signal<SectionRecoveryNoticeState | null>(null);
  private readonly failedRemovalState = signal<FailedSectionRemoval | null>(null);
  private readonly removalPendingState = signal(false);
  private readonly pendingSectionWriteCountState = signal(0);
  private readonly canvasRevisionState = signal(0);
  private readonly projectDataRevisionState = signal(0);
  private readonly projectHierarchyRevisionState = signal(0);
  /**
   * Section writes in flight. §62's frames arrive *before* the tab's own mutation response
   * (the host flushes at commit) and `moveSection` paints optimistically — so a live re-read
   * landing in that window would replace the preview with the pre-write value for a frame.
   *
   * Deferred, **not** dropped. Positioned creates and section moves reconcile the canvas after
   * their write; removals and ordinary field updates patch or remove the current placement.
   * So an agent adding a section while the user happens to be collapsing one would otherwise
   * be lost until a reload.
   */
  private pendingSectionWrites = 0;
  private readonly sectionWriteWaiters: Array<{ threshold: number; resolve: () => void }> = [];
  /**
   * Bumped as each section write begins. `pendingSectionWrites` only stops a re-read from
   * *starting* during a write; a re-read already in flight when a write begins can answer after
   * that write's own reconcile, with the order from before it. Its answer is discarded and the
   * read issued again — otherwise the next keyboard move is computed from a stale index.
   */
  private sectionWriteEpoch = 0;
  private sectionRefresh: Promise<void> | null = null;
  private sectionRefreshQueued = false;
  private readonly fieldWrites = new Map<string, PlacementFieldWriteState>();
  private readonly failedCollapseIntent = new Map<string, boolean>();

  private readonly collapseErrorsState = signal<Partial<Record<string, Failure>>>({});
  private readonly collapsePendingState = signal<ReadonlySet<string>>(new Set());
  /** Collapse refusal text belongs to its placement, rather than the canvas banner. */
  readonly collapseErrors = this.collapseErrorsState.asReadonly();
  /** Placements with one or more collapse requests still in flight. */
  readonly collapsePending = this.collapsePendingState.asReadonly();

  readonly sections = this.sectionsState.asReadonly();
  readonly shortcuts = this.shortcutsState.asReadonly();
  readonly placements = this.placementsState.asReadonly();
  /** True while every placement kind that the page permits has been read successfully. */
  readonly orderComplete = this.orderCompleteState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly sectionError = this.sectionErrorState.asReadonly();
  readonly shortcutsError = this.shortcutsErrorState.asReadonly();
  /** True while `retryShortcuts` runs: the shortcuts failure's Try again is busy. */
  readonly shortcutsRetryPending = this.shortcutsRetryPendingState.asReadonly();
  readonly canvasRevision = this.canvasRevisionState.asReadonly();
  readonly projectDataRevision = this.projectDataRevisionState.asReadonly();
  readonly recoveryNotice = this.recoveryNoticeState.asReadonly();
  readonly failedRemoval = this.failedRemovalState.asReadonly();
  readonly removalPending = this.removalPendingState.asReadonly();
  readonly recoveryBusy = computed(() => this.removalPendingState() || this.pendingSectionWriteCountState() > 0);
  readonly projectHierarchyRevision = this.projectHierarchyRevisionState.asReadonly();

  constructor() {
    // §62. Subscribing here rather than in `ProjectCanvas` keeps the component free of the
    // stream, the same way it is free of the gateway; `DestroyRef` ties the subscription to
    // the store's own lifetime, and this store is provided by the canvas (§20).
    const unsubscribe = inject(LIVE_UPDATES).subscribe(
      (event) => this.onLiveEvent(event),
      () => this.onLiveConnected(),
    );
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.loadGeneration += 1;
      unsubscribe();
    });
  }

  /**
   * §62's "refresh relevant state", for one canvas.
   *
   * Ordinary mutation and reconnect paths are **quiet**: an agent's write must not flicker
   * a skeleton over a page the user is reading, and a host blip during someone else's write
   * must not replace the canvas with an error. `prototype.reloaded` is the deliberate loud
   * exception because the host document and its derived inputs may all have been replaced.
   * `refreshSections` and `reconcileSections` behave quietly; `TaskListStore.refresh` was
   * given the same rule.
   *
   * Routing is on `type` and `projectId`, never on `entityType` — §57's section events
   * deliberately name the *project* as their entity. The **hierarchy** revision is the one
   * exception that ignores `projectId`: Timeline reads the work tree, so
   * a sibling's creation has to move it.
   */
  private onLiveEvent(event: LiveEvent): void {
    // A host-state change (seed, reset, clock) replaces everything this canvas is built from.
    if (event.type === 'prototype.reloaded') {
      const projectId = this.requestedProjectId;
      const pageId = this.requestedPageId;
      if (projectId !== undefined && pageId !== undefined) {
        void this.load(projectId, pageId, this.requestedShortcutsAllowed, this.requestedRootProjectId);
      }
      return;
    }

    const projectId = this.requestedProjectId;
    if (projectId === undefined) return;

    const changesSectionExistence =
      event.type === 'task.created' || event.type === 'reflection.added' ||
      event.type === 'task.task_addition_undone' || event.type === 'task.task_addition_redone' ||
      event.type === 'reflection.reflection_addition_undone' || event.type === 'reflection.reflection_addition_redone';
    const aboutThisProject =
      event.projectId === projectId || (event.type.startsWith('project.') && event.entityId === projectId);
    const hasShortcuts = this.shortcutsState().length > 0;
    const isInRootTree = event.rootProjectId === (this.requestedRootProjectId ?? projectId);
    if (event.type.startsWith('project.')) this.notifyProjectHierarchyChanged();
    if (!aboutThisProject && !(hasShortcuts && isInRootTree)) return;

    // The containers re-read themselves off the revision. Project frames change the canvas
    // directly; reversing or replaying a row Add can also remove/restore its implicit container.
    this.notifyProjectDataChanged();
    if (this.activeLoad !== null) {
      this.fullRecoveryQueued = true;
      return;
    }
    if (!event.type.startsWith('project.') && !changesSectionExistence) return;
    if (this.pendingSectionWrites > 0) {
      this.sectionRefreshQueued = true;
      return;
    }
    if (aboutThisProject) void this.refreshSections();
    else void this.refreshShortcuts();
  }

  /** Local cross-section invalidation and the current-project half of a live event. */
  notifyProjectDataChanged(): void {
    this.projectDataRevisionState.update((revision) => revision + 1);
  }

  /** Local hierarchy invalidation and the workspace-project half of a live event. */
  notifyProjectHierarchyChanged(): void {
    this.projectHierarchyRevisionState.update((revision) => revision + 1);
  }

  private onLiveConnected(): void {
    if (this.requestedProjectId === undefined) return;
    this.notifyProjectDataChanged();
    this.notifyProjectHierarchyChanged();
    this.queueFullRecovery();
  }

  private queueFullRecovery(): void {
    if (this.activeLoad !== null) {
      this.fullRecoveryQueued = true;
      return;
    }
    void this.refreshSections();
  }

  /**
   * This canvas, re-read after someone else changed it. Quiet on failure for the same reason
   * `reconcileSections` is: the page on screen is still the better answer than an error the
   * user did not cause.
   */
  private refreshSections(): Promise<void> {
    if (this.pendingSectionWrites > 0) {
      this.sectionRefreshQueued = true;
      return Promise.resolve();
    }
    if (this.sectionRefresh !== null) {
      this.sectionRefreshQueued = true;
      return this.sectionRefresh;
    }
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (projectId === undefined || pageId === undefined) return Promise.resolve();
    const generation = this.loadGeneration;

    const refresh = this.track(async () => {
      do {
        this.sectionRefreshQueued = false;
        const epoch = this.sectionWriteEpoch;
        const [sectionsResult, shortcutsResult] = await Promise.allSettled([
          this.gateway.sections.list(projectId, { pageId }),
          this.readShortcuts(projectId, pageId),
        ]);
        if (!this.current(generation, projectId, pageId)) continue;
        if (epoch !== this.sectionWriteEpoch) {
          // Loops now if the write has settled; otherwise `whileWriting` runs the queued read.
          this.sectionRefreshQueued = true;
          continue;
        }
        this.orderCompleteState.set(
          !this.requestedShortcutsAllowed || shortcutsResult.status === 'fulfilled',
        );
        this.shortcutsErrorState.set(
          shortcutsResult.status === 'rejected' ? shortcutsReadFailure(shortcutsResult.reason) : null,
        );
        if (sectionsResult.status === 'rejected') {
          // Quiet — see above. Keep the currently painted canvas intact.
          continue;
        }
        const sections = [...sectionsResult.value].sort(byPosition);
        this.acceptCollapseRead(this.composePlacements(sections, shortcutsResult.status === 'fulfilled' ? shortcutsResult.value : []));
        if (shortcutsResult.status === 'fulfilled') {
          this.setCanvas(this.composePlacements(sections, shortcutsResult.value));
          this.sectionErrorState.set(null);
        } else {
          // A shortcut read is a partial failure: the canonical section canvas remains useful,
          // and the stale shortcut state is not silently discarded.
          this.setCanvas(this.composePlacements(sections, this.shortcutsState()));
        }
        // A recovery is a load. Without this a canvas that recovered from a failed first
        // read rendered every control and silently refused every write — no request, no
        // error, and a dragged section snapping back with nothing said.
        this.loaded = true;
        this.errorState.set(null);
      } while (
        this.sectionRefreshQueued &&
        this.pendingSectionWrites === 0 &&
        generation === this.loadGeneration
      );
    }).finally(() => {
      if (this.sectionRefresh === refresh) this.sectionRefresh = null;
    });
    this.sectionRefresh = refresh;
    return refresh;
  }

  /** A root frame needs shortcut identity refreshed when a descendant changes, not its sections. */
  private refreshShortcuts(): Promise<void> {
    if (this.pendingSectionWrites > 0) {
      this.sectionRefreshQueued = true;
      return Promise.resolve();
    }
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (projectId === undefined || pageId === undefined) return Promise.resolve();
    if (!this.requestedShortcutsAllowed) {
      this.setCanvas(this.composePlacements(this.sectionsState(), []));
      this.orderCompleteState.set(true);
      return Promise.resolve();
    }
    const generation = this.loadGeneration;
    const epoch = this.sectionWriteEpoch;
    return this.track(async () => {
      try {
        const shortcuts = await this.gateway.shortcuts.list(projectId, { pageId });
        if (!this.current(generation, projectId, pageId)) return;
        if (epoch !== this.sectionWriteEpoch) {
          await this.refreshSections();
          return;
        }
        this.acceptCollapseRead(this.composePlacements([], shortcuts));
        this.setCanvas(this.composePlacements(this.sectionsState(), shortcuts));
        this.orderCompleteState.set(true);
        this.shortcutsErrorState.set(null);
        this.sectionErrorState.set(null);
      } catch (error) {
        if (this.current(generation, projectId, pageId)) {
          this.orderCompleteState.set(false);
          this.shortcutsErrorState.set(shortcutsReadFailure(error));
        }
      }
    });
  }

  /** The failed sections read's Try again: the same load, which keeps the failure until it answers. */
  retry(): Promise<void> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (projectId === undefined || pageId === undefined) return Promise.resolve();
    return this.load(projectId, pageId, this.requestedShortcutsAllowed, this.requestedRootProjectId);
  }

  /** The failed shortcuts read's Try again: a re-read of the shortcuts alone, the canvas kept. */
  async retryShortcuts(): Promise<void> {
    const generation = this.loadGeneration;
    this.shortcutsRetryPendingState.set(true);
    try {
      await this.refreshShortcuts();
    } finally {
      // A retry left behind on another page must not end, or hold, the new page's busy state.
      if (generation === this.loadGeneration) this.shortcutsRetryPendingState.set(false);
    }
  }

  /**
   * The canvas of **one page** (§27). Navigating between two pages of the same root re-uses
   * this component and this store, so a response that lands after the page changed must write
   * nothing — the guard is the page as well as the project.
   *
   * `rootProjectId` defaults to the project itself, which is right for a root's Home; the shell
   * passes a workstream's root so live frames from elsewhere in the tree reach its shortcuts.
   */
  load(projectId: ProjectId, pageId: ProjectPageId, shortcutsAllowed = true, rootProjectId: ProjectId = projectId): Promise<void> {
    const generation = ++this.loadGeneration;
    this.fieldWrites.clear();
    this.failedCollapseIntent.clear();
    this.collapseErrorsState.set({});
    this.collapsePendingState.set(new Set());
    const current = () => generation === this.loadGeneration;
    const samePage = this.requestedProjectId === projectId && this.requestedPageId === pageId;
    this.requestedProjectId = projectId;
    this.requestedPageId = pageId;
    this.requestedShortcutsAllowed = shortcutsAllowed;
    this.requestedRootProjectId = rootProjectId;
    this.recoveryNoticeState.set(null);
    this.failedRemovalState.set(null);
    this.orderCompleteState.set(false);
    if (!shortcutsAllowed) this.setCanvas(this.composePlacements(this.sectionsState(), []));
    this.loaded = false;
    // A refresh in flight for the page being left exits on the generation check without
    // consuming this, and the flag would otherwise buy the *next* page a gratuitous re-read.
    this.sectionRefreshQueued = false;

    const operation = this.track(async () => {
      this.loadingState.set(true);
      // A re-read of the same page keeps its read failure until it answers (Slice 78).
      if (!samePage) this.errorState.set(null);
      this.sectionErrorState.set(null);
      this.shortcutsErrorState.set(null);
      this.shortcutsRetryPendingState.set(false);
      const [sectionsResult, shortcutsResult] = await Promise.allSettled([
        this.gateway.sections.list(projectId, { pageId }),
        this.readShortcuts(projectId, pageId),
      ]);
      if (!current()) return;
      this.orderCompleteState.set(!shortcutsAllowed || shortcutsResult.status === 'fulfilled');
      if (sectionsResult.status === 'rejected') {
        this.setCanvas([]);
        this.errorState.set(readFailure(sectionsResult.reason, 'this page'));
      } else {
        this.errorState.set(null);
        const sections = [...sectionsResult.value].sort(byPosition);
        if (shortcutsResult.status === 'fulfilled') {
          this.setCanvas(this.composePlacements(sections, shortcutsResult.value));
        } else {
          this.setCanvas(this.composePlacements(sections, []));
          this.shortcutsErrorState.set(shortcutsReadFailure(shortcutsResult.reason));
        }
        this.loaded = true;
      }
      this.loadingState.set(false);
    });
    this.activeLoad = operation;
    return operation.finally(() => {
      if (this.activeLoad !== operation) return;
      this.activeLoad = null;
      if (this.fullRecoveryQueued) {
        this.fullRecoveryQueued = false;
        this.queueFullRecovery();
      }
    });
  }

  /**
   * The store's standing staleness predicate. `loaded` is what the removed project record
   * used to answer as a side effect: an empty canvas is a legitimate state, so `sections()`
   * cannot say whether a load has happened.
   */
  private current(generation: number, projectId: ProjectId, pageId: ProjectPageId): boolean {
    return (
      !this.destroyed &&
      generation === this.loadGeneration &&
      this.requestedProjectId === projectId &&
      this.requestedPageId === pageId
    );
  }

  private composePlacements(
    sections: readonly ProjectSection[],
    shortcuts: readonly ResolvedSectionShortcut[],
  ): ProjectCanvasPlacement[] {
    return [
      ...sections.map((section) => ({ kind: 'section' as const, section })),
      ...shortcuts.map((shortcut) => ({ kind: 'shortcut' as const, shortcut })),
    ].sort(byPlacementPosition);
  }

  private readShortcuts(projectId: ProjectId, pageId: ProjectPageId): Promise<ResolvedSectionShortcut[]> {
    return this.requestedShortcutsAllowed ? this.gateway.shortcuts.list(projectId, { pageId }) : Promise.resolve([]);
  }

  private setCanvas(placements: readonly ProjectCanvasPlacement[]): void {
    const next = placements.map(placement => this.withPendingFields(placement));
    this.placementsState.set(next);
    // A removal notice that says "Removed … Open Archive" is wrong once the section is back (the
    // header's Undo, or anyone's): withdraw it rather than leave a stale route on screen.
    const removed = this.recoveryNoticeState()?.removal?.sectionId;
    if (!this.recoveryNoticeState()?.undoing && removed !== undefined && next.some((placement) => placement.kind === 'section' && placement.section.id === removed)) {
      this.recoveryNoticeState.set(null);
    }
    this.sectionsState.set(
      next.filter((placement): placement is Extract<ProjectCanvasPlacement, { kind: 'section' }> => placement.kind === 'section')
        .map((placement) => placement.section),
    );
    this.shortcutsState.set(
      next.filter((placement): placement is Extract<ProjectCanvasPlacement, { kind: 'shortcut' }> => placement.kind === 'shortcut')
        .map((placement) => placement.shortcut),
    );
  }

  private replaceSection(section: ProjectSection): void {
    const current = this.placementsState();
    const index = current.findIndex((placement) => placement.kind === 'section' && placement.section.id === section.id);
    if (index === -1) {
      this.setCanvas(this.composePlacements([...this.sectionsState(), section], this.shortcutsState()));
      return;
    }
    const next = [...current];
    next[index] = { kind: 'section', section };
    this.setCanvas(next);
  }

  private replaceShortcut(shortcut: ResolvedSectionShortcut): void {
    const current = this.placementsState();
    const index = current.findIndex((placement) => placement.kind === 'shortcut' && placement.shortcut.id === shortcut.id);
    if (index === -1) {
      this.setCanvas(this.composePlacements(this.sectionsState(), [...this.shortcutsState(), shortcut]));
      return;
    }
    const next = [...current];
    next[index] = { kind: 'shortcut', shortcut };
    this.setCanvas(next);
  }

  /**
   * Creates a section at a position in this page's combined placement order. The canvas
   * passes the registry's default config and resolves its remembered anchor before calling
   * here; an absent `position` still appends through the shared contract and domain rule.
   */
  addSection(
    definition: SectionDefinition,
    options: Pick<CreateSectionInput, 'position' | 'columnSpan' | 'title'> = {},
  ): Promise<CanvasWriteResult> {
    const sentence = options.title === undefined
      ? `Couldn’t add the ${definition.displayName} section. Try again.`
      : `Couldn’t add “${options.title}”. Try again.`;
    return this.mutateWithResult(sentence, async ({ current, projectId, pageId, generation }) => {
      // Parsed, not cast: §29 types `createDefaultConfig` as `unknown`, and a definition
      // that returns a non-object should fail here rather than at the host.
      const config = SectionConfigSchema.parse(definition.createDefaultConfig());
      const result = await reportedWrite(this.reporter, () => this.gateway.sections.create(projectId, {
        type: definition.type,
        pageId,
        config,
        ...options,
      }), sectionReport);
      if (!current()) return;
      this.insertPlacement({ kind: 'section', section: result.section }, result.section.position);
      if (!(await this.reconcileSections(projectId, pageId, generation))) this.markRefreshFailed(current);
      return result.section.id;
    });
  }

  /**
   * Adds a placement to this canonical canvas; the source remains owned by its own page.
   * `sourceName` is the picker's name for the source, which only its failure sentence uses.
   */
  addShortcut(input: CreateSectionShortcutInput, sourceName: string): Promise<CanvasWriteResult> {
    return this.mutateWithResult(`Couldn’t add a shortcut to “${sourceName}”. Try again.`, async ({ current, projectId, pageId, generation }) => {
      if (input.pageId !== pageId) throw new Error('The shortcut destination does not match this canvas');
      const { shortcut } = await reportedWrite(this.reporter, () => this.gateway.shortcuts.create(projectId, input),
        ({ operation }) => ({ projectId, receipt: operation }));
      if (!current()) return;
      this.insertPlacement({ kind: 'shortcut', shortcut }, shortcut.position);
      await this.reconcileSections(projectId, pageId, generation);
      return shortcut.id;
    });
  }

  private insertPlacement(placement: ProjectCanvasPlacement, position: number): void {
    const next = [...this.placementsState()];
    next.splice(Math.max(0, Math.min(position, next.length)), 0, placement);
    this.setCanvas(next);
  }

  setCollapsed(id: SectionId, collapsed: boolean): Promise<boolean> {
    return this.collapsePlacement('section', id, collapsed);
  }

  /**
   * CDK owns pointer sorting; the domain owns persisted sibling positions. In mixed grid
   * orientation CDK moves DOM nodes directly, so failure emits a fresh canonical array to
   * make Angular restore the stored order even though the entity values did not change.
   */
  moveSection(id: SectionId, position: number): Promise<boolean> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (!this.loaded || projectId === undefined || pageId === undefined) return Promise.resolve(false);
    if (!this.orderCompleteState()) return Promise.resolve(false);

    const before = this.placementsState();
    const from = before.findIndex((placement) => placement.kind === 'section' && placement.section.id === id);
    if (from < 0) return Promise.resolve(false);
    if (from === position) return Promise.resolve(true);
    const name = this.placementName('section', id);

    const generation = this.loadGeneration;
    const current = () => this.current(generation, projectId, pageId);

    // CDK's mixed strategy has already moved the actual DOM. Mirror that order in the
    // signal immediately so Angular's logical view order matches what CDK rendered. If the
    // host rejects the move, changing from this preview back to `before` gives Angular a
    // real ordering delta and it can restore the DOM rather than leaving CDK's move behind.
    const preview = [...before];
    const [moved] = preview.splice(from, 1);
    if (moved !== undefined)
      preview.splice(Math.max(0, Math.min(position, preview.length)), 0, moved);
    // Reordering the render array is enough to align Angular with CDK. Keep every persisted
    // `position` untouched: sibling renumbering belongs to SectionService alone.
    this.setCanvas(preview);

    return this.track(() =>
      this.whileWriting(async () => {
      if (current()) this.sectionErrorState.set(null);
      try {
        await reportedWrite(this.reporter, () => this.gateway.sections.move(id, { position }), sectionReport);
        if (!current()) return true;

        // The preview remains visibly successful if the follow-up read fails. It is a
        // rendering order, not a second implementation of domain validation.
        if (!(await this.reconcileSections(projectId, pageId, generation))) this.markRefreshFailed(current);
        return true;
      } catch (error) {
        if (current()) {
          this.setCanvas(before);
          // Mixed-orientation CDK sorting moves DOM nodes itself. Changing the track key
          // makes Angular recreate the wrappers in canonical order after a rejected write.
          this.canvasRevisionState.update((revision) => revision + 1);
          this.sectionErrorState.set(writeFailure(error, placementWrite('move', name)));
        }
        return false;
      }
      }),
    );
  }

  /** Resizes one section optimistically, with rollback limited to its width field. */
  setColumnSpan(id: SectionId, columnSpan: SectionColumnSpan): Promise<boolean> {
    return this.writePlacementField(
      `section:${id}:columnSpan`,
      placementWrite('resize', this.placementName('section', id)),
      columnSpan,
      () => this.sectionsState().find((section) => section.id === id)?.columnSpan,
      (span) => this.patchSectionColumnSpan(id, span as SectionColumnSpan),
      () => reportedWrite(this.reporter, () => this.gateway.sections.update(id, { columnSpan }), sectionReport),
      (result) => result.section.columnSpan,
      (result) => this.replaceSection(result.section),
    );
  }

  setCollapsedShortcut(id: SectionShortcutId, collapsed: boolean): Promise<boolean> {
    return this.collapsePlacement('shortcut', id, collapsed);
  }

  /** Resizes one shortcut placement without changing its source section. */
  setColumnSpanShortcut(id: SectionShortcutId, columnSpan: SectionColumnSpan): Promise<boolean> {
    return this.writePlacementField(
      `shortcut:${id}:columnSpan`,
      placementWrite('resize', this.placementName('shortcut', id)),
      columnSpan,
      () => this.shortcutsState().find((shortcut) => shortcut.id === id)?.columnSpan,
      (span) => this.patchShortcutColumnSpan(id, span as SectionColumnSpan),
      () => this.reportedShortcutWrite(() => this.gateway.shortcuts.update(id, { columnSpan })),
      (result) => result.shortcut.columnSpan,
      (result) => this.replaceShortcut(result.shortcut),
    );
  }

  updateShortcut(id: SectionShortcutId, input: UpdateSectionShortcutInput): Promise<boolean> {
    return this.mutate(placementWrite('change', this.placementName('shortcut', id)), async ({ current }) => {
      const { shortcut } = await this.reportedShortcutWrite(() => this.gateway.shortcuts.update(id, input));
      if (!current()) return;
      this.replaceShortcut(shortcut);
    });
  }

  moveShortcut(id: SectionShortcutId, position: number): Promise<boolean> {
    if (!this.loaded || this.requestedProjectId === undefined || this.requestedPageId === undefined) {
      return Promise.resolve(false);
    }
    if (!this.orderCompleteState()) return Promise.resolve(false);
    const before = this.placementsState();
    const from = before.findIndex((placement) => placement.kind === 'shortcut' && placement.shortcut.id === id);
    if (from < 0) return Promise.resolve(false);
    if (from === position) return Promise.resolve(true);
    const name = this.placementName('shortcut', id);
    const generation = this.loadGeneration;
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    const current = () => this.current(generation, projectId, pageId);
    const preview = [...before];
    const [moved] = preview.splice(from, 1);
    if (moved !== undefined) {
      preview.splice(Math.max(0, Math.min(position, preview.length)), 0, moved);
    }
    this.setCanvas(preview);

    return this.track(() =>
      this.whileWriting(async () => {
        if (current()) this.sectionErrorState.set(null);
        try {
          await this.reportedShortcutWrite(() => this.gateway.shortcuts.move(id, { position }));
          if (!current()) return true;
          await this.reconcileSections(projectId, pageId, generation);
          return true;
        } catch (error) {
          if (current()) {
            this.setCanvas(before);
            this.canvasRevisionState.update((revision) => revision + 1);
            this.sectionErrorState.set(writeFailure(error, placementWrite('move', name)));
          }
          return false;
        }
      }),
    );
  }

  removeShortcut(id: SectionShortcutId): Promise<boolean> {
    return this.mutate(placementWrite('remove', this.placementName('shortcut', id)), async ({ current, projectId, pageId, generation }) => {
      await reportedWrite(this.reporter, () => this.gateway.shortcuts.remove(id),
        (removed) => ({ projectId: removed.projectId, receipt: removed.operation }));
      if (!current()) return;
      this.setCanvas(
        this.placementsState().filter((placement) => !(placement.kind === 'shortcut' && placement.shortcut.id === id)),
      );
      await this.reconcileSections(projectId, pageId, generation);
    });
  }

  /**
   * §31's frame title, as a write. `null` clears the override so the name falls back to the
   * derived default rather than storing that default as a literal — a stored `"Task List"`
   * would silently stop tracking the registry.
   *
   * Deliberately **not** optimistic, unlike the project `rename` below. `updateSection`
   * awaits the gateway and then patches, as does `updateConfig`. Collapse and width use
   * field-only optimism. §63 asks for optimism on *important interactions*, and a name committed on blur
   * against a local host is not one.
   */
  renameSection(id: SectionId, title: string | null): Promise<boolean> {
    return this.updateSection(id, { title }, placementWrite('rename', this.placementName('section', id)));
  }

  /**
   * Resolves `null` when saved, or the save's `Failure` for the section's own editor. The
   * canvas-level `sectionError` is neither cleared before this write nor set by its failure,
   * so a config save never shows a second alert or removes an unrelated one (Slice 78, L4-018).
   */
  async updateConfig(id: SectionId, config: SectionConfig): Promise<Failure | null> {
    let failure: Failure = CANVAS_STILL_LOADING;
    const saved = await this.updateSection(id, { config }, placementWrite('save', this.placementName('section', id)), (refused) => {
      failure = refused;
    });
    return saved ? null : failure;
  }

  /**
   * Removes or retains one section. Its receipt updates the header's history and is retained in
   * the removal report for the canvas toast's exact-step Undo. The toast also offers Open archive
   * when Archive lists the section, and Retry refresh when the follow-up read fails.
   * One request always cascades live owned rows with the section.
   */
  removeSection(id: SectionId, options: { exempt?: boolean } = {}): Promise<boolean> {
    if (this.removalPendingState()) return Promise.resolve(false);
    const unresolved = this.failedRemovalState();
    if (unresolved !== null && !this.isSameFailedRemoval(unresolved, id)) {
      this.sectionErrorState.set(FAILED_REMOVAL_GUARD);
      return Promise.resolve(false);
    }
    const name = this.sectionsState().find((section) => section.id === id);
    const removedName = name === undefined ? 'requested' : nameOf(name);
    this.removalPendingState.set(true);
    let failed = false;
    const operation = this.mutate(`Couldn’t remove the ${removedName} section. Try again.`, async ({ current, projectId, pageId, generation }) => {
      let result: Awaited<ReturnType<typeof this.gateway.sections.remove>>;
      try {
        result = await reportedWrite(this.reporter, () => this.gateway.sections.remove(id),
          value => ({ ...sectionReport(value), feedback: 'own' }), options);
      } catch (error) {
        if (!current()) return;
        if (error instanceof GatewayError && error.code === 'rule_violation') {
          const available = SectionAlreadyRemovedDetailsSchema.safeParse(error.details);
          if (available.success && available.data.sectionId === id) {
            // The exact actor's earlier removal supplies both the history and the recovery toast.
            const recovered = this.reporter.begin({ exempt: true });
            const report: OperationWriteReport = { projectId, receipt: available.data.operation, feedback: 'own' };
            recovered.committed(report);
            recovered.end();
            this.clearFailedRemovalFor(id);
            this.recoveryNoticeState.set({ message: sectionRemovedFeedback(removedName, true).message, removal: { sectionId: id }, report });
            this.removePlacement(id);
            this.notifyProjectDataChanged();
            await this.waitForOtherSectionWrites();
            const refreshed = await this.reconcileSections(projectId, pageId, generation);
            if (!refreshed) this.markRefreshFailed(current);
            return;
          }
        }
        this.failedRemovalState.set({ sectionId: id, failure: writeFailure(error, `Couldn’t remove the ${removedName} section. Try again.`) });
        failed = true;
        return;
      }
      if (!current()) return;
      this.clearFailedRemovalFor(id);
      // Archive is offered only when the removal says Archive will list the section
      // (`note-2026-09-15-006`); otherwise the header's changed label is the confirmation.
      this.recoveryNoticeState.set({ message: sectionRemovedFeedback(removedName).message,
        removal: { sectionId: id, archiveListed: result.archiveListed },
        report: { ...sectionReport(result), feedback: 'own' },
      });
      // Paint the committed removal immediately. Neighbor positions still come from the
      // authoritative read.
      this.removePlacement(id);
      this.notifyProjectDataChanged();
      await this.waitForOtherSectionWrites();
      const refreshed = await this.reconcileSections(projectId, pageId, generation);
      if (!refreshed) this.markRefreshFailed(current);
    });
    return operation
      .then((succeeded) => succeeded && !failed)
      .finally(() => this.removalPendingState.set(false));
  }

  /** Retry repeats only the ID-only removal after an uncertain response; it is never automatic. */
  retryFailedRemoval(): Promise<boolean> {
    const failed = this.failedRemovalState();
    return failed === null ? Promise.resolve(false) : this.removeSection(failed.sectionId);
  }

  /** Retries only the read after a committed mutation, never the write itself. */
  retryRefresh(): Promise<boolean> {
    const notice = this.recoveryNoticeState();
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (!notice?.refreshFailed || projectId === undefined || pageId === undefined || this.removalPendingState()) {
      return Promise.resolve(false);
    }
    const generation = this.loadGeneration;
    const current = () => this.current(generation, projectId, pageId);
    this.removalPendingState.set(true);
    return this.track(async () => {
      await this.waitForOtherSectionWrites(0);
      if (!current()) return false;
      const refreshed = await this.reconcileSections(projectId, pageId, generation);
      if (current() && refreshed) {
        // A refresh-only notice has nothing left to say; a removal keeps its Open Archive.
        this.recoveryNoticeState.update((state) =>
          state === null || state.removal === undefined ? null : { ...state, refreshFailed: false });
      }
      return current() && refreshed;
    }).finally(() => this.removalPendingState.set(false));
  }

  dismissRecoveryNotice(): void {
    this.recoveryNoticeState.set(null);
  }

  /** Keep the acting toast when its Undo brings the section back; a header Undo still withdraws it. */
  retainRemovalNoticeForUndo(): void {
    this.recoveryNoticeState.update(notice => notice === null ? null : { ...notice, undoing: true });
  }

  /** Dismisses only the failed remove message; any recovery notice stays. */
  dismissFailedRemoval(): void {
    this.failedRemovalState.set(null);
    if (this.sectionErrorState() === FAILED_REMOVAL_GUARD) this.sectionErrorState.set(null);
  }

  private clearFailedRemovalFor(id: SectionId): void {
    if (this.failedRemovalState()?.sectionId === id) this.failedRemovalState.set(null);
  }

  private isSameFailedRemoval(failed: FailedSectionRemoval, id: SectionId): boolean {
    return failed.sectionId === id;
  }

  private removePlacement(id: SectionId): void {
    this.setCanvas(
      this.placementsState().filter((placement) => !(placement.kind === 'section' && placement.section.id === id)),
    );
  }

  /** A committed write whose follow-up read failed offers read-only Retry refresh. */
  private markRefreshFailed(current: () => boolean): void {
    if (!current()) return;
    this.recoveryNoticeState.update((state) => state === null
      ? { message: SAVED_REFRESH_FAILED, refreshFailed: true }
      : { ...state, refreshFailed: true });
  }

  /** A shortcut write records in the destination project: this canvas's project (root on Home, workstream on Work). */
  private reportedShortcutWrite<T extends { operation: OperationWriteReport['receipt'] }>(write: () => Promise<T>): Promise<T> {
    const projectId = this.requestedProjectId;
    return reportedWrite(this.reporter, write, ({ operation }) => ({ projectId: projectId!, receipt: operation }));
  }

  private async waitForOtherSectionWrites(threshold = 1): Promise<void> {
    if (this.pendingSectionWrites <= threshold) return;
    await new Promise<void>((resolve) => this.sectionWriteWaiters.push({ threshold, resolve }));
  }

  private updateSection(
    id: SectionId,
    input: Parameters<typeof this.gateway.sections.update>[1],
    failureSentence: string,
    onFailure?: (failure: Failure) => void,
  ): Promise<boolean> {
    return this.mutate(failureSentence, async ({ current }) => {
      const updated = await reportedWrite(this.reporter, () => this.gateway.sections.update(id, input), sectionReport);
      if (!current()) return;
      this.replaceSection(updated.section);
    }, onFailure);
  }

  private patchSectionColumnSpan(id: SectionId, columnSpan: SectionColumnSpan): void {
    const section = this.sectionsState().find((candidate) => candidate.id === id);
    if (section !== undefined) this.replaceSection({ ...section, columnSpan });
  }

  private patchShortcutColumnSpan(id: SectionShortcutId, columnSpan: SectionColumnSpan): void {
    const shortcut = this.shortcutsState().find((candidate) => candidate.id === id);
    if (shortcut !== undefined) this.replaceShortcut({ ...shortcut, columnSpan });
  }

  /** Every record entering the canvas keeps the current intent for each in-flight field. */
  private withPendingFields(placement: ProjectCanvasPlacement): ProjectCanvasPlacement {
    const record = placement.kind === 'section' ? placement.section : placement.shortcut;
    let fields: Partial<{ collapsed: boolean; columnSpan: SectionColumnSpan }> = {};
    for (const field of ['collapsed', 'columnSpan'] as const) {
      const state = this.fieldWrites.get(`${this.loadGeneration}:${placement.kind}:${placementId(placement)}:${field}`);
      if (state !== undefined) this.paintPlacementField(state, value => { fields = { ...fields, [field]: value }; });
    }
    return placement.kind === 'section'
      ? { kind: 'section', section: { ...record, ...fields } as ProjectSection }
      : { kind: 'shortcut', shortcut: { ...record, ...fields } as ResolvedSectionShortcut };
  }

  private clearCollapseError(id: string): void {
    this.failedCollapseIntent.delete(id);
    this.collapseErrorsState.update(errors => {
      const next = { ...errors };
      delete next[id];
      return next;
    });
  }

  /** Only a read confirming the requested value clears a refusal without another toggle. */
  private acceptCollapseRead(placements: readonly ProjectCanvasPlacement[], reconcileField = false): void {
    for (const placement of placements) {
      const id = placementId(placement);
      const collapsed = placement.kind === 'section' ? placement.section.collapsed : placement.shortcut.collapsed;
      const state = this.fieldWrites.get(`${this.loadGeneration}:${placement.kind}:${id}:collapsed`);
      // An owed read supersedes rollback, but must survive older whole-record answers in this batch.
      if (reconcileField && state !== undefined && state.pending.size === 0) state.confirmedValue = collapsed;
      if (this.failedCollapseIntent.has(id) && this.failedCollapseIntent.get(id) === collapsed) this.clearCollapseError(id);
    }
  }

  private collapsePlacement(kind: 'section' | 'shortcut', id: string, collapsed: boolean): Promise<boolean> {
    const placement = this.placementsState().find(candidate => candidate.kind === kind && placementId(candidate) === id);
    if (placement === undefined) return Promise.resolve(false);
    const name = this.placementName(kind, id);
    const record = () => kind === 'section'
      ? this.sectionsState().find(section => section.id === id)
      : this.shortcutsState().find(shortcut => shortcut.id === id);
    const generation = this.loadGeneration;
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    this.clearCollapseError(id);
    return this.writePlacementField(
      `${kind}:${id}:collapsed`, placementWrite(collapsed ? 'collapse' : 'expand', name), collapsed,
      () => record()?.collapsed,
      value => {
        const current = record();
        if (current === undefined) return;
        if (kind === 'section') this.replaceSection({ ...current, collapsed: value as boolean } as ProjectSection);
        else this.replaceShortcut({ ...current, collapsed: value as boolean } as ResolvedSectionShortcut);
      },
      async () => {
        if (kind === 'section') {
          const result = await reportedWrite(this.reporter, () => this.gateway.sections.update(id as SectionId, { collapsed }), sectionReport);
          return result.section;
        }
        const result = await this.reportedShortcutWrite(() => this.gateway.shortcuts.update(id as SectionShortcutId, { collapsed }));
        return result.shortcut;
      },
      saved => saved.collapsed,
      saved => {
        if (kind === 'section') this.replaceSection(saved as ProjectSection);
        else this.replaceShortcut(saved as ResolvedSectionShortcut);
      },
      () => {},
      async (error, latest) => {
        if (latest) {
          this.failedCollapseIntent.set(id, collapsed);
          this.collapseErrorsState.update(errors => ({ ...errors,
            [id]: writeFailure(error, placementWrite(collapsed ? 'collapse' : 'expand', name)) }));
        }
        if (!(error instanceof GatewayError) || !['unreachable', 'internal_error', 'invalid_response'].includes(error.code)) return;
        // A possibly committed write owes one quiet read; it never repeats the write.
        const epoch = this.sectionWriteEpoch;
        const accept = () => {
          if (!this.current(generation, projectId!, pageId!)) return false;
          if (epoch === this.sectionWriteEpoch) return true;
          // An intervening write made this read stale. Reconcile once the current writes settle.
          this.sectionRefreshQueued = true;
          return false;
        };
        try {
          if (kind === 'section') {
            const sections = await this.gateway.sections.list(projectId!, { pageId: pageId! });
            if (!accept()) return;
            this.acceptCollapseRead(this.composePlacements(sections, []), true);
            this.setCanvas(this.composePlacements(sections, this.shortcutsState()));
          } else {
            const shortcuts = await this.gateway.shortcuts.list(projectId!, { pageId: pageId! });
            if (!accept()) return;
            this.acceptCollapseRead(this.composePlacements([], shortcuts), true);
            this.setCanvas(this.composePlacements(this.sectionsState(), shortcuts));
          }
        } catch { /* Keep the rolled-back frame and its refusal until another toggle or confirming read. */ }
      },
    );
  }

  private syncCollapsePending(): void {
    const pending = new Set<string>();
    const prefix = `${this.loadGeneration}:`;
    for (const [key, state] of this.fieldWrites) {
      if (key.startsWith(prefix) && key.endsWith(':collapsed') && state.pending.size > 0) {
        pending.add(key.slice(prefix.length).replace(/^(section|shortcut):/, '').slice(0, -':collapsed'.length));
      }
    }
    this.collapsePendingState.set(pending);
  }

  /**
   * What a write failure calls a placement (Slice 78): its name in quotes, or "this shortcut" for
   * one whose source is gone, and "this section" when it is no longer on the canvas.
   */
  private placementName(kind: 'section' | 'shortcut', id: string): string {
    const placement = this.placementsState().find(candidate => candidate.kind === kind && placementId(candidate) === id);
    if (placement === undefined) return `this ${kind}`;
    if (placement.kind === 'shortcut' && placement.shortcut.source === null) return 'this shortcut';
    return `“${placement.kind === 'section' ? nameOf(placement.section)
      : shortcutNameOf(placement.shortcut.source!, placement.shortcut.sourceProjectName)}”`;
  }

  /** Per-field optimism keeps newer canvas chrome fields when a write is refused. */
  private writePlacementField<T>(
    key: string,
    failureSentence: string,
    columnSpan: PlacementFieldValue,
    readCurrent: () => PlacementFieldValue | undefined,
    paint: (span: PlacementFieldValue) => void,
    write: () => Promise<T>,
    readSavedValue: (record: T) => PlacementFieldValue,
    applySaved: (record: T) => void,
    onSaved: (record: T) => void = () => {},
    onFailure?: (error: unknown, latest: boolean) => Promise<void>,
  ): Promise<boolean> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (!this.loaded || projectId === undefined || pageId === undefined) return Promise.resolve(false);
    const before = readCurrent();
    if (before === undefined) return Promise.resolve(false);
    const generation = this.loadGeneration;
    const current = () => this.current(generation, projectId, pageId);
    const stateKey = `${generation}:${key}`;
    let state = this.fieldWrites.get(stateKey);
    if (state === undefined) {
      state = {
        nextSequence: 0,
        confirmedSequence: 0,
        confirmedValue: before,
        pending: new Map(),
      };
      this.fieldWrites.set(stateKey, state);
    }
    const sequence = ++state.nextSequence;
    state.pending.set(sequence, columnSpan);
    this.syncCollapsePending();
    const latest = () => state!.nextSequence === sequence;

    return this.track(() =>
      this.whileWriting(async () => {
        if (current()) {
          if (onFailure === undefined) this.sectionErrorState.set(null);
          paint(columnSpan);
        }
        try {
          const saved = await write();
          state!.pending.delete(sequence);
          if (!current()) {
            this.cleanupFieldWrite(stateKey, state!);
            return true;
          }
          const savedValue = readSavedValue(saved);
          if (sequence > state!.confirmedSequence) {
            state!.confirmedSequence = sequence;
            state!.confirmedValue = savedValue;
          }
          if (latest()) applySaved(saved);
          onSaved(saved);
          this.paintPlacementField(state!, paint);
          this.cleanupFieldWrite(stateKey, state!);
          return true;
        } catch (error) {
          state!.pending.delete(sequence);
          if (current()) {
            this.paintPlacementField(state!, paint);
            this.cleanupFieldWrite(stateKey, state!);
            if (onFailure !== undefined) await onFailure(error, latest());
            else if (latest()) this.sectionErrorState.set(writeFailure(error, failureSentence));
          }
          this.cleanupFieldWrite(stateKey, state!);
          return false;
        }
      }),
    );
  }

  private paintPlacementField(
    state: PlacementFieldWriteState,
    paint: (span: PlacementFieldValue) => void,
  ): void {
    let pendingSequence = state.confirmedSequence;
    let pendingValue: PlacementFieldValue | undefined;
    for (const [sequence, span] of state.pending) {
      if (sequence > pendingSequence) {
        pendingSequence = sequence;
        pendingValue = span;
      }
    }
    paint(pendingValue ?? state.confirmedValue);
  }

  private cleanupFieldWrite(key: string, state: PlacementFieldWriteState): void {
    if (state.pending.size === 0 && this.pendingSectionWrites <= 1 && this.fieldWrites.get(key) === state) {
      this.fieldWrites.delete(key);
    }
    this.syncCollapsePending();
  }

  /**
   * The canvas is left exactly as it was when a write fails, with the reason visible. A
   * silent failure on a remove or a config save is the one that costs the user work. With
   * `onFailure` the caller owns the failure: `sectionError` is neither cleared nor set.
   */
  private mutate(
    failureSentence: string,
    operation: (context: {
      current: () => boolean;
      projectId: ProjectId;
      pageId: ProjectPageId;
      generation: number;
    }) => Promise<void>,
    onFailure?: (failure: Failure) => void,
  ): Promise<boolean> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (!this.loaded || projectId === undefined || pageId === undefined) return Promise.resolve(false);
    const generation = this.loadGeneration;
    const current = () => this.current(generation, projectId, pageId);

    return this.track(() =>
      this.whileWriting(async () => {
        if (onFailure === undefined && current()) this.sectionErrorState.set(null);
        try {
          await operation({ current, projectId, pageId, generation });
          return true;
        } catch (error) {
          if (onFailure !== undefined) onFailure(writeFailure(error, failureSentence));
          else if (current()) this.sectionErrorState.set(writeFailure(error, failureSentence));
          return false;
        }
      }),
    );
  }

  /**
   * A popup-owned create returns its `Failure` directly and must not clear or replace the
   * canvas error signal. Writes for a page that changed while the request was in flight are
   * considered complete because the popup has already closed.
   */
  private mutateWithResult(
    failureSentence: string,
    operation: (context: {
      current: () => boolean;
      projectId: ProjectId;
      pageId: ProjectPageId;
      generation: number;
    }) => Promise<string | void>,
  ): Promise<CanvasWriteResult> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (!this.loaded || projectId === undefined || pageId === undefined) {
      return Promise.resolve({ ok: false, failure: CANVAS_STILL_LOADING });
    }
    if (!this.orderCompleteState()) {
      return Promise.resolve({
        ok: false,
        failure: { sentence: this.shortcutsErrorState()?.sentence ?? CANVAS_STILL_LOADING.sentence, reason: null },
      });
    }
    const generation = this.loadGeneration;
    const current = () => this.current(generation, projectId, pageId);

    return this.track(() =>
      this.whileWriting(async (): Promise<CanvasWriteResult> => {
        try {
          const placementId = await operation({ current, projectId, pageId, generation });
          return placementId === undefined || !current() ? { ok: true } : { ok: true, placementId };
        } catch (error) {
          return current() ? { ok: false, failure: writeFailure(error, failureSentence) } : { ok: true };
        }
      }),
    );
  }

  /**
   * Re-reads the canvas after a successful write, and **swallows its own failure**. The
   * write already landed; reporting a failed re-read as a failed write would tell the user
   * their remove did not happen. The receipt has already gone to the header's history. Persisted
   * sibling positions remain untouched unless they came from the host.
   */
  private async reconcileSections(
    projectId = this.requestedProjectId,
    pageId = this.requestedPageId,
    generation = this.loadGeneration,
  ): Promise<boolean> {
    if (projectId === undefined || pageId === undefined) return false;
    const [sectionsResult, shortcutsResult] = await Promise.allSettled([
      this.gateway.sections.list(projectId, { pageId }),
      this.readShortcuts(projectId, pageId),
    ]);
    if (!this.current(generation, projectId, pageId)) return false;
    this.orderCompleteState.set(
      !this.requestedShortcutsAllowed || shortcutsResult.status === 'fulfilled',
    );
    this.shortcutsErrorState.set(
      shortcutsResult.status === 'rejected' ? shortcutsReadFailure(shortcutsResult.reason) : null,
    );
    if (sectionsResult.status === 'rejected') return false;
    const shortcuts = shortcutsResult.status === 'fulfilled' ? shortcutsResult.value : this.shortcutsState();
    this.acceptCollapseRead(this.composePlacements(sectionsResult.value, shortcutsResult.status === 'fulfilled' ? shortcuts : []));
    this.setCanvas(this.composePlacements([...sectionsResult.value].sort(byPosition), shortcuts));
    this.loaded = true;
    if (shortcutsResult.status === 'fulfilled') this.sectionErrorState.set(null);
    return shortcutsResult.status === 'fulfilled';
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    return operation().finally(settled);
  }

  /**
   * Holds off §62's re-read for the length of an optimistic section write. The host flushes
   * its frame at commit, which is before the tab's own response lands, so a re-read in that
   * window replaces the optimistic paint with the pre-write value for a frame.
   */
  private whileWriting<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingSectionWrites += 1;
    this.pendingSectionWriteCountState.set(this.pendingSectionWrites);
    this.sectionWriteEpoch += 1;
    return operation().finally(() => {
      this.pendingSectionWrites -= 1;
      // A later whole-record answer from a concurrent write must still preserve confirmed
      // chrome fields. Release those overlays only when the whole write batch has settled.
      if (this.pendingSectionWrites === 0) {
        for (const [key, state] of this.fieldWrites) {
          if (state.pending.size === 0) this.fieldWrites.delete(key);
        }
        this.syncCollapsePending();
      }
      this.pendingSectionWriteCountState.set(this.pendingSectionWrites);
      const waiting: typeof this.sectionWriteWaiters = [];
      for (const waiter of this.sectionWriteWaiters) {
        if (this.pendingSectionWrites <= waiter.threshold) waiter.resolve();
        else waiting.push(waiter);
      }
      this.sectionWriteWaiters.splice(0, this.sectionWriteWaiters.length, ...waiting);
      if (this.pendingSectionWrites === 0 && this.sectionRefreshQueued) {
        this.sectionRefreshQueued = false;
        void this.refreshSections();
      }
    });
  }
}
