import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Project, ProjectId, ProjectPage, ProjectPageKind } from '@cwm/contracts';
import type { WorkTreeNode } from './project-workspace-store';
import {
  OPTIONAL_PROJECT_PAGE_DEFINITIONS,
  navigablePages,
  type OptionalProjectPageKind,
} from './project-page-registry';
import { ProjectWorkItem } from './project-work-item';

/**
 * §23's second navigation column: a root's pages, then the work hierarchy beneath it.
 *
 * **Presentational**: it takes the root, its tabs, the work tree and the way back through a
 * sub-project's parents, and injects neither the store nor the gateway — the same rule that
 * keeps `Sidebar` from quietly becoming `Component → Gateway` (§19).
 *
 * Active state comes from `activeKind` rather than from `routerLinkActive`. The app's own
 * links — the global sidebar, project creation, every Sub-Projects section — use the short
 * `/projects/:id` form, and `routerLinkActive` on the Home tab's `/pages/home` would not match
 * it, so Home would render as current only for the users who typed the long URL.
 */
@Component({
  selector: 'app-project-page-navigation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectWorkItem, RouterLink],
  templateUrl: './project-page-navigation.html',
  styleUrl: './project-page-navigation.scss',
})
export class ProjectPageNavigation {
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
  readonly pageWriteError = input<string | null>(null);
  readonly pageWriteRetryKind = input<OptionalProjectPageKind | null>(null);

  readonly visiblePages = () => navigablePages(this.pages());
  readonly optionalPageDefinitions = OPTIONAL_PROJECT_PAGE_DEFINITIONS;

  readonly toggleRequested = output<void>();
  readonly pageToggleRequested = output<{ kind: OptionalProjectPageKind; enabled: boolean }>();
  readonly retryPageRequested = output<void>();
  /**
   * A destination in the column was chosen, with the URL it leads to (Slice 58). One delegated
   * listener on the host covers every link here, `ProjectWorkItem`'s recursive ones included,
   * and only a plain primary activation counts: a modified or middle click opens elsewhere, and
   * the toggle, the page manager and its checkboxes are not destinations.
   */
  readonly linkSelected = output<string>();

  constructor() {
    // Captured on the host, not a `(click)` host listener: a link to the other project route
    // makes the router replace the workspace shell — and this column with it — synchronously
    // inside `RouterLink`'s own click handler, which removes a bubbling listener before the
    // click reaches it.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const onClick = (event: MouseEvent): void => this.reportLink(event);
    host.addEventListener('click', onClick, { capture: true });
    inject(DestroyRef).onDestroy(() => host.removeEventListener('click', onClick, { capture: true }));
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
    this.pageToggleRequested.emit({
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
