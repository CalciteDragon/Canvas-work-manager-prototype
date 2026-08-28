import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DashboardResult, DashboardWidget } from '@cwm/contracts';

/** §24's "tasks relevant today", in the three groups the day actually has. */
@Component({
  selector: 'app-today-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today-widget.html',
  styleUrl: '../widget-content.scss',
})
export class TodayWidget {
  readonly widget = input.required<DashboardWidget>();
  readonly dashboard = input.required<DashboardResult>();

  readonly groups = computed(() => {
    const { overdue, dueToday, inProgress } = this.dashboard().today;
    return [
      { label: 'Overdue', tasks: overdue },
      { label: 'Due today', tasks: dueToday },
      { label: 'In progress', tasks: inProgress },
    ].filter((group) => group.tasks.length > 0);
  });
}
