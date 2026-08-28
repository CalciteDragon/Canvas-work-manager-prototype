import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DashboardResult, DashboardWidget } from '@cwm/contracts';

/** §24's "low-priority optional daily content" — a fixture rotated by the clock's day. */
@Component({
  selector: 'app-fun-fact-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fun-fact-widget.html',
  styleUrl: '../widget-content.scss',
})
export class FunFactWidget {
  readonly widget = input.required<DashboardWidget>();
  readonly dashboard = input.required<DashboardResult>();
}
