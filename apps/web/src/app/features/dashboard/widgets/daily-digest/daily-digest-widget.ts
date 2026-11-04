import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DashboardResult, DashboardWidget } from '@cwm/contracts';
import type { Failure } from '../../../../shared/feedback/failure';
import { taskMeta } from '../../../tasks/task-meta';
import { taskOriginFragment, taskOriginRoute } from '../task-origin-link';

/** How many overdue tasks the digest lists before it only counts the rest (Q1 (a)). */
const OVERDUE_SHOWN = 5;

/**
 * The digest's `failureOf` (Slice 78): a `null` digest means the provider failed. No reason
 * crosses the wire — it stays on the host's console — so there is nothing for Details.
 */
export const dailyDigestFailure = (dashboard: DashboardResult): Failure | null =>
  dashboard.dailyDigest === null ? { sentence: 'Couldn’t write today’s digest.', reason: null } : null;

/**
 * §24's "mock AI-generated overview". It says which provider composed it (§43, §44) rather
 * than implying a model wrote it — the prototype is allowed to *feel* AI-generated and not
 * allowed to lie about being it.
 *
 * Under the prose it lists the overdue tasks from the same dashboard result (Slice 79,
 * W4-028): a digest-only persona can follow "N tasks are overdue" to the tasks themselves,
 * without the digest knowing about Today.
 */
@Component({
  selector: 'app-daily-digest-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-digest-widget.html',
  imports: [RouterLink],
  styleUrls: ['../widget-content.scss', './daily-digest-widget.scss'],
})
export class DailyDigestWidget {
  readonly widget = input.required<DashboardWidget>();
  readonly dashboard = input.required<DashboardResult>();
  readonly taskMeta = taskMeta;
  readonly originRoute = taskOriginRoute;
  readonly originFragment = taskOriginFragment;

  readonly overdue = computed(() => this.dashboard().today.overdue.slice(0, OVERDUE_SHOWN));
  readonly moreOverdue = computed(() => Math.max(0, this.dashboard().today.overdue.length - OVERDUE_SHOWN));
}
