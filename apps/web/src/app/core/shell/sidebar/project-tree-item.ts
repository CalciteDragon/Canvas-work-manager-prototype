import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectTreeNode } from '../shell-store';

/**
 * One project in the sidebar, and the projects under it. Recursive rather than a
 * fixed-depth template: the `nested-projects` seed is three levels deep and §23 puts no
 * limit on "expand inline".
 */
@Component({
  selector: 'app-project-tree-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styleUrl: './project-tree-item.scss',
  template: `
    <li [attr.data-project-id]="node().project.id">
      <a data-project [routerLink]="['/projects', node().project.id]">
        @if (node().project.icon) {
          <span class="icon" aria-hidden="true">{{ node().project.icon }}</span>
        }
        <span class="name">{{ node().project.name }}</span>
      </a>
      @if (node().children.length > 0) {
        <ul class="children">
          @for (child of node().children; track child.project.id) {
            <app-project-tree-item [node]="child" />
          }
        </ul>
      }
    </li>
  `,
})
export class ProjectTreeItem {
  readonly node = input.required<ProjectTreeNode>();
}
