import { NgComponentOutlet } from '@angular/common';
import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injectable,
  Injector,
  afterEveryRender,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { ProjectPageKindSchema, canonicalPageKindFor, type Project, type ProjectId, type ProjectPageKind, type ProjectRestoreStatus, type UpdateProjectInput } from '@cwm/contracts';
import { TaskDrawerCoordinator } from '../tasks/task-drawer-coordinator';
import { LiftStack } from '../../shared/lifts/lift-stack';
import { LiftFocus } from '../../shared/lifts/lift-focus';
import { OPERATION_HISTORY_REPORTER, type OperationWriteReport } from '../../core/history/operation-history-reporter';
import { NavigationContext, type PlaceProject, type ProjectPlace, type ProjectPlaceRequest } from '../../core/shell/navigation-context';
import { RECEIPT_UNDO, type ReceiptUndoResult } from '../../core/history/receipt-undo';
import { SHELL_COMMANDS } from '../../core/shell/shell-commands';
import { ReceiptToast } from '../../core/history/receipt-toast';
import { FailureMessage } from '../../shared/feedback/failure-message';
import { UnavailablePage } from '../../shared/components/unavailable-page/unavailable-page';
import type { Failure } from '../../shared/feedback/failure';
import { Toast } from '../../shared/feedback/toast';
import { archivedHereFeedback, createdSubjectOf, createdUnderFeedback } from './history/history-feedback';
import { ProjectHistoryControls } from './history/project-history-controls';
import { ProjectHistoryStore } from './history/project-history-store';
import { ArchivedBanner } from './archived-banner';
import { ProjectHeader } from './project-header';
import type { ProjectPageRendererInputs } from './project-page-contract';
import {
  isOptionalProjectPageKind,
  navigablePages,
  pageDefinitionFor,
  resolveProjectPage,
  type OptionalProjectPageKind,
  type ProjectPageResolution,
} from './project-page-registry';
import { ProjectWorkspaceStore, type WorkTreeNode } from './project-workspace-store';
import { WORKSPACE_TREE } from './workspace-tree';
import { WorkCreateDialog, type WorkCreateParent } from './work-create-dialog';
import { PageSettingsPopover } from './page-settings-popover';
import type { SettableProjectStatus } from './project-more-menu';

/** How a fallback's reason travels a redirect. See `noticeFromNavigation`. */
interface PageNoticeState {
  pageNotice?: string;
  pageEnableKind?: OptionalProjectPageKind;
}

const placeProject = ({ id, name, status }: Project): PlaceProject => ({ id, name, status });

/**
 * Open archive's landing, until the Archive heading can take focus. Root-scoped rather than a
 * shell field: `/projects/:projectId` and `/projects/:projectId/pages/:pageKind` are two route
 * configs, so moving between them makes the router re-create the shell, and a field would be
 * lost with the heading it meant to focus.
 */
@Injectable({ providedIn: 'root' })
export class ArchiveFocusRequest {
  /** The Archive URL, as `Router.url` will read once the navigation lands. */
  readonly archiveUrl = signal<string | null>(null);

  constructor() {
    // A navigation that lands anywhere else ends the request, including on a route with no
    // project shell to drop it — otherwise a later visit to the same URL would take focus.
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationEnd && this.archiveUrl() !== null && event.urlAfterRedirects !== this.archiveUrl()) {
          this.archiveUrl.set(null);
        }
      });
  }
}

/** A workstream this shell created and opened (Slice 81, Q13 (b)). */
interface CreatedWorkstream { readonly report: OperationWriteReport; readonly parentId: ProjectId }

/**
 * §23's project workspace, and §68's two project routes: `/projects/:projectId` and
 * `/projects/:projectId/pages/:pageKind` both resolve here.
 *
 * One component for both, because they are one surface: Angular re-uses the instance across a
 * param change, so moving between a root's pages keeps the context — the project, its pages
 * and its work hierarchy — loaded once.
 *
 * The layout is one track: the header, the fallback notice and the routed renderer stack in it.
 * Navigation is the global tree (Slice 81), which reads this route's place from
 * `NavigationContext`. §26's "Project Header / Project Navigation / Controls / Section Canvas" is read as
 * the page's parts rather than as a strict vertical stack — what matters, and what this
 * placement gives, is that the header is rendered **once per project** rather than once per
 * page.
 */
@Component({
  selector: 'app-project-workspace-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, FailureMessage, UnavailablePage, ProjectHeader, ProjectHistoryControls, Toast, WorkCreateDialog, PageSettingsPopover, RouterLink, ArchivedBanner],
  // `providers`, not `viewProviders`: the page renderers are mounted through `NgComponentOutlet`,
  // and every writer store inside them must resolve the header's history as its reporter
  // (Slice 41). The inert root default would otherwise hide a wiring mistake.
  providers: [
    ProjectWorkspaceStore,
    ProjectHistoryStore,
    TaskDrawerCoordinator,
    { provide: OPERATION_HISTORY_REPORTER, useExisting: ProjectHistoryStore },
    { provide: RECEIPT_UNDO, useExisting: ProjectHistoryStore },
    { provide: WORKSPACE_TREE, useExisting: ProjectWorkspaceStore },
  ],
  templateUrl: './project-workspace-shell.html',
  styleUrl: './project-workspace-shell.scss',
  // The shell owns the workspace region's gutters, so `AppShell` gives it the full bleed. Keyed
  // on this attribute rather than on the component's selector, so a rename cannot silently stop
  // matching.
  host: { 'data-flush-workspace': '' },
})
export class ProjectWorkspaceShell {
  readonly toast = new ReceiptToast();
  /** Bound from the route by `withComponentInputBinding()` (§68). */
  readonly projectId = input.required<ProjectId>();
  /** Absent on `/projects/:projectId`, which means "this project's canonical page". */
  readonly pageKind = input<string | undefined>(undefined);

  readonly store = inject(ProjectWorkspaceStore);
  /** §26's Undo/Redo: the displayed project's history (Slice 41). */
  readonly history = inject(ProjectHistoryStore);
  readonly drawerCoordinator = inject(TaskDrawerCoordinator);
  private readonly lifts = inject(LiftStack);
  private releaseWorkLift: (() => void) | null = null;
  readonly saveDetails = (patch: Pick<UpdateProjectInput, 'name' | 'description' | 'targetDate'>): Promise<boolean> => this.store.saveDetails(patch);
  readonly clearWriteError = (): void => this.store.clearWriteError();
  readonly archiveProject = (workstreamIds: ProjectId[]): Promise<boolean> => this.confirmArchive(workstreamIds);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly archiveFocus = inject(ArchiveFocusRequest);
  private focusedHistoryUrl: string | null = null;

  private readonly noticeState = signal<string | null>(null);
  private readonly noticeEnableKindState = signal<OptionalProjectPageKind | null>(null);
  /** The page the current notice was read for; see the resolve effect. */
  private noticedFor: string | null = null;
  private readonly archiveNavigationPendingState = signal(false);
  /** A single reconciliation key prevents a held summary from reloading forever. */
  private creationReconciliationKey: string | null = null;
  readonly workCreateOpen = signal(false);
  /** Where a chosen close of the dialog returns focus: the request's menu button, or Menu. */
  private workCreateReturn: HTMLElement | null = null;
  /** The open page settings' request (Slice 81, R2); `null` while closed. */
  readonly pageSettingsRequest = signal<ProjectPlaceRequest | null>(null);
  private workCreateRootId: ProjectId | null = null;
  readonly workCreateBlocked = computed(() => {
    const root = this.store.root();
    return root?.status === 'archived' ? `unavailable while ${root.name} is archived` : null;
  });
  readonly workCreateParents = computed<WorkCreateParent[]>(() => {
    const root = this.store.root();
    if (root === null) return [];
    const result: WorkCreateParent[] = [{ id: root.id, name: root.name, depth: 0, completed: root.status === 'completed' }];
    const visit = (nodes: WorkTreeNode[], depth: number): void => {
      for (const node of nodes) {
        result.push({ id: node.project.id, name: node.project.name, depth, completed: node.project.status === 'completed' });
        visit(node.children, depth + 1);
      }
    };
    visit(this.store.subprojectTree(), 1);
    return result;
  });
  private readonly shellCommands = inject(SHELL_COMMANDS, { optional: true });
  /** A navigation this shell started, landing on the project's heading and toast (Slice 81, Q13 (b)). */
  private landing: { projectId: ProjectId; feedback: ReceiptUndoResult; created?: CreatedWorkstream } | null = null;
  /** The shown toast's new workstream, whose committed Undo returns to its parent. */
  private created: CreatedWorkstream | null = null;

  /**
   * A new workstream opens (W1-014, W2-007): the dialog closes, the tree re-reads so the row exists,
   * then the route moves to it; its heading takes focus and its toast follows. A refusal stays in
   * the dialog. A create that lands after the person left this project moves nothing.
   */
  readonly createWorkstream = async (parentId: ProjectId, name: string): Promise<Failure | null> => {
    const from = this.projectId();
    const parentName = this.workCreateParents().find(({ id }) => id === parentId)?.name ?? '';
    const report = await this.store.createWorkstream(parentId, name);
    if ('sentence' in report) return report;
    this.workCreateReturn = null;
    this.closeWorkCreate();
    await this.shellCommands?.refreshProjects().catch(() => undefined);
    if (this.projectId() === from) this.land(report.projectId, createdUnderFeedback(report.projectName!, parentName), { report, parentId });
    return null;
  };

  /** The create toast's Undo: a commit returns to the parent, a push so Back reaches “Creation undone”. */
  async undoToast(): Promise<void> {
    const created = this.toast.report() === this.created?.report ? this.created : null;
    const result = await this.toast.undo();
    if (created !== null && result?.committed && this.projectId() === created.report.projectId) {
      this.land(created.parentId, { ...result, link: { projectId: created.report.projectId, label: `Open ${created.report.projectName} to redo` } });
    }
  }

  private land(projectId: ProjectId, feedback: ReceiptUndoResult, created?: CreatedWorkstream): void {
    this.landing = { projectId, feedback, created };
    void this.router.navigate(['/projects', projectId]).then((moved) => { if (!moved) this.landing = null; });
  }

  /** After the landing project has rendered: its history's generation has started, so the toast stays. */
  private focusLanding(): void {
    const landing = this.landing;
    const heading = this.host.nativeElement.querySelector<HTMLElement>('h1[data-project-name]');
    if (landing === null || heading === null || this.store.loading() || this.store.project()?.id !== landing.projectId) return;
    this.landing = null;
    heading.focus();
    this.created = landing.created ?? null;
    this.toast.show(landing.feedback, landing.created?.report, () => this.host.nativeElement.querySelector<HTMLElement>('h1[data-project-name]'));
  }

  readonly notice = this.noticeState.asReadonly();
  readonly noticeEnableKind = this.noticeEnableKindState.asReadonly();
  readonly archiveNavigationPending = this.archiveNavigationPendingState.asReadonly();
  /** Only the creating actor's held project.add Redo can recover a missing route. */
  readonly creationRecovery = computed(() => {
    const summary = this.history.summary();
    const redo = this.history.creationRedo();
    return this.store.missing() && summary?.projectId === this.projectId() ? redo : null;
  });
  /** The removed project's quoted name, read from its creation label. */
  readonly creationSubject = createdSubjectOf;

  /**
   * §68's rule, run over what the store loaded. `null` until there is a project to decide
   * about, which is what keeps the outlet unmounted while the context is still in flight.
   */
  readonly resolution = computed<ProjectPageResolution | null>(() => {
    const project = this.store.project();
    // Not just "is anything loaded" — is the loaded thing *this* project. Angular re-uses this
    // component across a parameter change, and a load leaves the previous record in place while
    // `projects.get` is in flight. Both halves of the route can change at once (one root's page
    // to another root's), and resolving the new kind against the old project would refuse a page
    // that exists and redirect the user back to the workspace they had just left.
    if (project === null || project.id !== this.projectId()) return null;
    return resolveProjectPage({
      project,
      ownPages: this.store.ownPages(),
      requestedKind: this.pageKind() ?? null,
    });
  });

  readonly rendered = computed(() => {
    const resolution = this.resolution();
    return resolution?.outcome === 'render' ? resolution : null;
  });

  readonly unavailable = computed(() => {
    const resolution = this.resolution();
    return resolution?.outcome === 'unavailable' ? resolution.reason : null;
  });

  readonly pages = this.store.pages;

  /** `null` on a sub-project: its work canvas is not one of the root's tabs (§26). */
  readonly activeKind = computed<ProjectPageKind | null>(() => {
    const rendered = this.rendered();
    return rendered === null || rendered.kind === 'work' ? null : rendered.kind;
  });

  /**
   * Class-property arrows, so their identity never changes. `NgComponentOutlet` applies its
   * inputs from `ngDoCheck` and calls `setInput` for each key on every change-detection pass;
   * only `setInput`'s `Object.is` check stops that from marking the renderer dirty every
   * cycle, and an inline arrow in the template would defeat it.
   */
  private readonly onProjectDataChange = (): void => void this.store.refreshProgress();
  private readonly onProjectHierarchyChange = (): void => this.store.notifyHierarchyChanged();
  private readonly onOpenArchive = (returnTo: HTMLElement): void => void this.openArchive(returnTo);

  readonly rendererInputs = computed<ProjectPageRendererInputs | null>(() => {
    const rendered = this.rendered();
    const project = this.store.project();
    if (rendered === null || project === null) return null;
    return {
      projectId: project.id,
      pageId: rendered.pageId,
      projectLayoutMode: project.projectLayoutMode,
      // Restoring into an archived project is a domain refusal, and this page stays reachable
      // by direct URL for one — so the control is disabled with guidance rather than offered
      // and guaranteed to fail. The pending half matters as much as the status: `setStatus`
      // paints optimistically, so the loaded status alone would enable Restore during a
      // reactivation that has not landed.
      restoreBlocked: project.status === 'archived' || this.store.projectWritePending(),
      readOnly: this.store.readOnly(),
      // The canonical page — Home for a root, the Work canvas for a workstream (Slice 65).
      shortcutsAllowed: rendered.kind === canonicalPageKindFor(project.kind),
      // `root()` falls back to the project itself, so this is never null once a project is.
      rootProjectId: this.store.root()?.id ?? project.id,
      onProjectDataChange: this.onProjectDataChange,
      onProjectHierarchyChange: this.onProjectHierarchyChange,
      onOpenArchive: this.onOpenArchive,
    };
  });

  /**
   * This route's place, for the navigation tree (Slice 81, R2): plain view data published to
   * `NavigationContext`. Ready once the loaded project is the routed one (a same-project re-read
   * keeps it ready); loading until then; missing after a failed or not-found load.
   */
  readonly place = computed<ProjectPlace>(() => {
    const projectId = this.projectId();
    const project = this.store.project();
    const root = this.store.root();
    if (project !== null && project.id === projectId && root !== null) {
      const activeKind = this.activeKind();
      return {
        projectId,
        status: 'ready',
        root: placeProject(root),
        ancestors: this.store.breadcrumbs().map(placeProject),
        current: placeProject(project),
        // Q5 (d): the root's own row opens its first page, so the tree lists the others.
        pages: navigablePages(this.store.pages(), activeKind)
          .filter(({ kind }) => kind !== canonicalPageKindFor(root.kind))
          .map(({ kind, label }) => ({ kind, label })),
        currentKind: activeKind,
        addBlockedReason: this.workCreateBlocked(),
      };
    }
    // Missing only once the load has said so. This computed reads a new `projectId` before the
    // load effect has set `loading`, with the previous project still loaded: that is loading too.
    const loading = !this.store.missing() && this.store.error() === null;
    const requested = ProjectPageKindSchema.safeParse(this.pageKind());
    return {
      projectId,
      status: loading ? 'loading' : 'missing',
      root: null,
      ancestors: [],
      current: null,
      pages: [],
      currentKind: loading && requested.success ? requested.data : null,
      addBlockedReason: null,
    };
  });

  /** The banner's restore cannot start while another project write runs (its own pending shows instead). */
  readonly bannerRestoreDisabled = computed(() => this.store.projectWritePending() && !this.store.restorePending());

  constructor() {
    // Slice 81 (R2): the tree follows this route's place. Never cleared here: a re-created shell
    // replaces it, and `NavigationContext` clears it when a navigation leaves `/projects/`.
    const navigation = inject(NavigationContext);
    effect(() => {
      const place = this.place();
      untracked(() => navigation.publish(place));
    });
    // The tree's pencil and More reach this route through handlers: nothing replays into a
    // re-created shell, and the disposer removes only this shell's own (R2).
    inject(DestroyRef).onDestroy(navigation.register({
      openPageSettings: (request) => this.openPageSettings(request),
      openAddWorkstream: (request) => this.openWorkCreate(request),
    }));
    // Slice 79: the drawer is a write surface, so a project going read-only closes it (Q5 (a)).
    effect(() => {
      if (this.store.readOnly()) untracked(() => this.drawerCoordinator.close());
    });
    effect(() => {
      const feedback = this.history.feedback();
      untracked(() => {
        if (feedback !== null) this.toast.show(feedback, feedback.report, () => this.host.nativeElement.querySelector<HTMLElement>('[data-project-name], #project-creation-recovery-heading'));
      });
    });
    inject(DestroyRef).onDestroy(() => this.releaseWorkLift?.());
    effect(() => {
      const loading = this.store.loading();
      const rootId = this.store.root()?.id ?? null;
      if (loading || rootId !== this.workCreateRootId) {
        this.workCreateOpen.set(false);
        this.pageSettingsRequest.set(null);
      }
      this.workCreateRootId = rootId;
    });
    // A direct load resolves asynchronously and a fragment-only navigation can reuse the shell.
    // Inspect the current URL after each render until its matching header exists, then focus once.
    afterEveryRender(() => { this.focusHistoryFragment(); this.focusArchiveLanding(); this.focusLanding(); }, { injector: this.injector });

    // Re-loads when the route changes projects, which sidebar navigation does without
    // re-creating this component. Moving between two pages of the same project changes only
    // `pageKind`, and must not re-read the context.
    effect(() => {
      const projectId = this.projectId();
      untracked(() => {
        if (this.landing?.projectId !== projectId) this.landing = null;
        void this.store.load(projectId);
        this.history.load(projectId);
      });
    });

    // A transition result includes the refreshed summary even if its live frame was dropped.
    // Re-read only the project context, keyed by the held history revision; history.load here
    // would discard the very summary that tells us which direction just landed.
    effect(() => {
      const projectId = this.projectId();
      const loading = this.store.loading();
      const missing = this.store.missing();
      const project = this.store.project();
      const summary = this.history.summary();
      if (loading || summary?.projectId !== projectId || summary.historyId === null) return;
      const creationUndoLanded = project?.id === projectId && summary.redo?.operation === 'project.add';
      const creationRedoLanded = missing && summary.undo?.operation === 'project.add';
      if (!creationUndoLanded && !creationRedoLanded) return;
      const key = `${summary.historyId}:${summary.revision}`;
      if (this.creationReconciliationKey === key) return;
      this.creationReconciliationKey = key;
      untracked(() => void this.store.load(projectId));
    });

    // §68's fallback. `replaceUrl` so Back still goes where the user came from, and the reason
    // travels in navigation state: the sub-project case crosses from the three-segment route
    // to the two-segment one, which destroys this component and any field it was held in.
    effect(() => {
      const resolution = this.resolution();
      if (resolution === null) return;
      if (resolution.outcome === 'redirect') {
        void this.router.navigate(resolution.to, {
          replaceUrl: true,
          state: {
            pageNotice: resolution.reason,
            ...(resolution.enableKind === undefined ? {} : { pageEnableKind: resolution.enableKind }),
          } satisfies PageNoticeState,
        });
        return;
      }
      // Read here rather than on init, so one code path covers a reused component, a
      // re-created one and a reload — but keyed on the page that was *resolved*, not on the
      // resolution object. That object is a fresh literal whenever the project record is
      // replaced, and every optimistic write replaces it; re-reading history state on each one
      // would undo a notice the user had already dismissed.
      const settled = resolution.outcome === 'render' ? resolution.pageId ?? resolution.kind : 'unavailable';
      untracked(() => {
        if (this.noticedFor === settled) return;
        this.noticedFor = settled;
        const notice = this.noticeFromNavigation();
        this.noticeState.set(notice?.pageNotice ?? null);
        this.noticeEnableKindState.set(notice?.pageEnableKind ?? null);
      });
    });
  }

  private focusHistoryFragment(): void {
    const projectId = this.projectId();
    const url = this.router.url;
    if (this.router.parseUrl(url).fragment !== 'history-controls') {
      this.focusedHistoryUrl = null;
      return;
    }
    if (this.focusedHistoryUrl === url || this.store.project()?.id !== projectId) return;
    const group = this.host.nativeElement.querySelector<HTMLElement>('#history-controls');
    if (group === null) return;
    group.scrollIntoView?.({ block: 'nearest' });
    group.focus();
    this.focusedHistoryUrl = url;
  }

  private noticeFromNavigation(): PageNoticeState | null {
    const state = this.location.getState() as PageNoticeState | null;
    if (state === null || typeof state.pageNotice !== 'string') return null;
    return {
      pageNotice: state.pageNotice,
      ...(this.isOptionalNoticeKind(state.pageEnableKind) ? { pageEnableKind: state.pageEnableKind } : {}),
    };
  }

  private isOptionalNoticeKind(kind: unknown): kind is OptionalProjectPageKind {
    return typeof kind === 'string' &&
      (kind === 'todos' || kind === 'reflections') &&
      isOptionalProjectPageKind(kind as ProjectPageKind);
  }

  noticePageLabel(): string {
    const kind = this.noticeEnableKindState();
    return kind === null ? 'page' : pageDefinitionFor(kind)?.label ?? kind;
  }

  /** A full reload retries a failed deferred dependency while preserving the current route. */
  navigationReloadUrl(): string { return this.router.url; }

  /**
   * The tree's pencil or More asks for page settings (Slice 81, R2): rendered in a deferred block,
   * which opens itself under the request's source. Not before the root has loaded.
   */
  openPageSettings(request: ProjectPlaceRequest): void {
    if (!this.store.loading() && this.store.root() !== null) this.pageSettingsRequest.set(request);
  }

  /** The tree's pencil or More requests the dialog; the loaded root determines whether creation is available. */
  openWorkCreate(request: ProjectPlaceRequest): void {
    if (!this.store.loading() && this.workCreateBlocked() === null) {
      // A page-settings request left set (its chunk failed, so no `closed`) must not word this one's failure.
      this.pageSettingsRequest.set(null);
      this.workCreateReturn = request.returnFocus;
      this.releaseWorkLift = this.lifts.open(() => this.closeWorkCreate());
      this.workCreateOpen.set(true);
    }
  }

  /** A chosen close returns focus to the request's opener after the dialog leaves. Loads move no focus. */
  closeWorkCreate(): void {
    this.releaseWorkLift?.(); this.releaseWorkLift = null;
    this.workCreateOpen.set(false);
    const opener = this.workCreateReturn;
    afterNextRender(() => new LiftFocus(opener, () => this.host.nativeElement.querySelector<HTMLElement>('h1[data-project-name]')).restore(), { injector: this.injector });
  }

  /**
   * Clears the message **and** the history entry that carries it, so a reload or a Back onto
   * this URL does not resurrect something the user has already read and dismissed.
   */
  dismissNotice(): void {
    this.noticeState.set(null);
    this.noticeEnableKindState.set(null);
    this.location.replaceState(this.location.path(), '', {});
  }

  setPageEnabled(kind: OptionalProjectPageKind, enabled: boolean): void {
    void this.store.setPageEnabled(kind, enabled);
  }

  retryPageContext(): void {
    void this.store.retryPageContext();
  }

  /**
   * The failed project read's Try again repeats what opening the project read: the project, and
   * the history when its read failed too (a no-op otherwise), so no bare header Retry is left.
   */
  retryProject(): void {
    void this.store.retry();
    this.history.retry();
  }

  async enableNoticedPage(): Promise<void> {
    const kind = this.noticeEnableKindState();
    const root = this.store.root();
    if (kind === null || root === null) return;
    if (!await this.store.setPageEnabled(kind, true)) return;
    this.dismissNotice();
    await this.router.navigate(['/projects', root.id, 'pages', kind]);
  }

  rename(name: string): void {
    void this.store.rename(name);
  }

  setDescription(description: string | null): void {
    void this.store.setDescription(description);
  }

  setStatus(status: SettableProjectStatus): void {
    void this.store.setStatus(status);
  }

  setTargetDate(targetDate: string | null): void {
    void this.store.setTargetDate(targetDate);
  }

  async openArchive(returnTo?: HTMLElement): Promise<void> {
    if (this.archiveNavigationPendingState()) return;
    this.archiveNavigationPendingState.set(true);
    try {
      const root = this.store.root();
      if (root !== null) {
        const target = ['/projects', root.id, 'pages', 'archive'];
        this.archiveFocus.archiveUrl.set(this.router.serializeUrl(this.router.createUrlTree(target)));
        if (await this.router.navigate(target)) {
          this.focusArchiveLanding();
          return;
        }
        this.archiveFocus.archiveUrl.set(null);
      }
      if (returnTo) new LiftFocus(returnTo, () => this.host.nativeElement.querySelector('[data-project-more]')).restore();
    } finally {
      this.archiveNavigationPendingState.set(false);
    }
  }

  private focusArchiveLanding(): void {
    const url = this.archiveFocus.archiveUrl();
    if (url === null || this.router.url !== url) return;
    const heading = this.host.nativeElement.querySelector<HTMLElement>('#archive-page-title');
    if (heading) { this.archiveFocus.archiveUrl.set(null); heading.focus(); }
  }

  /**
   * §19: the store decided, the shell words it. A successful archive **stays on the archived
   * project's page** (Slice 41), which §31 keeps rendering, so the header's enabled Undo is the one
   * place the archive can be reversed — the dashboard has no header to offer it. A refusal leaves
   * the domain's own reason in the header.
   */
  async confirmArchive(workstreamIds: ProjectId[] = []): Promise<boolean> {
    const project = this.store.project();
    if (project === null) return false;
    if (!await this.store.archive(workstreamIds)) return false;
    // Only if the person is still on it: after a sidebar move during the awaited PATCH, this header
    // belongs to another project, whose history holds no such step.
    if (this.projectId() !== project.id) return true;
    // The confirmation's caller closes its native modal before the next render paints feedback.
    afterNextRender(() => {
      if (this.projectId() === project.id) this.toast.show(archivedHereFeedback(project.name, this.store.archiveCascadeCount()), this.store.archiveReport() ?? undefined,
        () => this.host.nativeElement.querySelector<HTMLElement>('[data-project-more]'));
    }, { injector: this.injector });
    return true;
  }

  /**
   * The banner's Restore (Slice 79, §31): restores the archived owner, then moves focus once the
   * store has resolved, as the banner leaves or moves on. With no owner left, to the project's
   * heading (the own project adds no toast; an ancestor's cross-owner toast is polite); archived
   * twice, to the banner's restore choice for the next owner. A refusal, or a restore landing after
   * the route moved to another project, leaves focus where it is.
   */
  async restoreFromBanner(status: ProjectRestoreStatus): Promise<void> {
    const owner = this.store.archivedOwner();
    const projectId = this.projectId();
    if (owner === null || !await this.store.restoreOwner(owner.id, status)) return;
    // Landing after the person opened another project moves nothing on that one.
    if (this.projectId() !== projectId) return;
    afterNextRender(() => {
      const host = this.host.nativeElement;
      const target = this.store.archivedOwner() === null
        ? host.querySelector<HTMLElement>('h1[data-project-name]')
        : host.querySelector<HTMLElement>('app-archived-banner select[data-restore-status]');
      target?.focus();
    }, { injector: this.injector });
  }

  readonly undo = (): void => void this.history.undo();
  readonly redo = (): void => void this.history.redo();
}
