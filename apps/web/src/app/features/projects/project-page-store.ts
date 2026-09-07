import { DestroyRef, Injectable, PendingTasks, inject, signal } from '@angular/core';
import {
  SectionConfigSchema,
  SectionRemovalRefusalDetailsSchema,
  nameOf,
  ownedKindOf,
  type OwnedDataKind,
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
import { LIVE_UPDATES } from '../../core/live/live-updates';
import type { LiveEvent } from '@cwm/contracts';
import type { SectionDefinition } from './sections/registry';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const byPosition = (a: ProjectSection, b: ProjectSection): number => a.position - b.position;

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
 * §32's `editMode` is transient page state: it changes chrome, never persistence. A page
 * change resets it so layout affordances do not leak from one canvas into another.
 */
@Injectable()
export class ProjectPageStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);

  private readonly sectionsState = signal<ProjectSection[]>([]);
  private readonly shortcutsState = signal<ResolvedSectionShortcut[]>([]);
  private readonly placementsState = signal<ProjectCanvasPlacement[]>([]);
  // Starts true: before the first load resolves the page has no project, no error and no
  // loading flag, which matches none of the template's branches and paints blank.
  private readonly loadingState = signal(true);
  private loadGeneration = 0;
  /** Set before the first gateway await, so a startup frame can still be routed. */
  private requestedProjectId: ProjectId | undefined;
  private requestedPageId: ProjectPageId | undefined;
  /**
   * Whether a load has completed. The staleness guards used to ask `projectState() !== null`,
   * which answered "is anything loaded" as a side effect; with the record gone, `sections()`
   * cannot take that job — an empty canvas is a legitimate state, not an unloaded one.
   */
  private loaded = false;
  private activeLoad: Promise<void> | null = null;
  private fullRecoveryQueued = false;
  private readonly errorState = signal<string | null>(null);
  private readonly sectionErrorState = signal<string | null>(null);
  private readonly editModeState = signal(false);
  /** Set when a container refuses removal because it still holds rows — see `removeSection`. */
  private readonly removalPromptState = signal<SectionRemovalPrompt | null>(null);
  private readonly canvasRevisionState = signal(0);
  private readonly projectDataRevisionState = signal(0);
  private readonly projectHierarchyRevisionState = signal(0);
  /**
   * Section writes in flight. §62's frames arrive *before* the tab's own mutation response
   * (the host flushes at commit) and `moveSection` paints optimistically — so a live re-read
   * landing in that window would replace the preview with the pre-write value for a frame.
   *
   * Deferred, **not** dropped. Only three of the section writes reconcile the canvas
   * afterwards (`moveSection`, `duplicateSection`, `removeSection`); `addSection` and
   * `updateSection` patch the array in place. So an agent adding a section while the user
   * happens to be collapsing one would otherwise be lost until a reload.
   */
  private pendingSectionWrites = 0;
  private sectionRefresh: Promise<void> | null = null;
  private sectionRefreshQueued = false;

  readonly sections = this.sectionsState.asReadonly();
  readonly shortcuts = this.shortcutsState.asReadonly();
  readonly placements = this.placementsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly sectionError = this.sectionErrorState.asReadonly();
  readonly editMode = this.editModeState.asReadonly();
  readonly canvasRevision = this.canvasRevisionState.asReadonly();
  readonly projectDataRevision = this.projectDataRevisionState.asReadonly();
  readonly removalPrompt = this.removalPromptState.asReadonly();
  readonly projectHierarchyRevision = this.projectHierarchyRevisionState.asReadonly();

  constructor() {
    // §62. Subscribing here rather than in `ProjectCanvas` keeps the component free of the
    // stream, the same way it is free of the gateway; `DestroyRef` ties the subscription to
    // the store's own lifetime, and this store is provided by the canvas (§20).
    const unsubscribe = inject(LIVE_UPDATES).subscribe(
      (event) => this.onLiveEvent(event),
      () => this.onLiveConnected(),
    );
    inject(DestroyRef).onDestroy(unsubscribe);
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
      if (projectId !== undefined && pageId !== undefined) void this.load(projectId, pageId);
      return;
    }

    const projectId = this.requestedProjectId;
    if (projectId === undefined) return;

    const aboutThisProject =
      event.projectId === projectId || (event.type.startsWith('project.') && event.entityId === projectId);
    const hasShortcuts = this.shortcutsState().length > 0;
    const isInRootTree = event.rootProjectId === projectId;
    if (event.type.startsWith('project.')) this.notifyProjectHierarchyChanged();
    if (!aboutThisProject && !(hasShortcuts && isInRootTree)) return;

    // The containers re-read themselves off the revision; only a change to the canvas's own
    // section list needs a `sections.list`, which is what `project.*` frames carry.
    this.notifyProjectDataChanged();
    if (this.activeLoad !== null) {
      this.fullRecoveryQueued = true;
      return;
    }
    if (!event.type.startsWith('project.')) return;
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
        const [sectionsResult, shortcutsResult] = await Promise.allSettled([
          this.gateway.sections.list(projectId, { pageId }),
          this.gateway.shortcuts.list(projectId, { pageId }),
        ]);
        if (!this.current(generation, projectId, pageId)) continue;
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
          this.sectionErrorState.set(messageOf(shortcutsResult.reason));
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
    const generation = this.loadGeneration;
    return this.track(async () => {
      try {
        const shortcuts = await this.gateway.shortcuts.list(projectId, { pageId });
        if (!this.current(generation, projectId, pageId)) return;
        this.setCanvas(this.composePlacements(this.sectionsState(), shortcuts));
        this.sectionErrorState.set(null);
      } catch (error) {
        if (this.current(generation, projectId, pageId)) this.sectionErrorState.set(messageOf(error));
      }
    });
  }

  /**
   * The canvas of **one page** (§27). Navigating between two pages of the same root re-uses
   * this component and this store, so a response that lands after the page changed must write
   * nothing — the guard is the page as well as the project.
   */
  load(projectId: ProjectId, pageId: ProjectPageId): Promise<void> {
    const generation = ++this.loadGeneration;
    const current = () => generation === this.loadGeneration;
    this.requestedProjectId = projectId;
    this.requestedPageId = pageId;
    this.loaded = false;
    // A refresh in flight for the page being left exits on the generation check without
    // consuming this, and the flag would otherwise buy the *next* page a gratuitous re-read.
    this.sectionRefreshQueued = false;
    this.editModeState.set(false);

    const operation = this.track(async () => {
      this.loadingState.set(true);
      this.errorState.set(null);
      this.sectionErrorState.set(null);
      const [sectionsResult, shortcutsResult] = await Promise.allSettled([
        this.gateway.sections.list(projectId, { pageId }),
        this.gateway.shortcuts.list(projectId, { pageId }),
      ]);
      if (!current()) return;
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

  private setCanvas(placements: readonly ProjectCanvasPlacement[]): void {
    const next = [...placements];
    this.placementsState.set(next);
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
   * §26's Quick Add. The registry's default config is what reaches persistence, and the
   * canvas's own `pageId` travels with it: §27 resolves an unnamed write onto the project's
   * canonical page, which is the right answer for Home and a work canvas and the wrong one
   * for every other page a root can show.
   */
  addSection(definition: SectionDefinition): Promise<boolean> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (projectId === undefined || pageId === undefined) return Promise.resolve(false);
    return this.mutate(async ({ current }) => {
      // Parsed, not cast: §29 types `createDefaultConfig` as `unknown`, and a definition
      // that returns a non-object should fail here rather than at the host.
      const config = SectionConfigSchema.parse(definition.createDefaultConfig());
      const created = await this.gateway.sections.create(projectId, {
        type: definition.type,
        pageId,
        config,
      });
      if (!current()) return;
      this.replaceSection(created);
    });
  }

  /** Adds a placement to this Home canvas; the source remains owned by its canonical page. */
  addShortcut(input: CreateSectionShortcutInput): Promise<boolean> {
    const projectId = this.requestedProjectId;
    const pageId = this.requestedPageId;
    if (projectId === undefined || pageId === undefined || input.pageId !== pageId) return Promise.resolve(false);
    return this.mutate(async ({ current }) => {
      const created = await this.gateway.shortcuts.create(projectId, input);
      if (!current()) return;
      this.replaceShortcut(created);
    });
  }

  setCollapsed(id: SectionId, collapsed: boolean): Promise<boolean> {
    return this.updateSection(id, { collapsed });
  }

  setEditMode(editing: boolean): void {
    this.editModeState.set(editing);
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
        await this.gateway.sections.move(id, { position });
        if (!current()) return true;

        // The preview remains visibly successful if the follow-up read fails. It is a
        // rendering order, not a second implementation of domain validation.
        await this.reconcileSections(projectId, pageId, generation);
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

  setColumnSpan(id: SectionId, columnSpan: SectionColumnSpan): Promise<boolean> {
    return this.updateSection(id, { columnSpan });
  }

  setCollapsedShortcut(id: SectionShortcutId, collapsed: boolean): Promise<boolean> {
    return this.updateShortcut(id, { collapsed });
  }

  setColumnSpanShortcut(id: SectionShortcutId, columnSpan: SectionColumnSpan): Promise<boolean> {
    return this.updateShortcut(id, { columnSpan });
  }

  updateShortcut(id: SectionShortcutId, input: UpdateSectionShortcutInput): Promise<boolean> {
    return this.mutate(async ({ current }) => {
      const updated = await this.gateway.shortcuts.update(id, input);
      if (!current()) return;
      this.replaceShortcut(updated);
    });
  }

  moveShortcut(id: SectionShortcutId, position: number): Promise<boolean> {
    if (!this.loaded || this.requestedProjectId === undefined || this.requestedPageId === undefined) {
      return Promise.resolve(false);
    }
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
          await this.gateway.shortcuts.move(id, { position });
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
      await this.gateway.shortcuts.remove(id);
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

  duplicateSection(id: SectionId): Promise<boolean> {
    return this.mutate(async ({ current, projectId, pageId, generation }) => {
      const copy = await this.gateway.sections.duplicate(id);
      if (!current()) return;
      // Insert only into the render order, then reconcile. The domain has already
      // renumbered siblings, but only the returned copy is authoritative here; changing
      // every sibling's persisted `position` would duplicate SectionService's rule.
      const preview = [...this.placementsState()];
      preview.splice(
        Math.max(0, Math.min(copy.position, preview.length)),
        0,
        { kind: 'section', section: copy },
      );
      this.setCanvas(preview);
      await this.reconcileSections(projectId, pageId, generation);
    });
  }

  /**
   * Removal **archives**. A view, an empty container, and a container holding only archived
   * rows go without ceremony — this sends no policy and the domain archives them, and the
   * Archived region below the canvas is what makes that safe. A container still holding
   * *live* rows answers 409 `rule_violation` carrying a discriminated `section_not_empty`
   * payload; that is not an error to render, it is a **question to ask**, so it opens
   * `removalPrompt` instead of `sectionError`.
   *
   * **Only that payload opens the dialog.** A 409 with missing, malformed, zero-valued or
   * differently discriminated details is not safely identifiable as the question this dialog
   * can answer, so it surfaces as an ordinary error. The count still comes from the domain
   * rather than from a client-side row count, so the dialog and the rule cannot disagree.
   */
  removeSection(id: SectionId, input: RemoveSectionInput = {}): Promise<boolean> {
    return this.mutate(async ({ current, projectId, pageId, generation }) => {
      try {
        await this.gateway.sections.remove(id, input);
      } catch (error) {
        if (current() && error instanceof GatewayError && error.code === 'rule_violation') {
          const refusal = SectionRemovalRefusalDetailsSchema.safeParse(error.details);
          if (refusal.success) {
            this.removalPromptState.set(this.removalPromptFor(id, refusal.data.liveRowCount));
            // Swallowed on purpose: `mutate` would otherwise park the domain's sentence in
            // `sectionError`, beside a dialog already asking the question properly.
            return;
          }
        }
        throw error;
      }
      if (!current()) return;
      this.removalPromptState.set(null);
      // Removing the render item is safe; filling the persisted position gap belongs to
      // SectionService and arrives through the authoritative re-read below.
      this.setCanvas(
        this.placementsState().filter((placement) => !(placement.kind === 'section' && placement.section.id === id)),
      );
      await this.reconcileSections(projectId, pageId, generation);
      // A cascade or a reassign moved rows, so every container has to re-read.
      if (input.policy !== undefined) this.notifyProjectDataChanged();
    });
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

  /**
   * What the Archived region calls after restoring a section. It **adds** a section to the
   * canvas, so bumping the data revision is not enough: that makes the existing containers
   * re-read, and paints no new frame. `reconcileSections` is private and the region's store
   * must not reach into this one, so this is the entry point the two constraints leave.
   */
  async sectionRestored(): Promise<void> {
    await this.reconcileSections();
    this.notifyProjectDataChanged();
  }

  /**
   * The mirror, for a restored **row**. It becomes live inside a container that is already
   * on the canvas, and that container re-reads only when its data revision moves — so
   * without this, "restores with no reload" would hold for sections and quietly fail for
   * rows.
   */
  rowRestored(): void {
    this.notifyProjectDataChanged();
  }

  private updateSection(
    id: SectionId,
    input: Parameters<typeof this.gateway.sections.update>[1],
  ): Promise<boolean> {
    return this.mutate(async ({ current }) => {
      const updated = await this.gateway.sections.update(id, input);
      if (!current()) return;
      this.replaceSection(updated);
    });
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
   * Re-reads the canvas after a successful write, and **swallows its own failure**. The
   * write already landed; reporting a failed re-read as a failed write would tell the user
   * their remove did not happen and invite them to click it again — which now answers the
   * already-archived 409, because removal archives and the record is still there. The
   * render-only update above is close enough to live with until the next load. Persisted
   * sibling positions remain untouched unless they came from the host.
   */
  private async reconcileSections(
    projectId = this.requestedProjectId,
    pageId = this.requestedPageId,
    generation = this.loadGeneration,
  ): Promise<void> {
    if (projectId === undefined || pageId === undefined) return;
    const [sectionsResult, shortcutsResult] = await Promise.allSettled([
      this.gateway.sections.list(projectId, { pageId }),
      this.gateway.shortcuts.list(projectId, { pageId }),
    ]);
    if (!this.current(generation, projectId, pageId)) return;
    if (sectionsResult.status === 'fulfilled') {
      const shortcuts = shortcutsResult.status === 'fulfilled' ? shortcutsResult.value : this.shortcutsState();
      this.setCanvas(this.composePlacements([...sectionsResult.value].sort(byPosition), shortcuts));
      this.loaded = true;
      if (shortcutsResult.status === 'fulfilled') this.sectionErrorState.set(null);
    }
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
    return operation().finally(() => {
      this.pendingSectionWrites -= 1;
      if (this.pendingSectionWrites === 0 && this.sectionRefreshQueued) {
        this.sectionRefreshQueued = false;
        void this.refreshSections();
      }
    });
  }
}
