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
import { canonicalPageKindFor, type ProjectId, type ProjectPageKind, type UpdateProjectInput } from '@cwm/contracts';
import { TaskDrawerCoordinator } from '../tasks/task-drawer-coordinator';
import { LiftStack } from '../../shared/lifts/lift-stack';
import { LiftFocus } from '../../shared/lifts/lift-focus';
import { OPERATION_HISTORY_REPORTER } from '../../core/history/operation-history-reporter';
import { RECEIPT_UNDO } from '../../core/history/receipt-undo';
import { ReceiptToast } from '../../core/history/receipt-toast';
import { FailureMessage } from '../../shared/feedback/failure-message';
import { UnavailablePage } from '../../shared/components/unavailable-page/unavailable-page';
import type { Failure } from '../../shared/feedback/failure';
import { Toast } from '../../shared/feedback/toast';
import { WORKSPACE_NARROW_BREAKPOINT } from '../../core/layout/breakpoints';
import { archivedHereFeedback, createdSubjectOf } from './history/history-feedback';
import { ProjectHistoryControls } from './history/project-history-controls';
import { ProjectHistoryStore } from './history/project-history-store';
import { ProjectHeader } from './project-header';
import { ProjectPageNavigation } from './project-page-navigation';
import type { ProjectPageRendererInputs } from './project-page-contract';
import {
  isOptionalProjectPageKind,
  pageDefinitionFor,
  resolveProjectPage,
  type OptionalProjectPageKind,
  type ProjectPageResolution,
} from './project-page-registry';
import { ProjectWorkspaceStore, type WorkTreeNode } from './project-workspace-store';
import { WorkCreateDialog, type WorkCreateParent } from './work-create-dialog';
import type { SettableProjectStatus } from './project-more-menu';

/** How a fallback's reason travels a redirect. See `noticeFromNavigation`. */
interface PageNoticeState {
  pageNotice?: string;
  pageEnableKind?: OptionalProjectPageKind;
}

const NARROW = `(max-width: ${WORKSPACE_NARROW_BREAKPOINT})`;

/**
 * Slice 58: the column link a narrow selection chose, until the toggle that re-collapsed it
 * can take focus. Root-scoped rather than a shell field: `/projects/:projectId` and
 * `/projects/:projectId/pages/:pageKind` are two route configs, so moving between them makes
 * the router re-create the shell, and a field would be lost with the toggle it meant to focus.
 */
@Injectable({ providedIn: 'root' })
export class ProjectColumnFocusRequest {
  /** The chosen link's URL, as `Router.url` will read once the navigation lands. */
  readonly url = signal<string | null>(null);
  /** Open archive's landing survives a replacement of the routed shell. */
  readonly archiveUrl = signal<string | null>(null);

  constructor() {
    // A navigation that lands anywhere else ends the request, including on a route with no
    // project shell to drop it — otherwise a later visit to the same URL would take focus.
    // The §68 redirect rewrites the request before it navigates, so it is not dropped here.
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationEnd && this.url() !== null && event.urlAfterRedirects !== this.url()) {
          this.url.set(null);
        }
        if (event instanceof NavigationEnd && this.archiveUrl() !== null && event.urlAfterRedirects !== this.archiveUrl()) {
          this.archiveUrl.set(null);
        }
      });
  }
}

/**
 * §23's project workspace, and §68's two project routes: `/projects/:projectId` and
 * `/projects/:projectId/pages/:pageKind` both resolve here.
 *
 * One component for both, because they are one surface: Angular re-uses the instance across a
 * param change, so moving between a root's pages keeps the context — the project, its pages
 * and its work hierarchy — loaded once.
 *
 * The layout is §23's, which is the diagram that describes the *shell*: the navigation column
 * occupies the first track for the full height of the workspace region, flush against the
 * global sidebar, and the header, the fallback notice and the routed renderer stack in the
 * second. §26's "Project Header / Project Navigation / Controls / Section Canvas" is read as
 * the page's parts rather than as a strict vertical stack — what matters, and what this
 * placement gives, is that the header is rendered **once per project** rather than once per
 * page.
 */
@Component({
  selector: 'app-project-workspace-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, FailureMessage, UnavailablePage, ProjectHeader, ProjectHistoryControls, Toast, ProjectPageNavigation, WorkCreateDialog, RouterLink],
  // `providers`, not `viewProviders`: the page renderers are mounted through `NgComponentOutlet`,
  // and every writer store inside them must resolve the header's history as its reporter
  // (Slice 41). The inert root default would otherwise hide a wiring mistake.
  providers: [
    ProjectWorkspaceStore,
    ProjectHistoryStore,
    TaskDrawerCoordinator,
    { provide: OPERATION_HISTORY_REPORTER, useExisting: ProjectHistoryStore },
    { provide: RECEIPT_UNDO, useExisting: ProjectHistoryStore },
  ],
  templateUrl: './project-workspace-shell.html',
  styleUrl: './project-workspace-shell.scss',
  // The shell owns the workspace region's gutters, so `AppShell` gives it the full bleed and
  // the navigation column can reach the sidebar. Keyed on this attribute rather than on the
  // component's selector, so a rename cannot silently stop matching.
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
  readonly archiveProject = (): Promise<boolean> => this.confirmArchive();
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly columnFocus = inject(ProjectColumnFocusRequest);
  private focusedHistoryUrl: string | null = null;

  private readonly noticeState = signal<string | null>(null);
  private readonly noticeEnableKindState = signal<OptionalProjectPageKind | null>(null);
  /** The page the current notice was read for; see the resolve effect. */
  private noticedFor: string | null = null;
  private readonly narrowState = signal(false);
  private readonly collapsedState = signal(false);
  private readonly archiveNavigationPendingState = signal(false);
  /** A single reconciliation key prevents a held summary from reloading forever. */
  private creationReconciliationKey: string | null = null;
  readonly workCreateOpen = signal(false);
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
  readonly createWorkstream = (parentId: ProjectId, name: string): Promise<Failure | null> => this.store.createWorkstream(parentId, name);

  readonly notice = this.noticeState.asReadonly();
  readonly noticeEnableKind = this.noticeEnableKindState.asReadonly();
  /** §23's narrow-width collapse. The column is simply present at desktop widths. */
  readonly collapsed = computed(() => this.narrowState() && this.collapsedState());
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
      // The canonical page — Home for a root, the Work canvas for a workstream (Slice 65).
      shortcutsAllowed: rendered.kind === canonicalPageKindFor(project.kind),
      // `root()` falls back to the project itself, so this is never null once a project is.
      rootProjectId: this.store.root()?.id ?? project.id,
      onProjectDataChange: this.onProjectDataChange,
      onProjectHierarchyChange: this.onProjectHierarchyChange,
      onOpenArchive: this.onOpenArchive,
    };
  });

  constructor() {
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
      if (loading || rootId !== this.workCreateRootId) this.workCreateOpen.set(false);
      this.workCreateRootId = rootId;
    });
    // A direct load resolves asynchronously and a fragment-only navigation can reuse the shell.
    // Inspect the current URL after each render until its matching header exists, then focus once.
    afterEveryRender(() => { this.focusHistoryFragment(); this.focusArchiveLanding(); }, { injector: this.injector });

    // Re-loads when the route changes projects, which sidebar navigation does without
    // re-creating this component. Moving between two pages of the same project changes only
    // `pageKind`, and must not re-read the context.
    effect(() => {
      const projectId = this.projectId();
      untracked(() => {
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
        // A column selection the fallback redirects still ends on the toggle: the request
        // follows the redirect rather than being dropped as a navigation that lost.
        untracked(() => {
          if (this.columnFocus.url() === this.router.url) {
            this.columnFocus.url.set(this.router.serializeUrl(this.router.createUrlTree(resolution.to)));
          }
        });
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

    const narrow = globalThis.matchMedia?.(NARROW);
    if (narrow !== undefined) {
      this.narrowState.set(narrow.matches);
      // A collapsed column that stays collapsed after the window widens would hide navigation
      // the user never chose to hide, so `collapsed` is the *and* of the two.
      this.collapsedState.set(narrow.matches);
      const onNarrowChange = (event: { matches: boolean }): void => {
        this.narrowState.set(event.matches);
        this.collapsedState.set(event.matches);
        this.columnFocus.url.set(null);
      };
      narrow.addEventListener('change', onNarrowChange);
      // The `MediaQueryList` is a window singleton and outlives this component, so an
      // unremoved listener is a closure over a destroyed shell — once per visit, forever.
      inject(DestroyRef).onDestroy(() => narrow.removeEventListener('change', onNarrowChange));
    }

    // Slice 58: a narrow column selection's focus request, honoured once the navigation has
    // landed, any reload it caused has settled and §68 has not redirected it — and only if the
    // URL is still the one chosen. A browser Back, a global-drawer choice or a history link that
    // won the navigation meanwhile keeps its own focus. Registered after the load effect, so a
    // project change has already set `loading` by the time this reads it.
    effect(() => {
      const url = this.columnFocus.url();
      if (url === null || this.router.currentNavigation() !== null || this.store.loading()) return;
      if (this.resolution()?.outcome === 'redirect') return;
      untracked(() => {
        this.columnFocus.url.set(null);
        if (this.router.url !== url) return;
        afterNextRender(() => this.focusColumnTarget(), { injector: this.injector });
      });
    });
  }

  /**
   * While narrow, a chosen link collapses the column again, so the canvas it opened is not
   * pushed under the list, and asks for focus on the toggle that brings the column back.
   */
  onColumnLinkSelected(url: string): void {
    if (!this.narrowState()) return;
    this.collapsedState.set(true);
    this.columnFocus.url.set(url);
  }

  /** The toggle, or — when the load ended without a column — the heading or Try again of what rendered. */
  private focusColumnTarget(): void {
    const host = this.host.nativeElement;
    const target =
      host.querySelector<HTMLElement>('[data-project-nav-toggle]') ??
      host.querySelector<HTMLElement>('#project-creation-recovery-heading') ??
      host.querySelector<HTMLElement>('[data-project-unavailable] h1') ??
      host.querySelector<HTMLElement>('[data-project-error] [data-recovery]');
    target?.focus();
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

  toggleNavigation(): void {
    this.collapsedState.update((collapsed) => !collapsed);
  }

  /** A full reload retries a failed deferred dependency while preserving the current route. */
  navigationReloadUrl(): string { return this.router.url; }

  /** The column requests the dialog; the loaded root determines whether creation is available. */
  openWorkCreate(): void {
    if (!this.store.loading() && this.workCreateBlocked() === null) {
      this.releaseWorkLift = this.lifts.open(() => this.closeWorkCreate());
      this.workCreateOpen.set(true);
    }
  }

  /** A chosen close restores focus after the deferred dialog leaves the view. Loads move no focus. */
  closeWorkCreate(): void {
    this.releaseWorkLift?.(); this.releaseWorkLift = null;
    this.workCreateOpen.set(false);
    afterNextRender(() => {
      const host = this.host.nativeElement;
      const plus = this.collapsed() ? null : host.querySelector<HTMLElement>('[data-work-create]');
      (plus ?? host.querySelector<HTMLElement>('[data-project-nav-toggle]'))?.focus();
    }, { injector: this.injector });
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
        this.columnFocus.archiveUrl.set(this.router.serializeUrl(this.router.createUrlTree(target)));
        if (await this.router.navigate(target)) {
          this.focusArchiveLanding();
          return;
        }
        this.columnFocus.archiveUrl.set(null);
      }
      if (returnTo) new LiftFocus(returnTo, () => this.host.nativeElement.querySelector('[data-project-more]')).restore();
    } finally {
      this.archiveNavigationPendingState.set(false);
    }
  }

  private focusArchiveLanding(): void {
    const url = this.columnFocus.archiveUrl();
    if (url === null || this.router.url !== url) return;
    const heading = this.host.nativeElement.querySelector<HTMLElement>('#archive-page-title');
    if (heading) { this.columnFocus.archiveUrl.set(null); heading.focus(); }
  }

  /**
   * §19: the store decided, the shell words it. A successful archive **stays on the archived
   * project's page** (Slice 41), which §31 keeps rendering, so the header's enabled Undo is the one
   * place the archive can be reversed — the dashboard has no header to offer it. A refusal leaves
   * the domain's own reason in the header.
   */
  async confirmArchive(): Promise<boolean> {
    const project = this.store.project();
    if (project === null) return false;
    if (!await this.store.archive()) return false;
    // Only if the person is still on it: after a sidebar move during the awaited PATCH, this header
    // belongs to another project, whose history holds no such step.
    if (this.projectId() !== project.id) return true;
    // The confirmation's caller closes its native modal before the next render paints feedback.
    afterNextRender(() => {
      if (this.projectId() === project.id) this.toast.show(archivedHereFeedback(project.name), this.store.archiveReport() ?? undefined,
        () => this.host.nativeElement.querySelector<HTMLElement>('[data-project-more]'));
    }, { injector: this.injector });
    return true;
  }

  readonly undo = (): void => void this.history.undo();
  readonly redo = (): void => void this.history.redo();
}
