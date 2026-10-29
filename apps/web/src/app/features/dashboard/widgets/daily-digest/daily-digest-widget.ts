import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DashboardResult, DashboardWidget } from '@cwm/contracts';
import type { Failure } from '../../../../shared/feedback/failure';

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
 */
@Component({
  selector: 'app-daily-digest-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-digest-widget.html',
  styleUrl: '../widget-content.scss',
})
export class DailyDigestWidget {
  readonly widget = input.required<DashboardWidget>();
  readonly dashboard = input.required<DashboardResult>();
}
