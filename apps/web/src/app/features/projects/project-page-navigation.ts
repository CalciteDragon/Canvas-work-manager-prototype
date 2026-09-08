import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
  /** Archive remains reachable even when its optional tab is disabled (§31–32). */
  readonly openArchiveRequested = output<void>();
  readonly pageToggleRequested = output<{ kind: OptionalProjectPageKind; enabled: boolean }>();
  readonly retryPageRequested = output<void>();

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
