import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectId } from '@cwm/contracts';
import type { WorkTreeNode } from './project-workspace-store';

/**
 * One unit of work in §23's column, and the work under it. Recursive rather than
 * fixed-depth, for the same reason `ProjectTreeItem` is: §23 puts no limit on the hierarchy
 * and the `nested-projects` seed is already three levels deep.
 */
@Component({
  selector: 'app-project-work-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styleUrl: './project-work-item.scss',
  template: `
    <li [attr.data-work-project-id]="node().project.id">
      <a
        data-work-project
        [routerLink]="['/projects', node().project.id]"
        [attr.aria-current]="node().project.id === currentProjectId() ? 'page' : null"
      >
        <span class="icon" aria-hidden="true">{{ node().project.icon ?? '🧩' }}</span>
        <span class="name">{{ node().project.name }}</span>
        @if (node().project.completedAt) {
          <span class="done" aria-label="Completed">✓</span>
        }
      </a>
      @if (node().children.length > 0) {
        <ul class="children">
          @for (child of node().children; track child.project.id) {
            <app-project-work-item [node]="child" [currentProjectId]="currentProjectId()" />
          }
        </ul>
      }
    </li>
  `,
})
export class ProjectWorkItem {
  readonly node = input.required<WorkTreeNode>();
  readonly currentProjectId = input.required<ProjectId>();
}
