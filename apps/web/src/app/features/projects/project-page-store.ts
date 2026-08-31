import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import {
  SectionConfigSchema,
  type ProjectId,
  type Project,
  type ProgressResult,
  type ProjectSection,
  type ProjectStatus,
  type SectionColumnSpan,
  type SectionConfig,
  type SectionId,
  type UpdateProjectInput,
} from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../core/live/live-updates';
import { TaskListStore } from '../tasks/task-list-store';
import type { LiveEvent } from '@cwm/contracts';
import type { SectionDefinition } from './sections/registry';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const byPosition = (a: ProjectSection, b: ProjectSection): number => a.position - b.position;

/**
 * §19's `ProjectPageStore`, feature-scoped and provided by `ProjectPage` alone (§20).
 *
 * It composes `TaskListStore` for the page's shared task data, while header progress comes
 * from the canonical §39 domain read. Task writes explicitly refresh that independent read.
 *
 * §32's `editMode` is transient page state: it changes chrome, never persistence. A route
 * change resets it so layout affordances do not leak from one project into another.
 */
@Injectable()
export class ProjectPageStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly tasks = inject(TaskListStore);
  private readonly pendingTasks = inject(PendingTasks);

  private readonly projectState = signal<Project | null>(null);
  private readonly sectionsState = signal<ProjectSection[]>([]);
  // Starts true: before the first load resolves the page has no project, no error and no
  // loading flag, which matches none of the template's branches and paints blank.
  private readonly loadingState = signal(true);
  private loadGeneration = 0;
  /** Set before the first gateway await, so a startup frame can still be routed. */
  private requestedProjectId: ProjectId | undefined;
  private activeLoad: Promise<void> | null = null;
  private fullRecoveryQueued = false;
  private readonly errorState = signal<string | null>(null);
  private readonly sectionErrorState = signal<string | null>(null);
  /**
   * A failed *project* write. Distinct from `errorState`, which renders instead of the whole
   * page — a failed rename must never blank the project you are standing on — and from
   * `sectionErrorState`, which every successful quiet re-read clears, so a message parked
   * there can vanish milliseconds later.
   */
  private readonly writeErrorState = signal<string | null>(null);
  private readonly editModeState = signal(false);
  private readonly canvasRevisionState = signal(0);
  private readonly progressState = signal<ProgressResult | null>(null);
  private readonly projectDataRevisionState = signal(0);
  private readonly projectHierarchyRevisionState = signal(0);
  private progressRefresh: Promise<void> | null = null;
  private progressRefreshQueued = false;
  /**
   * Writes in flight — section *and* project. §62's frames arrive *before* the tab's own
   * mutation response (the host flushes at commit), and both `moveSection` and the project
   * writes paint optimistically — so a live re-read landing in that window would replace the
   * preview with the pre-write value for a frame. Without this an optimistic rename is
   * overwritten by the very frame its own write produces.
   *
   * One counter rather than two: all three check sites below ask the same question, and a
   * second counter would mean consulting both at every one of them.
   *
   * Deferred, **not** dropped. Only three of the section writes reconcile the canvas
   * afterwards (`moveSection`, `duplicateSection`, `removeSection`); `addSection` and
   * `updateSection` patch the array in place, and none of them re-reads the *project*
   * record. So an agent adding a section, or renaming the project, while the user happens to
   * be collapsing one would otherwise be lost until a reload.
   */
  private pendingWrites = 0;
  private projectRefresh: Promise<void> | null = null;
  private projectRefreshQueued = false;

  readonly project = this.projectState.asReadonly();
  readonly sections = this.sectionsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly sectionError = this.sectionErrorState.asReadonly();
  readonly writeError = this.writeErrorState.asReadonly();
  readonly editMode = this.editModeState.asReadonly();
  readonly canvasRevision = this.canvasRevisionState.asReadonly();
  readonly progressResult = this.progressState.asReadonly();
  readonly projectDataRevision = this.projectDataRevisionState.asReadonly();
  readonly projectHierarchyRevision = this.projectHierarchyRevisionState.asReadonly();

  /** The selected §39 domain result; `null` means unavailable and remains distinct from 0%. */
  readonly progress = computed<number | null>(() => this.progressState()?.percentage ?? null);

  constructor() {
    // §62. Subscribing here rather than in `ProjectPage` keeps the component free of the
    // stream, the same way it is free of the gateway; `DestroyRef` ties the subscription to
    // the store's own lifetime, and this store is provided by the page (§20).
    const unsubscribe = inject(LIVE_UPDATES).subscribe(
      (event) => this.onLiveEvent(event),
      () => this.onLiveConnected(),
    );
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  /**
   * §62's "refresh relevant state", for one project page.
   *
   * Ordinary mutation and reconnect paths are **quiet**: an agent's write must not flicker
   * a skeleton over a page the user is reading, and a host blip during someone else's write
   * must not replace the canvas with an error. `prototype.reloaded` is the deliberate loud
   * exception because the host document and its derived inputs may all have been replaced.
   * `refreshProgress` and `reconcileSections` already behave quietly; `TaskListStore.refresh`
   * was given the same rule.
   *
   * Routing is on `type` and `projectId`, never on `entityType` — §57's section events
   * deliberately name the *project* as their entity.
   */
  private onLiveEvent(event: LiveEvent): void {
    // A host-state change (seed, reset, clock) replaces everything this page is built from.
    if (event.type === 'prototype.reloaded') {
      const projectId = this.requestedProjectId;
      if (projectId !== undefined) void this.load(projectId);
      return;
    }

    const projectId = this.requestedProjectId;
    if (projectId === undefined) return;

    const aboutThisProject =
      event.projectId === projectId || (event.type.startsWith('project.') && event.entityId === projectId);
    if (event.type.startsWith('project.')) this.notifyProjectHierarchyChanged();
    if (!aboutThisProject) return;

    this.notifyProjectDataChanged();
    if (this.activeLoad !== null) {
      this.fullRecoveryQueued = true;
      return;
    }

    // Any current-project mutation may change task-derived progress or visible tasks.
    void this.tasks.refresh();
    void this.refreshProgress();
    if (!event.type.startsWith('project.')) return;
    if (this.pendingWrites > 0) {
      this.projectRefreshQueued = true;
      return;
    }
    void this.refreshProject();
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
    // Project must recover before progress: a failed loud load has no `projectState` yet,
    // and `refreshProgress` intentionally refuses to read without one.
    void Promise.all([this.tasks.refresh(), this.refreshProject().then(() => this.refreshProgress())]);
  }

  /**
   * The project record and its canvas, re-read after someone else changed either. Quiet on
   * failure for the same reason `reconcileSections` is: the page on screen is still the
   * better answer than an error the user did not cause.
   */
  private refreshProject(): Promise<void> {
    if (this.pendingWrites > 0) {
      this.projectRefreshQueued = true;
      return Promise.resolve();
    }
    if (this.projectRefresh !== null) {
      this.projectRefreshQueued = true;
      return this.projectRefresh;
    }
    const projectId = this.requestedProjectId;
    if (projectId === undefined) return Promise.resolve();
    const generation = this.loadGeneration;

    const refresh = this.track(async () => {
      do {
        this.projectRefreshQueued = false;
        try {
          const project = await this.gateway.projects.get(projectId);
          const sections = await this.gateway.sections.list(projectId);
          if (generation === this.loadGeneration && this.requestedProjectId === projectId) {
            this.projectState.set(project);
            this.sectionsState.set([...sections].sort(byPosition));
            // These are loud-load errors only. A complete quiet recovery makes them stale.
            this.errorState.set(null);
            this.sectionErrorState.set(null);
          }
        } catch {
          // Quiet — see above.
        }
      } while (
        this.projectRefreshQueued &&
        this.pendingWrites === 0 &&
        generation === this.loadGeneration
      );
    }).finally(() => {
      if (this.projectRefresh === refresh) this.projectRefresh = null;
    });
    this.projectRefresh = refresh;
    return refresh;
  }

  load(projectId: ProjectId): Promise<void> {
    // Clicking project A then project B inside one round trip must not leave A's sections
    // under B's header: without this, whichever response lands last wins, per signal.
    const generation = ++this.loadGeneration;
    const current = () => generation === this.loadGeneration;
    this.requestedProjectId = projectId;
    this.editModeState.set(false);

    const operation = this.track(async () => {
      this.loadingState.set(true);
      this.errorState.set(null);
      this.sectionErrorState.set(null);
      // A failed write belongs to the project it was made on. `ProjectPage` re-uses one
      // component instance across `/projects/:id` changes, so without this a rename that
      // failed on project A shows in project B's header, over a write nobody made.
      this.writeErrorState.set(null);
      this.progressState.set(null);
      try {
        // Sequential on purpose: a project the caller cannot see must fail as "not found"
        // rather than racing a section list that would report the same thing less clearly.
        const project = await this.gateway.projects.get(projectId);
        const sections = await this.gateway.sections.list(projectId);
        if (!current()) return;
        this.projectState.set(project);
        this.sectionsState.set([...sections].sort(byPosition));
      } catch (error) {
        if (!current()) return;
        this.projectState.set(null);
        this.sectionsState.set([]);
        this.errorState.set(messageOf(error));
      } finally {
        // The task load is inside the loading window: leaving it outside made the header
        // paint "Not available" for a frame before the real percentage arrived.
        if (current()) {
          // Task and canonical progress reads fail independently: either feature can still
          // render its own answer when the other request fails.
          await Promise.all([this.tasks.load(projectId), this.refreshProgressFor(projectId, generation, false)]);
          if (current()) this.loadingState.set(false);
        }
      }
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

  refreshProgress(): Promise<void> {
    if (this.progressRefresh !== null) {
      this.progressRefreshQueued = true;
      return this.progressRefresh;
    }
    const projectId = this.projectState()?.id;
    if (projectId === undefined) return Promise.resolve();
    const generation = this.loadGeneration;
    this.progressRefresh = this.track(async () => {
      do {
        this.progressRefreshQueued = false;
        await this.refreshProgressFor(projectId, generation, true);
      } while (this.progressRefreshQueued && generation === this.loadGeneration);
    }).finally(() => {
      this.progressRefresh = null;
    });
    return this.progressRefresh;
  }

  private async refreshProgressFor(projectId: ProjectId, generation: number, quiet: boolean): Promise<void> {
    try {
      const result = await this.gateway.progress.get(projectId);
      if (generation === this.loadGeneration && this.projectState()?.id === projectId) this.progressState.set(result);
    } catch {
      if (!quiet && generation === this.loadGeneration && this.projectState()?.id === projectId) {
        this.progressState.set(null);
      }
    }
  }

  /** §26's Quick Add. The registry's default config is what reaches persistence. */
  addSection(definition: SectionDefinition): Promise<boolean> {
    const projectId = this.projectState()?.id;
    if (projectId === undefined) return Promise.resolve(false);
    return this.mutate(async ({ current }) => {
      // Parsed, not cast: §29 types `createDefaultConfig` as `unknown`, and a definition
      // that returns a non-object should fail here rather than at the host.
      const config = SectionConfigSchema.parse(definition.createDefaultConfig());
      const created = await this.gateway.sections.create(projectId, {
        type: definition.type,
        config,
      });
      if (!current()) return;
      this.sectionsState.update((sections) => [...sections, created].sort(byPosition));
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
    const project = this.projectState();
    if (project === null) return Promise.resolve(false);

    const before = this.sectionsState();
    const from = before.findIndex((section) => section.id === id);
    if (from < 0) return Promise.resolve(false);
    if (from === position) return Promise.resolve(true);

    const generation = this.loadGeneration;
    const current = () =>
      generation === this.loadGeneration && this.projectState()?.id === project.id;

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
    this.sectionsState.set(preview);

    return this.track(() =>
      this.whileWriting(async () => {
      if (current()) this.sectionErrorState.set(null);
      try {
        await this.gateway.sections.move(id, { position });
        if (!current()) return true;

        // The preview remains visibly successful if the follow-up read fails. It is a
        // rendering order, not a second implementation of domain validation.
        await this.reconcileSections(project.id, generation);
        return true;
      } catch (error) {
        if (current()) {
          this.sectionsState.set([...before]);
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

  updateConfig(id: SectionId, config: SectionConfig): Promise<boolean> {
    return this.updateSection(id, { config });
  }

  duplicateSection(id: SectionId): Promise<boolean> {
    return this.mutate(async ({ current, projectId, generation }) => {
      const copy = await this.gateway.sections.duplicate(id);
      if (!current()) return;
      // Insert only into the render order, then reconcile. The domain has already
      // renumbered siblings, but only the returned copy is authoritative here; changing
      // every sibling's persisted `position` would duplicate SectionService's rule.
      this.sectionsState.update((sections) => {
        const preview = [...sections];
        preview.splice(Math.max(0, Math.min(copy.position, preview.length)), 0, copy);
        return preview;
      });
      await this.reconcileSections(projectId, generation);
    });
  }

  removeSection(id: SectionId): Promise<boolean> {
    return this.mutate(async ({ current, projectId, generation }) => {
      await this.gateway.sections.remove(id);
      if (!current()) return;
      // Removing the render item is safe; filling the persisted position gap belongs to
      // SectionService and arrives through the authoritative re-read below.
      this.sectionsState.update((sections) => sections.filter((section) => section.id !== id));
      await this.reconcileSections(projectId, generation);
    });
  }

  /** §26's Rename, optimistic per §63. */
  rename(name: string): Promise<boolean> {
    return this.writeProject({ name }, (project) => ({ ...project, name }));
  }

  /**
   * §26's Status. `archived` is deliberately not offered here: `ProjectService.update` runs
   * the whole archive path — active-children guard, `project.archived` activity row — on any
   * transition into it, so a status list built naively from the enum would archive a project
   * with no confirmation and leave the user on a page that had just left the sidebar.
   */
  setStatus(status: Exclude<ProjectStatus, 'archived'>): Promise<boolean> {
    return this.writeProject({ status }, (project) => ({ ...project, status }));
  }

  /** `null` clears it, which is what puts the header's "No target date" branch in reach. */
  setTargetDate(targetDate: string | null): Promise<boolean> {
    return this.writeProject({ targetDate }, (project) => {
      const next = { ...project };
      if (targetDate === null) delete next.targetDate;
      else next.targetDate = targetDate;
      return next;
    });
  }

  /**
   * §81's archive. `PATCH` with `status: 'archived'` *is* the domain's archive path, so
   * there is no gateway method to add. Awaited rather than optimistic, because the page it
   * runs from disappears when it succeeds — and it returns an outcome instead of navigating,
   * because §19's stores decide and pages navigate.
   */
  archive(): Promise<boolean> {
    return this.writeProject({ status: 'archived' }, null);
  }

  /**
   * One optimistic project write. `paint` is `null` for the write whose result the user
   * never sees on this page, which is archive alone.
   */
  private writeProject(
    input: UpdateProjectInput,
    paint: ((project: Project) => Project) | null,
  ): Promise<boolean> {
    const before = this.projectState();
    if (before === null) return Promise.resolve(false);
    const projectId = before.id;
    const generation = this.loadGeneration;
    // The store's standing staleness idiom: a write that lands after the route moved on
    // writes nothing.
    const current = () =>
      generation === this.loadGeneration && this.projectState()?.id === projectId;

    this.writeErrorState.set(null);
    if (paint !== null) this.projectState.set(paint(before));

    return this.track(() =>
      this.whileWriting(async () => {
        try {
          const updated = await this.gateway.projects.update(projectId, input);
          // The server's record, not the optimistic paint: the host may have normalised
          // something, and `updatedAt` moved whatever else did.
          if (current() && paint !== null) this.projectState.set(updated);
          return true;
        } catch (error) {
          if (current()) {
            if (paint !== null) this.projectState.set(before);
            this.writeErrorState.set(messageOf(error));
          }
          return false;
        }
      }),
    );
  }

  private updateSection(
    id: SectionId,
    input: Parameters<typeof this.gateway.sections.update>[1],
  ): Promise<boolean> {
    return this.mutate(async ({ current }) => {
      const updated = await this.gateway.sections.update(id, input);
      if (!current()) return;
      this.sectionsState.update((sections) =>
        sections.map((section) => (section.id === id ? updated : section)).sort(byPosition),
      );
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
      generation: number;
    }) => Promise<void>,
  ): Promise<boolean> {
    const projectId = this.projectState()?.id;
    if (projectId === undefined) return Promise.resolve(false);
    const generation = this.loadGeneration;
    const current = () =>
      generation === this.loadGeneration && this.projectState()?.id === projectId;

    return this.track(() =>
      this.whileWriting(async () => {
        if (current()) this.sectionErrorState.set(null);
        try {
          await operation({ current, projectId, generation });
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
   * their remove did not happen and invite them to click it again, which answers 404. The
   * render-only update above is close enough to live with until the next load. Persisted
   * sibling positions remain untouched unless they came from the host.
   */
  private async reconcileSections(
    projectId = this.projectState()?.id,
    generation = this.loadGeneration,
  ): Promise<void> {
    if (projectId === undefined) return;
    try {
      const sections = await this.gateway.sections.list(projectId);
      if (generation === this.loadGeneration && this.projectState()?.id === projectId) {
        this.sectionsState.set([...sections].sort(byPosition));
      }
    } catch {
      // Deliberately ignored — see above.
    }
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    return operation().finally(settled);
  }

  /**
   * Holds off §62's re-read for the length of an optimistic write — a section write or a
   * write to the project record itself. One wrapper for both, because both hazards are the
   * same one: the host flushes its frame at commit, which is before the tab's own response
   * lands, so a re-read in that window replaces the optimistic paint with the pre-write
   * value for a frame.
   */
  private whileWriting<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingWrites += 1;
    return operation().finally(() => {
      this.pendingWrites -= 1;
      if (this.pendingWrites === 0 && this.projectRefreshQueued) {
        this.projectRefreshQueued = false;
        void this.refreshProject();
      }
    });
  }
}
