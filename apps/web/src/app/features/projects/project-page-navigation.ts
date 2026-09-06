import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Project, ProjectId, ProjectPageKind } from '@cwm/contracts';
import type { WorkTreeNode } from './project-workspace-store';
import type { ProjectPageDefinition } from './project-page-registry';
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
  readonly pages = input.required<ProjectPageDefinition[]>();
  readonly workTree = input.required<WorkTreeNode[]>();
  /** The project the route names, so the column can mark the open unit of work. */
  readonly currentProjectId = input.required<ProjectId>();
  /** `null` on a sub-project: its work canvas is not one of the root's tabs (§26). */
  readonly activeKind = input<ProjectPageKind | null>(null);
  /** Root first, immediate parent last. Empty on a root. */
  readonly breadcrumbs = input<Project[]>([]);
  readonly collapsed = input<boolean>(false);

  readonly toggleRequested = output<void>();
}
