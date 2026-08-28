import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DashboardResult, DashboardWidget } from '@cwm/contracts';

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
