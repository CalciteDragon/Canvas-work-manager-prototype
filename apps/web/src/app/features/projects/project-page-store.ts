import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import {
  SectionConfigSchema,
  SectionRemovalRefusalDetailsSchema,
  SectionAlreadyRemovedDetailsSchema,
  nameOf,
  ownedKindOf,
  type OwnedDataKind,
  type CreateSectionInput,
  type ProjectId,
  type ProjectPageId,
  type ProjectSection,
  type ResolvedSectionShortcut,
  type CreateSectionShortcutInput,
  type UpdateSectionShortcutInput,
  type RemoveSectionInput,
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
import type { SectionDefinition } from './sections/registry';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const FAILED_REMOVAL_GUARD_MESSAGE =
  'Retry or dismiss the unresolved removal above before removing another section.';

const byPosition = (a: ProjectSection, b: ProjectSection): number => a.position - b.position;

/** A section write's report names the section's own project, from the response (Slice 41). */
const sectionReport = ({ section, operation }: { section: ProjectSection; operation: OperationWriteReport['receipt'] }): OperationWriteReport =>
  ({ projectId: section.projectId, receipt: operation });

/** The notice sentence after a committed write whose follow-up read failed. */
const SAVED_REFRESH_FAILED = 'Saved. Undo is in the header.';

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
 * A container that refused removal, and what the canvas can offer instead.
 *
 * Not the domain's sentence: that one answers an **agent**, so it names an id, says
 * "1 tasks", and explains the policy vocabulary rather than the choice
 * (`.prototype/notes.json`, `note-2026-09-01-001`). These are the parts the UI writes its
 * own question from; the count still travels from the domain, so the dialog and the rule
 * cannot disagree.
 */
export interface SectionRemovalPrompt {
  sectionId: SectionId;
  sectionName: string;
  rowCount: number;
  ownedKind: OwnedDataKind;
  targets: ProjectSection[];
}

/**
 * What the canvas-local recovery notice offers (Slice 41). **Undo is not here**: the project
 * header's Undo/Redo controls are the one action surface for history, so the notice keeps only what
 * the header cannot do — Open Archive after a removal Archive will list, and a read-only Retry
 * refresh after a committed write whose follow-up read failed. Retry remove is `FailedSectionRemoval`.
 */
export interface SectionRecoveryNoticeState {
  message: string;
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
  input: RemoveSectionInput;
  message: string;
}

/** A canvas creation result belongs to its popup, so failures are returned instead of stored. */
export type CanvasWriteResult = { ok: true } | { ok: false; message: string };

interface ColumnSpanWriteState {
  nextSequence: number;
  confirmedSequence: number;
  confirmedSpan: SectionColumnSpan;
  pending: Map<number, SectionColumnSpan>;
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
   * destination root — this canvas's project — so their reports name it.
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
   * Whether a load has completed. The staleness guards used to ask `projectState() !== null`,
   * which answered "is anything loaded" as a side effect; with the record gone, `sections()`
   * cannot take that job — an empty canvas is a legitimate state, not an unloaded one.
   */
  private loaded = false;
  private activeLoad: Promise<void> | null = null;
  private destroyed = false;
  private fullRecoveryQueued = false;
  private readonly errorState = signal<string | null>(null);
  private readonly sectionErrorState = signal<string | null>(null);
  /** Set when a container refuses removal because it still holds rows — see `removeSection`. */
  private readonly removalPromptState = signal<SectionRemovalPrompt | null>(null);
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
  private readonly columnSpanWrites = new Map<string, ColumnSpanWriteState>();

  readonly sections = this.sectionsState.asReadonly();
  readonly shortcuts = this.shortcutsState.asReadonly();
  readonly placements = this.placementsState.asReadonly();
  /** True while every placement kind that the page permits has been read successfully. */
  readonly orderComplete = this.orderCompleteState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly sectionError = this.sectionErrorState.asReadonly();
  readonly canvasRevision = this.canvasRevisionState.asReadonly();
  readonly projectDataRevision = this.projectDataRevisionState.asReadonly();
  readonly removalPrompt = this.removalPromptState.asReadonly();
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
   * exception that ignores `projectId`: a Sub-Projects section is a view of the work tree, so
   * a sibling's creation has to move it.
   */
  private onLiveEvent(event: LiveEvent): void {
    // A host-state change (seed, reset, clock) replaces everything this canvas is built from.
    if (event.type === 'prototype.reloaded') {
      const projectId = this.requestedProjectId;
      const pageId = this.requestedPageId;
      if (projectId !== undefined && pageId !== undefined) void this.load(projectId, pageId, this.requestedShortcutsAllowed);
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
    const isInRootTree = event.rootProjectId === projectId;
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
        if (shortcutsResult.status === 'rejected') {
          this.sectionErrorState.set(messageOf(shortcutsResult.reason));
        }
        if (sectionsResult.status === 'rejected') {
          // Quiet — see above. Keep the currently painted canvas intact.
          continue;
        }
        const sections = [...sectionsResult.value].sort(byPosition);
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
          void this.refreshSections();
          return;
        }
        this.setCanvas(this.composePlacements(this.sectionsState(), shortcuts));
        this.orderCompleteState.set(true);
        this.sectionErrorState.set(null);
      } catch (error) {
        if (this.current(generation, projectId, pageId)) {
          this.orderCompleteState.set(false);
          this.sectionErrorState.set(messageOf(error));
        }
      }
    });
  }

  /**
   * The canvas of **one page** (§27). Navigating between two pages of the same root re-uses
   * this component and this store, so a response that lands after the page changed must write
   * nothing — the guard is the page as well as the project.
   */
  load(projectId: ProjectId, pageId: ProjectPageId, shortcutsAllowed = true): Promise<void> {
    const generation = ++this.loadGeneration;
    const current = () => generation === this.loadGeneration;
    this.requestedProjectId = projectId;
    this.requestedPageId = pageId;
    this.requestedShortcutsAllowed = shortcutsAllowed;
    this.recoveryNoticeState.set(null);
    this.failedRemovalState.set(null);
    this.removalPromptState.set(null);
    this.orderCompleteState.set(false);
    if (!shortcutsAllowed) this.setCanvas(this.composePlacements(this.sectionsState(), []));
    this.loaded = false;
    // A refresh in flight for the page being left exits on the generation check without
    // consuming this, and the flag would otherwise buy the *next* page a gratuitous re-read.
    this.sectionRefreshQueued = false;

    const operation = this.track(async () => {
      this.loadingState.set(true);
      this.errorState.set(null);
      this.sectionErrorState.set(null);
      const [sectionsResult, shortcutsResult] = await Promise.allSettled([
        this.gateway.sections.list(projectId, { pageId }),
        this.readShortcuts(projectId, pageId),
      ]);
      if (!current()) return;
      this.orderCompleteState.set(!shortcutsAllowed || shortcutsResult.status === 'fulfilled');
      if (sectionsResult.status === 'rejected') {
        this.setCanvas([]);
        this.errorState.set(messageOf(sectionsResult.reason));
      } else {
        const sections = [...sectionsResult.value].sort(byPosition);
        if (shortcutsResult.status === 'fulfilled') {
          this.setCanvas(this.composePlacements(sections, shortcutsResult.value));
        } else {
          this.setCanvas(this.composePlacements(sections, []));
          this.sectionErrorState.set(messageOf(shortcutsResult.reason));
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
    const next = [...placements];
    this.placementsState.set(next);
    // A removal notice that says "Removed … Open Archive" is wrong once the section is back (the
    // header's Undo, or anyone's): withdraw it rather than leave a stale route on screen.
    const removed = this.recoveryNoticeState()?.removal?.sectionId;
    if (removed !== undefined && next.some((placement) => placement.kind === 'section' && placement.section.id === removed)) {
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
    return this.mutateWithResult(async ({ current, projectId, pageId, generation }) => {
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
    });
  }

  /** Adds a placement to this Home canvas; the source remains owned by its canonical page. */
  addShortcut(input: CreateSectionShortcutInput): Promise<CanvasWriteResult> {
    return this.mutateWithResult(async ({ current, projectId, pageId, generation }) => {
      if (input.pageId !== pageId) throw new Error('The shortcut destination does not match this canvas');
      const { shortcut } = await reportedWrite(this.reporter, () => this.gateway.shortcuts.create(projectId, input),
        ({ operation }) => ({ projectId, receipt: operation }));
      if (!current()) return;
      this.insertPlacement({ kind: 'shortcut', shortcut }, shortcut.position);
      await this.reconcileSections(projectId, pageId, generation);
    });
  }

  private insertPlacement(placement: ProjectCanvasPlacement, position: number): void {
    const next = [...this.placementsState()];
    next.splice(Math.max(0, Math.min(position, next.length)), 0, placement);
    this.setCanvas(next);
  }

  setCollapsed(id: SectionId, collapsed: boolean): Promise<boolean> {
    return this.updateSection(id, { collapsed });
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
          this.sectionErrorState.set(messageOf(error));
        }
        return false;
      }
      }),
    );
  }

  /** Resizes one section optimistically, with rollback limited to its width field. */
  setColumnSpan(id: SectionId, columnSpan: SectionColumnSpan): Promise<boolean> {
    return this.resizeColumnSpan(
      `section:${id}`,
      columnSpan,
      () => this.sectionsState().find((section) => section.id === id)?.columnSpan,
      (span) => this.patchSectionColumnSpan(id, span),
      () => reportedWrite(this.reporter, () => this.gateway.sections.update(id, { columnSpan }), sectionReport),
      (result) => result.section.columnSpan,
      (result) => this.replaceSection(result.section),
    );
  }

  setCollapsedShortcut(id: SectionShortcutId, collapsed: boolean): Promise<boolean> {
    return this.updateShortcut(id, { collapsed });
  }

  /** Resizes one shortcut placement without changing its source section. */
  setColumnSpanShortcut(id: SectionShortcutId, columnSpan: SectionColumnSpan): Promise<boolean> {
    return this.resizeColumnSpan(
      `shortcut:${id}`,
      columnSpan,
      () => this.shortcutsState().find((shortcut) => shortcut.id === id)?.columnSpan,
      (span) => this.patchShortcutColumnSpan(id, span),
      () => this.reportedShortcutWrite(() => this.gateway.shortcuts.update(id, { columnSpan })),
      (result) => result.shortcut.columnSpan,
      (result) => this.replaceShortcut(result.shortcut),
    );
  }

  updateShortcut(id: SectionShortcutId, input: UpdateSectionShortcutInput): Promise<boolean> {
    return this.mutate(async ({ current }) => {
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
            this.sectionErrorState.set(messageOf(error));
          }
          return false;
        }
      }),
    );
  }

  removeShortcut(id: SectionShortcutId): Promise<boolean> {
    return this.mutate(async ({ current, projectId, pageId, generation }) => {
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
   * awaits the gateway and then patches, which is how `setCollapsed`, `setColumnSpan` and
   * `updateConfig` all behave; rename joining them is one code path rather than a fourth
   * idiom. §63 asks for optimism on *important interactions*, and a name committed on blur
   * against a local host is not one.
   */
  renameSection(id: SectionId, title: string | null): Promise<boolean> {
    return this.updateSection(id, { title });
  }

  updateConfig(id: SectionId, config: SectionConfig): Promise<boolean> {
    return this.updateSection(id, { config });
  }

  /**
   * Removes or retains one section. Its receipt goes to the header's history, which is where the
   * removal's Undo lives (Slice 41); the canvas keeps only the recovery the header cannot offer —
   * Open Archive when Archive will list the section, and Retry refresh when the follow-up read
   * fails. A live-row refusal remains a question for the existing policy dialog.
   */
  removeSection(id: SectionId, input: RemoveSectionInput = {}): Promise<boolean> {
    if (this.removalPendingState()) return Promise.resolve(false);
    const savedInput = { ...input };
    const unresolved = this.failedRemovalState();
    if (unresolved !== null && !this.isSameFailedRemoval(unresolved, id, savedInput)) {
      this.sectionErrorState.set(FAILED_REMOVAL_GUARD_MESSAGE);
      return Promise.resolve(false);
    }
    const name = this.sectionsState().find((section) => section.id === id);
    const removedName = name === undefined ? 'the section' : `the ${nameOf(name)} section`;
    this.removalPendingState.set(true);
    let failed = false;
    const operation = this.mutate(async ({ current, projectId, pageId, generation }) => {
      let result: Awaited<ReturnType<typeof this.gateway.sections.remove>>;
      try {
        result = await reportedWrite(this.reporter, () => this.gateway.sections.remove(id, savedInput), sectionReport);
      } catch (error) {
        if (!current()) return;
        if (error instanceof GatewayError && error.code === 'rule_violation') {
          const available = SectionAlreadyRemovedDetailsSchema.safeParse(error.details);
          if (available.success && available.data.sectionId === id) {
            // The exact actor's earlier removal: its receipt goes to the header, not to a button here.
            const recovered = this.reporter.begin();
            recovered.committed({ projectId, receipt: available.data.operation });
            recovered.end();
            this.removalPromptState.set(null);
            this.clearFailedRemovalFor(id);
            this.recoveryNoticeState.set({ message: 'This section was already removed. Undo is in the header.', removal: { sectionId: id } });
            this.removePlacement(id);
            this.notifyProjectDataChanged();
            await this.waitForOtherSectionWrites();
            const refreshed = await this.reconcileSections(projectId, pageId, generation);
            if (!refreshed) this.markRefreshFailed(current);
            return;
          }
          const refusal = SectionRemovalRefusalDetailsSchema.safeParse(error.details);
          if (refusal.success) {
            this.clearFailedRemovalFor(id);
            this.removalPromptState.set(this.removalPromptFor(id, refusal.data.liveRowCount));
            return;
          }
        }
        this.failedRemovalState.set({ sectionId: id, input: savedInput, message: messageOf(error) });
        failed = true;
        return;
      }
      if (!current()) return;
      this.removalPromptState.set(null);
      this.clearFailedRemovalFor(id);
      // Archive is offered only when the removal says Archive will list the section
      // (`note-2026-09-15-006`); otherwise the header's changed label is the confirmation.
      this.recoveryNoticeState.set(result.archiveListed
        ? { message: `Removed ${removedName}. Undo is in the header.`, removal: { sectionId: id, archiveListed: true } }
        : null);
      // Paint the committed removal immediately. Neighbor positions still come from the
      // authoritative read.
      this.removePlacement(id);
      if (savedInput.policy !== undefined) this.notifyProjectDataChanged();
      await this.waitForOtherSectionWrites();
      const refreshed = await this.reconcileSections(projectId, pageId, generation);
      if (!refreshed) this.markRefreshFailed(current);
    });
    return operation
      .then((succeeded) => succeeded && !failed)
      .finally(() => this.removalPendingState.set(false));
  }

  /** Retry uses the exact section id and policy the user selected; it is never automatic. */
  retryFailedRemoval(): Promise<boolean> {
    const failed = this.failedRemovalState();
    return failed === null ? Promise.resolve(false) : this.removeSection(failed.sectionId, failed.input);
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

  /** Dismisses only the failed remove message; any recovery notice stays. */
  dismissFailedRemoval(): void {
    this.failedRemovalState.set(null);
    if (this.sectionErrorState() === FAILED_REMOVAL_GUARD_MESSAGE) this.sectionErrorState.set(null);
  }

  private clearFailedRemovalFor(id: SectionId): void {
    if (this.failedRemovalState()?.sectionId === id) this.failedRemovalState.set(null);
  }

  private isSameFailedRemoval(
    failed: FailedSectionRemoval,
    id: SectionId,
    input: RemoveSectionInput,
  ): boolean {
    return failed.sectionId === id &&
      failed.input.policy === input.policy &&
      failed.input.reassignToSectionId === input.reassignToSectionId;
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

  /** A shortcut write records in the destination root: this canvas's project. */
  private reportedShortcutWrite<T extends { operation: OperationWriteReport['receipt'] }>(write: () => Promise<T>): Promise<T> {
    const projectId = this.requestedProjectId;
    return reportedWrite(this.reporter, write, ({ operation }) => ({ projectId: projectId!, receipt: operation }));
  }

  private async waitForOtherSectionWrites(threshold = 1): Promise<void> {
    if (this.pendingSectionWrites <= threshold) return;
    await new Promise<void>((resolve) => this.sectionWriteWaiters.push({ threshold, resolve }));
  }

  /**
   * The parts the dialog composes its question from. `ownedKindOf` is narrowed rather than
   * cast: only a container can refuse this way, so a `undefined` here is a bug — and an
   * early throw lands it in `mutate`'s catch and the section error line, which is where a
   * bug belongs.
   */
  private removalPromptFor(id: SectionId, rowCount: number): SectionRemovalPrompt {
    const section = this.sectionsState().find((candidate) => candidate.id === id);
    if (section === undefined) throw new Error(`section "${id}" refused removal but is not on the canvas`);
    const ownedKind = ownedKindOf(section.type);
    if (ownedKind === undefined) throw new TypeError(`section "${id}" refused removal as non-empty but owns no rows`);
    return { sectionId: id, sectionName: nameOf(section), rowCount, ownedKind, targets: this.reassignTargets(id) };
  }

  /** The containers a refused removal could hand its rows to: same type, same page. */
  private reassignTargets(id: SectionId): ProjectSection[] {
    const section = this.sectionsState().find((candidate) => candidate.id === id);
    if (section === undefined) return [];
    return this.sectionsState().filter(
      (candidate) => candidate.id !== id && candidate.type === section.type,
    );
  }

  dismissRemovalPrompt(): void {
    this.removalPromptState.set(null);
  }

  private updateSection(
    id: SectionId,
    input: Parameters<typeof this.gateway.sections.update>[1],
  ): Promise<boolean> {
    return this.mutate(async ({ current }) => {
      const updated = await reportedWrite(this.reporter, () => this.gateway.sections.update(id, input), sectionReport);
      if (!current()) return;
      this.replaceSection(updated.section);
    });
  }

  private patchSectionColumnSpan(id: SectionId, columnSpan: SectionColumnSpan): void {
    const section = this.sectionsState().find((candidate) => candidate.id === id);
    if (section !== undefined) this.replaceSection({ ...section, columnSpan });
  }

  private patchShortcutColumnSpan(id: SectionShortcutId, columnSpan: SectionColumnSpan): void {
    const shortcut = this.shortcutsState().find((candidate) => candidate.id === id);
    if (shortcut !== undefined) this.replaceShortcut({ ...shortcut, columnSpan });
  }

  /** Width-only optimism keeps newer canvas chrome fields when a resize is refused. */
  private resizeColumnSpan<T>(
    key: string,
    columnSpan: SectionColumnSpan,
    readCurrent: () => SectionColumnSpan | undefined,
    paint: (span: SectionColumnSpan) => void,
    write: () => Promise<T>,
    readSavedSpan: (record: T) => SectionColumnSpan,
    applySaved: (record: T) => void,
    onSaved: (record: T) => void = () => {},
  ): Promise<boolean> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (!this.loaded || projectId === undefined || pageId === undefined) return Promise.resolve(false);
    const before = readCurrent();
    if (before === undefined) return Promise.resolve(false);
    const generation = this.loadGeneration;
    const current = () => this.current(generation, projectId, pageId);
    const stateKey = `${generation}:${key}`;
    let state = this.columnSpanWrites.get(stateKey);
    if (state === undefined) {
      state = {
        nextSequence: 0,
        confirmedSequence: 0,
        confirmedSpan: before,
        pending: new Map(),
      };
      this.columnSpanWrites.set(stateKey, state);
    }
    const sequence = ++state.nextSequence;
    state.pending.set(sequence, columnSpan);
    const latest = () => state!.nextSequence === sequence;

    return this.track(() =>
      this.whileWriting(async () => {
        if (current()) {
          this.sectionErrorState.set(null);
          paint(columnSpan);
        }
        try {
          const saved = await write();
          state!.pending.delete(sequence);
          if (!current()) {
            this.cleanupColumnSpanWrite(stateKey, state!);
            return true;
          }
          const savedSpan = readSavedSpan(saved);
          if (sequence > state!.confirmedSequence) {
            state!.confirmedSequence = sequence;
            state!.confirmedSpan = savedSpan;
          }
          if (latest()) applySaved(saved);
          onSaved(saved);
          this.paintColumnSpanWrite(state!, paint);
          this.cleanupColumnSpanWrite(stateKey, state!);
          return true;
        } catch (error) {
          state!.pending.delete(sequence);
          if (current()) {
            this.paintColumnSpanWrite(state!, paint);
            if (latest()) this.sectionErrorState.set(messageOf(error));
          }
          this.cleanupColumnSpanWrite(stateKey, state!);
          return false;
        }
      }),
    );
  }

  private paintColumnSpanWrite(
    state: ColumnSpanWriteState,
    paint: (span: SectionColumnSpan) => void,
  ): void {
    let pendingSequence = state.confirmedSequence;
    let pendingSpan: SectionColumnSpan | undefined;
    for (const [sequence, span] of state.pending) {
      if (sequence > pendingSequence) {
        pendingSequence = sequence;
        pendingSpan = span;
      }
    }
    paint(pendingSpan ?? state.confirmedSpan);
  }

  private cleanupColumnSpanWrite(key: string, state: ColumnSpanWriteState): void {
    if (state.pending.size === 0 && this.columnSpanWrites.get(key) === state) {
      this.columnSpanWrites.delete(key);
    }
  }

  /**
   * The canvas is left exactly as it was when a write fails, with the reason visible. A
   * silent failure on a remove or a config save is the one that costs the user work.
   */
  private mutate(
    operation: (context: {
      current: () => boolean;
      projectId: ProjectId;
      pageId: ProjectPageId;
      generation: number;
    }) => Promise<void>,
  ): Promise<boolean> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (!this.loaded || projectId === undefined || pageId === undefined) return Promise.resolve(false);
    const generation = this.loadGeneration;
    const current = () => this.current(generation, projectId, pageId);

    return this.track(() =>
      this.whileWriting(async () => {
        if (current()) this.sectionErrorState.set(null);
        try {
          await operation({ current, projectId, pageId, generation });
          return true;
        } catch (error) {
          if (current()) this.sectionErrorState.set(messageOf(error));
          return false;
        }
      }),
    );
  }

  /**
   * A popup-owned create returns its failure text directly and must not clear or replace the
   * canvas error signal. Writes for a page that changed while the request was in flight are
   * considered complete because the popup has already closed.
   */
  private mutateWithResult(
    operation: (context: {
      current: () => boolean;
      projectId: ProjectId;
      pageId: ProjectPageId;
      generation: number;
    }) => Promise<void>,
  ): Promise<CanvasWriteResult> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (!this.loaded || projectId === undefined || pageId === undefined) {
      return Promise.resolve({ ok: false, message: 'The canvas has not finished loading' });
    }
    if (!this.orderCompleteState()) {
      return Promise.resolve({
        ok: false,
        message: this.sectionErrorState() ?? 'The canvas order is incomplete',
      });
    }
    const generation = this.loadGeneration;
    const current = () => this.current(generation, projectId, pageId);

    return this.track(() =>
      this.whileWriting(async (): Promise<CanvasWriteResult> => {
        try {
          await operation({ current, projectId, pageId, generation });
          return { ok: true };
        } catch (error) {
          return current() ? { ok: false, message: messageOf(error) } : { ok: true };
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
    if (shortcutsResult.status === 'rejected') {
      this.sectionErrorState.set(messageOf(shortcutsResult.reason));
    }
    if (sectionsResult.status === 'rejected') return false;
    const shortcuts = shortcutsResult.status === 'fulfilled' ? shortcutsResult.value : this.shortcutsState();
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
