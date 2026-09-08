import { NgComponentOutlet } from '@angular/common';
import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DestroyRef } from '@angular/core';
import { Router } from '@angular/router';
import type { ProjectId, ProjectPageKind } from '@cwm/contracts';
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
import { ProjectWorkspaceStore } from './project-workspace-store';
import type { SettableProjectStatus } from './project-more-menu';

/** How a fallback's reason travels a redirect. See `noticeFromNavigation`. */
interface PageNoticeState {
  pageNotice?: string;
  pageEnableKind?: OptionalProjectPageKind;
}

const NARROW = '(max-width: 60rem)';

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
  imports: [NgComponentOutlet, ProjectHeader, ProjectPageNavigation],
  providers: [ProjectWorkspaceStore],
  templateUrl: './project-workspace-shell.html',
  styleUrl: './project-workspace-shell.scss',
  // The shell owns the workspace region's gutters, so `AppShell` gives it the full bleed and
  // the navigation column can reach the sidebar. Keyed on this attribute rather than on the
  // component's selector, so a rename cannot silently stop matching.
  host: { 'data-flush-workspace': '' },
})
export class ProjectWorkspaceShell {
  /** Bound from the route by `withComponentInputBinding()` (§68). */
  readonly projectId = input.required<ProjectId>();
  /** Absent on `/projects/:projectId`, which means "this project's canonical page". */
  readonly pageKind = input<string | undefined>(undefined);

  readonly store = inject(ProjectWorkspaceStore);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly noticeState = signal<string | null>(null);
  private readonly noticeEnableKindState = signal<OptionalProjectPageKind | null>(null);
  /** The page the current notice was read for; see the resolve effect. */
  private noticedFor: string | null = null;
  private readonly narrowState = signal(false);
  private readonly collapsedState = signal(false);
  private readonly archiveNavigationPendingState = signal(false);

  readonly notice = this.noticeState.asReadonly();
  readonly noticeEnableKind = this.noticeEnableKindState.asReadonly();
  /** §23's narrow-width collapse. The column is simply present at desktop widths. */
  readonly collapsed = computed(() => this.narrowState() && this.collapsedState());
  readonly archiveNavigationPending = this.archiveNavigationPendingState.asReadonly();
  readonly archiveRetryNeeded = computed(() => this.store.writeError()?.startsWith('Archive was enabled') ?? false);

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
      shortcutsAllowed: project.kind === 'root' && rendered.kind === 'home',
      onProjectDataChange: this.onProjectDataChange,
      onProjectHierarchyChange: this.onProjectHierarchyChange,
    };
  });

  constructor() {
    // Re-loads when the route changes projects, which sidebar navigation does without
    // re-creating this component. Moving between two pages of the same project changes only
    // `pageKind`, and must not re-read the context.
    effect(() => {
      const projectId = this.projectId();
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
      const settled = resolution.outcome === 'render' ? resolution.pageId : 'unavailable';
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
      };
      narrow.addEventListener('change', onNarrowChange);
      // The `MediaQueryList` is a window singleton and outlives this component, so an
      // unremoved listener is a closure over a destroyed shell — once per visit, forever.
      inject(DestroyRef).onDestroy(() => narrow.removeEventListener('change', onNarrowChange));
    }
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
      (kind === 'todos' || kind === 'archive' || kind === 'reflections') &&
      isOptionalProjectPageKind(kind as ProjectPageKind);
  }

  noticePageLabel(): string {
    const kind = this.noticeEnableKindState();
    return kind === null ? 'page' : pageDefinitionFor(kind)?.label ?? kind;
  }

  toggleNavigation(): void {
    this.collapsedState.update((collapsed) => !collapsed);
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

  async openArchive(): Promise<void> {
    if (this.archiveNavigationPendingState()) return;
    this.archiveNavigationPendingState.set(true);
    try {
      if (await this.store.openArchive()) {
        const root = this.store.root();
        if (root !== null) await this.router.navigate(['/projects', root.id, 'pages', 'archive']);
      }
    } finally {
      this.archiveNavigationPendingState.set(false);
    }
  }

  async retryArchiveOpen(): Promise<void> {
    if (this.archiveNavigationPendingState()) return;
    this.archiveNavigationPendingState.set(true);
    try {
      if (await this.store.retryArchiveContext()) {
        const root = this.store.root();
        if (root !== null) await this.router.navigate(['/projects', root.id, 'pages', 'archive']);
      }
    } finally {
      this.archiveNavigationPendingState.set(false);
    }
  }

  /**
   * §19: the store decided, the page navigates. A refusal leaves the user where they are,
   * with the domain's own reason in the header.
   */
  async confirmArchive(): Promise<void> {
    const archived = await this.store.archive();
    if (!archived) return;
    await this.router.navigate(['/app']);
  }
}
