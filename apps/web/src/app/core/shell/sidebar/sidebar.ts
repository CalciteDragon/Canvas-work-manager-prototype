import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { ProjectTreeNode } from '../shell-store';
import { ProjectTreeItem } from './project-tree-item';

/**
 * §23's sidebar. **Presentational**: it takes the project tree and the load's outcome as
 * inputs and injects neither the store nor the gateway, which is what keeps §19's
 * `Page → Store → Gateway` chain from quietly becoming `Component → Gateway`.
 */
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectTreeItem, RouterLink, RouterLinkActive],
  styleUrl: './sidebar.scss',
  templateUrl: './sidebar.html',
})
export class Sidebar {
  readonly projectTree = input.required<ProjectTreeNode[]>();
  readonly error = input.required<string | null>();

  /** §23: "Project hierarchy should optionally expand inline." */
  protected readonly projectsExpanded = signal(true);

  protected toggleProjects(): void {
    this.projectsExpanded.update((expanded) => !expanded);
  }
}
