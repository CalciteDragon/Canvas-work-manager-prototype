import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DashboardProject, DashboardResult, DashboardWidget } from '@cwm/contracts';
import { RouterLink } from '@angular/router';

/** §24's "active project overview". Count-based progress only — see `DashboardService`. */
@Component({
  selector: 'app-active-projects-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './active-projects-widget.html',
  styleUrl: '../widget-content.scss',
})
export class ActiveProjectsWidget {
  readonly widget = input.required<DashboardWidget>();
  readonly dashboard = input.required<DashboardResult>();

  /** `daysToTarget` is signed, so the same field says "in 4 days" and "4 days ago". */
  target(project: DashboardProject): string {
    if (project.daysToTarget === null) return 'No target date';
    if (project.daysToTarget === 0) return 'Due today';
    const days = Math.abs(project.daysToTarget);
    const noun = days === 1 ? 'day' : 'days';
    return project.daysToTarget > 0 ? `in ${days} ${noun}` : `${days} ${noun} overdue`;
  }
}
