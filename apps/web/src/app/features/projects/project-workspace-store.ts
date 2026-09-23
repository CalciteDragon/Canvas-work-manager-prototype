import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import {
  ProjectStatusSchema,
  isProjectRecordEvent,
  isRootProject,
  type LiveEvent,
  type ProgressResult,
  type Project,
  type ProjectId,
  type ProjectPage,
  type ProjectPageKind,
  type ProjectStatus,
  type UpdateProjectInput,
} from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { OPERATION_HISTORY_REPORTER, reportedWrite } from '../../core/history/operation-history-reporter';
import { LIVE_UPDATES } from '../../core/live/live-updates';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Navigation, so archived projects have no business in it (§31) — as in `ShellStore`. */
const NAVIGABLE_STATUSES = ProjectStatusSchema.options.filter((status) => status !== 'archived');
type ConfigurablePageKind = Exclude<ProjectPageKind, 'home' | 'work'>;

/**
 * A subproject and the work under it. **Derived view state, not an entity**, for the same
 * reason `ShellStore`'s tree is: §23's hierarchy is a rendering concern.
 */
export interface WorkTreeNode {
  project: Project;
  children: WorkTreeNode[];
}

/**
 * §23's project context: the project the route names, the **root** it belongs to, the way back
 * through its parents, the root's pages, and the work hierarchy beneath the root — plus §26's
 * writes to the project record itself, because the header that makes them is rendered once per
 * project by `ProjectWorkspaceShell`.
 *
 * It is deliberately not in `ShellStore` (§20). That store is provided by `AppShell` and
 * therefore alive on every route; teaching it to list a root's pages and walk ancestors would
 * make `/app`, `/calendar` and `/settings` pay for one route's state. This one is provided by
 * the routed shell and dies with it.
 *
 * The **canvas** is not here. `ProjectPageStore` owns the sections of one page, and the two
 * halves talk through callback inputs rather than through a shared store.
 */
@Injectable()
export class ProjectWorkspaceStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);
  /** The header's history hears about every page toggle and project write (Slice 41). */
  private readonly reporter = inject(OPERATION_HISTORY_REPORTER);

  private requestedProjectId: ProjectId | undefined;
  private loadGeneration = 0;
  /** Writes to the project record in flight; see `writeProject`. */
  private projectWrites = 0;
  private projectRefreshQueued = false;
  private contextRefresh: Promise<void> | null = null;
  /** Invalidates a page enable/reconciliation when the route changes or a newer toggle wins. */
  private contextWriteEpoch = 0;
  private destroyed = false;

  private readonly projectState = signal<Project | null>(null);
  private readonly ancestorsState = signal<Project[]>([]);
  private readonly pagesState = signal<ProjectPage[]>([]);
  private readonly ownPagesState = signal<ProjectPage[]>([]);
  private readonly descendantsState = signal<Project[]>([]);
  private readonly progressState = signal<ProgressResult | null>(null);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);
  private readonly writeErrorState = signal<string | null>(null);
  private readonly pageWritePendingState = signal(false);
  private readonly pageWriteErrorState = signal<string | null>(null);
  private readonly pageWriteRetryKindState = signal<ConfigurablePageKind | null>(null);
  private readonly pageWriteRetryEnabledState = signal<boolean | null>(null);
  private readonly projectWritesState = signal(0);

  readonly project = this.projectState.asReadonly();
  /** Root first, immediate parent last, and the project itself never in it. */
  readonly breadcrumbs = this.ancestorsState.asReadonly();
  /** The **root's** pages: the column's list. */
  readonly pages = this.pagesState.asReadonly();
  /** The routed project's own pages, which on a sub-project is its sole `work` canvas. */
  readonly ownPages = this.ownPagesState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly writeError = this.writeErrorState.asReadonly();
  readonly pageWritePending = this.pageWritePendingState.asReadonly();
  readonly pageWriteError = this.pageWriteErrorState.asReadonly();
  readonly pageWriteRetryKind = this.pageWriteRetryKindState.asReadonly();
  readonly progressResult = this.progressState.asReadonly();

  readonly root = computed<Project | null>(() => this.ancestorsState()[0] ?? this.projectState());
  readonly progress = computed<number | null>(() => this.progressState()?.percentage ?? null);
  readonly projectWritePending = computed(() => this.projectWritesState() > 0);

  readonly subprojectTree = computed<WorkTreeNode[]>(() => {
    const rootId = this.root()?.id;
    return rootId === undefined ? [] : toWorkTree(rootId, this.descendantsState());
  });

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe(
      (event) => this.onLiveEvent(event),
      () => this.onLiveConnected(),
    );
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.loadGeneration += 1;
      this.contextWriteEpoch += 1;
      this.requestedProjectId = undefined;
      unsubscribe();
    });
  }

  /**
   * §62, with three rules that are easy to conflate and are not the same one.
   *
   * Progress moves on **any** frame naming this project, a completed task included — narrowing
   * it to `project.*` would stop an agent's work from moving the header percentage. The project
   * **record** re-reads only when a `project.*` frame names this project, so a sibling
   * sub-project's writes do not put a request behind every frame they produce. The **tree**
   * follows `rootProjectId`, because a unit of work created three levels down belongs in this
   * column and its `projectId` is not this project — and also any project-record frame in the
   * workspace, because a sub-project reparented out of this root (or its Undo/Redo) is announced
   * under its new root only (Slice 39, `isProjectRecordEvent`).
   */
  private onLiveEvent(event: LiveEvent): void {
    const projectId = this.requestedProjectId;
    if (event.type === 'prototype.reloaded') {
      if (projectId !== undefined) void this.load(projectId);
      return;
    }
    if (projectId === undefined) return;

    const aboutThisProject =
      event.projectId === projectId ||
      (event.type.startsWith('project.') && event.entityId === projectId);
    if (aboutThisProject) void this.refreshProgress();

    if (!event.type.startsWith('project.')) return;
    if (aboutThisProject || event.rootProjectId === this.root()?.id || isProjectRecordEvent(event)) this.refreshContext();
  }

  private onLiveConnected(): void {
    if (this.requestedProjectId === undefined) return;
    this.refreshContext();
    void this.refreshProgress();
  }

  /**
   * The project record, the ancestry, the pages and the work hierarchy, re-read quietly after
   * someone else changed one of them. Quiet on failure: the context on screen is a better
   * answer than an error the user did not cause.
   */
  private refreshContext(): void {
    if (this.projectWrites > 0 || this.pageWritePendingState()) {
      this.projectRefreshQueued = true;
      return;
    }
    // Coalesced, like the canvas store's. A context read is four or five sequential round trips,
    // so a burst of frames — an agent creating three sub-projects — would otherwise start three
    // overlapping reads whose guards are identical, and whichever *finished* last would win.
    // That is how a stale name and a stale tree get painted over fresh ones.
    if (this.contextRefresh !== null) {
      this.projectRefreshQueued = true;
      return;
    }
    const projectId = this.requestedProjectId;
    if (projectId === undefined) return;
    const generation = this.loadGeneration;
    const epoch = this.contextWriteEpoch;

    const refresh = this.track(async () => {
      do {
        this.projectRefreshQueued = false;
        try {
          const context = await this.readContext(projectId);
          if (
            !this.destroyed &&
            epoch === this.contextWriteEpoch &&
            generation === this.loadGeneration &&
            this.requestedProjectId === projectId
          ) {
            this.applyContext(context);
            this.errorState.set(null);
          }
        } catch {
          // Quiet — see above.
        }
      } while (
        this.projectRefreshQueued &&
        this.projectWrites === 0 &&
        generation === this.loadGeneration &&
        epoch === this.contextWriteEpoch &&
        !this.destroyed
      );
    }).finally(() => {
      if (this.contextRefresh === refresh) this.contextRefresh = null;
      if (
        this.contextRefresh === null &&
        this.projectRefreshQueued &&
        this.projectWrites === 0 &&
        !this.pageWritePendingState() &&
        !this.destroyed
      ) {
        this.projectRefreshQueued = false;
        this.refreshContext();
      }
    });
    this.contextRefresh = refresh;
  }

  /**
   * §23's context for one project. Sequential where it has to be: a project the caller cannot
   * see must fail as "not found" rather than racing reads that would report it less clearly.
   */
  load(projectId: ProjectId): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    const generation = ++this.loadGeneration;
    this.contextWriteEpoch += 1;
    const current = () => generation === this.loadGeneration;
    this.requestedProjectId = projectId;
    this.projectRefreshQueued = false;

    return this.track(async () => {
      this.loadingState.set(true);
      this.errorState.set(null);
      // A failed write belongs to the project it was made on; one component instance serves
      // every project, so without this a failed rename follows the user to the next one.
      this.writeErrorState.set(null);
      this.pageWriteErrorState.set(null);
      this.pageWriteRetryKindState.set(null);
      this.pageWriteRetryEnabledState.set(null);
      this.progressState.set(null);
      try {
        const context = await this.readContext(projectId);
        if (!current()) return;
        this.applyContext(context);
      } catch (error) {
        if (!current()) return;
        this.projectState.set(null);
        this.ancestorsState.set([]);
        this.pagesState.set([]);
        this.ownPagesState.set([]);
        this.descendantsState.set([]);
        this.errorState.set(messageOf(error));
      } finally {
        if (current()) {
          // Only when there is a project to measure: a second guaranteed-failing request adds
          // nothing to a page that is already saying it cannot read the project.
          if (this.projectState() !== null) await this.readProgress(projectId, generation);
          if (current()) this.loadingState.set(false);
        }
      }
    });
  }

  private async readContext(projectId: ProjectId): Promise<LoadedContext> {
    const project = await this.gateway.projects.get(projectId);
    // Walked one record at a time rather than taken from the list below: §31 keeps an archived
    // project's own page rendering, and the navigation list deliberately excludes archived
    // projects — so an ancestor chain read from it would break exactly where it matters.
    const ancestors = await this.readAncestors(project);
    const rootProject = ancestors[0] ?? project;
    const projects = await this.gateway.projects.list({ status: NAVIGABLE_STATUSES });
    const pages = await this.gateway.pages.list(rootProject.id);
    const ownPages =
      rootProject.id === project.id ? pages : await this.gateway.pages.list(project.id);
    return { project, ancestors, pages, ownPages, projects };
  }

  private applyContext(context: LoadedContext): void {
    this.projectState.set(context.project);
    this.ancestorsState.set(context.ancestors);
    this.pagesState.set(context.pages);
    this.ownPagesState.set(context.ownPages);
    this.descendantsState.set(context.projects);
  }

  /**
   * §26's page manager. The confirmed page record is deliberately not painted optimistically:
   * a tab is navigation, so changing it before the write and fresh context agree would make the
   * browser offer a route the store cannot yet resolve. Home and work are structural records and
   * are refused here as a defensive second boundary behind the presentational control.
   */
  setPageEnabled(kind: ProjectPageKind, enabled: boolean): Promise<boolean> {
    if (kind === 'home' || kind === 'work') return Promise.resolve(false);
    return this.writePage(kind, enabled, 'page');
  }

  /** §31–32: Archive remains reachable from project controls when its optional tab is disabled. */
  openArchive(): Promise<boolean> {
    return this.writePage('archive', true, 'archive');
  }

  /** Read-only retry after a committed optional-page write could not reconcile its context. */
  retryPageContext(): Promise<boolean> {
    const kind = this.pageWriteRetryKindState();
    const enabled = this.pageWriteRetryEnabledState();
    return kind === null || enabled === null
      ? Promise.resolve(false)
      : this.reconcilePageContext(kind, enabled, 'page');
  }

  /** Read-only retry after an Archive page enable committed but context reconciliation failed. */
  retryArchiveContext(): Promise<boolean> {
    return this.reconcilePageContext('archive', true, 'archive');
  }

  private writePage(
    kind: ConfigurablePageKind,
    enabled: boolean,
    surface: 'page' | 'archive',
  ): Promise<boolean> {
    return this.track(async () => {
      const root = this.root();
      const routedProjectId = this.requestedProjectId;
      const routedProject = this.projectState();
      if (
        this.destroyed ||
        root === null ||
        routedProject === null ||
        routedProject.id !== routedProjectId ||
        routedProjectId === undefined ||
        this.pageWritePendingState()
      ) return false;
      if (surface === 'archive' && this.pagesState().some((page) => page.kind === 'archive' && page.enabled)) return true;

      const generation = this.loadGeneration;
      const epoch = ++this.contextWriteEpoch;
      this.pageWritePendingState.set(true);
      this.clearPageFeedback(surface);
      try {
        try {
          // The page's own project — the root — names the history, never the routed sub-project.
          await reportedWrite(this.reporter, () => this.gateway.pages.setEnabled(root.id, { kind, enabled }),
            (written) => ({ projectId: written.page.projectId, projectName: root.name, receipt: written.operation }));
        } catch (error) {
          if (this.pageOperationCurrent(generation, epoch, routedProjectId)) {
            this.setPageOperationError(surface, messageOf(error));
          }
          return false;
        }

        if (!this.pageOperationCurrent(generation, epoch, routedProjectId)) return false;
        try {
          const context = await this.readContext(routedProjectId);
          if (!this.pageOperationCurrent(generation, epoch, routedProjectId)) return false;
          this.applyContext(context);
          this.clearPageFeedback(surface);
          return true;
        } catch (error) {
          if (this.pageOperationCurrent(generation, epoch, routedProjectId)) {
            this.setPageOperationError(surface, this.pageRefreshError(kind, enabled, error), kind, enabled);
          }
          return false;
        }
      } finally {
        this.pageWritePendingState.set(false);
        this.resumeQueuedContextRefresh();
      }
    });
  }

  private reconcilePageContext(
    kind: ConfigurablePageKind,
    enabled: boolean,
    surface: 'page' | 'archive',
  ): Promise<boolean> {
    return this.track(async () => {
      const routedProjectId = this.requestedProjectId;
      const routedProject = this.projectState();
      if (
        this.destroyed ||
        routedProject === null ||
        routedProject.id !== routedProjectId ||
        routedProjectId === undefined ||
        this.pageWritePendingState()
      ) return false;
      const generation = this.loadGeneration;
      const epoch = ++this.contextWriteEpoch;
      this.pageWritePendingState.set(true);
      try {
        const context = await this.readContext(routedProjectId);
        if (!this.pageOperationCurrent(generation, epoch, routedProjectId)) return false;
        this.applyContext(context);
        this.clearPageFeedback(surface);
        return true;
      } catch (error) {
        if (this.pageOperationCurrent(generation, epoch, routedProjectId)) {
          this.setPageOperationError(surface, this.pageRefreshError(kind, enabled, error), kind, enabled);
        }
        return false;
      } finally {
        this.pageWritePendingState.set(false);
        this.resumeQueuedContextRefresh();
      }
    });
  }

  private pageOperationCurrent(generation: number, epoch: number, projectId: ProjectId): boolean {
    return !this.destroyed && generation === this.loadGeneration && epoch === this.contextWriteEpoch && this.requestedProjectId === projectId;
  }

  private clearPageFeedback(surface: 'page' | 'archive'): void {
    if (surface === 'page') {
      this.pageWriteErrorState.set(null);
      this.pageWriteRetryKindState.set(null);
      this.pageWriteRetryEnabledState.set(null);
    } else {
      this.writeErrorState.set(null);
    }
  }

  private setPageOperationError(
    surface: 'page' | 'archive',
    message: string,
    retryKind?: ConfigurablePageKind,
    retryEnabled?: boolean,
  ): void {
    if (surface === 'page') {
      this.pageWriteErrorState.set(message);
      this.pageWriteRetryKindState.set(retryKind ?? null);
      this.pageWriteRetryEnabledState.set(retryEnabled ?? null);
    } else {
      this.writeErrorState.set(message);
    }
  }

  private pageRefreshError(kind: ConfigurablePageKind, enabled: boolean, error: unknown): string {
    return `${kind.charAt(0).toUpperCase() + kind.slice(1)} was ${enabled ? 'enabled' : 'disabled'}, but navigation could not refresh: ${messageOf(error)}`;
  }

  private resumeQueuedContextRefresh(): void {
    if (!this.destroyed && this.projectWrites === 0 && this.projectRefreshQueued) {
      this.projectRefreshQueued = false;
      this.refreshContext();
    }
  }

  /** Root first. A visited set stops a hand-edited parent cycle from walking forever. */
  private async readAncestors(project: Project): Promise<Project[]> {
    const chain: Project[] = [];
    const seen = new Set<ProjectId>([project.id]);
    let current = project;
    while (!isRootProject(current)) {
      const parentId = current.parentProjectId;
      if (seen.has(parentId)) break;
      seen.add(parentId);
      current = await this.gateway.projects.get(parentId);
      chain.unshift(current);
    }
    return chain;
  }

  /**
   * A Sub-Projects section created a unit of work. §62's own frame will say so too, but the
   * canvas that made the write knows first, and waiting for the round trip would leave the
   * column a step behind the section beside it.
   */
  notifyHierarchyChanged(): void {
    this.refreshContext();
  }

  refreshProgress(): Promise<void> {
    const projectId = this.requestedProjectId;
    if (projectId === undefined) return Promise.resolve();
    return this.track(() => this.readProgress(projectId, this.loadGeneration));
  }

  private async readProgress(projectId: ProjectId, generation: number): Promise<void> {
    try {
      const result = await this.gateway.progress.get(projectId);
      if (!this.destroyed && generation === this.loadGeneration && this.requestedProjectId === projectId) {
        this.progressState.set(result);
      }
    } catch {
      // A missing percentage renders "Not available"; a failed re-read keeps the last one.
    }
  }

  /** §26's Rename, optimistic per §63. */
  rename(name: string): Promise<boolean> {
    return this.writeProject({ name }, (project) => ({ ...project, name }));
  }

  /** §26 gives a work unit a description; `UpdateProjectInput` carries it on both kinds. */
  setDescription(description: string | null): Promise<boolean> {
    return this.writeProject({ description }, (project) => {
      const next = { ...project };
      if (description === null || description === '') delete next.description;
      else next.description = description;
      return next;
    });
  }

  /**
   * §26's Status. `archived` is deliberately not settable here: `ProjectService.update` runs
   * the whole archive path on any transition into it, so a status list built from the enum
   * would archive a project with no confirmation. `archive()` below is the deliberate door.
   */
  setStatus(status: Exclude<ProjectStatus, 'archived'>): Promise<boolean> {
    return this.writeProject({ status }, (project) => ({ ...project, status }));
  }

  /** §26's Target date on a root, Due date on a work unit. `null` clears it. */
  setTargetDate(targetDate: string | null): Promise<boolean> {
    return this.writeProject({ targetDate }, (project) => {
      const next = { ...project };
      if (targetDate === null) delete next.targetDate;
      else next.targetDate = targetDate;
      return next;
    });
  }

  /**
   * §81's archive. `PATCH` with `status: 'archived'` *is* the domain's archive path, so there
   * is no gateway method to add. Awaited rather than optimistic, because the shell words its
   * outcome — the page stays on the archived project, whose header offers its Undo (Slice 41) —
   * and it answers that outcome instead of deciding anything, because §19's stores decide and
   * pages navigate. On success the returned record is applied, so the header reads `archived`
   * without waiting for a frame.
   */
  archive(): Promise<boolean> {
    return this.writeProject({ status: 'archived' }, null);
  }

  /**
   * One project write, optimistic unless `paint` is `null` (archive alone, which is awaited). The
   * server's record is applied on success either way, and the write is reported to the header's
   * history with the updated project's own id and name.
   */
  private writeProject(
    input: UpdateProjectInput,
    paint: ((project: Project) => Project) | null,
  ): Promise<boolean> {
    const before = this.projectState();
    if (before === null) return Promise.resolve(false);
    const projectId = before.id;
    const generation = this.loadGeneration;
    const current = () =>
      generation === this.loadGeneration && this.projectState()?.id === projectId;

    this.writeErrorState.set(null);
    // Raised **before** the paint, and lowered only once the write succeeded or rolled back: a
    // consumer must never read an optimistic `active` as a persisted reactivation. The canvas's
    // Restore controls read exactly this through the outlet.
    this.projectWritesState.update((count) => count + 1);
    if (paint !== null) this.projectState.set(paint(before));

    return this.track(() =>
      this.whileWriting(async () => {
        try {
          const { project: updated } = await reportedWrite(this.reporter, () => this.gateway.projects.update(projectId, input),
            ({ project, operation }) => ({ projectId: project.id, projectName: project.name, receipt: operation }));
          // The server's record, not the paint: the host may have normalised something.
          if (current()) this.projectState.set(updated);
          return true;
        } catch (error) {
          if (current()) {
            if (paint !== null) this.projectState.set(before);
            this.writeErrorState.set(messageOf(error));
          }
          return false;
        } finally {
          this.projectWritesState.update((count) => count - 1);
        }
      }),
    );
  }

  /**
   * Holds off §62's re-read for the length of an optimistic write. The host flushes its frame
   * at commit, which is before the tab's own response lands, so a re-read in that window
   * replaces the optimistic paint with the pre-write value for a frame.
   */
  private whileWriting<T>(operation: () => Promise<T>): Promise<T> {
    this.projectWrites += 1;
    return operation().finally(() => {
      this.projectWrites -= 1;
      if (this.projectWrites === 0 && this.projectRefreshQueued) {
        this.projectRefreshQueued = false;
        this.refreshContext();
      }
    });
  }

  /**
   * Registered with `PendingTasks` so `ApplicationRef.isStable` — and therefore
   * `fixture.whenStable()` — knows the shell is mid-load. Without it a zoneless app considers
   * itself stable while these promises are in flight.
   */
  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    return operation().finally(settled);
  }
}

interface LoadedContext {
  project: Project;
  ancestors: Project[];
  pages: ProjectPage[];
  ownPages: ProjectPage[];
  projects: Project[];
}

/**
 * The work under one root, as §23's hierarchy. Only descendants of `rootId` — the list is the
 * whole workspace, and the column is one root's.
 */
const toWorkTree = (rootId: ProjectId, projects: Project[]): WorkTreeNode[] => {
  const childrenOf = new Map<ProjectId, Project[]>();
  for (const project of projects) {
    const parentId = project.parentProjectId;
    if (parentId === undefined) continue;
    childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), project]);
  }

  const seen = new Set<ProjectId>([rootId]);
  const build = (parentId: ProjectId): WorkTreeNode[] =>
    (childrenOf.get(parentId) ?? [])
      .filter((project) => !seen.has(project.id) && seen.add(project.id))
      .map((project) => ({ project, children: build(project.id) }));
  return build(rootId);
};
