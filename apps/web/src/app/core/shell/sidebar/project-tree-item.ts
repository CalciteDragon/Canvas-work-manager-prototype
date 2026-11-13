import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectId } from '@cwm/contracts';
import { Icon } from '../../../shared/components/icon/icon';
import type { WorkRow } from './tree-model';

/**
 * One workstream in the navigation tree's root level, and the work under it (Slice 81): the one
 * row component for every workstream. Recursive rather than fixed-depth: §23 puts no limit on
 * the hierarchy and the `nested-projects` seed is already three levels deep.
 *
 * Its data attributes are the tree's own (`data-nav-work`), so they never collide with the
 * project column's (`data-work-project`) while both exist. Unstyled: the row is the global
 * `.tree-link` (`_controls.scss`), one copy for the whole tree.
 */
@Component({
  // The host is the list item, so each `ul` holds `li`s directly (axe `list`/`listitem`).
  selector: 'li[app-project-tree-item]',
  host: { '[attr.data-nav-work-id]': 'row().id' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <a
      class="tree-link"
      data-nav-work
     
      [routerLink]="['/projects', row().id]"
      [attr.aria-current]="row().id === currentId() ? 'page' : null"
    >
      <span aria-hidden="true">{{ row().icon ?? '🧩' }}</span>
      <span class="name">{{ row().name }}</span>
      @if (row().archived) {
        <!-- The leading space keeps the name "Legacy attic Archived", not one word. --><span> Archived</span>
      } @else if (row().completed) {
        <span role="img" aria-label="Completed"><app-icon name="check" /></span>
      }
    </a>
    @if (row().children.length > 0) {
      <ul class="tree-children">
        @for (child of row().children; track child.id) {
          <li app-project-tree-item [row]="child" [currentId]="currentId()"></li>
        }
      </ul>
    }
  `,
})
export class ProjectTreeItem {
  readonly row = input.required<WorkRow>();
  /** The workstream that is the current item, if any. */
  readonly currentId = input<ProjectId | null>(null);
}
