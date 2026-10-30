import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, effect, inject, input, output, signal } from '@angular/core';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LiftStack } from '../../shared/lifts/lift-stack';
import { LiftFocus } from '../../shared/lifts/lift-focus';
import type { Project, ProjectId, ProjectPage, ProjectPageKind } from '@cwm/contracts';
import type { WorkTreeNode } from './project-workspace-store';
import {
  OPTIONAL_PROJECT_PAGE_DEFINITIONS,
  navigablePages,
  type OptionalProjectPageKind,
} from './project-page-registry';
import { ProjectWorkItem } from './project-work-item';
import { Icon } from '../../shared/components/icon/icon';
import { FailureMessage } from '../../shared/feedback/failure-message';
import type { Failure } from '../../shared/feedback/failure';

/**
 * §23's second navigation column: a root's pages, then the work hierarchy beneath it.
 *
 * **Presentational**: it takes the root, its tabs, the work tree and the way back through a
 * sub-project's parents, and injects neither the store nor the gateway — the same rule that
 * keeps `Sidebar` from quietly becoming `Component → Gateway` (§19).
 *
 * Active state comes from `activeKind` rather than from `routerLinkActive`. The app's own
 * links — the global sidebar, project creation, Work navigation — use the short
 * `/projects/:id` form, and `routerLinkActive` on the Home tab's `/pages/home` would not match
 * it, so Home would render as current only for the users who typed the long URL.
 */
@Component({
  selector: 'app-project-page-navigation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectWorkItem, RouterLink, Icon, FailureMessage],
  templateUrl: './project-page-navigation.html',
  styleUrl: './project-page-navigation.scss',
})
export class ProjectPageNavigation {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly lifts = inject(LiftStack);
  private releaseLift: (() => void) | null = null;
  private get panel(): HTMLElement | null { return this.host.nativeElement.querySelector('[data-project-page-manager]'); }
  private get gear(): HTMLElement | null { return this.host.nativeElement.querySelector('[data-project-settings-toggle]'); }
  readonly root = input.required<Project>();
  /** Every root page, including disabled records: the manager needs both states. */
  readonly pages = input.required<readonly ProjectPage[]>();
  readonly workTree = input.required<WorkTreeNode[]>();
  /** The project the route names, so the column can mark the open unit of work. */
  readonly currentProjectId = input.required<ProjectId>();
  /** `null` on a sub-project: its work canvas is not one of the root's tabs (§26). */
  readonly activeKind = input<ProjectPageKind | null>(null);
  /** Root first, immediate parent last. Empty on a root. */
  readonly breadcrumbs = input<Project[]>([]);
  readonly collapsed = input<boolean>(false);
  readonly pageWritePending = input<boolean>(false);
  readonly pageWriteError = input<Failure | null>(null);
  readonly pageWriteRetryKind = input<OptionalProjectPageKind | null>(null);
  /** A focusable unavailable plus spells out this reason without requesting a write. */
  readonly workCreateBlocked = input<string | null>(null);
  /** A disclosure belongs to this mounted column; a live root change closes it. */
  readonly settingsOpen = signal(false);

  readonly visiblePages = () => navigablePages(this.pages(), this.activeKind());
  readonly optionalPageDefinitions = OPTIONAL_PROJECT_PAGE_DEFINITIONS;

  readonly toggleRequested = output<void>();
  readonly pageToggleRequested = output<{ kind: OptionalProjectPageKind; enabled: boolean }>();
  readonly retryPageRequested = output<void>();
  readonly workCreateRequested = output<void>();
  /**
   * A destination in the column was chosen, with the URL it leads to (Slice 58). One delegated
   * listener on the host covers every link here, `ProjectWorkItem`'s recursive ones included,
   * and only a plain primary activation counts: a modified or middle click opens elsewhere, and
   * the toggle, the page manager and its checkboxes are not destinations.
   */
  readonly linkSelected = output<string>();

  constructor() {
    let rootId: ProjectId | null = null;
    effect(() => {
      const nextRootId = this.root().id;
      if (rootId !== nextRootId) this.closeSettings(false);
      rootId = nextRootId;
    });
    // Captured on the host, not a `(click)` host listener: a link to the other project route
    // makes the router replace the workspace shell — and this column with it — synchronously
    // inside `RouterLink`'s own click handler, which removes a bubbling listener before the
    // click reaches it.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const onClick = (event: MouseEvent): void => this.reportLink(event);
    host.addEventListener('click', onClick, { capture: true });
    inject(DestroyRef).onDestroy(() => host.removeEventListener('click', onClick, { capture: true }));
    inject(DestroyRef).onDestroy(() => this.releaseLift?.());
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart && this.settingsOpen()) this.closeSettings(true);
    });
  }

  requestWorkCreate(): void {
    if (this.workCreateBlocked() === null) this.workCreateRequested.emit();
  }

  settingsBeforeToggle(event: Event): void {
    if ((event as ToggleEvent).newState === 'open') {
      this.releaseLift = this.lifts.open(() => this.closeSettings(false));
    }
  }

  settingsToggle(event: Event): void {
    const open = (event as ToggleEvent).newState === 'open';
    this.settingsOpen.set(open);
    if (open) afterNextRender(() => {
      if (this.settingsOpen()) new LiftFocus(this.gear, () => this.gear).enter(this.panel?.querySelector<HTMLInputElement>('input:not(:disabled)') ?? null);
    }, { injector: this.injector });
    else { this.releaseLift?.(); this.releaseLift = null; }
  }

  private closeSettings(restore: boolean): void {
    const panel = this.panel;
    const focus = new LiftFocus(this.gear, () => this.gear);
    if (restore) focus.restore(panel);
    panel?.hidePopover?.();
    this.settingsOpen.set(false);
    this.releaseLift?.(); this.releaseLift = null;
  }

  settingsKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.closeSettings(true);
  }

  private reportLink(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const url = link?.getAttribute('href');
    if (url) this.linkSelected.emit(url);
  }

  pageEnabled(kind: OptionalProjectPageKind): boolean {
    // A failed native checkbox click leaves the `pages` array referentially unchanged. Read the
    // write feedback too, so the OnPush view is checked when the failed operation settles and
    // Angular reapplies the last confirmed `checked` value rather than leaving the DOM preview.
    this.pageWritePending();
    this.pageWriteError();
    this.pageWriteRetryKind();
    return this.pages().some((page) => page.kind === kind && page.enabled);
  }

  requestPageToggle(kind: OptionalProjectPageKind, event: Event): void {
    const control = event.target as HTMLInputElement;
    if (!this.pageWritePending()) this.pageToggleRequested.emit({
      kind,
      enabled: control.checked,
    });
    // `[checked]` is a one-way binding, and Angular quite correctly does not write the same
    // boolean again just because a native checkbox changed it. This control is deliberately
    // non-optimistic, so restore the last confirmed value immediately; a successful context
    // read changes `pages` and the binding then paints the new state.
    control.checked = this.pageEnabled(kind);
  }
}
