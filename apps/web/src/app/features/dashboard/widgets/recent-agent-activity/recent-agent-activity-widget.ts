import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DashboardResult, DashboardWidget } from '@cwm/contracts';
import { ActivityFeed } from '../../../activity/activity-feed';

/**
 * §24's "changes made by connected AI agents". Data in, no gateway — the dashboard is one
 * derivation over one clock reading, so a tile that fetched for itself could contradict
 * the one beside it.
 *
 * It renders the same `ActivityFeed` the project canvas does, which is what keeps an agent
 * action looking like an agent action wherever you meet one (§57).
 */
@Component({
  selector: 'app-recent-agent-activity-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActivityFeed],
  templateUrl: './recent-agent-activity-widget.html',
  styleUrl: '../widget-content.scss',
})
export class RecentAgentActivityWidget {
  readonly widget = input.required<DashboardWidget>();
  readonly dashboard = input.required<DashboardResult>();

  readonly entries = computed(() => this.dashboard().recentAgentActivity);
}
